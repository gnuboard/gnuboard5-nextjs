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

        if (!empty($member['mb_id']) && function_exists('get_member_icon_url')) {
            $payload['mb_icon_path'] = get_member_icon_url((string) $member['mb_id']);
        }

        $payload['is_super_admin'] = Auth::adminRole($member) === 'super';
        return $payload;
    }
}

if (!function_exists('api_auth_send_password_reset_mail')) {
    function api_auth_send_password_reset_mail(array $member, string $resetToken): bool
    {
        if (!function_exists('mailer')) {
            error_log('[api/auth] mailer() unavailable for password reset mb_id=' . (string) ($member['mb_id'] ?? ''));
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

        $resetUrl = api_auth_public_app_url('/forgot-password?reset_token=' . rawurlencode($resetToken));
        $subject = '[' . $siteName . '] Password reset instructions';
        $body = "A password reset was requested for your account.\n\n"
            . "Open the link below within 10 minutes to set a new password.\n\n"
            . $resetUrl . "\n\n"
            . "If you did not request this, you can ignore this email.";

        @mailer($siteName, $fromMail, $toMail, $subject, $body, 0);
        return true;
    }
}

require_once __DIR__ . '/auth_account_routes.php';
require_once __DIR__ . '/auth_session_routes.php';
require_once __DIR__ . '/auth_web_ticket_route.php'; // 앱 → 레거시 웹 1회용 입장권 (T-P2-09)
require_once __DIR__ . '/auth_social_apple_route.php'; // Sign in with Apple — 네이티브 앱 전용 (SC-11)
require_once __DIR__ . '/auth_social_routes.php'; // 마지막 — 끝에 404 폴백이 있다
