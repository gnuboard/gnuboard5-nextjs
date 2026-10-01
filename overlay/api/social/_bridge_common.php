<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

// ticket 테이블·발급·PKCE 헬퍼. 이 파일과 항상 함께 로드된다.
require_once __DIR__ . '/_bridge_tickets.php';

if (!function_exists('nextjs25_social_allowed_providers')) {
    function nextjs25_social_allowed_providers()
    {
        return array('naver', 'kakao', 'facebook', 'google', 'twitter', 'payco');
    }
}

if (!function_exists('nextjs25_social_provider_label')) {
    function nextjs25_social_provider_label($provider)
    {
        $labels = array(
            'naver'    => '네이버',
            'kakao'    => '카카오',
            'facebook' => '페이스북',
            'google'   => '구글',
            'twitter'  => '트위터',
            'payco'    => '페이코',
            'apple'    => 'Apple',
        );
        $provider = strtolower((string) $provider);
        return isset($labels[$provider]) ? $labels[$provider] : $provider;
    }
}

if (!function_exists('nextjs25_social_sanitize_provider')) {
    function nextjs25_social_sanitize_provider($provider)
    {
        $provider = strtolower(preg_replace('/[^a-zA-Z0-9_]/', '', (string) $provider));
        return in_array($provider, nextjs25_social_allowed_providers(), true) ? $provider : '';
    }
}

if (!function_exists('nextjs25_social_read_env_file')) {
    function nextjs25_social_read_env_file($path)
    {
        $values = array();
        if (!is_readable($path)) {
            return $values;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return $values;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                continue;
            }

            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            if ($key === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) {
                continue;
            }

            $value = trim($value);
            if ($value !== '') {
                $quote = $value[0];
                if (($quote === '"' || $quote === "'") && substr($value, -1) === $quote) {
                    $value = substr($value, 1, -1);
                    if ($quote === '"') {
                        $value = stripcslashes($value);
                    }
                }
            }

            $values[$key] = $value;
        }

        return $values;
    }
}

if (!function_exists('nextjs25_social_env_file_paths')) {
    function nextjs25_social_env_file_paths()
    {
        $paths = array();

        if (defined('G5_PATH')) {
            $paths[] = rtrim(G5_PATH, '/\\') . '/api/.env';
        }

        $paths[] = dirname(__DIR__) . '/.env';
        $paths[] = __DIR__ . '/../.env';

        if (!empty($_SERVER['DOCUMENT_ROOT'])) {
            $documentRoot = rtrim((string) $_SERVER['DOCUMENT_ROOT'], '/\\');
            $paths[] = $documentRoot . '/api/.env';

            if (!empty($_SERVER['SCRIPT_NAME'])) {
                $scriptDir = str_replace('\\', '/', dirname((string) $_SERVER['SCRIPT_NAME'], 3));
                $scriptDir = trim($scriptDir, '/');
                if ($scriptDir !== '') {
                    $paths[] = $documentRoot . '/' . $scriptDir . '/api/.env';
                }
            }
        }

        $normalized = array();
        foreach ($paths as $path) {
            $path = str_replace('\\', '/', (string) $path);
            if ($path !== '' && !in_array($path, $normalized, true)) {
                $normalized[] = $path;
            }
        }

        return $normalized;
    }
}

if (!function_exists('nextjs25_social_read_env')) {
    function nextjs25_social_read_env()
    {
        $env = array();

        foreach (nextjs25_social_env_file_paths() as $path) {
            $values = nextjs25_social_read_env_file($path);
            if ($values) {
                $env = array_merge($env, $values);
            }
        }

        return $env;
    }
}

if (!function_exists('nextjs25_social_read_env_values')) {
    function nextjs25_social_read_env_values($key)
    {
        $values = array();
        $key = (string) $key;

        if ($key === '') {
            return $values;
        }

        foreach (nextjs25_social_env_file_paths() as $path) {
            $env = nextjs25_social_read_env_file($path);
            if (isset($env[$key]) && trim((string) $env[$key]) !== '') {
                $values[] = (string) $env[$key];
            }
        }

        return $values;
    }
}

if (!function_exists('nextjs25_social_add_allowed_hosts')) {
    function nextjs25_social_add_allowed_hosts(&$hosts, $value)
    {
        if (!is_string($value) || trim($value) === '') {
            return;
        }

        foreach (explode(',', $value) as $item) {
            $item = trim($item);
            if ($item === '') {
                continue;
            }

            $host = preg_match('#^https?://#i', $item)
                ? parse_url($item, PHP_URL_HOST)
                : $item;
            $host = strtolower((string) $host);
            $host = preg_replace('/:\d+$/', '', $host);
            if ($host !== '') {
                $hosts[] = $host;
            }
        }
    }
}

if (!function_exists('nextjs25_social_allowed_web_hosts')) {
    function nextjs25_social_allowed_web_hosts()
    {
        $hosts = array();

        if (defined('G5_URL')) {
            nextjs25_social_add_allowed_hosts($hosts, G5_URL);
        }
        if (defined('G5_SOCIAL_WEB_HOSTS') && G5_SOCIAL_WEB_HOSTS) {
            nextjs25_social_add_allowed_hosts($hosts, G5_SOCIAL_WEB_HOSTS);
        }
        if (defined('G5_CORS_ALLOWED_ORIGINS') && G5_CORS_ALLOWED_ORIGINS) {
            nextjs25_social_add_allowed_hosts($hosts, G5_CORS_ALLOWED_ORIGINS);
        }

        foreach (nextjs25_social_read_env_values('G5_SOCIAL_WEB_HOSTS') as $value) {
            nextjs25_social_add_allowed_hosts($hosts, $value);
        }
        foreach (nextjs25_social_read_env_values('G5_CORS_ALLOWED_ORIGINS') as $value) {
            nextjs25_social_add_allowed_hosts($hosts, $value);
        }

        $serverHosts = getenv('G5_SOCIAL_WEB_HOSTS');
        if (is_string($serverHosts)) {
            nextjs25_social_add_allowed_hosts($hosts, $serverHosts);
        }
        $serverOrigins = getenv('G5_CORS_ALLOWED_ORIGINS');
        if (is_string($serverOrigins)) {
            nextjs25_social_add_allowed_hosts($hosts, $serverOrigins);
        }

        return array_values(array_unique(array_filter($hosts)));
    }
}

if (!function_exists('nextjs25_social_add_allowed_schemes')) {
    function nextjs25_social_add_allowed_schemes(&$schemes, $value)
    {
        if (!is_string($value) || trim((string) $value) === '') {
            return;
        }

        foreach (explode(',', $value) as $item) {
            $item = trim((string) $item);
            if ($item === '') {
                continue;
            }

            $scheme = preg_match('#^[a-zA-Z][a-zA-Z0-9.+-]*://#', $item)
                ? (string) parse_url($item, PHP_URL_SCHEME)
                : rtrim($item, ':');
            $scheme = strtolower($scheme);

            if (preg_match('/^[a-z][a-z0-9.+-]*$/', $scheme)) {
                $schemes[] = $scheme;
            }
        }
    }
}

if (!function_exists('nextjs25_social_allowed_mobile_schemes')) {
    function nextjs25_social_allowed_mobile_schemes()
    {
        // sirsoft-g5 = 공식 그누보드5 앱(gnuboard5-app). 다른 앱은 G5_SOCIAL_MOBILE_SCHEMES 로 더한다.
        $schemes = array('sirsoft-g5');

        if (defined('G5_SOCIAL_MOBILE_SCHEMES') && G5_SOCIAL_MOBILE_SCHEMES) {
            nextjs25_social_add_allowed_schemes($schemes, G5_SOCIAL_MOBILE_SCHEMES);
        }

        foreach (nextjs25_social_read_env_values('G5_SOCIAL_MOBILE_SCHEMES') as $value) {
            nextjs25_social_add_allowed_schemes($schemes, $value);
        }

        $serverSchemes = getenv('G5_SOCIAL_MOBILE_SCHEMES');
        if (is_string($serverSchemes)) {
            nextjs25_social_add_allowed_schemes($schemes, $serverSchemes);
        }

        return array_values(array_unique(array_filter($schemes)));
    }
}

if (!function_exists('nextjs25_social_validate_mobile_redirect')) {
    function nextjs25_social_validate_mobile_redirect($redirect)
    {
        $redirect = trim((string) $redirect);
        if ($redirect === '' || preg_match('#^https?://#i', $redirect)) {
            return '';
        }

        if (!preg_match('#^[a-zA-Z][a-zA-Z0-9.+-]*://#', $redirect)) {
            return '';
        }

        $scheme = strtolower((string) parse_url($redirect, PHP_URL_SCHEME));
        if ($scheme === '' || !in_array($scheme, nextjs25_social_allowed_mobile_schemes(), true)) {
            return '';
        }

        return $redirect;
    }
}

if (!function_exists('nextjs25_social_validate_redirect')) {
    function nextjs25_social_validate_redirect($redirect)
    {
        $redirect = trim((string) $redirect);
        if ($redirect === '') {
            return '';
        }

        if (preg_match('#^https?://#i', $redirect)) {
            $redirectHost = strtolower((string) parse_url($redirect, PHP_URL_HOST));
            if ($redirectHost && in_array($redirectHost, nextjs25_social_allowed_web_hosts(), true)) {
                return $redirect;
            }
            return '';
        }

        if (preg_match('#^[a-zA-Z][a-zA-Z0-9.+-]*://#', $redirect)) {
            return nextjs25_social_validate_mobile_redirect($redirect);
        }

        return '';
    }
}

if (!function_exists('nextjs25_social_append_query')) {
    function nextjs25_social_append_query($url, array $params)
    {
        $url = (string) $url;
        $fragment = '';
        $hashPos = strpos($url, '#');
        if ($hashPos !== false) {
            $fragment = substr($url, $hashPos);
            $url = substr($url, 0, $hashPos);
        }

        $query = http_build_query($params);
        if ($query === '') {
            return $url . $fragment;
        }

        $last = substr($url, -1);
        $sep = strpos($url, '?') === false ? '?' : (($last === '?' || $last === '&') ? '' : '&');
        return $url . $sep . $query . $fragment;
    }
}

if (!function_exists('nextjs25_social_bridge_state_key')) {
    function nextjs25_social_bridge_state_key()
    {
        return 'nextjs25_social_bridge_state';
    }
}

if (!function_exists('nextjs25_social_set_bridge_state_payload')) {
    function nextjs25_social_set_bridge_state_payload($payload)
    {
        $key = nextjs25_social_bridge_state_key();
        $value = is_array($payload) ? json_encode($payload) : '';
        if ($value === false) {
            $value = '';
        }

        if (function_exists('set_session')) {
            set_session($key, $value);
            return;
        }

        $_SESSION[$key] = $value;
    }
}

if (!function_exists('nextjs25_social_get_bridge_state_payload')) {
    function nextjs25_social_get_bridge_state_payload()
    {
        $key = nextjs25_social_bridge_state_key();
        $value = function_exists('get_session')
            ? (string) get_session($key)
            : (isset($_SESSION[$key]) ? (string) $_SESSION[$key] : '');
        if ($value === '') {
            return array();
        }

        $payload = json_decode($value, true);
        return is_array($payload) ? $payload : array();
    }
}

if (!function_exists('nextjs25_social_issue_bridge_state')) {
    function nextjs25_social_issue_bridge_state($provider, $redirect)
    {
        $state = bin2hex(random_bytes(16));
        nextjs25_social_set_bridge_state_payload(array(
            'state' => $state,
            'provider' => strtolower((string) $provider),
            'redirect' => (string) $redirect,
            'expires_at' => time() + 600,
        ));

        return $state;
    }
}

if (!function_exists('nextjs25_social_validate_bridge_state')) {
    function nextjs25_social_validate_bridge_state($state, $provider = '', $redirect = '')
    {
        $state = trim((string) $state);
        if ($state === '' || !preg_match('/^[a-f0-9]{32}$/i', $state)) {
            return false;
        }

        $payload = nextjs25_social_get_bridge_state_payload();
        if (empty($payload['state']) || !hash_equals((string) $payload['state'], $state)) {
            return false;
        }

        if (!empty($payload['expires_at']) && (int) $payload['expires_at'] < time()) {
            return false;
        }

        if ($provider !== '' && strtolower((string) $payload['provider']) !== strtolower((string) $provider)) {
            return false;
        }

        if ($redirect !== '' && (string) $payload['redirect'] !== (string) $redirect) {
            return false;
        }

        return true;
    }
}

if (!function_exists('nextjs25_social_clear_bridge_state')) {
    function nextjs25_social_clear_bridge_state()
    {
        nextjs25_social_set_bridge_state_payload('');
    }
}

if (!function_exists('nextjs25_social_web_oauth_redirect')) {
    function nextjs25_social_web_oauth_redirect()
    {
        if (!function_exists('get_session')) {
            return '';
        }

        if (!(int) get_session('is_web_oauth')) {
            return '';
        }

        $redirect = (string) get_session('mobile_oauth_redirect');
        if ($redirect === '' || !preg_match('#^https?://#i', $redirect)) {
            return '';
        }

        return nextjs25_social_validate_redirect($redirect);
    }
}

/**
 * start.php 가 세션에 넣어 둔 OAuth 완료 후 되돌아갈 주소 — 웹(https, 허용 호스트)과
 * 모바일(허용된 커스텀 스킴) 둘 다. popup.php 처럼 두 흐름을 같이 받는 곳에서 쓴다.
 * 웹 전용 훅(그누보드 플러그인 이벤트)은 종전대로 nextjs25_social_web_oauth_redirect().
 */
if (!function_exists('nextjs25_social_oauth_redirect')) {
    function nextjs25_social_oauth_redirect()
    {
        if (!function_exists('get_session')) {
            return '';
        }

        $redirect = (string) get_session('mobile_oauth_redirect');
        if ($redirect === '') {
            return '';
        }

        if ((int) get_session('is_web_oauth') && preg_match('#^https?://#i', $redirect)) {
            return nextjs25_social_validate_redirect($redirect);
        }

        if ((int) get_session('is_mobile_oauth')) {
            return nextjs25_social_validate_mobile_redirect($redirect);
        }

        return '';
    }
}

if (!function_exists('nextjs25_social_oauth_is_mobile')) {
    function nextjs25_social_oauth_is_mobile()
    {
        if (!function_exists('get_session')) {
            return false;
        }
        // start.php 가 둘 중 하나만 세우지만, 혹시 모두 세워졌다면 웹을 우선한다.
        return (int) get_session('is_mobile_oauth') && !(int) get_session('is_web_oauth');
    }
}

/**
 * 모바일 세션이면 popup(JS) 대신 순수 302 로 강제한다.
 * 커스텀 스킴에는 window.opener 가 없고, 앱의 openAuthSessionAsync 는 302 의
 * Location 헤더로 deep-link 를 감지한다 (finish.php 와 같은 이유).
 */
if (!function_exists('nextjs25_social_oauth_use_popup')) {
    function nextjs25_social_oauth_use_popup($usePopup)
    {
        return nextjs25_social_oauth_is_mobile() ? 2 : $usePopup;
    }
}

if (!function_exists('nextjs25_social_redirect_to_register_url')) {
    function nextjs25_social_redirect_to_register_url($redirect)
    {
        // 모바일 앱 콜백(sirsoft-g5://social-callback?state=… 같은 앱 스킴 주소)은 그대로 돌려준다.
        // 앱은 같은 콜백에서 ticket / social_signup_ticket 파라미터로 로그인·가입을
        // 구분하고, 콜백 base URL 과 state 가 바뀌면 검증에서 거부한다.
        if (nextjs25_social_validate_mobile_redirect($redirect) !== '') {
            return $redirect;
        }

        $registerRedirect = preg_replace('#/login/social-callback/?#', '/register', $redirect, 1);
        if ($registerRedirect !== $redirect) {
            return $registerRedirect;
        }

        $parts = parse_url($redirect);
        if (empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $registerRedirect = $parts['scheme'] . '://' . $parts['host'];
        if (!empty($parts['port'])) {
            $registerRedirect .= ':' . $parts['port'];
        }
        $registerRedirect .= '/register';

        if (!empty($parts['query'])) {
            parse_str($parts['query'], $query);
            if (!empty($query['redirect'])) {
                $registerRedirect .= '?redirect=' . rawurlencode((string) $query['redirect']);
            }
        }

        return $registerRedirect;
    }
}

if (!function_exists('nextjs25_social_signup_bridge_url')) {
    function nextjs25_social_signup_bridge_url($providerName, $redirect)
    {
        $registerRedirect = nextjs25_social_redirect_to_register_url($redirect);
        if ($registerRedirect === '') {
            return '';
        }

        return rtrim(G5_URL, '/') . '/api/social/signup.php?provider='
            . rawurlencode(strtolower((string) $providerName))
            . '&redirect=' . rawurlencode($registerRedirect);
    }
}

if (!function_exists('nextjs25_social_remember_profile')) {
    function nextjs25_social_remember_profile($providerName, $userProfile)
    {
        if (!$userProfile) {
            return;
        }

        if (!isset($_SESSION['sl_userprofile']) || !is_array($_SESSION['sl_userprofile'])) {
            $_SESSION['sl_userprofile'] = array();
        }

        $profileJson = json_encode($userProfile);
        if ($profileJson === false) {
            return;
        }

        $_SESSION['sl_userprofile'][(string) $providerName] = function_exists('get_string_encrypt')
            ? get_string_encrypt($profileJson)
            : $profileJson;
    }
}

if (!function_exists('nextjs25_social_echo_popup_redirect')) {
    function nextjs25_social_echo_popup_redirect($targetUrl, $usePopup)
    {
        if ($targetUrl === '') {
            return;
        }

        if ($usePopup == 1 || !$usePopup) {
            $targetJson = json_encode($targetUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($targetJson === false) {
                return;
            }

            echo '<script>
(function () {
    var targetUrl = ' . $targetJson . ';
    if (window.opener && !window.opener.closed) {
        try {
            window.opener.location.href = targetUrl;
            window.close();
            return;
        } catch (e) {
            if (window.console && typeof window.console.debug === "function") {
                window.console.debug("[nextjs25-social] opener redirect failed", e);
            }
        }
    }
    window.location.href = targetUrl;
})();
</script>';
            exit;
        }

        goto_url($targetUrl);
        exit;
    }
}

if (!function_exists('nextjs25_social_clear_web_oauth_session')) {
    function nextjs25_social_clear_web_oauth_session()
    {
        nextjs25_social_clear_bridge_state();
        set_session('is_mobile_oauth', 0);
        set_session('is_web_oauth', 0);
        set_session('mobile_oauth_redirect', '');
        set_session('mobile_oauth_provider', '');
        set_session('mobile_oauth_code_challenge', '');
    }
}

if (!function_exists('nextjs25_social_login_before_return_from_provider_page')) {
    function nextjs25_social_login_before_return_from_provider_page($provider, $loginActionUrl, $mbId, $mbPassword, $url, $usePopup)
    {
        $redirect = nextjs25_social_oauth_redirect();
        if ($redirect === '' || (string) $mbId === '') {
            return;
        }

        $ticket = nextjs25_social_issue_mobile_ticket((string) $mbId, (string) $provider);
        if ($ticket === '') {
            return;
        }

        nextjs25_social_clear_web_oauth_session();
        nextjs25_social_echo_popup_redirect(nextjs25_social_append_query($redirect, array(
            'ticket' => $ticket,
        )), nextjs25_social_oauth_use_popup($usePopup));
    }
}

if (!function_exists('nextjs25_social_login_linked_provider_before_member_check')) {
    function nextjs25_social_login_linked_provider_before_member_check($providerName, $userProvider, $url, $usePopup)
    {
        $redirect = nextjs25_social_oauth_redirect();
        if ($redirect === '' || empty($userProvider['mb_id'])) {
            return;
        }

        $ticket = nextjs25_social_issue_mobile_ticket((string) $userProvider['mb_id'], (string) $providerName);
        if ($ticket === '') {
            return;
        }

        nextjs25_social_clear_web_oauth_session();
        nextjs25_social_echo_popup_redirect(nextjs25_social_append_query($redirect, array(
            'ticket' => $ticket,
        )), nextjs25_social_oauth_use_popup($usePopup));
    }
}

if (!function_exists('nextjs25_social_login_existing_member_before_link_prompt')) {
    function nextjs25_social_login_existing_member_before_link_prompt($providerName, $url, $usePopup, $userProfile, $mylink)
    {
        $redirect = nextjs25_social_oauth_redirect();
        if ($redirect === '' || (int) $mylink) {
            return;
        }

        nextjs25_social_remember_profile($providerName, $userProfile);

        $signupUrl = nextjs25_social_signup_bridge_url($providerName, $redirect);
        if ($signupUrl === '') {
            return;
        }

        nextjs25_social_echo_popup_redirect($signupUrl, nextjs25_social_oauth_use_popup($usePopup));
    }
}

if (!function_exists('nextjs25_social_login_unlinked_before_redirect')) {
    function nextjs25_social_login_unlinked_before_redirect($providerName, $registerUrl, $url, $usePopup, $userProfile)
    {
        $redirect = nextjs25_social_oauth_redirect();
        if ($redirect === '') {
            return;
        }

        $signupUrl = nextjs25_social_signup_bridge_url($providerName, $redirect);
        if ($signupUrl === '') {
            return;
        }

        nextjs25_social_echo_popup_redirect($signupUrl, nextjs25_social_oauth_use_popup($usePopup));
    }
}

if (!function_exists('nextjs25_social_register_bridge_events')) {
    function nextjs25_social_register_bridge_events()
    {
        static $registered = false;
        if ($registered || !function_exists('add_event')) {
            return;
        }

        $registered = true;
        add_event('social_login_unlinked_before_redirect', 'nextjs25_social_login_unlinked_before_redirect', 10, 5);
        add_event('social_login_before_return_from_provider_page', 'nextjs25_social_login_before_return_from_provider_page', 10, 6);
        add_event('social_login_linked_provider_before_member_check', 'nextjs25_social_login_linked_provider_before_member_check', 10, 4);
        add_event('social_login_existing_member_before_link_prompt', 'nextjs25_social_login_existing_member_before_link_prompt', 10, 5);
    }
}

nextjs25_social_register_bridge_events();

if (!function_exists('nextjs25_social_profile_payload')) {
    function nextjs25_social_profile_payload($provider, $profile)
    {
        $email = '';
        if (isset($profile->emailVerified) && $profile->emailVerified) {
            $verified = $profile->emailVerified;
            if (is_string($verified) && filter_var($verified, FILTER_VALIDATE_EMAIL)) {
                $email = $verified;
            } elseif (isset($profile->email) && filter_var((string) $profile->email, FILTER_VALIDATE_EMAIL)) {
                $email = (string) $profile->email;
            }
        }

        return array(
            'provider'    => strtolower((string) $provider),
            'identifier'  => isset($profile->identifier) ? (string) $profile->identifier : '',
            'sid'         => isset($profile->sid) ? (string) $profile->sid : '',
            'displayName' => isset($profile->displayName) ? (string) $profile->displayName : '',
            'username'    => isset($profile->username) ? (string) $profile->username : '',
            'email'       => $email,
            'phone'       => isset($profile->phone) ? (string) $profile->phone : '',
            'gender'      => isset($profile->gender) ? (string) $profile->gender : '',
            'photoURL'    => isset($profile->photoURL) ? (string) $profile->photoURL : '',
            'profileURL'  => isset($profile->profileURL) ? (string) $profile->profileURL : '',
            'description' => isset($profile->description) ? (string) $profile->description : '',
        );
    }
}
