<?php
/**
 * Remove local-only coupon rows and zone rows created by Next.js coupon checks.
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

function smoke_coupon_cleanup_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_coupon_cleanup_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_coupon_cleanup_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_coupon_cleanup_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_coupons: {$message}\n");
    }
    exit(1);
}

function smoke_coupon_cleanup_delete_logs(array $couponIds, string $memberId): int
{
    if (count($couponIds) === 0) {
        return 0;
    }

    $couponLogTable = DB::table('g5_shop_coupon_log_table');
    $placeholders = implode(',', array_fill(0, count($couponIds), '?'));
    return DB::execute(
        "DELETE FROM {$couponLogTable} WHERE mb_id = ? AND cp_id IN ({$placeholders})",
        array_merge([$memberId], $couponIds)
    );
}

$memberId = smoke_coupon_cleanup_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_COUPON_LOGIN_ID', 'nextjs_coupon_smoke');
$subject = smoke_coupon_cleanup_env_or_arg($args, 'subject', 'LOCAL_SMOKE_COUPON_SUBJECT', 'nextjs-local-coupon-smoke 3000');
$deleteZone = !in_array('--keep-zone', $args, true);

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_coupon_cleanup_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($subject === '' || strlen($subject) > 255) {
    smoke_coupon_cleanup_fail('subject must be 1-255 characters.', $jsonOutput);
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
    smoke_coupon_cleanup_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$memberTable = DB::table('member_table');
$couponTable = DB::table('g5_shop_coupon_table');
$zoneTable = DB::table('g5_shop_coupon_zone_table');

$member = DB::fetch(
    "SELECT mb_id, mb_10 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
    [$memberId]
);
if ($member && (string) ($member['mb_10'] ?? '') !== 'nextjs-local-smoke') {
    smoke_coupon_cleanup_fail("member {$memberId} exists but is not marked as a smoke user.", $jsonOutput);
}

$zones = DB::fetchAll("SELECT cz_id FROM {$zoneTable} WHERE cz_subject = ?", [$subject]);
$zoneIds = array_map(static fn($row) => (int) $row['cz_id'], $zones);

$couponRows = DB::fetchAll(
    "SELECT cp_id FROM {$couponTable}
      WHERE mb_id = ?
        AND (
          cp_subject = ?
          OR " . (count($zoneIds) > 0 ? 'cz_id IN (' . implode(',', array_fill(0, count($zoneIds), '?')) . ')' : '0 = 1') . "
        )",
    array_merge([$memberId, $subject], $zoneIds)
);
$couponIds = array_values(array_map(static fn($row) => (string) $row['cp_id'], $couponRows));

DB::beginTransaction();
try {
    $deletedLogs = smoke_coupon_cleanup_delete_logs($couponIds, $memberId);
    $deletedCoupons = 0;
    if (count($couponIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($couponIds), '?'));
        $deletedCoupons = DB::execute(
            "DELETE FROM {$couponTable} WHERE mb_id = ? AND cp_id IN ({$placeholders})",
            array_merge([$memberId], $couponIds)
        );
    }
    $deletedZones = 0;
    if ($deleteZone && count($zoneIds) > 0) {
        $deletedZones = DB::execute(
            "DELETE FROM {$zoneTable} WHERE cz_subject = ?",
            [$subject]
        );
    }
    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_coupon_cleanup_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'subject' => $subject,
    'deleted_logs' => $deletedLogs,
    'deleted_coupons' => $deletedCoupons,
    'deleted_zones' => $deletedZones,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedCoupons} smoke coupons and {$deletedZones} smoke zones for {$memberId}.\n";
