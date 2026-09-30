<?php
/**
 * Temporarily set YoungCart review write/moderation policy for local smoke checks.
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

function smoke_review_policy_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_review_policy_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_review_policy: {$message}\n");
    }
    exit(1);
}

$write = smoke_review_policy_arg_value($args, 'write');
$moderate = smoke_review_policy_arg_value($args, 'moderate');

if ($write === null || $moderate === null) {
    smoke_review_policy_fail('write and moderate are required.', $jsonOutput);
}
if (!in_array($write, ['0', '1'], true) || !in_array($moderate, ['0', '1'], true)) {
    smoke_review_policy_fail('write and moderate must be 0 or 1.', $jsonOutput);
}
$targetWrite = (int) $write;
$targetModerate = (int) $moderate;

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
    smoke_review_policy_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$defaultTable = DB::table('g5_shop_default_table');
$previous = DB::fetch(
    "SELECT de_item_use_write, de_item_use_use FROM {$defaultTable} LIMIT 1"
);

if (!$previous) {
    smoke_review_policy_fail('shop default row was not found.', $jsonOutput);
}

DB::execute(
    "UPDATE {$defaultTable}
        SET de_item_use_write = ?,
            de_item_use_use = ?",
    [$targetWrite, $targetModerate]
);

$payload = [
    'success' => true,
    'previous_write' => (int) ($previous['de_item_use_write'] ?? 0),
    'previous_moderate' => (int) ($previous['de_item_use_use'] ?? 0),
    'write' => $targetWrite,
    'moderate' => $targetModerate,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "updated review policy write={$write} moderate={$moderate}\n";
