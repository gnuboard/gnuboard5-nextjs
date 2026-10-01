<?php
/**
 * 푸시 발송 큐 — DB 백엔드 큐 (g5_push_queue).
 *
 * 디자인 목표:
 *  - 발송 작업을 enqueue 와 deliver 두 단계로 분리. cron 1 회당 단일 PHP 프로세스가
 *    수만 건을 직접 보내다 타임아웃 / 부분 발송되는 문제 회피.
 *  - SELECT … FOR UPDATE SKIP LOCKED 로 worker 간 동시 실행에서도 작업 중복 없음.
 *  - 5회 재시도 + 지수 백오프, 최종 실패 시 status='failed' + Sentry 보고.
 *  - 외부 큐 인프라(Redis) 없이도 동작 — 운영 도입 시 PushQueue 인터페이스만
 *    Redis 백엔드로 갈아끼우면 됨.
 */
declare(strict_types=1);

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('PushQueue')) {

class PushQueue
{
    /** 최대 시도 횟수 — 초과 시 status='failed'. */
    public const MAX_ATTEMPTS = 5;

    /** 클레임 후 처리되지 않은 채 방치된 작업의 회수 임계치 (초). */
    public const STALE_CLAIM_SECONDS = 600;

    /**
     * 큐에 작업 하나 추가.
     *
     * @param array<string,mixed> $job  expo_token (필수), mb_id, nt_type, 그리고
     *   - nt_id: 알림함(notification_log) 행 번호. 있으면 제목·본문·data 는 발송 때 그 행에서 읽는다.
     *   - title/body/data: nt_id 가 없는(알림함에 남기지 않는) 푸시에서만 채운다.
     * @return int  새 큐 row id
     */
    public static function enqueue(array $job): int
    {
        $table = DB::table('push_queue_table');
        $now   = date('Y-m-d H:i:s');
        $ntId  = isset($job['nt_id']) && (int) $job['nt_id'] > 0 ? (int) $job['nt_id'] : null;
        $data  = $ntId === null && isset($job['data']) ? json_encode($job['data'], JSON_UNESCAPED_UNICODE) : null;

        DB::execute(
            "INSERT INTO `{$table}`
                (expo_token, mb_id, nt_id, nt_type, nt_title, nt_body, nt_data,
                 status, attempts, next_attempt_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)",
            [
                (string) ($job['expo_token'] ?? ''),
                isset($job['mb_id']) ? (string) $job['mb_id'] : null,
                $ntId,
                (string) ($job['nt_type'] ?? 'custom'),
                $ntId === null ? (string) ($job['title'] ?? '') : '',
                $ntId === null ? mb_substr((string) ($job['body'] ?? ''), 0, 255) : '',
                $data,
                $now,
                $now,
            ]
        );
        return (int) DB::lastInsertId();
    }

    /**
     * 여러 건을 한 트랜잭션으로 enqueue (대량 입력 시 round-trip 절감).
     *
     * @param array<int,array<string,mixed>> $jobs
     * @return int 추가된 건수
     */
    public static function enqueueMany(array $jobs): int
    {
        if (!$jobs) return 0;
        DB::beginTransaction();
        try {
            foreach ($jobs as $j) {
                self::enqueue($j);
            }
            DB::commit();
            return count($jobs);
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /**
     * 처리 가능한 pending 작업을 최대 $limit 건 claim.
     *  - SELECT FOR UPDATE SKIP LOCKED 로 동시 worker 간 race condition 차단
     *  - status='processing', claim_token = 고유값으로 업데이트해 다른 worker 가 못 줍게
     *
     * @return array<int,array<string,mixed>>  claim 한 job rows
     */
    public static function claimBatch(int $limit, ?string $claimToken = null): array
    {
        $table = DB::table('push_queue_table');
        $token = $claimToken ?? self::genClaimToken();
        $now   = date('Y-m-d H:i:s');

        DB::beginTransaction();
        try {
            // 만료된 처리 중 작업(stale claim) 회수 — worker 가 죽었거나 시간 초과
            $staleCutoff = date('Y-m-d H:i:s', time() - self::STALE_CLAIM_SECONDS);
            DB::execute(
                "UPDATE `{$table}`
                    SET status = 'pending', claim_token = NULL, claimed_at = NULL
                  WHERE status = 'processing' AND claimed_at < ?",
                [$staleCutoff]
            );

            // FOR UPDATE SKIP LOCKED — MySQL 8.0+ / MariaDB 10.6+
            // 폴백: SKIP LOCKED 미지원 환경에서는 동시 worker 가 같은 row 시도 가능하나
            //       UPDATE 의 claim_token 매치로 한 번만 실제 처리됨 (낭비만 발생).
            $rows = DB::fetchAll(
                "SELECT queue_id FROM `{$table}`
                  WHERE status = 'pending' AND next_attempt_at <= ?
                  ORDER BY queue_id ASC
                  LIMIT {$limit}
                  FOR UPDATE SKIP LOCKED",
                [$now]
            );

            if (!$rows) {
                DB::commit();
                return [];
            }

            $ids = array_map(static fn ($r) => (int) $r['queue_id'], $rows);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));

            DB::execute(
                "UPDATE `{$table}`
                    SET status = 'processing', claim_token = ?, claimed_at = ?
                  WHERE queue_id IN ($placeholders)",
                array_merge([$token, $now], $ids)
            );

            $claimed = DB::fetchAll(
                "SELECT * FROM `{$table}` WHERE claim_token = ? AND status = 'processing'",
                [$token]
            );
            DB::commit();
            return $claimed;
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /** 작업을 sent 로 마크. */
    public static function markSent(int $queueId): void
    {
        $table = DB::table('push_queue_table');
        DB::execute(
            "UPDATE `{$table}`
                SET status = 'sent', processed_at = NOW(), last_error = NULL
              WHERE queue_id = ?",
            [$queueId]
        );
    }

    public static function markTransientFailure(int $queueId, string $error, int $delaySeconds = 300): void
    {
        $table = DB::table('push_queue_table');
        $shortErr = mb_substr($error, 0, 255);
        $next = date('Y-m-d H:i:s', time() + max(60, $delaySeconds));

        DB::execute(
            "UPDATE `{$table}`
                SET status = 'pending', last_error = ?,
                    claim_token = NULL, claimed_at = NULL, next_attempt_at = ?
              WHERE queue_id = ?",
            [$shortErr, $next, $queueId]
        );
    }

    /**
     * 작업 실패 처리. 시도 횟수가 한도 미만이면 백오프 후 재시도, 한도 초과면 failed.
     * 백오프: 2^attempts 분 (1, 2, 4, 8, 16 분).
     */
    /** 재시도 의미가 없는 실패 — 바로 failed 로 닫는다 (무효 토큰, 사라진 알림함 행). */
    public static function markDead(int $queueId, string $error): void
    {
        $table = DB::table('push_queue_table');
        DB::execute(
            "UPDATE `{$table}` SET status = 'failed', last_error = ?, processed_at = NOW() WHERE queue_id = ?",
            [mb_substr($error, 0, 255), $queueId]
        );
    }

    public static function markFailed(int $queueId, string $error): void
    {
        $table = DB::table('push_queue_table');
        $row = DB::fetch("SELECT attempts FROM `{$table}` WHERE queue_id = ?", [$queueId]);
        if (!$row) return;

        $attempts = ((int) $row['attempts']) + 1;
        $shortErr = mb_substr($error, 0, 255);

        if ($attempts >= self::MAX_ATTEMPTS) {
            DB::execute(
                "UPDATE `{$table}`
                    SET status = 'failed', attempts = ?, last_error = ?, processed_at = NOW()
                  WHERE queue_id = ?",
                [$attempts, $shortErr, $queueId]
            );
            return;
        }

        $delaySec = (int) pow(2, $attempts) * 60;
        $next = date('Y-m-d H:i:s', time() + $delaySec);
        DB::execute(
            "UPDATE `{$table}`
                SET status = 'pending', attempts = ?, last_error = ?,
                    claim_token = NULL, claimed_at = NULL, next_attempt_at = ?
              WHERE queue_id = ?",
            [$attempts, $shortErr, $next, $queueId]
        );
    }

    /** 큐 상태 요약 — 운영/모니터링용. */
    public static function stats(): array
    {
        $table = DB::table('push_queue_table');
        $rows = DB::fetchAll(
            "SELECT status, COUNT(*) AS n FROM `{$table}` GROUP BY status"
        );
        $out = ['pending' => 0, 'processing' => 0, 'sent' => 0, 'failed' => 0];
        foreach ($rows as $r) {
            $out[$r['status']] = (int) $r['n'];
        }
        return $out;
    }

    /**
     * 처리 끝난 큐 행 정리. sent 는 곧 쓸모가 없고 failed 는 원인 조사용으로 조금 더 둔다.
     * plugin/webapp/cron/cleanup_push_tokens.php 가 매일 부른다.
     *
     * @return array{sent:int, failed:int} 지운 건수
     */
    public static function gc(int $keepSentDays = 30, int $keepFailedDays = 90): array
    {
        $table = DB::table('push_queue_table');
        $out = ['sent' => 0, 'failed' => 0];
        foreach (['sent' => $keepSentDays, 'failed' => $keepFailedDays] as $status => $days) {
            if ($days <= 0) {
                continue;
            }
            $cutoff = date('Y-m-d H:i:s', time() - ($days * 86400));
            $out[$status] = (int) DB::execute(
                "DELETE FROM `{$table}` WHERE status = ? AND processed_at IS NOT NULL AND processed_at < ?",
                [$status, $cutoff]
            );
        }
        return $out;
    }

    /**
     * 큐 행들의 발송 내용. nt_id 가 있으면 알림함 행에서, 없으면 큐 행 자체에서 읽는다.
     * 알림함 행이 사라진(사용자가 지운) 작업은 보낼 것이 없으므로 null.
     *
     * @param array<int,array<string,mixed>> $jobs
     * @return array<int,array{title:string,body:string,data:mixed}|null> queue_id → 내용
     */
    private static function loadContents(array $jobs): array
    {
        $ntIds = [];
        foreach ($jobs as $j) {
            if (!empty($j['nt_id'])) {
                $ntIds[(int) $j['nt_id']] = true;
            }
        }
        $logRows = [];
        if ($ntIds) {
            $logTable = DB::table('notification_log_table');
            $ids = array_keys($ntIds);
            $rows = DB::fetchAll(
                "SELECT nt_id, nt_title, nt_body, nt_data FROM `{$logTable}`
                  WHERE nt_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ")",
                $ids
            );
            foreach ($rows as $r) {
                $logRows[(int) $r['nt_id']] = $r;
            }
        }

        $out = [];
        foreach ($jobs as $j) {
            $queueId = (int) $j['queue_id'];
            $src = $j;
            if (!empty($j['nt_id'])) {
                if (!isset($logRows[(int) $j['nt_id']])) {
                    $out[$queueId] = null;
                    continue;
                }
                $src = $logRows[(int) $j['nt_id']];
            }
            $data = !empty($src['nt_data']) ? json_decode((string) $src['nt_data'], true) : null;
            $out[$queueId] = [
                'title' => (string) $src['nt_title'],
                'body'  => mb_substr((string) $src['nt_body'], 0, 255),
                'data'  => is_array($data) ? $data : new \stdClass(),
            ];
        }
        return $out;
    }

    /**
     * 큐 작업 하나 → Expo 메시지. 같은 nt_type 의 알림이 트레이에서 쌓이지 않도록 channelId/threadId 를 맞춘다.
     *
     * Android 채널은 앱이 만든다(default/system/custom, 쇼핑 앱은 order 도). 소리·진동은 채널 속성이라
     * 여기 'sound' 는 iOS 용이고, 사람이 바로 봐야 하는 댓글·쪽지·공지는 priority high 로 절전(Doze)
     * 중에도 지연 없이 배달되게 한다. 주문 알림(data.type='order', SC-07)은 'order' 채널로 가고,
     * 접수(placed)만 default, 결제·배송·취소는 high 다.
     *
     * @param array<string,mixed> $job     expo_token, nt_type
     * @param array{title:string, body:string, data:mixed} $content
     * @return array<string,mixed>
     */
    public static function expoMessage(array $job, array $content): array
    {
        $type = (string) $job['nt_type'];
        $channelId = in_array($type, ['system', 'custom'], true) ? $type : 'default';
        $priority = $channelId === 'default' ? 'default' : 'high';
        $data = $content['data'];
        if (is_array($data) && ($data['type'] ?? null) === 'order') {
            $channelId = 'order';
            $priority = ($data['status'] ?? '') === 'placed' ? 'default' : 'high';
        }
        // 관리자 새 주문 알림(order_push_helpers.php) — 같은 주문 채널, 바로 확인해야 하니 high.
        if (is_array($data) && ($data['type'] ?? null) === 'admin.order.placed') {
            $channelId = 'order';
            $priority = 'high';
        }
        return [
            'to'         => (string) $job['expo_token'],
            'title'      => $content['title'],
            'body'       => $content['body'],
            'data'       => $data,
            'sound'      => 'default',
            'priority'   => $priority,
            'channelId'  => $channelId,
            'categoryId' => $type,
            'threadId'   => "dday-{$type}",
        ];
    }

    private static function genClaimToken(): string
    {
        return bin2hex(random_bytes(16));
    }

    /**
     * pending 작업을 청크 단위로 claim 해 Expo Push 로 보낸다.
     *
     * 크론 워커(plugin/webapp/cron/process_push_queue.php)와 Notify::emit 의 즉시 발송이
     * 같은 코드를 쓴다. 즉시 발송은 시간 예산을 짧게(몇 초) 주고, 못 보낸 것은 다음
     * 크론이 이어받는다 — 그래서 크론이 없는 작은 사이트에서도 알림이 가고, 크론이
     * 있는 사이트에서는 재시도·백오프가 그대로 산다.
     *
     * @param int           $limit      이번 호출에서 처리할 최대 건수
     * @param float         $timeBudget 초. 넘기면 남은 pending 은 두고 돌아온다
     * @param callable|null $log        fn(string $line): void — 워커는 STDOUT, 그 밖에는 null
     * @return array{processed:int, ok:int, err:int, batches:int}
     */
    public static function process(int $limit = 500, float $timeBudget = 50.0, ?callable $log = null, bool $verbose = false): array
    {
        $logf = static function (string $fmt, ...$args) use ($log): void {
            if ($log) {
                $log(vsprintf($fmt, $args));
            }
        };
        $tokenTable = DB::table('push_token_table');
        $endpoint   = 'https://exp.host/--/api/v2/push/send';

        $startedAt = microtime(true);
        $processed = 0;
        $sentOk    = 0;
        $failed    = 0;
        $batches   = 0;

        while (true) {
            $elapsed = microtime(true) - $startedAt;
            if ($elapsed > $timeBudget) {
                $logf("time budget exceeded (%.1fs). remaining pending will be picked next run.", $elapsed);
                break;
            }
            if ($processed >= $limit) {
                $logf("limit reached (%d).", $limit);
                break;
            }

            // 한 번에 최대 100건씩 — Expo Push API 가 chunk 당 100개를 권장.
            $jobs = self::claimBatch(min(100, $limit - $processed));
            if (!$jobs) {
                $logf("no pending jobs.");
                break;
            }
            $batches++;

            // 알림함 행이 없어진 작업(사용자가 알림을 지움)은 보낼 내용이 없다 — 실패로 닫고 뺀다.
            $contents = self::loadContents($jobs);
            $sendJobs = [];
            foreach ($jobs as $j) {
                if ($contents[(int) $j['queue_id']] === null) {
                    try { self::markDead((int) $j['queue_id'], 'notification row gone'); } catch (\Throwable $e) {}
                    $failed++;
                    $processed++;
                    continue;
                }
                $sendJobs[] = $j;
            }
            $jobs = array_values($sendJobs);
            if (!$jobs) {
                continue;
            }

            $payload = [];
            foreach ($jobs as $j) {
                $payload[] = self::expoMessage($j, $contents[(int) $j['queue_id']]);
            }

            $ch = curl_init($endpoint);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Accept: application/json',
                    'Accept-Encoding: gzip, deflate',
                ],
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_ENCODING       => '',
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr  = curl_error($ch);
            unset($ch);

            if ($curlErr || $httpCode !== 200) {
                $msg = $curlErr ?: "HTTP {$httpCode}";
                $logf("  batch failed: %s", $msg);
                foreach ($jobs as $j) {
                    try { self::markTransientFailure((int) $j['queue_id'], $msg); } catch (\Throwable $e) {}
                    $failed++;
                }
                $processed += count($jobs);
                continue;
            }

            $parsed = json_decode((string) $response, true);
            $tickets = is_array($parsed) && isset($parsed['data']) && is_array($parsed['data']) ? $parsed['data'] : [];

            foreach ($jobs as $i => $j) {
                $ticket = $tickets[$i] ?? null;
                $status = is_array($ticket) ? ($ticket['status'] ?? '') : '';

                if ($status === 'ok') {
                    try {
                        self::markSent((int) $j['queue_id']);
                        DB::execute("UPDATE {$tokenTable} SET last_used_at = NOW() WHERE push_token = ?", [(string) $j['expo_token']]);
                        $sentOk++;
                    } catch (\Throwable $e) {}
                    continue;
                }

                $errCode = is_array($ticket) ? ($ticket['details']['error'] ?? '') : '';
                $errMsg  = is_array($ticket) ? ($ticket['message'] ?? 'unknown') : 'no ticket';

                // DeviceNotRegistered → 토큰 자체가 무효. 재시도 의미 없어 즉시 failed + 토큰 정리.
                if ($errCode === 'DeviceNotRegistered') {
                    try { DB::execute("DELETE FROM {$tokenTable} WHERE push_token = ?", [(string) $j['expo_token']]); } catch (\Throwable $e) {}
                    try { self::markDead((int) $j['queue_id'], $errMsg); } catch (\Throwable $e) {}
                    $failed++;
                    if ($verbose) $logf("  [dead token] queue#%d cleaned up", (int) $j['queue_id']);
                    continue;
                }

                try { self::markFailed((int) $j['queue_id'], $errMsg); } catch (\Throwable $e) {}
                $failed++;
                if ($verbose) $logf("  [retry] queue#%d err=%s", (int) $j['queue_id'], $errMsg);
            }

            $processed += count($jobs);
            if ($verbose) {
                $logf("  batch#%d: running total ok=%d err=%d", $batches, $sentOk, $failed);
            }
        }

        return ['processed' => $processed, 'ok' => $sentOk, 'err' => $failed, 'batches' => $batches];
    }
}

} // class_exists guard
