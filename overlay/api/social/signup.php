<?php
/**
 * Next.js social signup bridge.
 *
 * The gnuboard social plugin calls window.opener.social_link_fn(provider) when
 * an OAuth profile is valid but not yet linked to a member. The Next.js register
 * page then navigates here, where the PHP social session is converted into a
 * short-lived signup ticket and redirected back to /register.
 */

require_once __DIR__ . '/../../common.php';
require_once __DIR__ . '/_bridge_common.php';

if (!function_exists('social_session_exists_check') && defined('G5_SOCIAL_LOGIN_PATH')) {
    include_once G5_SOCIAL_LOGIN_PATH . '/includes/functions.php';
}

$provider = nextjs25_social_sanitize_provider(isset($_GET['provider']) ? $_GET['provider'] : '');
$redirect = nextjs25_social_validate_redirect(isset($_GET['redirect']) ? $_GET['redirect'] : '');

if ($provider === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Unknown provider';
    exit;
}

if ($redirect === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Invalid redirect';
    exit;
}

if (empty($config['cf_social_login_use'])) {
    header('Location: ' . nextjs25_social_append_query($redirect, array(
        'error' => 'social_disabled',
    )), true, 302);
    exit;
}

if (!function_exists('social_session_exists_check')) {
    header('Location: ' . nextjs25_social_append_query($redirect, array(
        'error' => 'social_plugin_missing',
    )), true, 302);
    exit;
}

$_REQUEST['provider'] = $provider;
$_GET['provider'] = $provider;

$profile = social_session_exists_check();
if (!$profile || empty($profile->identifier)) {
    header('Location: ' . nextjs25_social_append_query($redirect, array(
        'error' => 'missing_social_profile',
    )), true, 302);
    exit;
}

global $g5;
$socialProfileTable = isset($g5['social_profile_table'])
    ? $g5['social_profile_table']
    : G5_TABLE_PREFIX . 'member_social_profiles';

$identifier = (string) $profile->identifier;
$linked = sql_fetch(
    "SELECT mb_id FROM {$socialProfileTable}
     WHERE provider = '" . sql_real_escape_string($provider) . "'
       AND identifier = '" . sql_real_escape_string($identifier) . "'
       AND mb_id <> ''
     LIMIT 1"
);

if (!empty($linked['mb_id'])) {
    header('Location: ' . nextjs25_social_append_query($redirect, array(
        'error' => 'already_linked',
    )), true, 302);
    exit;
}

nextjs25_social_ensure_signup_ticket_table();

$payload = nextjs25_social_profile_payload($provider, $profile);
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    header('Location: ' . nextjs25_social_append_query($redirect, array(
        'error' => 'profile_encode_failed',
    )), true, 302);
    exit;
}

$ticket = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', time() + 600);
$ticketTable = nextjs25_social_signup_ticket_table();
// 로그인 ticket 과 같은 PKCE 바인딩. 가입 ticket 을 가로채면 피해자의 소셜 계정에
// 공격자 계정을 미리 연결해 둘 수 있으므로 여기서도 verifier 를 요구하게 묶는다.
$codeChallenge = nextjs25_social_session_code_challenge();
set_session('mobile_oauth_code_challenge', '');

sql_query(
    "INSERT INTO {$ticketTable}
        (ticket, provider, code_challenge, identifier, profile_json, expires_at)
     VALUES (
        '" . sql_real_escape_string($ticket) . "',
        '" . sql_real_escape_string($provider) . "',
        '" . sql_real_escape_string($codeChallenge) . "',
        '" . sql_real_escape_string($identifier) . "',
        '" . sql_real_escape_string($json) . "',
        '" . sql_real_escape_string($expiresAt) . "'
     )",
    false
);

header('Location: ' . nextjs25_social_append_query($redirect, array(
    'social_signup_ticket' => $ticket,
)), true, 302);
exit;
