<?php
/**
 * Seed a local-only coupon zone row for Next.js coupon flow checks.
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

function smoke_coupon_seed_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_coupon_seed_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_coupon_seed_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_coupon_seed_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "seed_nextjs_smoke_coupon_zone: {$message}\n");
    }
    exit(1);
}

$subject = smoke_coupon_seed_env_or_arg($args, 'subject', 'LOCAL_SMOKE_COUPON_SUBJECT', 'nextjs-local-coupon-smoke 3000');
$price = (int) smoke_coupon_seed_env_or_arg($args, 'price', 'LOCAL_SMOKE_COUPON_PRICE', '3000');
$minimum = (int) smoke_coupon_seed_env_or_arg($args, 'minimum', 'LOCAL_SMOKE_COUPON_MINIMUM', '10000');
$method = (int) smoke_coupon_seed_env_or_arg($args, 'method', 'LOCAL_SMOKE_COUPON_METHOD', '2');
$target = smoke_coupon_seed_env_or_arg($args, 'target', 'LOCAL_SMOKE_COUPON_TARGET', '');

if ($subject === '' || strlen($subject) > 255) {
    smoke_coupon_seed_fail('subject must be 1-255 characters.', $jsonOutput);
}
if ($price <= 0 || $price > 10000000) {
    smoke_coupon_seed_fail('price must be between 1 and 10000000.', $jsonOutput);
}
if ($minimum < 0 || $minimum > 100000000) {
    smoke_coupon_seed_fail('minimum must be between 0 and 100000000.', $jsonOutput);
}
if (!in_array($method, [0, 1, 2, 3], true)) {
    smoke_coupon_seed_fail('method must be one of 0, 1, 2, or 3.', $jsonOutput);
}
if (($method === 0 || $method === 1) && $target === '') {
    smoke_coupon_seed_fail('target is required for product/category coupons.', $jsonOutput);
}
if (strlen($target) > 255) {
    smoke_coupon_seed_fail('target must be at most 255 characters.', $jsonOutput);
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
    smoke_coupon_seed_fail('refusing to seed a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$zoneTable = DB::table('g5_shop_coupon_zone_table');
$today = date('Y-m-d');
$end = date('Y-m-d', strtotime('+30 days'));
$now = date('Y-m-d H:i:s');

$existing = DB::fetch(
    "SELECT cz_id FROM {$zoneTable} WHERE cz_subject = ? LIMIT 1",
    [$subject]
);

if ($existing) {
    DB::execute(
        "UPDATE {$zoneTable}
            SET cz_type = 0,
                cz_start = ?,
                cz_end = ?,
                cz_period = 30,
                cz_point = 0,
                cp_method = ?,
                cp_target = ?,
                cp_price = ?,
                cp_type = 0,
                cp_trunc = 0,
                cp_minimum = ?,
                cp_maximum = 0
          WHERE cz_id = ?",
        [$today, $end, $method, $target, $price, $minimum, (int) $existing['cz_id']]
    );
    $czId = (int) $existing['cz_id'];
    $action = 'updated';
} else {
    DB::execute(
        "INSERT INTO {$zoneTable}
            SET cz_type = 0,
                cz_subject = ?,
                cz_start = ?,
                cz_end = ?,
                cz_period = 30,
                cz_point = 0,
                cp_method = ?,
                cp_target = ?,
                cp_price = ?,
                cp_type = 0,
                cp_trunc = 0,
                cp_minimum = ?,
                cp_maximum = 0,
                cz_download = 0,
                cz_datetime = ?",
        [$subject, $today, $end, $method, $target, $price, $minimum, $now]
    );
    $czId = (int) DB::lastInsertId();
    $action = 'created';
}

$payload = [
    'success' => true,
    'action' => $action,
    'cz_id' => $czId,
    'subject' => $subject,
    'price' => $price,
    'minimum' => $minimum,
    'method' => $method,
    'target' => $target,
    'start' => $today,
    'end' => $end,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "{$action} smoke coupon zone {$czId}.\n";
