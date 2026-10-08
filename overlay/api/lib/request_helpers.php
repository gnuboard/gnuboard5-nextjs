<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * Convenience: get the current page from query params.
 *
 * @param  int $default
 * @return int
 */
function get_page_param($default = 1)
{
    $page = isset($_GET['page']) ? (int) $_GET['page'] : $default;
    return max(1, $page);
}

/**
 * Convenience: get the per_page / limit from query params.
 *
 * @param  int $default
 * @param  int $max
 * @return int
 */
function get_per_page_param($default = 20, $max = 100)
{
    $perPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : $default;
    return max(1, min($perPage, $max));
}

/**
 * Safely escape a string for SQL queries using Gnuboard5's connection.
 *
 * Kept for backward compatibility with non-SQL callers.
 * New SQL code should use DB::fetch() / DB::execute() with ? placeholders instead.
 *
 * @param  string $str
 * @return string
 */
function api_escape($str)
{
    if (function_exists('sql_real_escape_string')) {
        return sql_real_escape_string($str);
    }

    throw new RuntimeException('sql_real_escape_string is required for api_escape(). Use DB placeholders instead.');
}

/**
 * Sanitize a board table name (alphanumeric + underscore only).
 *
 * @param  string $bo_table
 * @return string
 */
function api_sanitize_bo_table($bo_table)
{
    return preg_replace('/[^a-zA-Z0-9_]/', '', $bo_table);
}

function api_public_origin_from_url($url)
{
    $url = trim((string) $url);
    if ($url === '') {
        return '';
    }

    $parts = parse_url($url);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }

    $scheme = strtolower((string) $parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        return '';
    }

    $host = strtolower(trim((string) $parts['host']));
    $host = trim($host, '[]');
    if ($host === '' || preg_match('/[\/\\\\\s\x00-\x1F\x7F]/', $host)) {
        return '';
    }

    $hostForUrl = strpos($host, ':') !== false ? '[' . $host . ']' : $host;
    $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
    return $scheme . '://' . $hostForUrl . $port;
}

function api_public_add_configured_origins(array &$origins, $value): void
{
    foreach (explode(',', (string) $value) as $candidate) {
        $origin = api_public_origin_from_url($candidate);
        if ($origin !== '') {
            $origins[] = $origin;
        }
    }
}

function api_public_configured_origins(): array
{
    $origins = array();
    foreach (array(
        'G5_WEBAPP_APP_URL',
        'G5_WEBAPP_G5_URL',
        'G5_WEBAPP_API_URL',
        'G5_NEXTJS25_APP_URL',
        'G5_NEXTJS25_G5_URL',
        'G5_NEXTJS25_API_URL',
        'G5_URL',
    ) as $constantName) {
        if (defined($constantName)) {
            api_public_add_configured_origins($origins, constant($constantName));
        }
    }

    if (defined('G5_CORS_ALLOWED_ORIGINS')) {
        api_public_add_configured_origins($origins, G5_CORS_ALLOWED_ORIGINS);
    }

    global $G5_API_ENV;
    if (isset($G5_API_ENV['G5_CORS_ALLOWED_ORIGINS'])) {
        api_public_add_configured_origins($origins, $G5_API_ENV['G5_CORS_ALLOWED_ORIGINS']);
    }

    $envOrigins = getenv('G5_CORS_ALLOWED_ORIGINS');
    if (is_string($envOrigins) && $envOrigins !== '') {
        api_public_add_configured_origins($origins, $envOrigins);
    }

    return array_values(array_unique($origins));
}

function api_public_is_local_origin($origin): bool
{
    $host = parse_url((string) $origin, PHP_URL_HOST);
    $host = strtolower(trim((string) $host, '[]'));

    // 127.0.0.1.attacker.example 같은 호스트가 접두사 비교로 통과하지 않게 IPv4 루프백 전체 형식만 받는다.
    return $host === 'localhost'
        || $host === '::1'
        || preg_match('/^127(\.\d{1,3}){3}$/', $host) === 1;
}

function api_public_origin_allowed($origin): bool
{
    $origin = api_public_origin_from_url($origin);
    if ($origin === '') {
        return false;
    }

    return api_public_is_local_origin($origin)
        || in_array($origin, api_public_configured_origins(), true);
}

function api_public_request_origin(bool $allowForwardedHost = false): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $forwardedScheme = function_exists('g5_nextjs_runtime_forwarded_proto')
        ? g5_nextjs_runtime_forwarded_proto()
        : '';
    if ($forwardedScheme !== '') {
        $scheme = $forwardedScheme;
    }

    $host = '';
    if (
        $allowForwardedHost
        && function_exists('g5_nextjs_runtime_is_trusted_proxy_request')
        && g5_nextjs_runtime_is_trusted_proxy_request()
        && !empty($_SERVER['HTTP_X_FORWARDED_HOST'])
    ) {
        $host = trim(explode(',', (string) $_SERVER['HTTP_X_FORWARDED_HOST'])[0]);
    }

    if ($host === '') {
        $host = isset($_SERVER['HTTP_HOST']) ? trim((string) $_SERVER['HTTP_HOST']) : '';
    }

    if ($host === '' || preg_match('/[\/\\\\\s\x00-\x1F\x7F]/', $host)) {
        return '';
    }

    $origin = api_public_origin_from_url($scheme . '://' . $host);
    return api_public_origin_allowed($origin) ? $origin : '';
}

/**
 * 쓰기 진입점의 횟수 한도 — 회원이면 회원 id 로, 아니면 발신 IP 로 센다(Throttle::checkMemberQuota). 넘으면 429 로 끝낸다.
 * 사람이 다시 시도하는 속도 · 오프라인 큐가 한꺼번에 올리는 양보다 넉넉하게 잡아, 끝없는 생성(메일 · 푸시 폭주, 행 적재)만 막는다.
 */
function api_require_write_quota(string $bucket, $member, int $perMinute, int $perHour): void
{
    $mbId = is_array($member) ? trim((string) ($member['mb_id'] ?? '')) : '';
    $subject = $mbId !== '' ? 'mb:' . $mbId : 'ip:' . (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $message = Throttle::checkMemberQuota($bucket, $subject, $perMinute, $perHour);
    if ($message !== null) {
        Response::error($message, 429, ['code' => 'RATE_LIMITED']);
    }
}
