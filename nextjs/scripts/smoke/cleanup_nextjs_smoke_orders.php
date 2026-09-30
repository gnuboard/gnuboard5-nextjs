<?php
/**
 * Remove local-only Youngcart smoke orders created by Next.js order checks.
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

function smoke_order_cleanup_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_order_cleanup_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_order_cleanup_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_order_cleanup_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "cleanup_nextjs_smoke_orders: {$message}\n");
    }
    exit(1);
}

function smoke_order_cleanup_table_exists(string $table): bool
{
    return DB::count(
        'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [$table]
    ) > 0;
}

$memberId = smoke_order_cleanup_env_or_arg($args, 'member-id', 'LOCAL_SMOKE_LOGIN_ID', 'nextjs_smoke');
$marker = smoke_order_cleanup_env_or_arg($args, 'marker', 'LOCAL_SMOKE_ORDER_MARKER', 'nextjs-local-order-smoke');
$orderId = smoke_order_cleanup_arg_value($args, 'order-id');
$includeGuests = in_array('--include-guests', $args, true)
    || getenv('LOCAL_SMOKE_INCLUDE_GUEST_ORDERS') === '1';

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_order_cleanup_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_order_cleanup_fail('marker must be 1-120 characters.', $jsonOutput);
}
if ($orderId !== null && !preg_match('/^[0-9]{8,20}$/', $orderId)) {
    smoke_order_cleanup_fail('order id must be 8-20 digits.', $jsonOutput);
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
    smoke_order_cleanup_fail('refusing to clean a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$orderTable = DB::table('g5_shop_order_table');
$cartTable = DB::table('g5_shop_cart_table');
$itemTable = DB::table('g5_shop_item_table');
$optionTable = DB::table('g5_shop_item_option_table');
$couponLogTable = DB::table('g5_shop_coupon_log_table');
$pointTable = DB::table('point_table');
$memberTable = DB::table('member_table');
$orderDataTable = DB::table('g5_shop_order_data_table');
$cancelledStatus = "\xEC\xB7\xA8\xEC\x86\x8C";

$ownerWhere = $includeGuests ? "(mb_id = ? OR mb_id = '')" : 'mb_id = ?';
$where = "{$ownerWhere} AND (od_memo LIKE ? OR od_shop_memo LIKE ?)";
$params = [$memberId, '%' . $marker . '%', '%' . $marker . '%'];
if ($orderId !== null) {
    $where .= ' AND od_id = ?';
    $params[] = $orderId;
}

$orders = DB::fetchAll(
    "SELECT od_id, od_status FROM {$orderTable} WHERE {$where}",
    $params
);

$deletedOrders = 0;
$deletedCartRows = 0;
$restoredStockRows = 0;

DB::beginTransaction();
try {
    foreach ($orders as $order) {
        $odId = (string) $order['od_id'];
        $cartRows = DB::fetchAll(
            "SELECT ct_id, it_id, ct_qty, ct_option, io_id, io_type, ct_status FROM {$cartTable} WHERE od_id = ?",
            [$odId]
        );

        foreach ($cartRows as $row) {
            if ((string) ($row['ct_status'] ?? '') === $cancelledStatus) {
                continue;
            }

            $qty = (int) ($row['ct_qty'] ?? 0);
            if ($qty <= 0) {
                continue;
            }

            $optionId = trim((string) ($row['io_id'] ?? ''));
            $optionType = (int) ($row['io_type'] ?? 0);
            if ($optionId !== '') {
                DB::execute(
                    "UPDATE {$optionTable} SET io_stock_qty = io_stock_qty + ? WHERE it_id = ? AND io_id = ? AND io_type = ?",
                    [$qty, $row['it_id'], $optionId, $optionType]
                );
                $restoredStockRows++;
            } else {
                DB::execute(
                    "UPDATE {$itemTable} SET it_stock_qty = it_stock_qty + ? WHERE it_id = ?",
                    [$qty, $row['it_id']]
                );
                $restoredStockRows++;
            }
        }

        if (smoke_order_cleanup_table_exists($couponLogTable)) {
            $couponOwnerWhere = $includeGuests ? "(mb_id = ? OR mb_id = '')" : 'mb_id = ?';
            DB::execute(
                "DELETE FROM {$couponLogTable} WHERE od_id = ? AND {$couponOwnerWhere}",
                [$odId, $memberId]
            );
        }
        if (smoke_order_cleanup_table_exists($pointTable)) {
            $orderPointPrefix = "\xEC\xA3\xBC\xEB\xAC\xB8\xEB\xB2\x88\xED\x98\xB8 " . $odId . ' %';
            DB::execute(
                "DELETE FROM {$pointTable}
                  WHERE mb_id = ?
                    AND (
                      (po_rel_id = ? AND po_rel_table IN ('@order', '@shop_buy', '@shop_order'))
                      OR (po_rel_table = '@delivery' AND po_rel_action LIKE ?)
                      OR po_content LIKE ?
                    )",
                [$memberId, $odId, $odId . ',%', $orderPointPrefix]
            );
            $pointSum = DB::fetch(
                "SELECT COALESCE(SUM(po_point), 0) AS point_sum FROM {$pointTable} WHERE mb_id = ?",
                [$memberId]
            );
            DB::execute(
                "UPDATE {$memberTable} SET mb_point = ? WHERE mb_id = ?",
                [(int) ($pointSum['point_sum'] ?? 0), $memberId]
            );
        }
        if (smoke_order_cleanup_table_exists($orderDataTable)) {
            DB::execute("DELETE FROM {$orderDataTable} WHERE od_id = ?", [$odId]);
        }

        $deletedCartRows += DB::execute("DELETE FROM {$cartTable} WHERE od_id = ?", [$odId]);
        $deleteOwnerWhere = $includeGuests ? "(mb_id = ? OR mb_id = '')" : 'mb_id = ?';
        $deletedOrders += DB::execute(
            "DELETE FROM {$orderTable} WHERE od_id = ? AND {$deleteOwnerWhere}",
            [$odId, $memberId]
        );
    }
    DB::commit();
} catch (Throwable $e) {
    DB::rollBack();
    smoke_order_cleanup_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'member_id' => $memberId,
    'include_guests' => $includeGuests,
    'marker' => $marker,
    'deleted_orders' => $deletedOrders,
    'deleted_cart_rows' => $deletedCartRows,
    'restored_stock_rows' => $restoredStockRows,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Deleted {$deletedOrders} smoke orders for {$memberId}.\n";
