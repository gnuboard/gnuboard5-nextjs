<?php
/**
 * 알림 관련 표 매일 정리 cron — 푸시 토큰 · 푸시 큐 · 알림함.
 *
 * 정책:
 *   - push_token: last_used_at 가 90일 이상 지난 토큰은 앱을 안 쓰는 것으로 간주 → DELETE
 *     (발송 중 DeviceNotRegistered 응답을 받은 토큰은 워커가 그 자리에서 지운다).
 *   - push_queue: sent 30일 · failed 90일 지난 행 삭제 (WEBAPP_PUSH_QUEUE_KEEP_*_DAYS).
 *   - notification_log: 읽은 알림 180일 · 안 읽은 알림 365일 지난 행 삭제 (WEBAPP_NOTIFICATION_KEEP_*_DAYS).
 *
 * 사용:
 *   php plugin/webapp/cron/cleanup_push_tokens.php             # 실제 삭제
 *   php plugin/webapp/cron/cleanup_push_tokens.php --dry-run   # 카운트만
 *
 * 등록 (Linux cron):
 *   0 3 * * 0  /usr/bin/php /var/www/g5site/plugin/webapp/cron/cleanup_push_tokens.php >> /var/log/cleanup_push.log 2>&1
 *   (매주 일요일 새벽 3시)
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

$DRY_RUN = in_array('--dry-run', $argv, true);

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) define('_GNUBOARD_', true);
ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();
require_once dirname(__DIR__, 3) . '/api/lib/DB.php';

$tokenTable = DB::table('push_token_table');

// 보존 일수. 사이트별로 바꾸려면 extend/ 의 아무 파일에서 define 하면 된다 (0 이면 그 정리는 건너뛴다).
if (!defined('WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS'))     define('WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS', 30);
if (!defined('WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS'))   define('WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS', 90);
if (!defined('WEBAPP_NOTIFICATION_KEEP_READ_DAYS'))   define('WEBAPP_NOTIFICATION_KEEP_READ_DAYS', 180);
if (!defined('WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS')) define('WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS', 365);

$cutoff = date('Y-m-d H:i:s', strtotime('-90 days'));

$count = DB::count(
    "SELECT COUNT(*) FROM {$tokenTable} WHERE last_used_at < ?",
    [$cutoff]
);

logf("Found %d stale push tokens (last_used_at < %s)", $count, $cutoff);

if ($count > 0 && !$DRY_RUN) {
    $deleted = DB::execute(
        "DELETE FROM {$tokenTable} WHERE last_used_at < ?",
        [$cutoff]
    );
    logf("Deleted %d stale push tokens.", $deleted);
} elseif ($count > 0) {
    logf("--dry-run: would DELETE %d stale push tokens", $count);
}

// 처리 끝난 푸시 큐 행과 오래된 알림함 행도 같이 정리한다 (보존 일수는 위 상수로 조정).
require_once dirname(__DIR__, 3) . '/api/lib/PushQueue.php';
require_once dirname(__DIR__) . '/notify/Notify.php';
if ($DRY_RUN) {
    $queueTable = DB::table('push_queue_table');
    $logTable   = DB::table('notification_log_table');
    $ago = static fn (int $days): string => date('Y-m-d H:i:s', time() - $days * 86400);
    logf("--dry-run: push_queue would remove sent=%d failed=%d; notification_log read=%d unread=%d",
        DB::count("SELECT COUNT(*) FROM `{$queueTable}` WHERE status = 'sent' AND processed_at < ?", [$ago(WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS)]),
        DB::count("SELECT COUNT(*) FROM `{$queueTable}` WHERE status = 'failed' AND processed_at < ?", [$ago(WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS)]),
        DB::count("SELECT COUNT(*) FROM `{$logTable}` WHERE nt_read_at IS NOT NULL AND nt_read_at < ?", [$ago(WEBAPP_NOTIFICATION_KEEP_READ_DAYS)]),
        DB::count("SELECT COUNT(*) FROM `{$logTable}` WHERE nt_read_at IS NULL AND nt_sent_at < ?", [$ago(WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS)])
    );
    exit(0);
}
$queueGc = PushQueue::gc(WEBAPP_PUSH_QUEUE_KEEP_SENT_DAYS, WEBAPP_PUSH_QUEUE_KEEP_FAILED_DAYS);
logf("push_queue gc: sent=%d failed=%d rows removed.", $queueGc['sent'], $queueGc['failed']);
$logGc = Notify::gc(WEBAPP_NOTIFICATION_KEEP_READ_DAYS, WEBAPP_NOTIFICATION_KEEP_UNREAD_DAYS);
logf("notification_log gc: read=%d unread=%d rows removed.", $logGc['read'], $logGc['unread']);
exit(0);

function logf(string $fmt, ...$args): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . vsprintf($fmt, $args);
    fwrite(STDOUT, $line . PHP_EOL);
}
