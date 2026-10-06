<?php
if (!defined('_GNUBOARD_')) {
    exit;
}
require_once __DIR__ . '/coupon_markers.php';
// =========================================================================
// POST /v1/shop/payment/prepare
// Creates a draft order with status='준비' (preparing) and returns the data
// needed by the PG SDK to start the payment flow.
// =========================================================================
if ($apiMethod === 'POST' && $action === 'prepare') {

    $member = Auth::getUser();
    $mb_id  = !empty($member['mb_id']) ? $member['mb_id'] : '';
    // 현재 활성 카트 식별자 — 무통장 흐름 (orders.php POST) 과 동일한 규약.
    // 로그인 회원의 경우 mb_id 기준으로 od_id=0 이던 행들을 cart_id 로 묶어준다.
    $cart_id = shop_api_cart_id($member);

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }
    $input = shop_api_clean_order_input($input); // 원본 orderformupdate.php 와 같은 입력 정리

    $ctIdSource = $input['ct_ids'] ?? $input['cart_ids'] ?? null;
    $hasCtIdFilter = is_array($ctIdSource)
        ? count($ctIdSource) > 0
        : trim((string) ($ctIdSource ?? '')) !== '';
    $filterCtIds = shop_api_cart_ct_ids_from($ctIdSource);
    $directFilter = shop_api_truthy($input['direct'] ?? null) || shop_api_truthy($input['sw_direct'] ?? null);
    $filterSql = '';
    $cartParams = [$cart_id];
    if ($hasCtIdFilter && empty($filterCtIds)) {
        Response::error('Invalid cart item ids.', 422);
    }
    shop_api_cart_require_ct_ids_within_limit($ctIdSource);
    if (!empty($filterCtIds)) {
        shop_api_restore_pending_cart_rows_by_ct_ids(
            $member,
            $filterCtIds,
            '결제 취소: 결제 재시도로 임시 주문 복구'
        );
        $filterSql = ' AND ct_id IN (' . implode(',', array_fill(0, count($filterCtIds), '?')) . ')';
        $cartParams = array_merge($cartParams, $filterCtIds);
    } else {
        $filterSql = ' AND ct_direct = ' . ($directFilter ? '1' : '0');
    }

    // Normalize zip
    if (!empty($input['od_zip']) && empty($input['od_zip1'])) {
        $zip = preg_replace('/[^0-9]/', '', $input['od_zip']);
        $input['od_zip1'] = substr($zip, 0, 3);
        $input['od_zip2'] = substr($zip, 3);
    }

    // Validate orderer
    foreach (['od_name', 'od_hp', 'od_zip1', 'od_addr1'] as $f) {
        if (empty($input[$f])) {
            Response::error("Field {$f} is required.", 422);
        }
    }
    $guestOrderPassword = '';
    if (!$member) {
        $guestOrderPassword = shop_api_guest_order_password($input);
        if (!shop_api_guest_order_password_valid($guestOrderPassword)) {
            Response::error('Guest order password must be at least 3 letters or numbers.', 422, [
                'od_pwd' => 'Guest order password must be at least 3 letters or numbers.',
            ]);
        }
    }

    // Recipient fallback
    $recipientFields = [
        'od_b_name'  => $input['od_name'],
        'od_b_tel'   => $input['od_tel'] ?? '',
        'od_b_hp'    => $input['od_hp'],
        'od_b_zip1'  => $input['od_zip1'],
        'od_b_zip2'  => $input['od_zip2'] ?? '',
        'od_b_addr1' => $input['od_addr1'],
        'od_b_addr2' => $input['od_addr2'] ?? '',
        'od_b_addr3' => $input['od_addr3'] ?? '',
        'od_b_addr_jibeon' => $input['od_addr_jibeon'] ?? '',
    ];
    foreach ($recipientFields as $k => $default) {
        if (empty($input[$k])) {
            $input[$k] = $default;
        }
    }

    // Get cart items — 활성 카트 (od_id = $cart_id) 에서 아직 주문되지 않은 행만.
    // 상품/카테고리 쿠폰 합산을 위해 cp_price 도 함께 (orders POST 와 동일 컬럼셋).
    $cartItems = DB::fetchAll(
        "SELECT ct_id, it_id, it_name, ct_price, ct_qty, ct_option, cp_price, ct_notax, ct_history,
                io_id, io_type, io_price
         FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           {$filterSql}
           AND " . shop_api_cart_active_status_sql(),
        array_merge($cartParams, shop_api_cart_active_statuses())
    );

    if (empty($cartItems)) {
        $cartItems = DB::fetchAll(
            "SELECT ct_id, it_id, it_name, ct_price, ct_qty, ct_option, cp_price, ct_notax, ct_history,
                    io_id, io_type, io_price
              FROM " . DB::table('g5_shop_cart_table') . "
              WHERE od_id = ?
                {$filterSql}
                AND " . shop_api_cart_active_status_sql(),
            array_merge($cartParams, shop_api_cart_active_statuses())
        );
    }

    shop_api_cart_require_shown_rows($cartItems, $filterCtIds);

    if (empty($cartItems)) {
        Response::error('Cart is empty.', 400);
    }

    // 줄 쿠폰은 저장된 cp_price 를 믿지 않고 지금 조건(수량·최소금액·기간·사용 여부)으로 다시 적용한다.
    $cartItems = shop_api_reevaluate_cart_line_coupons($cartItems, (string) $mb_id);

    $checkedCertItems = [];
    foreach ($cartItems as $ci) {
        $itemIdForCert = (string) ($ci['it_id'] ?? '');
        if ($itemIdForCert === '' || isset($checkedCertItems[$itemIdForCert])) {
            continue;
        }
        $checkedCertItems[$itemIdForCert] = true;
        shop_api_enforce_cert_access($itemIdForCert, 'item', $member);
    }
    shop_api_validate_order_stock($cartItems);

    $totalPrice = 0;
    $totalQty   = 0;
    $goodsNames = [];
    foreach ($cartItems as $ci) {
        $totalPrice += shop_api_cart_line_total($ci);
        $totalQty   += (int) $ci['ct_qty'];
        $goodsNames[] = $ci['it_name'];
    }

    // 배송비 — orders.php POST 와 동일 룰 (기본 + 도서산간).
    $sc = shop_api_send_cost($totalPrice, $input['od_b_zip1'] ?? '', $input['od_b_zip2'] ?? '');
    $od_send_cost  = shop_api_cart_send_cost(
        $cart_id,
        !empty($filterCtIds) ? $filterCtIds : null,
        $directFilter
    );
    $od_send_cost2 = $sc['extra'];

    // 희망배송일 / 모바일 마킹 — orders.php POST 와 동일 룰.
    $od_hope_date = date('Y-m-d');
    if (!empty($input['od_hope_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['od_hope_date'])) {
        $od_hope_date = $input['od_hope_date'];
    }
    $requestedPaymentDevice = strtolower(trim((string) ($input['payment_device'] ?? $input['device'] ?? '')));
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $uaMobile = preg_match('/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i', $ua) ? 1 : 0;
    if ($requestedPaymentDevice === 'mobile') {
        $od_mobile = 1;
    } elseif ($requestedPaymentDevice === 'pc') {
        $od_mobile = 0;
    } else {
        $od_mobile = $uaMobile;
    }

    // 세금계산서/현금영수증 신청 플래그 (orders POST 와 동일).
    $od_tax_flag = 0;
    $od_cash     = !empty($input['od_cash_request']) ? 1 : 0;

    // 카트에 미리 묶인 상품/카테고리 쿠폰 합계.
    $od_cart_coupon = 0;
    foreach ($cartItems as $ci) {
        $od_cart_coupon += (int) ($ci['cp_price'] ?? 0);
    }
    $orderCouponBase = max(0, $totalPrice - $od_cart_coupon);

    // 쿠폰/포인트 — orders.php POST 와 동일한 룰. cp_id 가 적용 불가하면 조용히 무시.
    $od_coupon = 0;
    $appliedCoupon = null;
    if ($mb_id !== '' && !empty($input['cp_id'])) {
        $cpRow = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_coupon_table') . "
             WHERE cp_id = ? LIMIT 1",
            [(string) $input['cp_id']]
        );
        if ($cpRow) {
            $eval = shop_api_coupon_evaluate($cpRow, $orderCouponBase, $mb_id);
            if ($eval['ok']) {
                $od_coupon = (int) $eval['discount'];
                $appliedCoupon = $cpRow;
            }
        }
    }
    // 배송비 쿠폰 (cp_method=3).
    $od_send_coupon = 0;
    $appliedSendCoupon = null;
    $sendCouponMinimumAmount = max(0, $orderCouponBase - $od_coupon);
    if ($mb_id !== '' && !empty($input['cp_id_send'])) {
        $sendCp = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_coupon_table') . "
             WHERE cp_id = ? LIMIT 1",
            [(string) $input['cp_id_send']]
        );
        if ($sendCp) {
            $eval = shop_api_send_coupon_evaluate($sendCp, $od_send_cost + $od_send_cost2, $mb_id, $sendCouponMinimumAmount);
            if ($eval['ok']) {
                $od_send_coupon = (int) $eval['discount'];
                $appliedSendCoupon = $sendCp;
            }
        }
    }

    $od_receipt_point = 0;
    if ($mb_id !== '' && isset($input['point_use'])) {
        $maxFromOrder = max(0, $orderCouponBase - $od_coupon);
        $od_receipt_point = shop_api_point_clamp($input['point_use'], $mb_id, $maxFromOrder);
    }
    $od_receipt_price = $totalPrice + $od_send_cost + $od_send_cost2
                      - $od_coupon - $od_cart_coupon - $od_send_coupon - $od_receipt_point;
    if ($od_receipt_price < 0) $od_receipt_price = 0;
    $taxAmounts = shop_api_order_tax_amounts(
        $cartItems,
        $od_send_cost,
        $od_send_cost2,
        $od_coupon,
        $od_send_coupon,
        $od_receipt_point,
        $od_receipt_price
    );
    $od_tax_flag = (int) $taxAmounts['od_tax_flag'];

    $allowedSettleCases = ['무통장', '가상계좌', '계좌이체', '신용카드', '휴대폰', '간편결제', 'KAKAOPAY'];
    $settleCase = isset($input['od_settle_case']) ? trim($input['od_settle_case']) : '신용카드';
    if (!in_array($settleCase, $allowedSettleCases, true)) {
        $settleCase = '신용카드';
    }

    $goodsName = $goodsNames[0] ?? '상품';
    if (count($goodsNames) > 1) {
        $goodsName .= ' 외 ' . (count($goodsNames) - 1) . '건';
    }

    $cfg = pg_load_config();
    if (!$cfg) {
        Response::error('Shop config not found.', 500);
    }
    $pg_service = $cfg['de_pg_service'] ?? 'toss';
    if (!in_array($pg_service, ['toss', 'inicis', 'kcp', 'nicepay'], true)) {
        $pg_service = 'toss';
    }
    $response_pg_service = $pg_service;
    $order_pg_service = $pg_service;
    if ($settleCase === 'KAKAOPAY') {
        if (!pg_kakaopay_enabled($cfg)) {
            Response::error('KAKAOPAY is not enabled.', 422);
        }
        $response_pg_service = 'kakaopay';
        $order_pg_service = 'KAKAOPAY';
    }
    // 관리자 '결제 테스트'가 실결제인데 실결제(live_) 키가 없으면 주문 초안을 만들기 전에 막는다 — 테스트 키로 조용히 결제되지 않게.
    if ($response_pg_service === 'toss' && pg_toss_secret_key($cfg, pg_detect_test_mode($cfg, 'toss')) === '') {
        Response::error('실결제로 설정되어 있지만 토스페이먼츠 실결제(live) 키가 없습니다. 관리자 쇼핑몰 설정을 확인해 주세요.', 503, [
            'code' => 'pg_live_key_missing',
        ]);
    }

    // Generate order ID
    $od_id_new = shop_api_new_order_id();
    $orderTime = date('Y-m-d H:i:s');
    $remoteIp = $_SERVER['REMOTE_ADDR'] ?? '';
    $od_pwd = $member && !empty($member['mb_password'])
        ? $member['mb_password']
        : shop_api_order_password_hash($guestOrderPassword);

    // Insert draft order with status='준비'
    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_order_table') . " SET
            od_id            = ?,
            mb_id            = ?,
            od_name          = ?,
            od_tel           = ?,
            od_hp            = ?,
            od_email         = ?,
            od_zip1          = ?,
            od_zip2          = ?,
            od_addr1         = ?,
            od_addr2         = ?,
            od_addr3         = ?,
            od_addr_jibeon   = ?,
            od_b_name        = ?,
            od_b_tel         = ?,
            od_b_hp          = ?,
            od_b_zip1        = ?,
            od_b_zip2        = ?,
            od_b_addr1       = ?,
            od_b_addr2       = ?,
            od_b_addr3       = ?,
            od_b_addr_jibeon = ?,
            od_memo          = ?,
            od_shop_memo     = ?,
            od_mod_history   = ?,
            od_cash_no       = '',
            od_cash_info     = '',
            od_cart_price    = ?,
            od_cart_count    = ?,
            od_send_cost     = ?,
            od_send_cost2    = ?,
            od_send_coupon   = ?,
            od_cart_coupon   = ?,
            od_coupon        = ?,
            od_receipt_point = ?,
            od_receipt_price = ?,
            od_settle_case   = ?,
            od_pg            = ?,
            od_test          = ?,
            od_bank_account  = '',
            od_deposit_name  = '',
            od_status        = ?,
            od_hope_date     = ?,
            od_mobile        = ?,
            od_tax_flag      = ?,
            od_tax_mny       = ?,
            od_vat_mny       = ?,
            od_free_mny      = ?,
            od_cash          = ?,
            od_receipt_time  = ?,
            od_time          = ?,
            od_pwd           = ?,
            od_ip            = ?",
        [
            $od_id_new, $mb_id,
            $input['od_name'], $input['od_tel'] ?? '', $input['od_hp'], $input['od_email'] ?? '',
            $input['od_zip1'], $input['od_zip2'] ?? '',
            $input['od_addr1'], $input['od_addr2'] ?? '', $input['od_addr3'] ?? '', $input['od_addr_jibeon'] ?? '',
            $input['od_b_name'], $input['od_b_tel'], $input['od_b_hp'],
            $input['od_b_zip1'], $input['od_b_zip2'],
            $input['od_b_addr1'], $input['od_b_addr2'], $input['od_b_addr3'], $input['od_b_addr_jibeon'],
            $input['od_memo'] ?? '',
            '[cart_id:' . $cart_id . ']',
            // od_mod_history 에 쿠폰 마커 — confirm 단계에서 coupon_log INSERT 할 때 사용.
            ($appliedCoupon ? shop_api_coupon_marker_line($appliedCoupon['cp_id']) : '') .
            ($appliedSendCoupon ? shop_api_coupon_marker_line($appliedSendCoupon['cp_id'], 'send') : ''),
            $totalPrice, $totalQty, $od_send_cost, $od_send_cost2, $od_send_coupon,
            $od_cart_coupon, $od_coupon, $od_receipt_point, $od_receipt_price,
            // od_test: 웹 주문(shop/orderformupdate.php)처럼 관리자 '결제 테스트' 값을 남겨 관리자 주문 목록에서 테스트 주문을 구분한다.
            $settleCase, $order_pg_service, (int) ($cfg['de_card_test'] ?? 0), '준비', $od_hope_date, $od_mobile, $od_tax_flag,
            (int) $taxAmounts['od_tax_mny'], (int) $taxAmounts['od_vat_mny'], (int) $taxAmounts['od_free_mny'],
            $od_cash,
            $orderTime, $orderTime, $od_pwd, $remoteIp,
        ]
    );

    // 카트 행을 이 준비-중 주문에 묶어둔다 — confirm 에서 매입 성공 시 ct_status='주문'
    // 으로 마무리. 결제 실패/취소 시엔 다시 cart_id 로 되돌리는 로직이 confirm 에 필요.
    if (array_key_exists('ad_subject', $input) || array_key_exists('ad_default', $input) || !empty($input['save_address'])) {
        shop_api_save_order_address_from_input($member, $input);
    }

    $guestUid = '';
    if (!$member) {
        $draftOrder = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? LIMIT 1",
            [$od_id_new]
        );
        if ($draftOrder) {
            $guestUid = shop_api_set_guest_order_cookie($draftOrder);
        }
    }

    $ctIds = array_column($cartItems, 'ct_id');
    if (!empty($ctIds)) {
        $placeholders = implode(',', array_fill(0, count($ctIds), '?'));
        // 읽은 그 장바구니에 아직 쇼핑 중인 줄만 묶는다 — 그새 다른 곳에서 주문된 줄을 다시 '쇼핑'으로 되돌리지 않게.
        $bound = DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET od_id = ?, ct_status = ?
             WHERE ct_id IN ({$placeholders})
               AND od_id = ?
               AND " . shop_api_cart_active_status_sql(),
            array_merge([$od_id_new, shop_api_cart_status_shopping()], $ctIds, [$cart_id], shop_api_cart_active_statuses())
        );
        if ($bound !== count($ctIds)) {
            // 줄을 읽은 뒤 다른 탭 · 기기에서 옮겨졌거나(장바구니 모으기) 지워졌다 — 묶은 줄은 장바구니로 돌려놓고
            // 방금 만든 임시 주문을 지운 뒤 멈춘다. 결제창은 아직 열리지 않았다.
            shop_api_cart_unbind_rows($od_id_new, $cart_id, $ctIds);
            DB::execute(
                "DELETE FROM " . DB::table('g5_shop_order_table') . " WHERE od_id = ? AND od_status = '준비'",
                [$od_id_new]
            );
            shop_api_cart_changed_error();
        }
    }

    // Compute PG-specific signed fields based on active PG
    $cfg = pg_load_config();
    $pg_service = $response_pg_service;
    $pg_extra = [];

    if ($pg_service === 'inicis' || $pg_service === 'kakaopay') {
        $isKakaopay = $pg_service === 'kakaopay';
        $isInicisTest = $isKakaopay ? pg_detect_test_mode($cfg, 'kakaopay') : pg_detect_test_mode($cfg, 'inicis');
        $isInicisMobileModule = (int) $od_mobile === 1;
        $mid = $isKakaopay ? pg_kakaopay_mid($cfg, $isInicisTest) : pg_inicis_mid($cfg, $isInicisTest);
        $signKey = $isKakaopay ? pg_kakaopay_sign_key($cfg, $isInicisTest) : pg_inicis_sign_key($cfg, $isInicisTest);
        $timestamp = (string) (time() * 1000);
        $oid       = $od_id_new;
        $price     = (string) $od_receipt_price;
        $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin', 'app_origin'], $_SERVER['HTTP_ORIGIN'] ?? ''));
        $returnQuery = [
            'amount'     => $od_receipt_price,
            'order_id'   => $od_id_new,
            'pg_service' => $pg_service,
        ];
        if ($targetOrigin !== '*') {
            $returnQuery['target_origin'] = $targetOrigin;
        }
        $pg_extra['inicis'] = [
            'mid'          => $mid,
            'oid'          => $oid,
            'price'        => $price,
            'timestamp'    => $timestamp,
            'signature'    => hash('sha256', "oid={$oid}&price={$price}&timestamp={$timestamp}"),
            'verification' => hash('sha256', "oid={$oid}&price={$price}&signKey={$signKey}&timestamp={$timestamp}"),
            'mKey'         => hash('sha256', $signKey),
            'return_url'   => pg_api_url('/shop/payment/inicis-return', $returnQuery),
            'close_url'    => pg_api_url('/shop/payment/inicis-close', $returnQuery),
            'popup_url'    => pg_api_url('/shop/payment/inicis-popup'),
            'script_url'   => pg_inicis_script_url($isInicisTest),
            'acceptmethod' => $isKakaopay ? 'cardonly' : pg_inicis_accept_method($cfg),
            'module_type'  => $isInicisMobileModule ? 'mobile' : 'pc',
        ];
        if ($isInicisMobileModule) {
            $pg_extra['inicis']['mobile_url'] = pg_inicis_mobile_url($isInicisTest);
            $pg_extra['inicis']['mobile_next_url'] = pg_api_url('/shop/payment/inicis-return', $returnQuery);
            $pg_extra['inicis']['mobile_return_url'] = pg_api_url('/shop/payment/inicis-return', $returnQuery);
            $pg_extra['inicis']['mobile_noti_url'] = '';
            $pg_extra['inicis']['mobile_reserved'] = 'bank_receipt=N&twotrs_isp=Y&block_isp=Y';
        }
        if ($isKakaopay) {
            $pg_extra['inicis']['direct_method'] = 'kakaopay';
            if ($isInicisMobileModule) {
                $pg_extra['inicis']['mobile_reserved'] = 'bank_receipt=N&twotrs_isp=Y&block_isp=Y&d_kakaopay=Y';
            }
        }
        if (!$isInicisTest && $signKey === '') {
            $pg_extra['inicis']['registration_error'] = $isKakaopay
                ? 'KG 이니시스 카카오페이 상점키가 설정되지 않았습니다.'
                : 'KG 이니시스 웹결제 signKey가 설정되지 않았습니다.';
        }
    }
    elseif ($pg_service === 'kcp') {
        $kcpMid = pg_kcp_site_cd($cfg, pg_detect_test_mode($cfg, 'kcp'));
        $isKcpMobileModule = (int) $od_mobile === 1;
        $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin', 'app_origin'], $_SERVER['HTTP_ORIGIN'] ?? ''));
        $returnQuery = [
            'amount'     => $od_receipt_price,
            'order_id'   => $od_id_new,
            'pg_service' => 'kcp',
        ];
        if ($targetOrigin !== '*') {
            $returnQuery['target_origin'] = $targetOrigin;
        }
        $returnUrl = pg_api_url('/shop/payment/kcp-return', $returnQuery);
        $pg_extra['kcp'] = [
            'site_cd' => $kcpMid,
            'return_url' => $returnUrl,
            'module_type' => $isKcpMobileModule ? 'mobile' : 'pc',
            'easy_pay_services' => pg_easy_pay_services($cfg),
            'easy_pay_service' => pg_primary_easy_pay_service($cfg),
            'naverpay_point_enabled' => in_array('used_nhnkcp_naverpay_point', pg_easy_pay_services($cfg), true),
        ];
        if ($isKcpMobileModule) {
            $registered = pg_kcp_register_payment($cfg, (string) $od_id_new, $goodsName, $od_receipt_price, $settleCase, $returnUrl);
            if (!empty($registered['ok'])) {
                $pg_extra['kcp']['approval_key'] = $registered['approval_key'];
                $pg_extra['kcp']['pay_url'] = $registered['pay_url'];
                $pg_extra['kcp']['pay_method'] = $registered['pay_method'];
            } else {
                $pg_extra['kcp']['registration_error'] = $registered['error'] ?? 'KCP 거래등록에 실패했습니다.';
            }
        }
    }
    elseif ($pg_service === 'nicepay') {
        $isNicepayTest = pg_detect_test_mode($cfg, 'nicepay');
        $mid = pg_nicepay_mid($cfg, $isNicepayTest);
        $merchantKey = pg_nicepay_key($cfg, $isNicepayTest);
        $ediDate = date('YmdHis');
        $nicepayModuleType = (int) $od_mobile === 1 ? 'mobile' : 'pc';
        $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin', 'app_origin'], $_SERVER['HTTP_ORIGIN'] ?? pg_request_origin()));
        $returnQuery = [
            'amount'     => $od_receipt_price,
            'order_id'   => $od_id_new,
            'pg_service' => 'nicepay',
        ];
        if ($targetOrigin !== '*') {
            $returnQuery['target_origin'] = $targetOrigin;
        }
        $pg_extra['nicepay'] = [
            'mid'             => $mid,
            'module_type'     => $nicepayModuleType,
            'edi_date'        => $ediDate,
            'sign_data'       => ($mid !== '' && $merchantKey !== '')
                ? pg_nicepay_sign_data($ediDate, $mid, $od_receipt_price, $merchantKey)
                : '',
            'return_url'      => pg_api_url('/shop/payment/nicepay-return', $returnQuery),
            'script_url'      => pg_nicepay_script_url(),
            'mobile_url'      => pg_nicepay_mobile_url(),
            'vbank_exp_date'  => date('Ymd2359', strtotime('+3 days')),
            'easy_pay_services' => pg_easy_pay_services($cfg),
            'easy_pay_service' => pg_primary_easy_pay_service($cfg),
            'trans_type'      => (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? '1' : '0',
            'is_test_mode'    => $isNicepayTest,
        ];
        if ($nicepayModuleType === 'mobile') {
            $wapUrl = pg_nicepay_wap_url();
            $ispCancelUrl = pg_nicepay_isp_cancel_url();
            if ($wapUrl !== '') {
                $pg_extra['nicepay']['wap_url'] = $wapUrl;
            }
            if ($ispCancelUrl !== '') {
                $pg_extra['nicepay']['isp_cancel_url'] = $ispCancelUrl;
            }
        }
        if ($mid === '' || $merchantKey === '') {
            $pg_extra['nicepay']['registration_error'] = 'Nicepay MID/merchantKey is required.';
        }
    }

    Response::success([
        'cart_id'     => (string) $cart_id,
        'order_id'    => (string) $od_id_new,
        'order_name'  => $goodsName,
        'amount'      => $od_receipt_price,
        'tax_flag'    => $od_tax_flag,
        'comm_tax_mny'  => (int) $taxAmounts['od_tax_mny'],
        'comm_vat_mny'  => (int) $taxAmounts['od_vat_mny'],
        'comm_free_mny' => (int) $taxAmounts['od_free_mny'],
        'buyer_name'  => $input['od_name'],
        'buyer_email' => $input['od_email'] ?? '',
        'buyer_tel'   => $input['od_hp'],
        'pg_service'  => $pg_service,
        'pg_extra'    => $pg_extra,
        'uid'         => $guestUid,
    ], 201);
}
