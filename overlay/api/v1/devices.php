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

        // 이미 등록된 기기 ID 는 다시 서명해 주지 않는다 — 서명은 ID 의 HMAC 이라 누구에게 다시 내주든 같은 값이고,
        // 남의 기기 ID 만 알면 그 기기의 알림을 읽고 지우거나 자기 계정으로 가져갈 수 있다.
        // 앱은 처음 한 번 받아 기기 저장소에 보관한다. 저장이 실패해 곧바로 다시 묻는 경우만 — 등록 10분 안이고
        // 처음 등록한 IP 와 같을 때만 — 다시 내준다. 시간만 보면 그 10분 동안 ID 를 아는 남도 받아 갈 수 있다.
        $existingDevice = DB::fetch(
            "SELECT first_signed_at, first_ip FROM {$deviceTable} WHERE device_id = ? LIMIT 1",
            [$device_id]
        );
        if ($existingDevice && (
            strtotime((string) $existingDevice['first_signed_at']) < time() - 600
            || !hash_equals((string) $existingDevice['first_ip'], (string) $ip)
        )) {
            Response::error('This device is already registered.', 409, ['code' => 'device_already_registered']);
        }

        DB::execute(
            "INSERT INTO {$deviceTable} (device_id, first_signed_at, last_seen_at, first_ip, last_ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), last_ip = VALUES(last_ip), user_agent = VALUES(user_agent)",
            [$device_id, $now, $now, $ip, $ip, $ua]
        );
    } catch (\Throwable $e) {
        // 등록 이력을 확인 · 기록하지 못하면 서명을 내주지 않는다 — 그냥 내주면 위의 '이미 등록된 기기' 검사를 건너뛴다.
        error_log('[devices/sign] device row check/upsert 실패: ' . $e->getMessage());
        Response::error('Device registration is temporarily unavailable. Please try again later.', 503);
    }

    Response::success([
        'device_id' => $device_id,
        'signature' => $signature,
    ], 201);
}

Response::error('Not found.', 404);
