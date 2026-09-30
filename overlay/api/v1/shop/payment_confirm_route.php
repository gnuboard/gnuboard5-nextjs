<?php
if (!defined('_GNUBOARD_')) {
    exit;
}
require_once __DIR__ . '/coupon_markers.php';
require_once __DIR__ . '/payment_confirm_providers.php';
// =========================================================================
// POST /v1/shop/payment/confirm
// PG-side verification + order finalization
// Body: { pg_service, order_id, amount, payment_key (toss), tid (others), ... }
// =========================================================================
if ($apiMethod === 'POST' && $action === 'confirm') {

    $member = Auth::getUser();
    $mb_id  = !empty($member['mb_id']) ? $member['mb_id'] : '';

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $pg_service = strtolower(pg_mobile_request_value($input, ['pg_service', 'provider']));
    $order_id   = pg_mobile_request_value($input, ['order_id', 'orderId', 'ordr_idxx', 'MOID', 'Moid', 'oid']);
    $amountRaw  = pg_mobile_request_value($input, ['amount', 'Amt', 'TotPrice', 'good_mny', 'price'], '0');
    $amount     = (int) preg_replace('/[^0-9]/', '', $amountRaw);

    if (!$pg_service || !$order_id || $amount <= 0) {
        Response::error('pg_service, order_id, amount required.', 422);
    }

    // Verify draft order exists and matches amount
    $order = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? AND mb_id = ? LIMIT 1",
        [$order_id, $mb_id]
    );

    if (!$order) {
        Response::error('Order not found.', 404);
    }
    // SC-03: 게스트 uid 는 본문 `uid` 도 받는다(본문 → ?uid= → 쿠키 → 세션).
    if (!$member && !shop_api_can_view_guest_order($order, trim((string) ($input['uid'] ?? '')))) {
        Response::error('Order not found.', 404);
    }
    $expectedConfirmAmount = (int) ($order['od_receipt_price'] ?? 0) + (int) ($order['od_misu'] ?? 0);
    if ($expectedConfirmAmount !== $amount) {
        Response::error('Amount mismatch.', 422);
    }
    $preparedPg = trim((string) ($order['od_pg'] ?? ''));
    $preparedPgNormalized = strtolower($preparedPg);
    if ($preparedPg !== '' && $preparedPgNormalized !== $pg_service) {
        Response::error('Payment provider mismatch.', 422);
    }
    if ($order['od_status'] !== '준비') {
        $storedTno = trim((string) ($order['od_tno'] ?? ''));
        $requestTno = pg_mobile_request_value($input, [
            'payment_key', 'paymentKey',
            'tid', 'TID', 'TxTid', 'P_TID',
            'tno', 'TNO',
        ]);
        if (in_array($order['od_status'], ['주문', '입금'], true)
            && $preparedPgNormalized === $pg_service
            && $storedTno !== ''
            && ($requestTno === '' || $requestTno === $storedTno)) {
            Response::success([
                'order_id' => (string) $order_id,
                'tno'      => $storedTno,
                'status'   => (string) $order['od_status'],
                'already_confirmed' => true,
            ]);
        }
        Response::error('Order is not in pending state.', 400);
    }

    // PG-specific verification
    $cfg = pg_load_config();
    if (!$cfg) {
        Response::error('Shop config not found.', 500);
    }
    $verifyResult = shop_payment_confirm_verify_pg($pg_service, $input, $cfg, (string) $order_id, $amount, $order);

    if (!$verifyResult['ok']) {
        if (!empty($verifyResult['restore_cart'])) {
            // 명확한 실패만 카트 복구. timeout/망취소 실패처럼 PG 승인 가능성이 있으면 보류한다.
            shop_api_restore_pending_order_cart($order, $member, '결제 실패: ' . $verifyResult['error']);
            // SC-02: 오류 envelope 에는 data 가 없으므로 복원 카트 id 는 errors.cart_id 로 준다.
            Response::error('Payment verification failed: ' . $verifyResult['error'], 400, [
                'cart_id' => shop_api_last_cart_id(),
            ]);
        }

        pg_append_order_history((string) $order_id, '결제 대사 필요: ' . (string) $verifyResult['error']);
        // SC-14: 앱은 message 대신 errors.code 로 분기한다(재전송 금지 → 고객센터 안내).
        Response::error('Payment result requires manual reconciliation: ' . $verifyResult['error'], 409, [
            'code' => 'manual_reconciliation',
        ]);
    }

    $lock = pg_payment_confirm_acquire_lock((string) $order_id);
    if (empty($lock['ok'])) {
        // SC-14: confirm_in_progress(다른 확인이 진행 중 — 2/4/8초 백오프) | lock_busy(락 오류 — 짧게 재시도)
        Response::error('Payment confirmation is already in progress. Please retry shortly.', 409, [
            'code' => (string) ($lock['code'] ?? '') !== '' ? (string) $lock['code'] : 'confirm_in_progress',
            'lock_error' => (string) ($lock['error'] ?? ''),
        ]);
    }

    $lockName = (string) ($lock['lock'] ?? '');
    $txReport = pg_payment_confirm_transaction_report();
    $txActive = false;
    $legacyTxActive = false;
    try {
        // 락 획득 뒤 다시 읽어 중복 confirm 과 레이스를 막는다.
        $lockedOrder = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? LIMIT 1",
            [$order_id]
        );
        if (!$lockedOrder) {
            throw new RuntimeException('Order not found during confirmation.');
        }

        $lockedStatus = (string) ($lockedOrder['od_status'] ?? '');
        $lockedTno = (string) ($lockedOrder['od_tno'] ?? '');
        if ($lockedStatus !== '준비') {
            if (in_array($lockedStatus, ['주문', '입금'], true)
                && ($lockedTno === '' || $lockedTno === (string) $verifyResult['tno'])) {
                $alreadyConfirmedUid = '';
                if (!$member && empty($lockedOrder['mb_id'])) {
                    $alreadyConfirmedUid = shop_api_set_guest_order_cookie($lockedOrder);
                }
                pg_payment_confirm_release_lock($lockName);
                Response::success([
                    'order_id' => (string) $order_id,
                    'tno'      => $lockedTno !== '' ? $lockedTno : (string) $verifyResult['tno'],
                    'status'   => $lockedStatus,
                    'uid'      => $alreadyConfirmedUid,
                    'already_confirmed' => true,
                ]);
            }

            throw new RuntimeException('Order status changed during confirmation: ' . $lockedStatus);
        }
        $order = $lockedOrder;

        // 리플레이 방지: 동일 PG 거래번호(tno/paymentKey)가 다른 주문에 이미 사용됐는지 검사.
        //   od_tno 는 준비중 주문에서 '' 라 DB UNIQUE 인덱스 대신 앱 레벨로 검사한다
        //   (다중 '' 충돌로 INSERT 가 깨지는 것을 피하면서 주문 간 자격증명 재사용을 차단).
        $confirmTno = (string) ($verifyResult['tno'] ?? '');
        if ($confirmTno !== '') {
            $tnoOwner = DB::fetch(
                "SELECT od_id FROM " . DB::table('g5_shop_order_table') . "
                 WHERE od_tno = ? AND od_id <> ? LIMIT 1",
                [$confirmTno, $order_id]
            );
            if ($tnoOwner) {
                pg_append_order_history(
                    $order_id,
                    "{$pg_service} 거래번호 중복 차단: tno={$confirmTno} 는 주문 " . (string) $tnoOwner['od_id'] . " 에 이미 사용됨"
                );
                throw new RuntimeException('Transaction id already used by another order.');
            }
        }

        if (!empty($txReport['transactional'])) {
            DB::beginTransaction();
            $txActive = true;
            pg_legacy_transaction_query('START TRANSACTION');
            $legacyTxActive = true;
        }

    $cartItems = DB::fetchAll(
        "SELECT it_id, it_name, ct_qty, ct_option, io_id, io_type FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?",
        [$order_id]
    );
    shop_api_validate_order_stock($cartItems);

    // prepare 단계에서 이미 cart 행을 이 주문에 묶어둠 → ct_status 만 '주문' 으로.
    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET ct_status = ?
         WHERE od_id = ?",
        ['주문', $order_id]
    );

    shop_api_decrement_order_stock($cartItems);
    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET ct_stock_use = 1
         WHERE od_id = ?",
        [$order_id]
    );

    // 결제 수단별 최종 상태 — YoungCart 기준 가상계좌는 입금 대기(주문),
    // 나머지 즉시 승인 결제는 입금 완료(입금).
    // settle_case 는 prepare 단계에서 저장된 값을 다시 읽어 신뢰성 보장.
    // Toss 위젯은 앱에서 고른 수단과 다른 수단으로 결제될 수 있다 — PG 가 알려 준 실제 수단이 있으면 그것을 쓴다.
    $settleCase = (string) ($verifyResult['settle_case'] ?? '') !== ''
        ? (string) $verifyResult['settle_case']
        : $order['od_settle_case'];
    $bankAccount = '';
    $depositName = '';
    $confirmedAmount = (int) ($order['od_receipt_price'] ?? 0);
    $finalReceiptPrice = $confirmedAmount;
    $finalMisu = 0;
    $finalReceiptTime = date('Y-m-d H:i:s');
    if ($settleCase === '가상계좌') {
        $finalStatus = '주문';
        $finalReceiptPrice = 0;
        $finalMisu = $confirmedAmount;
        $finalReceiptTime = '1000-01-01 00:00:00';
        $bankname  = trim((string) ($input['bankname']  ?? $verifyResult['bankname'] ?? ''));
        $account   = trim((string) ($input['account']   ?? $verifyResult['account'] ?? ''));
        $depositor = trim((string) ($input['depositor'] ?? $verifyResult['depositor'] ?? ''));
        $vaDate    = trim((string) ($input['va_date']   ?? $verifyResult['va_date'] ?? ''));
        if ($bankname !== '' || $account !== '') {
            $bankAccount = trim($bankname . ' ' . $account . ($depositor !== '' ? ' (' . $depositor . ')' : ''));
        }
        if ($vaDate !== '') {
            $bankAccount = trim($bankAccount . ' [입금기한 ' . $vaDate . ']');
        }
        $depositName = $depositor;
    } else {
        $finalStatus = '입금';
    }

    // 결제 결과 반영 — 가상계좌면 od_bank_account 에 은행/계좌 정보 저장.
    $finalPgService = $pg_service === 'kakaopay' ? 'KAKAOPAY' : $pg_service;

    DB::execute(
        "UPDATE " . DB::table('g5_shop_order_table') . "
         SET od_status = ?, od_settle_case = ?, od_pg = ?, od_tno = ?, od_bank_account = ?, od_deposit_name = ?,
             od_receipt_price = ?, od_misu = ?, od_receipt_time = ?
         WHERE od_id = ?",
        [
            $finalStatus,
            $settleCase,
            $finalPgService,
            $verifyResult['tno'],
            $bankAccount,
            $depositName,
            $finalReceiptPrice,
            $finalMisu,
            $finalReceiptTime,
            $order_id,
        ]
    );
    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET ct_status = ?
         WHERE od_id = ?",
        [$finalStatus, $order_id]
    );
    shop_api_save_order_address_from_input($member, $order);

    // 쿠폰/포인트 실제 사용 기록 — 매입 승인된 시점에만 기록.
    //   - prepare 단계에서 이미 주문 row 의 od_coupon / od_receipt_point 에 적용된 금액이 있음.
    //   - 결제 실패 분기에서는 coupon_log 미기록, insert_point 미호출 → 자연 롤백.
    $orderCoupon = (int) ($order['od_coupon'] ?? 0);
    $sendCoupon  = (int) ($order['od_send_coupon'] ?? 0);
    $orderPoint  = (int) ($order['od_receipt_point'] ?? 0);

    // 상품/카테고리 쿠폰 (cart row 단위) — 카트 행마다 ct_history 쿠폰 마커 파싱.
    if ($mb_id !== '') {
        $rowCoupons = DB::fetchAll(
            "SELECT ct_id, cp_price, ct_history FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ? AND cp_price > 0",
            [$order_id]
        );
        foreach ($rowCoupons as $rc) {
            if (empty($rc['ct_history'])) continue;
            $rowCpId = shop_api_coupon_marker_extract($rc['ct_history']);
            if ($rowCpId === '') continue;
            // INSERT IGNORE — unique (cp_id, mb_id) 가 막아주므로 중복 호출도 안전.
            DB::execute(
                "INSERT IGNORE INTO " . DB::table('g5_shop_coupon_log_table') . "
                 SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
                [$rowCpId, $mb_id, $order_id, (int) $rc['cp_price'], date('Y-m-d H:i:s')]
            );
        }
    }

    if ($orderCoupon > 0) {
        // cp_id 결정 우선순위: 1) 클라가 confirm body 로 보낸 값,
        // 2) prepare 단계에서 od_mod_history 에 박아둔 쿠폰 마커.
        $cpId = isset($input['cp_id']) ? (string) $input['cp_id'] : '';
        if ($cpId === '' && !empty($order['od_mod_history'])) {
            $cpId = shop_api_coupon_marker_extract($order['od_mod_history']);
        }
        if ($cpId !== '') {
            // 중복 INSERT 방지 — 동일 (cp_id, mb_id, od_id) 이미 있으면 skip.
            $exists = DB::count(
                "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
                 WHERE cp_id = ? AND mb_id = ? AND od_id = ?",
                [$cpId, $mb_id, $order_id]
            );
            if ($exists === 0) {
                DB::execute(
                    "INSERT INTO " . DB::table('g5_shop_coupon_log_table') . "
                     SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
                    [$cpId, $mb_id, $order_id, $orderCoupon, date('Y-m-d H:i:s')]
                );
            }
        }
    }

    if ($sendCoupon > 0) {
        $sendCpId = isset($input['cp_id_send']) ? (string) $input['cp_id_send'] : '';
        if ($sendCpId === '' && !empty($order['od_mod_history'])) {
            $sendCpId = shop_api_coupon_marker_extract($order['od_mod_history'], 'send');
        }
        if ($sendCpId !== '') {
            $exists = DB::count(
                "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
                 WHERE cp_id = ? AND mb_id = ? AND od_id = ?",
                [$sendCpId, $mb_id, $order_id]
            );
            if ($exists === 0) {
                DB::execute(
                    "INSERT INTO " . DB::table('g5_shop_coupon_log_table') . "
                     SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
                    [$sendCpId, $mb_id, $order_id, $sendCoupon, date('Y-m-d H:i:s')]
                );
            }
        }
    }

    if ($orderPoint > 0 && function_exists('insert_point')) {
        // Match YoungCart orderformupdate.php point ledger content while keeping
        // payment confirmation idempotent for repeated callback requests.
        $pointContent = '주문번호 ' . $order_id . ' 결제';
        $existsPoint = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('point_table') . "
             WHERE mb_id = ?
               AND po_point = ?
               AND po_content = ?",
            [$mb_id, -$orderPoint, $pointContent]
        );
        if ($existsPoint === 0) {
            shop_api_debit_member_point($mb_id, $orderPoint, $pointContent);
        }
        $orderPoint = 0;
    }

    if ($orderPoint > 0 && function_exists('insert_point')) {
        // 동일 주문에 대한 포인트 차감이 이미 기록됐는지 — rel_id 로 idempotent.
        $existsPoint = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('point_table') . "
             WHERE mb_id = ? AND po_rel_table = '@order'
               AND po_rel_id = ? AND po_rel_action = '주문'",
            [$mb_id, (string) $order_id]
        );
        if ($existsPoint === 0) {
            insert_point(
                $mb_id,
                -$orderPoint,
                '주문번호 ' . $order_id . ' 포인트 사용',
                '@order',
                (string) $order_id,
                '주문'
            );
        }
    }

    // YoungCart purchase points are granted by save_order_point() after the order
    // reaches the completion flow, not at PG approval or virtual-account deposit.

        if ($txActive) {
            DB::commit();
            $txActive = false;
        }
        if ($legacyTxActive) {
            pg_legacy_transaction_query('COMMIT');
            $legacyTxActive = false;
        }
    } catch (Throwable $e) {
        if ($txActive) {
            DB::rollBack();
        }
        if ($legacyTxActive) {
            try {
                pg_legacy_transaction_query('ROLLBACK');
            } catch (Throwable $rollbackError) {
                // Best effort; original DB failure is reported below.
            }
        }

        error_log('[api/shop/payment] Order finalization failed: ' . $e->getMessage());
        $internalMessage = '결제 확정 DB 처리 실패: ' . $e->getMessage();
        $message = '결제 확정 처리에 실패했습니다.';
        $localFailureNetCancel = null;
        $localFailureInicisNetCancel = null;
        $localFailureTossCancel = null;
        if ($pg_service === 'toss' && is_array($verifyResult['toss_cancel'] ?? null)) {
            $cancelContext = $verifyResult['toss_cancel'];
            $paymentKey = (string) ($cancelContext['payment_key'] ?? '');
            $cancelReason = 'Order finalization failed after Toss payment confirmation.';
            if ($paymentKey !== '') {
                $localFailureTossCancel = pg_toss_api_request(
                    $cfg,
                    'POST',
                    '/v1/payments/' . rawurlencode($paymentKey) . '/cancel',
                    ['cancelReason' => $cancelReason],
                    'local-failure-cancel-' . hash('sha256', (string) $order_id . '|' . $paymentKey . '|' . (string) ($cancelContext['amount'] ?? 0))
                );
            } else {
                $localFailureTossCancel = ['ok' => false, 'error' => 'Toss paymentKey missing for local failure cancel.'];
            }
            $message .= !empty($localFailureTossCancel['ok'])
                ? ' / Toss cancel requested after local failure.'
                : ' / Toss cancel failed after local failure; manual reconciliation required.';
        } elseif (($pg_service === 'inicis' || $pg_service === 'kakaopay') && is_array($verifyResult['inicis_net_cancel'] ?? null)) {
            $cancelContext = $verifyResult['inicis_net_cancel'];
            $localFailureInicisNetCancel = pg_inicis_net_cancel(
                (string) ($cancelContext['url'] ?? ''),
                is_array($cancelContext['params'] ?? null) ? $cancelContext['params'] : []
            );
            $message .= !empty($localFailureInicisNetCancel['ok'])
                ? ' / Inicis net-cancel requested after local failure.'
                : ' / Inicis net-cancel failed after local failure; manual reconciliation required.';
        } elseif (($pg_service === 'inicis' || $pg_service === 'kakaopay') && is_array($verifyResult['inicis_mobile_net_cancel'] ?? null)) {
            $cancelContext = $verifyResult['inicis_mobile_net_cancel'];
            $localFailureInicisNetCancel = pg_inicis_mobile_net_cancel(
                (string) ($cancelContext['url'] ?? ''),
                (string) ($cancelContext['mid'] ?? ''),
                (string) ($cancelContext['tid'] ?? ''),
                (int) ($cancelContext['amount'] ?? 0)
            );
            $message .= !empty($localFailureInicisNetCancel['ok'])
                ? ' / Inicis mobile net-cancel requested after local failure.'
                : ' / Inicis mobile net-cancel failed after local failure; manual reconciliation required.';
        } elseif ($pg_service === 'nicepay' && is_array($verifyResult['nicepay_net_cancel'] ?? null)) {
            $cancelContext = $verifyResult['nicepay_net_cancel'];
            $localFailureNetCancel = pg_nicepay_net_cancel(
                (string) ($cancelContext['url'] ?? ''),
                (string) ($cancelContext['tid'] ?? ''),
                (string) ($cancelContext['auth_token'] ?? ''),
                (string) ($cancelContext['mid'] ?? ''),
                (int) ($cancelContext['amount'] ?? 0),
                (string) ($cancelContext['merchant_key'] ?? '')
            );
            $message .= !empty($localFailureNetCancel['ok'])
                ? ' / Nicepay net-cancel requested after local failure.'
                : ' / Nicepay net-cancel failed after local failure; manual reconciliation required.';
        }
        try {
            pg_append_order_history((string) $order_id, $internalMessage . ' / tx=' . (!empty($txReport['transactional']) ? 'on' : 'off'));
        } catch (Throwable $historyError) {
            // DB 자체가 실패한 경우 히스토리 기록도 실패할 수 있다.
        }
        pg_payment_confirm_release_lock($lockName);

        Response::error($message . ' PG 승인 여부와 주문 상태를 대사해야 합니다.', 409, [
            'code' => 'manual_reconciliation', // SC-14
            'transactional' => !empty($txReport['transactional']),
            'engine_report' => $txReport,
            'toss_cancel' => $localFailureTossCancel,
            'inicis_net_cancel' => $localFailureInicisNetCancel,
            'nicepay_net_cancel' => $localFailureNetCancel,
        ]);
    }

    pg_payment_confirm_release_lock($lockName);

    // 결제 결과 알림 메일 — 가상계좌는 계좌 발급/입금대기 안내, 나머지는 결제 완료 안내.
    shop_api_send_order_mail((string) $order_id, $settleCase === '가상계좌' && $finalStatus === '주문' ? 'placed' : 'paid');
    shop_api_defer_order_push((string) $order_id, $settleCase === '가상계좌' && $finalStatus === '주문' ? 'placed' : 'paid');

    $guestUid = '';
    if (!$member && empty($order['mb_id'])) {
        $guestUid = shop_api_set_guest_order_cookie($order);
    }

    Response::success([
        'order_id' => (string) $order_id,
        'tno'      => $verifyResult['tno'],
        'status'   => $finalStatus,
        'uid'      => $guestUid,
    ]);
}
