<?php
/**
 * Remove local-only memo smoke rows created by Next.js memo checks.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

$args = $argv ?? [];
$jsonOutput = in_array('--json', $args, true);

function smoke_memo_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_memo_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_memo_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_memo_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_memos: {$message}\n");
    }
    exit(1);
}

$senderId = smoke_memo_env_or_arg($args, 'sender-id', 'LOCAL_SMOKE_MEMO_SENDER_ID', 'nextjs_memo_send');
$receiverId = smoke_memo_env_or_arg($args, 'receiver-id', 'LOCAL_SMOKE_MEMO_RECEIVER_ID', 'nextjs_memo_recv');
$marker = smoke_memo_env_or_arg($args, 'marker', 'LOCAL_SMOKE_MEMO_MARKER', 'nextjs-local-memo-smoke');

foreach ([$senderId, $receiverId] as $memberId) {
    if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
        smoke_memo_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
    }
}
if ($senderId === $receiverId) {
    smoke_memo_fail('sender and receiver must be different members.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_memo_fail('marker must be 1-120 characters.', $jsonOutput);
}

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) {
    define('_GNUBOARD_', true);
}

ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();

require_once dirname(__DIR__, 3) . '/api/lib/DB.php';

$dbHost = defined('G5_MYSQL_HOST') ? strtolower((string) G5_MYSQL_HOST) : '';
$allowNonLocal = getenv('ALLOW_NONLOCAL_SMOKE_SEED') === '1';
if (!$allowNonLocal && !in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    smoke_memo_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$memoTable = DB::table('memo_table');
$memberTable = DB::table('member_table');
$like = '%' . $marker . '%';

function smoke_memo_unread_count(string $memberId): int
{
    $memoTable = DB::table('memo_table');
    return (int) DB::count(
        "SELECT COUNT(*) FROM {$memoTable}
         WHERE me_recv_mb_id = ?
           AND me_type = 'recv'
           AND CAST(me_read_datetime AS CHAR) IN ('0000-00-00 00:00:00', '1000-01-01 00:00:00')",
        [$memberId]
    );
}

DB::beginTransaction();
try {
    $deletedMemos = DB::execute(
        "DELETE FROM {$memoTable}
          WHERE me_memo LIKE ?
            AND (
              (me_send_mb_id = ? AND me_recv_mb_id = ?)
              OR (me_send_mb_id = ? AND me_recv_mb_id = ?)
            )",
        [$like, $senderId, $receiverId, $receiverId, $senderId]
    );

    foreach ([$senderId, $receiverId] as $memberId) {
        $unreadCount = smoke_memo_unread_count($memberId);
        DB::execute(
            "UPDATE {$memberTable}
                SET mb_memo_cnt = ?,
                    mb_memo_call = CASE WHEN ? = 0 THEN '' ELSE mb_memo_call END
              WHERE mb_id = ?",
            [$unreadCount, $unreadCount, $memberId]
        );
    }

    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_memo_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'sender_id' => $senderId,
    'receiver_id' => $receiverId,
    'marker' => $marker,
    'deleted_memos' => $deletedMemos,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedMemos} smoke memos between {$senderId} and {$receiverId}.\n";
