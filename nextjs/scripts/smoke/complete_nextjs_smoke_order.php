<?php
/**
 * Complete a local-only Next.js YoungCart smoke order and run YoungCart point accrual.
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

function smoke_complete_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_complete_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_complete_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_complete_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "complete_nextjs_smoke_order: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_complete_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_LOGIN_ID', 'nextjs_smoke');
$marker = smoke_complete_env_or_arg($args, 'marker', 'LOCAL_SMOKE_ORDER_MARKER', 'nextjs-local-order-smoke');
$orderId = smoke_complete_arg_value($args, 'order-id');

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_complete_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_complete_fail('marker must be 1-120 characters.', $jsonOutput);
}
if ($orderId === null || !preg_match('/^[0-9]{8,20}$/', $orderId)) {
    smoke_complete_fail('order id must be 8-20 digits.', $jsonOutput);
}

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) {
    define('_GNUBOARD_', true);
}

ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();
require_once dirname(__DIR__, 3) . '/api/lib/DB.php';
if (!function_exists('save_order_point')) {
    require_once (defined('G5_LIB_PATH') ? G5_LIB_PATH : dirname(__DIR__, 3) . '/lib') . '/shop.lib.php';
}

$dbHost = defined('G5_MYSQL_HOST') ? strtolower((string) G5_MYSQL_HOST) : '';
$allowNonLocal = getenv('ALLOW_NONLOCAL_SMOKE_SEED') === '1';
if (!$allowNonLocal && !in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    smoke_complete_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$orderTable = DB::table('g5_shop_order_table');
$cartTable = DB::table('g5_shop_cart_table');
$pointTable = DB::table('point_table');
$completedStatus = "\xEC\x99\x84\xEB\xA3\x8C";
$cancelledStatus = "\xEC\xB7\xA8\xEC\x86\x8C";

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
    smoke_complete_fail('matching smoke order was not found.', $jsonOutput);
}
if ((string) ($order['od_status'] ?? '') === $cancelledStatus) {
    smoke_complete_fail('cancelled smoke orders cannot be completed.', $jsonOutput);
}

$cartRows = DB::fetchAll(
    "SELECT ct_id, ct_qty, ct_point
       FROM {$cartTable}
      WHERE od_id = ? AND mb_id = ?",
    [$orderId, $memberId]
);
if (!$cartRows) {
    smoke_complete_fail('matching smoke cart rows were not found.', $jsonOutput);
}

$expectedPoint = 0;
foreach ($cartRows as $row) {
    $expectedPoint += (int) ($row['ct_point'] ?? 0) * (int) ($row['ct_qty'] ?? 0);
}

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
$paidAmount = max(0, (int) ($order['od_misu'] ?? 0));
if ($paidAmount <= 0) {
    $paidAmount = (int) ($order['od_receipt_price'] ?? 0);
}
if ($paidAmount <= 0) {
    $paidAmount = $calculated;
}

$pointDays = isset($default['de_point_days']) ? (int) $default['de_point_days'] : 0;
$eligibleTime = date('Y-m-d H:i:s', time() - (86400 * ($pointDays + 1)));
$now = date('Y-m-d H:i:s');

DB::execute(
    "UPDATE {$orderTable}
        SET od_status = ?,
            od_receipt_price = ?,
            od_misu = 0,
            od_receipt_time = ?
      WHERE od_id = ? AND mb_id = ?",
    [$completedStatus, $paidAmount, $now, $orderId, $memberId]
);
DB::execute(
    "UPDATE {$cartTable}
        SET ct_status = ?,
            ct_point_use = 0,
            ct_time = ?
      WHERE od_id = ? AND mb_id = ?",
    [$completedStatus, $eligibleTime, $orderId, $memberId]
);

save_order_point($completedStatus);

$pointRows = DB::fetchAll(
    "SELECT po_id, po_content, po_point, po_rel_table, po_rel_id, po_rel_action
       FROM {$pointTable}
      WHERE mb_id = ?
        AND po_rel_table = '@delivery'
        AND po_rel_action LIKE ?
      ORDER BY po_id DESC",
    [$memberId, $orderId . ',%']
);
$awardedPoint = 0;
foreach ($pointRows as $row) {
    $awardedPoint += (int) ($row['po_point'] ?? 0);
}

$remainingUnused = DB::count(
    "SELECT COUNT(*)
       FROM {$cartTable}
      WHERE od_id = ? AND mb_id = ? AND ct_point_use = 0",
    [$orderId, $memberId]
);

$payload = [
    'success' => true,
    'order_id' => $orderId,
    'member_id' => $memberId,
    'status' => $completedStatus,
    'paid_amount' => $paidAmount,
    'expected_point' => $expectedPoint,
    'awarded_point' => $awardedPoint,
    'point_row_count' => count($pointRows),
    'point_rows' => $pointRows,
    'remaining_unused_point_rows' => (int) $remainingUnused,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Completed smoke order {$orderId}; awarded {$awardedPoint} points.\n";
