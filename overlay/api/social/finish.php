<?php
/**
 * 소셜 로그인 후속 처리 (모바일 + Next.js 웹 공용).
 *
 * gnuboard social 플러그인이 OAuth 완료 후 이 URL 로 돌아옴.
 *   1) PHP 세션의 로그인 사용자(mb_id) 확인
 *   2) g5_social_mobile_ticket 에 5분짜리 one-time ticket 저장
 *   3) start.php 가 저장해둔 redirect 에 ticket 을 붙여서 302
 *
 * 모바일 앱은 deep-link 를 받아 /api/v1/auth/social/exchange 로 ticket → JWT.
 * Next.js 웹도 동일하게 callback 페이지에서 ticket → JWT 교환.
 */

require_once __DIR__ . '/../../common.php';
require_once __DIR__ . '/_bridge_common.php';

global $member, $is_member;

$redirect = (string) get_session('mobile_oauth_redirect');
$provider = (string) get_session('mobile_oauth_provider');
$isMobile = (int) get_session('is_mobile_oauth');
$isWeb    = (int) get_session('is_web_oauth');
$codeChallenge = nextjs25_social_session_code_challenge();

// 사용 후 세션 마커 정리.
set_session('is_mobile_oauth', 0);
set_session('is_web_oauth', 0);
set_session('mobile_oauth_redirect', '');
set_session('mobile_oauth_provider', '');
set_session('mobile_oauth_code_challenge', '');

if (!$isMobile && !$isWeb) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not a social OAuth session';
    exit;
}

$isValidRedirect = false;
if ($redirect) {
    if (nextjs25_social_validate_mobile_redirect($redirect) !== '') {
        $isValidRedirect = true;
    } elseif ($isWeb && preg_match('#^https?://#i', $redirect) && nextjs25_social_validate_redirect($redirect) !== '') {
        $isValidRedirect = true;
    }
}

if (!$isValidRedirect) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Invalid redirect';
    exit;
}

// 로그인이 안 된 채로 finish 에 도달했다면 (사용자 취소 등) 실패 redirect.
if (!$is_member || empty($member['mb_id'])) {
    $sep = strpos($redirect, '?') === false ? '?' : '&';
    $url = $redirect . $sep . 'error=' . urlencode('not_authenticated');
    header('Location: ' . $url, true, 302);
    exit;
}

require_once __DIR__ . '/../lib/DB.php';

// One-time ticket 발급 (5분 유효). 앱이 start.php 에 보낸 PKCE challenge 가 있으면 함께 묶는다.
$ticket    = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', time() + 300);
$ticketTable = G5_TABLE_PREFIX . 'social_mobile_ticket';
nextjs25_social_ensure_mobile_ticket_table();

DB::execute(
    "INSERT INTO {$ticketTable} (ticket, mb_id, provider, code_challenge, expires_at)
     VALUES (?, ?, ?, ?, ?)",
    [$ticket, $member['mb_id'], $provider, $codeChallenge, $expiresAt]
);

$sep = strpos($redirect, '?') === false ? '?' : '&';
$url = $redirect . $sep . 'ticket=' . urlencode($ticket);

// 모바일: 순수 302 — WebBrowser.openAuthSessionAsync 가 deep-link 감지.
// 웹: 동일 302 — Next.js callback 페이지가 ticket 을 query 로 받음.
header('Location: ' . $url, true, 302);
exit;
