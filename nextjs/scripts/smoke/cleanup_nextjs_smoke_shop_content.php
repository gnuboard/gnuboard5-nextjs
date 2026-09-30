<?php
/**
 * Remove local-only Youngcart review/Q&A smoke rows created by Next.js checks.
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

function smoke_shop_content_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_shop_content_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_shop_content_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_shop_content_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_shop_content: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_shop_content_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_LOGIN_ID', 'nextjs_shop_smoke');
$itemId = smoke_shop_content_env_or_arg($args, 'item-id', 'LOCAL_SMOKE_SHOP_PRODUCT_ID', '1446772772');
$marker = smoke_shop_content_env_or_arg($args, 'marker', 'LOCAL_SMOKE_SHOP_CONTENT_MARKER', 'nextjs-local-shop-content-smoke');

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_shop_content_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($itemId === '' || strlen($itemId) > 100) {
    smoke_shop_content_fail('item id must be 1-100 characters.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_shop_content_fail('marker must be 1-120 characters.', $jsonOutput);
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
    smoke_shop_content_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$reviewTable = DB::table('g5_shop_item_use_table');
$qaTable = DB::table('g5_shop_item_qa_table');
$like = '%' . $marker . '%';

DB::beginTransaction();
try {
    $deletedReviews = DB::execute(
        "DELETE FROM {$reviewTable}
          WHERE mb_id = ?
            AND it_id = ?
            AND (is_subject LIKE ? OR is_content LIKE ?)",
        [$memberId, $itemId, $like, $like]
    );
    $deletedQas = DB::execute(
        "DELETE FROM {$qaTable}
          WHERE mb_id = ?
            AND it_id = ?
            AND (iq_subject LIKE ? OR iq_question LIKE ?)",
        [$memberId, $itemId, $like, $like]
    );
    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_shop_content_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'item_id' => $itemId,
    'marker' => $marker,
    'deleted_reviews' => $deletedReviews,
    'deleted_qas' => $deletedQas,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedReviews} smoke reviews and {$deletedQas} smoke Q&A rows for {$memberId}.\n";
