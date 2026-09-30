<?php
/**
 * Next.js social OAuth popup bridge.
 *
 * This endpoint intentionally avoids the legacy plugin/social/popup.php
 * completion scripts because they rely on same-origin window.opener access.
 */

require_once __DIR__ . '/../../common.php';
require_once __DIR__ . '/_bridge_common.php';

if (defined('G5_SOCIAL_LOGIN_PATH') && !function_exists('social_login_get_provider_adapter')) {
    include_once G5_SOCIAL_LOGIN_PATH . '/includes/functions.php';
}

if (!function_exists('nextjs25_social_popup_fail')) {
    function nextjs25_social_popup_fail($error, $usePopup = 1)
    {
        // 웹은 물론 모바일 앱도 error 파라미터로 되돌려 보내야 앱이 알림을 띄우고 닫는다.
        // 세션을 지우기 전에 redirect 와 전송 모드(모바일이면 302)를 확정해 둔다.
        $redirect = nextjs25_social_oauth_redirect();
        $usePopup = nextjs25_social_oauth_use_popup($usePopup);
        if ($redirect !== '') {
            nextjs25_social_clear_web_oauth_session();
            nextjs25_social_echo_popup_redirect(nextjs25_social_append_query($redirect, array(
                'error' => $error,
            )), $usePopup);
        }

        http_response_code(400);
        header('Content-Type: text/plain; charset=utf-8');
        echo $error;
        exit;
    }
}

if (empty($config['cf_social_login_use'])) {
    nextjs25_social_popup_fail('social_disabled');
}

if (!defined('G5_SOCIAL_LOGIN_PATH') || !function_exists('social_login_get_provider_adapter')) {
    nextjs25_social_popup_fail('social_plugin_missing');
}

$providerName = social_get_request_provider();
$provider = nextjs25_social_sanitize_provider($providerName);
$usePopup = nextjs25_social_oauth_use_popup(
    defined('G5_SOCIAL_USE_POPUP') && G5_SOCIAL_USE_POPUP ? 1 : 2
);
$bridgeState = isset($_REQUEST['state']) ? trim((string) $_REQUEST['state']) : '';

if ($provider === '' || $providerName === '') {
    nextjs25_social_popup_fail('unknown_provider', $usePopup);
}

// start.php 가 세션에 넣어 둔 되돌아갈 주소. 웹(https)과 모바일 앱(커스텀 스킴) 모두 —
// 종전에는 웹만 받아 모바일 앱이 여기서 400 으로 끊겼다.
$oauthRedirect = nextjs25_social_oauth_redirect();
if ($oauthRedirect === '') {
    nextjs25_social_popup_fail('missing_oauth_redirect', $usePopup);
}
// 이번 시도의 PKCE challenge. 발급하는 ticket 에 묶는다(없으면 종전과 같음).
$oauthCodeChallenge = nextjs25_social_session_code_challenge();

if (!nextjs25_social_validate_bridge_state($bridgeState, $provider, $oauthRedirect)) {
    nextjs25_social_popup_fail('invalid_bridge_state', $usePopup);
}

if (!isset($_REQUEST['redirect_to_idp'])) {
    social_login_session_clear(1);
    define('G5_SOCIAL_IS_LOADING', true);

    $currentUrl = G5_URL . '/api/social/popup.php?provider=' . rawurlencode($provider);
    $currentUrl .= '&redirect_to_idp=1';
    $currentUrl .= '&state=' . rawurlencode($bridgeState);
    $targetJson = json_encode($currentUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Social Login</title></head><body>';
    echo '<script>window.location.href = ' . $targetJson . ';</script>';
    echo '<noscript><a href="' . htmlspecialchars($currentUrl, ENT_QUOTES, 'UTF-8') . '">Continue</a></noscript>';
    echo '</body></html>';
    exit;
}

try {
    $adapter = social_login_get_provider_adapter($providerName);
    $userProfile = $adapter->getUserProfile();
} catch (Exception $e) {
    if (isset($adapter) && is_object($adapter)) {
        $adapter->logout();
    }
    nextjs25_social_popup_fail('provider_error_' . (int) $e->getCode(), $usePopup);
}

if (!$userProfile || empty($userProfile->identifier)) {
    nextjs25_social_popup_fail('missing_social_profile', $usePopup);
}

nextjs25_social_remember_profile($providerName, $userProfile);

$linkedProvider = social_get_data('provider', $providerName, $userProfile);
if (!empty($linkedProvider['mb_id'])) {
    $ticket = nextjs25_social_issue_mobile_ticket(
        (string) $linkedProvider['mb_id'],
        $providerName,
        $oauthCodeChallenge
    );
    if ($ticket === '') {
        nextjs25_social_popup_fail('ticket_issue_failed', $usePopup);
    }

    nextjs25_social_clear_web_oauth_session();
    nextjs25_social_echo_popup_redirect(nextjs25_social_append_query($oauthRedirect, array(
        'ticket' => $ticket,
    )), $usePopup);
}

// 연결된 회원이 없으면 가입 ticket 으로 넘긴다. signup.php 가 같은 PHP 세션에서
// challenge 를 읽어 가입 ticket 에 묶으므로 여기서 세션을 지우지 않는다.
$signupUrl = nextjs25_social_signup_bridge_url($providerName, $oauthRedirect);
if ($signupUrl === '') {
    nextjs25_social_popup_fail('signup_redirect_failed', $usePopup);
}

nextjs25_social_echo_popup_redirect($signupUrl, $usePopup);
