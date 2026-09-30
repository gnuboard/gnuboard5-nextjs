<?php
/**
 * Remove local-only Next.js YoungCart restock SMS smoke rows.
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

function smoke_stocksms_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_stocksms_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_stocksms: {$message}\n");
    }
    exit(1);
}

$productId = trim((string) (smoke_stocksms_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));
$hp = trim((string) (smoke_stocksms_arg_value($args, 'hp') ?: '010-9911-2233'));

if ($productId === '') {
    smoke_stocksms_fail('product-id is required.', $jsonOutput);
}
if ($hp === '') {
    smoke_stocksms_fail('hp is required.', $jsonOutput);
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
    smoke_stocksms_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$normalizedHp = function_exists('hyphen_hp_number') ? hyphen_hp_number($hp) : preg_replace('/[^0-9\-]/', '', $hp);
$digitsHp = preg_replace('/[^0-9]/', '', $hp);
$candidateHps = array_values(array_unique(array_filter([$hp, $normalizedHp, $digitsHp])));

$table = DB::table('g5_shop_item_stocksms_table');
$deleted = 0;
foreach ($candidateHps as $candidateHp) {
    $deleted += DB::execute(
        "DELETE FROM {$table}
          WHERE it_id = ?
            AND ss_hp = ?",
        [$productId, $candidateHp]
    );
}

$payload = [
    'success' => true,
    'product_id' => $productId,
    'hp' => $normalizedHp,
    'deleted' => $deleted,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "deleted {$deleted} restock SMS row(s) for {$productId} {$normalizedHp}\n";
