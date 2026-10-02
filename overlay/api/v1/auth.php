<?php
/**
 * Gnuboard5 REST API - Authentication Endpoints
 *
 * Routes handled (prefix: v1/auth):
 *   POST   /v1/auth/login          - Login with mb_id + mb_password
 *   POST   /v1/auth/register       - Register new member
 *   GET    /v1/auth/me             - Get current authenticated user
 *   POST   /v1/auth/refresh        - Refresh JWT token
 *   POST   /v1/auth/logout         - Logout (client-side token removal)
 *   GET    /v1/auth/sessions       - List active login sessions
 *   POST   /v1/auth/sessions/revoke - Revoke one login session
 *   POST   /v1/auth/password-reset - Password reset (step=request|reset)
 *   GET|POST /v1/auth/verify-email - Confirm email certify token (mb_id+token)
 *   POST   /v1/auth/resend-verification - Resend the email certify link (mb_id+mb_password)
 *   GET    /v1/auth/register-result - Get last registration result from ss_mb_reg
 *   GET    /v1/auth/check-id?mb_id=...       - Check whether mb_id is available
 *   GET    /v1/auth/check-email?mb_email=... - Check whether mb_email is available
 */

if (!defined('_GNUBOARD_')) exit;

require_once __DIR__ . '/../social/_bridge_common.php';

$action = isset($apiSegments[0]) ? $apiSegments[0] : '';

require_once __DIR__ . '/auth_helpers.php';
require_once __DIR__ . '/auth_cert_helpers.php'; // 가입 본인인증 — 앱 cert_token / 웹 cert_no (SC-21)

if (!function_exists('api_auth_password_reset_generic_response')) {
    function api_auth_password_reset_generic_response(): void
    {
        Response::success([
            'message' => 'If the account information matches, password reset instructions have been sent.',
        ]);
    }
}

if (!function_exists('api_auth_public_app_url')) {
    function api_auth_public_app_url(string $path): string
    {
        $base = '';
        if (defined('G5_WEBAPP_APP_URL')) {
            $base = (string) G5_WEBAPP_APP_URL;
        } elseif (defined('G5_WEBAPP_G5_URL')) {
            $base = (string) G5_WEBAPP_G5_URL;
        } elseif (defined('G5_NEXTJS25_APP_URL')) {
            $base = (string) G5_NEXTJS25_APP_URL;
        } elseif (defined('G5_NEXTJS25_G5_URL')) {
            $base = (string) G5_NEXTJS25_G5_URL;
        } elseif (defined('G5_URL')) {
            $base = (string) G5_URL;
        }
        return rtrim($base, '/') . '/' . ltrim($path, '/');
    }
}

if (!function_exists('api_auth_member_payload')) {
    function api_auth_member_payload(array $member): array
    {
        $payload = array();
        foreach (array('mb_no', 'mb_id', 'mb_name', 'mb_nick', 'mb_email', 'mb_level', 'mb_point') as $key) {
            if (array_key_exists($key, $member)) {
                $payload[$key] = $member[$key];
            }
        }

        if (!empty($member['mb_id']) && function_exists('api_member_media_urls')) {
            // 회원아이콘 · 회원이미지 경로(api/lib/helpers.php 공용).
            $payload = array_merge($payload, api_member_media_urls((string) $member['mb_id'], true));
        }

        $payload['is_super_admin'] = Auth::adminRole($member) === 'super';
        return $payload;
    }
}

if (!function_exists('api_auth_send_password_reset_mail')) {
    function api_auth_send_password_reset_mail(array $member, string $resetToken): bool
    {
        if (!api_require_mailer()) {
            error_log('[api/auth] mailer() unavailable for password reset mb_id=' . (string) ($member['mb_id'] ?? ''));
            return false;
        }
        // 재설정 링크는 설정으로 정한 사이트 주소로만 만든다 — Host 헤더로 만든 주소면 토큰이 남의 서버로 샐 수 있다.
        $base = api_mail_link_base();
        if ($base === '') {
            error_log('[api/auth] password reset mail skipped — set G5_DOMAIN (or the web app URL) mb_id=' . (string) ($member['mb_id'] ?? ''));
            return false;
        }

        $config = api_get_config();
        $siteName = (string) ($config['cf_title'] ?? '');
        $fromMail = (string) ($config['cf_admin_email'] ?? '');
        $toMail = (string) ($member['mb_email'] ?? '');
        if ($toMail === '' || !filter_var($toMail, FILTER_VALIDATE_EMAIL)) {
            error_log('[api/auth] invalid password reset target email mb_id=' . (string) ($member['mb_id'] ?? ''));
            return false;
        }

        $resetUrl = $base . '/forgot-password?reset_token=' . rawurlencode($resetToken);
        $subject = '[' . $siteName . '] 비밀번호 재설정 안내';
        $body = "회원님의 계정에 비밀번호 재설정 요청이 있었습니다.\n\n"
            . "아래 링크를 10분 안에 열어 새 비밀번호를 정해주세요.\n\n"
            . $resetUrl . "\n\n"
            . "직접 요청하지 않으셨다면 이 메일은 무시하셔도 됩니다.";

        api_call_core('mailer', array($siteName, $fromMail, $toMail, $subject, $body, 0)); // 안의 mailer · mail_options · mail_send_result 훅도 보호해서
        return true;
    }
}

require_once __DIR__ . '/auth_account_routes.php';
require_once __DIR__ . '/auth_session_routes.php';
require_once __DIR__ . '/auth_web_ticket_route.php'; // 앱 → 레거시 웹 1회용 입장권 (T-P2-09)
require_once __DIR__ . '/auth_social_apple_route.php'; // Sign in with Apple — 네이티브 앱 전용 (SC-11)
require_once __DIR__ . '/auth_social_routes.php'; // 마지막 — 끝에 404 폴백이 있다
