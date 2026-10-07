<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function pg_kcp_register_payment(array $cfg, string $orderId, string $orderName, int $amount, string $settleCase, string $returnUrl): array {
    $paymentMethod = pg_kcp_mobile_payment_method($settleCase);
    if ($paymentMethod === '') {
        return ['ok' => false, 'error' => 'KCP에서 지원하지 않는 결제수단입니다.'];
    }
    if (!defined('G5_MSHOP_PATH') || !is_file(G5_MSHOP_PATH . '/kcp/KCPComLibrary.php')) {
        return ['ok' => false, 'error' => 'KCP 모바일 거래등록 라이브러리를 찾을 수 없습니다.'];
    }
    if (!class_exists('SoapClient')) {
        return ['ok' => false, 'error' => 'PHP SOAP 확장이 필요합니다.'];
    }

    require_once G5_MSHOP_PATH . '/kcp/KCPComLibrary.php';
    if (!class_exists('PayService')) {
        return ['ok' => false, 'error' => 'KCP 모바일 거래등록 클래스를 로드하지 못했습니다.'];
    }

    $isTestMode = pg_detect_test_mode($cfg, 'kcp');
    $siteCd = pg_kcp_site_cd($cfg, $isTestMode);
    $wsdl = G5_MSHOP_PATH . '/kcp/' . ($isTestMode ? 'KCPPaymentService.wsdl' : 'real_KCPPaymentService.wsdl');
    if (!is_file($wsdl)) {
        return ['ok' => false, 'error' => 'KCP WSDL 파일을 찾을 수 없습니다.'];
    }

    try {
        $payService = new PayService($wsdl);
        $payService->setCharSet('utf-8');
        $payService->setAccessCredentialType('', '', '');
        $payService->setBaseRequestType(
            '0',
            'WEB',
            $orderId,
            $_SERVER['HTTP_USER_AGENT'] ?? 'YoungCartApp',
            '0.1'
        );
        $payService->setApproveReq(
            $settleCase === '간편결제' ? false : true,
            $orderId,
            (string) $amount,
            $paymentMethod,
            $orderName,
            $returnUrl,
            $siteCd
        );
        $approveRes = $payService->approve();
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'KCP 거래등록 실패: ' . $e->getMessage()];
    }

    if ($payService->resCD !== '0000') {
        return [
            'ok' => false,
            'error' => 'KCP 거래등록 실패: [' . $payService->resCD . '] ' . pg_kcp_message_to_utf8((string) $payService->resMsg),
        ];
    }

    return [
        'ok'           => true,
        'approval_key' => (string) ($approveRes->approvalKey ?? ''),
        'pay_url'      => (string) ($approveRes->payUrl ?? ''),
        'pay_method'   => $paymentMethod,
        'site_cd'      => $siteCd,
    ];
}

function pg_kcp_cli_approve(array $cfg, array $input, string $orderId, int $amount, string $settleCase): array {
    $siteCd = trim((string) ($input['site_cd'] ?? ''));
    if ($siteCd === '') {
        $siteCd = pg_kcp_site_cd($cfg, false);
    }
    if ($siteCd !== '' && preg_match('/^(T\d{4}|S\d{4}|SR)/', $siteCd) !== 1) {
        $siteCd = 'SR' . $siteCd;
    }

    $siteKey = pg_kcp_site_key($cfg, $siteCd);
    if ($siteCd === '' || $siteKey === '') {
        return ['ok' => false, 'error' => 'KCP site_cd/site_key 설정이 필요합니다.'];
    }
    if (!defined('G5_SHOP_PATH') || !is_file(G5_SHOP_PATH . '/kcp/pp_ax_hub_lib.php')) {
        return ['ok' => false, 'error' => 'KCP PP_CLI 라이브러리를 찾을 수 없습니다.'];
    }

    require_once G5_SHOP_PATH . '/kcp/pp_ax_hub_lib.php';
    if (!class_exists('C_PP_CLI_T')) {
        return ['ok' => false, 'error' => 'KCP PP_CLI 클래스를 로드하지 못했습니다.'];
    }

    $tranCd = preg_replace('/[^0-9A-Za-z_\-\.]/i', '', (string) ($input['tran_cd'] ?? ''));
    $encInfo = (string) ($input['enc_info'] ?? '');
    $encData = (string) ($input['enc_data'] ?? '');
    if ($tranCd === '' || $encInfo === '' || $encData === '') {
        return ['ok' => false, 'error' => 'KCP 승인에 필요한 enc_info/enc_data/tran_cd 값이 없습니다.'];
    }

    $homeDir = G5_SHOP_PATH . '/kcp';
    $gwUrl = preg_match('/^(T\d{4}|S\d{4})/', $siteCd) === 1 ? 'testpaygw.kcp.co.kr' : 'paygw.kcp.co.kr';
    $keyDir = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? $homeDir . '/bin/pub.key' : '';
    require_once __DIR__ . '/kcp_log_helpers.php';
    $logDir = shop_api_kcp_log_dir(sys_get_temp_dir()); // 웹에서 못 열게 막은 뒤의 로그 폴더

    $usePayMethod = (string) ($input['use_pay_method'] ?? ($input['ret_pay_method'] ?? ($input['pay_method'] ?? '')));
    $mappedPayMethod = pg_kcp_bitmask_from_mobile_method($usePayMethod);
    if ($mappedPayMethod !== '') {
        $usePayMethod = $mappedPayMethod;
    }
    if ($usePayMethod === '') {
        if ($settleCase === '계좌이체') $usePayMethod = '010000000000';
        elseif ($settleCase === '가상계좌') $usePayMethod = '001000000000';
        elseif ($settleCase === '휴대폰') $usePayMethod = '000010000000';
        else $usePayMethod = '100000000000';
    }

    $payPlus = new C_PP_CLI_T;
    $payPlus->mf_clear();
    $payPlus->mf_set_ordr_data('ordr_mony', $amount);
    $payType = pg_kcp_pay_type($settleCase, $usePayMethod);
    if ($payType !== '') {
        $payPlus->mf_set_ordr_data('pay_type', $payType);
    }
    $payPlus->mf_set_ordr_data('ordr_no', $orderId);
    $payPlus->mf_set_encx_data($encData, $encInfo);

    $traceNo = (string) ($input['trace_no'] ?? '');
    $custIp = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $payPlus->mf_do_tx(
        $traceNo,
        $homeDir,
        $siteCd,
        $siteKey,
        $tranCd,
        '',
        $gwUrl,
        '8090',
        'payplus_cli_slib',
        $orderId,
        $custIp,
        '3',
        0,
        0,
        $keyDir,
        $logDir
    );

    // 가상계좌 발급 정상 응답은 V000 으로 온다(KCP 정책 변경 — 영카트 shop/kcp/pp_ax_hub.php 와 같게 받는다).
    if ($payPlus->m_res_cd !== '0000' && $payPlus->m_res_cd !== 'V000') {
        return [
            'ok' => false,
            'error' => '[' . $payPlus->m_res_cd . '] ' . pg_kcp_message_to_utf8((string) $payPlus->m_res_msg),
        ];
    }

    $approvedAmount = (int) $payPlus->mf_get_res_data('amount');
    if ($approvedAmount !== $amount) {
        return ['ok' => false, 'error' => 'KCP 승인 금액 불일치'];
    }

    return [
        'ok'        => true,
        'tno'       => $payPlus->mf_get_res_data('tno'),
        'bankname'  => pg_kcp_message_to_utf8($payPlus->mf_get_res_data('bankname')),
        'account'   => $payPlus->mf_get_res_data('account'),
        'depositor' => pg_kcp_message_to_utf8($payPlus->mf_get_res_data('depositor')),
        'va_date'   => $payPlus->mf_get_res_data('va_date'),
    ];
}
