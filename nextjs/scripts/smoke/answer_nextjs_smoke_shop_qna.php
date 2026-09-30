<?php
/**
 * Mark a local-only YoungCart shop Q&A smoke row as answered.
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

function smoke_shop_qna_answer_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_shop_qna_answer_env(string $name, string $default): string
{
    $value = getenv($name);
    return is_string($value) && $value !== '' ? $value : $default;
}

function smoke_shop_qna_answer_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "answer_nextjs_smoke_shop_qna: {$message}\n");
    }
    exit(1);
}

$iqId = smoke_shop_qna_answer_arg_value($args, 'iq-id');
$answer = smoke_shop_qna_answer_arg_value($args, 'answer');
$memberId = smoke_shop_qna_answer_env('LOCAL_SMOKE_LOGIN_ID', 'nextjs_shop_smoke');
$itemId = smoke_shop_qna_answer_env('LOCAL_SMOKE_SHOP_PRODUCT_ID', '1446772772');
$marker = smoke_shop_qna_answer_env('LOCAL_SMOKE_SHOP_CONTENT_MARKER', 'nextjs-local-shop-content-smoke');

if ($iqId === null || !preg_match('/^[1-9][0-9]*$/', $iqId)) {
    smoke_shop_qna_answer_fail('iq-id must be a positive integer.', $jsonOutput);
}
if ($answer === null || trim($answer) === '') {
    smoke_shop_qna_answer_fail('answer is required.', $jsonOutput);
}
if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_shop_qna_answer_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($itemId === '' || strlen($itemId) > 100) {
    smoke_shop_qna_answer_fail('item id must be 1-100 characters.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_shop_qna_answer_fail('marker must be 1-120 characters.', $jsonOutput);
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
    smoke_shop_qna_answer_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$qaTable = DB::table('g5_shop_item_qa_table');
$row = DB::fetch(
    "SELECT iq_id, it_id, mb_id, iq_subject, iq_question
       FROM {$qaTable}
      WHERE iq_id = ?
        AND it_id = ?
        AND mb_id = ?
      LIMIT 1",
    [(int) $iqId, $itemId, $memberId]
);

if (!$row) {
    smoke_shop_qna_answer_fail('smoke Q&A row was not found.', $jsonOutput);
}
if (strpos((string) ($row['iq_subject'] ?? ''), $marker) === false
    && strpos((string) ($row['iq_question'] ?? ''), $marker) === false) {
    smoke_shop_qna_answer_fail('refusing to answer a Q&A row without the smoke marker.', $jsonOutput);
}

DB::execute(
    "UPDATE {$qaTable}
        SET iq_answer = ?
      WHERE iq_id = ?
        AND it_id = ?
        AND mb_id = ?",
    [$answer, (int) $iqId, $itemId, $memberId]
);

$payload = [
    'success' => true,
    'iq_id' => (int) $iqId,
    'member_id' => $memberId,
    'item_id' => $itemId,
    'answered' => true,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Answered smoke shop Q&A {$iqId}.\n";
