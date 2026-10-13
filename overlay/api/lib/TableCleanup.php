<?php
/**
 * 쌓이는 표 정리 — 정리 크론(plugin/webapp/cron/cleanup_push_tokens.php)과, 크론을 걸 수 없는 호스팅을 위한
 * 유지보수 신호(POST /v1/maintenance/tick, 하루 한 번)가 같이 쓴다. 크론이 있는 사이트는 같은 일을 한 번 더 할 뿐이다.
 *
 * 단계(run() 의 $only · 결과 배열의 키):
 *   push_token            90일 동안 안 쓴 푸시 토큰 삭제
 *   push_queue_sent/failed 처리 끝난 푸시 큐 행 삭제(보낸 것 30일 · 실패 90일)
 *   notification_read/unread 알림함 삭제(읽은 것 180일 · 안 읽은 것 365일)
 *   refresh_token         만료 후 30일 지난 로그인 유지 토큰 삭제(살아 있는 세션은 expires_at 가 미래인 행만 본다)
 *   social_signup_ticket  만료 후 하루 지난 소셜 가입 입장권 삭제 — 소셜 프로필(JSON)을 품고 있다
 *   device_ip             90일 동안 안 보인 기기의 IP · 브라우저 정보만 비움. 행은 남긴다 — 이미 등록된 기기 번호를
 *                         남이 다시 서명받지 못하게 막는 근거다(api/v1/devices.php). IP · 브라우저 정보는 등록 직후
 *                         10분 재서명 확인과 1시간 요청 한도에만 쓴다.
 *
 * 한 번에 BATCH 행씩 나눠 지운다 — 크론이 없던 사이트의 첫 정리가 큰 표를 한 문장으로 오래 잠그지 않게. 나눠 지운 몫은
 * 그때그때 반영되므로, 웹 요청(runWithin)이 시간 안에 다 못 끝내도 다음에 이어서 한다.
 *
 * 보존 일수는 상수로 바꾼다 — extend/ 의 아무 파일에서 먼저 define, 0 이면 그 단계는 건너뛴다.
 */
declare(strict_types=1);

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('TableCleanup')) {

require_once __DIR__ . '/DB.php';
require_once __DIR__ . '/PushQueue.php';
require_once __DIR__ . '/RefreshToken.php';

final class TableCleanup
{
    /** run() 이 도는 차례. push_queue · notification_log 는 결과에서 두 칸(sent/failed · read/unread)으로 나뉜다. */
    public const STEPS = ['push_token', 'push_queue', 'notification_log', 'refresh_token', 'social_signup_ticket', 'device_ip'];

    /** 한 문장으로 지우는(비우는) 최대 행 수. */
    private const BATCH = 2000;

    private const DEFAULT_DAYS = [
        'WEBAPP_PUSH_TOKEN_KEEP_DAYS'          => 90,
        'WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS'     => 30,
        'WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS'   => 90,
        'WEBAPP_NOTIFICATION_KEEP_READ_DAYS'   => 180,
        'WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS' => 365,
        'WEBAPP_REFRESH_TOKEN_KEEP_DAYS'       => 30,
        'WEBAPP_SIGNUP_TICKET_KEEP_DAYS'       => 1,
        'WEBAPP_DEVICE_IP_KEEP_DAYS'           => 90,
    ];

    /**
     * 시간 제한 없이 끝까지 — 정리 크론.
     *
     * @param bool          $dryRun 지울(비울) 개수만 센다
     * @param string[]|null $only   이 단계만(시험용). null 이면 STEPS 전부
     * @return array<string,int> 단계별 행 수. 그 단계가 실패하면 -1(나머지 단계는 계속 돈다)
     */
    public static function run(bool $dryRun = false, ?array $only = null): array
    {
        $complete = true;
        return self::runSteps($dryRun, $only, null, $complete);
    }

    /**
     * $seconds 안에서만 — 유지보수 신호(웹 요청). 다 끝났으면 true, 시간이 다 돼 남았으면 false.
     *
     * @param string[]|null $only
     */
    public static function runWithin(float $seconds, ?array $only = null): bool
    {
        $complete = true;
        self::runSteps(false, $only, microtime(true) + $seconds, $complete);
        return $complete;
    }

    /**
     * @param string[]|null $only
     * @return array<string,int>
     */
    private static function runSteps(bool $dryRun, ?array $only, ?float $deadline, bool &$complete): array
    {
        self::defineDefaults();
        $out = [];
        foreach (self::STEPS as $step) {
            if ($only !== null && !in_array($step, $only, true)) {
                continue;
            }
            try {
                $out += $dryRun ? self::countStep($step) : self::drain(self::batchFor($step), $deadline, $complete);
            } catch (\Throwable $e) {
                error_log('[table-cleanup] ' . $step . ': ' . $e->getMessage());
                $out[$step] = -1;
            }
        }
        return $out;
    }

    /**
     * $batch 를 BATCH 행씩 되풀이해 부른다 — 한 번에 BATCH 보다 적게 지우면 그 단계는 끝.
     *
     * @param callable(int):array<string,int> $batch
     * @return array<string,int>
     */
    private static function drain(callable $batch, ?float $deadline, bool &$complete): array
    {
        $total = [];
        while (true) {
            if ($deadline !== null && microtime(true) >= $deadline) {
                $complete = false;
                return $total;
            }
            $counts = $batch(self::BATCH);
            foreach ($counts as $key => $rows) {
                $total[$key] = ($total[$key] ?? 0) + $rows;
            }
            if ($counts === [] || max($counts) < self::BATCH) {
                return $total;
            }
        }
    }

    /** 단계 하나의 한 번 몫(최대 $limit 행). */
    private static function batchFor(string $step): callable
    {
        switch ($step) {
            case 'push_token':
                return static fn (int $limit): array => ['push_token' => self::deleteOlder(
                    'push_token_table', 'last_used_at', self::days('WEBAPP_PUSH_TOKEN_KEEP_DAYS'), $limit)];
            case 'push_queue':
                return static function (int $limit): array {
                    $gc = PushQueue::gc(self::days('WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS'), self::days('WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS'), $limit);
                    return ['push_queue_sent' => $gc['sent'], 'push_queue_failed' => $gc['failed']];
                };
            case 'notification_log':
                return static function (int $limit): array {
                    require_once dirname(__DIR__, 2) . '/plugin/webapp/notify/Notify.php';
                    $gc = Notify::gc(self::days('WEBAPP_NOTIFICATION_KEEP_READ_DAYS'), self::days('WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS'), $limit);
                    return ['notification_read' => (int) $gc['read'], 'notification_unread' => (int) $gc['unread']];
                };
            case 'refresh_token':
                return static fn (int $limit): array => ['refresh_token' => RefreshToken::gc(self::days('WEBAPP_REFRESH_TOKEN_KEEP_DAYS'), $limit)];
            case 'social_signup_ticket':
                return static fn (int $limit): array => ['social_signup_ticket' => self::deleteOlder(
                    'social_signup_ticket_table', 'expires_at', self::days('WEBAPP_SIGNUP_TICKET_KEEP_DAYS'), $limit)];
            case 'device_ip':
                return static fn (int $limit): array => ['device_ip' => self::clearDeviceIps($limit)];
        }
        return static fn (int $limit): array => [];
    }

    /**
     * dry-run — 단계마다 지울(비울) 개수.
     *
     * @return array<string,int>
     */
    private static function countStep(string $step): array
    {
        $count = static function (string $tableKey, string $where, int $days): int {
            if ($days <= 0) return 0;
            $table = DB::table($tableKey);
            return DB::count("SELECT COUNT(*) FROM `{$table}` WHERE {$where}", [self::cutoff($days)]);
        };
        switch ($step) {
            case 'push_token':
                return ['push_token' => $count('push_token_table', 'last_used_at < ?', self::days('WEBAPP_PUSH_TOKEN_KEEP_DAYS'))];
            case 'push_queue':
                return [
                    'push_queue_sent' => $count('push_queue_table', "status = 'sent' AND processed_at IS NOT NULL AND processed_at < ?", self::days('WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS')),
                    'push_queue_failed' => $count('push_queue_table', "status = 'failed' AND processed_at IS NOT NULL AND processed_at < ?", self::days('WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS')),
                ];
            case 'notification_log':
                return [
                    'notification_read' => $count('notification_log_table', 'nt_read_at IS NOT NULL AND nt_read_at < ?', self::days('WEBAPP_NOTIFICATION_KEEP_READ_DAYS')),
                    'notification_unread' => $count('notification_log_table', 'nt_read_at IS NULL AND nt_sent_at < ?', self::days('WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS')),
                ];
            case 'refresh_token':
                return ['refresh_token' => $count('refresh_token_table', 'expires_at < ?', self::days('WEBAPP_REFRESH_TOKEN_KEEP_DAYS'))];
            case 'social_signup_ticket':
                return ['social_signup_ticket' => $count('social_signup_ticket_table', 'expires_at < ?', self::days('WEBAPP_SIGNUP_TICKET_KEEP_DAYS'))];
            case 'device_ip':
                return ['device_ip' => $count('device_table', 'last_seen_at < ? AND ' . self::DEVICE_HAS_IP, self::days('WEBAPP_DEVICE_IP_KEEP_DAYS'))];
        }
        return [];
    }

    /** 아직 비우지 않은 기기 — 한 번 비운 행은 다시 세지 않는다. */
    private const DEVICE_HAS_IP = '(first_ip IS NOT NULL OR last_ip IS NOT NULL OR user_agent IS NOT NULL)';

    private static function defineDefaults(): void
    {
        foreach (self::DEFAULT_DAYS as $name => $days) {
            if (!defined($name)) define($name, $days);
        }
    }

    private static function days(string $name): int
    {
        return (int) constant($name);
    }

    private static function cutoff(int $days): string
    {
        return date('Y-m-d H:i:s', time() - $days * 86400);
    }

    private static function deleteOlder(string $tableKey, string $column, int $days, int $limit): int
    {
        if ($days <= 0) return 0;
        $table = DB::table($tableKey);
        return (int) DB::execute("DELETE FROM `{$table}` WHERE `{$column}` < ? LIMIT {$limit}", [self::cutoff($days)]);
    }

    private static function clearDeviceIps(int $limit): int
    {
        $days = self::days('WEBAPP_DEVICE_IP_KEEP_DAYS');
        if ($days <= 0) return 0;
        $table = DB::table('device_table');
        return (int) DB::execute(
            "UPDATE `{$table}` SET first_ip = NULL, last_ip = NULL, user_agent = NULL
              WHERE last_seen_at < ? AND " . self::DEVICE_HAS_IP . " LIMIT {$limit}",
            [self::cutoff($days)]
        );
    }
}

}
