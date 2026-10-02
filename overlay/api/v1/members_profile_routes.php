<?php
/**
 * 회원 공개 키 · 자기소개 — members.php 가 같은 자리에서 불러 쓴다($seg0 · $apiSegments · $apiMethod 를 그대로 쓴다).
 *   GET /v1/members/{mb_id}/key      주소에 쓸 회원 공개 키 (api/lib/member_key_helpers.php)
 *   GET /v1/members/{key}/profile    자기소개 (그누보드 bbs/profile.php 와 같은 공개 조건)
 */

if (!defined('_GNUBOARD_')) exit;

// -------------------------------------------------------------------------
// GET /v1/members/{mb_id}/key - 주소에 쓸 회원 공개 키
// 사이드뷰의 "자기소개 · 최근 글" 링크와 예전 주소(/members/아이디)를 키 주소로 바꿀 때 쓴다.
// 아이디 → 키 방향만 알려 준다(아이디를 이미 아는 사람에게만 쓸모가 있다). 키가 없으면(표 미설치) mb_key 는 ''.
// -------------------------------------------------------------------------
if ($seg0 && $seg0 !== 'me' && isset($apiSegments[1]) && $apiSegments[1] === 'key' && $apiMethod === 'GET') {
    $keyMbId = api_member_id_from_ref($seg0);
    $keyTarget = $keyMbId === '' ? null : DB::fetch(
        "SELECT mb_id FROM " . DB::table('member_table') . "
          WHERE mb_id = ? AND mb_leave_date = '' AND mb_intercept_date = ''
          LIMIT 1",
        [$keyMbId]
    );
    if (!$keyTarget || empty($keyTarget['mb_id'])) {
        Response::error('Member not found.', 404);
    }

    Response::success(['mb_key' => api_member_public_key((string) $keyTarget['mb_id'])]);
}

// -------------------------------------------------------------------------
// GET /v1/members/{key}/profile - Gnuboard profile popup parity
// 주소에는 공개 키가 온다. 예전 주소의 아이디도 받는다(프런트가 키 주소로 바꿔 준다).
// -------------------------------------------------------------------------
if ($seg0 && isset($apiSegments[1]) && $apiSegments[1] === 'profile' && $apiMethod === 'GET') {

    $profileMbId = api_member_id_from_ref($seg0);
    if ($profileMbId === '') {
        Response::error('Member not found.', 404);
    }

    $viewer = Auth::requireAuth();
    $isSuperAdmin = Auth::adminRole($viewer) === 'super';
    $isSelf = isset($viewer['mb_id']) && $viewer['mb_id'] === $profileMbId;

    if ((int) ($viewer['mb_open'] ?? 0) !== 1 && !$isSuperAdmin && !$isSelf) {
        Response::error('You must make your own profile public before viewing other member profiles.', 403);
    }

    $memberTable = DB::table('member_table');
    $target = DB::fetch(
        "SELECT mb_id, mb_nick, mb_level, mb_point, mb_open, mb_datetime,
                mb_homepage, mb_profile, mb_leave_date, mb_intercept_date
           FROM {$memberTable}
          WHERE mb_id = ?
            AND mb_leave_date = ''
            AND mb_intercept_date = ''
          LIMIT 1",
        [$profileMbId]
    );

    if (!$target || empty($target['mb_id'])) {
        Response::error('Member not found.', 404);
    }

    $isSelf = isset($viewer['mb_id']) && $viewer['mb_id'] === $target['mb_id'];
    if ((int) ($target['mb_open'] ?? 0) !== 1 && !$isSuperAdmin && !$isSelf) {
        Response::error('This member profile is not public.', 403);
    }

    // 아이디는 본인 · 최고관리자에게만 보인다 — 키 주소로 들어온 다른 회원에게 키 → 아이디를 알려 주지 않는다.
    $profilePayload = api_member_profile_payload($target);
    if (!$isSelf && !$isSuperAdmin) {
        $profilePayload['mb_id'] = '';
    }
    $profilePayload['mb_key'] = api_member_public_key((string) $target['mb_id']);

    Response::success([
        'member' => $profilePayload,
    ]);
}
