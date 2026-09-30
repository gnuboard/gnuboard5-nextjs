<?php
/**
 * Mark the local-only Next.js smoke personal pay row as paid.
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
$asProcessing = in_array('--processing', $args, true);
$withTossReceipt = in_array('--with-toss-receipt', $args, true);
$withTossCashReceipt = in_array('--with-toss-cash-receipt', $args, true);

function smoke_personalpay_mark_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_personalpay_mark_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_personalpay_mark_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_personalpay_mark_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "mark_nextjs_smoke_personalpay_paid: {$message}\n");
    }
    exit(1);
}

$ppId = smoke_personalpay_mark_env_or_arg($args, 'pp-id', 'LOCAL_SMOKE_PERSONALPAY_ID', '9999999999999999');
$marker = smoke_personalpay_mark_env_or_arg($args, 'marker', 'LOCAL_SMOKE_PERSONALPAY_MARKER', 'nextjs-local-personalpay-smoke');

if (!preg_match('/^[0-9]{8,20}$/', $ppId)) {
    smoke_personalpay_mark_fail('pp id must be 8-20 digits.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_personalpay_mark_fail('marker must be 1-120 characters.', $jsonOutput);
}
if ($asProcessing && ($withTossReceipt || $withTossCashReceipt)) {
    smoke_personalpay_mark_fail('--processing cannot be combined with paid receipt options.', $jsonOutput);
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
    smoke_personalpay_mark_fail('refusing to mark a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$personalPayTable = DB::table('g5_shop_personalpay_table');
$row = DB::fetch(
    "SELECT * FROM {$personalPayTable} WHERE pp_id = ? LIMIT 1",
    [$ppId]
);

if (!$row) {
    smoke_personalpay_mark_fail("personal pay {$ppId} was not found.", $jsonOutput);
}
if (strpos((string) ($row['pp_shop_memo'] ?? ''), $marker) === false) {
    smoke_personalpay_mark_fail("personal pay {$ppId} exists but is not marked as a smoke row.", $jsonOutput);
}

$rowPrice = (int) ($row['pp_price'] ?? 0);
if ($rowPrice <= 0) {
    smoke_personalpay_mark_fail('personal pay price must be positive.', $jsonOutput);
}

$tno = 'NEXTJS_PP_TOSS_' . substr(hash('sha256', $ppId . '|' . $marker), 0, 24);
$appNo = $asProcessing ? '' : 'PPAPP' . substr(hash('crc32b', $ppId . $marker), 0, 8);
$receiptTime = $asProcessing ? '1000-01-01 00:00:00' : date('Y-m-d H:i:s');
$receiptPrice = $asProcessing ? 0 : $rowPrice;
$cashNo = '';
$cashInfo = '';
$cashReceiptUrl = '';
$settleCase = $asProcessing ? '가상계좌' : ($withTossCashReceipt ? '계좌이체' : '신용카드');
$cashFlag = 0;

if ($withTossCashReceipt) {
    $cashFlag = 1;
    $cashNo = 'PPCR' . substr(hash('crc32b', 'cash|' . $ppId . '|' . $marker), 0, 8);
    $cashReceiptUrl = 'https://dashboard.tosspayments.com/receipt/cash-receipts/' . rawurlencode($cashNo);
    $cashInfo = serialize([
        'TID' => 'PP_CASH_' . substr(hash('sha256', 'cash|' . $ppId), 0, 20),
        'ApplNum' => $cashNo,
        'AuthDate' => date('YmdHis'),
        'receiptUrl' => $cashReceiptUrl,
    ]);
}

$pg = (!$asProcessing && ($withTossReceipt || $withTossCashReceipt)) ? 'toss' : 'kcp';

DB::execute(
    "UPDATE {$personalPayTable}
        SET pp_pg = ?,
            pp_tno = ?,
            pp_app_no = ?,
            pp_receipt_price = ?,
            pp_settle_case = ?,
            pp_receipt_time = ?,
            pp_receipt_ip = '127.0.0.1',
            pp_cash = ?,
            pp_cash_no = ?,
            pp_cash_info = ?
      WHERE pp_id = ?",
    [
        $pg,
        $tno,
        $appNo,
        $receiptPrice,
        $settleCase,
        $receiptTime,
        $cashFlag,
        $cashNo,
        $cashInfo,
        $ppId,
    ]
);

$payload = [
    'success' => true,
    'pp_id' => $ppId,
    'pg' => $pg,
    'tno' => $tno,
    'app_no' => $appNo,
    'price' => $receiptPrice,
    'row_price' => $rowPrice,
    'settle_case' => $settleCase,
    'receipt_time' => $receiptTime,
    'processing' => $asProcessing,
    'cash_no' => $cashNo,
    'cash_receipt_url' => $cashReceiptUrl,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Marked smoke personal pay {$ppId} as paid.\n";
