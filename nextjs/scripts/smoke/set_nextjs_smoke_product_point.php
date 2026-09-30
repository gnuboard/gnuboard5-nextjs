<?php
/**
 * Temporarily set a YoungCart product point policy for local Next.js smoke checks.
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

function smoke_point_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_point: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_point_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$point = smoke_point_arg_value($args, 'point');
$pointType = smoke_point_arg_value($args, 'point-type');

if ($productId === '') {
    smoke_point_fail('product-id is required.', $jsonOutput);
}
if ($point === null || !preg_match('/^-?\d+$/', (string) $point)) {
    smoke_point_fail('point must be an integer.', $jsonOutput);
}
if ($pointType === null || !in_array((string) $pointType, ['0', '1', '2'], true)) {
    smoke_point_fail('point-type must be one of 0, 1, or 2.', $jsonOutput);
}

$point = (int) $point;
$pointType = (int) $pointType;

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
    smoke_point_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$previous = DB::fetch(
    "SELECT it_id, it_point, it_point_type FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);

if (!$previous) {
    smoke_point_fail('product was not found.', $jsonOutput);
}

DB::execute(
    "UPDATE {$itemTable}
        SET it_point = ?, it_point_type = ?
      WHERE it_id = ?",
    [$point, $pointType, $productId]
);

$payload = [
    'success' => true,
    'product_id' => $productId,
    'previous_point' => (int) ($previous['it_point'] ?? 0),
    'previous_point_type' => (int) ($previous['it_point_type'] ?? 0),
    'point' => $point,
    'point_type' => $pointType,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated product {$productId} point={$point} type={$pointType}\n";
