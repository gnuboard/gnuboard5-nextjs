<?php
/**
 * Gnuboard5 REST API - Main Router
 *
 * Routes incoming requests to the appropriate v1 handler files.
 * Relies on .htaccess to rewrite URLs into ?_route=...
 */

// ---------------------------------------------------------------------------
// Bootstrap Gnuboard5 (DB connection, constants, functions)
// Suppress warnings/notices to keep JSON output clean
// ---------------------------------------------------------------------------
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

// _GNUBOARD_ 는 여기서 정의하지 않는다 — 아래 common.php 가 읽는 원본 config.php 가 정의하므로,
// 먼저 정의하면 요청마다 "Constant _GNUBOARD_ already defined" 경고가 로그에 쌓인다.

// JSON API 요청 표시. 테마 런타임(plugin/webapp/bridge/runtime.php)이 테마 전용
// 설정 누락으로 API 응답까지 중단하지 않도록, common.php 부트스트랩 전에 정의한다.
if (!defined('G5_API_REQUEST')) {
    define('G5_API_REQUEST', true);
}

// User-Agent 를 보내지 않는 클라이언트(일부 HTTP 라이브러리 · 서버 간 호출) — 그누보드 ss_mb_key() 가 확인 없이 읽어
// 경고가 나고, 아래 오류 처리기가 그것을 예외로 바꿔 로그인이 500 이 된다. 브라우저처럼 빈 값을 둔다.
if (!isset($_SERVER['HTTP_USER_AGENT'])) {
    $_SERVER['HTTP_USER_AGENT'] = '';
}

// 세션 — 공유 호스팅(/tmp)의 세션 청소 멈춤과 쿠키 없는 요청의 빈 세션 파일을 막는다(코어보다 먼저 감싸야 한다).
if (is_file(__DIR__ . '/../plugin/webapp/session_guard.php')) {
    require_once __DIR__ . '/../plugin/webapp/session_guard.php';
    webapp_session_guard_install();
}

ob_start();
require_once __DIR__ . '/../common.php';
$g5_api_bootstrap_output = ob_get_clean(); // Keep JSON clean when bootstrap emits warnings/notices.
if (is_string($g5_api_bootstrap_output) && trim($g5_api_bootstrap_output) !== '') {
    error_log('[g5-api] suppressed bootstrap output: ' . substr(trim($g5_api_bootstrap_output), 0, 1000));
}

if (!function_exists('g5_api_read_env_file')) {
    function g5_api_read_env_file($path)
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

if (!function_exists('g5_api_add_allowed_origins')) {
    function g5_api_add_allowed_origins(&$allowedOrigins, $origins)
    {
        if (!is_string($origins) || trim($origins) === '') {
            return;
        }

        foreach (explode(',', $origins) as $origin) {
            $origin = rtrim(trim($origin), '/');
            if ($origin !== '') {
                $allowedOrigins[] = $origin;
            }
        }
    }
}

if (!function_exists('g5_api_origin_from_url')) {
    function g5_api_origin_from_url($url)
    {
        $url = trim((string) $url);
        if ($url === '') {
            return '';
        }

        $parts = parse_url($url);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $scheme = strtolower((string) $parts['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            return '';
        }

        $host = strtolower((string) $parts['host']);
        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';

        return $scheme . '://' . $host . $port;
    }
}

if (!function_exists('g5_api_current_origin')) {
    function g5_api_current_origin()
    {
        $host = isset($_SERVER['HTTP_HOST']) ? trim((string) $_SERVER['HTTP_HOST']) : '';
        if ($host === '') {
            return '';
        }

        $forwarded_scheme = function_exists('g5_nextjs_runtime_forwarded_proto')
            ? g5_nextjs_runtime_forwarded_proto()
            : '';
        $https = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || $forwarded_scheme === 'https';

        return ($https ? 'https://' : 'http://') . strtolower($host);
    }
}

if (!function_exists('g5_api_is_local_origin')) {
    function g5_api_is_local_origin($origin)
    {
        $host = parse_url((string) $origin, PHP_URL_HOST);
        $host = strtolower(trim((string) $host, '[]'));

        // 127.0.0.1.attacker.example 같은 호스트가 접두사 비교로 통과하지 않게 IPv4 루프백 전체 형식만 받는다.
        return $host === 'localhost'
            || $host === '::1'
            || preg_match('/^127(\.\d{1,3}){3}$/', $host) === 1;
    }
}

if (!function_exists('g5_api_add_url_origin')) {
    function g5_api_add_url_origin(&$allowedOrigins, $url)
    {
        $origin = g5_api_origin_from_url($url);
        if ($origin !== '') {
            $allowedOrigins[] = $origin;
        }
    }
}

if (!function_exists('g5_api_allowed_origin')) {
    function g5_api_allowed_origin($origin, $allowedOrigins)
    {
        $origin = g5_api_origin_from_url($origin);
        return $origin !== '' && in_array($origin, $allowedOrigins, true);
    }
}

if (!function_exists('g5_api_normalize_allowed_origins')) {
    function g5_api_normalize_allowed_origins($allowedOrigins)
    {
        $normalized = array();
        foreach ($allowedOrigins as $origin) {
            $value = g5_api_origin_from_url($origin);
            if ($value !== '') {
                $normalized[] = $value;
            }
        }

        return array_values(array_unique($normalized));
    }
}

if (!function_exists('g5_api_enforce_write_origin')) {
    function g5_api_enforce_write_origin($allowedOrigins, $route = '')
    {
        $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
        if (!in_array($method, array('POST', 'PUT', 'PATCH', 'DELETE'), true)) {
            return;
        }

        // PG 결제창(KCP·이니시스·나이스페이 도메인)이 브라우저로 POST 하는 복귀 브리지는 출처가 늘 PG 다.
        // 쿠키 인증을 쓰지 않고 결과는 서버가 PG 승인 API 로 다시 검증하므로 출처 가드에서 뺀다.
        if (preg_match('#^v1/shop/payment/(kcp|inicis|nicepay)-return$#', (string) $route) === 1) {
            return;
        }

        $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string) $_SERVER['HTTP_ORIGIN']) : '';
        if ($origin !== '') {
            if (!g5_api_allowed_origin($origin, $allowedOrigins)) {
                Response::error('Forbidden origin.', 403);
            }
            return;
        }

        $referer = isset($_SERVER['HTTP_REFERER']) ? trim((string) $_SERVER['HTTP_REFERER']) : '';
        if ($referer !== '' && !g5_api_allowed_origin($referer, $allowedOrigins)) {
            Response::error('Forbidden referer.', 403);
        }

        // Auth::extractBearerToken() 과 같은 순서로 읽는다. Apache 모듈 PHP 는 $_SERVER 에
        // HTTP_AUTHORIZATION 을 안 채우므로 apache_request_headers() 폴백이 없으면, 인증은 Bearer 로
        // 되는데 이 가드만 "쿠키 인증" 으로 오판해 Bearer + g5_token 쿠키 요청을 403 으로 막았다
        // (2026-09-21, 앱의 카카오 로그인 뒤 푸시 토큰 등록 실패).
        $authHeader = '';
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $authHeader = (string) $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $authHeader = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (function_exists('apache_request_headers')) {
            foreach (apache_request_headers() as $key => $value) {
                if (strtolower((string) $key) === 'authorization') {
                    $authHeader = (string) $value;
                    break;
                }
            }
        }
        $usesCookieToken = !empty($_COOKIE['g5_token']) && is_string($_COOKIE['g5_token']);
        $usesBearerToken = preg_match('/^Bearer\s+/i', $authHeader) === 1;
        if ($origin === '' && $referer === '' && $usesCookieToken && !$usesBearerToken) {
            Response::error('Origin required for cookie-authenticated write requests.', 403);
        }
    }
}

$G5_API_ENV = g5_api_read_env_file(__DIR__ . '/.env');

if (!function_exists('g5_api_config_value')) {
    function g5_api_config_value($key)
    {
        $key = (string) $key;
        if ($key === '') {
            return '';
        }

        if (defined($key)) {
            return trim((string) constant($key));
        }

        global $G5_API_ENV;
        if (isset($G5_API_ENV) && is_array($G5_API_ENV) && isset($G5_API_ENV[$key])) {
            return trim((string) $G5_API_ENV[$key]);
        }

        $value = getenv($key);
        return is_string($value) ? trim($value) : '';
    }
}

if (!function_exists('g5_api_configured')) {
    function g5_api_configured($key)
    {
        return g5_api_config_value($key) !== '';
    }
}

// ---------------------------------------------------------------------------
// CORS allowlist + 보안 헤더
//
// 이전: Access-Control-Allow-Origin: * — 쿠키 인증과 함께 쓰면 위험하므로
// 명시적 origin 매칭과 write-request Origin/Referer 검증으로 제한한다.
//
// 허용 도메인:
//   - 운영 웹 / API:   G5_URL, G5_WEBAPP_* 또는 G5_CORS_ALLOWED_ORIGINS 설정값
//   - 로컬 개발(Expo dev server localhost:8081 · 19006, Next dev localhost:3000 등):
//     API 자체가 루프백이나 사설망 주소로 돌 때만 허용한다. 운영 API 가 개발 Origin 을 믿으면,
//     SameSite=None 쿠키를 쓰는 배포에서 그 포트에 뜬 아무 로컬 웹앱이 로그인 쿠키로 API 를
//     읽고 쓸 수 있다. 운영 API 를 로컬 개발 서버에서 부르려면 G5_CORS_ALLOWED_ORIGINS 로 명시한다.
//   - 빌드 앱: file:// 또는 origin null (RN fetch 는 보통 Origin 미발송)
//
// 추가 도메인이 필요하면 G5_CORS_ALLOWED_ORIGINS 상수 (extend/ 에서 define) 로
// 콤마 구분 추가 가능.
// ---------------------------------------------------------------------------
// Public release default: trust no cross-origin domains unless configured.
$DEFAULT_ALLOWED_ORIGINS = [];
$g5_api_dev_origins = [
    'http://localhost',
    'http://localhost',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
    'http://localhost:8194',
    'http://127.0.0.1:8194',
];
$g5_api_request_host = strtolower(trim((string) parse_url(g5_api_current_origin(), PHP_URL_HOST), '[]'));
$g5_api_is_dev_host = $g5_api_request_host !== ''
    && (g5_api_is_local_origin('http://' . $g5_api_request_host)
        || preg_match('/^(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}$/', $g5_api_request_host) === 1);
if ($g5_api_is_dev_host) {
    $DEFAULT_ALLOWED_ORIGINS = array_merge($DEFAULT_ALLOWED_ORIGINS, $g5_api_dev_origins);
}
if (defined('G5_URL')) {
    g5_api_add_url_origin($DEFAULT_ALLOWED_ORIGINS, G5_URL);
}
// Prefer the theme-neutral webapp URLs (any active webapp theme defines them); fall back to
// the legacy nextjs25-prefixed names for installs whose theme has not been regenerated.
$g5_webapp_g5_url = defined('G5_WEBAPP_G5_URL')
    ? G5_WEBAPP_G5_URL
    : (defined('G5_NEXTJS25_G5_URL') ? G5_NEXTJS25_G5_URL : null);
if ($g5_webapp_g5_url !== null) {
    g5_api_add_url_origin($DEFAULT_ALLOWED_ORIGINS, $g5_webapp_g5_url);
}
$g5_webapp_app_url = defined('G5_WEBAPP_APP_URL')
    ? G5_WEBAPP_APP_URL
    : (defined('G5_NEXTJS25_APP_URL') ? G5_NEXTJS25_APP_URL : null);
if ($g5_webapp_app_url !== null) {
    g5_api_add_url_origin($DEFAULT_ALLOWED_ORIGINS, $g5_webapp_app_url);
}
$g5_webapp_api_url = defined('G5_WEBAPP_API_URL')
    ? G5_WEBAPP_API_URL
    : (defined('G5_NEXTJS25_API_URL') ? G5_NEXTJS25_API_URL : null);
if ($g5_webapp_api_url !== null) {
    g5_api_add_url_origin($DEFAULT_ALLOWED_ORIGINS, $g5_webapp_api_url);
}
$currentOrigin = g5_api_current_origin();
if ($currentOrigin !== '' && g5_api_is_local_origin($currentOrigin)) {
    $DEFAULT_ALLOWED_ORIGINS[] = $currentOrigin;
}
if (defined('G5_CORS_ALLOWED_ORIGINS') && G5_CORS_ALLOWED_ORIGINS) {
    g5_api_add_allowed_origins($DEFAULT_ALLOWED_ORIGINS, G5_CORS_ALLOWED_ORIGINS);
}
if (isset($G5_API_ENV['G5_CORS_ALLOWED_ORIGINS'])) {
    g5_api_add_allowed_origins($DEFAULT_ALLOWED_ORIGINS, $G5_API_ENV['G5_CORS_ALLOWED_ORIGINS']);
}
$G5_API_SERVER_ALLOWED_ORIGINS = getenv('G5_CORS_ALLOWED_ORIGINS');
if (is_string($G5_API_SERVER_ALLOWED_ORIGINS)) {
    g5_api_add_allowed_origins($DEFAULT_ALLOWED_ORIGINS, $G5_API_SERVER_ALLOWED_ORIGINS);
}
$DEFAULT_ALLOWED_ORIGINS = g5_api_normalize_allowed_origins($DEFAULT_ALLOWED_ORIGINS);

$requestOrigin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$normalizedRequestOrigin = g5_api_origin_from_url($requestOrigin);
if ($normalizedRequestOrigin !== '' && in_array($normalizedRequestOrigin, $DEFAULT_ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}
// Origin 헤더 없는 요청 (RN, curl) 은 CORS 검사 자체가 적용 안 되니 그대로 통과.

header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Device-Id, X-Device-Sig, Cache-Control, Pragma, X-Cart-Id, X-Client-Platform, X-App-Version');
header('Access-Control-Expose-Headers: X-Cart-Id');
header('Access-Control-Max-Age: 3600');

// ---------------------------------------------------------------------------
// 보안 헤더 — JSON API 라도 best-practice
// ---------------------------------------------------------------------------
function g5_api_defer_parent_basic_security_headers()
{
    if (defined('G5_API_DEFER_PARENT_BASIC_SECURITY_HEADERS')) {
        return (bool) G5_API_DEFER_PARENT_BASIC_SECURITY_HEADERS;
    }

    $server = isset($_SERVER['SERVER_SOFTWARE']) ? strtolower((string) $_SERVER['SERVER_SOFTWARE']) : '';
    if (strpos($server, 'apache') !== false && function_exists('apache_get_modules')) {
        $modules = array_map('strtolower', apache_get_modules());
        if (in_array('mod_headers', $modules, true)) {
            return true;
        }
    }

    // nginx 는 저절로 맡기지 않는다 — 예시 설정(docs/nginx)을 옮기지 않은 서버에서 헤더가 빠진다. 예시 설정은
    // fastcgi_hide_header 로 PHP 쪽 값을 지우고 다시 붙이므로 PHP 가 보내도 겹치지 않는다.
    return false;
}

function g5_api_defer_parent_referrer_policy()
{
    if (defined('G5_API_DEFER_PARENT_REFERRER_POLICY')) {
        return (bool) G5_API_DEFER_PARENT_REFERRER_POLICY;
    }

    return g5_api_defer_parent_basic_security_headers();
}

if (!g5_api_defer_parent_basic_security_headers()) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
}

if (!g5_api_defer_parent_referrer_policy()) {
    header('Referrer-Policy: no-referrer');
}
if (!g5_api_defer_parent_basic_security_headers()) {
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}
header('X-DNS-Prefetch-Control: off');
header('X-Permitted-Cross-Domain-Policies: none');
// HSTS — HTTPS 운영 환경에서만 의미가 있으므로 https 일 때만 송출
$g5_api_forwarded_scheme = function_exists('g5_nextjs_runtime_forwarded_proto')
    ? g5_nextjs_runtime_forwarded_proto()
    : '';
if ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || $g5_api_forwarded_scheme === 'https') {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
unset($g5_api_forwarded_scheme);

// Handle preflight OPTIONS requests immediately
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---------------------------------------------------------------------------
// JSON content type for every response
// ---------------------------------------------------------------------------
header('Content-Type: application/json; charset=utf-8');

// ---------------------------------------------------------------------------
// Determine the requested route
// ---------------------------------------------------------------------------
$route = '';

if (isset($_GET['_route'])) {
    $route = trim($_GET['_route'], '/');
} else {
    // Fallback: parse from REQUEST_URI (e.g. when running under PHP built-in server)
    $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME']));
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $uri = str_replace('\\', '/', $uri);

    if ($scriptDir !== '/' && strpos($uri, $scriptDir) === 0) {
        $uri = substr($uri, strlen($scriptDir));
    }
    $route = trim($uri, '/');

    // Remove "index.php" prefix if present
    if (strpos($route, 'index.php') === 0) {
        $route = trim(substr($route, strlen('index.php')), '/');
    }
}

// ---------------------------------------------------------------------------
// Load shared libraries
// ---------------------------------------------------------------------------
require_once __DIR__ . '/lib/DB.php';
require_once __DIR__ . '/lib/JWT.php';
require_once __DIR__ . '/lib/Response.php';
require_once __DIR__ . '/lib/Auth.php';
require_once __DIR__ . '/lib/Validator.php';
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/hooks.php'; // 그누보드 원본과 같은 훅(run_event / run_replace)을 API 동작에서도 부른다
require_once __DIR__ . '/lib/image-variants.php';
require_once __DIR__ . '/lib/editor-images.php';
require_once __DIR__ . '/lib/PushQueue.php';
// 알림의 단 하나의 문. plugin/webapp/notify 에 있고, 없으면(옛 배치) 아무 것도 안 하는 대역을 둔다.
if (is_file(dirname(__DIR__) . '/plugin/webapp/notify/Notify.php')) {
    require_once dirname(__DIR__) . '/plugin/webapp/notify/Notify.php';
    require_once dirname(__DIR__) . '/plugin/webapp/notify/Prefs.php'; // /v1/auth/preferences 가 쓴다
} elseif (!class_exists('Notify')) {
    class Notify { public static function emit() { return 0; } public static function emitMany() { return 0; } }
}
require_once __DIR__ . '/lib/DeviceSig.php';
require_once __DIR__ . '/lib/RefreshToken.php';
require_once __DIR__ . '/lib/Throttle.php';
require_once __DIR__ . '/lib/Schema.php';

// 확장 테이블이 갖춰졌는지 맞춘다. 표식이 최신이면 파일 하나 읽고 끝난다.
Schema::ensure();

// 주문 상태 푸시 패스(앱 SC-07) — 운영에 크론이 없어 API 요청 끝에 얹는다. 5분에 한 번,
// 락을 잡은 요청 하나만 돌고 응답은 먼저 내보낸다. 쇼핑몰이 없으면 아무 것도 안 한다.
register_shutdown_function(static function () {
    $helpers = __DIR__ . '/v1/shop/order_push_helpers.php';
    if (is_file($helpers)) {
        require_once $helpers;
        shop_api_order_push_tick();
    }
});

g5_api_enforce_write_origin($DEFAULT_ALLOWED_ORIGINS, $route);

// ---------------------------------------------------------------------------
// Global error / exception handlers – always return JSON
// ---------------------------------------------------------------------------
set_exception_handler(function ($e) {
    error_log(sprintf(
        '[api] Unhandled exception: %s: %s in %s:%d',
        get_class($e),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    ));

    // 설치가 덜 된 것은 서버 버그가 아니라 배포 누락이다. 무엇을 올려야 하는지 그대로 말한다.
    if ($e instanceof InvalidArgumentException && preg_match("/Unknown table key: ([a-z_]+)/", $e->getMessage(), $m)) {
        Response::error(Schema::describeMissingKey($m[1]), 500, array('code' => 'SCHEMA_KEY_MISSING', 'key' => $m[1]));
    }
    if (stripos($e->getMessage(), "doesn't exist") !== false || stripos($e->getMessage(), 'Base table or view not found') !== false) {
        Response::error(
            'A required database table is missing. Open adm/dbupgrade.php once, or check /api/v1/status for schema details.',
            500,
            array('code' => 'SCHEMA_TABLE_MISSING')
        );
    }

    Response::error('Internal server error.', 500);
});

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// ---------------------------------------------------------------------------
// Route the request
// ---------------------------------------------------------------------------
$segments = explode('/', $route);
$version  = isset($segments[0]) ? $segments[0] : '';

// `/api/g5/*` 는 `/api/v1/*` 의 동일-출처 별칭이다. Next.js 클라이언트는 dev 서버에서
// CORS 없이 원격 API 로 프록시하려고 /api/g5/* 를 호출하는데(next.config rewrite),
// 정적 PHP 호스트에서는 앱과 API 가 같은 출처라 프록시가 없다. 여기서 g5 → v1 로
// 정규화해 captcha/push/결제확인 등 /api/g5/* 호출이 그대로 동작하게 한다.
if ($version === 'g5') {
    $version = 'v1';
    $segments[0] = 'v1';
}

$resource = isset($segments[1]) ? $segments[1] : '';

if ($version !== 'v1') {
    Response::error('Invalid API version. Use /v1/...', 404);
}

$apiRoute     = $route;                          // e.g. "v1/posts/free/123"
$apiSegments  = array_slice($segments, 2);       // e.g. ["free", "123"]
$apiMethod    = strtoupper($_SERVER['REQUEST_METHOD']);

if (!function_exists('g5_api_send_deployment_status')) {
    function g5_api_send_deployment_status($apiMethod)
    {
        if ($apiMethod !== 'GET') {
            Response::error('Method not allowed.', 405);
        }

        $dbOk = false;

        try {
            $row = DB::fetch('SELECT 1 AS ok');
            $dbOk = isset($row['ok']) && (int) $row['ok'] === 1;
        } catch (Throwable $e) {
            $dbOk = false;
            error_log('[api/status] Database check failed: ' . $e->getMessage());
        }

        Response::success(array(
            'name' => 'gnuboard5-nextjs25-api',
            'version' => '0.1.0',
            'time' => date('c'),
            'features' => array(
                'recent_write_table_fallback' => true,
                'social_signup_bridge' => true,
                'social_existing_account_link' => true,
                'shop_seo_short_url' => true,
            ),
            'configuration' => array(
                // 비밀번호 재설정 · 메일 인증 메일의 링크 주소(NEXT_PUBLIC_APP_URL 또는 G5_DOMAIN)가 정해졌는지.
                // false 면 이 메일들은 나가지 않는다(Host 헤더로 만든 주소는 쓰지 않는다).
                'security_mail_link_configured' => function_exists('api_mail_link_base') && api_mail_link_base() !== '',
            ),
            'database' => array(
                'ok' => $dbOk,
                // false 면 이름 잠금을 하나만 드는 옛 DB(MySQL 5.7.5 · MariaDB 10.0.2 미만) — 주문 · 포인트 경합 방어가 약해진다.
                'multiple_named_locks' => $dbOk ? DB::supportsMultipleNamedLocks() : null,
            ),
            // 로그인에 필요한 확장 테이블이 갖춰졌는지. 파일만 올리고 dbupgrade 를 안 돌린
            // 설치본을 여기서 바로 가려낸다. 부팅의 ensure() 가 한 번 만들어 두므로 보통 ok:true.
            'schema' => Schema::ensure(),
        ));
    }
}

if ($resource === 'status') {
    g5_api_send_deployment_status($apiMethod);
}

// Map resource name → handler file
$handlers = [
    'auth'          => __DIR__ . '/v1/auth.php',
    'boards'        => __DIR__ . '/v1/boards.php',
    'board-files'   => __DIR__ . '/v1/board-files.php',
    'editor-images' => __DIR__ . '/v1/editor-images.php',
    'posts'         => __DIR__ . '/v1/posts.php',
    'post-transfer' => __DIR__ . '/v1/post-transfer.php',
    'comments'      => __DIR__ . '/v1/comments.php',
    'members'       => __DIR__ . '/v1/members.php',
    'memos'         => __DIR__ . '/v1/memos.php',
    'scraps'        => __DIR__ . '/v1/scraps.php',
    'faqs'          => __DIR__ . '/v1/faqs.php',
    'faq'           => __DIR__ . '/v1/faqs.php',
    'polls'         => __DIR__ . '/v1/polls.php',
    'poll'          => __DIR__ . '/v1/polls.php',
    'qas'           => __DIR__ . '/v1/qas.php',
    'qa'            => __DIR__ . '/v1/qas.php',
    'recent'        => __DIR__ . '/v1/recent.php',
    'push-tokens'   => __DIR__ . '/v1/push-tokens.php',
    'devices'       => __DIR__ . '/v1/devices.php',
    'shop'          => __DIR__ . '/v1/shop/router.php',
    'print'         => __DIR__ . '/v1/print/router.php',
    'upload'        => __DIR__ . '/v1/upload.php',
    'search'        => __DIR__ . '/v1/search.php',
    'settings'      => __DIR__ . '/v1/settings.php',
    'status'        => __DIR__ . '/v1/status.php',
    'menus'         => __DIR__ . '/v1/menus.php',
    'content'       => __DIR__ . '/v1/content.php',
    'register-terms' => __DIR__ . '/v1/register-terms.php',
    'notifications' => __DIR__ . '/v1/notifications.php',
    'captcha'       => __DIR__ . '/v1/captcha.php',
    'reports'       => __DIR__ . '/v1/reports.php',
    'blocks'        => __DIR__ . '/v1/blocks.php',
    'account-deletion-requests' => __DIR__ . '/v1/account-deletion-requests.php',
    'maintenance'   => __DIR__ . '/v1/maintenance.php', // 화면이 다 뜬 뒤의 백그라운드 신호 — 주기 작업
];

if (!$resource || !isset($handlers[$resource])) {
    Response::error('Unknown resource: ' . $resource, 404);
}

if (!function_exists('g5_api_session_free_read')) {
    /**
     * 세션을 읽기만 하는 공개 GET 인지. 아래 목록은 핸들러를 하나씩 확인해 세션에 쓰지 않는 것만 담았다.
     *
     * 세션을 쓰는 GET 은 넣지 않는다 — 장바구니(shop/cart 는 장바구니 id 를 세션에 남긴다), 글 보기
     * (조회수 세션), 캡차, 소셜·본인인증, 주문·영수증 조회. 새 경로를 넣을 때는 그 핸들러와 핸들러가
     * 부르는 함수가 set_session · $_SESSION 쓰기 · check_rate_limit · get_write_token ·
     * generate_mb_key · set_cart_id 를 부르지 않는지 먼저 확인한다. 잠금을 푼 뒤의 쓰기는 오류 없이
     * 사라진다.
     */
    function g5_api_session_free_read($method, $resource, array $segments)
    {
        if ($method !== 'GET' && $method !== 'HEAD') {
            return false;
        }

        $count = count($segments);
        $first = $count > 0 ? (string) $segments[0] : '';
        $second = $count > 1 ? (string) $segments[1] : '';

        switch ($resource) {
            case 'boards':
                // 게시판 목록 · 게시판 하나 · 글 목록. 글 하나와 첨부 정리는 다른 경로다.
                return $count <= 1 || ($count === 2 && $second === 'posts');
            case 'board-files':
            case 'faqs':
            case 'faq':
            case 'menus':
            case 'recent':
            case 'settings':
                return true;
            case 'polls':
            case 'poll':
                return $count === 1 && $first === 'current';
            case 'search':
                return $count === 1 && $first === 'popular';
            case 'auth':
                return $count === 2 && $first === 'social' && $second === 'providers';
            case 'shop':
                if (in_array($first, array('banners', 'categories', 'popups', 'images', 'products', 'reviews'), true)) {
                    return true;
                }
                return $count === 2 && $first === 'payment' && $second === 'config';
        }

        return false;
    }
}

// 세션을 읽기만 하는 요청은 핸들러에 들어가기 전에 세션 잠금을 푼다.
//
// PHP 의 파일 세션은 요청이 끝날 때까지 세션 파일을 잠근다. 그래서 한 사람의 화면이 API 를
// 한꺼번에 여러 개 부르면 서버에서는 하나씩 차례로 돈다(홈 첫 화면의 읽기 12개: 같은 세션
// 약 265ms, 세션을 나눴을 때 약 68ms). 잠금을 풀어도 $_SESSION 은 그대로 읽힌다.
//
// 세션이 없거나(CLI · 세션을 안 여는 설치) 이미 닫혔으면 아무것도 하지 않는다.
// 끄려면 extend/ 에서 define('G5_API_EARLY_SESSION_CLOSE', false);
if ((!defined('G5_API_EARLY_SESSION_CLOSE') || G5_API_EARLY_SESSION_CLOSE)
    && session_status() === PHP_SESSION_ACTIVE
    && g5_api_session_free_read($apiMethod, $resource, $apiSegments)) {
    session_write_close();
}

// Pass the full route and remaining segments to the handler
$handlerFile = $handlers[$resource];

if (!file_exists($handlerFile)) {
    Response::error('Handler not implemented yet: ' . $resource, 501);
}

require $handlerFile;
