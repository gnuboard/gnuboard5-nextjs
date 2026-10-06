<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * Verify a payment confirmation request with the selected PG provider.
 *
 * The input array is passed by reference because provider branches normalize
 * bank and virtual-account fields that the final order update still consumes.
 */
function shop_payment_confirm_verify_pg(string $pg_service, array &$input, array $cfg, string $order_id, int $amount, array $order): array
{
    $verifyResult = [
        'ok' => false,
        'tno' => '',
        'error' => '',
        'restore_cart' => true,
        'pending_review' => false,
        'inicis_net_cancel' => null,
        'inicis_mobile_net_cancel' => null,
        'nicepay_net_cancel' => null,
        'toss_cancel' => null,
    ];

    if ($pg_service === 'toss') {
        // Toss Payments: redirect returns paymentKey/orderId/amount, then the server confirms it.
        $payment_key = pg_mobile_request_value($input, ['payment_key', 'paymentKey']);
        if (!$payment_key) {
            Response::error('payment_key required for Toss.', 422);
        }
        $isTestMode = pg_detect_test_mode($cfg, 'toss');
        $secret_key = pg_toss_secret_key($cfg, $isTestMode);
        if ($secret_key === '') {
            Response::error('토스페이먼츠 API Secret Key가 설정되지 않았습니다. 그누보드 관리자에서 설정 후 사용해주세요.', 500);
        }
        $confirm = pg_toss_api_request($cfg, 'POST', '/v1/payments/confirm', [
            'paymentKey' => $payment_key,
            'orderId'    => $order_id,
            'amount'     => $amount,
        ]);
        if (!empty($confirm['ok'])) {
            $body = $confirm['body'];
            $approvedAmount = (int) preg_replace('/[^0-9]/', '', (string) ($body['totalAmount'] ?? '0'));
            $approvedOrderId = (string) ($body['orderId'] ?? '');
            $status = (string) ($body['status'] ?? '');
            $method = (string) ($body['method'] ?? '');

            if ($approvedAmount !== $amount) {
                $verifyResult['error'] = 'Amount mismatch';
            } elseif ($approvedOrderId !== '' && $approvedOrderId !== $order_id) {
                $verifyResult['error'] = 'Order id mismatch';
            } elseif ($status !== 'DONE' && !($status === 'WAITING_FOR_DEPOSIT' && $method === '가상계좌')) {
                $verifyResult['error'] = 'Toss payment status is not complete: ' . ($status !== '' ? $status : 'UNKNOWN');
            } else {
                $verifyResult['ok']  = true;
                $verifyResult['tno'] = (string) $body['paymentKey'];
                $verifyResult['settle_case'] = pg_toss_settle_case($method);
                $verifyResult['toss_cancel'] = [
                    'payment_key' => (string) $body['paymentKey'],
                    'amount' => $approvedAmount,
                ];

                $virtualAccount = $body['virtualAccount'] ?? null;
                if (is_array($virtualAccount)) {
                    $bankCode = (string) ($virtualAccount['bankCode'] ?? '');
                    $verifyResult['bankname'] = $bankCode !== '' ? pg_toss_bank_name($bankCode) : '';
                    $verifyResult['account'] = (string) ($virtualAccount['accountNumber'] ?? '');
                    $verifyResult['depositor'] = (string) ($virtualAccount['customerName'] ?? '');
                    $verifyResult['va_date'] = pg_toss_datetime((string) ($virtualAccount['dueDate'] ?? ''));
                }
            }
        } else {
            $body = is_array($confirm['body'] ?? null) ? $confirm['body'] : [];
            $code = (string) ($body['code'] ?? '');
            $message = (string) ($body['message'] ?? ($confirm['error'] ?? 'Toss verification failed'));
            $verifyResult['error'] = $code !== '' ? '[' . $code . '] ' . $message : $message;
            if (!empty($confirm['timed_out'])) {
                $lookup = pg_toss_api_request($cfg, 'GET', '/v1/payments/' . rawurlencode($payment_key));
                if (!empty($lookup['ok'])) {
                    $status = (string) ($lookup['body']['status'] ?? '');
                    if (in_array($status, ['DONE', 'WAITING_FOR_DEPOSIT'], true)) {
                        $verifyResult['restore_cart'] = false;
                        $verifyResult['pending_review'] = true;
                        $verifyResult['error'] = 'Toss confirm timeout; payment status is ' . $status . '. Please reconcile before restoring the cart.';
                    }
                } else {
                    $verifyResult['restore_cart'] = false;
                    $verifyResult['pending_review'] = true;
                    $verifyResult['error'] = 'Toss confirm timeout and status lookup failed: ' . (string) ($lookup['error'] ?? $verifyResult['error']);
                }
            }
        }
    }
    elseif ($pg_service === 'inicis' || $pg_service === 'kakaopay') {
        // KG Inicis: client sends authToken/authUrl/mid/MOID etc back
        // Server calls authUrl to get final approval
        $authToken = pg_mobile_request_value($input, ['authToken', 'AuthToken', 'P_AUTH_TOKEN']);
        $authUrl   = pg_mobile_request_value($input, ['authUrl', 'AuthUrl', 'P_AUTH_URL']);
        $netCancelUrl = pg_mobile_request_value($input, ['netCancelUrl', 'NetCancelUrl', 'P_NET_CANCEL_URL']);
        $isKakaopay = $pg_service === 'kakaopay';
        $isInicisTest = $isKakaopay ? pg_detect_test_mode($cfg, 'kakaopay') : pg_detect_test_mode($cfg, 'inicis');
        $mid = $isKakaopay ? pg_kakaopay_mid($cfg, $isInicisTest) : pg_inicis_mid($cfg, $isInicisTest);
        $sign_key = $isKakaopay ? pg_kakaopay_sign_key($cfg, $isInicisTest) : pg_inicis_sign_key($cfg, $isInicisTest);
        $clientResultCode = pg_mobile_request_value($input, ['resultCode', 'ResultCode', 'P_STATUS'], '0000');
        if ($clientResultCode !== '' && !in_array($clientResultCode, ['0000', '00'], true)) {
            $verifyResult['error'] = 'Inicis authentication failed: ' . pg_mobile_request_value($input, ['resultMsg', 'ResultMsg', 'P_RMESG1'], $clientResultCode);
        }
        if (!$isInicisTest && $sign_key === '') {
            Response::error($isKakaopay ? 'KAKAOPAY merchant key is not configured.' : 'Inicis signKey is not configured.', 500);
        }
        $mobileTid = pg_mobile_request_value($input, ['P_TID', 'tid', 'TID']);
        $mobileVerification = pg_mobile_request_value($input, ['mobile_verification']);
        $hasMobileConfirmPayload = $mobileTid !== '' || $mobileVerification !== '';
        if ($hasMobileConfirmPayload && ($mobileTid === '' || $mobileVerification === '')) {
            $verifyResult['error'] = 'Inicis mobile verification data is incomplete.';
        }
        if ((!$authToken || !$authUrl) && $mobileTid !== '' && $mobileVerification !== '') {
            $mobileMid = pg_mobile_request_value($input, ['P_MID', 'mid'], $mid);
            $mobileOrderId = pg_mobile_request_value($input, ['P_OID', 'P_NOTI', 'MOID', 'Moid', 'orderNumber'], $order_id);
            $mobileAmount = (int) preg_replace('/[^0-9]/', '', pg_mobile_request_value($input, ['P_AMT', 'TotPrice', 'price'], (string) $amount));
            $mobileNetCancelUrl = pg_mobile_request_value($input, ['P_NET_CANCEL_URL', 'netCancelUrl', 'NetCancelUrl']);
            $expectedMobileVerification = pg_inicis_mobile_verification($pg_service, $mobileOrderId, $mobileAmount, $mobileTid, $mid, $sign_key);
            if (!hash_equals($expectedMobileVerification, $mobileVerification)) {
                $verifyResult['error'] = 'Inicis mobile verification mismatch.';
            } elseif ($mobileMid !== '' && $mobileMid !== $mid) {
                $verifyResult['error'] = 'Inicis mobile MID mismatch.';
            } elseif ($mobileOrderId !== '' && $mobileOrderId !== $order_id) {
                $verifyResult['error'] = 'Order id mismatch';
            } elseif ($mobileAmount !== $amount) {
                $verifyResult['error'] = 'Amount mismatch';
            } elseif ($mobileNetCancelUrl !== '' && !pg_inicis_safe_url($mobileNetCancelUrl)) {
                $verifyResult['error'] = 'Invalid Inicis mobile net-cancel URL.';
            } else {
                $verifyResult['ok'] = true;
                $verifyResult['tno'] = $mobileTid;
                if ($mobileNetCancelUrl !== '') {
                    $verifyResult['inicis_mobile_net_cancel'] = [
                        'url' => $mobileNetCancelUrl,
                        'mid' => $mid,
                        'tid' => $mobileTid,
                        'amount' => $mobileAmount,
                    ];
                }
                $verifyResult['bankname'] = pg_mobile_request_value($input, ['P_VACT_BANK', 'VACT_BankName']);
                if ($verifyResult['bankname'] === '') {
                    $verifyResult['bankname'] = pg_inicis_bank_name(pg_mobile_request_value($input, ['P_VACT_BANK_CODE', 'VACT_BankCode']));
                }
                $verifyResult['account'] = trim(pg_mobile_request_value($input, ['P_VACT_NUM', 'VACT_Num']) . ' ' . pg_mobile_request_value($input, ['P_VACT_NAME', 'VACT_Name']));
                $verifyResult['depositor'] = pg_mobile_request_value($input, ['P_UNAME', 'VACT_InputName']);
                $verifyResult['va_date'] = pg_mobile_request_value($input, ['P_VACT_DATE', 'VACT_Date']);
            }
        }
        if (!$verifyResult['ok'] && !$hasMobileConfirmPayload) {
            if (!$authToken || !$authUrl) {
                Response::error('authToken/authUrl required for Inicis.', 422);
            }
            if (!pg_inicis_safe_url($authUrl)) {
                Response::error('Invalid Inicis authUrl.', 422);
            }
            if ($netCancelUrl !== '' && !pg_inicis_safe_url($netCancelUrl)) {
                Response::error('Invalid Inicis netCancelUrl.', 422);
            }
        }
        if (!$verifyResult['ok'] && !$hasMobileConfirmPayload && $verifyResult['error'] === '') {
            $timestamp = (string) (time() * 1000);
            $signature = hash('sha256', "authToken={$authToken}&timestamp={$timestamp}");
            $verification = hash('sha256', "authToken={$authToken}&signKey={$sign_key}&timestamp={$timestamp}");
            $params = [
                'mid'          => $mid,
                'authToken'    => $authToken,
                'timestamp'    => $timestamp,
                'signature'    => $signature,
                'verification' => $verification,
                'charset'      => 'UTF-8',
                'format'       => 'JSON',
            ];
            $approval = pg_inicis_post_json($authUrl, $params);
            $body = $approval['body'];
            if (empty($approval['ok']) || !is_array($body)) {
                $verifyResult['error'] = (string) ($approval['error'] ?? 'Inicis verification failed.');
                $netCancel = $netCancelUrl !== '' ? pg_inicis_net_cancel($netCancelUrl, $params) : ['ok' => false, 'error' => 'NetCancelURL missing.'];
                if (!empty($approval['timed_out']) && empty($netCancel['ok'])) {
                    $verifyResult['restore_cart'] = false;
                    $verifyResult['pending_review'] = true;
                    $verifyResult['error'] = 'Inicis approval timeout; net-cancel failed or was unavailable. Please reconcile the PG transaction before restoring the cart.';
                } elseif (!empty($approval['timed_out'])) {
                    $verifyResult['error'] = 'Inicis approval timeout; net-cancel was requested.';
                }
            } elseif (($body['resultCode'] ?? '') === '0000') {
                $approvedAmount = (int) preg_replace('/[^0-9]/', '', (string) ($body['TotPrice'] ?? '0'));
                $approvedOrderId = pg_mobile_request_value($body, ['MOID', 'Moid', 'oid']);
                if ($approvedAmount !== $amount) {
                    $verifyResult['error'] = 'Amount mismatch';
                } elseif ($approvedOrderId !== '' && $approvedOrderId !== $order_id) {
                    $verifyResult['error'] = 'Order id mismatch';
                } elseif (!empty($body['authSignature'])
                    && !hash_equals(pg_inicis_signature_auth($mid, $timestamp, (string) ($body['MOID'] ?? $order_id), (string) ($body['TotPrice'] ?? $amount)), (string) $body['authSignature'])) {
                    $verifyResult['error'] = 'Inicis authSignature mismatch';
                } else {
                    $verifyResult['ok']  = true;
                    $verifyResult['tno'] = (string) ($body['tid'] ?? $body['TID'] ?? '');
                    if ($netCancelUrl !== '') {
                        $verifyResult['inicis_net_cancel'] = [
                            'url' => $netCancelUrl,
                            'params' => $params,
                        ];
                    }
                    $verifyResult['bankname'] = pg_inicis_bank_name((string) ($body['VACT_BankCode'] ?? ''));
                    $verifyResult['account'] = trim((string) ($body['VACT_Num'] ?? '') . ' ' . (string) ($body['VACT_Name'] ?? ''));
                    $verifyResult['depositor'] = (string) ($body['VACT_InputName'] ?? '');
                    $verifyResult['va_date'] = pg_inicis_vbank_due((string) ($body['VACT_Date'] ?? ''), (string) ($body['VACT_Time'] ?? ''));
                }
                if ($verifyResult['error'] !== '') {
                    $netCancel = $netCancelUrl !== '' ? pg_inicis_net_cancel($netCancelUrl, $params) : ['ok' => false, 'error' => 'NetCancelURL missing.'];
                    if (empty($netCancel['ok'])) {
                        $verifyResult['restore_cart'] = false;
                        $verifyResult['pending_review'] = true;
                        $verifyResult['error'] .= ' Net-cancel failed; manual reconciliation required.';
                    }
                }
            } else {
                $verifyResult['error'] = $body['resultMsg'] ?? 'Inicis verification failed';
            }
        }
    }
    elseif ($pg_service === 'kcp') {
        // KCP STDPay (payplus_web.jsp + KCP_Pay_Execute):
        //   인증 단계는 클라 → payplus.js 가 처리해 res_cd='0000' + enc_info/enc_data/tran_cd 반환.
        //   매입 승인은 PP_CLI 바이너리 (shop/kcp/bin/pp_cli) 로 별도 호출 — 운영에서는
        //   .crt 인증서 파일과 함께 PHP class PP_CLI_PayPlus 가 처리.
        //
        //   여기선 그누보드 코어의 PP_CLI 흐름을 직접 부르는 대신, 가장 안전한 절충안:
        //     test 사이트코드 (T0000, S6729 등) 면 클라가 KCP UI 에서 받은 res_cd 를 신뢰.
        //     운영 사이트코드 (SR 로 시작) 면 운영자가 별도로 shop/kcp/pp_cli_hub.php
        //     연동을 활성화해야 함 — 그 전엔 명시적으로 실패시켜 무단 통과 방지.
        $enc_info = pg_mobile_request_value($input, ['enc_info', 'encInfo']);
        $enc_data = pg_mobile_request_value($input, ['enc_data', 'encData']);
        $tran_cd  = pg_mobile_request_value($input, ['tran_cd', 'tranCd']);
        // 사이트 코드는 서버의 결제 모드(관리자 '결제 테스트')로만 정한다. 요청 값을 쓰면 운영 쇼핑몰에
        // 테스트 코드(T0000)를 보내 테스트 승인 서버의 승인으로 주문을 결제 완료시킬 수 있다.
        // 요청에 코드가 있으면 서버 값과 같은지만 본다(앱 · 웹 결제창이 같은 값을 돌려준다).
        $site_cd = pg_kcp_site_cd($cfg, pg_detect_test_mode($cfg, 'kcp'));
        $requestSiteCd = pg_mobile_request_value($input, ['site_cd', 'siteCd']);
        if ($requestSiteCd !== '' && preg_match('/^(T\d{4}|S\d{4}|SR)/', $requestSiteCd) !== 1) {
            $requestSiteCd = 'SR' . $requestSiteCd;
        }
        if ($site_cd === '' || ($requestSiteCd !== '' && !hash_equals($site_cd, $requestSiteCd))) {
            error_log('[shop/payment/confirm] KCP site_cd mismatch for order ' . $order_id);
            Response::error('결제 정보가 쇼핑몰 설정과 맞지 않습니다.', 400, ['code' => 'kcp_site_mismatch']);
        }
        $tno      = pg_mobile_request_value($input, ['tno', 'TNO', 'tid', 'TID']);

        $isTestSite = preg_match('/^(T\d{4}|S\d{4})/', $site_cd) === 1;
        $isProdSite = preg_match('/^SR/', $site_cd) === 1;

        // 클라이언트가 받은 KCP 인증 결과 코드. payplus 가 res_cd='0000' 만 우리한테
        // 보내도록 m_Completepayment 단계에서 게이팅하지만, 한 번 더 확인.
        $clientResCd = pg_mobile_request_value($input, ['res_cd', 'resCd'], '0000');
        if ($clientResCd !== '0000') {
            $verifyResult['error'] = 'KCP 인증 실패: ' . pg_mobile_request_value($input, ['res_msg', 'resMsg'], $clientResCd);
        }
        elseif (!$enc_info || !$enc_data || !$tran_cd) {
            $verifyResult['error'] = 'enc_info/enc_data/tran_cd 누락 — KCP 인증 응답이 비정상.';
        }
        elseif ($isTestSite || $isProdSite) {
            // 테스트 사이트코드도 영카트처럼 KCP 테스트 승인 서버(testpaygw)에 실제로 승인을 요청한다 —
            // 흉내만 내면 가상계좌 번호가 발급되지 않고 거래번호도 KCP 에 없는 값이 된다.
            // site_cd 는 위에서 결제 모드로 정한 값을 넘긴다(비어 있으면 헬퍼가 운영 코드를 고른다).
            $kcpResult = pg_kcp_cli_approve($cfg, ['site_cd' => $site_cd] + $input, $order_id, $amount, (string) ($order['od_settle_case'] ?? ''));
            if (!empty($kcpResult['ok'])) {
                $verifyResult['ok']  = true;
                $verifyResult['tno'] = (string) ($kcpResult['tno'] ?? '');
                foreach (['bankname', 'account', 'depositor', 'va_date'] as $key) {
                    if (!empty($kcpResult[$key])) {
                        $input[$key] = $kcpResult[$key];
                    }
                }
            } else {
                $verifyResult['error'] = (string) ($kcpResult['error'] ?? 'KCP 운영 매입 승인 실패');
                if (preg_match('/timeout|timed out|시간|응답|network|connect/i', $verifyResult['error']) === 1) {
                    $verifyResult['restore_cart'] = false;
                    $verifyResult['pending_review'] = true;
                    $verifyResult['error'] .= ' KCP 승인 결과가 불명확하므로 PG 관리자에서 거래 상태를 대사해야 합니다.';
                }
            }
        }
        else {
            $verifyResult['error'] = '알 수 없는 KCP 사이트코드: ' . $site_cd;
        }
    }
    elseif ($pg_service === 'nicepay') {
        $tid = pg_mobile_request_value($input, ['TxTid', 'tid', 'TID']);
        $authToken = pg_mobile_request_value($input, ['AuthToken', 'authToken', 'auth_token']);
        $authResultCode = pg_mobile_request_value($input, ['AuthResultCode', 'ResultCode', 'resultCode'], '0000');
        $nextAppUrl = pg_mobile_request_value($input, ['NextAppURL', 'nextAppURL']);
        $netCancelUrl = pg_mobile_request_value($input, ['NetCancelURL', 'netCancelUrl']);
        $receivedMid = pg_mobile_request_value($input, ['MID', 'mid']);
        $signature = pg_mobile_request_value($input, ['Signature', 'signature']);
        $isNicepayTest = pg_detect_test_mode($cfg, 'nicepay');
        $mid = pg_nicepay_mid($cfg, $isNicepayTest);
        $merchantKey = pg_nicepay_key($cfg, $isNicepayTest);
        if ($authResultCode !== '' && $authResultCode !== '0000') {
            $verifyResult['error'] = 'Nicepay 인증 실패: ' . pg_mobile_request_value($input, ['AuthResultMsg', 'ResultMsg', 'resultMsg'], $authResultCode);
        }
        if (!$tid || !$authToken || !$nextAppUrl) {
            Response::error('TxTid/AuthToken/NextAppURL required for Nicepay.', 422);
        }
        if ($receivedMid !== '' && $mid !== '' && $receivedMid !== $mid) {
            $verifyResult['error'] = 'Nicepay MID mismatch.';
        }
        if (!pg_nicepay_safe_url($nextAppUrl)) {
            Response::error('Invalid Nicepay NextAppURL.', 422);
        }
        if ($netCancelUrl !== '' && !pg_nicepay_safe_url($netCancelUrl)) {
            Response::error('Invalid Nicepay NetCancelURL.', 422);
        }
        if ($signature !== '' && $mid !== '' && $merchantKey !== ''
            && !hash_equals(pg_nicepay_auth_signature($authToken, $mid, $amount, $merchantKey), $signature)) {
            $verifyResult['error'] = 'Nicepay authentication signature mismatch.';
        }
        if (!$mid || !$merchantKey) {
            // Nicepay 는 공개 테스트 키가 없음 — 가맹점이 발급받아야 한다.
            // 운영자가 admin 에서 de_nicepay_mid/key 설정해야 사용 가능.
            Response::error('Nicepay 가맹점 정보(mid/merchantKey)가 설정되지 않았습니다. 그누보드 관리자에서 설정 후 사용해주세요.', 500);
        }
        if ($verifyResult['error'] === '') {
            $ediDate = date('YmdHis');
            $approval = pg_nicepay_post($nextAppUrl, [
                'TID' => $tid,
                'AuthToken' => $authToken,
                'MID' => $mid,
                'Amt' => $amount,
                'EdiDate' => $ediDate,
                'SignData' => pg_nicepay_approval_signature($authToken, $mid, $amount, $ediDate, $merchantKey),
                'CharSet' => 'utf-8',
                'EdiType' => 'JSON',
            ]);
            if (empty($approval['ok'])) {
                $verifyResult['error'] = (string) ($approval['error'] ?? 'Nicepay verification failed');
                if (!empty($approval['timed_out'])) {
                    $statusQuery = pg_nicepay_query_transaction($cfg, $tid);
                    $statusBody = is_array($statusQuery['body'] ?? null) ? $statusQuery['body'] : [];
                    $statusCode = (string) ($statusBody['Status'] ?? '');
                    $netCancel = pg_nicepay_net_cancel($netCancelUrl, $tid, $authToken, $mid, $amount, $merchantKey);

                    if (!empty($netCancel['ok'])) {
                        $verifyResult['error'] = 'Nicepay approval timeout; net-cancel was requested.';
                    } elseif (!empty($statusQuery['ok']) && $statusCode === '1') {
                        $verifyResult['error'] = 'Nicepay approval timeout; PG status is already cancelled.';
                    } else {
                        $verifyResult['restore_cart'] = false;
                        $verifyResult['pending_review'] = true;
                        $verifyResult['error'] = 'Nicepay approval timeout; status=' . ($statusCode !== '' ? $statusCode : 'UNKNOWN') . ', net-cancel failed. Please reconcile the PG transaction before restoring the cart.';
                    }
                }
            } else {
                $body = $approval['body'];
                $resultCode = (string) ($body['ResultCode'] ?? $body['resultCode'] ?? '');
                $approvedTid = (string) ($body['TID'] ?? $body['tid'] ?? $tid);
                $approvedMid = (string) ($body['MID'] ?? $body['mid'] ?? $mid);
                $approvedAmountRaw = (string) ($body['Amt'] ?? $body['amount'] ?? (string) $amount);
                $approvedAmount = (int) preg_replace('/[^0-9]/', '', $approvedAmountRaw);
                $approvedOrderId = (string) ($body['Moid'] ?? $body['MOID'] ?? $order_id);
                $approvedPayMethod = (string) ($body['PayMethod'] ?? $body['payMethod'] ?? $input['PayMethod'] ?? '');

                if (!pg_nicepay_approval_success($resultCode, $approvedPayMethod)) {
                    $verifyResult['error'] = (string) ($body['ResultMsg'] ?? $body['resultMsg'] ?? 'Nicepay verification failed');
                } elseif ($approvedAmount !== $amount) {
                    $verifyResult['error'] = 'Amount mismatch';
                } elseif ($approvedOrderId !== '' && $approvedOrderId !== $order_id) {
                    $verifyResult['error'] = 'Order id mismatch';
                } elseif (!empty($body['Signature'])
                    && !hash_equals(pg_nicepay_response_signature($approvedTid, $approvedMid, $approvedAmountRaw, $merchantKey), (string) $body['Signature'])) {
                    $verifyResult['error'] = 'Nicepay approval signature mismatch.';
                } else {
                    $verifyResult['ok']  = true;
                    $verifyResult['tno'] = $approvedTid;
                    if ($netCancelUrl !== '' && pg_nicepay_safe_url($netCancelUrl)) {
                        $verifyResult['nicepay_net_cancel'] = [
                            'url' => $netCancelUrl,
                            'tid' => $tid,
                            'auth_token' => $authToken,
                            'mid' => $mid,
                            'amount' => $amount,
                            'merchant_key' => $merchantKey,
                        ];
                    }
                    $verifyResult['bankname'] = (string) ($body['VbankBankName'] ?? $body['BankName'] ?? '');
                    $verifyResult['account'] = (string) ($body['VbankNum'] ?? '');
                    $verifyResult['depositor'] = (string) ($body['VbankAccountName'] ?? $body['Depositor'] ?? '');
                    $verifyResult['va_date'] = trim((string) ($body['VbankExpDate'] ?? '') . ' ' . (string) ($body['VbankExpTime'] ?? ''));
                    foreach (['VbankBankName', 'VbankNum', 'VbankExpDate', 'VbankExpTime'] as $key) {
                        if (!empty($body[$key])) {
                            $input[$key] = (string) $body[$key];
                        }
                    }
                    if (!empty($body['PayMethod'])) {
                        $input['PayMethod'] = (string) $body['PayMethod'];
                    }
                }
                if (!$verifyResult['ok'] && $verifyResult['error'] !== '') {
                    $netCancel = pg_nicepay_net_cancel($netCancelUrl, $tid, $authToken, $mid, $amount, $merchantKey);
                    if (empty($netCancel['ok'])) {
                        $verifyResult['restore_cart'] = false;
                        $verifyResult['pending_review'] = true;
                        $verifyResult['error'] .= ' Net-cancel failed; manual reconciliation required.';
                    }
                }
            }
        }
    }
    else {
        Response::error('Unknown PG service: ' . $pg_service, 400);
    }

    return $verifyResult;
}

/**
 * PG 승인 뒤 주문 확정이 실패했을 때 손님에게 보일 문구. $pgCancelled: PG 취소 요청 성공 true / 실패 false /
 * 이 PG 에는 자동 취소 경로가 없음 null. 운영자용 자세한 내용은 주문 기록 · 서버 로그에만 남긴다.
 */
function shop_payment_confirm_failure_message(bool $couponConflict, ?bool $pgCancelled): string
{
    $message = $couponConflict
        ? '이미 다른 주문에 사용한 쿠폰이 있어 주문을 완료하지 못했습니다.'
        : '주문 처리 중 오류가 나 주문을 완료하지 못했습니다.';
    if ($pgCancelled === true) {
        return $message . ' 결제는 자동으로 취소되었습니다.' . ($couponConflict ? '' : ' 잠시 후 다시 주문해 주세요.');
    }
    return $message . ' 결제가 승인된 채 남아 있을 수 있으니 주문번호와 함께 고객센터로 문의해 주세요.';
}

/** PG 취소 결과를 주문 기록 · 로그용 한 줄로 — 응답 원문(가상계좌 secret · 계좌번호 등)은 싣지 않는다. */
function shop_payment_cancel_result_summary(?array $result): string
{
    if ($result === null) {
        return '자동 취소 경로 없음';
    }
    $body = is_array($result['body'] ?? null) ? $result['body'] : [];
    $parts = [!empty($result['ok']) ? '요청 성공' : '요청 실패'];
    if (isset($result['http'])) {
        $parts[] = 'http=' . (int) $result['http'];
    }
    foreach (['status', 'code'] as $key) {
        if (isset($body[$key]) && is_scalar($body[$key]) && (string) $body[$key] !== '') {
            $parts[] = $key . '=' . (string) $body[$key];
        }
    }
    if (!empty($result['error'])) {
        $error = (string) $result['error'];
        $parts[] = 'error=' . (function_exists('mb_substr') ? mb_substr($error, 0, 200, 'UTF-8') : substr($error, 0, 200));
    }
    return implode(' ', $parts);
}
