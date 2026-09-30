<?php
/**
 * Create or remove a temporary YoungCart coupon-zone coupon for local smoke checks.
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
$cleanupOnly = in_array('--cleanup', $args, true);
$subject = 'NextJS smoke YoungCart coupon';
$filePrefix = 'nextjs_smoke_coupon_';

function smoke_coupon_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_coupon_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_coupon_zone: {$message}\n");
    }
    exit(1);
}

function smoke_coupon_clean_product_id(string $value): string
{
    return preg_replace('/[^0-9a-zA-Z_\-]/', '', $value);
}

function smoke_coupon_today(): string
{
    return defined('G5_TIME_YMD') ? G5_TIME_YMD : date('Y-m-d');
}

function smoke_coupon_now(): string
{
    return defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
}

function smoke_coupon_cleanup_files(string $filePrefix): int
{
    $deleted = 0;
    foreach (glob(G5_DATA_PATH . '/coupon/' . $filePrefix . '*.png') ?: [] as $path) {
        if (is_file($path) && @unlink($path)) {
            $deleted++;
        }
    }
    return $deleted;
}

function smoke_coupon_cleanup(string $subject, string $filePrefix): array
{
    $zoneTable = DB::table('g5_shop_coupon_zone_table');
    $couponTable = DB::table('g5_shop_coupon_table');
    $zones = DB::fetchAll(
        "SELECT cz_id FROM {$zoneTable} WHERE cz_subject = ? OR cz_file LIKE ?",
        [$subject, $filePrefix . '%']
    );

    $zoneIds = [];
    foreach ($zones as $zone) {
        $zoneId = (int) ($zone['cz_id'] ?? 0);
        if ($zoneId > 0) {
            $zoneIds[] = $zoneId;
        }
    }

    $deletedCoupons = 0;
    foreach ($zoneIds as $zoneId) {
        $deletedCoupons += DB::execute("DELETE FROM {$couponTable} WHERE cz_id = ?", [$zoneId]);
    }
    $deletedCoupons += DB::execute("DELETE FROM {$couponTable} WHERE cp_subject = ?", [$subject]);

    $deletedZones = 0;
    foreach ($zoneIds as $zoneId) {
        $deletedZones += DB::execute("DELETE FROM {$zoneTable} WHERE cz_id = ?", [$zoneId]);
    }

    return [
        'zones' => $deletedZones,
        'coupons' => $deletedCoupons,
        'files' => smoke_coupon_cleanup_files($filePrefix),
    ];
}

$productId = smoke_coupon_clean_product_id((string) (smoke_coupon_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));

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
    smoke_coupon_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$deleted = smoke_coupon_cleanup($subject, $filePrefix);

if ($cleanupOnly) {
    $payload = [
        'success' => true,
        'deleted' => $deleted,
    ];
    if ($jsonOutput) {
        echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
        exit;
    }
    echo "deleted smoke coupon zone\n";
    exit;
}

if ($productId === '') {
    smoke_coupon_fail('product-id is required.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$zoneTable = DB::table('g5_shop_coupon_zone_table');

$product = DB::fetch(
    "SELECT it_id FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);
if (!$product) {
    smoke_coupon_fail('product was not found.', $jsonOutput);
}

$today = smoke_coupon_today();
$end = date('Y-m-d', strtotime('+30 days', defined('G5_SERVER_TIME') ? (int) G5_SERVER_TIME : time()));

DB::execute(
    "INSERT INTO {$zoneTable}
        SET cz_type = 0,
            cz_subject = ?,
            cz_start = ?,
            cz_end = ?,
            cz_file = '',
            cz_period = 3,
            cz_point = 0,
            cp_method = 0,
            cp_target = ?,
            cp_price = 1234,
            cp_type = 0,
            cp_trunc = 1,
            cp_minimum = 1000,
            cp_maximum = 0,
            cz_download = 0,
            cz_datetime = ?",
    [$subject, $today, $end, $productId, smoke_coupon_now()]
);
$zoneId = (int) DB::lastInsertId();
$fileName = $filePrefix . $zoneId . '.png';

$couponDir = G5_DATA_PATH . '/coupon';
if (!is_dir($couponDir) && !@mkdir($couponDir, 0755, true) && !is_dir($couponDir)) {
    smoke_coupon_cleanup($subject, $filePrefix);
    smoke_coupon_fail('failed to create data/coupon directory.', $jsonOutput);
}

$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=');
if (@file_put_contents($couponDir . '/' . $fileName, $png) === false) {
    smoke_coupon_cleanup($subject, $filePrefix);
    smoke_coupon_fail('failed to write coupon image file.', $jsonOutput);
}

DB::execute(
    "UPDATE {$zoneTable} SET cz_file = ? WHERE cz_id = ?",
    [$fileName, $zoneId]
);

$payload = [
    'success' => true,
    'cz_id' => $zoneId,
    'product_id' => $productId,
    'subject' => $subject,
    'cz_file' => $fileName,
    'cz_period' => 3,
    'cp_price' => 1234,
    'cp_minimum' => 1000,
    'expected_cp_start' => $today,
    'expected_cp_end' => date('Y-m-d', strtotime('+2 days', defined('G5_SERVER_TIME') ? (int) G5_SERVER_TIME : time())),
    'deleted_before_create' => $deleted,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "created smoke coupon zone cz_id={$zoneId}\n";
