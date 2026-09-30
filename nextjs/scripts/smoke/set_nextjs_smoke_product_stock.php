<?php
/**
 * Temporarily set YoungCart product or option stock for local Next.js smoke checks.
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

function smoke_stock_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_stock_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_stock: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_stock_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$stock = smoke_stock_arg_value($args, 'stock');
$ioId = smoke_stock_arg_value($args, 'io-id');
$ioIdB64 = smoke_stock_arg_value($args, 'io-id-b64');
$ioType = smoke_stock_arg_value($args, 'io-type');
$soldout = smoke_stock_arg_value($args, 'soldout');
$stockSms = smoke_stock_arg_value($args, 'stock-sms');

if ($productId === '') {
    smoke_stock_fail('product-id is required.', $jsonOutput);
}
if ($stock === null || !preg_match('/^-?\d+$/', (string) $stock)) {
    smoke_stock_fail('stock must be an integer.', $jsonOutput);
}
if ($ioId !== null && $ioType !== null && !preg_match('/^-?\d+$/', (string) $ioType)) {
    smoke_stock_fail('io-type must be an integer when provided.', $jsonOutput);
}
if ($ioIdB64 !== null) {
    $decodedIoId = base64_decode((string) $ioIdB64, true);
    if ($decodedIoId === false) {
        smoke_stock_fail('io-id-b64 must be valid base64 when provided.', $jsonOutput);
    }
    $ioId = $decodedIoId;
}
if ($soldout !== null && !in_array((string) $soldout, ['0', '1'], true)) {
    smoke_stock_fail('soldout must be 0 or 1 when provided.', $jsonOutput);
}
if ($stockSms !== null && !in_array((string) $stockSms, ['0', '1'], true)) {
    smoke_stock_fail('stock-sms must be 0 or 1 when provided.', $jsonOutput);
}

$stock = (int) $stock;
$ioId = $ioId === null ? '' : trim((string) $ioId);
$ioType = $ioType === null ? 0 : (int) $ioType;

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
    smoke_stock_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

if ($ioId !== '') {
    $optionTable = DB::table('g5_shop_item_option_table');
    $previous = DB::fetch(
        "SELECT it_id, io_id, io_type, io_stock_qty FROM {$optionTable}
          WHERE it_id = ? AND io_id = ? AND io_type = ? LIMIT 1",
        [$productId, $ioId, $ioType]
    );

    if (!$previous) {
        smoke_stock_fail('option was not found.', $jsonOutput);
    }

    DB::execute(
        "UPDATE {$optionTable}
            SET io_stock_qty = ?
          WHERE it_id = ? AND io_id = ? AND io_type = ?",
        [$stock, $productId, $ioId, $ioType]
    );

    $payload = [
        'success' => true,
        'target' => 'option',
        'product_id' => $productId,
        'io_id' => $ioId,
        'io_type' => $ioType,
        'previous_stock' => (int) ($previous['io_stock_qty'] ?? 0),
        'stock' => $stock,
    ];
} else {
    $itemTable = DB::table('g5_shop_item_table');
    $previous = DB::fetch(
        "SELECT it_id, it_stock_qty, it_soldout, it_stock_sms FROM {$itemTable} WHERE it_id = ? LIMIT 1",
        [$productId]
    );

    if (!$previous) {
        smoke_stock_fail('product was not found.', $jsonOutput);
    }

    $sets = ['it_stock_qty = ?'];
    $params = [$stock];
    if ($soldout !== null) {
        $sets[] = 'it_soldout = ?';
        $params[] = (int) $soldout;
    }
    if ($stockSms !== null) {
        $sets[] = 'it_stock_sms = ?';
        $params[] = (int) $stockSms;
    }
    $params[] = $productId;

    DB::execute(
        "UPDATE {$itemTable}
            SET " . implode(', ', $sets) . "
          WHERE it_id = ?",
        $params
    );

    $payload = [
        'success' => true,
        'target' => 'product',
        'product_id' => $productId,
        'previous_stock' => (int) ($previous['it_stock_qty'] ?? 0),
        'previous_soldout' => (int) ($previous['it_soldout'] ?? 0),
        'previous_stock_sms' => (int) ($previous['it_stock_sms'] ?? 0),
        'stock' => $stock,
        'soldout' => $soldout === null ? (int) ($previous['it_soldout'] ?? 0) : (int) $soldout,
        'stock_sms' => $stockSms === null ? (int) ($previous['it_stock_sms'] ?? 0) : (int) $stockSms,
    ];
}

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated {$payload['target']} {$productId} stock={$stock}\n";
