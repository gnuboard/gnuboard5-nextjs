<?php
/**
 * Mark a local-only Next.js YoungCart smoke order as paid.
 *
 * This helper is intentionally narrow: it only touches orders owned by the
 * smoke member and containing the smoke marker in memo fields.
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

function smoke_paid_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_paid_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_paid_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_paid_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "mark_nextjs_smoke_order_paid: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_paid_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_LOGIN_ID', 'nextjs_smoke');
$marker = smoke_paid_env_or_arg($args, 'marker', 'LOCAL_SMOKE_ORDER_MARKER', 'nextjs-local-order-smoke');
$orderId = smoke_paid_arg_value($args, 'order-id');
$statusOption = strtolower((string) (smoke_paid_arg_value($args, 'status') ?? 'paid'));
$withTossReceipt = in_array('--with-toss-receipt', $args, true);
$withTossCashReceipt = in_array('--with-toss-cash-receipt', $args, true);
$withDelivery = in_array('--with-delivery', $args, true);

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_paid_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_paid_fail('marker must be 1-120 characters.', $jsonOutput);
}
if ($orderId === null || !preg_match('/^[0-9]{8,20}$/', $orderId)) {
    smoke_paid_fail('order id must be 8-20 digits.', $jsonOutput);
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
    smoke_paid_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$orderTable = DB::table('g5_shop_order_table');
$cartTable = DB::table('g5_shop_cart_table');
$orderedStatus = "\xEC\xA3\xBC\xEB\xAC\xB8";
$paidStatus = "\xEC\x9E\x85\xEA\xB8\x88";
$shippingStatus = "\xEB\xB0\xB0\xEC\x86\xA1";
$completedStatus = "\xEC\x99\x84\xEB\xA3\x8C";
$creditCardSettleCase = "\xEC\x8B\xA0\xEC\x9A\xA9\xEC\xB9\xB4\xEB\x93\x9C";
$transferSettleCase = "\xEA\xB3\x84\xEC\xA2\x8C\xEC\x9D\xB4\xEC\xB2\xB4";

$targetStatuses = [
    'paid' => $paidStatus,
    'shipping' => $shippingStatus,
    'completed' => $completedStatus,
];
if (!isset($targetStatuses[$statusOption])) {
    smoke_paid_fail('status must be one of paid, shipping, or completed.', $jsonOutput);
}
$targetStatus = $targetStatuses[$statusOption];

$order = DB::fetch(
    "SELECT *
       FROM {$orderTable}
      WHERE od_id = ?
        AND mb_id = ?
        AND (od_memo LIKE ? OR od_shop_memo LIKE ?)
      LIMIT 1",
    [$orderId, $memberId, '%' . $marker . '%', '%' . $marker . '%']
);
if (!$order) {
    smoke_paid_fail('matching smoke order was not found.', $jsonOutput);
}
if ((string) ($order['od_status'] ?? '') !== $orderedStatus) {
    smoke_paid_fail('smoke order must be in ordered status before marking paid.', $jsonOutput);
}

$misu = max(0, (int) ($order['od_misu'] ?? 0));
$receipt = max(0, (int) ($order['od_receipt_price'] ?? 0));
$calculated = max(
    0,
    (int) ($order['od_cart_price'] ?? 0)
    + (int) ($order['od_send_cost'] ?? 0)
    + (int) ($order['od_send_cost2'] ?? 0)
    - (int) ($order['od_cart_coupon'] ?? 0)
    - (int) ($order['od_coupon'] ?? 0)
    - (int) ($order['od_send_coupon'] ?? 0)
    - (int) ($order['od_receipt_point'] ?? 0)
    - (int) ($order['od_cancel_price'] ?? 0)
);
$paidAmount = $misu > 0 ? $misu : ($receipt > 0 ? $receipt : $calculated);
if ($paidAmount <= 0) {
    smoke_paid_fail('smoke order has no payable amount.', $jsonOutput);
}

DB::beginTransaction();
try {
    $sets = [
        'od_status = ?',
        'od_receipt_price = ?',
        'od_misu = 0',
        'od_receipt_time = ?',
    ];
    $params = [$targetStatus, $paidAmount, date('Y-m-d H:i:s')];
    $tno = '';
    $appNo = '';
    $cashNo = '';
    $cashReceiptUrl = '';
    $invoice = '';
    $deliveryCompany = '';

    if ($withTossReceipt || $withTossCashReceipt) {
        $tno = 'smoke_toss_' . $orderId;
        $appNo = 'SMOKEAPP' . substr($orderId, -6);
        $sets[] = 'od_pg = ?';
        $params[] = 'toss';
        $sets[] = 'od_settle_case = ?';
        $params[] = $withTossCashReceipt ? $transferSettleCase : $creditCardSettleCase;
        $sets[] = 'od_tno = ?';
        $params[] = $tno;
        $sets[] = 'od_app_no = ?';
        $params[] = $appNo;
    }

    if ($withTossCashReceipt) {
        $cashNo = 'SMOKECASH' . substr($orderId, -6);
        $cashReceiptUrl = 'https://dashboard.tosspayments.com/receipt/smoke-cash?transactionId='
            . rawurlencode($tno)
            . '&orderId='
            . rawurlencode($orderId);
        $cashInfo = serialize([
            'TID' => $tno,
            'ApplNum' => $cashNo,
            'receiptUrl' => $cashReceiptUrl,
        ]);
        $sets[] = 'od_cash = 1';
        $sets[] = 'od_cash_no = ?';
        $params[] = $cashNo;
        $sets[] = 'od_cash_info = ?';
        $params[] = $cashInfo;
    }

    if ($withDelivery) {
        $deliveryCompany = 'Smoke Courier';
        $invoice = 'SMOKE' . $orderId;
        $sets[] = 'od_delivery_company = ?';
        $params[] = $deliveryCompany;
        $sets[] = 'od_invoice = ?';
        $params[] = $invoice;
        $sets[] = 'od_invoice_time = ?';
        $params[] = date('Y-m-d H:i:s');
    }

    $params[] = $orderId;
    $params[] = $memberId;
    DB::execute(
        "UPDATE {$orderTable}
            SET " . implode(', ', $sets) . "
          WHERE od_id = ? AND mb_id = ?",
        $params
    );
    DB::execute(
        "UPDATE {$cartTable}
            SET ct_status = ?
          WHERE od_id = ?",
        [$targetStatus, $orderId]
    );
    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_paid_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'order_id' => $orderId,
    'member_id' => $memberId,
    'status' => $targetStatus,
    'paid_amount' => $paidAmount,
    'tno' => $tno,
    'app_no' => $appNo,
    'cash_no' => $cashNo,
    'cash_receipt_url' => $cashReceiptUrl,
    'delivery_company' => $deliveryCompany,
    'invoice' => $invoice,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Marked smoke order {$orderId} as paid.\n";
