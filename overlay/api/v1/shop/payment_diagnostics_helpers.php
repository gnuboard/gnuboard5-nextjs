<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function pg_payment_diagnostics(array $cfg): array {
    $rawService = (string) ($cfg['de_pg_service'] ?? '');
    $pgService = in_array($rawService, ['toss', 'inicis', 'kcp', 'nicepay'], true) ? $rawService : 'toss';
    $isTestMode = pg_detect_test_mode($cfg, $pgService);
    $origin = pg_request_origin();
    $methods = pg_payment_method_flags($cfg);
    $issues = [];

    if ($rawService !== '' && $rawService !== $pgService) {
        $issues[] = [
            'severity' => 'warning',
            'code'     => 'UNKNOWN_PG_SERVICE',
            'message'  => '지원하지 않는 PG 설정이라 Toss로 대체됩니다.',
        ];
    }
    if (!$isTestMode && strpos($origin, 'https://') !== 0 && !pg_is_local_origin($origin)) {
        $issues[] = [
            'severity' => 'error',
            'code'     => 'PUBLIC_API_NOT_HTTPS',
            'message'  => '운영 결제 콜백 URL은 HTTPS로 접근 가능해야 합니다.',
        ];
    }
    if (count(array_filter($methods)) === 0) {
        $issues[] = [
            'severity' => 'error',
            'code'     => 'NO_PAYMENT_METHOD',
            'message'  => '사용 가능한 결제수단이 없습니다.',
        ];
    }

    $runtime = [
        'php_version' => PHP_VERSION,
        'extensions'  => [
            'curl' => extension_loaded('curl'),
            'soap' => class_exists('SoapClient'),
            'json' => extension_loaded('json'),
            'mbstring' => extension_loaded('mbstring'),
            'openssl' => extension_loaded('openssl'),
        ],
        'payment_confirm' => [
            'lock' => 'mysql_named_lock',
            'transaction' => pg_payment_confirm_transaction_report(),
        ],
    ];

    $tossClientKey = pg_toss_config_value($cfg, 'client_key');
    $tossSecretKey = pg_toss_config_value($cfg, 'secret_key');
    $toss = [
        'ready' => pg_value_present($tossClientKey) && pg_value_present($tossSecretKey),
        'client_key_present' => pg_value_present($tossClientKey),
        'secret_key_present' => pg_value_present($tossSecretKey),
        'uses_gnuboard_config' => isset($cfg['cf_toss_client_key']) || isset($cfg['cf_toss_secret_key']),
        'test_fallback_available' => pg_detect_test_mode($cfg, 'toss'),
        'native_sdk' => true,
    ];

    $inicisTestMode = pg_detect_test_mode($cfg, 'inicis');
    $inicis = [
        'ready' => $inicisTestMode || (
            pg_value_present($cfg['de_inicis_mid'] ?? '') && pg_value_present($cfg['de_inicis_sign_key'] ?? '')
        ),
        'mid_present' => pg_value_present($cfg['de_inicis_mid'] ?? ''),
        'sign_key_present' => pg_value_present($cfg['de_inicis_sign_key'] ?? ''),
        'test_fallback_available' => $inicisTestMode,
    ];

    $kcpTestMode = pg_detect_test_mode($cfg, 'kcp');
    $kcpSiteCd = pg_kcp_site_cd($cfg, $kcpTestMode);
    $kcpWsdl = defined('G5_MSHOP_PATH')
        ? G5_MSHOP_PATH . '/kcp/' . ($kcpTestMode ? 'KCPPaymentService.wsdl' : 'real_KCPPaymentService.wsdl')
        : '';
    $kcpMobileLib = defined('G5_MSHOP_PATH') ? G5_MSHOP_PATH . '/kcp/KCPComLibrary.php' : '';
    $kcpPpCliLib = defined('G5_SHOP_PATH') ? G5_SHOP_PATH . '/kcp/pp_ax_hub_lib.php' : '';
    $kcp = [
        'ready' => $kcpSiteCd !== ''
            && pg_kcp_site_key($cfg, $kcpSiteCd) !== ''
            && class_exists('SoapClient')
            && is_file($kcpWsdl)
            && is_file($kcpMobileLib)
            && is_file($kcpPpCliLib),
        'site_cd' => $kcpSiteCd,
        'site_key_present' => pg_value_present(pg_kcp_site_key($cfg, $kcpSiteCd)),
        'mobile_library' => pg_file_status($kcpMobileLib),
        'approval_wsdl' => pg_file_status($kcpWsdl),
        'pp_cli_library' => pg_file_status($kcpPpCliLib),
    ];

    $nicepayTestMode = pg_detect_test_mode($cfg, 'nicepay');
    $nicepayMid = pg_nicepay_mid($cfg, $nicepayTestMode);
    $nicepayKey = pg_nicepay_key($cfg, $nicepayTestMode);
    $nicepayScriptUrl = pg_nicepay_script_url();
    $nicepayMobileUrl = pg_nicepay_mobile_url();
    $nicepay = [
        'ready' => pg_value_present($nicepayMid) && pg_value_present($nicepayKey),
        'mid_present' => pg_value_present($nicepayMid),
        'merchant_key_present' => pg_value_present($nicepayKey),
        'test_fallback_available' => $nicepayTestMode,
        'script_url' => $nicepayScriptUrl,
        'script_url_profile' => pg_nicepay_url_profile($nicepayScriptUrl),
        'recommended_script_url' => pg_nicepay_manual_script_url(),
        'mobile_url' => $nicepayMobileUrl,
        'mobile_url_profile' => pg_nicepay_url_profile($nicepayMobileUrl),
        'notify_allowed_ips' => pg_notify_allowed_ips('nicepay'),
        'webview' => [
            'wap_url_configured' => pg_nicepay_wap_url() !== '',
            'isp_cancel_url_configured' => pg_nicepay_isp_cancel_url() !== '',
        ],
        'cancel_api' => [
            'ssl_verify_peer' => true,
            'ssl_verify_host' => 2,
            'ca_bundle_required' => true,
        ],
    ];

    $gateways = [
        'toss' => $toss,
        'inicis' => $inicis,
        'kcp' => $kcp,
        'nicepay' => $nicepay,
    ];

    if (empty($gateways[$pgService]['ready'])) {
        $issues[] = [
            'severity' => 'error',
            'code'     => 'ACTIVE_PG_NOT_READY',
            'message'  => strtoupper($pgService) . ' 결제 설정 또는 런타임 구성이 아직 완료되지 않았습니다.',
        ];
    }
    if ($pgService === 'kcp' && !class_exists('SoapClient')) {
        $issues[] = [
            'severity' => 'error',
            'code'     => 'KCP_SOAP_MISSING',
            'message'  => 'KCP 모바일 거래등록에는 PHP SOAP 확장이 필요합니다.',
        ];
    }
    if ($pgService === 'nicepay' && empty($nicepay['ready'])) {
        $issues[] = [
            'severity' => 'error',
            'code'     => 'NICEPAY_KEYS_MISSING',
            'message'  => '나이스페이는 공개 테스트 MID가 없어 실제 MID와 상점키가 필요합니다.',
        ];
    }
    if ($pgService === 'nicepay' && $nicepay['script_url_profile'] === 'legacy_default') {
        $issues[] = [
            'severity' => 'warning',
            'code'     => 'NICEPAY_LEGACY_SCRIPT_URL',
            'message'  => 'Nicepay is using the legacy default PC script URL. If Nicepay support requests the current manual script, set SHOP_PG_NICEPAY_SCRIPT_URL.',
        ];
    }
    if ($pgService === 'inicis' && !$inicisTestMode && !$inicis['sign_key_present']) {
        $issues[] = [
            'severity' => 'error',
            'code'     => 'INICIS_SIGN_KEY_MISSING',
            'message'  => 'KG 이니시스 운영 결제에는 signKey가 필요합니다.',
        ];
    }

    return [
        'active_pg' => $pgService,
        'is_test_mode' => $isTestMode,
        'api_origin' => $origin,
        'callback_urls' => [
            'return' => pg_api_url('/shop/payment/mobile-return'),
            'close' => pg_api_url('/shop/payment/mobile-close'),
        ],
        'payment_methods' => $methods,
        'bank_account_count' => count(pg_bank_accounts($cfg)),
        'runtime' => $runtime,
        'gateways' => $gateways,
        'issues' => $issues,
        'ready' => count(array_filter($issues, static fn($issue) => ($issue['severity'] ?? '') === 'error')) === 0,
    ];
}
