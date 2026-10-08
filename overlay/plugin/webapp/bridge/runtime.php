<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

/*
 * Generic runtime bootstrap for Next.js-derived Gnuboard themes.
 *
 * Loaded by extend/webapp.extend.php. This replaces the need to create
 * extend/<theme>-runtime.extend.php for every generated theme. The active theme is read from g5_config.cf_theme and this
 * file only runs when theme/<active>/route.php exists.
 */

if (!function_exists('g5_nextjs_runtime_normalize_host')) {
    function g5_nextjs_runtime_normalize_host($host)
    {
        $host = strtolower(trim((string) $host));
        $host = preg_replace('/:\d+$/', '', $host);
        return trim($host, '[]');
    }
}

if (!function_exists('g5_nextjs_runtime_add_host_value')) {
    function g5_nextjs_runtime_add_host_value(array &$hosts, $value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return;
        }

        foreach (explode(',', $value) as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }

            $host = preg_match('#^https?://#i', $part) ? parse_url($part, PHP_URL_HOST) : $part;
            $host = g5_nextjs_runtime_normalize_host($host);
            if ($host !== '') {
                $hosts[$host] = true;
            }
        }
    }
}

if (!function_exists('g5_nextjs_runtime_valid_public_url')) {
    function g5_nextjs_runtime_valid_public_url($url)
    {
        $url = trim((string) $url);
        if ($url === '' || !preg_match('#^https?://#i', $url)) {
            return '';
        }

        return parse_url($url, PHP_URL_HOST) ? rtrim($url, '/') : '';
    }
}

if (!function_exists('g5_nextjs_runtime_current_origin')) {
    function g5_nextjs_runtime_current_origin($http_host)
    {
        $http_host = trim((string) $http_host);
        if ($http_host === '') {
            return '';
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $forwarded_scheme = g5_nextjs_runtime_forwarded_proto();
        if ($forwarded_scheme !== '') {
            $scheme = $forwarded_scheme;
        }

        return $scheme . '://' . $http_host;
    }
}

if (!function_exists('g5_nextjs_runtime_load_env_file')) {
    function g5_nextjs_runtime_load_env_file($path, array &$env)
    {
        if (!is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return;
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

            $env[$key] = $value;
        }
    }
}

if (!function_exists('g5_webapp_member_key_for_url')) {
    /**
     * 예전 회원 주소(bbs/profile.php?mb_id=)를 넘길 때 쓸 회원 공개 키(api/lib/member_key_helpers.php).
     * 서버가 먼저 /members/아이디 로 넘기면 그 주소가 검색엔진에 남으므로 처음부터 /members/{키} 로 넘긴다.
     * 없는 회원 · 키 표나 API 파일이 없는 설치본은 '' — 부르는 쪽이 예전처럼 아이디 주소로 넘긴다.
     * 넘기는 주소(키 / 아이디)로 그 아이디가 있는지 드러나므로 GET /v1/members/{id}/key 와 같은 한도를 건다 —
     * 없는 아이디만 세고, 한도를 넘으면 모든 아이디를 아이디 주소로 넘겨 차이를 남기지 않는다.
     */
    function g5_webapp_member_key_for_url($mb_id)
    {
        global $member;

        $mb_id = (string) $mb_id;
        $root = defined('G5_PATH') ? G5_PATH : dirname(__DIR__, 3);
        if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $mb_id)
            || !is_file($root . '/api/lib/DB.php')
            || !is_file($root . '/api/lib/member_key_helpers.php')) {
            return '';
        }
        try {
            require_once $root . '/api/lib/DB.php';
            require_once $root . '/api/lib/member_key_helpers.php';
            $throttle = is_file($root . '/api/lib/Throttle.php');
            if ($throttle) {
                require_once $root . '/api/lib/Throttle.php';
            }
            $subject = !empty($member['mb_id'])
                ? 'mb:' . (string) $member['mb_id']
                : 'ip:' . (string) (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
            if ($throttle && Throttle::checkMemberQuota('memberkeymiss', $subject, 30, 300, false) !== null) {
                return '';
            }
            $target = DB::fetch(
                "SELECT mb_id FROM " . DB::table('member_table') . "
                  WHERE mb_id = ? AND mb_leave_date = '' AND mb_intercept_date = '' LIMIT 1",
                array($mb_id)
            );
            if (!$target) {
                if ($throttle) {
                    Throttle::checkMemberQuota('memberkeymiss', $subject, 30, 300);
                }
                return '';
            }
            return api_member_public_key((string) $target['mb_id']);
        } catch (Throwable $e) {
            return '';
        }
    }
}

if (!function_exists('g5_nextjs_runtime_env_value')) {
    function g5_nextjs_runtime_env_value(array $env, $key)
    {
        $process_value = getenv($key);
        if (is_string($process_value) && trim($process_value) !== '') {
            return trim($process_value);
        }

        return isset($env[$key]) ? trim((string) $env[$key]) : '';
    }
}

if (!function_exists('g5_nextjs_runtime_first_url')) {
    function g5_nextjs_runtime_first_url(array $env, array $keys)
    {
        foreach ($keys as $key) {
            $url = g5_nextjs_runtime_valid_public_url(g5_nextjs_runtime_env_value($env, $key));
            if ($url !== '') {
                return $url;
            }
        }

        return '';
    }
}

// 활성 테마의 주소 설정(G5_<테마>_G5_URL · _APP_URL · _API_URL)을 정하는 순서 — 테마 이름 키(env), 테마와 상관없는
// 공용 이름 G5_WEBAPP_<이름>(env, 그다음 PHP define), 마지막으로 NEXT_PUBLIC_<이름>(env). 공용 이름으로 적어 두면
// create-theme 로 만든 다른 테마로 바꿔도 그대로 쓰인다 — 테마 이름 키는 테마를 바꾸면 이름도 바뀐다.
if (!function_exists('g5_nextjs_runtime_setting_url')) {
    function g5_nextjs_runtime_setting_url(array $env, $prefix, $name)
    {
        $url = g5_nextjs_runtime_first_url($env, array($prefix . '_' . $name, 'G5_WEBAPP_' . $name));
        if ($url === '' && defined('G5_WEBAPP_' . $name)) {
            $url = g5_nextjs_runtime_valid_public_url((string) constant('G5_WEBAPP_' . $name));
        }

        return $url !== '' ? $url : g5_nextjs_runtime_first_url($env, array('NEXT_PUBLIC_' . $name));
    }
}

// 테마와 상관없는 허용 호스트(G5_WEBAPP_ALLOWED_HOSTS — env 와 PHP define). 테마 이름 키(G5_<테마>_ALLOWED_HOSTS)에
// 더해진다. 공용 이름으로 적어 두면 다른 테마로 바꿔도 www. 같은 별칭 호스트가 거절되지 않는다.
if (!function_exists('g5_nextjs_runtime_neutral_allowed_hosts')) {
    function g5_nextjs_runtime_neutral_allowed_hosts(array $env)
    {
        $values = array(g5_nextjs_runtime_env_value($env, 'G5_WEBAPP_ALLOWED_HOSTS'));
        if (defined('G5_WEBAPP_ALLOWED_HOSTS')) {
            $values[] = trim((string) G5_WEBAPP_ALLOWED_HOSTS);
        }

        return implode(',', array_filter($values, 'strlen'));
    }
}

// 관리자 「짧은 주소 설정」의 Apache/Nginx 설정 코드와 .htaccess 갱신에 테마 브리지
// 규칙을 보탠다. 훅 함수는 기준 테마가 Next.js 테마일 때만 줄을 내므로 여기서는
// 활성 테마와 상관없이 건다 — basic 에서 nextjs_default 로 바꾸는 순간에도 있어야 한다.
// 영카트(shop.extend.php, priority 10)보다 뒤에 돌아 우리 줄이 그 줄들 앞에 선다.
if (function_exists('add_replace') && function_exists('g5_nextjs_add_mod_rewrite_rules')) {
    add_replace('add_mod_rewrite_pre_rules', 'g5_nextjs_add_mod_rewrite_pre_rules', 20, 4);
    add_replace('add_mod_rewrite_rules', 'g5_nextjs_add_mod_rewrite_rules', 20, 4);
    add_replace('add_nginx_conf_pre_rules', 'g5_nextjs_add_nginx_conf_pre_rules', 20, 4);
    add_replace('add_nginx_conf_rules', 'g5_nextjs_add_nginx_conf_rules', 20, 4);
}
// 관리자가 테마를 바꾸면(adm/theme_update.php) Apache 의 .htaccess 블록을 새 테마에 맞춰 다시 쓴다.
if (function_exists('add_event') && function_exists('g5_nextjs_on_adm_theme_update')) {
    add_event('adm_theme_update', 'g5_nextjs_on_adm_theme_update', 10, 2);
}

// /app/post/<board>/<id> 같은 앱 열기 랜딩. 활성 테마와 무관하게, PHP 에 닿는 모든 요청에서 본다.
require_once __DIR__ . '/app-link.php';
if (PHP_SAPI !== 'cli') {
    g5_webapp_app_link_maybe_serve();
}

$g5_nextjs_theme = g5_nextjs_runtime_active_theme();
$g5_nextjs_theme_path = g5_nextjs_runtime_theme_path($g5_nextjs_theme);

if ($g5_nextjs_theme_path === '' || !is_file($g5_nextjs_theme_path . '/route.php')) {
    unset($g5_nextjs_theme, $g5_nextjs_theme_path);
    return;
}

$g5_nextjs_prefix = g5_nextjs_runtime_theme_prefix($g5_nextjs_theme);
$g5_nextjs_host = isset($_SERVER['HTTP_HOST']) ? strtolower((string) $_SERVER['HTTP_HOST']) : '';
$g5_nextjs_http_host = $g5_nextjs_host;
$g5_nextjs_host = preg_replace('/:\d+$/', '', $g5_nextjs_host);
$g5_nextjs_is_web_request = PHP_SAPI !== 'cli' && $g5_nextjs_http_host !== '';
$g5_nextjs_env = array();
$g5_nextjs_env_paths = array(
    dirname(__DIR__, 3) . '/nextjs/.env',
    dirname(__DIR__, 3) . '/nextjs/.env.production',
    dirname(__DIR__, 3) . '/nextjs/.env.production.local',
    dirname(__DIR__, 3) . '/api/.env',
);

foreach ($g5_nextjs_env_paths as $g5_nextjs_env_path) {
    g5_nextjs_runtime_load_env_file($g5_nextjs_env_path, $g5_nextjs_env);
}

$g5_nextjs_trusted_proxy_addrs = g5_nextjs_runtime_env_value($g5_nextjs_env, 'G5_TRUSTED_PROXY_REMOTE_ADDRS');
if (!defined('G5_TRUSTED_PROXY_REMOTE_ADDRS') && $g5_nextjs_trusted_proxy_addrs !== '') {
    define('G5_TRUSTED_PROXY_REMOTE_ADDRS', $g5_nextjs_trusted_proxy_addrs);
}

$g5_nextjs_current_origin = g5_nextjs_runtime_current_origin($g5_nextjs_http_host);

// 개발용 호스트(localhost · 127.0.0.x)는 요청이 이 컴퓨터 · 사설망에서 왔을 때만 믿는다 — 운영 서버에 바깥에서
// "Host: localhost" 를 보내 개발용 CORS · 소셜 허용 목록이 켜지지 않게. 같은 서버의 프록시를 거치면 그대로 열리고,
// 운영자가 G5_NEXTJS_LOCAL_HOSTS 로 직접 적은 호스트는 그와 별개로 늘 받는다.
$g5_nextjs_remote_addr = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$g5_nextjs_local_client = PHP_SAPI === 'cli'
    || $g5_nextjs_remote_addr === ''
    || filter_var($g5_nextjs_remote_addr, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
$g5_nextjs_local_hosts = $g5_nextjs_local_client ? array(
    '127.0.0.1' => true,
    'localhost' => true,
    'localhost' => true,
    'localhost' => true,
    'localhost' => true,
    'localhost' => true,
) : array();
g5_nextjs_runtime_add_host_value(
    $g5_nextjs_local_hosts,
    g5_nextjs_runtime_env_value($g5_nextjs_env, 'G5_NEXTJS_LOCAL_HOSTS')
);
$g5_nextjs_is_local = isset($g5_nextjs_local_hosts[$g5_nextjs_host]);
$g5_nextjs_cors_origins = g5_nextjs_runtime_env_value($g5_nextjs_env, 'G5_CORS_ALLOWED_ORIGINS');
$g5_nextjs_social_hosts = g5_nextjs_runtime_env_value($g5_nextjs_env, 'G5_SOCIAL_WEB_HOSTS');
$g5_nextjs_public_g5_url = g5_nextjs_runtime_setting_url($g5_nextjs_env, $g5_nextjs_prefix, 'G5_URL');
$g5_nextjs_public_app_url = g5_nextjs_runtime_setting_url($g5_nextjs_env, $g5_nextjs_prefix, 'APP_URL');
$g5_nextjs_public_api_url = g5_nextjs_runtime_setting_url($g5_nextjs_env, $g5_nextjs_prefix, 'API_URL');

if ($g5_nextjs_is_local && $g5_nextjs_current_origin !== '' && $g5_nextjs_public_app_url === '') {
    $g5_nextjs_public_app_url = $g5_nextjs_current_origin;
}

// env 파일의 사이트 주소는 개발용 고정값이다. 같은 폴더를 다른 호스트(예: 상위 폴더를 루트로
// 잡은 하위 경로 설치 재현, 도메인이 바뀐 배포본)로 열면 이 값이 요청과 어긋나서 브리지가
// 엉뚱한 사이트 주소를 쓴다. 요청 호스트와 같을 때만 정의하고, 아니면 그누보드의 G5_URL 에
// 맡긴다. 앱 주소(_APP_URL)는 dev 서버처럼 다른 호스트에 있을 수 있어 그대로 둔다.
if (!function_exists('g5_nextjs_runtime_url_matches_host')) {
    function g5_nextjs_runtime_url_matches_host($url, $host)
    {
        $url_host = strtolower((string) parse_url((string) $url, PHP_URL_HOST));
        $host = strtolower(trim((string) $host, '[]'));
        $host = preg_replace('/:\d+$/', '', $host);

        return $url_host === '' || $host === '' || $url_host === $host;
    }
}

if (!g5_nextjs_runtime_url_matches_host($g5_nextjs_public_g5_url, $g5_nextjs_host)) {
    $g5_nextjs_public_g5_url = '';
}
if (!g5_nextjs_runtime_url_matches_host($g5_nextjs_public_api_url, $g5_nextjs_host)) {
    $g5_nextjs_public_api_url = '';
}

if (!defined($g5_nextjs_prefix . '_G5_URL') && $g5_nextjs_public_g5_url !== '') {
    define($g5_nextjs_prefix . '_G5_URL', $g5_nextjs_public_g5_url);
}

if (!defined($g5_nextjs_prefix . '_APP_URL') && $g5_nextjs_public_app_url !== '') {
    define($g5_nextjs_prefix . '_APP_URL', $g5_nextjs_public_app_url);
}

if (!defined($g5_nextjs_prefix . '_API_URL') && $g5_nextjs_public_api_url !== '') {
    define($g5_nextjs_prefix . '_API_URL', $g5_nextjs_public_api_url);
}

// 사이트 주소는 그누보드가 G5_URL 로 스스로 안다. 테마 브리지는 위 상수가 없으면 G5_URL 을
// 쓰므로, 예전처럼 상수가 없다고 요청을 500 으로 끊지 않는다. 그 차단은 env 파일이 없는
// 배포본(웹호스팅에 압축을 풀어 올린 경우)마다 사이트를 통째로 죽였다.

if ($g5_nextjs_social_hosts === '' && $g5_nextjs_cors_origins !== '') {
    $g5_nextjs_social_host_parts = array();
    foreach (explode(',', $g5_nextjs_cors_origins) as $g5_nextjs_origin) {
        $g5_nextjs_origin = trim($g5_nextjs_origin);
        if ($g5_nextjs_origin === '') {
            continue;
        }

        $g5_nextjs_origin_host = preg_match('#^https?://#i', $g5_nextjs_origin)
            ? parse_url($g5_nextjs_origin, PHP_URL_HOST)
            : $g5_nextjs_origin;
        $g5_nextjs_origin_host = g5_nextjs_runtime_normalize_host($g5_nextjs_origin_host);
        if ($g5_nextjs_origin_host !== '') {
            $g5_nextjs_social_host_parts[] = $g5_nextjs_origin_host;
        }
    }
    $g5_nextjs_social_hosts = implode(',', array_values(array_unique($g5_nextjs_social_host_parts)));
}

if (!defined('G5_CORS_ALLOWED_ORIGINS') && $g5_nextjs_cors_origins !== '') {
    define('G5_CORS_ALLOWED_ORIGINS', $g5_nextjs_cors_origins);
}

if (!defined('G5_SOCIAL_WEB_HOSTS') && $g5_nextjs_social_hosts !== '') {
    define('G5_SOCIAL_WEB_HOSTS', $g5_nextjs_social_hosts);
}

$g5_nextjs_allowed_hosts = $g5_nextjs_local_hosts;

g5_nextjs_runtime_add_host_value(
    $g5_nextjs_allowed_hosts,
    g5_nextjs_runtime_env_value($g5_nextjs_env, $g5_nextjs_prefix . '_ALLOWED_HOSTS')
);
g5_nextjs_runtime_add_host_value($g5_nextjs_allowed_hosts, g5_nextjs_runtime_neutral_allowed_hosts($g5_nextjs_env));
g5_nextjs_runtime_add_host_value($g5_nextjs_allowed_hosts, $g5_nextjs_cors_origins);
g5_nextjs_runtime_add_host_value($g5_nextjs_allowed_hosts, $g5_nextjs_social_hosts);
if (defined('G5_URL')) {
    g5_nextjs_runtime_add_host_value($g5_nextjs_allowed_hosts, G5_URL);
}
foreach (array('G5_URL', 'APP_URL', 'API_URL') as $g5_nextjs_url_suffix) {
    $g5_nextjs_url_constant = $g5_nextjs_prefix . '_' . $g5_nextjs_url_suffix;
    if (defined($g5_nextjs_url_constant)) {
        g5_nextjs_runtime_add_host_value($g5_nextjs_allowed_hosts, constant($g5_nextjs_url_constant));
    }
}

if (!defined($g5_nextjs_prefix . '_ALLOWED_HOSTS')) {
    define($g5_nextjs_prefix . '_ALLOWED_HOSTS', implode(',', array_keys($g5_nextjs_allowed_hosts)));
}

if ($g5_nextjs_http_host !== '') {
    $g5_nextjs_request_host = g5_nextjs_runtime_normalize_host($g5_nextjs_http_host);
    if ($g5_nextjs_request_host !== '' && !isset($g5_nextjs_allowed_hosts[$g5_nextjs_request_host])) {
        if (!headers_sent()) {
            http_response_code(400);
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
            header('Content-Type: text/plain; charset=utf-8');
        }
        exit('Invalid Host header.');
    }
}

if ($g5_nextjs_is_local) {
    if (!defined($g5_nextjs_prefix . '_API_URL')) {
        $g5_nextjs_local_api_url = defined('G5_URL') && G5_URL
            ? rtrim(G5_URL, '/') . '/api/v1'
            : $g5_nextjs_current_origin . '/api/v1';
        define($g5_nextjs_prefix . '_API_URL', $g5_nextjs_local_api_url);
    }

    if (!defined('G5_CORS_ALLOWED_ORIGINS')) {
        $g5_nextjs_local_cors_origins = g5_nextjs_runtime_env_value($g5_nextjs_env, 'G5_NEXTJS_LOCAL_CORS_ORIGINS');
        define(
            'G5_CORS_ALLOWED_ORIGINS',
            $g5_nextjs_local_cors_origins !== ''
                ? $g5_nextjs_local_cors_origins
                : 'http://localhost,http://localhost,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003,http://localhost:3000'
        );
    }

    if (!defined('G5_SOCIAL_WEB_HOSTS')) {
        $g5_nextjs_local_social_hosts = g5_nextjs_runtime_env_value($g5_nextjs_env, 'G5_NEXTJS_LOCAL_SOCIAL_HOSTS');
        define(
            'G5_SOCIAL_WEB_HOSTS',
            $g5_nextjs_local_social_hosts !== ''
                ? $g5_nextjs_local_social_hosts
                : implode(',', array_keys($g5_nextjs_local_hosts))
        );
    }
}

foreach (array('G5_URL', 'API_URL', 'APP_URL', 'ALLOWED_HOSTS') as $g5_nextjs_webapp_suffix) {
    $g5_nextjs_webapp_src = $g5_nextjs_prefix . '_' . $g5_nextjs_webapp_suffix;
    $g5_nextjs_webapp_dst = 'G5_WEBAPP_' . $g5_nextjs_webapp_suffix;
    if (defined($g5_nextjs_webapp_src) && !defined($g5_nextjs_webapp_dst)) {
        define($g5_nextjs_webapp_dst, constant($g5_nextjs_webapp_src));
    }
}

$g5_nextjs_runtime_config_key = g5_nextjs_runtime_env_value($g5_nextjs_env, 'NEXT_PUBLIC_RUNTIME_CONFIG_KEY');
if (!defined('G5_WEBAPP_RUNTIME_CONFIG_KEY') && $g5_nextjs_runtime_config_key !== '') {
    define('G5_WEBAPP_RUNTIME_CONFIG_KEY', $g5_nextjs_runtime_config_key);
}

unset(
    $g5_nextjs_theme,
    $g5_nextjs_theme_path,
    $g5_nextjs_prefix,
    $g5_nextjs_host,
    $g5_nextjs_http_host,
    $g5_nextjs_local_hosts,
    $g5_nextjs_remote_addr,
    $g5_nextjs_local_client,
    $g5_nextjs_is_local,
    $g5_nextjs_is_web_request,
    $g5_nextjs_current_origin,
    $g5_nextjs_env,
    $g5_nextjs_env_paths,
    $g5_nextjs_env_path,
    $g5_nextjs_trusted_proxy_addrs,
    $g5_nextjs_local_cors_origins,
    $g5_nextjs_local_social_hosts,
    $g5_nextjs_cors_origins,
    $g5_nextjs_social_hosts,
    $g5_nextjs_public_g5_url,
    $g5_nextjs_public_app_url,
    $g5_nextjs_public_api_url,
    $g5_nextjs_social_host_parts,
    $g5_nextjs_origin,
    $g5_nextjs_origin_host,
    $g5_nextjs_allowed_hosts,
    $g5_nextjs_url_suffix,
    $g5_nextjs_url_constant,
    $g5_nextjs_request_host,
    $g5_nextjs_local_api_url,
    $g5_nextjs_webapp_suffix,
    $g5_nextjs_webapp_src,
    $g5_nextjs_webapp_dst,
    $g5_nextjs_runtime_config_key
);
