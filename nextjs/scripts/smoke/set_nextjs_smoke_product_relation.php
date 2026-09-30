<?php
/**
 * Temporarily set YoungCart related products for local Next.js smoke checks.
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

function smoke_product_relation_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_product_relation_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_relation: {$message}\n");
    }
    exit(1);
}

function smoke_product_relation_clean_id(string $value): string
{
    return preg_replace('/[^0-9a-zA-Z_\-]/', '', $value);
}

function smoke_product_relation_parse_ids(string $csv): array
{
    $ids = [];
    foreach (explode(',', $csv) as $id) {
        $id = smoke_product_relation_clean_id(trim((string) $id));
        if ($id !== '' && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return $ids;
}

$productId = smoke_product_relation_clean_id((string) (smoke_product_relation_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$relatedId = smoke_product_relation_clean_id((string) (smoke_product_relation_arg_value($args, 'related-id') ?: ''));
$restoreCsv = smoke_product_relation_arg_value($args, 'restore-csv');

if ($productId === '') {
    smoke_product_relation_fail('product-id is required.', $jsonOutput);
}
if ($restoreCsv === null && $relatedId === '') {
    smoke_product_relation_fail('related-id or restore-csv is required.', $jsonOutput);
}
if ($relatedId !== '' && $relatedId === $productId) {
    smoke_product_relation_fail('related-id must differ from product-id.', $jsonOutput);
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
    smoke_product_relation_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$relationTable = DB::table('g5_shop_item_relation_table');

$product = DB::fetch(
    "SELECT it_id FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);
if (!$product) {
    smoke_product_relation_fail('product was not found.', $jsonOutput);
}

if ($relatedId !== '') {
    $related = DB::fetch(
        "SELECT it_id FROM {$itemTable} WHERE it_id = ? LIMIT 1",
        [$relatedId]
    );
    if (!$related) {
        smoke_product_relation_fail('related product was not found.', $jsonOutput);
    }
}

$previousRows = DB::fetchAll(
    "SELECT it_id2 FROM {$relationTable} WHERE it_id = ? ORDER BY ir_no ASC, it_id2 ASC",
    [$productId]
);
$previousIds = array_map(static fn($row) => (string) $row['it_id2'], $previousRows);

$nextIds = $restoreCsv !== null
    ? smoke_product_relation_parse_ids($restoreCsv)
    : [$relatedId];

DB::beginTransaction();
try {
    DB::execute("DELETE FROM {$relationTable} WHERE it_id = ?", [$productId]);

    foreach ($nextIds as $index => $nextId) {
        if ($nextId === '' || $nextId === $productId) {
            continue;
        }
        DB::execute(
            "INSERT INTO {$relationTable}
                SET it_id = ?, it_id2 = ?, ir_no = ?",
            [$productId, $nextId, $index]
        );
    }

    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_product_relation_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'product_id' => $productId,
    'previous_related_ids' => $previousIds,
    'previous_related_csv' => implode(',', $previousIds),
    'related_ids' => $nextIds,
    'related_csv' => implode(',', $nextIds),
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated {$productId} related products\n";
