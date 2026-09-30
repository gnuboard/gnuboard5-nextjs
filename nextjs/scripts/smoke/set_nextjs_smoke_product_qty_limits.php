<?php
/**
 * Temporarily set YoungCart product min/max buy quantities for local Next.js smoke checks.
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

function smoke_qty_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_qty_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_qty_limits: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_qty_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$minQty = smoke_qty_arg_value($args, 'min');
$maxQty = smoke_qty_arg_value($args, 'max');
$telInq = smoke_qty_arg_value($args, 'tel');

if ($productId === '') {
    smoke_qty_fail('product-id is required.', $jsonOutput);
}
if ($minQty === null || $maxQty === null) {
    smoke_qty_fail('min and max are required.', $jsonOutput);
}
if (!ctype_digit((string) $minQty) || !ctype_digit((string) $maxQty)) {
    smoke_qty_fail('min and max must be non-negative integers.', $jsonOutput);
}
if ($telInq !== null && !in_array((string) $telInq, ['0', '1'], true)) {
    smoke_qty_fail('tel must be 0 or 1 when provided.', $jsonOutput);
}

$minQty = (int) $minQty;
$maxQty = (int) $maxQty;

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
    smoke_qty_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$previous = DB::fetch(
    "SELECT it_id, it_buy_min_qty, it_buy_max_qty, it_tel_inq FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);

if (!$previous) {
    smoke_qty_fail('product was not found.', $jsonOutput);
}

DB::execute(
    "UPDATE {$itemTable}
        SET it_buy_min_qty = ?,
            it_buy_max_qty = ?,
            it_tel_inq = ?
      WHERE it_id = ?",
    [$minQty, $maxQty, $telInq === null ? (int) ($previous['it_tel_inq'] ?? 0) : (int) $telInq, $productId]
);

$payload = [
    'success' => true,
    'product_id' => $productId,
    'previous_min' => (int) ($previous['it_buy_min_qty'] ?? 0),
    'previous_max' => (int) ($previous['it_buy_max_qty'] ?? 0),
    'previous_tel' => (int) ($previous['it_tel_inq'] ?? 0),
    'min' => $minQty,
    'max' => $maxQty,
    'tel' => $telInq === null ? (int) ($previous['it_tel_inq'] ?? 0) : (int) $telInq,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated {$productId} min={$minQty} max={$maxQty}\n";
