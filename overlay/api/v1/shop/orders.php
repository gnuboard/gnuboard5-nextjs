<?php
/**
 * Gnuboard5 REST API - Shop Orders
 *
 * GET   /v1/shop/orders            - List my orders
 * GET   /v1/shop/orders/{od_id}    - Order detail
 * POST  /v1/shop/orders            - Create order from cart
 * PATCH /v1/shop/orders/{od_id}    - Cancel order
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/coupon_markers.php';
$member  = Auth::getUser();
$mb_id   = !empty($member['mb_id']) ? $member['mb_id'] : '';
$cart_id = shop_api_cart_id($member);
$od_id   = isset($shopSegments[0]) ? $shopSegments[0] : '';

require_once __DIR__ . '/orders_helpers.php';

// =========================================================================
// GET|POST /v1/shop/orders/legacy-data - YoungCart ajax.orderdatasave.php compatible action
// =========================================================================
if ($apiMethod === 'POST' && $od_id === 'legacy-data') {
    $input = shop_orders_legacy_input();

    if (empty($input)) {
        Response::error('Order data is empty.', 422);
    }

    $isPersonalpay = !empty($input['pp_id']);
    if ($isPersonalpay) {
        $sessionPersonalpayId = shop_orders_legacy_order_id(get_session('ss_personalpay_id'));
        $requestedPersonalpayId = shop_orders_legacy_order_id($input['pp_id'] ?? '');
        if ($sessionPersonalpayId === '' || ($requestedPersonalpayId !== '' && $requestedPersonalpayId !== $sessionPersonalpayId)) {
            Response::error('Forbidden.', 403);
        }

        $legacyOrderId = $sessionPersonalpayId;
        $legacyCartId = '0';
    } else {
        $sessionOrderId = shop_orders_legacy_order_id(get_session('ss_order_id'));
        $requestedOrderId = shop_orders_legacy_order_id($input['od_id'] ?? '');
        if ($requestedOrderId !== '' && ($sessionOrderId === '' || $requestedOrderId !== $sessionOrderId)) {
            Response::error('Forbidden.', 403);
        }

        $legacyOrderId = $sessionOrderId;
        if ($legacyOrderId === '') {
            $legacyOrderId = shop_api_new_cart_id();
        }
        $legacyCartId = $cart_id;
        set_session('ss_order_id', $legacyOrderId);
        set_session('ss_cart_id', $cart_id);

        $input['sw_direct'] = !empty($input['sw_direct']) ? $input['sw_direct'] : get_session('ss_direct');
        $input['od_ip'] = $_SERVER['REMOTE_ADDR'] ?? '';
        $input['cart_id'] = $cart_id;
    }

    $config = shop_orders_payment_config();
    $defaultPg = (string) ($config['de_pg_service'] ?? '');
    $settleCase = trim((string) ($input['od_settle_case'] ?? ''));
    if ($settleCase === '삼성페이' || strtolower($settleCase) === 'samsungpay') {
        $defaultPg = 'inicis';
    }

    DB::execute(
        "DELETE FROM " . DB::table('g5_shop_order_data_table') . "
         WHERE od_id = ?",
        [$legacyOrderId]
    );

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_order_data_table') . "
         SET od_id = ?,
             cart_id = ?,
             mb_id = ?,
             dt_pg = ?,
             dt_data = ?,
             dt_time = ?",
        [
            $legacyOrderId,
            $legacyCartId,
            $mb_id,
            $defaultPg,
            base64_encode(serialize($input)),
            date('Y-m-d H:i:s'),
        ]
    );

    Response::success([
        'ok' => true,
        'od_id' => $legacyOrderId,
        'cart_id' => $legacyCartId,
    ]);
}

// =========================================================================
// GET /v1/shop/orders - List my orders
// =========================================================================
if ($apiMethod === 'GET' && $od_id === '') {
    if (!$member) {
        Response::error('Unauthorized. Please provide a valid access token.', 401);
    }

    [$page, $perPage, $offset] = api_page_params(20, 100);

    // SC-08: status/q 필터 — 지원하지 않는 status 는 422(예전처럼 조용히 전체 목록을 주지 않는다).
    $filter = shop_orders_list_filter(
        trim((string) ($_GET['status'] ?? '')),
        (string) ($_GET['q'] ?? '')
    );
    if ($filter === null) {
        Response::error('Validation failed.', 422, ['status' => 'unsupported']);
    }
    $orderTable = DB::table('g5_shop_order_table');
    $whereSql = 'mb_id = ?' . $filter['sql'];
    $whereParams = array_merge([$mb_id], $filter['params']);

    // Count
    $total = DB::count(
        "SELECT COUNT(*) FROM {$orderTable}
         WHERE {$whereSql}",
        $whereParams
    );

    // Fetch orders
    $orderRows = DB::fetchAll(
        "SELECT od_id, od_name, od_tel, od_hp,
                od_zip1, od_zip2, od_addr1, od_addr2, od_addr3,
                od_receipt_price, od_send_cost, od_status, od_receipt_time,
                od_time, od_settle_case, od_pg, od_cart_count, od_cart_price,
                od_cart_coupon, od_coupon, od_send_cost2, od_send_coupon,
                od_receipt_point, od_cancel_price, od_misu, od_refund_price
         FROM {$orderTable}
         WHERE {$whereSql}
         ORDER BY od_id DESC
         LIMIT ?, ?",
        array_merge($whereParams, [$offset, $perPage])
    );

    // 주문 상품은 한 번에(N+1 제거, SC-08) — od_id 별로 묶는다.
    $itemsByOrder = [];
    $orderIds = array_map(static fn($row) => (string) $row['od_id'], $orderRows);
    if ($orderIds) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        $itemRows = DB::fetchAll(
            "SELECT c.od_id, c.ct_id, c.it_id, c.it_name, c.ct_price, c.ct_qty, c.ct_option, c.ct_status, c.ct_stock_use,
                    c.io_type, c.io_price, c.ct_send_cost, c.it_sc_type, c.it_sc_method,
                    c.it_sc_price, c.it_sc_minimum, c.it_sc_qty,
                    i.it_img1, i.it_seo_title
             FROM " . DB::table('g5_shop_cart_table') . " c
             LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = c.it_id
             WHERE c.od_id IN ({$placeholders})
               AND c.mb_id = ?
             ORDER BY c.od_id DESC, c.ct_id ASC",
            array_merge($orderIds, [$mb_id])
        );
        foreach ($itemRows as $itemRow) {
            $itemsByOrder[(string) $itemRow['od_id']][] = $itemRow;
        }
    }

    $orders = [];
    foreach ($orderRows as $row) {
        $orderItems = $itemsByOrder[(string) $row['od_id']] ?? [];

        $formattedItems = [];
        foreach ($orderItems as $oi) {
            $formattedItems[] = [
                'ct_id'     => $oi['ct_id'],
                'it_id'     => $oi['it_id'],
                'it_name'   => $oi['it_name'],
                'it_seo_title' => $oi['it_seo_title'] ?? '',
                'ct_price'  => shop_api_cart_unit_price($oi),
                'ct_base_price' => (int) $oi['ct_price'],
                'ct_qty'    => (int) $oi['ct_qty'],
                'ct_option' => $oi['ct_option'],
                'ct_status' => $oi['ct_status'],
                'ct_stock_use' => (int) ($oi['ct_stock_use'] ?? 0),
                'io_type'   => (int) ($oi['io_type'] ?? 0),
                'io_price'  => (int) ($oi['io_price'] ?? 0),
                'ct_send_cost' => (int) ($oi['ct_send_cost'] ?? 0),
                'it_sc_type' => (int) ($oi['it_sc_type'] ?? 0),
                'it_sc_method' => (int) ($oi['it_sc_method'] ?? 0),
                'it_sc_price' => (int) ($oi['it_sc_price'] ?? 0),
                'it_sc_minimum' => (int) ($oi['it_sc_minimum'] ?? 0),
                'it_sc_qty' => (int) ($oi['it_sc_qty'] ?? 0),
                'line_total' => shop_api_cart_line_total($oi),
                'image_url' => !empty($oi['it_img1'])
                    ? api_image_url_with_width(api_shop_item_image_url($oi['it_id'], $oi['it_img1']), 240)
                    : '',
            ];
        }
        $cancelState = shop_orders_customer_cancel_state($row, $orderItems, true);
        $listPrice = shop_orders_list_price($row);
        $totalPrice = shop_orders_total_price($row);
        $receiptTotal = shop_orders_receipt_total($row);
        $misuPrice = shop_orders_misu_price($row);

        $orders[] = [
            'od_id'            => (string) $row['od_id'],
            'od_name'          => $row['od_name'],
            'od_zip'           => trim((string) $row['od_zip1'] . (string) $row['od_zip2']),
            'od_receipt_price' => (int) $row['od_receipt_price'],
            'od_settle_case'   => $row['od_settle_case'] ?? '',
            'od_pg'            => $row['od_pg'] ?? '',
            'od_cart_count'    => (int) ($row['od_cart_count'] ?? count($formattedItems)),
            'od_cart_price'    => (int) ($row['od_cart_price'] ?? 0),
            'od_cart_coupon'   => (int) ($row['od_cart_coupon'] ?? 0),
            'od_coupon'        => (int) ($row['od_coupon'] ?? 0),
            'od_send_cost'     => (int) ($row['od_send_cost'] ?? 0),
            'od_send_cost2'    => (int) ($row['od_send_cost2'] ?? 0),
            'od_send_coupon'   => (int) ($row['od_send_coupon'] ?? 0),
            'od_receipt_point' => (int) ($row['od_receipt_point'] ?? 0),
            'od_cancel_price'  => (int) ($row['od_cancel_price'] ?? 0),
            'od_misu'          => (int) ($row['od_misu'] ?? $misuPrice),
            'od_refund_price'  => (int) ($row['od_refund_price'] ?? 0),
            'od_list_price'    => $listPrice,
            'od_order_price'   => $listPrice,
            'od_total_price'   => $totalPrice,
            'od_receipt_total' => $receiptTotal,
            'od_misu_price'    => $misuPrice,
            'od_is_fully_paid' => shop_orders_is_fully_paid($row),
            'od_status'        => $row['od_status'],
            'od_time'          => $row['od_time'] ?? '',
            'od_receipt_time'  => $row['od_receipt_time'],
            'can_cancel'       => $cancelState['can_cancel'],
            'cancel_block_reason' => $cancelState['cancel_block_reason'],
            'item_count'       => count($formattedItems),
            'first_item_name'  => (string) ($formattedItems[0]['it_name'] ?? ''),
            'image_url'        => (string) ($formattedItems[0]['image_url'] ?? ''),
            'items'            => $formattedItems,
        ];
    }

    Response::paginated($orders, $total, $page, $perPage);
}

// =========================================================================
// POST /v1/shop/orders/lookup - Guest order lookup by order id/password
// =========================================================================
if ($apiMethod === 'POST' && $od_id === 'lookup') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $lookupOrderId = shop_api_clean_id($input['od_id'] ?? $input['order_id'] ?? '');
    $lookupPassword = shop_api_guest_order_password($input);
    if ($lookupOrderId === '' || $lookupPassword === '') {
        Response::error('Order id and password are required.', 422);
    }

    // 비밀번호 대입 막기 — 비회원 주문 비밀번호는 3자부터 허용되고 주문번호도 시각으로 짐작할 수 있다.
    // IP 당 조회 횟수, 그리고 (주문번호 · IP) 마다 5번 틀리면 15분 잠금(로그인과 같은 장치).
    $lookupIp = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $lookupKey = '__order__' . substr($lookupOrderId, 0, 40); // 기록 칸(mb_id)은 64자
    if (Throttle::checkEnumProbe($lookupIp) !== null || Throttle::checkLoginAttempt($lookupKey, $lookupIp) !== null) {
        Response::error('주문 조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    $order = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? AND mb_id = '' LIMIT 1",
        [$lookupOrderId]
    );

    if (!$order || !shop_api_guest_order_password_matches($lookupPassword, $order['od_pwd'] ?? '')) {
        Throttle::recordLoginFailure($lookupKey, $lookupIp);
        if (function_exists('run_event')) {
            api_run_event('password_is_wrong', array('shop', $order ?: ['od_id' => $lookupOrderId]));
        }
        Response::error('Order not found.', 404);
    }

    Throttle::resetLoginAttempts($lookupKey, $lookupIp);
    $uid = shop_api_set_guest_order_cookie($order);
    Response::success([
        'od_id' => (string) $order['od_id'],
        'uid' => $uid,
        'redirect_url' => '/shop/orders/' . rawurlencode((string) $order['od_id']) . '?uid=' . rawurlencode($uid),
    ]);
}

// =========================================================================
// GET /v1/shop/orders/{od_id} - Order detail
// =========================================================================
if ($apiMethod === 'GET' && $od_id !== '') {

    if ($member) {
        $order = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? AND mb_id = ? LIMIT 1",
            [$od_id, $mb_id]
        );
    } else {
        $order = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? AND mb_id = '' LIMIT 1",
            [$od_id]
        );
    }

    if (!$order) {
        Response::error('Order not found.', 404);
    }
    if (!$member && !shop_api_can_view_guest_order($order)) {
        Response::error('Order not found.', 404);
    }

    // Order items
    $orderItemRows = DB::fetchAll(
        "SELECT c.ct_id, c.it_id, c.it_name, c.ct_price, c.ct_qty, c.ct_point, c.ct_option, c.ct_status, c.ct_stock_use,
                c.io_type, c.io_price, c.ct_send_cost, c.it_sc_type, c.it_sc_method,
                c.it_sc_price, c.it_sc_minimum, c.it_sc_qty,
                i.it_img1, i.it_seo_title
         FROM " . DB::table('g5_shop_cart_table') . " c
         LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = c.it_id
         WHERE c.od_id = ? AND c.mb_id = ?",
        [$od_id, $order['mb_id']]
    );

    $orderItems = [];
    $totalPoint = 0;
    foreach ($orderItemRows as $oi) {
        $linePoint = (int) ($oi['ct_point'] ?? 0) * (int) ($oi['ct_qty'] ?? 0);
        $totalPoint += $linePoint;
        $orderItems[] = [
            'ct_id'     => $oi['ct_id'],
            'it_id'     => $oi['it_id'],
            'it_name'   => $oi['it_name'],
            'it_seo_title' => $oi['it_seo_title'] ?? '',
            'ct_price'  => shop_api_cart_unit_price($oi),
            'ct_base_price' => (int) $oi['ct_price'],
            'ct_point'  => (int) ($oi['ct_point'] ?? 0),
            'ct_qty'    => (int) $oi['ct_qty'],
            'ct_option' => $oi['ct_option'],
            'ct_status' => $oi['ct_status'],
            'ct_stock_use' => (int) ($oi['ct_stock_use'] ?? 0),
            'io_type'   => (int) ($oi['io_type'] ?? 0),
            'io_price'  => (int) ($oi['io_price'] ?? 0),
            'ct_send_cost' => (int) ($oi['ct_send_cost'] ?? 0),
            'it_sc_type' => (int) ($oi['it_sc_type'] ?? 0),
            'it_sc_method' => (int) ($oi['it_sc_method'] ?? 0),
            'it_sc_price' => (int) ($oi['it_sc_price'] ?? 0),
            'it_sc_minimum' => (int) ($oi['it_sc_minimum'] ?? 0),
            'it_sc_qty' => (int) ($oi['it_sc_qty'] ?? 0),
            'line_total' => shop_api_cart_line_total($oi),
            'line_point' => $linePoint,
            'image_url' => !empty($oi['it_img1'])
                ? api_image_url_with_width(api_shop_item_image_url($oi['it_id'], $oi['it_img1']), 240)
                : '',
        ];
    }
    $cancelState = shop_orders_customer_cancel_state($order, $orderItemRows, true);
    $paymentAppInfo = shop_orders_payment_app_info($order);
    $totalPrice = shop_orders_total_price($order);
    $receiptTotal = shop_orders_receipt_total($order);
    $misuPrice = shop_orders_misu_price($order);
    $receiptUrl = shop_orders_payment_receipt_url($order);
    $cashReceiptUrl = shop_orders_cash_receipt_url($order);
    $taxsaveUrl = shop_orders_taxsave_url($order);
    $deliveryInquiryUrl = shop_orders_delivery_inquiry_url($order);

    // Order data (additional info)
    $orderData = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_data_table') . "
         WHERE od_id = ? LIMIT 1",
        [$od_id]
    );

    $data = [
        'od_id'            => (string) $order['od_id'],
        'mb_id'            => $order['mb_id'],
        'od_name'          => $order['od_name'],
        'od_tel'           => $order['od_tel'],
        'od_hp'            => $order['od_hp'],
        'od_zip1'          => $order['od_zip1'],
        'od_zip2'          => $order['od_zip2'],
        'od_zip'           => trim((string) $order['od_zip1'] . (string) $order['od_zip2']),
        'od_addr1'         => $order['od_addr1'],
        'od_addr2'         => $order['od_addr2'],
        'od_addr3'         => $order['od_addr3'],
        'od_b_name'        => $order['od_b_name'] ?? '',
        'od_b_tel'         => $order['od_b_tel'] ?? '',
        'od_b_hp'          => $order['od_b_hp'] ?? '',
        'od_b_zip1'        => $order['od_b_zip1'] ?? '',
        'od_b_zip2'        => $order['od_b_zip2'] ?? '',
        'od_b_zip'         => trim((string) ($order['od_b_zip1'] ?? '') . (string) ($order['od_b_zip2'] ?? '')),
        'od_b_addr1'       => $order['od_b_addr1'] ?? '',
        'od_b_addr2'       => $order['od_b_addr2'] ?? '',
        'od_b_addr3'       => $order['od_b_addr3'] ?? '',
        'od_b_addr_jibeon' => $order['od_b_addr_jibeon'] ?? '',
        'od_receipt_price' => (int) $order['od_receipt_price'],
        'od_send_cost'     => (int) ($order['od_send_cost'] ?? 0),
        'od_settle_case'   => $order['od_settle_case'] ?? '',
        'od_status'        => $order['od_status'],
        'od_time'          => $order['od_time'] ?? '',
        'od_receipt_time'  => $order['od_receipt_time'],
        'can_cancel'       => $cancelState['can_cancel'],
        'cancel_block_reason' => $cancelState['cancel_block_reason'],
        // 결제수단/PG 결과 표시용 — 가상계좌일 때 od_bank_account 에 입금 정보가 들어있음.
        'od_bank_account'  => $order['od_bank_account'] ?? '',
        'od_deposit_name'  => $order['od_deposit_name'] ?? '',
        'od_pg'            => $order['od_pg'] ?? '',
        'od_tno'           => $order['od_tno'] ?? '',
        'od_app_no'        => $order['od_app_no'] ?? '',
        'od_memo'          => $order['od_memo'] ?? '',
        // 쿠폰/포인트 할인 — 0 이면 표시 생략 가능.
        'od_cart_price'    => (int) ($order['od_cart_price'] ?? 0),
        'od_cart_coupon'   => (int) ($order['od_cart_coupon'] ?? 0),
        'od_coupon'        => (int) ($order['od_coupon'] ?? 0),
        'od_send_cost2'    => (int) ($order['od_send_cost2'] ?? 0),
        'od_send_coupon'   => (int) ($order['od_send_coupon'] ?? 0),
        'od_receipt_point' => (int) ($order['od_receipt_point'] ?? 0),
        'od_cancel_price'  => (int) ($order['od_cancel_price'] ?? 0),
        'od_misu'          => (int) ($order['od_misu'] ?? 0),
        'od_refund_price'  => (int) ($order['od_refund_price'] ?? 0),
        'od_total_price'   => $totalPrice,
        'od_receipt_total' => $receiptTotal,
        'od_misu_price'    => $misuPrice,
        'od_is_fully_paid' => shop_orders_is_fully_paid($order),
        'od_total_point'   => $totalPoint,
        'od_payment_app_label' => $paymentAppInfo['label'],
        'od_payment_app_value' => $paymentAppInfo['value'],
        'od_payment_display_bank' => $paymentAppInfo['display_bank'],
        'od_payment_receipt_url' => $receiptUrl,
        'receipt_url'      => $receiptUrl,
        // 배송 추적 — 관리자가 그누보드 admin 에서 입력. 빈 값이면 UI 에서 숨김.
        'od_delivery_company' => $order['od_delivery_company'] ?? '',
        'od_invoice'          => $order['od_invoice'] ?? '',
        'od_invoice_time'     => $order['od_invoice_time'] ?? '',
        'od_delivery_inquiry_url' => $deliveryInquiryUrl,
        'delivery_inquiry_url' => $deliveryInquiryUrl,
        // 현금영수증 — PG/가상계좌 결제 시 KCP/이니시스 등이 발급.
        'od_cash'             => (int) ($order['od_cash'] ?? 0),
        'od_cash_no'          => $order['od_cash_no'] ?? '',
        'od_cash_info'        => $order['od_cash_info'] ?? '',
        'od_cash_receipt_url' => $cashReceiptUrl,
        'cash_receipt_url'    => $cashReceiptUrl,
        'od_cash_receipt_issue_url' => $taxsaveUrl,
        'cash_receipt_issue_url' => $taxsaveUrl,
        // 희망배송일 / 모바일 주문 마킹.
        'od_hope_date'        => $order['od_hope_date'] ?? '',
        'od_mobile'           => (int) ($order['od_mobile'] ?? 0),
        // 세금계산서 신청 플래그.
        'od_tax_flag'         => (int) ($order['od_tax_flag'] ?? 0),
        'od_tax_mny'          => (int) ($order['od_tax_mny'] ?? 0),
        'od_vat_mny'          => (int) ($order['od_vat_mny'] ?? 0),
        'od_free_mny'         => (int) ($order['od_free_mny'] ?? 0),
        'items'            => $orderItems,
        'order_data'       => $orderData ?: null,
    ];

    Response::success($data);
}

// =========================================================================
// POST /v1/shop/orders - Create order from cart
// =========================================================================

require_once __DIR__ . '/orders_create_routes.php';

if ($apiMethod === 'PATCH' && $od_id !== '') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $reason = trim((string) ($input['reason'] ?? ''));
    $guestUid = trim((string) ($input['uid'] ?? ''));

    if ($reason === '') {
        Response::error('취소사유를 입력해 주세요.', 422);
    }
    $reasonLength = function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') : strlen($reason);
    if ($reasonLength > 100) {
        Response::error('취소사유는 100자 이내로 입력해 주세요.', 422);
    }

    // 같은 주문의 취소 · 구매확정이 겹치지 않게 주문 단위 잠금(구매확정과 같은 이름). 잠근 뒤에 주문을 읽어야
    // 동시에 들어온 두 취소가 둘 다 "주문" 상태를 보고 재고 · 포인트를 두 번 되돌리지 않는다.
    // 잠금은 요청이 끝나 DB 연결이 닫히면 풀린다.
    $cancelLock = DB::fetch('SELECT GET_LOCK(?, 3) AS l', ['shop_order_' . $od_id]);
    if ((int) ($cancelLock['l'] ?? 0) !== 1) {
        Response::error('주문을 처리하는 중입니다. 잠시 후 다시 시도해 주세요.', 409, ['code' => 'lock_busy']);
    }

    if ($member) {
        $order = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? AND mb_id = ? LIMIT 1",
            [$od_id, $mb_id]
        );
    } else {
        $order = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? AND mb_id = '' LIMIT 1",
            [$od_id]
        );
    }
    if (!$order) Response::error('Order not found.', 404);
    if (!$member && !shop_api_can_view_guest_order($order, $guestUid)) {
        Response::error('Order not found.', 404);
    }

    $orderMbId = (string) ($order['mb_id'] ?? '');

    $cancellableStatuses = ['주문', '준비'];
    if (!in_array($order['od_status'], $cancellableStatuses, true)) {
        Response::error('현재 상태(' . $order['od_status'] . ')에서는 취소할 수 없습니다.', 400);
    }
    if ((int) ($order['od_cancel_price'] ?? 0) > 0) {
        Response::error('이미 취소 처리된 주문입니다.', 400);
    }

    if ($order['od_status'] === '준비') {
        $restored = shop_api_restore_pending_order_cart($order, $member, '주문 취소: ' . $reason);
        $updated = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? LIMIT 1",
            [$od_id]
        );

        Response::success([
            'order'        => $updated,
            'refund_note'  => '결제 준비 주문을 장바구니로 복구했습니다.',
            'restored_qty' => $restored,
        ]);
    }

    $cartStatus = DB::fetch(
        "SELECT COUNT(*) AS total_count,
                SUM(CASE WHEN ct_status = ? THEN 1 ELSE 0 END) AS order_count
         FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?",
        ['주문', $od_id]
    );
    if (!$cartStatus || (int) $cartStatus['total_count'] <= 0 || (int) $cartStatus['total_count'] !== (int) $cartStatus['order_count']) {
        Response::error('취소할 수 있는 주문 상품 상태가 아닙니다.', 400);
    }

    // PG 결제 취소는 로컬 재고/포인트를 되돌리기 전에 먼저 확정한다.
    $refundNote = '';
    $refundedPgAmount = 0;
    $hadPgPayment = !empty($order['od_pg']) && (int) ($order['od_receipt_price'] ?? 0) > 0;
    if ($hadPgPayment) {
        $orderPg = strtolower((string) ($order['od_pg'] ?? ''));
        if ($orderPg === 'toss') {
            $tossCancel = shop_orders_toss_cancel_payment($order, $reason, $input);
            if (empty($tossCancel['ok'])) {
                Response::error('Toss 결제 취소 API 호출에 실패했습니다: ' . (string) ($tossCancel['error'] ?? 'unknown error'), 502, [
                    'pg_response' => $tossCancel,
                ]);
            }
            $refundNote = !empty($tossCancel['already_cancelled'])
                ? 'Toss 취소 이미 처리됨 (paymentKey=' . $order['od_tno'] . ')'
                : 'Toss cancel API 완료 (paymentKey=' . $order['od_tno'] . ')';
            $refundedPgAmount = shop_orders_pg_cancel_amount($order);
        } elseif ($orderPg === 'kcp') {
            $kcpCancel = shop_orders_kcp_cancel_payment($order, $reason);
            if (empty($kcpCancel['ok'])) {
                Response::error('KCP 결제 취소 API 호출에 실패했습니다: ' . (string) ($kcpCancel['error'] ?? 'unknown error'), 502, [
                    'pg_response' => $kcpCancel,
                ]);
            }
            $refundNote = 'KCP PP_CLI 취소 완료 (tno=' . $order['od_tno'] . ')';
            $refundedPgAmount = shop_orders_pg_cancel_amount($order);
        } elseif ($orderPg === 'lg') {
            $lgCancel = shop_orders_lg_cancel_payment($order, $reason);
            if (empty($lgCancel['ok'])) {
                Response::error('LG U+ payment cancel API failed: ' . (string) ($lgCancel['error'] ?? 'unknown error'), 502, [
                    'pg_response' => $lgCancel,
                ]);
            }
            $refundNote = 'LG U+ XPay cancel complete (tno=' . $order['od_tno'] . ')';
            $refundedPgAmount = shop_orders_pg_cancel_amount($order);
        } elseif ($orderPg === 'inicis') {
            $inicisCancel = shop_orders_inicis_cancel_payment($order, $reason);
            if (empty($inicisCancel['ok'])) {
                Response::error('KG 이니시스 결제 취소 API 호출에 실패했습니다: ' . (string) ($inicisCancel['error'] ?? 'unknown error'), 502, [
                    'pg_response' => $inicisCancel,
                ]);
            }
            $refundNote = 'KG 이니시스 INIAPI 취소 완료 (tid=' . $order['od_tno'] . ')';
            $refundedPgAmount = shop_orders_pg_cancel_amount($order);
        } elseif ($orderPg === 'kakaopay') {
            $kakaopayCancel = shop_orders_kakaopay_cancel_payment($order, $reason);
            if (empty($kakaopayCancel['ok'])) {
                Response::error('KAKAOPAY cancel API failed: ' . (string) ($kakaopayCancel['error'] ?? 'unknown error'), 502, [
                    'pg_response' => $kakaopayCancel,
                ]);
            }
            $refundNote = 'KAKAOPAY INIAPI cancel complete (tid=' . $order['od_tno'] . ')';
            $refundedPgAmount = shop_orders_pg_cancel_amount($order);
        } elseif ($orderPg === 'nicepay') {
            $niceCancel = shop_orders_nicepay_cancel_payment($order, $reason, $input);
            if (empty($niceCancel['ok'])) {
                Response::error('Nicepay 결제 취소 API 호출에 실패했습니다: ' . (string) ($niceCancel['error'] ?? 'unknown error'), 502, [
                    'pg_response' => $niceCancel,
                ]);
            }
            $refundNote = !empty($niceCancel['already_cancelled'])
                ? 'Nicepay 취소 가능한 잔액 없음'
                : 'Nicepay cancel API 완료 (tid=' . $order['od_tno'] . ')';
            $refundedPgAmount = shop_orders_pg_cancel_amount($order);
        } else {
            Response::error(($order['od_pg'] ?? '?') . ' PG 취소 API가 연결되어 있지 않아 로컬 취소를 중단했습니다.', 501);
        }
    }

    // 1+2) 카트 행 + 재고 복구.
    $cartRestore = DB::fetchAll(
        "SELECT ct_id, it_id, ct_qty, ct_option, io_id, io_type, ct_stock_use FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?",
        [$od_id]
    );
    foreach ($cartRestore as $ci) {
        if ((int) ($ci['ct_stock_use'] ?? 0) !== 1) {
            continue;
        }
        // 이 줄의 재고 복구를 차지한(ct_stock_use 1 → 0 으로 바꾼) 요청만 재고를 더한다 — 잠금이 풀린 뒤라도
        // 같은 줄의 재고를 두 번 되돌리지 않는다.
        $claimed = DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . " SET ct_stock_use = 0 WHERE ct_id = ? AND ct_stock_use = 1",
            [(int) $ci['ct_id']]
        );
        if ($claimed !== 1) {
            continue;
        }
        $optionId = trim((string) ($ci['io_id'] ?? ''));
        $optionType = (int) ($ci['io_type'] ?? 0);
        if ($optionId !== '') {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_item_option_table') . "
                 SET io_stock_qty = io_stock_qty + ?
                 WHERE it_id = ? AND io_id = ? AND io_type = ?",
                [(int) $ci['ct_qty'], $ci['it_id'], $optionId, $optionType]
            );
        } else {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_item_table') . "
                 SET it_stock_qty = it_stock_qty + ?
                 WHERE it_id = ?",
                [(int) $ci['ct_qty'], $ci['it_id']]
            );
        }
    }
    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET ct_status = '취소',
             ct_stock_use = 0
         WHERE od_id = ?",
        [$od_id]
    );

    // 3) 사용 포인트 환급 — 이미 환급한 이력이 없을 때만 (idempotent).
    $usedPoint = (int) ($order['od_receipt_point'] ?? 0);
    if ($orderMbId !== '' && $usedPoint > 0 && function_exists('insert_point')) {
        $existsRefund = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('point_table') . "
             WHERE mb_id = ? AND po_rel_table = '@shop_order'
               AND po_rel_id = ? AND po_rel_action = 'cancel'",
            [$orderMbId, (string) $od_id]
        );
        if ($existsRefund === 0) {
            insert_point(
                $orderMbId, $usedPoint,
                '주문번호 ' . $od_id . ' 본인 취소',
                '@shop_order', (string) $od_id, 'cancel'
            );
        }
    }

    // 4) 적립 포인트 회수 — 각 카트 행의 @shop_buy 적립을 음수로 상쇄.
    if ($orderMbId !== '' && function_exists('insert_point')) {
        $buyPoints = DB::fetchAll(
            "SELECT po_rel_action, po_point FROM " . DB::table('point_table') . "
             WHERE mb_id = ? AND po_rel_table = '@shop_buy' AND po_rel_id = ?",
            [$orderMbId, (string) $od_id]
        );
        foreach ($buyPoints as $bp) {
            // rel_action 은 ct_id (적립 시 사용한 값) — cancel_buy 접미사로 중복방지.
            $cancelAction = 'cancel_buy_' . $bp['po_rel_action'];
            $exists = DB::count(
                "SELECT COUNT(*) FROM " . DB::table('point_table') . "
                 WHERE mb_id = ? AND po_rel_table = '@shop_buy' AND po_rel_id = ?
                   AND po_rel_action = ?",
                [$orderMbId, (string) $od_id, $cancelAction]
            );
            if ($exists === 0 && (int) $bp['po_point'] > 0) {
                insert_point(
                    $orderMbId, -(int) $bp['po_point'],
                    '주문번호 ' . $od_id . ' 취소 — 적립 회수',
                    '@shop_buy', (string) $od_id, $cancelAction
                );
            }
        }
    }

    // 5) 쿠폰 사용 로그 삭제 — 재사용 가능하도록.
    DB::execute(
        "DELETE FROM " . DB::table('g5_shop_coupon_log_table') . "
         WHERE od_id = ? AND mb_id = ?",
        [$od_id, $orderMbId]
    );

    // 6) 주문 상태 + 취소 금액 + 히스토리.
    $cancelledAt = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
    $memoReason = preg_replace('/\s+/', ' ', trim(strip_tags($reason)));
    $existingHistory = (string) ($order['od_mod_history'] ?? '');
    $existingShopMemo = (string) ($order['od_shop_memo'] ?? '');
    $newHistory = trim($existingHistory . "\n[" . $cancelledAt . "] 취소 — " . $memoReason
        . ($refundNote ? ' / ' . $refundNote : ''));
    $newShopMemo = trim(
        $existingShopMemo . "\n주문자 본인 직접 취소 - " . $cancelledAt . " (취소이유 : " . $memoReason . ")"
    );
    DB::execute(
        "UPDATE " . DB::table('g5_shop_order_table') . "
         SET od_send_cost = 0,
             od_send_cost2 = 0,
             od_receipt_price = 0,
             od_receipt_point = 0,
             od_misu = 0,
             od_cancel_price = od_cart_price,
             od_cart_coupon = 0,
             od_coupon = 0,
             od_send_coupon = 0,
             od_status = '취소',
             od_refund_price = CASE WHEN ? > 0 THEN ? ELSE od_refund_price END,
             od_mod_history = ?,
             od_shop_memo = ?
         WHERE od_id = ? AND mb_id = ?",
        [$refundedPgAmount, $refundedPgAmount, $newHistory, $newShopMemo, $od_id, $orderMbId]
    );

    $updated = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? LIMIT 1",
        [$od_id]
    );

    // 취소 알림 메일.
    shop_api_send_order_mail((string) $od_id, 'cancelled');
    shop_api_defer_order_push((string) $od_id, 'cancelled');

    Response::success([
        'order'        => $updated,
        'refund_note'  => $refundNote,
        'restored_qty' => count($cartRestore),
    ]);
}

// =========================================================================
// POST /v1/shop/orders/{od_id}/confirm - 구매확정 (앱 SC-09)
// =========================================================================
$orderAction = isset($shopSegments[1]) ? (string) $shopSegments[1] : '';
if ($apiMethod === 'POST' && $od_id !== '' && $orderAction === 'confirm') {
    require __DIR__ . '/orders_confirm_route.php';
}

Response::error('Method not allowed.', 405);
