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
    $subject = $mbId !== '' ? 'mb:' . $mbId : 'ip:' . api_rate_limit_ip();
    // 프록시 뒤 방문자 키("프록시>방문자")는 지어낼 수도 있으니, 그 프록시 주소 전체로도 10배 상한을 둔다.
    $message = strpos($subject, '>') !== false
        ? Throttle::checkMemberQuota($bucket . 'px', strstr($subject, '>', true), $perMinute * 10, $perHour * 10)
        : null;
    $message = $message ?? Throttle::checkMemberQuota($bucket, $subject, $perMinute, $perHour);
    if ($message !== null) {
        Response::error($message, 429, ['code' => 'RATE_LIMITED']);
    }
}

/**
 * 앞단 프록시로 지정한 주소(G5_TRUSTED_PROXY_REMOTE_ADDRS — 상수 또는 환경변수, 쉼표로 IP 나 CIDR).
 * 손님 IP(X-Forwarded-For)를 믿는 데는 루프백도 저절로 넣지 않는다 — 같은 서버의 Next 서버가 바깥에 열려 있으면
 * 받은 X-Forwarded-For 를 그대로 넘겨, 누구나 PG 입금통보 IP 검사를 통과하는 주소를 적어 보낼 수 있다.
 */
function api_trusted_proxy_list(): array
{
    $configured = defined('G5_TRUSTED_PROXY_REMOTE_ADDRS') ? (string) G5_TRUSTED_PROXY_REMOTE_ADDRS : (string) (getenv('G5_TRUSTED_PROXY_REMOTE_ADDRS') ?: '');
    $list = [];
    foreach (explode(',', $configured) as $value) {
        $value = trim(trim($value), '[]');
        if ($value !== '') {
            $list[] = $value;
        }
    }
    return $list;
}

/** $ip 가 목록(IP 또는 CIDR)에 드는가 — IPv4 · IPv6. */
function api_ip_in_list(string $ip, array $list): bool
{
    $packed = @inet_pton($ip);
    if ($packed === false) {
        return false;
    }
    foreach ($list as $entry) {
        $parts = explode('/', $entry, 2);
        $net = @inet_pton($parts[0]);
        if ($net === false || strlen($net) !== strlen($packed)) {
            continue;
        }
        // 비트 수는 1 ~ 주소 비트 수의 숫자만 — "10.0.0.0/" · "/abc" · "/0" 같은 오타가 모든 주소를 프록시로 보게 하지 않는다.
        if (isset($parts[1]) && preg_match('/^[0-9]{1,3}$/', $parts[1]) !== 1) {
            continue;
        }
        $bits = isset($parts[1]) ? (int) $parts[1] : strlen($packed) * 8;
        if ($bits < 1 || $bits > strlen($packed) * 8) {
            continue;
        }
        $bytes = intdiv($bits, 8);
        $rest = $bits % 8;
        if (substr($packed, 0, $bytes) !== substr($net, 0, $bytes)) {
            continue;
        }
        if ($rest === 0 || ((ord($packed[$bytes]) ^ ord($net[$bytes])) & (0xFF << (8 - $rest)) & 0xFF) === 0) {
            return true;
        }
    }
    return false;
}

/** X-Forwarded-For 의 주소들(왼쪽 → 오른쪽), 형식이 맞는 것만. */
function api_forwarded_for_chain(): array
{
    $chain = [];
    foreach (explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')) as $value) {
        $value = trim(trim($value), '[]');
        if ($value !== '' && filter_var($value, FILTER_VALIDATE_IP) !== false) {
            $chain[] = $value;
        }
    }
    return $chain;
}

/**
 * 실제 손님 IP — REMOTE_ADDR 가 지정한 프록시일 때만 X-Forwarded-For 를 오른쪽부터 보며, 지정한 프록시가 아닌 첫 주소를 쓴다
 * (프록시가 손님 주소를 뒤에 덧붙이므로 왼쪽 값은 손님이 지어낼 수 있다). 그 밖에는 REMOTE_ADDR. PG 입금통보 IP 검사가 쓴다.
 */
function api_client_ip(): string
{
    $remote = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''), '[]');
    $trusted = api_trusted_proxy_list();
    if ($remote === '' || $trusted === [] || !api_ip_in_list($remote, $trusted)) {
        return $remote;
    }
    foreach (array_reverse(api_forwarded_for_chain()) as $hop) {
        if (!api_ip_in_list($hop, $trusted)) {
            return $hop;
        }
    }
    return $remote;
}

/**
 * 횟수 한도를 셀 주소 — api_client_ip() 에, 지정하지 않았더라도 이 서버 · 사설망에서 온 요청(같은 서버의 Next 서버 ·
 * nginx 를 거친 요청)이면 X-Forwarded-For 의 마지막 주소를 덧붙여 손님마다 따로 센다. 그러지 않으면 모든 손님이 프록시
 * 주소 하나로 묶여 한도를 나눠 쓴다. 이 값은 지어낼 수도 있어 한도에만 쓴다(최악이어도 한도가 느슨해질 뿐이다).
 */
function api_rate_limit_ip(): string
{
    $ip = api_client_ip();
    $remote = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''), '[]');
    if ($ip !== $remote || $remote === '') {
        return $ip;
    }
    $internal = filter_var($remote, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    $chain = api_forwarded_for_chain();
    return $internal && $chain !== [] ? $remote . '>' . end($chain) : $remote;
}
