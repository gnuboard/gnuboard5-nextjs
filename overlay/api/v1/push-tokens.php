<?php
/**
 * Gnuboard5 REST API - Expo Push Token registration
 *
 * Routes (prefix: v1/push-tokens):
 *   POST   /v1/push-tokens         - 토큰 등록/갱신 ({push_token, platform})
 *   DELETE /v1/push-tokens/{token} - 토큰 해제 (로그아웃 시 호출 권장)
 *
 * 동일 token이 다른 mb_id로 등록되면 매핑 갱신 (계정 전환 케이스).
 */

if (!defined('_GNUBOARD_')) exit;

$tokenTable = DB::table('push_token_table');

if ($apiMethod === 'POST') {
    $me = Auth::requireAuth();
    api_require_write_quota('pushtoken', $me, 20, 120);
    $input = get_request_body();

    $errors = Validator::validate(['push_token' => 'required'], $input);
    if ($errors) Response::error('Validation failed.', 422, $errors);

    $token    = trim((string) $input['push_token']);
    $platform = isset($input['platform']) && in_array($input['platform'], ['android','ios','web'], true)
        ? $input['platform']
        : 'android';

    // ON DUPLICATE KEY UPDATE: 같은 token이 있으면 mb_id 매핑·platform·last_used_at 갱신.
    DB::execute(
        "INSERT INTO {$tokenTable} (mb_id, push_token, platform, last_used_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            mb_id = VALUES(mb_id),
            platform = VALUES(platform),
            last_used_at = NOW()",
        [$me['mb_id'], $token, $platform]
    );

    Response::success(['message' => 'registered'], 201);
}

if ($apiMethod === 'DELETE') {
    $me = Auth::requireAuth();
    $token = isset($apiSegments[0]) ? trim((string) $apiSegments[0]) : '';
    if ($token === '') Response::error('Token required in path.', 400);

    // 본인 토큰만 삭제 가능 (다른 사람 토큰 임의 삭제 방지).
    DB::execute(
        "DELETE FROM {$tokenTable} WHERE push_token = ? AND mb_id = ?",
        [$token, $me['mb_id']]
    );
    Response::success(['message' => 'unregistered']);
}

Response::error('Method not allowed.', 405);
