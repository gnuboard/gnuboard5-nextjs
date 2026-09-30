<?php
/**
 * 알림의 단 하나의 문.
 *
 *   Notify::emit('comment.created', $mb_id, '제목', '본문', ['wr_id' => 123, 'link' => '/free/123']);
 *
 * 한 번 부르면 세 가지가 일어난다.
 *   1) g5_notification_log 에 한 줄 — 웹(Next.js 알림함)과 앱의 알림함이 같이 읽는다.
 *   2) 그 회원의 모든 기기 토큰마다 g5_push_queue 에 한 건 — 안드로이드·iOS 는 Expo 가 한 번에 보낸다.
 *   3) 곧바로 큐를 몇 초만 돌려 지금 보낸다. 못 보낸 것은 크론(cron/process_push_queue.php)이
 *      재시도한다. 크론이 없는 작은 사이트에서도 알림이 가고, 크론이 있으면 재시도가 산다.
 *
 * 어디서 부르나:
 *   - API 핸들러(댓글, 문의 답변, 쪽지 …) — Next.js 화면과 앱이 하는 일
 *   - notify/events.php 의 그누보드 훅 — basic 테마 같은 원래 PHP 화면이 하는 일
 * 두 길이 같은 함수로 모이므로 어느 화면에서 써도 같은 알림이 간다.
 *
 * 실패해도 throw 하지 않는다 — 댓글 저장 같은 본래 흐름을 알림이 깨면 안 된다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!class_exists('Notify')) {
class Notify
{
    /** 즉시 발송에 쓰는 시간 예산(초). 웹 요청 안에서 도니 짧게. */
    const INLINE_BUDGET_SECONDS = 4.0;
    /** 즉시 발송 최대 건수. 그 이상은 크론 몫. */
    const INLINE_LIMIT = 100;

    /** @var array<string,string> 이벤트 → 알림함 종류(nt_type). 표의 값은 dday|system|custom 셋뿐이다. */
    private static $eventTypes = array(
        'comment.created' => 'custom',
        'reply.created'   => 'custom',
        'memo.received'   => 'custom',
        'qa.answered'     => 'custom',
        'dday.reminder'   => 'dday',
        'vaccine.due'     => 'dday',
        'system'          => 'system',
    );

    private static function boot()
    {
        $lib = dirname(__DIR__, 3) . '/api/lib';
        if (!class_exists('DB')) {
            require_once $lib . '/DB.php';
        }
        if (!class_exists('PushQueue')) {
            require_once $lib . '/PushQueue.php';
        }
        if (!class_exists('NotifyPrefs')) {
            require_once __DIR__ . '/Prefs.php';
        }
    }

    /**
     * @param string $event   'comment.created' 같은 이름. 알림 데이터의 type 으로도 실린다.
     * @param string $mb_id   받는 회원
     * @param string $title
     * @param string $body
     * @param array  $data    앱이 눌렀을 때 쓸 값(wr_id, bo_table, link …)
     * @param bool   $deliverNow  false 면 큐에만 넣는다(대량 발송용)
     * @return int 알림함(notification_log) 행 번호. 0 이면 못 남김.
     */
    public static function emit($event, $mb_id, $title, $body, array $data = array(), $deliverNow = true)
    {
        $mb_id = trim((string) $mb_id);
        if ($mb_id === '' || (string) $title === '') {
            return 0;
        }
        self::boot();

        $type = isset(self::$eventTypes[$event]) ? self::$eventTypes[$event] : 'custom';
        $data = array_merge(array('type' => (string) $event), $data);

        // 1) 알림함
        $logId = 0;
        try {
            DB::execute(
                'INSERT INTO ' . DB::table('notification_log_table')
                . ' (mb_id, nt_type, nt_event, nt_title, nt_body, nt_data, nt_sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                array(
                    $mb_id,
                    $type,
                    mb_substr((string) $event, 0, 40),
                    mb_substr((string) $title, 0, 255),
                    mb_substr((string) $body, 0, 255),
                    json_encode($data, JSON_UNESCAPED_UNICODE),
                )
            );
            $logId = (int) DB::lastInsertId();
        } catch (\Throwable $e) {
            error_log('[Notify::emit] log failed: ' . $e->getMessage());
        }

        // 2) 기기마다 큐 한 건. 알림함 행이 있으면 큐는 그 번호만 들고, 제목·본문은 발송 때 거기서 읽는다.
        //    회원이 이 이벤트의 푸시를 꺼 두었으면 여기서 멈춘다 — 알림함 행은 이미 남았다.
        $queued = 0;
        if (!NotifyPrefs::pushAllowed($mb_id, $event)) {
            return $logId;
        }
        try {
            $rows = DB::fetchAll(
                'SELECT push_token FROM ' . DB::table('push_token_table') . ' WHERE mb_id = ?',
                array($mb_id)
            );
            foreach ($rows as $row) {
                $token = trim((string) $row['push_token']);
                if ($token === '') {
                    continue;
                }
                $job = array('expo_token' => $token, 'mb_id' => $mb_id, 'nt_type' => $type);
                if ($logId > 0) {
                    $job['nt_id'] = $logId;
                } else {
                    $job['title'] = (string) $title;
                    $job['body']  = (string) $body;
                    $job['data']  = $data;
                }
                PushQueue::enqueue($job);
                $queued++;
            }
        } catch (\Throwable $e) {
            error_log('[Notify::emit] enqueue failed: ' . $e->getMessage());
        }

        // 3) 지금 보내 본다
        if ($deliverNow && $queued > 0) {
            try {
                PushQueue::process(min(self::INLINE_LIMIT, $queued), self::INLINE_BUDGET_SECONDS);
            } catch (\Throwable $e) {
                error_log('[Notify::emit] inline delivery failed: ' . $e->getMessage());
            }
        }

        return $logId;
    }

    /** 여러 회원에게 같은 알림. 자기 자신은 건너뛴다. */
    public static function emitMany($event, array $mb_ids, $title, $body, array $data = array(), $except = '')
    {
        $sent = 0;
        foreach (array_unique(array_filter(array_map('strval', $mb_ids))) as $mb_id) {
            if ($except !== '' && $mb_id === $except) {
                continue;
            }
            if (self::emit($event, $mb_id, $title, $body, $data, false) > 0) {
                $sent++;
            }
        }
        if ($sent > 0) {
            try {
                self::boot();
                PushQueue::process(self::INLINE_LIMIT, self::INLINE_BUDGET_SECONDS);
            } catch (\Throwable $e) {
                error_log('[Notify::emitMany] inline delivery failed: ' . $e->getMessage());
            }
        }
        return $sent;
    }

    /**
     * 알림함 정리. 읽은 알림은 $readKeepDays, 안 읽은 알림도 $unreadKeepDays 지나면 지운다.
     * plugin/webapp/cron/cleanup_push_tokens.php 가 매일 부른다.
     *
     * @return array{read:int, unread:int} 지운 건수
     */
    public static function gc($readKeepDays = 180, $unreadKeepDays = 365)
    {
        self::boot();
        $table = DB::table('notification_log_table');
        $out = array('read' => 0, 'unread' => 0);
        if ((int) $readKeepDays > 0) {
            $out['read'] = (int) DB::execute(
                "DELETE FROM `{$table}` WHERE nt_read_at IS NOT NULL AND nt_read_at < ?",
                array(date('Y-m-d H:i:s', time() - (int) $readKeepDays * 86400))
            );
        }
        if ((int) $unreadKeepDays > 0) {
            $out['unread'] = (int) DB::execute(
                "DELETE FROM `{$table}` WHERE nt_read_at IS NULL AND nt_sent_at < ?",
                array(date('Y-m-d H:i:s', time() - (int) $unreadKeepDays * 86400))
            );
        }
        return $out;
    }
}
}
