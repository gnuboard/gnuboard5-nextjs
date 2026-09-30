<?php
/**
 * Remove local-only poll rows created by Next.js poll checks.
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

function smoke_poll_cleanup_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_poll_cleanup_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_poll_cleanup_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_poll_cleanup_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_polls: {$message}\n");
    }
    exit(1);
}

$marker = smoke_poll_cleanup_env_or_arg($args, 'marker', 'LOCAL_SMOKE_POLL_MARKER', 'nextjs-local-poll-smoke');
$subject = smoke_poll_cleanup_env_or_arg($args, 'subject', 'LOCAL_SMOKE_POLL_SUBJECT', $marker . ' question');

if ($marker === '' || strlen($marker) > 120) {
    smoke_poll_cleanup_fail('marker must be 1-120 characters.', $jsonOutput);
}
if ($subject === '' || strlen($subject) > 255) {
    smoke_poll_cleanup_fail('subject must be 1-255 characters.', $jsonOutput);
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
    smoke_poll_cleanup_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$pollTable = DB::table('poll_table');
$pollEtcTable = DB::table('poll_etc_table');
$likeMarker = '%' . $marker . '%';

$rows = DB::fetchAll(
    "SELECT po_id FROM {$pollTable} WHERE po_subject = ? OR po_subject LIKE ?",
    [$subject, $likeMarker]
);
$pollIds = array_values(array_map(static fn($row) => (int) $row['po_id'], $rows));

$deletedComments = 0;
$deletedPolls = 0;

if (count($pollIds) > 0) {
    $placeholders = implode(',', array_fill(0, count($pollIds), '?'));
    $deletedComments = DB::execute(
        "DELETE FROM {$pollEtcTable} WHERE po_id IN ({$placeholders})",
        $pollIds
    );
    $deletedPolls = DB::execute(
        "DELETE FROM {$pollTable} WHERE po_id IN ({$placeholders})",
        $pollIds
    );
}

$payload = [
    'success' => true,
    'marker' => $marker,
    'subject' => $subject,
    'deleted_comments' => $deletedComments,
    'deleted_polls' => $deletedPolls,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedPolls} smoke polls and {$deletedComments} smoke poll comments.\n";
