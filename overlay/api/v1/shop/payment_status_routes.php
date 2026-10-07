<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

// =========================================================================
// GET /v1/shop/payment/config
// =========================================================================
if ($apiMethod === 'GET' && $action === 'config') {
    $cfg = pg_load_config();
    if (!$cfg) {
        Response::error('Shop config not found.', 500);
    }

    $pg_service = $cfg['de_pg_service'] ?? '';
    if (!in_array($pg_service, ['toss', 'inicis', 'kcp', 'nicepay'], true)) {
        $pg_service = 'toss'; // fallback
    }
    $isTestMode = pg_detect_test_mode($cfg, $pg_service);
    $bankAccounts = pg_bank_accounts($cfg);
    $paymentMethods = pg_payment_method_flags($cfg);
    $kcpSiteCd = pg_kcp_site_cd($cfg, $isTestMode);
    $inicisMid = pg_inicis_mid($cfg, pg_detect_test_mode($cfg, 'inicis'));
    $nicepayMid = pg_nicepay_mid($cfg, pg_detect_test_mode($cfg, 'nicepay'));

    // Public client keys/IDs — 운영자가 설정 안 했으면 PG 별 공식 테스트 키 폴백.
    //   Toss: 도큐먼트에 공개된 test_ck_/test_sk 키 (https://docs.tosspayments.com).
    //   Inicis: INIpayTest mid (well-known) — payment.php prepare 의 mid 처리 참조.
    //   KCP: T0000 + 공개 site_key (settle_kcp.inc.php 와 동일).
    //   Nicepay: 공개 테스트 키 없음 — 가맹점 발급 필수.
    $tossClient = pg_toss_client_key($cfg, pg_detect_test_mode($cfg, 'toss'));
    $clientKeys = [
        'toss'    => ['client_key' => $tossClient],
        'inicis'  => [
            'mid' => $inicisMid ?: 'INIpayTest',
            'script_url' => pg_inicis_script_url(pg_detect_test_mode($cfg, 'inicis')),
        ],
        'kcp'     => [
            'mid' => $kcpSiteCd ?: 'T0000',
            'site_key' => pg_kcp_site_key($cfg, $kcpSiteCd),
            'script_url' => $isTestMode
                ? 'https://testpay.kcp.co.kr/plugin/payplus_web.jsp'
                : 'https://pay.kcp.co.kr/plugin/payplus_web.jsp',
        ],
        'nicepay' => [
            'mid' => $nicepayMid,
            'script_url' => pg_nicepay_script_url(),
        ],
    ];

    Response::success([
        'pg_service'      => $pg_service,
        'client'          => $clientKeys[$pg_service] ?? [],
        'payment_methods' => $paymentMethods,
        'easy_pay_services' => pg_easy_pay_services($cfg),
        'bank_accounts'   => $bankAccounts,
        'is_test_mode'    => $isTestMode,
    ]);
}

// =========================================================================
// GET /v1/shop/payment/diagnostics
// =========================================================================
if ($apiMethod === 'GET' && $action === 'diagnostics') {
    Auth::requireAdmin();

    $cfg = pg_load_config();
    if (!$cfg) {
        Response::error('Shop config not found.', 500);
    }

    Response::success(pg_payment_diagnostics($cfg));
}

// =========================================================================
// GET /v1/shop/payment/mobile-status
// Used by the mobile app to recover a saved pending payment after app restart.
// =========================================================================
if ($apiMethod === 'GET' && $action === 'mobile-status') {
    // SC-03: 회원(Bearer + mb_id 일치) 또는 게스트(mb_id='' 주문 + ?uid= 또는 쿠키). 소유·uid 불일치는 모두 404(열거 방지).
    $member = Auth::getUser();
    $mb_id = !empty($member['mb_id']) ? (string) $member['mb_id'] : '';
    $order_id = pg_mobile_request_value($_GET, ['order_id', 'orderId']);
    if ($order_id === '') {
        Response::error('order_id required.', 422);
    }

    $order = DB::fetch(
        "SELECT od_id, mb_id, od_status, od_pg, od_tno, od_receipt_price, od_misu, od_time, od_ip
           FROM " . DB::table('g5_shop_order_table') . "
          WHERE od_id = ? AND mb_id = ? LIMIT 1",
        [$order_id, $mb_id]
    );
    if (!$order) {
        Response::error('Order not found.', 404);
    }
    if ($mb_id === '' && !shop_api_can_view_guest_order($order)) {
        Response::error('Order not found.', 404);
    }

    $status = (string) ($order['od_status'] ?? '');
    Response::success([
        'order_id'    => (string) $order['od_id'],
        'status'      => $status,
        'pg_service'  => (string) ($order['od_pg'] ?? ''),
        'amount'      => (int) ($order['od_receipt_price'] ?? 0) + (int) ($order['od_misu'] ?? 0),
        'tno'         => (string) ($order['od_tno'] ?? ''),
        'pending'     => $status === '준비',
        'paid'        => $status === '입금',
        'deposit_waiting' => $status === '주문',
        'cancelled'   => $status === '취소',
        'confirmable' => $status === '준비',
    ]);
}

// =========================================================================
// GET /v1/shop/payment/status?order_id=...&apply=1
// Queries PG status where the provider supports a server-side status API.
// =========================================================================
if ($apiMethod === 'GET' && $action === 'status') {
    Auth::requireAdmin();

    $orderId = trim((string) ($_GET['order_id'] ?? $_GET['orderId'] ?? ''));
    if ($orderId === '') {
        Response::error('order_id required.', 422);
    }

    $order = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? LIMIT 1",
        [$orderId]
    );
    if (!$order) {
        Response::error('Order not found.', 404);
    }

    $cfg = pg_load_config();
    $provider = trim((string) ($order['od_pg'] ?? ''));
    $apply = !empty($_GET['apply']);
    $status = [
        'provider' => $provider,
        'order_id' => $orderId,
        'local_status' => (string) ($order['od_status'] ?? ''),
        'pg_status' => null,
        'applied' => false,
    ];

    if ($provider === 'toss') {
        $query = pg_toss_api_request($cfg, 'GET', '/v1/payments/orders/' . rawurlencode($orderId));
        if (empty($query['ok'])) {
            Response::error('Toss status query failed: ' . (string) ($query['error'] ?? 'unknown error'), 502, [
                'payment_status' => $status,
                'pg_response' => $query,
            ]);
        }
        $body = $query['body'];
        $status['pg_status'] = (string) ($body['status'] ?? '');
        $status['pg_response'] = $body;
        if ($apply && $status['pg_status'] === 'DONE' && ($order['od_settle_case'] ?? '') === '가상계좌') {
            $virtualAccount = is_array($body['virtualAccount'] ?? null) ? $body['virtualAccount'] : [];
            $bankCode = (string) ($virtualAccount['bankCode'] ?? '');
            $bankAccount = trim(
                ($bankCode !== '' ? pg_toss_bank_name($bankCode) . ' ' : '')
                . (string) ($virtualAccount['accountNumber'] ?? '')
            );
            $applied = pg_mark_vbank_deposited(
                'toss',
                $orderId,
                (string) ($body['paymentKey'] ?? ''),
                (int) ($body['totalAmount'] ?? 0),
                pg_toss_datetime((string) ($body['approvedAt'] ?? '')),
                (string) ($virtualAccount['depositorName'] ?? $virtualAccount['customerName'] ?? ''),
                $bankAccount
            );
            if (empty($applied['ok'])) {
                Response::error('Toss status apply failed: ' . (string) ($applied['error'] ?? 'unknown error'), 409, [
                    'payment_status' => $status,
                    'apply_result' => $applied,
                ]);
            }
            $status['applied'] = true;
            $status['apply_result'] = $applied;
        }
    } elseif ($provider === 'nicepay') {
        $tid = trim((string) ($_GET['tid'] ?? $order['od_tno'] ?? ''));
        if ($tid === '') {
            Response::error('Nicepay TID not found for this order.', 422);
        }
        $query = pg_nicepay_query_transaction($cfg, $tid);
        if (empty($query['ok'])) {
            Response::error('Nicepay status query failed: ' . (string) ($query['error'] ?? 'unknown error'), 502, [
                'payment_status' => $status,
                'pg_response' => $query,
            ]);
        }
        $body = $query['body'];
        $status['pg_status'] = (string) ($body['Status'] ?? '');
        $status['pg_response'] = $body;
        if ($apply && $status['pg_status'] === '0' && ($order['od_settle_case'] ?? '') === '가상계좌') {
            $applied = pg_mark_vbank_deposited(
                'nicepay',
                $orderId,
                (string) ($body['TID'] ?? $tid),
                (int) (($order['od_misu'] ?? 0) > 0 ? $order['od_misu'] : ($order['od_receipt_price'] ?? 0)),
                pg_parse_pg_datetime((string) ($body['AuthDate'] ?? '')),
                (string) ($body['BuyerName'] ?? ''),
                (string) ($order['od_bank_account'] ?? '')
            );
            if (empty($applied['ok'])) {
                Response::error('Nicepay status apply failed: ' . (string) ($applied['error'] ?? 'unknown error'), 409, [
                    'payment_status' => $status,
                    'apply_result' => $applied,
                ]);
            }
            $status['applied'] = true;
            $status['apply_result'] = $applied;
        }
    } else {
        $status['pg_status'] = 'local_only';
        $status['message'] = 'This PG does not have a configured server-side status query in this API yet. Use its deposit notification endpoint or check the PG admin.';
    }

    Response::success($status);
}

// =========================================================================
// POST /v1/shop/payment/notify/{provider}
// Virtual-account deposit notifications from PG servers.
// =========================================================================
if ($apiMethod === 'POST' && in_array($action, ['notify', 'toss-notify', 'toss-webhook', 'nicepay-notify', 'inicis-notify', 'kcp-notify'], true)) {
    $cfg = pg_load_config();
    if (!$cfg) {
        pg_text_response('FAIL', 500);
    }

    $provider = (string) ($shopSegments[1] ?? '');
    if ($provider === '') {
        $provider = str_replace(['-notify', '-webhook'], '', $action);
    }
    $provider = strtolower(trim((string) ($_GET['provider'] ?? $_POST['provider'] ?? $provider)));
    if ($provider === 'nicepayments') {
        $provider = 'nicepay';
    }

    $raw = file_get_contents('php://input');
    $json = json_decode((string) $raw, true);
    $input = is_array($json) ? $json : array_merge($_GET, $_POST);
    if (($provider === '' || $provider === 'notify') && !empty($input['provider'])) {
        $provider = strtolower(trim((string) $input['provider']));
    }
    if (($provider === '' || $provider === 'notify') && !empty($input['pg_service'])) {
        $provider = strtolower(trim((string) $input['pg_service']));
    }
    if ($provider === 'nicepayments') {
        $provider = 'nicepay';
    }

    if ($provider === 'toss') {
        $orderId = trim((string) ($input['orderId'] ?? $input['order_id'] ?? ''));
        $eventStatus = trim((string) ($input['status'] ?? ''));
        $secret = trim((string) ($input['secret'] ?? ''));
        if ($orderId === '') {
            pg_text_response('orderId required', 400);
        }

        // 이 쇼핑몰의 토스 주문일 때만 토스에 묻는다 — 인증이 없는 주소라, 아무 주문번호로나 부르면 그때마다 가맹점 키로
        // 토스 API 를 불러 호출 한도를 쓰고 응답 차이로 "토스에 그 주문이 있는가" 를 알려 준다. 보낸 IP 마다 분 · 시간
        // 단위로도 묶는다 — 주문번호로 세면 남이 그 주문의 한도를 미리 채워 진짜 토스 통보를 막을 수 있다(막히면 토스가 다시 보낸다).
        // 주문 상태는 토스 조회 결과로만 바꾸고 금액 · 거래번호 · 결제수단은 pg_mark_vbank_deposited() 가 다시 대조하므로
        // 발신 IP 목록은 두지 않는다 — 토스가 고정 목록을 약속하지 않아, 목록이 낡으면 입금 처리가 조용히 멈춘다.
        $tossOrder = DB::fetch(
            "SELECT od_id, od_pg FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? LIMIT 1",
            [$orderId]
        );
        if (!$tossOrder || !in_array(strtolower(trim((string) $tossOrder['od_pg'])), ['toss', ''], true)) {
            pg_text_response('FAIL', 404);
        }
        $notifyIp = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
        if (Throttle::checkMemberQuota('tossnotify', 'ip:' . $notifyIp, 30, 300) !== null) {
            pg_text_response('FAIL', 429);
        }

        $query = pg_toss_api_request($cfg, 'GET', '/v1/payments/orders/' . rawurlencode($orderId));
        if (empty($query['ok'])) {
            pg_text_response('FAIL', 502);
        }
        $body = $query['body'];
        if ($secret !== '' && !empty($body['secret']) && !hash_equals((string) $body['secret'], $secret)) {
            pg_text_response('FAIL', 400);
        }

        $status = (string) ($body['status'] ?? $eventStatus);
        if ($status === 'DONE') {
            $virtualAccount = is_array($body['virtualAccount'] ?? null) ? $body['virtualAccount'] : [];
            $bankCode = (string) ($virtualAccount['bankCode'] ?? '');
            $bankAccount = trim(
                ($bankCode !== '' ? pg_toss_bank_name($bankCode) . ' ' : '')
                . (string) ($virtualAccount['accountNumber'] ?? '')
            );
            $result = pg_mark_vbank_deposited(
                'toss',
                $orderId,
                (string) ($body['paymentKey'] ?? ''),
                (int) ($body['totalAmount'] ?? 0),
                pg_toss_datetime((string) ($body['approvedAt'] ?? '')),
                (string) ($virtualAccount['depositorName'] ?? $virtualAccount['customerName'] ?? ''),
                $bankAccount
            );
            pg_text_response(!empty($result['ok']) ? 'OK' : 'FAIL', !empty($result['ok']) ? 200 : 409);
        }

        if (in_array($status, ['WAITING_FOR_DEPOSIT', 'EXPIRED', 'CANCELED', 'ABORTED'], true)) {
            pg_append_order_history($orderId, 'Toss 가상계좌 상태통보: ' . $status);
        }
        pg_text_response('OK');
    }

    if ($provider === 'nicepay') {
        $notify = pg_nicepay_notify_response($cfg, $input);
        pg_text_response((string) $notify['text'], (int) $notify['status']);
    }

    if ($provider === 'inicis') {
        if (!pg_notify_ip_allowed('inicis')) {
            pg_text_response('DB Error', 403);
        }
        $orderId = trim((string) ($input['no_oid'] ?? $input['MOID'] ?? $input['Moid'] ?? $input['oid'] ?? ''));
        $tid = trim((string) ($input['no_tid'] ?? $input['tid'] ?? ''));
        $amount = (int) preg_replace('/[^0-9]/', '', (string) ($input['amt_input'] ?? $input['TotPrice'] ?? '0'));
        $paidAt = pg_parse_pg_datetime((string) ($input['dt_trans'] ?? ''), (string) ($input['tm_trans'] ?? ''));
        $bankAccount = trim((string) ($input['nm_inputbank'] ?? '') . ' ' . (string) ($input['no_vacct'] ?? ''));
        $result = pg_mark_vbank_deposited(
            'inicis',
            $orderId,
            $tid,
            $amount,
            $paidAt,
            (string) ($input['nm_input'] ?? ''),
            $bankAccount
        );
        pg_text_response(!empty($result['ok']) ? 'OK' : 'DB Error', !empty($result['ok']) ? 200 : 409);
    }

    if ($provider === 'kcp') {
        if (!pg_notify_ip_allowed('kcp')) {
            pg_text_response('<html><body><form><input type="hidden" name="result" value="9999"></form></body></html>', 403, 'text/html; charset=euc-kr');
        }
        $txCd = (string) ($input['tx_cd'] ?? '');
        if ($txCd !== 'TX00') {
            pg_text_response('<html><body><form><input type="hidden" name="result" value="0000"></form></body></html>', 200, 'text/html; charset=euc-kr');
        }

        $orderId = trim((string) ($input['order_no'] ?? ''));
        $tid = trim((string) ($input['tno'] ?? ''));
        $amount = (int) preg_replace('/[^0-9]/', '', (string) ($input['ipgm_mnyx'] ?? '0'));
        $paidAt = pg_parse_pg_datetime((string) ($input['tx_tm'] ?? ''));
        $bankAccount = trim((string) ($input['bank_code'] ?? '') . ' ' . (string) ($input['account'] ?? ''));
        $result = pg_mark_vbank_deposited(
            'kcp',
            $orderId,
            $tid,
            $amount,
            $paidAt,
            (string) ($input['remitter'] ?? ''),
            $bankAccount
        );
        pg_text_response(
            '<html><body><form><input type="hidden" name="result" value="' . (!empty($result['ok']) ? '0000' : '9999') . '"></form></body></html>',
            !empty($result['ok']) ? 200 : 409,
            'text/html; charset=euc-kr'
        );
    }

    pg_text_response('Unknown provider.', 400);
}
