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
    // 회원은 주문 만들기(무통장)와 같은 회원 잠금도 잡는다 — 다른 주문의 확정과 동시에 같은 쿠폰을 쓰지 못하게.
    // 못 잡으면 PG 를 취소하지 않고 "진행 중"으로 돌려보낸다(앱이 다시 시도한다). 이름 잠금을 하나만 드는 옛 DB 에서는
    // 둘째 잠금이 위 주문 잠금을 풀어 버리므로 잡지 않는다 — 그때도 쿠폰 중복은 아래 INSERT 가 막는다(PG 취소).
    $memberLockName = '';
    if ($mb_id !== '' && DB::supportsMultipleNamedLocks()) {
        $memberLockName = shop_api_member_order_lock_name($mb_id);
        $memberLock = DB::fetch('SELECT GET_LOCK(?, 10) AS got_lock', [$memberLockName]);
        if ((int) ($memberLock['got_lock'] ?? 0) !== 1) {
            pg_payment_confirm_release_lock($lockName);
            Response::error('Payment confirmation is already in progress. Please retry shortly.', 409, [
                'code' => 'confirm_in_progress',
            ]);
        }
    }
    $txReport = pg_payment_confirm_transaction_report();
    $txActive = false;
    $legacyTxActive = false;
    $couponsLogged = false; // 이 요청이 쿠폰 사용 기록을 쓰기 시작했는지 — 실패하면 catch 가 이 주문의 기록을 지운다
    $couponLogging = false; // 쿠폰 사용 기록을 쓰는 중 — 여기서 난 중복 키 오류는 "다른 주문이 이미 쓴 쿠폰"이다
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
                pg_payment_confirm_release_lock($memberLockName);
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

        // 주문 · 배송비 쿠폰은 결제 준비가 주문에 적어 둔 마커가 기준이다 — 앱이 보낸 cp_id 를 앞세우면 다른 값을 보내
        // 실제로 할인받은 쿠폰을 "쓰지 않은" 채로 남겨 다시 쓸 수 있었다. 마커가 없는 옛 준비 주문만 보낸 값을 쓴다.
        $orderCpId = shop_api_coupon_marker_extract((string) ($order['od_mod_history'] ?? ''));
        if ($orderCpId === '') {
            $orderCpId = (string) ($input['cp_id'] ?? '');
        }
        $sendCpId = shop_api_coupon_marker_extract((string) ($order['od_mod_history'] ?? ''), 'send');
        if ($sendCpId === '') {
            $sendCpId = (string) ($input['cp_id_send'] ?? '');
        }

        // 이 주문의 쿠폰을 다른 주문이 이미 썼으면 아무것도 바꾸기 전에 멈춘다 — catch 가 PG 승인을 취소하고 409 로
        // 답한다(원본 orderformupdate.php 의 "쿠폰 중복 = 결제 취소"). 결제 준비는 사용 기록을 남기지 않으므로
        // 장바구니 여럿에서 같은 쿠폰으로 결제 준비를 해 둘 수 있다.
        if ($mb_id !== '') {
            $couponIds = [];
            foreach (DB::fetchAll(
                "SELECT ct_history FROM " . DB::table('g5_shop_cart_table') . " WHERE od_id = ? AND cp_price > 0",
                [$order_id]
            ) as $rc) {
                $couponIds[] = shop_api_coupon_marker_extract((string) $rc['ct_history']);
            }
            if ((int) ($order['od_coupon'] ?? 0) > 0) {
                $couponIds[] = $orderCpId;
            }
            if ((int) ($order['od_send_coupon'] ?? 0) > 0) {
                $couponIds[] = $sendCpId;
            }
            foreach (array_unique(array_filter($couponIds)) as $couponId) {
                $usedElsewhere = DB::count(
                    "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
                     WHERE cp_id = ? AND mb_id = ? AND od_id <> ?",
                    [$couponId, $mb_id, $order_id]
                );
                if ($usedElsewhere > 0) {
                    throw new RuntimeException('Coupon already used by another order.');
                }
            }
        }

        if (!empty($txReport['transactional'])) {
            DB::beginTransaction();
            $txActive = true;
            pg_legacy_transaction_query('START TRANSACTION');
            $legacyTxActive = true;
        }

    // 쿠폰 사용 기록 — 장바구니 · 재고 · 주문 상태를 바꾸기 전에 먼저 쓴다. 다른 주문이 쓴 쿠폰이면 unique (cp_id, mb_id)
    // 위반이 여기서 예외로 올라와, 아무것도 바뀌지 않은 채 catch 가 PG 를 취소한다(쇼핑 표가 MyISAM 이라 앞서 바꾼 것을
    // 되돌릴 수 없다). 뒤에서 실패하면 catch 가 이 주문의 쿠폰 기록을 지운다. prepare 단계에서 주문 row 의
    // od_coupon / od_receipt_point 에 적용 금액이 이미 있다.
    $orderCoupon = (int) ($order['od_coupon'] ?? 0);
    $sendCoupon  = (int) ($order['od_send_coupon'] ?? 0);
    $orderPoint  = (int) ($order['od_receipt_point'] ?? 0);

    // 쓰기 전에 켠다 — 둘째 INSERT 가 실패해도 catch 가 앞서 쓴 이 주문의 기록을 지워, 결제 안 된 주문이 쿠폰을 쥐지 않게.
    $couponsLogged = true;
    $couponLogging = true;

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
            // 이 주문에 이미 적혀 있으면 건너뛰고, 아니면 그냥 INSERT — 다른 주문이 쓴 쿠폰이면 unique (cp_id, mb_id)
            // 위반이 예외로 올라와 catch 가 PG 를 취소한다(IGNORE 로 삼키면 할인만 남았다).
            $rowLogged = DB::count(
                "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
                 WHERE cp_id = ? AND mb_id = ? AND od_id = ?",
                [$rowCpId, $mb_id, $order_id]
            );
            if ($rowLogged === 0) {
                DB::execute(
                    "INSERT INTO " . DB::table('g5_shop_coupon_log_table') . "
                     SET cp_id = ?, mb_id = ?, od_id = ?, cp_price = ?, cl_datetime = ?",
                    [$rowCpId, $mb_id, $order_id, (int) $rc['cp_price'], date('Y-m-d H:i:s')]
                );
            }
        }
    }

    if ($orderCoupon > 0) {
        $cpId = $orderCpId; // 결제 준비가 적어 둔 마커 우선(위에서 정함)
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
        if ($sendCpId !== '') { // 결제 준비가 적어 둔 마커 우선(위에서 정함)
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
    $couponLogging = false;

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
        if ($couponsLogged && $mb_id !== '') {
            // 확정하지 못한 주문의 쿠폰 사용 기록은 지운다(PG 를 취소하므로 쿠폰은 다시 쓸 수 있어야 한다).
            try {
                DB::execute("DELETE FROM " . DB::table('g5_shop_coupon_log_table') . " WHERE od_id = ? AND mb_id = ?", [$order_id, $mb_id]);
            } catch (Throwable $couponUndoError) {
                // 아래 대사 기록에 원래 오류가 남는다.
            }
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
        // 다른 주문이 이미 쓴 쿠폰 — 위 사전 검사에 걸렸거나, 그 뒤 끼어든 주문 때문에 사용 기록 INSERT 가 unique 에 걸렸다.
        $couponConflict = $e->getMessage() === 'Coupon already used by another order.'
            || ($couponLogging && $e instanceof PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062);
        $pgCancel = null; // 이 PG 의 취소 결과 — null 이면 자동 취소 경로가 없다
        if ($pg_service === 'toss' && is_array($verifyResult['toss_cancel'] ?? null)) {
            $cancelContext = $verifyResult['toss_cancel'];
            $paymentKey = (string) ($cancelContext['payment_key'] ?? '');
            $cancelReason = 'Order finalization failed after Toss payment confirmation.';
            if ($paymentKey !== '') {
                $pgCancel = pg_toss_api_request(
                    $cfg,
                    'POST',
                    '/v1/payments/' . rawurlencode($paymentKey) . '/cancel',
                    ['cancelReason' => $cancelReason],
                    'local-failure-cancel-' . hash('sha256', (string) $order_id . '|' . $paymentKey . '|' . (string) ($cancelContext['amount'] ?? 0))
                );
            } else {
                $pgCancel = ['ok' => false, 'error' => 'Toss paymentKey missing for local failure cancel.'];
            }
        } elseif (($pg_service === 'inicis' || $pg_service === 'kakaopay') && is_array($verifyResult['inicis_net_cancel'] ?? null)) {
            $cancelContext = $verifyResult['inicis_net_cancel'];
            $pgCancel = pg_inicis_net_cancel(
                (string) ($cancelContext['url'] ?? ''),
                is_array($cancelContext['params'] ?? null) ? $cancelContext['params'] : []
            );
        } elseif (($pg_service === 'inicis' || $pg_service === 'kakaopay') && is_array($verifyResult['inicis_mobile_net_cancel'] ?? null)) {
            $cancelContext = $verifyResult['inicis_mobile_net_cancel'];
            $pgCancel = pg_inicis_mobile_net_cancel(
                (string) ($cancelContext['url'] ?? ''),
                (string) ($cancelContext['mid'] ?? ''),
                (string) ($cancelContext['tid'] ?? ''),
                (int) ($cancelContext['amount'] ?? 0)
            );
        } elseif ($pg_service === 'nicepay' && is_array($verifyResult['nicepay_net_cancel'] ?? null)) {
            $cancelContext = $verifyResult['nicepay_net_cancel'];
            $pgCancel = pg_nicepay_net_cancel(
                (string) ($cancelContext['url'] ?? ''),
                (string) ($cancelContext['tid'] ?? ''),
                (string) ($cancelContext['auth_token'] ?? ''),
                (string) ($cancelContext['mid'] ?? ''),
                (int) ($cancelContext['amount'] ?? 0),
                (string) ($cancelContext['merchant_key'] ?? '')
            );
        }
        $pgCancelled = $pgCancel === null ? null : !empty($pgCancel['ok']);
        // 대사에 필요한 내용(실패 이유 · PG 취소 결과 · 트랜잭션 여부)은 주문 기록과 서버 로그에 — 응답에는 싣지 않는다.
        $cancelSummary = shop_payment_cancel_result_summary($pgCancel);
        error_log('[api/shop/payment] PG cancel after local failure od_id=' . $order_id . ' pg=' . $pg_service . ': ' . $cancelSummary);
        try {
            pg_append_order_history(
                (string) $order_id,
                $internalMessage . ' / PG 취소 ' . $cancelSummary . ' / tx=' . (!empty($txReport['transactional']) ? 'on' : 'off')
            );
        } catch (Throwable $historyError) {
            // DB 자체가 실패한 경우 히스토리 기록도 실패할 수 있다.
        }
        pg_payment_confirm_release_lock($lockName);
        pg_payment_confirm_release_lock($memberLockName);

        $failureMessage = shop_payment_confirm_failure_message($couponConflict, $pgCancelled);
        Response::error($failureMessage, 409, [
            'code' => 'manual_reconciliation', // SC-14 — 앱은 이 code 로 재전송을 멈춘다
            'reason' => $couponConflict ? 'coupon_already_used' : 'finalize_failed',
            'pg_cancelled' => $pgCancelled, // true 취소 요청 성공 / false 실패 / null 자동 취소 경로 없음
        ]);
    }

    pg_payment_confirm_release_lock($lockName);
    pg_payment_confirm_release_lock($memberLockName);

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
