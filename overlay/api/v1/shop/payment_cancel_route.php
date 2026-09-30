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
