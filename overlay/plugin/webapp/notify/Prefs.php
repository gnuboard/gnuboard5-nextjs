<?php
/**
 * 회원 알림 수신 설정 — 한 곳에서 읽고 쓴다.
 *
 * 표는 g5_member_pref (mb_id 당 1행): locale, tz 와 이벤트별 수신 여부 여섯 개.
 * 행이 없는 회원은 전부 "받음" 으로 본다. 앱과 웹이 같은 API(/v1/auth/preferences)를
 * 쓰고, 발송 쪽(Notify::emit, 디데이·접종 크론)은 pushAllowed() 하나만 묻는다.
 *
 * 정책: 꺼 둔 이벤트는 **푸시(Expo)만** 안 보낸다. 알림함(notification_log)에는 그대로
 * 남아서 나중에 앱·웹 알림 목록에서 볼 수 있다 — 되돌릴 수 없는 손실이 없다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!class_exists('NotifyPrefs')) {
class NotifyPrefs
{
    /** 알림 수신 플래그 컬럼. 전부 기본 true. */
    const FLAGS = array(
        'notify_comment', // 내 글의 댓글
        'notify_reply',   // 내 글의 답글
        'notify_message', // 쪽지
        'notify_inquiry', // 1:1 문의 답변
        'notify_dday',    // 서버 디데이·접종 푸시 (앱의 로컬 알림과는 별개)
        'notify_system',  // 운영자 공지
    );

    /** 이벤트 이름 → 플래그. 여기 없는 이벤트는 항상 보낸다. */
    const EVENT_FLAG = array(
        'comment.created' => 'notify_comment',
        'reply.created'   => 'notify_reply',
        'memo.received'   => 'notify_message',
        'qa.answered'     => 'notify_inquiry',
        'dday.reminder'   => 'notify_dday',
        'vaccine.due'     => 'notify_dday',
        'system'          => 'notify_system',
    );

    const LOCALES = array('ko', 'en');

    /** @var array<string,array> 요청 안 캐시 — 크론이 회원마다 다시 묻지 않게 */
    private static $cache = array();

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
        foreach (self::FLAGS as $flag) {
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
            foreach (self::FLAGS as $flag) {
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
        foreach (self::FLAGS as $flag) {
            if (!array_key_exists($flag, $input)) {
                continue;
            }
            $bool = self::toBool($input[$flag]);
            if ($bool === null) {
                $errors[$flag] = 'true 또는 false 여야 합니다.';
            } else {
                $set[$flag] = $bool ? 1 : 0;
            }
        }

        if ($set) {
            self::boot();
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
        $flag = isset(self::EVENT_FLAG[$event]) ? self::EVENT_FLAG[$event] : null;
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
