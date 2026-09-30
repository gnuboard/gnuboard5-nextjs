<?php
/**
 * Gnuboard5 REST API - Shop Shipping
 *
 * GET /v1/shop/shipping/quote - Quote shipping fee for the current cart.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

$member = Auth::getUser();
$cart_id = shop_api_cart_id($member);
$action = isset($shopSegments[0]) ? $shopSegments[0] : '';

if (!function_exists('shop_api_shipping_extra_zipcode')) {
    function shop_api_shipping_extra_zipcode($value): string
    {
        return preg_replace('#[^0-9]#', '', (string) $value);
    }
}

if (!function_exists('shop_api_shipping_extra_cost')) {
    function shop_api_shipping_extra_cost(string $zipcode): int
    {
        if ($zipcode === '') {
            return 0;
        }

        $row = DB::fetch(
            "SELECT sc_price
               FROM " . DB::table('g5_shop_sendcost_table') . "
              WHERE sc_zip1 <= ?
                AND sc_zip2 >= ?
              LIMIT 1",
            [$zipcode, $zipcode]
        );

        return $row ? (int) ($row['sc_price'] ?? 0) : 0;
    }
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'extra') {
    $input = [];
    if ($apiMethod === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            $input = $_POST;
        }
    }

    $zipcode = '';
    if (!empty($input['zip1']) || !empty($input['zip2'])) {
        $zipcode = shop_api_shipping_extra_zipcode((string) ($input['zip1'] ?? '') . (string) $input['zip2']);
    } elseif (!empty($_GET['zip1']) || !empty($_GET['zip2'])) {
        $zipcode = shop_api_shipping_extra_zipcode((string) ($_GET['zip1'] ?? '') . (string) $_GET['zip2']);
    } else {
        $zipcode = shop_api_shipping_extra_zipcode(
            $input['zipcode']
                ?? $input['zip']
                ?? $_GET['zipcode']
                ?? $_GET['zip']
                ?? ''
        );
    }

    $extra = shop_api_shipping_extra_cost($zipcode);
    Response::success([
        'zipcode' => $zipcode,
        'extra' => $extra,
        'send_cost' => $extra,
    ]);
}

if ($apiMethod === 'GET' && $action === 'quote') {
    $zip1 = isset($_GET['zip1']) ? preg_replace('/[^0-9]/', '', (string) $_GET['zip1']) : '';
    $zip2 = isset($_GET['zip2']) ? preg_replace('/[^0-9]/', '', (string) $_GET['zip2']) : '';
    $ctIdSource = $_GET['ct_ids'] ?? null;
    $hasCtIdFilter = is_array($ctIdSource)
        ? count($ctIdSource) > 0
        : trim((string) ($ctIdSource ?? '')) !== '';
    $filterCtIds = shop_api_cart_ct_ids_from($ctIdSource);
    $directFilter = shop_api_truthy($_GET['direct'] ?? null) || shop_api_truthy($_GET['sw_direct'] ?? null);
    $filterSql = ' AND ct_direct = ' . ($directFilter ? '1' : '0');
    $params = [$cart_id];

    if ($hasCtIdFilter && empty($filterCtIds)) {
        $filterSql = ' AND 1 = 0';
    } elseif (!empty($filterCtIds)) {
        $filterSql = ' AND ct_id IN (' . implode(',', array_fill(0, count($filterCtIds), '?')) . ')';
        $params = array_merge($params, $filterCtIds);
    }

    $rows = DB::fetchAll(
        "SELECT ct_price, ct_qty, cp_price, io_type, io_price
         FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           {$filterSql}
           AND " . shop_api_cart_active_status_sql(),
        array_merge($params, shop_api_cart_active_statuses())
    );

    if (empty($rows)) {
        Response::error('Cart is empty. Add items before quoting shipping.', 400);
    }

    $itemTotal = 0;
    $couponTotal = 0;
    foreach ($rows as $row) {
        $itemTotal += shop_api_cart_line_total($row);
        $couponTotal += (int) ($row['cp_price'] ?? 0);
    }

    $quote = shop_api_send_cost($itemTotal, $zip1, $zip2);
    $base = shop_api_cart_send_cost(
        $cart_id,
        !empty($filterCtIds) ? $filterCtIds : null,
        $directFilter
    );
    $extra = (int) $quote['extra'];
    $freeThreshold = shop_api_shipping_free_threshold();

    Response::success([
        'cart_id'         => (string) $cart_id,
        'item_total'      => $itemTotal,
        'cart_coupon'     => $couponTotal,
        'zip1'            => $zip1,
        'zip2'            => $zip2,
        'base'            => $base,
        'extra'           => $extra,
        'total'           => $base + $extra,
        'free_threshold'  => $freeThreshold,
        'free_remaining'  => $freeThreshold > 0 ? max(0, $freeThreshold - $itemTotal) : 0,
        'policy'          => shop_api_policy_summary(),
    ]);
}

Response::error('Method not allowed.', 405);
