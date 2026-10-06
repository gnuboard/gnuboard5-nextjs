<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if ($apiMethod === 'POST' && $od_id === '') {

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }
    $input = shop_api_clean_order_input($input); // 원본 orderformupdate.php 와 같은 입력 정리

    $clientUid = shop_orders_client_uid($input['client_uid'] ?? '');
    $createLockName = '';
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
        $filterSql = ' AND ct_id IN (' . implode(',', array_fill(0, count($filterCtIds), '?')) . ')';
        $cartParams = array_merge($cartParams, $filterCtIds);
    } else {
        $filterSql = ' AND ct_direct = ' . ($directFilter ? '1' : '0');
    }

    // Accept single od_zip or split od_zip1/od_zip2
    if (!empty($input['od_zip']) && empty($input['od_zip1'])) {
        $zip = preg_replace('/[^0-9]/', '', $input['od_zip']);
        $input['od_zip1'] = substr($zip, 0, 3);
        $input['od_zip2'] = substr($zip, 3);
    }

    // Validate required fields (orderer side)
    $requiredFields = ['od_name', 'od_hp', 'od_zip1', 'od_addr1'];
    $errors = [];
    foreach ($requiredFields as $field) {
        if (empty($input[$field])) {
            $errors[$field] = $field . ' is required.';
        }
    }
    $guestOrderPassword = '';
    if (!$member) {
        $guestOrderPassword = shop_api_guest_order_password($input);
        if (!shop_api_guest_order_password_valid($guestOrderPassword)) {
            $errors['od_pwd'] = 'Guest order password must be at least 3 letters or numbers.';
        }
    }
    if (!empty($errors)) {
        Response::error('Validation failed.', 422, $errors);
    }

    // Recipient fields: fall back to orderer if not provided (주문자와 동일)
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

    try {
        $createLockName = shop_orders_acquire_create_lock($cart_id, $clientUid, 10, (string) $mb_id);
    } catch (RuntimeException $e) {
        Response::error($e->getMessage(), 409);
    }
    register_shutdown_function(static function () use ($createLockName): void {
        shop_orders_release_create_lock($createLockName);
    });

    $existingClientOrder = shop_orders_find_by_client_uid($clientUid, $mb_id);
    // 비회원 재시도는 그 주문의 비밀번호를 다시 낸 사람에게만 돌려준다 — 재시도 키만으로는 남의 주문을 받지 못하게.
    // 비밀번호 대조에는 주문 조회(orders.php lookup)와 같은 키로 실패 횟수를 센다 — 두 길이 한도를 나눠 쓰지 못하게.
    if ($existingClientOrder && !$member) {
        $retryIp = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
        $retryKey = '__order__' . substr((string) $existingClientOrder['od_id'], 0, 40);
        if (Throttle::checkLoginAttempt($retryKey, $retryIp) !== null) {
            shop_orders_release_create_lock($createLockName);
            Response::error('주문 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
        }
        if (!shop_api_guest_order_password_matches($guestOrderPassword, (string) ($existingClientOrder['od_pwd'] ?? ''))) {
            Throttle::recordLoginFailure($retryKey, $retryIp);
            shop_orders_release_create_lock($createLockName);
            Response::error('이미 접수된 주문 요청입니다. 주문 조회에서 확인해 주세요.', 409, ['code' => 'duplicate_client_uid']);
        }
        Throttle::resetLoginAttempts($retryKey, $retryIp);
    }
    if ($existingClientOrder) {
        $guestUid = '';
        if (!$member) {
            $guestUid = shop_api_set_guest_order_cookie($existingClientOrder);
            $existingClientOrder['uid'] = $guestUid;
        }
        $existingClientOrder['od_id'] = (string) $existingClientOrder['od_id'];
        shop_orders_release_create_lock($createLockName);
        Response::success([
            'cart_id' => (string) $cart_id,
            'order' => shop_orders_client_row($existingClientOrder),
            'od_id' => (string) $existingClientOrder['od_id'],
            'uid' => $guestUid,
            'items' => [],
            'total_price' => shop_orders_total_price($existingClientOrder),
            'saved_address' => null,
            'duplicate' => true,
        ], 200);
    }

    // 카드 결제 창을 닫고 무통장으로 바꿔 주문하면 줄이 아직 결제 준비(임시 주문)에 묶여 있다 — 결제 준비와 같이 먼저 되돌린다.
    if (!empty($filterCtIds)) {
        shop_api_restore_pending_cart_rows_by_ct_ids(
            $member,
            $filterCtIds,
            '결제 취소: 무통장 주문으로 임시 주문 복구'
        );
    }

    // Get current cart items (not yet ordered) — ct_point / cp_price / ct_history 도 함께.
    //   cp_price: 상품/카테고리 쿠폰으로 미리 묶어둔 할인액.
    //   ct_history: coupon_markers.php 마커로 어떤 상품쿠폰이 묶였는지 — confirm/finalize 에서 log INSERT.
    $cartItems = DB::fetchAll(
        "SELECT ct_id, it_id, it_name, ct_price, ct_qty, ct_option, ct_point, cp_price, ct_notax,
                io_id, io_type, io_price, ct_history
         FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           {$filterSql}
           AND " . shop_api_cart_active_status_sql(),
        array_merge($cartParams, shop_api_cart_active_statuses())
    );

    if (empty($cartItems)) {
        $cartItems = DB::fetchAll(
            "SELECT ct_id, it_id, it_name, ct_price, ct_qty, ct_option, ct_point, cp_price, ct_notax,
                    io_id, io_type, io_price, ct_history
              FROM " . DB::table('g5_shop_cart_table') . "
              WHERE od_id = ?
                {$filterSql}
                AND " . shop_api_cart_active_status_sql(),
            array_merge($cartParams, shop_api_cart_active_statuses())
        );
    }

    shop_api_cart_require_shown_rows($cartItems, $filterCtIds);

    if (empty($cartItems)) {
        Response::error('Cart is empty. Add items before placing an order.', 400);
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

    // 배송비 — 기본 + 지역별(g5_shop_sendcost 도서산간) 분리.
    //   od_send_cost  : 기본 배송비 (50,000원 이상 무료)
    //   od_send_cost2 : 추가 배송비 (도서산간)
    $sc = shop_api_send_cost($totalPrice, $input['od_b_zip1'] ?? '', $input['od_b_zip2'] ?? '');
    $od_send_cost  = shop_api_cart_send_cost(
        $cart_id,
        !empty($filterCtIds) ? $filterCtIds : null,
        $directFilter
    );
    $od_send_cost2 = $sc['extra'];

    // 카트 행에 미리 묶인 상품/카테고리 쿠폰 — SUM(cp_price) 으로 cart_coupon 합산.
    // 비회원도 cp_price 가 0이면 영향 없음 (실제로 비회원은 적용 못 함).
    $od_cart_coupon = 0;
    foreach ($cartItems as $ci) {
        $od_cart_coupon += (int) ($ci['cp_price'] ?? 0);
    }
    $orderCouponBase = max(0, $totalPrice - $od_cart_coupon);

    // 쿠폰 + 포인트 — 로그인 회원만 사용 가능. 비회원이 cp_id/point_use 보내도 무시.
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
            // 사용 불가 쿠폰이면 조용히 무시 — 주문 자체를 실패시키진 않음.
        }
    }

    $od_receipt_point = 0;
    if ($mb_id !== '' && isset($input['point_use'])) {
        // 포인트는 상품가에서만 차감 가능 (배송비 제외) — gnuboard5 표준.
        $maxFromOrder = max(0, $orderCouponBase - $od_coupon);
        $od_receipt_point = shop_api_point_clamp($input['point_use'], $mb_id, $maxFromOrder);
    }

    // 배송비 쿠폰 (cp_method=3) — 별도 입력 cp_id_send 로 받음. 일반 주문쿠폰과 독립.
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

    $payableAmount = $totalPrice + $od_send_cost + $od_send_cost2
                      - $od_coupon - $od_cart_coupon - $od_send_coupon - $od_receipt_point;
    if ($payableAmount < 0) $payableAmount = 0;

    // Settlement case (payment method): Korean label expected by gnuboard5
    $allowedSettleCases = ['무통장', '가상계좌', '계좌이체', '신용카드', '휴대폰', '간편결제'];
    $settleCase = isset($input['od_settle_case']) ? trim($input['od_settle_case']) : '무통장';
    if (!in_array($settleCase, $allowedSettleCases, true)) {
        $settleCase = '무통장';
    }

    // Goods name (e.g. "상품명1 외 2건")
    $goodsName = $goodsNames[0] ?? '상품';
    if (count($goodsNames) > 1) {
        $goodsName .= ' 외 ' . (count($goodsNames) - 1) . '건';
    }

    // YoungCart status semantics:
    // - 주문: order received / awaiting bank or virtual-account deposit.
    // - 입금: payment has actually been received.
    $orderTime = date('Y-m-d H:i:s');
    $od_receipt_price = $payableAmount;
    $od_misu = 0;
    $od_receipt_time = $orderTime;
    $od_status = '주문';
    if ($settleCase === '무통장') {
        $od_receipt_price = 0;
        $od_misu = $payableAmount;
        // Original YoungCart stores 0000-00-00 00:00:00 for unpaid bank orders,
        // but this local MySQL runs with strict zero-date checks.
        $od_receipt_time = $od_misu === 0 ? $orderTime : '1000-01-01 00:00:00';
        $od_status = $od_misu === 0 ? '입금' : '주문';
    }

    // Use a valid DATE value because local MySQL may run with strict zero-date checks.
    $od_hope_date = date('Y-m-d');
    if (!empty($input['od_hope_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['od_hope_date'])) {
        $od_hope_date = $input['od_hope_date'];
    }
    // 모바일 주문 감지 — User-Agent 기반. PC 도 동일 흐름이라 표시 정보만.
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $od_mobile = preg_match('/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i', $ua) ? 1 : 0;

    // 세금계산서/현금영수증 신청 플래그.
    //   od_tax_flag=1 — 사업자 세금계산서 발급 신청.
    //   od_cash=1     — 가상계좌/계좌이체 결제 시 현금영수증 발급 신청
    //                   (실제 영수증 번호는 PG 가 발급 → confirm 후 od_cash_no/od_cash_info 채워짐)
    $taxAmounts = shop_api_order_tax_amounts(
        $cartItems,
        $od_send_cost,
        $od_send_cost2,
        $od_coupon,
        $od_send_coupon,
        $od_receipt_point,
        $payableAmount
    );
    $od_tax_flag = (int) $taxAmounts['od_tax_flag'];
    $od_cash     = !empty($input['od_cash_request']) ? 1 : 0;

    // Generate order ID: YmdHis + 4 random digits — 아직 쓰이지 않은 번호로(같은 초에 겹치지 않게).
    $od_id_new = shop_api_new_order_id();
    $remoteIp = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($member && !empty($member['mb_password'])) {
        $od_pwd = $member['mb_password'];
    } else {
        $od_pwd = shop_api_order_password_hash($guestOrderPassword);
    }

    $newOrder = null;
    $savedAddress = null;
    $orderTxActive = false;
    // 끝내지 못했을 때 되돌릴 것(shop_orders_undo_failed_create) — 묶은 줄, 주문 행을 넣었나, 재고를 줄였나.
    $ctIds = [];
    $orderInserted = false;
    $stockDecremented = false;

    try {
        DB::beginTransaction();
        $orderTxActive = true;

    // Move cart items to order first: YoungCart stores cart row status equal to order status.
    // 묶인 줄은 쇼핑 중이 아니어서 장바구니 모으기 · 다른 주문이 가져가지 못한다. 줄을 읽은 뒤 다른 탭 · 기기에서
    // 옮겨졌거나(장바구니 모으기) 지워졌으면, 아직 주문 · 쿠폰 기록을 쓰기 전에 멈춘다 — catch 가 묶은 줄을 장바구니로
    // 돌려놓고(MyISAM 이면 트랜잭션 되돌리기가 듣지 않는다) 409 CART_CHANGED 로 답한다.
    $ctIds = array_column($cartItems, 'ct_id');
    $placeholders = implode(',', array_fill(0, count($ctIds), '?'));
    $bound = DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET od_id = ?,
             mb_id = ?,
             ct_status = ?
         WHERE ct_id IN ({$placeholders})
           AND od_id = ?
           AND " . shop_api_cart_active_status_sql(),
        array_merge([$od_id_new, $mb_id, $od_status], $ctIds, [$cart_id], shop_api_cart_active_statuses())
    );
    if ($bound !== count($ctIds)) {
        throw new ShopApiCartChangedException('Cart rows changed while creating the order.');
    }

    // Insert order
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
            od_mod_history   = '',
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
            od_misu          = ?,
            od_settle_case   = ?,
            od_bank_account  = ?,
            od_deposit_name  = ?,
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
            $od_id_new,
            $mb_id,
            $input['od_name'],
            $input['od_tel'] ?? '',
            $input['od_hp'],
            $input['od_email'] ?? '',
            $input['od_zip1'],
            $input['od_zip2'] ?? '',
            $input['od_addr1'],
            $input['od_addr2'] ?? '',
            $input['od_addr3'] ?? '',
            $input['od_addr_jibeon'] ?? '',
            $input['od_b_name'],
            $input['od_b_tel'],
            $input['od_b_hp'],
            $input['od_b_zip1'],
            $input['od_b_zip2'],
            $input['od_b_addr1'],
            $input['od_b_addr2'],
            $input['od_b_addr3'],
            $input['od_b_addr_jibeon'],
            $input['od_memo'] ?? '',
            shop_orders_client_uid_marker($clientUid),
            $totalPrice,
            $totalQty,
            $od_send_cost,
            $od_send_cost2,
            $od_send_coupon,
            $od_cart_coupon,
            $od_coupon,
            $od_receipt_point,
            $od_receipt_price,
            $od_misu,
            $settleCase,
            $input['od_bank_account'] ?? '',
            $input['od_deposit_name'] ?? '',
            $od_status,
            $od_hope_date,
            $od_mobile,
            $od_tax_flag,
            (int) $taxAmounts['od_tax_mny'],
            (int) $taxAmounts['od_vat_mny'],
            (int) $taxAmounts['od_free_mny'],
            $od_cash,
            $od_receipt_time,
            $orderTime,
            $od_pwd,
            $remoteIp,
        ]
    );
    $orderInserted = true;

    // 쿠폰/포인트 실제 사용 기록 — 무통장 흐름에선 주문 INSERT 직후 즉시 확정.
    // (PG 결제는 prepare/confirm 두 단계라 confirm 에서 별도 처리)
    if ($appliedCoupon) {
        DB::execute(
            "INSERT INTO " . DB::table('g5_shop_coupon_log_table') . "
             SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
            [$appliedCoupon['cp_id'], $mb_id, $od_id_new, $od_coupon, $orderTime]
        );
    }
    if ($appliedSendCoupon) {
        DB::execute(
            "INSERT INTO " . DB::table('g5_shop_coupon_log_table') . "
             SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
            [$appliedSendCoupon['cp_id'], $mb_id, $od_id_new, $od_send_coupon, $orderTime]
        );
    }

    // 상품/카테고리 쿠폰 (cart row 단위) — ct_history 쿠폰 마커 파싱해 coupon_log 기록.
    // 한 주문 안의 같은 쿠폰은 위 재평가가 한 줄만 남긴다. 다른 주문이 이미 쓴 쿠폰이면 unique (cp_id, mb_id) 위반이
    // 예외로 올라와 이 주문 전체를 되돌린다(원본 orderformupdate.php 처럼 "중복 = 주문 실패") — IGNORE 로 삼키면
    // 할인만 그대로 남는다.
    if ($mb_id !== '') {
        foreach ($cartItems as $ci) {
            if (empty($ci['cp_price']) || empty($ci['ct_history'])) continue;
            $rowCpId = shop_api_coupon_marker_extract($ci['ct_history']);
            if ($rowCpId === '') continue;
            DB::execute(
                "INSERT INTO " . DB::table('g5_shop_coupon_log_table') . "
                 SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
                [$rowCpId, $mb_id, $od_id_new, (int) $ci['cp_price'], $orderTime]
            );
        }
    }
    // YoungCart grants purchase points when the order reaches the completion flow,
    // not at the initial order creation / bank-deposit waiting step.

    shop_api_decrement_order_stock($cartItems);
    $stockDecremented = true;
    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET ct_stock_use = 1
         WHERE od_id = ?",
        [$od_id_new]
    );

    // Fetch the created order
    $newOrder = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? LIMIT 1",
        [$od_id_new]
    );
    $savedAddress = shop_api_save_order_address_from_input($member, $input);

    if ($od_receipt_point > 0 && function_exists('insert_point')) {
        shop_api_debit_member_point(
            $mb_id,
            $od_receipt_point,
            '주문번호 ' . $od_id_new . ' 결제'
        );
    }

        if ($orderTxActive) {
            DB::commit();
            $orderTxActive = false;
        }
        shop_orders_release_create_lock($createLockName);
        $createLockName = '';
    } catch (Throwable $e) {
        if ($orderTxActive) {
            DB::rollBack();
            // 주문을 끝내지 못했다 — 이 요청이 쓴 것(묶은 줄 · 주문 행 · 쿠폰 기록 · 재고)을 되돌린다(MyISAM 이면
            // 트랜잭션 되돌리기가 듣지 않는다).
            shop_orders_undo_failed_create([
                'od_id' => $od_id_new,
                'cart_id' => $cart_id,
                'ct_ids' => $ctIds,
                'mb_id' => $mb_id,
                'cart_items' => $cartItems,
                'order_inserted' => $orderInserted,
                'stock_decremented' => $stockDecremented,
            ]);
        }
        shop_orders_release_create_lock($createLockName);
        $createLockName = '';
        if ($e instanceof ShopApiCartChangedException) {
            shop_api_cart_changed_error();
        }
        $message = $e instanceof RuntimeException ? $e->getMessage() : '주문 처리 중 오류가 발생했습니다.';
        Response::error($message, 409);
    }

    // Cast od_id to string - bigint exceeds JS Number.MAX_SAFE_INTEGER
    $guestUid = '';
    if ($newOrder) {
        if (!$member) {
            $guestUid = shop_api_set_guest_order_cookie($newOrder);
            $newOrder['uid'] = $guestUid;
        }
        $newOrder['od_id'] = (string) $newOrder['od_id'];
    }

    // 주문 접수 알림 메일 — 구매자 + 운영자. cf_email_use=0 이면 자동 skip.
    shop_api_send_order_mail($od_id_new, 'placed');
    shop_api_defer_order_push((string) $od_id_new, 'placed');

    Response::success([
        'cart_id'     => (string) $cart_id,
        'order'       => $newOrder ? shop_orders_client_row($newOrder) : $newOrder,
        'od_id'       => (string) $od_id_new,
        'uid'         => $guestUid,
        'items'       => $cartItems,
        'total_price' => $payableAmount,
        'saved_address' => $savedAddress,
    ], 201);
}

// =========================================================================
// PATCH /v1/shop/orders/{od_id}  — 주문 취소 (사용자 본인)
//
// 취소 가능 상태: 주문(입금 전 주문 접수), 준비(draft).
// YoungCart 원본처럼 입금/배송/완료/취소 상태는 고객 직접 취소를 거부한다.
//
// 부수 효과 (원복):
//   1) 영카트 원본처럼 옵션 행은 옵션 재고만, 일반 행은 상품 재고만 복구
//   2) 카트 행 ct_status='취소'
//   3) 사용 포인트 환급 (insert_point 양수, rel_table='@order', action='cancel')
//   4) 적립 포인트 회수 (insert_point 음수, rel_action='cancel_buy')
//   5) 사용 쿠폰 로그 삭제 (재사용 가능하도록)
//   6) od_status='취소', od_cancel_price=원금, od_refund_price=PG 취소금액,
//      od_mod_history 에 취소 사유 추가
//   7) PG 결제면 로컬 원복 전에 Toss/KCP/Inicis/Nicepay 실제 취소 API 먼저 호출
// =========================================================================
