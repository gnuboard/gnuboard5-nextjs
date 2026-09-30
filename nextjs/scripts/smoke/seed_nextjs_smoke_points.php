<?php
/**
 * Seed local-only point history rows for Next.js mypage point checks.
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

function smoke_point_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_point_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_point_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_point_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "seed_nextjs_smoke_points: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_point_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_POINT_LOGIN_ID', 'nextjs_point_smoke');
$marker = smoke_point_env_or_arg($args, 'marker', 'LOCAL_SMOKE_POINT_MARKER', 'nextjs-local-point-smoke');
$earnPoint = (int) smoke_point_env_or_arg($args, 'earn-point', 'LOCAL_SMOKE_POINT_EARN', '1500');
$usePoint = (int) smoke_point_env_or_arg($args, 'use-point', 'LOCAL_SMOKE_POINT_USE', '300');

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_point_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_point_fail('marker must be 1-120 characters.', $jsonOutput);
}
if ($earnPoint <= 0 || $earnPoint > 10000000 || $usePoint <= 0 || $usePoint >= $earnPoint) {
    smoke_point_fail('point values must be positive, and use-point must be lower than earn-point.', $jsonOutput);
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
    smoke_point_fail('refusing to seed a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$memberTable = DB::table('member_table');
$pointTable = DB::table('point_table');
$relationId = 'nextjs_point';
$member = DB::fetch(
    "SELECT mb_id, mb_10 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
    [$memberId]
);
if (!$member) {
    smoke_point_fail("member {$memberId} does not exist.", $jsonOutput);
}
if ((string) ($member['mb_10'] ?? '') !== 'nextjs-local-smoke') {
    smoke_point_fail("member {$memberId} exists but is not marked as a smoke user.", $jsonOutput);
}

$balance = $earnPoint - $usePoint;
$now = time();
$expireDate = date('Y-m-d', strtotime('+365 days'));

try {
    DB::execute(
        "DELETE FROM {$pointTable}
          WHERE mb_id = ? AND po_rel_table = ? AND po_rel_id = ?",
        [$memberId, '@nextjs', $relationId]
    );

    DB::execute(
        "INSERT INTO {$pointTable}
            (mb_id, po_datetime, po_content, po_point, po_use_point, po_expired,
             po_expire_date, po_mb_point, po_rel_table, po_rel_id, po_rel_action)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, '@nextjs', ?, 'earn')",
        [
            $memberId,
            date('Y-m-d H:i:s', $now - 60),
            "{$marker} earn",
            $earnPoint,
            $expireDate,
            $earnPoint,
            $relationId,
        ]
    );
    $earnId = (int) DB::lastInsertId();

    DB::execute(
        "INSERT INTO {$pointTable}
            (mb_id, po_datetime, po_content, po_point, po_use_point, po_expired,
             po_expire_date, po_mb_point, po_rel_table, po_rel_id, po_rel_action)
         VALUES (?, ?, ?, 0, ?, 0, ?, ?, '@nextjs', ?, 'use')",
        [
            $memberId,
            date('Y-m-d H:i:s', $now),
            "{$marker} use",
            $usePoint,
            $expireDate,
            $balance,
            $relationId,
        ]
    );
    $useId = (int) DB::lastInsertId();

    DB::execute(
        "UPDATE {$memberTable} SET mb_point = ? WHERE mb_id = ?",
        [$balance, $memberId]
    );
} catch (Throwable $e) {
    smoke_point_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'marker' => $marker,
    'earn_point' => $earnPoint,
    'use_point' => $usePoint,
    'balance' => $balance,
    'relation_id' => $relationId,
    'point_ids' => [$earnId, $useId],
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Seeded smoke point rows for {$memberId}: balance {$balance}.\n";
