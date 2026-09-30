<?php
/**
 * Remove local-only point rows created by Next.js point checks.
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

function smoke_point_cleanup_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_point_cleanup_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_point_cleanup_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_point_cleanup_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_points: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_point_cleanup_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_POINT_LOGIN_ID', 'nextjs_point_smoke');
$marker = smoke_point_cleanup_env_or_arg($args, 'marker', 'LOCAL_SMOKE_POINT_MARKER', 'nextjs-local-point-smoke');
$resetBalance = !in_array('--keep-balance', $args, true);

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_point_cleanup_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_point_cleanup_fail('marker must be 1-120 characters.', $jsonOutput);
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
    smoke_point_cleanup_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$memberTable = DB::table('member_table');
$pointTable = DB::table('point_table');
$relationId = 'nextjs_point';
$member = DB::fetch(
    "SELECT mb_id, mb_10 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
    [$memberId]
);
if ($member && (string) ($member['mb_10'] ?? '') !== 'nextjs-local-smoke') {
    smoke_point_cleanup_fail("member {$memberId} exists but is not marked as a smoke user.", $jsonOutput);
}

try {
    $deleted = DB::execute(
        "DELETE FROM {$pointTable}
          WHERE mb_id = ? AND po_rel_table = ? AND po_rel_id = ?",
        [$memberId, '@nextjs', $relationId]
    );
    if ($member && $resetBalance) {
        DB::execute("UPDATE {$memberTable} SET mb_point = 0 WHERE mb_id = ?", [$memberId]);
    }
} catch (Throwable $e) {
    smoke_point_cleanup_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'marker' => $marker,
    'relation_id' => $relationId,
    'deleted_points' => $deleted,
    'reset_balance' => $member ? $resetBalance : false,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deleted} smoke point rows for {$memberId}.\n";
