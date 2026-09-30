<?php
/**
 * Remove local-only 1:1 Q&A rows created by Next.js mypage Q&A checks.
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

function smoke_qa_cleanup_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_qa_cleanup_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_qa_cleanup_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_qa_cleanup_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_qas: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_qa_cleanup_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_QA_LOGIN_ID', 'nextjs_qa_smoke');
$marker = smoke_qa_cleanup_env_or_arg($args, 'marker', 'LOCAL_SMOKE_QA_MARKER', 'nextjs-local-qa-smoke');

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_qa_cleanup_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_qa_cleanup_fail('marker must be 1-120 characters.', $jsonOutput);
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
    smoke_qa_cleanup_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$memberTable = DB::table('member_table');
$qaTable = DB::table('qa_content_table');

$member = DB::fetch(
    "SELECT mb_id, mb_10 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
    [$memberId]
);
if ($member && (string) ($member['mb_10'] ?? '') !== 'nextjs-local-smoke') {
    smoke_qa_cleanup_fail("member {$memberId} exists but is not marked as a smoke user.", $jsonOutput);
}

$likeMarker = '%' . $marker . '%';
$questions = DB::fetchAll(
    "SELECT qa_id FROM {$qaTable}
      WHERE qa_type = 0
        AND mb_id = ?
        AND (qa_subject LIKE ? OR qa_content LIKE ? OR qa_5 = ?)",
    [$memberId, $likeMarker, $likeMarker, $marker]
);
$questionIds = array_values(array_map(static fn($row) => (int) $row['qa_id'], $questions));

$deletedAnswers = 0;
$deletedQuestions = 0;

DB::beginTransaction();
try {
    if (count($questionIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($questionIds), '?'));
        $deletedAnswers = DB::execute(
            "DELETE FROM {$qaTable} WHERE qa_type = 1 AND qa_parent IN ({$placeholders})",
            $questionIds
        );
        $deletedQuestions = DB::execute(
            "DELETE FROM {$qaTable} WHERE qa_type = 0 AND qa_id IN ({$placeholders})",
            $questionIds
        );
    }
    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_qa_cleanup_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'marker' => $marker,
    'deleted_questions' => $deletedQuestions,
    'deleted_answers' => $deletedAnswers,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedQuestions} smoke Q&A questions and {$deletedAnswers} answers for {$memberId}.\n";
