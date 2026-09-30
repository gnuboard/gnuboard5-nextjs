<?php
/**
 * Temporarily set YoungCart product shipping payment fields for local Next.js smoke checks.
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

function smoke_shipping_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_shipping_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_shipping: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_shipping_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$scType = smoke_shipping_arg_value($args, 'type');
$scMethod = smoke_shipping_arg_value($args, 'method');
$scPrice = smoke_shipping_arg_value($args, 'price');
$scMinimum = smoke_shipping_arg_value($args, 'minimum');
$scQty = smoke_shipping_arg_value($args, 'qty');

if ($productId === '') {
    smoke_shipping_fail('product-id is required.', $jsonOutput);
}

foreach (['type' => $scType, 'method' => $scMethod, 'price' => $scPrice, 'minimum' => $scMinimum, 'qty' => $scQty] as $name => $value) {
    if ($value === null || !preg_match('/^-?\d+$/', (string) $value)) {
        smoke_shipping_fail($name . ' must be an integer.', $jsonOutput);
    }
}

$scType = (int) $scType;
$scMethod = (int) $scMethod;
$scPrice = max(0, (int) $scPrice);
$scMinimum = max(0, (int) $scMinimum);
$scQty = max(0, (int) $scQty);

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
    smoke_shipping_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$previous = DB::fetch(
    "SELECT it_id, it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty
       FROM {$itemTable}
      WHERE it_id = ? LIMIT 1",
    [$productId]
);

if (!$previous) {
    smoke_shipping_fail('product was not found.', $jsonOutput);
}

DB::execute(
    "UPDATE {$itemTable}
        SET it_sc_type = ?,
            it_sc_method = ?,
            it_sc_price = ?,
            it_sc_minimum = ?,
            it_sc_qty = ?
      WHERE it_id = ?",
    [$scType, $scMethod, $scPrice, $scMinimum, $scQty, $productId]
);

$payload = [
    'success' => true,
    'product_id' => $productId,
    'previous_type' => (int) ($previous['it_sc_type'] ?? 0),
    'previous_method' => (int) ($previous['it_sc_method'] ?? 0),
    'previous_price' => (int) ($previous['it_sc_price'] ?? 0),
    'previous_minimum' => (int) ($previous['it_sc_minimum'] ?? 0),
    'previous_qty' => (int) ($previous['it_sc_qty'] ?? 0),
    'type' => $scType,
    'method' => $scMethod,
    'price' => $scPrice,
    'minimum' => $scMinimum,
    'qty' => $scQty,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated {$productId} shipping type={$scType} method={$scMethod}\n";
