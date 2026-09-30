<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'kcp-return') {
    $input = array_merge($_GET, $_POST);
    $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin'], $_SERVER['HTTP_ORIGIN'] ?? '*'));
    $orderId = pg_mobile_request_value($input, ['order_id', 'orderId', 'ordr_idxx']);
    $amount = pg_mobile_request_value($input, ['amount', 'good_mny'], '0');
    $resCd = pg_mobile_request_value($input, ['res_cd', 'resCd']);
    $resMsg = pg_kcp_return_field($input, ['res_msg', 'resMsg'], '');

    if ($resCd !== '' && $resCd !== '0000') {
        $cancelled = in_array($resCd, ['3000', '3001', '7777'], true);
        pg_kcp_bridge_html([
            'type' => 'shop-payment-result',
            'status' => $cancelled ? 'cancelled' : 'error',
            'orderId' => $orderId,
            'message' => '[' . $resCd . '] ' . ($resMsg !== '' ? $resMsg : 'KCP payment was not completed.'),
        ], $targetOrigin);
    }

    $encInfo = (string) ($input['enc_info'] ?? '');
    $encData = (string) ($input['enc_data'] ?? '');
    $tranCd = (string) ($input['tran_cd'] ?? '');
    if ($encInfo === '' || $encData === '' || $tranCd === '') {
        pg_kcp_bridge_html([
            'type' => 'shop-payment-result',
            'status' => 'error',
            'orderId' => $orderId,
            'message' => 'KCP authentication response is missing enc_info/enc_data/tran_cd.',
        ], $targetOrigin);
    }

    $fieldKeys = [
        'req_tx', 'res_cd', 'res_msg', 'tran_cd', 'ordr_idxx', 'good_name', 'good_mny',
        'site_cd', 'pay_method', 'use_pay_method', 'ret_pay_method', 'enc_info', 'enc_data',
        'tno', 'trace_no', 'bankname', 'depositor', 'account', 'va_date', 'cash_yn',
        'cash_authno', 'cash_tr_code', 'cash_id_info',
    ];
    $fields = [];
    foreach ($fieldKeys as $key) {
        if (isset($input[$key])) {
            $fields[$key] = pg_kcp_message_to_utf8((string) $input[$key]);
        }
    }
    $fields['res_cd'] = $fields['res_cd'] ?? '0000';
    if (empty($fields['ordr_idxx']) && $orderId !== '') {
        $fields['ordr_idxx'] = $orderId;
    }
    if (empty($fields['good_mny']) && $amount !== '') {
        $fields['good_mny'] = $amount;
    }
    if (empty($fields['use_pay_method'])) {
        $mappedPayMethod = pg_kcp_bitmask_from_mobile_method((string) ($fields['ret_pay_method'] ?? ($fields['pay_method'] ?? '')));
        if ($mappedPayMethod !== '') {
            $fields['use_pay_method'] = $mappedPayMethod;
        }
    }

    pg_kcp_bridge_html([
        'type' => 'shop-kcp-auth-result',
        'status' => 'success',
        'orderId' => $orderId,
        'amount' => (int) $amount,
        'fields' => $fields,
        'message' => 'KCP authentication completed. Finalizing order...',
    ], $targetOrigin);
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && ($action === 'inicis-close' || $action === 'inicis-popup')) {
    $cfg = pg_load_config() ?: [];
    $isTestMode = pg_detect_test_mode($cfg, 'inicis');
    if ($action === 'inicis-popup') {
        pg_inicis_script_html($isTestMode
            ? 'https://stgstdpay.inicis.com/stdjs/INIStdPay_popup.js'
            : 'https://stdpay.inicis.com/stdjs/INIStdPay_popup.js'
        );
    }

    $input = array_merge($_GET, $_POST);
    $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin'], $_SERVER['HTTP_ORIGIN'] ?? '*'));
    pg_inicis_bridge_html([
        'type' => 'shop-payment-result',
        'status' => 'cancelled',
        'orderId' => pg_mobile_request_value($input, ['order_id', 'orderId', 'MOID', 'Moid', 'oid', 'orderNumber']),
        'message' => 'KG 이니시스 결제가 취소되었습니다.',
    ], $targetOrigin, $isTestMode
        ? 'https://stgstdpay.inicis.com/stdjs/INIStdPay_close.js'
        : 'https://stdpay.inicis.com/stdjs/INIStdPay_close.js'
    );
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'inicis-return') {
    $input = array_merge($_GET, $_POST);
    $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin'], $_SERVER['HTTP_ORIGIN'] ?? '*'));
    $orderId = pg_mobile_request_value($input, ['order_id', 'orderId', 'MOID', 'Moid', 'oid', 'orderNumber']);
    $amount = pg_mobile_request_value($input, ['amount', 'TotPrice', 'P_AMT', 'price'], '0');
    $resultCode = pg_mobile_request_value($input, ['resultCode', 'P_STATUS', 'ResultCode']);
    $resultMsg = pg_mobile_request_value($input, ['resultMsg', 'P_RMESG1', 'ResultMsg'], '');
    $confirmPgService = strtolower(pg_mobile_request_value($input, ['pg_service', 'provider'], 'inicis'));
    if (!in_array($confirmPgService, ['inicis', 'kakaopay'], true)) {
        $confirmPgService = 'inicis';
    }

    $inicisSuccessCodes = ['0000', '00'];
    if ($resultCode !== '' && !in_array($resultCode, $inicisSuccessCodes, true)) {
        pg_inicis_bridge_html([
            'type' => 'shop-payment-result',
            'status' => in_array($resultCode, ['01', '3001'], true) ? 'cancelled' : 'error',
            'orderId' => $orderId,
            'message' => '[' . $resultCode . '] ' . ($resultMsg !== '' ? $resultMsg : 'KG 이니시스 결제가 완료되지 않았습니다.'),
        ], $targetOrigin);
    }

    $mobileReqUrl = pg_mobile_request_value($input, ['P_REQ_URL', 'p_req_url']);
    $mobileTid = pg_mobile_request_value($input, ['P_TID', 'tid', 'TID']);
    if ($mobileReqUrl !== '' || $mobileTid !== '') {
        if ($mobileReqUrl === '' || $mobileTid === '') {
            pg_inicis_bridge_html([
                'type' => 'shop-payment-result',
                'status' => 'error',
                'orderId' => $orderId,
                'message' => 'KG 이니시스 모바일 인증 응답에 P_REQ_URL/P_TID가 없습니다.',
            ], $targetOrigin);
        }
        if (!pg_inicis_safe_url($mobileReqUrl)) {
            pg_inicis_bridge_html([
                'type' => 'shop-payment-result',
                'status' => 'error',
                'orderId' => $orderId,
                'message' => 'KG 이니시스 모바일 승인 URL이 올바르지 않습니다.',
            ], $targetOrigin);
        }

        $cfg = pg_load_config() ?: [];
        $isKakaopay = $confirmPgService === 'kakaopay';
        $isInicisTest = $isKakaopay ? pg_detect_test_mode($cfg, 'kakaopay') : pg_detect_test_mode($cfg, 'inicis');
        $mid = $isKakaopay ? pg_kakaopay_mid($cfg, $isInicisTest) : pg_inicis_mid($cfg, $isInicisTest);
        $signKey = $isKakaopay ? pg_kakaopay_sign_key($cfg, $isInicisTest) : pg_inicis_sign_key($cfg, $isInicisTest);
        if ($mid === '' || (!$isInicisTest && $signKey === '')) {
            pg_inicis_bridge_html([
                'type' => 'shop-payment-result',
                'status' => 'error',
                'orderId' => $orderId,
                'message' => 'KG 이니시스 모바일 결제 상점 정보가 설정되지 않았습니다.',
            ], $targetOrigin);
        }

        $approval = pg_inicis_post_keyvalue($mobileReqUrl, [
            'P_MID' => $mid,
            'P_TID' => $mobileTid,
        ]);
        $body = is_array($approval['body'] ?? null) ? $approval['body'] : [];
        $approvedStatus = (string) ($body['P_STATUS'] ?? '');
        if (empty($approval['ok']) || !in_array($approvedStatus, ['00', '0000'], true)) {
            $message = (string) ($body['P_RMESG1'] ?? ($approval['error'] ?? 'KG Inicis mobile approval failed.'));
            pg_inicis_bridge_html([
                'type' => 'shop-payment-result',
                'status' => 'error',
                'orderId' => $orderId,
                'message' => $message,
            ], $targetOrigin);
        }

        $approvedOrderId = (string) ($body['P_OID'] ?? $body['P_NOTI'] ?? $orderId);
        $approvedAmount = (int) preg_replace('/[^0-9]/', '', (string) ($body['P_AMT'] ?? $amount));
        $approvedTid = (string) ($body['P_TID'] ?? $mobileTid);
        $mobileNetCancelUrl = pg_inicis_mobile_net_cancel_url($mobileReqUrl);
        $fields = [];
        $mobileFieldKeys = [
            'P_STATUS', 'P_RMESG1', 'P_TID', 'P_AMT', 'P_MID', 'P_OID', 'P_TYPE',
            'P_AUTH_DT', 'P_AUTH_NO', 'P_HPP_CORP', 'P_APPL_NUM', 'P_VACT_NUM',
            'P_VACT_NAME', 'P_VACT_BANK_CODE', 'P_CARD_ISSUER_CODE', 'P_UNAME',
        ];
        foreach ($mobileFieldKeys as $key) {
            if (isset($body[$key]) && trim((string) $body[$key]) !== '') {
                $fields[$key] = (string) $body[$key];
            }
        }
        $fields['P_STATUS'] = $fields['P_STATUS'] ?? '00';
        $fields['P_TID'] = $approvedTid;
        $fields['P_MID'] = (string) ($fields['P_MID'] ?? $mid);
        $fields['P_OID'] = $approvedOrderId !== '' ? $approvedOrderId : $orderId;
        $fields['P_AMT'] = (string) $approvedAmount;
        if ($mobileNetCancelUrl !== '') {
            $fields['P_NET_CANCEL_URL'] = $mobileNetCancelUrl;
        }
        $fields['mobile_verification'] = pg_inicis_mobile_verification($confirmPgService, $fields['P_OID'], $approvedAmount, $approvedTid, $mid, $signKey);

        pg_inicis_bridge_html([
            'type' => 'shop-inicis-auth-result',
            'status' => 'success',
            'orderId' => $fields['P_OID'],
            'amount' => $approvedAmount,
            'fields' => $fields,
            'message' => 'KG 이니시스 모바일 인증이 완료되었습니다. 주문을 확정하는 중입니다...',
        ], $targetOrigin, '', $confirmPgService);
    }

    $authToken = pg_mobile_request_value($input, ['authToken', 'AuthToken']);
    $authUrl = pg_mobile_request_value($input, ['authUrl']);
    if ($authToken === '' || $authUrl === '') {
        pg_inicis_bridge_html([
            'type' => 'shop-payment-result',
            'status' => 'error',
            'orderId' => $orderId,
            'message' => 'KG 이니시스 인증 응답에 authToken/authUrl 이 없습니다.',
        ], $targetOrigin);
    }

    $fieldKeys = [
        'resultCode', 'resultMsg', 'authToken', 'authUrl', 'netCancelUrl', 'mid', 'MOID',
        'Moid', 'oid', 'orderNumber', 'TotPrice', 'price', 'authSignature', 'idc_name',
        'payMethod', 'tid', 'TID', 'VACT_BankCode', 'VACT_Num', 'VACT_Name',
        'VACT_InputName', 'VACT_Date', 'VACT_Time',
    ];
    $fields = [];
    foreach ($fieldKeys as $key) {
        if (isset($input[$key]) && trim((string) $input[$key]) !== '') {
            $fields[$key] = (string) $input[$key];
        }
    }
    $fields['resultCode'] = $fields['resultCode'] ?? '0000';
    if (empty($fields['MOID']) && $orderId !== '') {
        $fields['MOID'] = $orderId;
    }
    if (empty($fields['TotPrice']) && $amount !== '') {
        $fields['TotPrice'] = $amount;
    }

    pg_inicis_bridge_html([
        'type' => 'shop-inicis-auth-result',
        'status' => 'success',
        'orderId' => $orderId,
        'amount' => (int) $amount,
        'fields' => $fields,
        'message' => 'KG 이니시스 인증이 완료되었습니다. 주문을 확정하는 중입니다...',
    ], $targetOrigin, '', $confirmPgService);
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'nicepay-return') {
    $input = array_merge($_GET, $_POST);
    $targetOrigin = pg_post_message_origin(pg_mobile_request_value($input, ['target_origin'], $_SERVER['HTTP_ORIGIN'] ?? pg_request_origin()));
    $orderId = pg_mobile_request_value($input, ['order_id', 'orderId', 'Moid', 'MOID']);
    $amount = pg_mobile_request_value($input, ['amount', 'Amt'], '0');
    $authResultCode = pg_mobile_request_value($input, ['AuthResultCode', 'ResultCode']);
    // 나이스페이는 euc-kr 로 POST 한다 — UTF-8 로 바꾸지 않으면 json_encode 가 실패해 브리지 payload 가 null 이 된다.
    $authResultMsg = pg_nicepay_text_to_utf8(pg_mobile_request_value($input, ['AuthResultMsg', 'ResultMsg'], ''));

    if ($authResultCode !== '' && $authResultCode !== '0000') {
        pg_nicepay_bridge_html([
            'type' => 'shop-payment-result',
            'status' => in_array($authResultCode, ['3001', '9999'], true) ? 'cancelled' : 'error',
            'orderId' => $orderId,
            'message' => '[' . $authResultCode . '] ' . ($authResultMsg !== '' ? $authResultMsg : 'Nicepay payment was not completed.'),
        ], $targetOrigin);
    }

    $authToken = pg_mobile_request_value($input, ['AuthToken', 'authToken']);
    $txTid = pg_mobile_request_value($input, ['TxTid', 'TID', 'tid']);
    $nextAppUrl = pg_mobile_request_value($input, ['NextAppURL', 'nextAppURL']);
    if ($authToken === '' || $txTid === '' || $nextAppUrl === '') {
        pg_nicepay_bridge_html([
            'type' => 'shop-payment-result',
            'status' => 'error',
            'orderId' => $orderId,
            'message' => 'Nicepay authentication response is missing AuthToken/TxTid/NextAppURL.',
        ], $targetOrigin);
    }

    $fieldKeys = [
        'AuthResultCode', 'AuthResultMsg', 'AuthToken', 'PayMethod', 'MID',
        'Moid', 'Amt', 'ReqReserved', 'TxTid', 'NextAppURL', 'NetCancelURL',
        'Signature', 'ResultCode', 'ResultMsg', 'TID', 'VbankBankCode',
        'VbankBankName', 'VbankNum', 'VbankExpDate', 'VbankExpTime',
    ];
    $fields = [];
    foreach ($fieldKeys as $key) {
        if (isset($input[$key]) && trim((string) $input[$key]) !== '') {
            $fields[$key] = pg_nicepay_text_to_utf8((string) $input[$key]);
        }
    }
    $fields['AuthResultCode'] = $fields['AuthResultCode'] ?? '0000';
    if (empty($fields['Moid']) && $orderId !== '') {
        $fields['Moid'] = $orderId;
    }
    if (empty($fields['Amt']) && $amount !== '') {
        $fields['Amt'] = $amount;
    }

    pg_nicepay_bridge_html([
        'type' => 'shop-nicepay-auth-result',
        'status' => 'success',
        'orderId' => $orderId,
        'amount' => (int) preg_replace('/[^0-9]/', '', $amount),
        'fields' => $fields,
        'message' => 'Nicepay authentication completed. Finalizing order...',
    ], $targetOrigin);
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && ($action === 'mobile-return' || $action === 'mobile-close')) {
    $input = array_merge($_GET, $_POST);
    $state = $action === 'mobile-close' ? 'fail' : 'success';
    $message = '결제 인증이 완료되었습니다. 앱에서 승인 결과를 확인합니다.';

    $kcpCode = pg_mobile_request_value($input, ['res_cd', 'resCd']);
    $inicisCode = pg_mobile_request_value($input, ['resultCode', 'P_STATUS']);
    $niceCode = pg_mobile_request_value($input, ['AuthResultCode', 'ResultCode']);
    if ($state === 'success' && $kcpCode !== '' && $kcpCode !== '0000') {
        $state = 'fail';
        $message = pg_mobile_request_value($input, ['res_msg', 'resMsg'], 'KCP 결제가 완료되지 않았습니다.');
    }
    if ($state === 'success' && $inicisCode !== '' && !in_array($inicisCode, ['0000', '00'], true)) {
        $state = 'fail';
        $message = pg_mobile_request_value($input, ['resultMsg', 'P_RMESG1'], '이니시스 결제가 완료되지 않았습니다.');
    }
    if ($state === 'success' && $niceCode !== '' && $niceCode !== '0000') {
        $state = 'fail';
        $message = pg_mobile_request_value($input, ['AuthResultMsg', 'ResultMsg'], '나이스페이 결제가 완료되지 않았습니다.');
    }
    if ($state === 'fail' && $message === '결제 인증이 완료되었습니다. 앱에서 승인 결과를 확인합니다.') {
        $message = pg_mobile_request_value($input, ['message', 'res_msg', 'resultMsg', 'AuthResultMsg'], '결제창이 닫혔습니다.');
    }

    $targetUrl = pg_mobile_deep_link($state, $input);
    pg_mobile_return_html($targetUrl, $state === 'success' ? '결제 승인 확인' : '결제 미완료', $message);
}
