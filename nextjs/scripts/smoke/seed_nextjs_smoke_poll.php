<?php
/**
 * Seed a local-only poll row for Next.js poll flow checks.
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

function smoke_poll_seed_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_poll_seed_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_poll_seed_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_poll_seed_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "seed_nextjs_smoke_poll: {$message}\n");
    }
    exit(1);
}

$marker = smoke_poll_seed_env_or_arg($args, 'marker', 'LOCAL_SMOKE_POLL_MARKER', 'nextjs-local-poll-smoke');
$subject = smoke_poll_seed_env_or_arg($args, 'subject', 'LOCAL_SMOKE_POLL_SUBJECT', $marker . ' question');
$optionOne = smoke_poll_seed_env_or_arg($args, 'option-one', 'LOCAL_SMOKE_POLL_OPTION_ONE', $marker . ' option alpha');
$optionTwo = smoke_poll_seed_env_or_arg($args, 'option-two', 'LOCAL_SMOKE_POLL_OPTION_TWO', $marker . ' option beta');
$commentPrompt = smoke_poll_seed_env_or_arg($args, 'comment-prompt', 'LOCAL_SMOKE_POLL_COMMENT_PROMPT', $marker . ' opinions');

if ($marker === '' || strlen($marker) > 120) {
    smoke_poll_seed_fail('marker must be 1-120 characters.', $jsonOutput);
}
foreach ([
    'subject' => $subject,
    'option one' => $optionOne,
    'option two' => $optionTwo,
    'comment prompt' => $commentPrompt,
] as $label => $value) {
    if ($value === '' || strlen($value) > 255) {
        smoke_poll_seed_fail("{$label} must be 1-255 characters.", $jsonOutput);
    }
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
    smoke_poll_seed_fail('refusing to seed a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$pollTable = DB::table('poll_table');
$pollEtcTable = DB::table('poll_etc_table');
$today = date('Y-m-d');

$existing = DB::fetch(
    "SELECT po_id FROM {$pollTable} WHERE po_subject = ? LIMIT 1",
    [$subject]
);

if ($existing) {
    $poId = (int) $existing['po_id'];
    DB::execute("DELETE FROM {$pollEtcTable} WHERE po_id = ?", [$poId]);
    DB::execute(
        "UPDATE {$pollTable}
            SET po_subject = ?,
                po_poll1 = ?,
                po_poll2 = ?,
                po_poll3 = '',
                po_poll4 = '',
                po_poll5 = '',
                po_poll6 = '',
                po_poll7 = '',
                po_poll8 = '',
                po_poll9 = '',
                po_cnt1 = 0,
                po_cnt2 = 0,
                po_cnt3 = 0,
                po_cnt4 = 0,
                po_cnt5 = 0,
                po_cnt6 = 0,
                po_cnt7 = 0,
                po_cnt8 = 0,
                po_cnt9 = 0,
                po_etc = ?,
                po_level = 1,
                po_point = 0,
                po_date = ?,
                po_ips = '',
                mb_ids = '',
                po_use = 1
          WHERE po_id = ?",
        [$subject, $optionOne, $optionTwo, $commentPrompt, $today, $poId]
    );
    $action = 'updated';
} else {
    DB::execute(
        "INSERT INTO {$pollTable}
            (po_subject, po_poll1, po_poll2, po_poll3, po_poll4, po_poll5,
             po_poll6, po_poll7, po_poll8, po_poll9, po_cnt1, po_cnt2,
             po_cnt3, po_cnt4, po_cnt5, po_cnt6, po_cnt7, po_cnt8, po_cnt9,
             po_etc, po_level, po_point, po_date, po_ips, mb_ids, po_use)
         VALUES (?, ?, ?, '', '', '', '', '', '', '', 0, 0, 0, 0, 0, 0, 0, 0, 0,
                 ?, 1, 0, ?, '', '', 1)",
        [$subject, $optionOne, $optionTwo, $commentPrompt, $today]
    );
    $poId = (int) DB::lastInsertId();
    $action = 'created';
}

$payload = [
    'success' => true,
    'action' => $action,
    'po_id' => $poId,
    'marker' => $marker,
    'subject' => $subject,
    'option_one' => $optionOne,
    'option_two' => $optionTwo,
    'comment_prompt' => $commentPrompt,
    'date' => $today,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "{$action} smoke poll {$poId}.\n";
