<?php
/**
 * Gnuboard5 REST API - Common Helper Functions
 *
 * Utility functions shared across all API handlers.
 */
require_once __DIR__ . '/request_helpers.php';

/**
 * Return the current HTTP request method in uppercase.
 *
 * @return string  GET, POST, PUT, PATCH, DELETE, OPTIONS …
 */
function get_request_method()
{
    return strtoupper($_SERVER['REQUEST_METHOD']);
}

/**
 * Parse and return the JSON request body as an associative array.
 *
 * Falls back to $_POST when the content-type is form-encoded.
 *
 * @return array
 */
function get_request_body()
{
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';

    // JSON body
    if (strpos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    // Form-encoded or multipart
    if (!empty($_POST)) {
        return $_POST;
    }

    // Last resort: try to parse raw input as JSON anyway
    $raw = file_get_contents('php://input');
    if ($raw) {
        $data = json_decode($raw, true);
        if (is_array($data)) {
            return $data;
        }
    }

    return [];
}

/**
 * Return sanitized query-string parameters ($_GET), excluding the
 * internal _route parameter used by the router.
 *
 * @return array
 */
function get_query_params()
{
    $params = $_GET;
    unset($params['_route']);

    // Basic sanitization
    array_walk_recursive($params, function (&$value) {
        $value = api_sanitize_input($value);
    });

    return $params;
}

/**
 * Extract named parameters from a route using a regex pattern.
 *
 * Example:
 *   get_route_param('boards/free/posts/123', '#^boards/(\w+)/posts/(\d+)$#')
 *   → ['free', '123']
 *
 * @param  string      $route   The route string (without leading slash)
 * @param  string      $pattern A regex with capture groups
 * @return array|false          Matched groups (index 1+) or false
 */
function get_route_param($route, $pattern)
{
    if (preg_match($pattern, $route, $matches)) {
        array_shift($matches); // remove full match
        return $matches;
    }
    return false;
}

/**
 * Sanitize a single input value.
 *
 * 이름 앞에 api_ 를 붙인 까닭: 최신 그누보드의 lib/common.lib.php 가 같은 이름의
 * sanitize_input() 을 이미 갖고 있어, 접두사가 없으면 부팅 도중 "Cannot redeclare"
 * 치명적 오류로 API 전체가 500 이 된다. 두 함수는 하는 일도 달라서 그누보드 것을
 * 그대로 쓸 수도 없다.
 *
 * @param  mixed $value
 * @return string
 */
function api_sanitize_input($value)
{
    if (is_array($value)) {
        return array_map('api_sanitize_input', $value);
    }
    $value = (string) $value;
    $value = trim($value);
    $value = strip_tags($value);
    $value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    return $value;
}

/**
 * Generate the full public URL for an uploaded file.
 *
 * @param  string $filename  Relative path inside G5_DATA_DIR (e.g. "file/free/img_12345.jpg")
 * @return string            Absolute URL
 */
function get_upload_url($filename)
{
    if (!$filename) {
        return '';
    }

    // If it already looks like a full URL, return as-is
    if (preg_match('#^https?://#', $filename)) {
        return $filename;
    }

    return G5_DATA_URL . '/' . ltrim($filename, '/');
}

/**
 * Build a public YoungCart item image URL only when the file exists locally.
 *
 * Gnuboard data can store either "image.jpg" or "it_id/image.jpg" in it_imgN.
 * Returning an empty string for missing files prevents browsers from fetching
 * 404 HTML as an image, which Chromium reports as ORB failures.
 *
 * @param  string $it_id
 * @param  string $imageField
 * @return string
 */
function api_shop_item_image_url($it_id, $imageField)
{
    if (!$imageField) {
        return '';
    }
    if (preg_match('#^https?://#i', $imageField)) {
        return $imageField;
    }

    $imageField = ltrim(str_replace('\\', '/', $imageField), '/');
    $candidates = [$imageField];
    if ($it_id && strpos($imageField, '/') === false) {
        $candidates[] = $it_id . '/' . $imageField;
    }

    foreach ($candidates as $candidate) {
        $path = G5_DATA_PATH . '/item/' . $candidate;
        if (is_file($path)) {
            $segments = array_map('rawurlencode', explode('/', trim(str_replace('\\', '/', $candidate), '/')));
            $stamp = filemtime($path) ?: 0;
            $base = api_public_app_base_url();
            return ($base !== '' ? $base : '')
                . '/api/v1/shop/images/item/'
                . implode('/', $segments)
                . ($stamp ? '?v=' . $stamp : '');
        }
    }

    return '';
}

/**
 * Format a date/datetime string for API output (ISO 8601).
 *
 * @param  string $datetime  e.g. "2024-01-15 09:30:00" or "20240115"
 * @return string|null       ISO 8601 string or null if empty/invalid
 */
function format_datetime($datetime)
{
    if (!$datetime || $datetime === '0000-00-00 00:00:00' || $datetime === '') {
        return null;
    }

    $ts = strtotime($datetime);
    if ($ts === false || $ts < 0) {
        return null;
    }

    return date('c', $ts); // ISO 8601: 2024-01-15T09:30:00+09:00
}

/**
 * Get the public URL for a member's icon/avatar image.
 *
 * Gnuboard5 stores member icons in G5_DATA_PATH/member/[first 2 chars of mb_id]/mb_id.gif
 *
 * @param  string $mb_id
 * @return string|null  URL or null if no icon exists
 */
/**
 * 회원이미지 URL — 그누보드 회원정보 수정의 "회원이미지"(data/member_image/앞두글자/<아이콘이름>.gif).
 * 회원아이콘(get_member_icon_url)과는 다른 파일이다. 바꿔 올리면 주소가 달라지도록 수정 시각을 붙인다.
 */
function get_member_image_url($mb_id)
{
    if (!$mb_id) {
        return null;
    }

    $name = function_exists('get_mb_icon_name') ? get_mb_icon_name($mb_id) : $mb_id;
    $relative = '/member_image/' . substr($mb_id, 0, 2) . '/' . $name . '.gif';

    if (!is_file(G5_DATA_PATH . $relative)) {
        return null;
    }

    return G5_DATA_URL . $relative . '?' . filemtime(G5_DATA_PATH . $relative);
}

function get_member_icon_url($mb_id)
{
    if (!$mb_id) {
        return null;
    }

    $dir  = substr($mb_id, 0, 2);
    $path = G5_DATA_PATH . '/member/' . $dir . '/' . $mb_id . '.gif';

    if (file_exists($path)) {
        return G5_DATA_URL . '/member/' . $dir . '/' . $mb_id . '.gif';
    }

    return null;
}

function api_current_origin()
{
    return api_public_request_origin(false);
}

function api_public_app_base_url()
{
    if (defined('G5_WEBAPP_APP_URL') && G5_WEBAPP_APP_URL) {
        return rtrim((string) G5_WEBAPP_APP_URL, '/');
    }

    // 그누보드는 자기 설치 경로를 G5_URL 로 안다. 요청 origin 만 쓰면 하위 폴더 설치에서
    // /gnu5512 가 빠져 이미지 같은 절대 주소가 틀어진다. 스킴·호스트는 실제 요청을 따르고
    // (프록시 뒤에서도 맞도록), 경로는 G5_URL 에서 가져온다.
    $g5_path = defined('G5_URL') ? (string) parse_url((string) G5_URL, PHP_URL_PATH) : '';
    $g5_path = ($g5_path !== '' && $g5_path !== '/') ? '/' . trim($g5_path, '/') : '';

    $origin = api_current_origin();
    if ($origin !== '') {
        return rtrim($origin, '/') . $g5_path;
    }

    return defined('G5_URL') ? rtrim((string) G5_URL, '/') : '';
}

function api_board_file_path($bo_table, $bf_file)
{
    $bo_table = api_sanitize_bo_table($bo_table);
    $bf_file = trim(str_replace('\\', '/', (string) $bf_file), '/');

    if ($bo_table === '' || $bf_file === '' || strpos($bf_file, '..') !== false) {
        return '';
    }

    $base_dir = realpath(G5_DATA_PATH . '/file/' . $bo_table);
    if ($base_dir === false) {
        return '';
    }

    $path = realpath($base_dir . '/' . $bf_file);
    if ($path === false || !is_file($path)) {
        return '';
    }

    $base_dir = rtrim(str_replace('\\', '/', $base_dir), '/');
    $normalized_path = str_replace('\\', '/', $path);
    if ($normalized_path !== $base_dir && strpos($normalized_path, $base_dir . '/') !== 0) {
        return '';
    }

    return $path;
}

/** 목록이 쓸 수 있는 축소 폭 — 사진 파생본 공통 목록(lib/image-variants.php)과 같다. */
function api_board_file_thumb_widths()
{
    return api_image_variant_widths();
}

function api_board_file_url($bo_table, $wr_id, $bf_no, $bf_file, $width = 0)
{
    $path = api_board_file_path($bo_table, $bf_file);
    if ($path === '') {
        return '';
    }

    $bo_table = api_sanitize_bo_table($bo_table);
    $wr_id = (int) $wr_id;
    $bf_no = (int) $bf_no;
    if ($bo_table === '' || $wr_id < 1 || $bf_no < 0) {
        return '';
    }

    $segments = array_map('rawurlencode', explode('/', trim(str_replace('\\', '/', (string) $bf_file), '/')));
    $stamp = filemtime($path) ?: 0;
    $base = api_public_app_base_url();

    $query = [];
    if ($stamp) {
        $query['v'] = $stamp;
    }
    // 목록이 쓰는 폭만 싣는다. 주소에 폭이 들어가야 브라우저·CDN 이 크기별로 따로 캐시한다.
    $width = (int) $width;
    if ($width > 0 && in_array($width, api_board_file_thumb_widths(), true)) {
        $query['w'] = $width;
    }

    return ($base !== '' ? $base : '')
        . '/api/v1/board-files/'
        . rawurlencode($bo_table)
        . '/'
        . $wr_id
        . '/'
        . $bf_no
        . '/'
        . implode('/', $segments)
        . ($query ? '?' . http_build_query($query) : '');
}

/**
 * Get the write table name for a board.
 *
 * @param  string $bo_table
 * @return string  Full table name, e.g. "g5_write_free"
 */
function api_write_table($bo_table)
{
    return DB::writeTable(api_sanitize_bo_table($bo_table));
}

/**
 * Convert internal Next.js route paths into Gnuboard5/YoungCart rewrite paths.
 *
 * Examples:
 *   /boards/free          -> /free
 *   /boards/free/12       -> /free/12
 *   /shop/products/123    -> /shop/123
 *   /shop/categories/20   -> /shop/list-20
 */
function api_g5_short_href($href)
{
    $href = trim((string) $href);
    if ($href === '' || $href[0] !== '/') {
        return $href;
    }

    $hash = '';
    $hashPos = strpos($href, '#');
    if ($hashPos !== false) {
        $hash = substr($href, $hashPos);
        $href = substr($href, 0, $hashPos);
    }

    $query = '';
    $queryPos = strpos($href, '?');
    if ($queryPos !== false) {
        $query = substr($href, $queryPos);
        $href = substr($href, 0, $queryPos);
    }

    $path = $href !== '' ? $href : '/';
    $suffix = $query . $hash;

    if (preg_match('#^/boards/([0-9A-Za-z_]+)$#', $path, $m)) {
        return '/' . $m[1] . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/rss$#', $path, $m)) {
        return '/rss/' . $m[1] . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/write$#', $path, $m)) {
        return '/' . $m[1] . '/write' . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([0-9]+)$#', $path, $m)) {
        return '/' . $m[1] . '/' . $m[2] . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([^/]+)/$#', $path, $m)) {
        return '/' . $m[1] . '/' . $m[2] . '/' . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([^/]+)$#', $path, $m)) {
        return '/' . $m[1] . '/' . $m[2] . $suffix;
    }
    if (preg_match('#^/shop/categories/([0-9A-Za-z]+)$#', $path, $m)) {
        return '/shop/list-' . $m[1] . $suffix;
    }
    if (preg_match('#^/shop/products/([^/]+)/$#', $path, $m)) {
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];
        if (empty($reserved[$m[1]]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $m[1])) {
            return '/shop/' . $m[1] . '/' . $suffix;
        }
    }
    if (preg_match('#^/shop/products/([^/]+)$#', $path, $m)) {
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];
        if (empty($reserved[$m[1]]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $m[1])) {
            return '/shop/' . $m[1] . $suffix;
        }
    }
    if ($path === '/shop/products' && $query !== '') {
        parse_str(ltrim($query, '?'), $params);
        for ($i = 1; $i <= 5; $i++) {
            $key = 'it_type' . $i;
            if (isset($params[$key]) && (string) $params[$key] === '1') {
                unset($params[$key]);
                $nextQuery = http_build_query($params);
                return '/shop/type-' . $i . ($nextQuery !== '' ? '?' . $nextQuery : '') . $hash;
            }
        }
    }

    return $path . $suffix;
}

function api_bbs_rewrite_mode()
{
    $config = api_get_config();
    return isset($config['cf_bbs_rewrite']) ? (int) $config['cf_bbs_rewrite'] : 0;
}

function api_board_post_href($bo_table, $wr_id, $wr_seo_title = '', $suffix = '')
{
    $bo_table = api_sanitize_bo_table($bo_table);
    $wr_id = (int) $wr_id;
    $wr_seo_title = trim((string) $wr_seo_title);

    if (api_bbs_rewrite_mode() === 2 && $wr_seo_title !== '') {
        return api_g5_short_href(
            '/boards/' . rawurlencode($bo_table) . '/' . rawurlencode($wr_seo_title) . '/' . $suffix
        );
    }

    return api_g5_short_href('/boards/' . rawurlencode($bo_table) . '/' . $wr_id . $suffix);
}

function api_board_file_download_url($bo_table, $wr_id, $bf_no)
{
    $bo_table = api_sanitize_bo_table($bo_table);
    $wr_id = (int) $wr_id;
    $params = array(
        'bo_table' => $bo_table,
        'wr_id' => $wr_id,
        'no' => (int) $bf_no,
    );

    if (function_exists('download_file_nonce_key')) {
        $params['nonce'] = download_file_nonce_key($bo_table, $wr_id);
    }

    $base = defined('G5_BBS_URL') ? G5_BBS_URL : G5_URL . '/bbs';
    return $base . '/download.php?' . http_build_query($params, '', '&');
}

function api_shop_product_href($it_id, $it_seo_title = '', $suffix = '')
{
    $it_id = trim((string) $it_id);
    $it_seo_title = trim((string) $it_seo_title);

    if (api_bbs_rewrite_mode() === 2 && $it_seo_title !== '') {
        $slug = trim($it_seo_title, '/');
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];

        if ($slug !== '' && empty($reserved[strtolower($slug)]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $slug)) {
            return api_g5_short_href('/shop/products/' . rawurlencode($slug) . '/' . $suffix);
        }
    }

    return api_g5_short_href('/shop/products/' . rawurlencode($it_id) . $suffix);
}

/**
 * Strip sensitive fields from a member row for safe API output.
 *
 * @param  array $member  Full member row from g5_member
 * @return array           Member row without password and other sensitive fields
 */
function api_member_safe(array $member)
{
    $exclude = [
        'mb_password', 'mb_password2', 'mb_password_q', 'mb_password_a',
        'mb_intercept_date',
        'mb_leave_date',
        'mb_email_certify',
        'mb_email_certify2',
        'mb_lost_certify',
        'mb_certify',
        'mb_adult',
        'mb_dupinfo', 'mb_jumin',
        'mb_login_ip',
        'mb_ip',
        'mb_memo',
        'mb_1', 'mb_2', 'mb_3', 'mb_4', 'mb_5',
        'mb_6', 'mb_7', 'mb_8', 'mb_9', 'mb_10',
    ];

    foreach ($exclude as $key) {
        unset($member[$key]);
    }

    return $member;
}

/**
 * Return a public-only subset of member profile data.
 *
 * @param  array $member
 * @return array
 */
function api_member_public(array $member)
{
    return [
        'mb_id'        => isset($member['mb_id']) ? $member['mb_id'] : '',
        'mb_nick'      => isset($member['mb_nick']) ? $member['mb_nick'] : '',
        'mb_level'     => (int) (isset($member['mb_level']) ? $member['mb_level'] : 0),
        'mb_point'     => (int) (isset($member['mb_point']) ? $member['mb_point'] : 0),
        'mb_datetime'  => isset($member['mb_datetime']) ? $member['mb_datetime'] : '',
        'mb_icon_path' => get_member_icon_url(isset($member['mb_id']) ? $member['mb_id'] : ''),
    ];
}

/**
 * Verify that a board exists and return its configuration row.
 *
 * @param  string $bo_table
 * @return array|false  Board row or false if not found
 */
function api_get_board($bo_table)
{
    $bo_table = api_sanitize_bo_table($bo_table);
    if (!$bo_table) {
        return false;
    }

    $table = DB::table('board_table');
    $sql = "SELECT * FROM {$table}
            WHERE bo_table = ?
            LIMIT 1";
    $board = DB::fetch($sql, [$bo_table]);

    if (!$board || empty($board['bo_table'])) {
        return false;
    }

    return $board;
}

/**
 * Get the current Gnuboard5 site configuration row.
 *
 * @return array
 */
function api_get_config()
{
    $table = DB::table('config_table');
    $sql = "SELECT * FROM {$table} LIMIT 1";
    $config = DB::fetch($sql);
    return $config ?: [];
}

require_once __DIR__ . '/board_access_helpers.php';
