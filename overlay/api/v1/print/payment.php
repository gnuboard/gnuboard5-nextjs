<?php
/**
 * Gnuboard5 REST API - Print Payment
 *
 * Routes (prefix: v1/print/payment):
 *   POST /v1/print/payment/confirm
 */

if (!defined('_GNUBOARD_')) exit;

require_once __DIR__ . '/../shop/payment_helpers.php';

$orderTable = DB::table('print_order_table');
$action = isset($printSegments[0]) ? (string) $printSegments[0] : '';

if (!function_exists('print_toss_public_error_message')) {
    function print_toss_public_error_message(array $confirm): string
    {
        $body = isset($confirm['body']) && is_array($confirm['body']) ? $confirm['body'] : [];
        $code = strtoupper((string) ($body['code'] ?? $confirm['code'] ?? ''));
        $messages = [
            'ALREADY_PROCESSED_PAYMENT' => 'Already processed payment.',
            'PROVIDER_ERROR' => 'Payment provider is temporarily unavailable.',
            'INVALID_REQUEST' => 'Invalid payment request.',
            'INVALID_API_KEY' => 'Payment configuration is invalid.',
            'NOT_FOUND_PAYMENT' => 'Payment information was not found.',
            'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING' => 'Payment processing failed.',
            'FAILED_INTERNAL_SYSTEM_PROCESSING' => 'Payment processing failed.',
            'REJECT_CARD_COMPANY' => 'Payment was rejected by the card issuer.',
        ];

        return $messages[$code] ?? 'Payment approval failed. Please check your payment information or try another method.';
    }
}

if ($action === 'confirm' && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    $input = get_request_body();

    $orderNo = trim((string) ($input['order_id'] ?? $input['order_no'] ?? ''));
    $amount = (int) ($input['amount'] ?? 0);
    $paymentKey = (string) ($input['payment_key'] ?? $input['paymentKey'] ?? '');
    $pgService = (string) ($input['pg_service'] ?? 'toss');

    if ($orderNo === '' || $amount <= 0) {
        Response::error('Order number and amount are required.', 422);
    }

    $order = DB::fetch("SELECT * FROM {$orderTable} WHERE order_no = ? LIMIT 1", [$orderNo]);
    if (!$order) Response::error('Order not found.', 404);
    if ($order['mb_id'] !== $me['mb_id'] && Auth::adminRole($me) !== 'super') {
        Response::error('Forbidden.', 403);
    }

    if ($order['status'] === 'paid') {
        Response::success([
            'order_no' => $orderNo,
            'order_id' => (int) $order['order_id'],
            'status'   => 'paid',
            'tno'      => (string) ($order['pg_tno'] ?? ''),
        ]);
    }

    // 결제를 기다리는 주문만 승인한다 — 취소 · 제작 중인 주문에 돈을 받고 'paid' 로 되돌리지 않게(토스를 부르기 전에 막는다).
    if ((string) $order['status'] !== 'pending') {
        Response::error('This order is not waiting for payment.', 409, ['code' => 'not_pending']);
    }

    if ((int) $order['total_amount'] !== $amount) {
        Response::error('Payment amount does not match the order amount.', 422);
    }

    if ($pgService !== 'toss') {
        Response::error('Only Toss Payments is supported for print orders.', 422);
    }
    if ($paymentKey === '') {
        Response::error('payment_key is required.', 422);
    }

    $cfg = pg_load_config();
    $isTest = pg_detect_test_mode($cfg, 'toss');
    $secret = pg_toss_secret_key($cfg, $isTest);
    if ($secret === '') {
        Response::error('Toss Payments secret key is not configured.', 500);
    }

    $confirm = pg_toss_api_request($cfg, 'POST', '/v1/payments/confirm', [
        'paymentKey' => $paymentKey,
        'orderId'    => $orderNo,
        'amount'     => $amount,
    ]);

    if (empty($confirm['ok'])) {
        Response::error(print_toss_public_error_message($confirm), 400);
    }

    $body = isset($confirm['body']) && is_array($confirm['body']) ? $confirm['body'] : [];
    $approvedAmount = (int) preg_replace('/[^0-9]/', '', (string) ($body['totalAmount'] ?? '0'));
    $approvedOrderId = (string) ($body['orderId'] ?? '');
    $status = (string) ($body['status'] ?? '');

    if ($approvedAmount !== $amount) {
        Response::error('Approved amount does not match.', 400);
    }
    if ($approvedOrderId !== '' && $approvedOrderId !== $orderNo) {
        Response::error('Approved order number does not match.', 400);
    }
    if ($status !== 'DONE') {
        Response::error('Payment was not completed.', 400);
    }

    $tno = (string) ($body['paymentKey'] ?? $paymentKey);
    DB::execute(
        "UPDATE {$orderTable}
         SET status = 'paid', pg_service = ?, pg_tno = ?, paid_at = NOW()
         WHERE order_id = ? AND status = 'pending'",
        ['toss', $tno, (int) $order['order_id']]
    );

    Response::success([
        'order_no' => $orderNo,
        'order_id' => (int) $order['order_id'],
        'status'   => 'paid',
        'tno'      => $tno,
    ]);
}

Response::error('Method not allowed.', 405);
