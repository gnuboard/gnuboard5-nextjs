<?php
/**
 * Gnuboard5 REST API - Device 서명 발급
 *
 * Routes (prefix: v1/devices):
 *   POST /v1/devices/sign  - device_id 에 대한 HMAC 서명 발급 (인증 불필요)
 *
 * 보안 한계:
 *   누구나 호출 가능하므로 sig 자체로는 device_id 소유권 증명 안 됨.
 *   민감 작업(claim-device 등)은 sig 외 추가 검증 필요 (발급 IP / 활동 기간).
 *   레이트 리미팅 강력 권장 (docs/NGINX-RATE-LIMIT.md).
 */

if (!defined('_GNUBOARD_')) exit;

/** @var string   $apiMethod */
/** @var string[] $apiSegments */

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';

if ($seg0 === 'sign' && $apiMethod === 'POST') {

    $input = get_request_body();
    $device_id = isset($input['device_id']) ? trim((string) $input['device_id']) : '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    if (class_exists('Throttle')) {
        $throttleMessage = Throttle::checkEnumProbe($ip ?: '0.0.0.0');
        if ($throttleMessage) {
            Response::error($throttleMessage, 429);
        }
    }

    if ($device_id === '' || !preg_match('/^[a-zA-Z0-9\-]{8,64}$/', $device_id)) {
        Response::error('Invalid device_id format.', 422);
    }

    $signature = DeviceSig::sign($device_id);
    $now = date('Y-m-d H:i:s');

    // 발급 이력 기록 — claim-device 시 활동 기간 검증용. 같은 device_id 재발급은 IP/UA 만 갱신.
    $deviceTable = DB::table('device_table');
    $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

    try {
        if ($ip !== '') {
            $recentIssued = DB::count(
                "SELECT COUNT(*) FROM {$deviceTable}
                 WHERE first_ip = ? AND first_signed_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
                [$ip]
            );
            if ($recentIssued >= 20) {
                Response::error('Too many device signatures requested. Please try again later.', 429);
            }
        }

        DB::execute(
            "INSERT INTO {$deviceTable} (device_id, first_signed_at, last_seen_at, first_ip, last_ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), last_ip = VALUES(last_ip), user_agent = VALUES(user_agent)",
            [$device_id, $now, $now, $ip, $ip, $ua]
        );
    } catch (\Throwable $e) {
        // 발급 자체는 stateless 라 DB 실패해도 sig 는 그대로 발급 — log 만 남김
        error_log('[devices/sign] device row upsert 실패: ' . $e->getMessage());
    }

    Response::success([
        'device_id' => $device_id,
        'signature' => $signature,
    ], 201);
}

Response::error('Not found.', 404);
