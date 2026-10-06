<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function nextjs_default_origin_from_url($url)
{
    $parts = parse_url((string) $url);
    if (empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }

    $origin = strtolower($parts['scheme']) . '://' . $parts['host'];
    if (!empty($parts['port'])) {
        $origin .= ':' . $parts['port'];
    }

    return $origin;
}

function nextjs_default_is_https_request()
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }

    return g5_nextjs_runtime_forwarded_proto() === 'https';
}

function nextjs_default_csp_nonce()
{
    static $nonce = '';

    if ($nonce !== '') {
        return $nonce;
    }

    if (!function_exists('random_bytes')) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: text/plain; charset=utf-8');
        }
        exit('Unable to generate a secure CSP nonce.');
    }

    try {
        $nonce = base64_encode(random_bytes(16));
    } catch (Exception $exception) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: text/plain; charset=utf-8');
        }
        exit('Unable to generate a secure CSP nonce.');
    }

    return $nonce;
}

function nextjs_default_add_script_nonce($html)
{
    $nonce = htmlspecialchars(nextjs_default_csp_nonce(), ENT_QUOTES, 'UTF-8');

    return preg_replace('/<script\b(?![^>]*\bnonce=)/i', '<script nonce="' . $nonce . '"', $html);
}

function nextjs_default_csp_source_from_url($url)
{
    $parts = parse_url((string) $url);
    if (empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }

    $scheme = strtolower((string) $parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        return '';
    }

    $host = strtolower(trim((string) $parts['host'], '[]'));
    if ($host === '' || !preg_match('/^[0-9a-z.-]+$/i', $host)) {
        return '';
    }

    $source = $scheme . '://' . $host;
    if (isset($parts['port']) && (int) $parts['port'] > 0) {
        $source .= ':' . (int) $parts['port'];
    }

    return $source;
}

function nextjs_default_csp_image_sources_from_config()
{
    $values = array();
    foreach (array('G5_NEXTJS_DEFAULT_IMAGE_HOSTS', 'NEXT_IMAGE_EXTRA_HOSTS') as $name) {
        if (defined($name)) {
            $values[] = (string) constant($name);
        }

        $env_value = getenv($name);
        if (is_string($env_value)) {
            $values[] = $env_value;
        }
    }

    $sources = array();
    foreach ($values as $value) {
        foreach (preg_split('/[\s,]+/', (string) $value, -1, PREG_SPLIT_NO_EMPTY) as $item) {
            $item = trim((string) $item);
            if ($item === '') {
                continue;
            }

            if (preg_match('#^https?://#i', $item)) {
                $source = nextjs_default_csp_source_from_url($item);
            } else {
                $host = strtolower(trim($item, '[]'));
                $host = preg_replace('/:\d+$/', '', $host);
                $source = $host !== '' && preg_match('/^[0-9a-z.-]+$/i', $host) ? 'https://' . $host : '';
            }

            if ($source !== '') {
                $sources[] = $source;
            }
        }
    }

    return array_values(array_unique($sources));
}

function nextjs_default_extract_csp_image_sources_from_html($html)
{
    $html = (string) $html;
    if ($html === '') {
        return array();
    }

    $urls = array();
    if (preg_match_all('/\s(?:src|data-src)=["\']([^"\']+)["\']/i', $html, $matches)) {
        foreach ($matches[1] as $url) {
            $urls[] = html_entity_decode((string) $url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }

    if (preg_match_all('/\ssrcset=["\']([^"\']+)["\']/i', $html, $matches)) {
        foreach ($matches[1] as $srcset) {
            foreach (explode(',', (string) $srcset) as $candidate) {
                $parts = preg_split('/\s+/', trim($candidate));
                if (!empty($parts[0])) {
                    $urls[] = html_entity_decode((string) $parts[0], ENT_QUOTES | ENT_HTML5, 'UTF-8');
                }
            }
        }
    }

    $sources = array();
    foreach ($urls as $url) {
        $source = nextjs_default_csp_source_from_url($url);
        if ($source !== '') {
            $sources[] = $source;
        }
    }

    return array_values(array_unique($sources));
}

function nextjs_default_current_board_post_image_sources()
{
    global $g5;

    if (
        !function_exists('sql_fetch') ||
        !function_exists('nextjs_default_current_board_post_route_params') ||
        !function_exists('nextjs_default_sql_escape_value')
    ) {
        return array();
    }

    $params = nextjs_default_current_board_post_route_params();
    if (!$params) {
        return array();
    }

    list($bo_table, $wr_id) = $params;
    if (!preg_match('/^[0-9A-Za-z_]+$/', $bo_table) || $wr_id === '') {
        return array();
    }

    $write_prefix = isset($g5['write_prefix']) ? (string) $g5['write_prefix'] : '';
    $board_table = isset($g5['board_table']) ? (string) $g5['board_table'] : '';
    if ($write_prefix === '' || $board_table === '') {
        return array();
    }

    $escaped_bo_table = nextjs_default_sql_escape_value($bo_table);
    $escaped_wr_id = nextjs_default_sql_escape_value($wr_id);
    if ($escaped_bo_table === null || $escaped_wr_id === null) {
        return array();
    }

    // 비회원이 볼 수 있는 게시판의 글만 본문을 읽는다 — 글 메타데이터와 같은 판정(읽기 · 목록 레벨, 비밀글 전용,
    // 그룹 접근)을 함께 써서, 한쪽만 고쳐 다른 쪽으로 새는 일이 없게(그룹 게시판 글의 이미지 주소가 헤더로 나갔다).
    if (!function_exists('nextjs_default_board_allows_public_runtime_metadata')
        || !nextjs_default_board_allows_public_runtime_metadata($bo_table)) {
        return array();
    }

    $write_table = $write_prefix . $bo_table;
    $where = preg_match('/^[0-9]+$/', $wr_id)
        ? "wr_id = '{$escaped_wr_id}'"
        : "wr_seo_title = '{$escaped_wr_id}'";

    $post = sql_fetch(
        " select wr_content, wr_option from `{$write_table}` where wr_is_comment = 0 and {$where} limit 1 ",
        false
    );

    if (!is_array($post) || strpos((string) ($post['wr_option'] ?? ''), 'secret') !== false) {
        return array();
    }

    return nextjs_default_extract_csp_image_sources_from_html($post['wr_content'] ?? '');
}

function nextjs_default_current_product_image_sources()
{
    global $g5;

    if (
        !function_exists('sql_fetch') ||
        !function_exists('nextjs_default_current_product_route_param') ||
        !function_exists('nextjs_default_sql_escape_value')
    ) {
        return array();
    }

    $it_id = nextjs_default_current_product_route_param();
    if ($it_id === null || $it_id === '') {
        return array();
    }

    $table = isset($g5['g5_shop_item_table']) ? (string) $g5['g5_shop_item_table'] : '';
    $escaped = nextjs_default_sql_escape_value($it_id);
    $seo_candidate = function_exists('generate_seo_title') ? generate_seo_title($it_id) : $it_id;
    $escaped_seo = nextjs_default_sql_escape_value($seo_candidate);
    if ($table === '' || $escaped === null || $escaped_seo === null) {
        return array();
    }

    $product = sql_fetch(
        " select it_explan, it_mobile_explan from `{$table}` where it_use = '1' and (it_id = '{$escaped}' or it_seo_title = '{$escaped}' or it_seo_title = '{$escaped_seo}') order by it_id desc limit 1 ",
        false
    );

    if (!is_array($product)) {
        return array();
    }

    return nextjs_default_extract_csp_image_sources_from_html(
        (string) ($product['it_explan'] ?? '') . "\n" . (string) ($product['it_mobile_explan'] ?? '')
    );
}

function nextjs_default_current_content_image_sources()
{
    global $g5;

    if (!function_exists('sql_fetch') || !function_exists('nextjs_default_sql_escape_value')) {
        return array();
    }

    $relative = function_exists('nextjs_default_static_route_relative_path') ? nextjs_default_static_route_relative_path() : '';
    $match = array();
    if (!preg_match('#^(?:shop/)?content/([^/]+)$#', $relative, $match)) {
        return array();
    }

    $table = isset($g5['content_table']) ? (string) $g5['content_table'] : '';
    $escaped = nextjs_default_sql_escape_value(rawurldecode($match[1]));
    if ($table === '' || $escaped === null) {
        return array();
    }

    $content = sql_fetch(
        " select co_content from `{$table}` where co_id = '{$escaped}' or co_seo_title = '{$escaped}' limit 1 ",
        false
    );

    return is_array($content) ? nextjs_default_extract_csp_image_sources_from_html($content['co_content'] ?? '') : array();
}

function nextjs_default_dynamic_csp_image_sources()
{
    return array_values(array_unique(array_merge(
        nextjs_default_csp_image_sources_from_config(),
        nextjs_default_current_board_post_image_sources(),
        nextjs_default_current_product_image_sources(),
        nextjs_default_current_content_image_sources()
    )));
}

function nextjs_default_content_security_policy()
{
    $connect_sources = array("'self'");
    foreach (array(nextjs_default_api_url(), nextjs_default_g5_url(), nextjs_default_theme_url()) as $url) {
        $origin = nextjs_default_origin_from_url($url);
        if ($origin !== '') {
            $connect_sources[] = $origin;
        }
    }
    $connect_sources = array_values(array_unique($connect_sources));
    $kcp_sources = 'https://testpay.kcp.co.kr https://*.kcp.co.kr';
    $inicis_sources = 'https://stdpay.inicis.com https://stgstdpay.inicis.com https://*.inicis.com';
    $nicepay_sources = 'https://web.nicepay.co.kr https://*.nicepay.co.kr';
    $toss_sources = 'https://*.tosspayments.com';
    $pg_sources = $toss_sources . ' ' . $kcp_sources . ' ' . $inicis_sources . ' ' . $nicepay_sources;
    $postcode_script_sources = 'https://t1.daumcdn.net';
    /*
     * 우편번호 찾기는 새 창을 열고 그 안에 postcode.map.kakao.com 을 <iframe> 으로 넣는다.
     * 그 창은 우리가 window.open 으로 만든 것이라 이 CSP 를 그대로 물려받는다 — frame-src 에
     * 없으면 iframe 이 막혀 빈 창에 깨진 문서 아이콘만 남는다(주문서 "우편번호" 단추).
     * nextjs/next.config.ts 와 nextjs/scripts/static-security-headers.mjs 에는 이미 같은 값이
     * 있었고 PHP 브리지에만 빠져 있었다. 셋을 같이 고칠 것.
     */
    $postcode_frame_sources = 'https://postcode.map.daum.net https://postcode.map.kakao.com';
    /*
     * http 로 서비스하는 설치본(로컬 개발, 사내망)에서는 위젯이 제 주소의 규약을 따라 http 로
     * iframe 을 건다. https 만 허용하면 그런 설치본에서 막히므로 같이 열어 준다. https 로
     * 서비스하는 사이트에서는 이 줄이 아무것도 더하지 않는다.
     */
    if (strpos(strtolower((string) nextjs_default_g5_url()), 'http://') === 0) {
        $postcode_frame_sources .= ' http://postcode.map.daum.net http://postcode.map.kakao.com';
    }
    $script_sources = "'self' 'nonce-" . nextjs_default_csp_nonce() . "' https://js.tosspayments.com " . $pg_sources . ' ' . $postcode_script_sources;
    $image_sources = array_values(array_unique(array_merge(array("'self'", 'data:', 'blob:', 'https:'), nextjs_default_dynamic_csp_image_sources())));
    $connect_sources = array_values(array_unique(array_merge(
        $connect_sources,
        explode(' ', $pg_sources),
        array('https://js.tosspayments.com', 'https://postcode.map.daum.net', 'https://postcode.map.kakao.com')
    )));

    return implode('; ', array(
        "default-src 'self'",
        'script-src ' . $script_sources,
        "style-src 'self' 'unsafe-inline' " . $inicis_sources,
        'img-src ' . implode(' ', $image_sources),
        "font-src 'self' data: https:",
        'connect-src ' . implode(' ', $connect_sources),
        'frame-src ' . $pg_sources . ' ' . $postcode_frame_sources,
        "manifest-src 'self'",
        "worker-src 'self' blob:",
        "base-uri 'self'",
        "form-action 'self' " . $pg_sources,
        "object-src 'none'",
        "frame-ancestors 'none'",
    ));
}

function nextjs_default_send_public_asset_security_headers($asset)
{
    nextjs_default_send_security_headers(false);
}

function nextjs_default_is_compressible_content_type($content_type)
{
    $content_type = strtolower((string) $content_type);
    foreach (array('text/', 'application/javascript', 'application/json', 'application/manifest+json', 'application/xml', 'image/svg+xml') as $needle) {
        if (strpos($content_type, $needle) !== false) {
            return true;
        }
    }

    return false;
}

function nextjs_default_client_accepts_gzip()
{
    if (headers_sent() || !function_exists('gzencode')) {
        return false;
    }

    $zlib_output = strtolower((string) ini_get('zlib.output_compression'));
    if ($zlib_output !== '' && $zlib_output !== '0' && $zlib_output !== 'off') {
        return false;
    }

    $accept_encoding = isset($_SERVER['HTTP_ACCEPT_ENCODING']) ? (string) $_SERVER['HTTP_ACCEPT_ENCODING'] : '';

    return preg_match('/(?:^|,|\s)gzip(?:,|;|\s|$)/i', $accept_encoding) === 1;
}

function nextjs_default_send_response_body($body, $content_type, $allow_compression = true)
{
    $body = (string) $body;
    $compressible = $allow_compression && strlen($body) >= 1024 && nextjs_default_is_compressible_content_type($content_type);

    if ($compressible && !headers_sent()) {
        header('Vary: Accept-Encoding', false);
    }

    if ($compressible && nextjs_default_client_accepts_gzip()) {
        $encoded = gzencode($body, 6);
        if ($encoded !== false) {
            header('Content-Encoding: gzip');
            header('Content-Length: ' . strlen($encoded));
            echo $encoded;
            return;
        }
    }

    if (!headers_sent()) {
        header('Content-Length: ' . strlen($body));
    }
    echo $body;
}

function nextjs_default_send_file_response($file_path, $content_type, $allow_compression = true)
{
    $compressible = $allow_compression && nextjs_default_is_compressible_content_type($content_type);
    if ($compressible) {
        $body = file_get_contents($file_path);
        if ($body !== false) {
            nextjs_default_send_response_body($body, $content_type, true);
            return;
        }
    }

    if (!headers_sent()) {
        header('Content-Length: ' . filesize($file_path));
    }
    readfile($file_path);
}

function nextjs_default_clear_static_asset_cookie_headers()
{
    if (!headers_sent() && function_exists('header_remove')) {
        header_remove('Set-Cookie');
    }
}

function nextjs_default_board_rss_allowed($bo_table)
{
    global $g5;

    $bo_table = (string) $bo_table;
    if (!preg_match('/^[0-9A-Za-z_]+$/', $bo_table) || !function_exists('sql_fetch')) {
        return null;
    }

    $table = isset($g5['board_table']) ? (string) $g5['board_table'] : '';
    if ($table === '') {
        return null;
    }

    $board = sql_fetch(
        " select bo_use_rss_view from `{$table}` where bo_table = '{$bo_table}' limit 1 ",
        false
    );

    if (!is_array($board) || !array_key_exists('bo_use_rss_view', $board)) {
        return null;
    }

    return (int) $board['bo_use_rss_view'] > 0;
}

function nextjs_default_deny_legacy_rss_route()
{
    http_response_code(403);
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
    header('Pragma: no-cache');
    header('Expires: 0');
    $content_type = 'text/plain; charset=utf-8';
    header('Content-Type: ' . $content_type);
    nextjs_default_send_response_body('RSS 보기가 금지되어 있습니다.', $content_type, false);
    exit;
}

function nextjs_default_require_legacy_rss_route_allowed($bo_table)
{
    if (nextjs_default_board_rss_allowed($bo_table) === false) {
        nextjs_default_deny_legacy_rss_route();
    }
}

function nextjs_default_defer_parent_basic_security_headers()
{
    if (defined('G5_NEXTJS_DEFAULT_DEFER_PARENT_BASIC_SECURITY_HEADERS')) {
        return (bool) G5_NEXTJS_DEFAULT_DEFER_PARENT_BASIC_SECURITY_HEADERS;
    }

    $server = isset($_SERVER['SERVER_SOFTWARE']) ? strtolower((string) $_SERVER['SERVER_SOFTWARE']) : '';

    return strpos($server, 'nginx') !== false;
}

function nextjs_default_send_security_headers($include_csp = true)
{
    if (headers_sent()) {
        return;
    }

    if (!nextjs_default_defer_parent_basic_security_headers()) {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
    }

    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('X-DNS-Prefetch-Control: on');

    if ($include_csp) {
        header('Content-Security-Policy: ' . nextjs_default_content_security_policy());
    }

    if (nextjs_default_should_noindex_route()) {
        header('X-Robots-Tag: noindex, nofollow');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
        header('Pragma: no-cache');
        header('Expires: 0');
    }

    if (nextjs_default_is_https_request()) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}

function nextjs_default_send_public_revalidate_headers()
{
    if (!nextjs_default_should_noindex_route()) {
        header('Cache-Control: public, max-age=0, must-revalidate');
        header('Expires: 0');
    }
}
