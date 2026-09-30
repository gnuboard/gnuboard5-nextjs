<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function pg_inicis_test_sign_key(): string {
    return getenv('SHOP_PG_INICIS_TEST_SIGN_KEY') ?: 'SU5JTElURV9UUklQTEVERVNfS0VZU1RS';
}

function pg_inicis_mid(array $cfg, bool $isTestMode): string {
    $mid = trim((string) ($cfg['de_inicis_mid'] ?? ''));

    if ($isTestMode) {
        if ($mid === '' || $mid === 'soft000') {
            return (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? 'iniescrow0' : 'INIpayTest';
        }
        return $mid;
    }

    if ($mid !== '' && strpos($mid, 'SIR') !== 0) {
        return 'SIR' . $mid;
    }

    return $mid;
}

function pg_inicis_sign_key(array $cfg, bool $isTestMode): string {
    if ($isTestMode) {
        return pg_inicis_test_sign_key();
    }

    return trim((string) ($cfg['de_inicis_sign_key'] ?? ''));
}

function pg_inicis_script_url(bool $isTestMode): string {
    return $isTestMode
        ? 'https://stgstdpay.inicis.com/stdjs/INIStdPay.js'
        : 'https://stdpay.inicis.com/stdjs/INIStdPay.js';
}

function pg_inicis_mobile_url(bool $isTestMode): string {
    return $isTestMode
        ? 'https://stgmobile.inicis.com/smart/'
        : 'https://mobile.inicis.com/smart/';
}

function pg_kakaopay_enabled(array $cfg): bool {
    return trim((string) ($cfg['de_kakaopay_enckey'] ?? '')) !== '';
}

function pg_kakaopay_mid(array $cfg, bool $isTestMode): string {
    if ($isTestMode) {
        return (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? 'iniescrow0' : 'INIpayTest';
    }

    $mid = trim((string) ($cfg['de_kakaopay_mid'] ?? ''));
    if ($mid !== '' && strpos($mid, 'SIRK') !== 0) {
        return 'SIRK' . $mid;
    }

    return $mid;
}

function pg_kakaopay_sign_key(array $cfg, bool $isTestMode): string {
    if ($isTestMode) {
        return pg_inicis_test_sign_key();
    }

    return trim((string) ($cfg['de_kakaopay_key'] ?? ''));
}

function pg_inicis_accept_method(array $cfg): string {
    $useEscrow = (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? ':useescrow' : '';
    $cardPoint = (int) ($cfg['de_inicis_cartpoint_use'] ?? 0) === 1 ? ':cardpoint' : '';
    $vbankDate = date('Ymd', strtotime('+3 days'));

    return 'HPP(2):no_receipt:vbank(' . $vbankDate . '):below1000:centerCd(Y)' . $useEscrow . $cardPoint;
}

function pg_inicis_signature_auth(string $mid, string $timestamp, string $moid, string $totPrice): string {
    $last = (int) substr($timestamp, -1);

    switch ($last) {
        case 1:
            $stringToSign = "MOID={$moid}&mid={$mid}&tstamp={$timestamp}";
            break;
        case 2:
            $stringToSign = "MOID={$moid}&tstamp={$timestamp}&mid={$mid}";
            break;
        case 3:
            $stringToSign = "mid={$mid}&MOID={$moid}&tstamp={$timestamp}";
            break;
        case 4:
            $stringToSign = "mid={$mid}&tstamp={$timestamp}&MOID={$moid}";
            break;
        case 5:
            $stringToSign = "tstamp={$timestamp}&mid={$mid}&MOID={$moid}";
            break;
        case 6:
            $stringToSign = "tstamp={$timestamp}&MOID={$moid}&mid={$mid}";
            break;
        case 7:
            $stringToSign = "TotPrice={$totPrice}&mid={$mid}&tstamp={$timestamp}";
            break;
        case 8:
            $stringToSign = "TotPrice={$totPrice}&tstamp={$timestamp}&mid={$mid}";
            break;
        case 9:
            $stringToSign = "TotPrice={$totPrice}&MOID={$moid}&tstamp={$timestamp}";
            break;
        default:
            $stringToSign = "TotPrice={$totPrice}&tstamp={$timestamp}&MOID={$moid}";
            break;
    }

    return hash('sha256', $stringToSign);
}

function pg_inicis_safe_url(string $url): bool {
    $parts = parse_url($url);
    if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        return false;
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    return $host === 'inicis.com' || substr($host, -11) === '.inicis.com';
}

function pg_inicis_post_json(string $url, array $params, int $timeout = 30): array {
    if (!pg_inicis_safe_url($url)) {
        return ['ok' => false, 'error' => 'Invalid Inicis URL.'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is required for Inicis.'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded; charset=UTF-8'],
        CURLOPT_POSTFIELDS => http_build_query($params),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout,
    ]);
    $resp = curl_exec($ch);
    $errno = (int) curl_errno($ch);
    $curlError = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $body = json_decode((string) $resp, true);
    return [
        'ok' => is_array($body) && $http >= 200 && $http < 300,
        'http' => $http,
        'errno' => $errno,
        'timed_out' => in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
        'body' => is_array($body) ? $body : null,
        'raw' => (string) $resp,
        'error' => $curlError !== '' ? $curlError : (is_array($body) ? '' : 'Inicis returned an invalid response.'),
    ];
}

function pg_inicis_post_keyvalue(string $url, array $params, int $timeout = 30): array {
    if (!pg_inicis_safe_url($url)) {
        return ['ok' => false, 'error' => 'Invalid Inicis URL.'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is required for Inicis.'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($params),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout,
    ]);
    $resp = curl_exec($ch);
    $errno = (int) curl_errno($ch);
    $curlError = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $body = [];
    parse_str((string) $resp, $body);

    return [
        'ok' => $body !== [] && $http >= 200 && $http < 300,
        'http' => $http,
        'errno' => $errno,
        'timed_out' => in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
        'body' => $body !== [] ? $body : null,
        'raw' => (string) $resp,
        'error' => $curlError !== '' ? $curlError : ($body !== [] ? '' : 'Inicis returned an invalid mobile response.'),
    ];
}

function pg_inicis_mobile_verification(string $pgService, string $orderId, int $amount, string $tid, string $mid, string $signKey): string {
    return hash_hmac('sha256', $pgService . '|' . $orderId . '|' . $amount . '|' . $tid . '|' . $mid, $signKey);
}

function pg_inicis_net_cancel(string $url, array $params): array {
    if ($url === '') {
        return ['ok' => false, 'error' => 'Inicis netCancelUrl is empty.'];
    }

    return pg_inicis_post_json($url, $params, 10);
}

function pg_inicis_mobile_net_cancel_url(string $reqUrl): string {
    $parts = parse_url($reqUrl);
    if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        return '';
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($host === '' || ($host !== 'inicis.com' && substr($host, -11) !== '.inicis.com')) {
        return '';
    }

    $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
    return 'https://' . $host . $port . '/smart/payNetCancel.ini';
}

function pg_inicis_mobile_net_cancel(string $url, string $mid, string $tid, int $amount): array {
    if ($url === '') {
        return ['ok' => false, 'error' => 'Inicis mobile net-cancel URL is empty.'];
    }

    return pg_inicis_post_keyvalue($url, [
        'P_MID' => $mid,
        'P_TID' => $tid,
        'P_AMT' => (string) $amount,
    ], 10);
}

function pg_inicis_bank_name(string $code): string {
    $banks = [
        '03' => '기업은행',
        '04' => '국민은행',
        '05' => '외환은행',
        '07' => '수협중앙회',
        '11' => '농협중앙회',
        '20' => '우리은행',
        '23' => 'SC제일은행',
        '31' => '대구은행',
        '32' => '부산은행',
        '34' => '광주은행',
        '37' => '전북은행',
        '39' => '경남은행',
        '53' => '한국씨티은행',
        '71' => '우체국',
        '81' => '하나은행',
        '88' => '신한은행',
        '89' => '케이뱅크',
        '90' => '카카오뱅크',
        '92' => '토스뱅크',
    ];

    return $banks[$code] ?? $code;
}

function pg_inicis_vbank_due(string $date, string $time): string {
    $date = preg_replace('/[^0-9]/', '', $date);
    $time = preg_replace('/[^0-9]/', '', $time);
    if (strlen($date) === 8) {
        $date = substr($date, 0, 4) . '-' . substr($date, 4, 2) . '-' . substr($date, 6, 2);
    }
    if (strlen($time) >= 4) {
        $time = substr($time, 0, 2) . ':' . substr($time, 2, 2) . (strlen($time) >= 6 ? ':' . substr($time, 4, 2) : '');
    }

    return trim($date . ' ' . $time);
}
