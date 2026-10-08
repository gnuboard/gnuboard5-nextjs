<?php
/**
 * KG이니시스 가상계좌 입금통보를 서버가 이니시스에 다시 물어 확인한다(INIAPI 거래조회, 코어 shop/inicis/pro/inicis_pro.lib.php
 * inicis_pro_inquiry 와 같은 요청). 통보 본문은 발신 IP 말고는 믿을 근거가 없어, 조회가 되면 그 결과로 한 번 더 거른다.
 *
 * 판정(코어 관리자 화면 adm/shop_admin/inicislog.lib.php 와 같은 상태 구분):
 *   confirmed  — 조회 성공(00), 상태가 결제 · 입금 완료, 금액 일치
 *   rejected   — 조회 성공(00)인데 입금 전 · 취소 상태이거나 금액이 다르다 → 입금 처리하지 않는다(이니시스가 다시 보낸다)
 *   unverified — 조회를 못 했다(INIAPI 키 없음 · 통신 실패 · MID 불일치 등) → 기존 검사(IP · 거래번호 · 금액 · 계좌)로만 받는다.
 *                INIAPI 키는 취소에만 쓰여 비워 둔 상점이 많아, 조회를 필수로 하면 입금 처리가 멈춘다.
 * 응답의 거래 정보는 어디에도 기록하지 않는다(결제 로그를 남기지 않는다).
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

/** INIAPI 키 — 테스트 상점은 이니시스가 공개한 키, 실결제는 관리자 설정(de_inicis_iniapi_key). */
function pg_inicis_iniapi_key(array $cfg, string $mid, bool $isTestMode): string {
    if ($isTestMode && in_array($mid, ['INIpayTest', 'iniescrow0'], true)) {
        return $mid === 'iniescrow0' ? 'yERbIlJ3NhTeObsA' : 'ItEQKi3rY7uvDS8l';
    }
    return trim((string) ($cfg['de_inicis_iniapi_key'] ?? ''));
}

/** 조회 응답의 status → paid · not_paid · unknown(부분취소 등 그 밖의 값). */
function pg_inicis_inquiry_status_kind(string $status): string {
    $status = strtoupper((string) preg_replace('/[^A-Za-z0-9_]/', '', $status));
    if (in_array($status, ['0', 'Y', 'APPROVAL', 'DEPOSIT_COMPLETED'], true)) {
        return 'paid';
    }
    if (in_array($status, ['N', 'NON_DEPOSIT', '1', '9', 'C', 'CANCEL', 'DEPOSIT_CANCELED', 'REFUND_COMPLETED', 'WAITING_FOR_REFUND'], true)) {
        return 'not_paid';
    }
    return 'unknown';
}

/** 조회 결과(이니시스 응답 본문)와 기대 금액으로 판정한다 — 순수 함수(시험에서 따로 돌린다). */
function pg_inicis_deposit_verdict(?array $body, int $amount): array {
    if (!is_array($body) || (string) ($body['resultCode'] ?? '') !== '00') {
        return ['verdict' => 'unverified', 'reason' => 'inquiry_' . (is_array($body) ? (string) ($body['resultCode'] ?? 'empty') : 'failed')];
    }
    $kind = pg_inicis_inquiry_status_kind((string) ($body['status'] ?? ''));
    if ($kind === 'not_paid') {
        return ['verdict' => 'rejected', 'reason' => 'status_not_paid'];
    }
    $price = preg_match('/^[0-9]+$/', (string) ($body['price'] ?? '')) === 1 ? (int) $body['price'] : -1;
    if ($price >= 0 && $price !== $amount) {
        return ['verdict' => 'rejected', 'reason' => 'amount_mismatch'];
    }
    if ($kind === 'unknown') {
        // 모르는 상태 코드 — 막으면 새 코드가 생겼을 때 입금이 멈춘다. 금액이 다르지 않으면 기존 검사로 받는다.
        return ['verdict' => 'unverified', 'reason' => 'status_unknown'];
    }
    return $price === $amount
        ? ['verdict' => 'confirmed', 'reason' => 'ok']
        : ['verdict' => 'unverified', 'reason' => 'price_missing'];
}

function pg_inicis_vbank_deposit_check(array $cfg, string $orderId, string $tid, int $amount): array {
    if ($orderId === '' || $tid === '') {
        return ['verdict' => 'unverified', 'reason' => 'reference_missing'];
    }
    $isTestMode = pg_detect_test_mode($cfg, 'inicis');
    $mid = pg_inicis_mid($cfg, $isTestMode);
    $key = pg_inicis_iniapi_key($cfg, $mid, $isTestMode);
    if ($mid === '' || $key === '') {
        return ['verdict' => 'unverified', 'reason' => 'iniapi_key_missing'];
    }

    $timestamp = date('YmdHis');
    $serverIp = (string) ($_SERVER['SERVER_ADDR'] ?? '');
    $clientIp = filter_var($serverIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false ? $serverIp : '127.0.0.1';
    $host = $isTestMode ? 'stginiapi.inicis.com' : 'iniapi.inicis.com';
    $response = pg_inicis_post_json('https://' . $host . '/api/v1/extra', [
        'type' => 'Extra',
        'paymethod' => 'Inquiry',
        'timestamp' => $timestamp,
        'clientIp' => $clientIp,
        'mid' => $mid,
        'hashData' => hash('sha512', $key . 'Extra' . 'Inquiry' . $timestamp . $clientIp . $mid),
        'originalTid' => $tid,
        'oid' => $orderId,
    ], 10);

    $body = !empty($response['ok']) && is_array($response['body'] ?? null) ? $response['body'] : null;
    // 조회한 거래가 이 통보의 거래가 아니면(응답에 다른 거래번호) 판정에 쓰지 않는다.
    if ($body !== null && isset($body['tid']) && (string) $body['tid'] !== '' && (string) $body['tid'] !== $tid) {
        return ['verdict' => 'unverified', 'reason' => 'tid_differs'];
    }
    return pg_inicis_deposit_verdict($body, $amount);
}
