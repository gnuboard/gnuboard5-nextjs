<?php
/**
 * Social OAuth entry for Next.js and mobile clients.
 *
 * GET /api/social/start.php?provider=naver&redirect=<callback-url>
 */

require_once __DIR__ . '/../../common.php';
require_once __DIR__ . '/_bridge_common.php';

if (!function_exists('nextjs25_social_hook_diagnostics')) {
    function nextjs25_social_hook_diagnostics()
    {
        $extendFunctions = array(
            'nextjs25_social_login_before_return_from_provider_page',
            'nextjs25_social_login_linked_provider_before_member_check',
            'nextjs25_social_login_existing_member_before_link_prompt',
            'nextjs25_social_login_unlinked_before_redirect',
        );
        $loadedFunctions = array();
        $functionFiles = array();

        foreach ($extendFunctions as $function) {
            $loaded = function_exists($function);
            $loadedFunctions[$function] = $loaded;
            if ($loaded) {
                $ref = new ReflectionFunction($function);
                $functionFiles[$function] = $ref->getFileName();
            }
        }

        $socialFunctionsPath = __DIR__ . '/../../plugin/social/includes/functions.php';
        $socialFunctionsSource = is_file($socialFunctionsPath)
            ? (string) file_get_contents($socialFunctionsPath)
            : '';
        $hookMarkers = array(
            'social_login_before_return_from_provider_page',
            'social_login_linked_provider_before_member_check',
            'social_login_existing_member_before_link_prompt',
            'social_login_unlinked_before_redirect',
        );
        $sourceMarkers = array();
        foreach ($hookMarkers as $marker) {
            $sourceMarkers[$marker] = $socialFunctionsSource !== '' && strpos($socialFunctionsSource, $marker) !== false;
        }

        return array(
            'extend_functions_loaded' => $loadedFunctions,
            'extend_function_files' => $functionFiles,
            'social_functions_path' => $socialFunctionsPath,
            'social_functions_markers' => $sourceMarkers,
        );
    }
}

if (!function_exists('nextjs25_social_start_error')) {
    function nextjs25_social_debug_enabled()
    {
        if (!isset($_GET['debug']) || (string) $_GET['debug'] !== '1') {
            return false;
        }
        if (defined('G5_SOCIAL_DEBUG') && (string) G5_SOCIAL_DEBUG === '1') {
            return true;
        }
        $env = getenv('G5_SOCIAL_DEBUG');
        return is_string($env) && $env === '1';
    }

    function nextjs25_social_start_error($message, $redirect = '')
    {
        http_response_code(400);

        $debug = nextjs25_social_debug_enabled();
        if ($debug) {
            $redirectHost = '';
            if ($redirect !== '' && preg_match('#^https?://#i', $redirect)) {
                $redirectHost = strtolower((string) parse_url($redirect, PHP_URL_HOST));
            }

            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(array(
                'error' => $message,
                'redirect' => $redirect,
                'redirect_host' => $redirectHost,
                'allowed_hosts' => nextjs25_social_allowed_web_hosts(),
                'allowed_mobile_schemes' => nextjs25_social_allowed_mobile_schemes(),
            ), JSON_UNESCAPED_SLASHES);
            exit;
        }

        header('Content-Type: text/plain; charset=utf-8');
        echo $message;
        exit;
    }
}

$provider = nextjs25_social_sanitize_provider(isset($_GET['provider']) ? $_GET['provider'] : '');
$redirect = isset($_GET['redirect']) ? trim((string) $_GET['redirect']) : '';

if (!$provider) {
    nextjs25_social_start_error('Unknown provider', $redirect);
}

$isWeb = false;
$isCustomScheme = false;

if ($redirect === '') {
    nextjs25_social_start_error('Missing redirect', $redirect);
}

if (preg_match('#^https?://#i', $redirect)) {
    if (nextjs25_social_validate_redirect($redirect) === '') {
        nextjs25_social_start_error('Disallowed redirect host', $redirect);
    }
    $isWeb = true;
} elseif (preg_match('#^[a-zA-Z][a-zA-Z0-9.+-]*://#', $redirect)) {
    if (nextjs25_social_validate_mobile_redirect($redirect) === '') {
        nextjs25_social_start_error('Disallowed mobile redirect scheme', $redirect);
    }
    $isCustomScheme = true;
} else {
    nextjs25_social_start_error('Invalid redirect', $redirect);
}

// PKCE (S256). 앱이 보내면 이번 시도에서 발급되는 ticket 에 묶인다 — 콜백을 가로채도
// verifier 없이는 못 쓴다. 보냈는데 형식이 틀리면 조용히 무시하지 않고 거부한다:
// 그냥 넘기면 앱은 묶였다고 믿는데 실제로는 안 묶인 ticket 이 나가기 때문이다.
$codeChallenge = '';
$rawChallenge = isset($_GET['code_challenge']) ? trim((string) $_GET['code_challenge']) : '';
if ($rawChallenge !== '') {
    $method = isset($_GET['code_challenge_method']) ? strtoupper(trim((string) $_GET['code_challenge_method'])) : 'S256';
    $codeChallenge = nextjs25_social_normalize_code_challenge($rawChallenge);
    if ($method !== 'S256' || $codeChallenge === '') {
        nextjs25_social_start_error('Invalid code_challenge', $redirect);
    }
}

set_session('is_mobile_oauth', $isCustomScheme ? 1 : 0);
set_session('is_web_oauth', $isWeb ? 1 : 0);
set_session('mobile_oauth_redirect', $redirect);
set_session('mobile_oauth_provider', strtolower($provider));
set_session('mobile_oauth_code_challenge', $codeChallenge);

$bridgeState = nextjs25_social_issue_bridge_state($provider, $redirect);
$finishUrl = G5_URL . '/api/social/finish.php';
$socialUrl = G5_URL . '/api/social/popup.php?provider=' . urlencode(strtolower($provider))
    . '&url=' . urlencode($finishUrl)
    . '&state=' . urlencode($bridgeState);

$debug = nextjs25_social_debug_enabled();
if ($debug) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'success' => true,
        'provider' => strtolower($provider),
        'redirect' => $redirect,
        'redirect_host' => preg_match('#^https?://#i', $redirect)
            ? strtolower((string) parse_url($redirect, PHP_URL_HOST))
            : '',
        'allowed_hosts' => nextjs25_social_allowed_web_hosts(),
        'allowed_mobile_schemes' => nextjs25_social_allowed_mobile_schemes(),
        'finish_url' => $finishUrl,
        'bridge_state' => $bridgeState,
        'flow' => 'api-popup-loading-then-idp',
    ), JSON_UNESCAPED_SLASHES);
    exit;
}

header('Location: ' . $socialUrl, true, 302);
exit;
