<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function pg_toss_test_client_key(): string {
    return 'test_ck_DnyRpQWGrN9DRWAjpYzg7KwvxJX1';
}

function pg_toss_test_secret_key(): string {
    // 공개 테스트 키를 기본값으로 유지하되 운영 환경에서는 ENV 로 주입/교체 가능.
    return getenv('SHOP_PG_TOSS_TEST_SECRET_KEY') ?: 'test_sk_DnyRpQWGrN9DRWAjpYzg7KwvxJX1';
}

/**
 * Toss 승인 응답 `method` → 영카트 od_settle_case. 앱 위젯은 주문서에서 고른 수단과 다른 수단으로도 결제할 수 있으므로
 * (variantKey 로 막으려면 Toss 콘솔 설정이 필요) 실제 결제된 수단을 주문에 남긴다 — 가상계좌를 '입금'으로 처리하거나
 * 입금 통보(가상계좌 전용)가 거절되는 일을 막는다. 모르는 값(상품권 등)은 '' → 호출부가 기존 값을 유지한다.
 */
function pg_toss_settle_case(string $method): string {
    $map = [
        '카드' => '신용카드',
        '가상계좌' => '가상계좌',
        '계좌이체' => '계좌이체',
        '휴대폰' => '휴대폰',
        '간편결제' => '간편결제',
    ];
    return $map[$method] ?? '';
}

function pg_toss_config_value(array $cfg, string $type): string {
    if ($type === 'client_key') {
        return trim((string) ($cfg['cf_toss_client_key'] ?? $cfg['de_toss_client_key'] ?? ''));
    }

    if ($type === 'secret_key') {
        return trim((string) ($cfg['cf_toss_secret_key'] ?? $cfg['de_toss_secret_key'] ?? ''));
    }

    return '';
}

/**
 * 결제 모드(관리자 '결제 테스트')에 맞는 키만 쓴다.
 *  - 테스트결제: 등록된 키가 test_ 키면 그것, 아니면(실결제 키·빈 값) 공개 테스트 키 — 테스트 설정에서 실결제가 나가지 않게.
 *  - 실결제: live_ 키만. 테스트 키·빈 값이면 '' → 결제 설정 응답에서 Toss 수단이 빠지고 prepare/confirm 이 설정 오류로 막는다
 *    (실결제로 설정했는데 조용히 테스트 결제가 되는 일을 막는다).
 */
function pg_toss_mode_key(string $configured, bool $isTestMode, string $testFallback): string {
    if ($isTestMode) {
        return strpos($configured, 'test_') === 0 ? $configured : $testFallback;
    }
    return strpos($configured, 'live_') === 0 ? $configured : '';
}

function pg_toss_client_key(array $cfg, bool $isTestMode): string {
    return pg_toss_mode_key(pg_toss_config_value($cfg, 'client_key'), $isTestMode, pg_toss_test_client_key());
}

function pg_toss_secret_key(array $cfg, bool $isTestMode): string {
    return pg_toss_mode_key(pg_toss_config_value($cfg, 'secret_key'), $isTestMode, pg_toss_test_secret_key());
}

function pg_toss_bank_name(string $code): string {
    $banks = [
        '02' => '한국산업은행',
        '03' => 'IBK기업은행',
        '06' => 'KB국민은행',
        '07' => 'Sh수협은행',
        '11' => 'NH농협은행',
        '12' => '단위농협(지역농축협)',
        '20' => '우리은행',
        '23' => 'SC제일은행',
        '27' => '씨티은행',
        '31' => 'iM뱅크(대구)',
        '32' => '부산은행',
        '34' => '광주은행',
        '35' => '제주은행',
        '37' => '전북은행',
        '39' => '경남은행',
        '45' => '새마을금고',
        '48' => '신협',
        '50' => '저축은행중앙회',
        '54' => '홍콩상하이은행',
        '64' => '산림조합',
        '71' => '우체국예금보험',
        '81' => '하나은행',
        '88' => '신한은행',
        '89' => '케이뱅크',
        '90' => '카카오뱅크',
        '92' => '토스뱅크',
    ];

    return $banks[$code] ?? $code;
}

function pg_toss_datetime(?string $value): string {
    $value = trim((string) $value);
    if ($value === '') {
        return '';
    }

    $time = strtotime($value);
    return $time ? date('Y-m-d H:i:s', $time) : $value;
}

function pg_toss_api_request(array $cfg, string $method, string $path, ?array $payload = null, string $idempotencyKey = ''): array {
    $isTestMode = pg_detect_test_mode($cfg, 'toss');
    $secretKey = pg_toss_secret_key($cfg, $isTestMode);
    if ($secretKey === '') {
        return ['ok' => false, 'error' => 'Toss API Secret Key is not configured.'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is required for Toss.'];
    }

    $url = 'https://api.tosspayments.com' . $path;
    $ch = curl_init($url);
    $headers = [
        'Authorization: Basic ' . base64_encode($secretKey . ':'),
        'Content-Type: application/json',
    ];
    if ($idempotencyKey !== '') {
        $headers[] = 'Idempotency-Key: ' . substr($idempotencyKey, 0, 300);
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    $resp = curl_exec($ch);
    $errno = (int) curl_errno($ch);
    $curlError = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $body = json_decode((string) $resp, true);
    if (!is_array($body)) {
        return [
            'ok' => false,
            'http' => $http,
            'errno' => $errno,
            'timed_out' => in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
            'error' => $curlError !== '' ? $curlError : 'Toss returned an invalid response.',
        ];
    }

    if ($http < 200 || $http >= 300) {
        return [
            'ok' => false,
            'http' => $http,
            'errno' => $errno,
            'body' => $body,
            'error' => (string) ($body['message'] ?? ('Toss API failed. HTTP ' . $http)),
        ];
    }

    return ['ok' => true, 'http' => $http, 'body' => $body];
}
