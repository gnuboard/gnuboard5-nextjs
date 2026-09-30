<?php
/**
 * Create or remove a local-only YoungCart supply option for Next.js smoke checks.
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

function smoke_supply_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_supply_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_supply_option: {$message}\n");
    }
    exit(1);
}

function smoke_supply_b64_decode(?string $value): string
{
    if ($value === null || $value === '') {
        return '';
    }
    $decoded = base64_decode($value, true);
    return $decoded === false ? '' : $decoded;
}

$productId = trim((string) (smoke_supply_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$ioId = smoke_supply_arg_value($args, 'io-id') ?? 'nextjs-smoke-supply';
$mode = smoke_supply_arg_value($args, 'mode') ?: 'set';
$price = smoke_supply_arg_value($args, 'price');
$stock = smoke_supply_arg_value($args, 'stock');
$supplyPoint = smoke_supply_arg_value($args, 'supply-point');
$supplySubject = smoke_supply_arg_value($args, 'supply-subject') ?? 'SMOKE';
$previousSubjectB64 = smoke_supply_arg_value($args, 'previous-supply-subject-b64');
$previousPoint = smoke_supply_arg_value($args, 'previous-supply-point');

if ($productId === '') {
    smoke_supply_fail('product-id is required.', $jsonOutput);
}
if ($ioId === '' || strlen($ioId) > 255 || strpos($ioId, 'nextjs-smoke') === false) {
    smoke_supply_fail('io-id must be a nextjs-smoke marker no longer than 255 characters.', $jsonOutput);
}
if (!in_array($mode, ['set', 'restore'], true)) {
    smoke_supply_fail('mode must be set or restore.', $jsonOutput);
}
if ($mode === 'set') {
    if ($price === null || !preg_match('/^-?\d+$/', (string) $price)) {
        smoke_supply_fail('price must be an integer.', $jsonOutput);
    }
    if ($stock === null || !preg_match('/^\d+$/', (string) $stock)) {
        smoke_supply_fail('stock must be a non-negative integer.', $jsonOutput);
    }
    if ($supplyPoint === null || !preg_match('/^-?\d+$/', (string) $supplyPoint)) {
        smoke_supply_fail('supply-point must be an integer.', $jsonOutput);
    }
}
if ($previousPoint !== null && !preg_match('/^-?\d+$/', (string) $previousPoint)) {
    smoke_supply_fail('previous-supply-point must be an integer.', $jsonOutput);
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
    smoke_supply_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$optionTable = DB::table('g5_shop_item_option_table');
$previous = DB::fetch(
    "SELECT it_id, it_supply_subject, it_supply_point
       FROM {$itemTable}
      WHERE it_id = ? LIMIT 1",
    [$productId]
);

if (!$previous) {
    smoke_supply_fail('product was not found.', $jsonOutput);
}

DB::beginTransaction();
try {
    DB::execute(
        "DELETE FROM {$optionTable}
          WHERE it_id = ?
            AND io_id = ?
            AND io_type = 1",
        [$productId, $ioId]
    );

    if ($mode === 'set') {
        DB::execute(
            "INSERT INTO {$optionTable}
                SET io_id = ?,
                    io_type = 1,
                    it_id = ?,
                    io_price = ?,
                    io_stock_qty = ?,
                    io_noti_qty = 1,
                    io_use = 1",
            [$ioId, $productId, (int) $price, (int) $stock]
        );
        DB::execute(
            "UPDATE {$itemTable}
                SET it_supply_subject = ?,
                    it_supply_point = ?
              WHERE it_id = ?",
            [$supplySubject, (int) $supplyPoint, $productId]
        );
    } else {
        $restoreSubject = smoke_supply_b64_decode($previousSubjectB64);
        $restorePoint = $previousPoint === null ? (int) ($previous['it_supply_point'] ?? 0) : (int) $previousPoint;
        DB::execute(
            "UPDATE {$itemTable}
                SET it_supply_subject = ?,
                    it_supply_point = ?
              WHERE it_id = ?",
            [$restoreSubject, $restorePoint, $productId]
        );
    }

    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_supply_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'mode' => $mode,
    'product_id' => $productId,
    'io_id' => $ioId,
    'previous_supply_subject' => (string) ($previous['it_supply_subject'] ?? ''),
    'previous_supply_point' => (int) ($previous['it_supply_point'] ?? 0),
    'supply_subject' => $mode === 'set' ? $supplySubject : smoke_supply_b64_decode($previousSubjectB64),
    'supply_point' => $mode === 'set'
        ? (int) $supplyPoint
        : ($previousPoint === null ? (int) ($previous['it_supply_point'] ?? 0) : (int) $previousPoint),
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "{$mode} smoke supply option {$ioId} for {$productId}.\n";
