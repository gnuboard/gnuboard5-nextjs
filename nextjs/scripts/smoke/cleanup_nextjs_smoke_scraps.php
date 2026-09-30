<?php
/**
 * Remove local-only scrap smoke rows created by Next.js checks.
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

function smoke_scrap_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_scrap_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_scrap_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_scrap_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_scraps: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_scrap_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_SCRAP_LOGIN_ID', 'nextjs_scrap_smoke');

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_scrap_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
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
    smoke_scrap_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$scrapTable = DB::table('scrap_table');
$memberTable = DB::table('member_table');

$member = DB::fetch(
    "SELECT mb_id, mb_10 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
    [$memberId]
);
if ($member && (string) ($member['mb_10'] ?? '') !== 'nextjs-local-smoke') {
    smoke_scrap_fail("member {$memberId} exists but is not marked as a smoke user.", $jsonOutput);
}

$deletedScraps = DB::execute("DELETE FROM {$scrapTable} WHERE mb_id = ?", [$memberId]);
if ($member) {
    DB::execute("UPDATE {$memberTable} SET mb_scrap_cnt = 0 WHERE mb_id = ?", [$memberId]);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'deleted_scraps' => $deletedScraps,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedScraps} smoke scraps for {$memberId}.\n";
