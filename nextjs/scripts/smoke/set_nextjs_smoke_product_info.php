<?php
/**
 * Temporarily set YoungCart product information notice data for local smoke checks.
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

function smoke_product_info_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_product_info_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_info: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_product_info_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$gubun = trim((string) (smoke_product_info_arg_value($args, 'gubun') ?: 'wear'));
$key = trim((string) (smoke_product_info_arg_value($args, 'key') ?: 'material'));
$keys = trim((string) (smoke_product_info_arg_value($args, 'keys') ?: ''));
$value = smoke_product_info_arg_value($args, 'value');
$rawGubun = smoke_product_info_arg_value($args, 'raw-gubun');
$rawValue = smoke_product_info_arg_value($args, 'raw-value');

if ($productId === '') {
    smoke_product_info_fail('product-id is required.', $jsonOutput);
}

$useRaw = $rawGubun !== null || $rawValue !== null;
if (!$useRaw && ($gubun === '' || $key === '' || $value === null)) {
    smoke_product_info_fail('gubun, key and value are required unless raw-gubun/raw-value are provided.', $jsonOutput);
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
    smoke_product_info_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$previous = DB::fetch(
    "SELECT it_id, it_info_gubun, it_info_value FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);

if (!$previous) {
    smoke_product_info_fail('product was not found.', $jsonOutput);
}

if ($useRaw) {
    $nextGubun = $rawGubun === null ? (string) ($previous['it_info_gubun'] ?? '') : $rawGubun;
    $nextValue = $rawValue === null ? (string) ($previous['it_info_value'] ?? '') : $rawValue;
} else {
    $nextGubun = $gubun;
    $valueArray = [];
    if ($keys !== '') {
        foreach (explode(',', $keys) as $infoKey) {
            $infoKey = trim((string) $infoKey);
            if ($infoKey !== '') {
                $valueArray[$infoKey] = (string) $value;
            }
        }
    }
    if (!$valueArray) {
        $valueArray[$key] = (string) $value;
    }
    $nextValue = serialize($valueArray);
}

DB::execute(
    "UPDATE {$itemTable}
        SET it_info_gubun = ?, it_info_value = ?
      WHERE it_id = ?",
    [$nextGubun, $nextValue, $productId]
);

$payload = [
    'success' => true,
    'product_id' => $productId,
    'previous_info_gubun' => (string) ($previous['it_info_gubun'] ?? ''),
    'previous_info_value' => (string) ($previous['it_info_value'] ?? ''),
    'it_info_gubun' => $nextGubun,
    'it_info_value' => $nextValue,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated {$productId} product information notice\n";
