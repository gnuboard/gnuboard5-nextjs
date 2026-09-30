<?php
/**
 * Remove local-only Youngcart personal pay rows created by Next.js checks.
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

function smoke_personalpay_cleanup_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_personalpay_cleanup_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_personalpay_cleanup_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_personalpay_cleanup_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_personalpay: {$message}\n");
    }
    exit(1);
}

$ppId = smoke_personalpay_cleanup_env_or_arg($args, 'pp-id', 'LOCAL_SMOKE_PERSONALPAY_ID', '9999999999999999');
$marker = smoke_personalpay_cleanup_env_or_arg($args, 'marker', 'LOCAL_SMOKE_PERSONALPAY_MARKER', 'nextjs-local-personalpay-smoke');

if (!preg_match('/^[0-9]{8,20}$/', $ppId)) {
    smoke_personalpay_cleanup_fail('pp id must be 8-20 digits.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_personalpay_cleanup_fail('marker must be 1-120 characters.', $jsonOutput);
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
    smoke_personalpay_cleanup_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$personalPayTable = DB::table('g5_shop_personalpay_table');
$row = DB::fetch(
    "SELECT pp_id, pp_shop_memo FROM {$personalPayTable} WHERE pp_id = ? LIMIT 1",
    [$ppId]
);

$deleted = 0;
if ($row) {
    if (strpos((string) ($row['pp_shop_memo'] ?? ''), $marker) === false) {
        smoke_personalpay_cleanup_fail("personal pay {$ppId} exists but is not marked as a smoke row.", $jsonOutput);
    }

    $deleted = DB::execute(
        "DELETE FROM {$personalPayTable} WHERE pp_id = ?",
        [$ppId]
    );
}

$payload = [
    'success' => true,
    'pp_id' => $ppId,
    'marker' => $marker,
    'deleted_personalpays' => $deleted,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deleted} smoke personal pay rows for {$ppId}.\n";
