<?php
/**
 * 회원 알림 수신 설정 — 한 곳에서 읽고 쓴다.
 *
 * 표는 g5_member_pref (mb_id 당 1행): locale, tz 와 항목별 수신 여부(notify_*).
 * 행이 없는 회원은 전부 "받음" 으로 본다. 앱과 웹이 같은 API(/v1/auth/preferences)를
 * 쓰고, 발송 쪽(Notify::emit, 제품 크론)은 pushAllowed() 하나만 묻는다.
 *
 * 항목: core 는 모든 사이트에 있는 다섯 개(댓글 · 답글 · 쪽지 · 1:1 문의 · 공지)만 안다.
 * 제품 플러그인은 그누보드 replace 훅으로 자기 항목을 더한다 — 폴더를 지우면 항목도 사라진다.
 *
 *   add_replace('webapp_notify_pref_items', function ($items) {
 *       $items['notify_dday'] = array('label' => '디데이 알림', 'hint' => '…', 'events' => array('dday.reminder'));
 *       return $items;
 *   }, 10, 1);
 *
 * 그 항목의 표 칸(notify_*)은 플러그인이 자기 admin_dbupgrade 에서 만든다. 칸이 아직 없으면
 * 값은 "받음" 으로 읽히고 저장은 건너뛴다.
 *
 * 정책: 꺼 둔 이벤트는 **푸시(Expo)만** 안 보낸다. 알림함(notification_log)에는 그대로
 * 남아서 나중에 앱·웹 알림 목록에서 볼 수 있다 — 되돌릴 수 없는 손실이 없다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!class_exists('NotifyPrefs')) {
class NotifyPrefs
{
    /** core 항목 — 모든 사이트에 있다. 키 = 표 칸 이름(전부 기본 true), events = 이 스위치가 막는 이벤트. */
    const CORE_ITEMS = array(
        'notify_comment' => array('label' => '내 글의 댓글', 'hint' => '누군가 내 글에 댓글을 달았을 때', 'events' => array('comment.created')),
        'notify_reply'   => array('label' => '내 글의 답글', 'hint' => '내 글에 답글이 달렸을 때', 'events' => array('reply.created')),
        'notify_message' => array('label' => '쪽지', 'hint' => '쪽지를 받았을 때', 'events' => array('memo.received')),
        'notify_inquiry' => array('label' => '1:1 문의 답변', 'hint' => '문의에 답변이 등록되었을 때', 'events' => array('qa.answered')),
        'notify_system'  => array('label' => '공지', 'hint' => '운영자 공지와 점검 안내', 'events' => array('system')),
    );

    /** 플러그인이 항목을 더하는 replace 훅 이름. */
    const ITEMS_HOOK = 'webapp_notify_pref_items';

    const LOCALES = array('ko', 'en');

    /** @var array<string,array> 요청 안 캐시 — 크론이 회원마다 다시 묻지 않게 */
    private static $cache = array();

    /** @var array<string,array>|null 이 요청의 항목(core + 플러그인) */
    private static $items = null;

    /** @var array<string,bool>|null member_pref 표의 칸 — 저장할 때만 본다 */
    private static $columns = null;

    /**
     * 이 사이트의 알림 수신 항목: core 다섯 개 + 플러그인이 훅으로 더한 것.
     * 키가 notify_[a-z0-9_] 꼴이 아니거나 모양이 틀린 항목은 버린다(표 칸 이름으로 쓰이므로).
     *
     * @return array<string,array{label:string,hint:string,events:string[]}>
     */
    public static function items()
    {
        if (self::$items !== null) {
            return self::$items;
        }
        $items = self::CORE_ITEMS;
        if (function_exists('run_replace')) {
            $hooked = run_replace(self::ITEMS_HOOK, $items);
            if (is_array($hooked)) {
                $items = $hooked;
            }
        }
        $clean = array();
        foreach ($items as $key => $item) {
            if (!is_string($key) || !preg_match('/^notify_[a-z0-9_]{1,40}$/', $key) || !is_array($item)) {
                continue;
            }
            $events = array();
            foreach ((array) ($item['events'] ?? array()) as $event) {
                if (is_string($event) && $event !== '') {
                    $events[] = $event;
                }
            }
            $clean[$key] = array(
                'label'  => (string) ($item['label'] ?? $key),
                'hint'   => (string) ($item['hint'] ?? ''),
                'events' => array_values(array_unique($events)),
            );
        }
        return self::$items = $clean;
    }

    /** @return string[] 항목 키(= 표 칸) */
    public static function flags()
    {
        return array_keys(self::items());
    }

    /** 화면용 목록 — 키 · 이름 · 설명. 이벤트 이름은 싣지 않는다. */
    public static function options()
    {
        $out = array();
        foreach (self::items() as $key => $item) {
            $out[] = array('key' => $key, 'label' => $item['label'], 'hint' => $item['hint']);
        }
        return $out;
    }

    /** 이 이벤트를 막는 스위치. 어느 항목도 맡지 않은 이벤트는 null(항상 보낸다). */
    private static function eventFlag($event)
    {
        foreach (self::items() as $key => $item) {
            if (in_array((string) $event, $item['events'], true)) {
                return $key;
            }
        }
        return null;
    }

    /** member_pref 표에 이 칸이 있나 — 플러그인 칸은 설치기가 돌기 전에는 없을 수 있다. */
    private static function hasColumn($column)
    {
        if (self::$columns === null) {
            self::$columns = array();
            try {
                foreach (DB::fetchAll('SHOW COLUMNS FROM `' . DB::table('member_pref_table') . '`') as $row) {
                    self::$columns[(string) $row['Field']] = true;
                }
            } catch (\Throwable $e) {
                // 표가 없는 설치본 — 저장할 칸이 없다
            }
        }
        return isset(self::$columns[$column]);
    }

    private static function boot()
    {
        if (!class_exists('DB')) {
            require_once dirname(__DIR__, 3) . '/api/lib/DB.php';
        }
    }

    /** @return array 기본값 전체 */
    public static function defaults()
    {
        $out = array('locale' => 'ko', 'tz' => 'Asia/Seoul');
        foreach (self::flags() as $flag) {
            $out[$flag] = true;
        }
        return $out;
    }

    /** 회원의 설정 전체. 행이 없거나 표가 없으면 기본값. */
    public static function get($mb_id)
    {
        $mb_id = (string) $mb_id;
        if (isset(self::$cache[$mb_id])) {
            return self::$cache[$mb_id];
        }
        self::boot();
        $out = self::defaults();
        try {
            $row = DB::fetch('SELECT * FROM ' . DB::table('member_pref_table') . ' WHERE mb_id = ?', array($mb_id));
        } catch (\Throwable $e) {
            $row = null; // 표가 아직 없는 설치본 — 기본값
        }
        if ($row) {
            if (isset($row['locale']) && in_array($row['locale'], self::LOCALES, true)) {
                $out['locale'] = $row['locale'];
            }
            if (!empty($row['tz']) && self::validTz((string) $row['tz'])) {
                $out['tz'] = (string) $row['tz'];
            }
            foreach (self::flags() as $flag) {
                if (array_key_exists($flag, $row) && $row[$flag] !== null) {
                    $out[$flag] = (bool) (int) $row[$flag];
                }
            }
        }
        return self::$cache[$mb_id] = $out;
    }

    /**
     * 부분 갱신 — 보낸 키만 바꾼다. 앱이 {locale, tz} 만 보내도 알림 플래그는 그대로.
     *
     * @param  array $input  요청 본문
     * @return array{prefs:array, errors:array<string,string>} 갱신 뒤 전체 설정과 거부된 키
     */
    public static function update($mb_id, array $input)
    {
        $mb_id = (string) $mb_id;
        $set = array();
        $errors = array();

        if (array_key_exists('locale', $input)) {
            $locale = (string) $input['locale'];
            if (in_array($locale, self::LOCALES, true)) {
                $set['locale'] = $locale;
            } else {
                $errors['locale'] = 'ko 또는 en 만 됩니다.';
            }
        }
        if (array_key_exists('tz', $input)) {
            $tz = (string) $input['tz'];
            if (self::validTz($tz)) {
                $set['tz'] = $tz;
            } else {
                $errors['tz'] = '시간대 이름(Asia/Seoul, UTC, GMT …)이어야 합니다.';
            }
        }
        self::boot();
        foreach (self::flags() as $flag) {
            if (!array_key_exists($flag, $input)) {
                continue;
            }
            $bool = self::toBool($input[$flag]);
            if ($bool === null) {
                $errors[$flag] = 'true 또는 false 여야 합니다.';
            } elseif (self::hasColumn($flag)) {
                // 칸이 아직 없는 플러그인 항목(설치기 전)은 건너뛴다 — 읽을 때는 "받음" 이다.
                $set[$flag] = $bool ? 1 : 0;
            }
        }

        if ($set) {
            $table = DB::table('member_pref_table');
            $cols = array_keys($set);
            $sql = 'INSERT INTO `' . $table . '` (mb_id, ' . implode(', ', $cols) . ') VALUES (?' . str_repeat(', ?', count($cols)) . ')'
                 . ' ON DUPLICATE KEY UPDATE ' . implode(', ', array_map(static function ($c) { return $c . ' = VALUES(' . $c . ')'; }, $cols));
            DB::execute($sql, array_merge(array($mb_id), array_values($set)));
            unset(self::$cache[$mb_id]);
        }

        return array('prefs' => self::get($mb_id), 'errors' => $errors);
    }

    /** 이 이벤트의 푸시를 이 회원에게 보내도 되나. 모르는 이벤트는 보낸다. */
    public static function pushAllowed($mb_id, $event)
    {
        $flag = self::eventFlag($event);
        if ($flag === null) {
            return true;
        }
        $prefs = self::get($mb_id);
        return !empty($prefs[$flag]);
    }

    /** PHP 가 아는 시간대면 된다 — Asia/Seoul 같은 IANA 이름은 물론 UTC, GMT, EST 같은 약어도(에뮬레이터가 보낸다). */
    private static function validTz($tz)
    {
        if (!is_string($tz) || $tz === '' || strlen($tz) > 64 || !preg_match('#^[A-Za-z0-9_+\-/]+$#', $tz)) {
            return false;
        }
        try {
            new \DateTimeZone($tz);
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** true/false, 1/0, "1"/"0", "true"/"false" 만 받는다. 그 밖은 null. */
    private static function toBool($v)
    {
        if (is_bool($v)) return $v;
        if ($v === 1 || $v === '1' || $v === 'true') return true;
        if ($v === 0 || $v === '0' || $v === 'false') return false;
        return null;
    }
}
}
