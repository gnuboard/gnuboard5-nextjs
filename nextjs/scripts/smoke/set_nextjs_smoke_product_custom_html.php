<?php
/**
 * Temporarily set YoungCart product custom head/tail HTML for local Next.js smoke checks.
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

function smoke_custom_html_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_custom_html_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_product_custom_html: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_custom_html_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$headHtml = smoke_custom_html_arg_value($args, 'head');
$tailHtml = smoke_custom_html_arg_value($args, 'tail');

if ($productId === '') {
    smoke_custom_html_fail('product-id is required.', $jsonOutput);
}
if ($headHtml === null && $tailHtml === null) {
    smoke_custom_html_fail('head or tail is required.', $jsonOutput);
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
    smoke_custom_html_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$previous = DB::fetch(
    "SELECT it_id, it_head_html, it_tail_html FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);

if (!$previous) {
    smoke_custom_html_fail('product was not found.', $jsonOutput);
}

$sets = [];
$params = [];
if ($headHtml !== null) {
    $sets[] = 'it_head_html = ?';
    $params[] = $headHtml;
}
if ($tailHtml !== null) {
    $sets[] = 'it_tail_html = ?';
    $params[] = $tailHtml;
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
    'product_id' => $productId,
    'previous_head_html' => (string) ($previous['it_head_html'] ?? ''),
    'previous_tail_html' => (string) ($previous['it_tail_html'] ?? ''),
    'head_html' => $headHtml === null ? (string) ($previous['it_head_html'] ?? '') : $headHtml,
    'tail_html' => $tailHtml === null ? (string) ($previous['it_tail_html'] ?? '') : $tailHtml,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated {$productId} custom product html\n";
