<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function pg_nicepay_test_mid(): string {
    return 'nicepay00m';
}

function pg_nicepay_test_key(): string {
    return getenv('SHOP_PG_NICEPAY_TEST_KEY') ?: 'EYzu8jGGMfqaDEp76gSckuvnaHHu+bC4opsSN6lHv3b2lurNYkVXrZ7Z1AoqQnXI3eLuaUFyoRNC6FkrzVjceg==';
}

function pg_nicepay_mid(array $cfg, bool $isTestMode): string {
    if ($isTestMode) {
        return pg_nicepay_test_mid();
    }

    $mid = trim((string) ($cfg['de_nicepay_mid'] ?? ''));
    if ($mid !== '' && strpos($mid, 'SR') !== 0) {
        return 'SR' . $mid;
    }

    return $mid;
}

function pg_nicepay_mid_candidates(array $cfg, bool $isTestMode): array {
    $candidates = [];
    $normalized = pg_nicepay_mid($cfg, $isTestMode);
    $raw = trim((string) ($cfg['de_nicepay_mid'] ?? ''));

    foreach ([$normalized, $raw] as $mid) {
        if ($mid !== '') {
            $candidates[] = $mid;
        }
        if ($mid !== '' && strpos($mid, 'SR') === 0) {
            $candidates[] = substr($mid, 2);
        } elseif ($mid !== '') {
            $candidates[] = 'SR' . $mid;
        }
    }

    return array_values(array_unique(array_filter($candidates, static fn($mid) => trim((string) $mid) !== '')));
}

function pg_nicepay_key(array $cfg, bool $isTestMode): string {
    if ($isTestMode) {
        return pg_nicepay_test_key();
    }

    return trim((string) ($cfg['de_nicepay_key'] ?? ''));
}

function pg_nicepay_config_url(string $envName, string $fallback): string {
    $url = trim((string) (getenv($envName) ?: ''));
    if ($url !== '' && pg_nicepay_safe_url($url)) {
        return $url;
    }

    return $fallback;
}

function pg_nicepay_legacy_script_url(): string {
    return 'https://web.nicepay.co.kr/v3/webstd/js/nicepay-3.0.js';
}

function pg_nicepay_manual_script_url(): string {
    return 'https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js';
}

function pg_nicepay_legacy_mobile_url(): string {
    return 'https://web.nicepay.co.kr/v3/v3Payment.jsp';
}

function pg_nicepay_script_url(): string {
    return pg_nicepay_config_url(
        'SHOP_PG_NICEPAY_SCRIPT_URL',
        pg_nicepay_legacy_script_url()
    );
}

function pg_nicepay_mobile_url(): string {
    return pg_nicepay_config_url(
        'SHOP_PG_NICEPAY_MOBILE_URL',
        pg_nicepay_legacy_mobile_url()
    );
}

function pg_nicepay_url_profile(string $url): string {
    $url = trim($url);
    if ($url === pg_nicepay_manual_script_url()) {
        return 'current_manual';
    }
    if ($url === pg_nicepay_legacy_script_url() || $url === pg_nicepay_legacy_mobile_url()) {
        return 'legacy_default';
    }
    if ($url !== '' && pg_nicepay_safe_url($url)) {
        return 'custom_nicepay';
    }

    return 'invalid_or_empty';
}

function pg_nicepay_safe_client_url(string $url): bool {
    $url = trim($url);
    if ($url === '' || strlen($url) > 2048 || preg_match('/[\x00-\x1F\x7F]/', $url)) {
        return false;
    }

    $parts = parse_url($url);
    if (!$parts || empty($parts['scheme'])) {
        return false;
    }

    $scheme = strtolower((string) $parts['scheme']);
    if (!preg_match('/^[a-z][a-z0-9+.-]*$/', $scheme)) {
        return false;
    }

    return !in_array($scheme, ['javascript', 'data', 'vbscript', 'file'], true);
}

function pg_nicepay_client_url(string $envName): string {
    $url = trim((string) (getenv($envName) ?: ''));
    return pg_nicepay_safe_client_url($url) ? $url : '';
}

function pg_nicepay_wap_url(): string {
    return pg_nicepay_client_url('SHOP_PG_NICEPAY_WAP_URL');
}

function pg_nicepay_isp_cancel_url(): string {
    return pg_nicepay_client_url('SHOP_PG_NICEPAY_ISP_CANCEL_URL');
}

function pg_nicepay_sign_data(string $ediDate, string $mid, int $amount, string $merchantKey): string {
    return bin2hex(hash('sha256', $ediDate . $mid . (string) $amount . $merchantKey, true));
}

function pg_nicepay_auth_signature(string $authToken, string $mid, int $amount, string $merchantKey): string {
    return bin2hex(hash('sha256', $authToken . $mid . (string) $amount . $merchantKey, true));
}

function pg_nicepay_approval_signature(string $authToken, string $mid, int $amount, string $ediDate, string $merchantKey): string {
    return bin2hex(hash('sha256', $authToken . $mid . (string) $amount . $ediDate . $merchantKey, true));
}

function pg_nicepay_response_signature(string $tid, string $mid, string $amount, string $merchantKey): string {
    return bin2hex(hash('sha256', $tid . $mid . $amount . $merchantKey, true));
}

function pg_nicepay_approval_success(string $resultCode, string $payMethod = ''): bool {
    $resultCode = trim($resultCode);
    $payMethod = strtoupper(trim($payMethod));

    $successCodes = [
        'CARD' => ['3001'],
        'BANK' => ['4000'],
        'VBANK' => ['4100'],
        'CELLPHONE' => ['A000'],
        'SSG_BANK' => ['0000'],
        'CMS_BANK' => ['0000'],
    ];

    return in_array($resultCode, $successCodes[$payMethod] ?? [], true);
}

function pg_nicepay_text_to_utf8(string $value): string {
    if ($value === '' || preg_match('//u', $value)) {
        return $value;
    }

    $converted = @iconv('euc-kr', 'utf-8//IGNORE', $value);
    return $converted !== false && $converted !== '' ? $converted : $value;
}

function pg_nicepay_notify_payload(array $input): array {
    $cashReceipt = [];
    if (!empty($input['RcptTID'])) {
        $cashReceipt = [
            'TID' => (string) $input['RcptTID'],
            'no' => (string) ($input['RcptAuthCode'] ?? ''),
            'AuthDate' => (string) ($input['AuthDate'] ?? ''),
        ];
    }

    return [
        'result_code' => (string) ($input['ResultCode'] ?? ''),
        'mid' => trim((string) ($input['MID'] ?? $input['mid'] ?? '')),
        'order_id' => trim((string) ($input['MOID'] ?? $input['Moid'] ?? '')),
        'tid' => trim((string) ($input['TID'] ?? '')),
        'amount' => (int) preg_replace('/[^0-9]/', '', (string) ($input['Amt'] ?? '0')),
        'paid_at' => pg_parse_pg_datetime((string) ($input['AuthDate'] ?? '')),
        'deposit_name' => pg_nicepay_text_to_utf8((string) ($input['VbankInputName'] ?? '')),
        'bank_account' => trim(pg_nicepay_text_to_utf8((string) ($input['VbankName'] ?? '')) . ' ' . (string) ($input['VbankNum'] ?? '')),
        'cash_receipt' => $cashReceipt,
    ];
}

function pg_nicepay_notify_response(array $cfg, array $input, ?callable $depositMarker = null): array {
    $isTestMode = pg_detect_test_mode($cfg, 'nicepay');
    if (!pg_notify_ip_allowed('nicepay')) {
        return [
            'text' => 'FAIL',
            'status' => 403,
            'reason' => 'forbidden_ip',
        ];
    }

    $payload = pg_nicepay_notify_payload($input);
    $midCandidates = pg_nicepay_mid_candidates($cfg, $isTestMode);
    if ($payload['mid'] === '' && !empty($midCandidates)) {
        return [
            'text' => 'FAIL',
            'status' => 400,
            'reason' => 'missing_mid',
            'payload' => $payload,
        ];
    }
    if ($payload['mid'] !== '' && !in_array($payload['mid'], $midCandidates, true)) {
        return [
            'text' => 'FAIL',
            'status' => 400,
            'reason' => 'mid_mismatch',
            'payload' => $payload,
        ];
    }

    if ($payload['result_code'] !== '4110') {
        /*
         * 입금(4110) 이 아닌 통보는 처리하지 않는다 — 계좌 발급(4100) 같은 것이 섞여 온다.
         * 그래도 OK 를 돌려주는 것은 나이스페이가 실패로 보고 같은 통보를 계속 다시 보내지
         * 않게 하려는 것이다. 결제 정보(주문번호 · 거래번호)는 로그로 남기지 않는다.
         */
        return [
            'text' => 'OK',
            'status' => 200,
            'reason' => 'ignored_result_code',
            'payload' => $payload,
        ];
    }

    $marker = $depositMarker ?: 'pg_mark_vbank_deposited';
    $result = $marker(
        'nicepay',
        $payload['order_id'],
        $payload['tid'],
        $payload['amount'],
        $payload['paid_at'],
        $payload['deposit_name'],
        $payload['bank_account'],
        $payload['cash_receipt']
    );

    return [
        'text' => !empty($result['ok']) ? 'OK' : 'FAIL',
        'status' => !empty($result['ok']) ? 200 : 409,
        'reason' => !empty($result['ok']) ? 'deposited' : 'deposit_failed',
        'payload' => $payload,
        'result' => $result,
    ];
}

function pg_nicepay_safe_url(string $url): bool {
    $parts = parse_url($url);
    if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        return false;
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    return $host === 'nicepay.co.kr' || substr($host, -14) === '.nicepay.co.kr';
}

function pg_nicepay_post(string $url, array $params): array {
    if (!pg_nicepay_safe_url($url)) {
        return ['ok' => false, 'error' => 'Invalid Nicepay URL.'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is required for Nicepay.'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded; charset=UTF-8'],
        CURLOPT_POSTFIELDS => http_build_query($params),
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 30,
    ]);
    $resp = curl_exec($ch);
    $errno = (int) curl_errno($ch);
    $curlError = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($resp === false || $resp === '') {
        return [
            'ok' => false,
            'http' => $http,
            'errno' => $errno,
            'timed_out' => in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
            'error' => $curlError !== '' ? $curlError : 'Nicepay returned an empty response.',
        ];
    }

    $body = json_decode((string) $resp, true);
    if (!is_array($body)) {
        $utf8 = @iconv('euc-kr', 'utf-8//IGNORE', (string) $resp);
        $body = $utf8 ? json_decode($utf8, true) : null;
    }
    if (!is_array($body)) {
        return [
            'ok' => false,
            'http' => $http,
            'errno' => $errno,
            'raw' => (string) $resp,
            'error' => 'Nicepay returned an invalid response. HTTP ' . $http,
        ];
    }

    return ['ok' => true, 'http' => $http, 'body' => $body];
}

function pg_nicepay_raw_post(string $url, array $params, int $timeout = 10): array {
    if (!pg_nicepay_safe_url($url)) {
        return ['ok' => false, 'error' => 'Invalid Nicepay URL.'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is required for Nicepay.'];
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

    return [
        'ok' => $resp !== false && $http >= 200 && $http < 300,
        'http' => $http,
        'errno' => $errno,
        'timed_out' => in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
        'raw' => (string) $resp,
        'error' => $curlError,
    ];
}

function pg_nicepay_query_transaction(array $cfg, string $tid): array {
    $isTestMode = pg_detect_test_mode($cfg, 'nicepay');
    $mid = pg_nicepay_mid($cfg, $isTestMode);
    $merchantKey = pg_nicepay_key($cfg, $isTestMode);
    if ($mid === '' || $merchantKey === '' || $tid === '') {
        return ['ok' => false, 'error' => 'Nicepay status query requires MID, merchantKey and TID.'];
    }

    $ediDate = date('YmdHis');
    return pg_nicepay_post('https://webapi.nicepay.co.kr/webapi/inquery/trans_status.jsp', [
        'TID' => $tid,
        'MID' => $mid,
        'EdiDate' => $ediDate,
        'SignData' => bin2hex(hash('sha256', $tid . $mid . $ediDate . $merchantKey, true)),
        'CharSet' => 'utf-8',
        'EdiType' => 'JSON',
    ]);
}

function pg_nicepay_net_cancel(string $url, string $tid, string $authToken, string $mid, int $amount, string $merchantKey): array {
    if ($url === '') {
        return ['ok' => false, 'error' => 'Nicepay NetCancelURL is empty.'];
    }

    $ediDate = date('YmdHis');
    return pg_nicepay_raw_post($url, [
        'TID' => $tid,
        'NetCancel' => '1',
        'AuthToken' => $authToken,
        'MID' => $mid,
        'Amt' => $amount,
        'EdiDate' => $ediDate,
        'SignData' => pg_nicepay_approval_signature($authToken, $mid, $amount, $ediDate, $merchantKey),
        'CharSet' => 'utf-8',
    ]);
}
