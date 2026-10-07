<?php
if (!defined('_GNUBOARD_')) {
    exit;
}
// =========================================================================
// POST /v1/shop/payment/cancel
// Cancels a draft order created by prepare and restores its cart rows.
// Body: { order_id, reason? }
// =========================================================================
if ($apiMethod === 'POST' && $action === 'cancel') {

    $member = Auth::getUser();
    $mb_id  = !empty($member['mb_id']) ? $member['mb_id'] : '';

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $order_id = shop_api_clean_id($input['order_id'] ?? '');
    if ($order_id === '') {
        Response::error('order_id required.', 422);
    }

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

    // 결제 확인과 같은 주문 잠금 안에서 다시 읽고 되돌린다 — 확인이 '준비'를 본 바로 뒤에 상품 줄을 장바구니로 옮기면
    // 결제는 되고 상품 줄은 없는 주문이 된다(shop_api_restore_pending_order_cart_locked 와 같은 이유). 앱은 실패하면
    // 결제 상태를 다시 조회한다. 잠금은 요청이 끝나 DB 연결이 닫히면 풀린다(orders.php 주문 취소와 같다).
    $cancelLock = pg_payment_confirm_acquire_lock((string) $order['od_id'], 3);
    if (empty($cancelLock['ok'])) {
        Response::error('Payment confirmation is already in progress. Please retry shortly.', 409, [
            'code' => (string) ($cancelLock['code'] ?? '') !== '' ? (string) $cancelLock['code'] : 'confirm_in_progress',
        ]);
    }
    $order = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? LIMIT 1",
        [$order['od_id']]
    ) ?: $order;

    if (($order['od_status'] ?? '') === '취소') {
        Response::success([
            'order_id' => (string) $order_id,
            'restored' => 0,
            'status'   => '취소',
            'cart_id'  => (string) shop_api_cart_id($member),
        ]);
    }
    if (($order['od_status'] ?? '') !== '준비') {
        Response::error('Order is already finalized.', 400);
    }

    $reason = trim((string) ($input['reason'] ?? ''));
    if ($reason === '') {
        $reason = '결제 취소';
    }

    $restored = shop_api_restore_pending_order_cart($order, $member, $reason);
    Response::success([
        'order_id' => (string) $order_id,
        'restored' => $restored,
        'status'   => '취소',
        // SC-02: 복원된 카트 id — 앱은 이 값으로 로컬 카트 id 를 바꾼다.
        'cart_id'  => shop_api_last_cart_id(),
    ]);
}
