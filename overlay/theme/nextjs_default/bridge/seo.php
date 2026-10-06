<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 검색엔진 노출(G5_NEXTJS_SEO*) — 테마 설치본 쪽.
 *
 * 정적 빌드는 어느 사이트에 설치될지 모르므로 노출 여부·사이트맵을 굽지 않는다. 이 파일이 요청 때
 * 설치본의 api/.env(또는 서버 환경변수)를 읽어 정한다. 규칙은 nextjs/src/lib/seo-config.ts 와 같다.
 *
 *   G5_NEXTJS_SEO=on                  기본 off: 모든 화면 noindex, robots.txt 전체 차단, 사이트맵 비움
 *   G5_NEXTJS_SEO_SITEMAP=on          기본 off: 사이트맵에 고정 페이지만(DB 를 읽지 않음)
 *   G5_NEXTJS_SEO_EXCLUDE_BOARDS=qa   사이트맵과 색인에서 뺄 게시판
 *   G5_NEXTJS_SEO_SITEMAP_LIMIT=5000  사이트맵 최대 주소 수(1~50000)
 *
 * 비회원이 못 보는 것은 설정과 무관하게 늘 뺀다 — 읽기·목록 권한이 1 보다 큰 게시판, 비밀글,
 * 비밀글 전용 게시판, 성인·본인 인증 분류와 그 상품.
 */

define('NEXTJS_DEFAULT_SEO_DEFAULT_SITEMAP_LIMIT', 5000);
define('NEXTJS_DEFAULT_SEO_MAX_SITEMAP_LIMIT', 50000);
define('NEXTJS_DEFAULT_SEO_SITEMAP_CACHE_SECONDS', 3600);
define('NEXTJS_DEFAULT_SEO_INDEX', 'index, follow');
define('NEXTJS_DEFAULT_SEO_NOINDEX', 'noindex, nofollow');

/**
 * 설치본의 api/.env 를 읽는다(설치하는 사람이 이미 아는 그 파일). 코어의 파서가 있으면 그것을, 없으면
 * 같은 형식(KEY=value, # 주석, 따옴표)을 여기서 읽는다. 코어 runtime.php 는 다 쓴 배열을 지우므로 따로 읽는다.
 */
function nextjs_default_seo_env_file_values()
{
    static $values = null;
    if ($values !== null) {
        return $values;
    }

    $values = array();
    $path = (defined('G5_PATH') ? G5_PATH : dirname(__DIR__, 3)) . '/api/.env';
    if (!is_readable($path)) {
        return $values;
    }

    if (function_exists('g5_nextjs_runtime_load_env_file')) {
        g5_nextjs_runtime_load_env_file($path, $values);
        return $values;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach (is_array($lines) ? $lines : array() as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && substr($value, -1) === $value[0]) {
            $value = substr($value, 1, -1);
        }
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) {
            $values[$key] = $value;
        }
    }

    return $values;
}

/** 서버 환경변수가 있으면 그것, 없으면 api/.env 값. */
function nextjs_default_seo_env($key)
{
    $value = getenv($key);
    if (is_string($value) && trim($value) !== '') {
        return trim($value);
    }

    $values = nextjs_default_seo_env_file_values();

    return isset($values[$key]) ? trim((string) $values[$key]) : '';
}

function nextjs_default_seo_is_on($value)
{
    return in_array(strtolower(trim((string) $value)), array('on', 'true', '1', 'yes'), true);
}

function nextjs_default_seo_settings()
{
    static $settings = null;
    if ($settings !== null) {
        return $settings;
    }

    $enabled = nextjs_default_seo_is_on(nextjs_default_seo_env('G5_NEXTJS_SEO'));

    $excluded = array();
    foreach (explode(',', nextjs_default_seo_env('G5_NEXTJS_SEO_EXCLUDE_BOARDS')) as $board) {
        $board = strtolower(trim($board));
        if (preg_match('/^[0-9a-z_]+$/', $board)) {
            $excluded[] = $board;
        }
    }

    $limit = (int) nextjs_default_seo_env('G5_NEXTJS_SEO_SITEMAP_LIMIT');
    if ($limit < 1) {
        $limit = NEXTJS_DEFAULT_SEO_DEFAULT_SITEMAP_LIMIT;
    }

    $settings = array(
        'enabled' => $enabled,
        'sitemap' => $enabled && nextjs_default_seo_is_on(nextjs_default_seo_env('G5_NEXTJS_SEO_SITEMAP')),
        'excludedBoards' => $excluded,
        'sitemapLimit' => min($limit, NEXTJS_DEFAULT_SEO_MAX_SITEMAP_LIMIT),
    );

    return $settings;
}

/** 브라우저 런타임 설정(window.__G5_APP_CONFIG__.seo) — 상세 화면의 JS 가 robots 를 같은 값으로 맞춘다. */
function nextjs_default_seo_runtime_config()
{
    $settings = nextjs_default_seo_settings();

    return array(
        'enabled' => $settings['enabled'],
        'excludedBoards' => $settings['excludedBoards'],
    );
}

function nextjs_default_seo_board_excluded($bo_table)
{
    $settings = nextjs_default_seo_settings();

    return in_array(strtolower((string) $bo_table), $settings['excludedBoards'], true);
}

function nextjs_default_seo_table($key)
{
    global $g5;

    return isset($g5[$key]) ? (string) $g5[$key] : '';
}

function nextjs_default_seo_shop_enabled()
{
    return defined('G5_USE_SHOP') && G5_USE_SHOP && nextjs_default_seo_table('g5_shop_item_table') !== '';
}

/* ---------------------------------------------------------------------------
 * 이 요청이 어떤 화면인가 — 브리지가 낸 대표 껍데기(__g5_static__) 파일로 가린다.
 * ------------------------------------------------------------------------- */

function nextjs_default_seo_shell_kind($static_path)
{
    $path = str_replace('\\', '/', (string) $static_path);
    $path = preg_replace('/\.(html|txt)$/', '', $path);

    $kinds = array(
        // 글·기획전 셸은 번호 자리에 0 을 쓴다(boards/__g5_static__/0.html, shop/events/0.html).
        '#/boards/__g5_static__/(__g5_static__|0)$#' => 'post',
        '#/boards/__g5_static__$#' => 'board',
        '#/shop/products/(__g5_static__|g5-static-product)$#' => 'product',
        '#/shop/categories/__g5_static__$#' => 'category',
        '#/shop/events/(__g5_static__|0)$#' => 'event',
        '#/(shop/)?content/__g5_static__$#' => 'content',
    );
    foreach ($kinds as $pattern => $kind) {
        if (preg_match($pattern, $path)) {
            return $kind;
        }
    }

    return strpos($path, '__g5_static__') !== false ? 'other-shell' : 'page';
}

function nextjs_default_seo_public_board($bo_table)
{
    $table = nextjs_default_seo_table('board_table');
    if ($table === '' || !function_exists('sql_fetch') || !preg_match('/^[0-9A-Za-z_]+$/', (string) $bo_table)) {
        return null;
    }

    $board = sql_fetch(
        " select bo_table, bo_subject, gr_id, bo_list_level, bo_read_level, bo_use_secret from `{$table}` where bo_table = '" . $bo_table . "' limit 1 ",
        false
    );
    if (!is_array($board) || empty($board['bo_table'])) {
        return null;
    }

    // 비회원(레벨 1)이 목록을 볼 수 없거나, 비밀글만 쓰는 게시판이면 공개가 아니다.
    if ((int) ($board['bo_list_level'] ?? 1) > 1 || (int) ($board['bo_read_level'] ?? 1) > 1 || (int) ($board['bo_use_secret'] ?? 0) >= 2) {
        return null;
    }

    // 그룹 접근을 쓰는 게시판도 공개가 아니다 — 비회원은 글을 볼 수 없다(원본 bbs/board.php).
    $groupTable = nextjs_default_seo_table('group_table');
    $grId = (string) ($board['gr_id'] ?? '');
    if ($groupTable !== '' && preg_match('/^[0-9A-Za-z_]+$/', $grId)) {
        $group = sql_fetch(" select gr_use_access from `{$groupTable}` where gr_id = '" . $grId . "' limit 1 ", false);
        if (is_array($group) && !empty($group['gr_use_access'])) {
            return null;
        }
    }

    return $board;
}

function nextjs_default_seo_current_board_table()
{
    $relative = nextjs_default_static_route_relative_path();
    $match = array();
    if (preg_match('#^boards/([0-9A-Za-z_]+)(?:/.*)?$#', $relative, $match) || preg_match('#^([0-9A-Za-z_]+)(?:/.*)?$#', $relative, $match)) {
        return $match[1];
    }

    return '';
}

function nextjs_default_seo_public_category($ca_id)
{
    $table = nextjs_default_seo_table('g5_shop_category_table');
    if ($table === '' || !function_exists('sql_fetch') || !preg_match('/^[0-9A-Za-z]+$/', (string) $ca_id)) {
        return null;
    }

    $category = sql_fetch(
        " select ca_id, ca_name, ca_use, ca_cert_use, ca_adult_use from `{$table}` where ca_id = '" . $ca_id . "' limit 1 ",
        false
    );
    if (!is_array($category) || empty($category['ca_id']) || (string) ($category['ca_use'] ?? '1') !== '1') {
        return null;
    }
    if ((int) ($category['ca_cert_use'] ?? 0) > 0 || (int) ($category['ca_adult_use'] ?? 0) > 0) {
        return null;
    }

    return $category;
}

function nextjs_default_seo_current_category_id()
{
    $relative = nextjs_default_static_route_relative_path();
    $match = array();
    if (preg_match('#^shop/list-([0-9A-Za-z]+)$#', $relative, $match) || preg_match('#^shop/categories/([0-9A-Za-z]+)$#', $relative, $match)) {
        return $match[1];
    }

    return '';
}

/** 상품이 성인·본인 인증 분류에 속하면 비회원 공개가 아니다. */
function nextjs_default_seo_product_is_public($it_id)
{
    $items = nextjs_default_seo_table('g5_shop_item_table');
    if ($items === '' || !function_exists('sql_fetch')) {
        return false;
    }

    $escaped = nextjs_default_sql_escape_value($it_id);
    if ($escaped === null) {
        return false;
    }

    $item = sql_fetch(" select it_id, ca_id from `{$items}` where it_use = '1' and (it_id = '{$escaped}' or it_seo_title = '{$escaped}') limit 1 ", false);
    if (!is_array($item) || empty($item['it_id'])) {
        return false;
    }

    return (string) ($item['ca_id'] ?? '') === '' || nextjs_default_seo_public_category((string) $item['ca_id']) !== null;
}

function nextjs_default_seo_public_event_exists()
{
    $table = nextjs_default_seo_table('g5_shop_event_table');
    $relative = nextjs_default_static_route_relative_path();
    $match = array();
    if ($table === '' || !function_exists('sql_fetch') || !preg_match('#^shop/events/([0-9]+)$#', $relative, $match)) {
        return false;
    }

    $event = sql_fetch(" select ev_id from `{$table}` where ev_id = '" . (int) $match[1] . "' and ev_use = '1' limit 1 ", false);

    return is_array($event) && !empty($event['ev_id']);
}

/* ---------------------------------------------------------------------------
 * 이 요청의 robots 값
 * ------------------------------------------------------------------------- */

function nextjs_default_seo_robots_for($static_path)
{
    static $cache = array();
    $key = (string) $static_path;
    if (isset($cache[$key])) {
        return $cache[$key];
    }

    $cache[$key] = nextjs_default_seo_decide_robots($static_path) ? NEXTJS_DEFAULT_SEO_INDEX : NEXTJS_DEFAULT_SEO_NOINDEX;

    return $cache[$key];
}

function nextjs_default_seo_decide_robots($static_path)
{
    $settings = nextjs_default_seo_settings();
    if (!$settings['enabled'] || nextjs_default_should_noindex_route()) {
        return false;
    }

    $relative = nextjs_default_static_route_relative_path();
    if ($relative === 'search' || $relative === 'shop/search' || preg_match('#^[0-9A-Za-z_]+/write$#', $relative)) {
        return false;
    }

    switch (nextjs_default_seo_shell_kind($static_path)) {
        case 'board':
            $bo_table = nextjs_default_seo_current_board_table();
            return nextjs_default_seo_public_board($bo_table) !== null && !nextjs_default_seo_board_excluded($bo_table);
        case 'post':
            $bo_table = nextjs_default_seo_current_board_table();
            return !nextjs_default_seo_board_excluded($bo_table) && nextjs_default_fetch_board_runtime_metadata() !== null;
        case 'product':
            $it_id = nextjs_default_current_product_route_param();
            return $it_id !== null && $it_id !== '' && nextjs_default_seo_product_is_public($it_id);
        case 'category':
            return nextjs_default_seo_public_category(nextjs_default_seo_current_category_id()) !== null;
        case 'event':
            return nextjs_default_seo_public_event_exists();
        case 'content':
            return nextjs_default_fetch_content_runtime_metadata() !== null;
        case 'other-shell':
            return false;
        default:
            return true;
    }
}

/** 게시판 목록·분류 화면의 제목·설명. 셸에는 "게시판"·"상품 분류" 같은 일반 이름만 구워져 있다. */
function nextjs_default_seo_list_metadata($static_path)
{
    $kind = nextjs_default_seo_shell_kind($static_path);

    if ($kind === 'board') {
        $board = nextjs_default_seo_public_board(nextjs_default_seo_current_board_table());
        if ($board && !empty($board['bo_subject'])) {
            $subject = (string) $board['bo_subject'];
            return array('kind' => 'list', 'title' => $subject, 'description' => $subject . ' 게시판의 글 목록입니다.', 'url' => nextjs_default_current_short_url());
        }
    }

    if ($kind === 'category') {
        $category = nextjs_default_seo_public_category(nextjs_default_seo_current_category_id());
        if ($category && !empty($category['ca_name'])) {
            $name = (string) $category['ca_name'];
            return array('kind' => 'list', 'title' => $name, 'description' => $name . ' 분류의 상품 목록입니다.', 'url' => nextjs_default_current_short_url());
        }
    }

    return null;
}

/** <head>·HTML 안의 React 데이터·.txt 에 든 robots/googlebot 값을 모두 같은 값으로 맞춘다(한 벌만 남도록). */
function nextjs_default_seo_rewrite_robots($text, $robots)
{
    $robots_attr = htmlspecialchars($robots, ENT_QUOTES, 'UTF-8');

    $text = preg_replace(
        '/(<meta\s+name="(?:robots|googlebot)"\s+content=")[^"]*(")/i',
        '${1}' . $robots_attr . '${2}',
        $text
    );
    $text = preg_replace(
        '/(\\\\"name\\\\":\\\\"(?:robots|googlebot)\\\\",\\\\"content\\\\":\\\\")[^"\\\\]*(\\\\")/',
        '${1}' . $robots . '${2}',
        $text
    );

    return preg_replace(
        '/("name":"(?:robots|googlebot)","content":")[^"]*(")/',
        '${1}' . $robots . '${2}',
        $text
    );
}

function nextjs_default_seo_apply_to_html($html, $static_path)
{
    $list = nextjs_default_seo_list_metadata($static_path);
    if ($list) {
        $html = nextjs_default_apply_runtime_detail_metadata($html, $list);
    }

    $robots = nextjs_default_seo_robots_for($static_path);
    $html = nextjs_default_seo_rewrite_robots($html, $robots);
    if (!preg_match('/<meta\s+name="robots"/i', $html)) {
        $html = nextjs_default_upsert_meta_tag($html, 'name', 'robots', $robots);
    }

    return $html;
}

function nextjs_default_seo_send_robots_header($static_path)
{
    if (!headers_sent() && nextjs_default_seo_robots_for($static_path) === NEXTJS_DEFAULT_SEO_NOINDEX) {
        header('X-Robots-Tag: ' . NEXTJS_DEFAULT_SEO_NOINDEX);
    }
}

/* ---------------------------------------------------------------------------
 * 없는 글·상품 — 404 (SEO 설정과 무관하게 늘)
 * ------------------------------------------------------------------------- */

/**
 * 요청한 글·상품이 DB 에 아예 없으면 true. 권한은 보지 않는다 — 회원 전용 게시판의 글이나 비밀글은
 * 실제로 있으므로 404 가 아니다(로그인한 회원은 같은 주소로 본다). 주소를 해석할 수 없으면 false(200 유지).
 */
function nextjs_default_requested_record_missing($static_path)
{
    $kind = nextjs_default_seo_shell_kind($static_path);
    if ($kind === 'post') {
        return nextjs_default_requested_post_exists() === false;
    }
    if ($kind === 'product') {
        return nextjs_default_requested_product_exists() === false;
    }

    return false;
}

/** @return bool|null 있으면 true, 없으면 false, 판단할 수 없으면 null */
function nextjs_default_requested_post_exists()
{
    $params = nextjs_default_current_board_post_route_params();
    $boards = nextjs_default_seo_table('board_table');
    $write_prefix = nextjs_default_seo_table('write_prefix');
    if (!$params || $boards === '' || $write_prefix === '' || !function_exists('sql_fetch')) {
        return null;
    }

    list($bo_table, $wr_id) = $params;
    if (!preg_match('/^[0-9A-Za-z_]+$/', $bo_table) || $wr_id === '') {
        return null;
    }

    $board = sql_fetch(" select bo_table from `{$boards}` where bo_table = '{$bo_table}' limit 1 ", false);
    if (!is_array($board) || empty($board['bo_table'])) {
        return false;
    }

    $escaped = nextjs_default_sql_escape_value($wr_id);
    if ($escaped === null) {
        return null;
    }
    $where = preg_match('/^[0-9]+$/', $wr_id) ? "wr_id = '{$escaped}'" : "wr_seo_title = '{$escaped}'";
    $post = sql_fetch(" select wr_id from `{$write_prefix}{$bo_table}` where wr_is_comment = 0 and {$where} limit 1 ", false);

    return is_array($post) && !empty($post['wr_id']);
}

/** @return bool|null 있으면 true, 없으면 false, 판단할 수 없으면 null */
function nextjs_default_requested_product_exists()
{
    $items = nextjs_default_seo_table('g5_shop_item_table');
    $it_id = nextjs_default_current_product_route_param();
    if ($items === '' || $it_id === null || $it_id === '' || !function_exists('sql_fetch')) {
        return null;
    }

    $escaped = nextjs_default_sql_escape_value($it_id);
    $seo_candidate = function_exists('generate_seo_title') ? generate_seo_title($it_id) : $it_id;
    $escaped_seo = nextjs_default_sql_escape_value($seo_candidate);
    if ($escaped === null || $escaped_seo === null) {
        return null;
    }

    $item = sql_fetch(
        " select it_id from `{$items}` where it_use = '1' and (it_id = '{$escaped}' or it_seo_title = '{$escaped}' or it_seo_title = '{$escaped_seo}') limit 1 ",
        false
    );

    return is_array($item) && !empty($item['it_id']);
}

/* ---------------------------------------------------------------------------
 * 사이트 이름 — 설치본의 사이트 제목(cf_title)
 * ------------------------------------------------------------------------- */

/**
 * 정적 빌드에 구워진 테마 기본 사이트 이름. 빌드된 index.html 의 application-name 에서 읽는다
 * (nextjs/themes/<테마>/theme.config.ts 의 site.name 과 같은 값).
 */
function nextjs_default_seo_theme_site_name()
{
    static $name = null;
    if ($name !== null) {
        return $name;
    }

    $name = '';
    $path = function_exists('nextjs_default_static_app_path') ? nextjs_default_static_app_path('index.html') : '';
    $html = $path !== '' && is_file($path) ? file_get_contents($path) : false;
    $match = array();
    if (is_string($html) && preg_match('/<meta\s+name="application-name"\s+content="([^"]*)"/i', $html, $match)) {
        $name = html_entity_decode($match[1], ENT_QUOTES, 'UTF-8');
    }

    return $name;
}

/** 설치본의 사이트 제목(그누보드 관리자 > 기본환경설정 > 홈페이지 제목). 비어 있으면 ''. */
function nextjs_default_seo_site_name()
{
    global $config;

    $title = isset($config['cf_title']) ? (string) $config['cf_title'] : '';

    return trim(html_entity_decode(strip_tags($title), ENT_QUOTES, 'UTF-8'));
}

/** JSON 문자열 값 안에 들어갈 모양(양끝 따옴표 없이). < > & 는 \u 로 — HTML 안 <script> 에서도 안전. */
function nextjs_default_seo_json_inner($value)
{
    $json = json_encode((string) $value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS);

    return is_string($json) ? substr($json, 1, -1) : '';
}

function nextjs_default_seo_replace_in_group($text, $pattern, $from, $to)
{
    $result = preg_replace_callback($pattern, function ($match) use ($from, $to) {
        return $match[1] . str_replace($from, $to, $match[2]) . $match[3];
    }, $text);

    return is_string($result) ? $result : $text;
}

/**
 * 제목·메타 태그·구조화 데이터에 든 테마 기본 이름을 설치본의 사이트 제목으로 바꾼다.
 *
 * <head> 의 태그와 페이지 안 React 데이터(메타 값·제목)를 똑같이 바꿔야 JS 가 돈 뒤에도 태그가 한 벌로
 * 맞는다(값이 다르면 React 가 한 벌을 더 넣는다). 본문 글자(푸터 저작권 등)는 테마 디자인이라 두고,
 * 본문을 바꾸면 하이드레이션 불일치가 나므로 손대지 않는다. $payload 가 참이면 .txt(React 데이터만).
 */
function nextjs_default_seo_apply_site_name($text, $payload = false)
{
    $from = nextjs_default_seo_theme_site_name();
    $to = nextjs_default_seo_site_name();
    if ($from === '' || $to === '' || $from === $to) {
        return $text;
    }

    $json_from = nextjs_default_seo_json_inner($from);
    $json_to = nextjs_default_seo_json_inner($to);

    if ($payload) {
        $text = nextjs_default_seo_replace_in_group($text, '/("content":")([^"\\\\]*)(")/', $json_from, $json_to);

        return nextjs_default_seo_replace_in_group($text, '/("title","[^"\\\\]*",\{"children":")([^"\\\\]*)(")/', $json_from, $json_to);
    }

    // 1) <head> 의 <title> 과 메타 태그 content
    $head_end = stripos($text, '</head>');
    if ($head_end !== false) {
        $head = substr($text, 0, $head_end);
        $html_from = htmlspecialchars($from, ENT_QUOTES, 'UTF-8');
        $html_to = htmlspecialchars($to, ENT_QUOTES, 'UTF-8');
        $head = nextjs_default_seo_replace_in_group($head, '#(<title>)([^<]*)(</title>)#', $html_from, $html_to);
        $head = nextjs_default_seo_replace_in_group($head, '/(<meta\s[^>]*?content=")([^"]*)(")/i', $html_from, $html_to);
        $text = $head . substr($text, $head_end);
    }

    // 2) 원본 HTML 의 구조화 데이터(Organization·WebSite 의 name)
    $text = nextjs_default_seo_replace_in_group(
        $text,
        '#(<script type="application/ld\+json"[^>]*>)(.*?)(</script>)#s',
        '"name":"' . $json_from . '"',
        '"name":"' . $json_to . '"'
    );

    // 3) 페이지 안 React 데이터의 같은 메타 값·제목(JSON 을 JS 문자열에 한 번 더 넣은 모양)
    $flight_from = nextjs_default_seo_json_inner($json_from);
    $flight_to = nextjs_default_seo_json_inner($json_to);
    $text = nextjs_default_seo_replace_in_group($text, '/(\\\\"content\\\\":\\\\")([^"\\\\]*)(\\\\")/', $flight_from, $flight_to);

    return nextjs_default_seo_replace_in_group(
        $text,
        '/(\\\\"title\\\\",\\\\"[^"\\\\]*\\\\",\{\\\\"children\\\\":\\\\")([^"\\\\]*)(\\\\")/',
        $flight_from,
        $flight_to
    );
}

/** PWA 앱 이름(manifest 의 name)도 설치본의 사이트 제목으로. */
function nextjs_default_seo_apply_site_name_to_manifest(array $manifest)
{
    $from = nextjs_default_seo_theme_site_name();
    $to = nextjs_default_seo_site_name();
    if ($to !== '' && isset($manifest['name']) && (string) $manifest['name'] === $from) {
        $manifest['name'] = $to;
    }

    return $manifest;
}

/* ---------------------------------------------------------------------------
 * robots.txt · 사이트맵
 * ------------------------------------------------------------------------- */

function nextjs_default_seo_robots_txt()
{
    $settings = nextjs_default_seo_settings();
    if (!$settings['enabled']) {
        return "User-agent: *\nDisallow: /\n";
    }

    $base = nextjs_default_g5_url();
    $prefix = rtrim((string) parse_url($base, PHP_URL_PATH), '/');
    $private = array('/login', '/register', '/forgot-password', '/mypage', '/members', '/admin', '/api', '/search', '/shop/cart', '/shop/order', '/shop/orders', '/shop/payment', '/shop/personalpay', '/shop/search', '/shop/wishlist'); // nextjs/src/app/robots.ts 와 같은 목록(/members = 회원 자기소개)

    $lines = array('User-agent: *', 'Allow: ' . ($prefix !== '' ? $prefix . '/' : '/'));
    foreach ($private as $path) {
        $lines[] = 'Disallow: ' . $prefix . $path;
    }
    $lines[] = '';
    $lines[] = 'Sitemap: ' . $base . '/sitemap.xml';
    $lines[] = 'Sitemap: ' . $base . '/sitemap-posts.xml';

    return implode("\n", $lines) . "\n";
}

function nextjs_default_seo_url($long_path)
{
    $path = function_exists('nextjs_default_short_path') ? nextjs_default_short_path($long_path) : $long_path;

    return nextjs_default_g5_url() . ($path === '/' ? '/' : $path);
}

function nextjs_default_seo_iso_date($value)
{
    $value = trim((string) $value);
    if ($value === '' || strpos($value, '0000-00-00') === 0) {
        return '';
    }

    $time = strtotime($value);

    return $time ? date('c', $time) : '';
}

function nextjs_default_seo_urlset(array $entries)
{
    $xml = array('<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    foreach ($entries as $entry) {
        $xml[] = '  <url>';
        $xml[] = '    <loc>' . htmlspecialchars($entry['loc'], ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc>';
        if (!empty($entry['lastmod'])) {
            $xml[] = '    <lastmod>' . htmlspecialchars($entry['lastmod'], ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</lastmod>';
        }
        $xml[] = '  </url>';
    }
    $xml[] = '</urlset>';

    return implode("\n", $xml) . "\n";
}

function nextjs_default_seo_rewrite_mode()
{
    global $config;

    return isset($config['cf_bbs_rewrite']) ? (int) $config['cf_bbs_rewrite'] : 0;
}

function nextjs_default_seo_fixed_pages()
{
    $paths = array('/', '/boards', '/recent', '/faq', '/polls');
    if (nextjs_default_seo_shop_enabled()) {
        $paths = array_merge($paths, array('/shop', '/shop/products', '/shop/events', '/shop/couponzone'));
    }

    $entries = array();
    foreach ($paths as $path) {
        $entries[] = array('loc' => nextjs_default_seo_url($path));
    }

    return $entries;
}

function nextjs_default_seo_query_rows($sql)
{
    $rows = array();
    if (!function_exists('sql_query') || !function_exists('sql_fetch_array')) {
        return $rows;
    }

    $result = sql_query($sql, false);
    if (!$result) {
        return $rows;
    }
    while ($row = sql_fetch_array($result)) {
        $rows[] = $row;
    }

    return $rows;
}

function nextjs_default_seo_public_boards()
{
    $table = nextjs_default_seo_table('board_table');
    if ($table === '') {
        return array();
    }

    // 그룹 접근을 쓰는 게시판은 뺀다(위 nextjs_default_seo_public_board 와 같은 기준).
    $groupTable = nextjs_default_seo_table('group_table');
    $groupFilter = $groupTable !== '' ? " and gr_id not in (select gr_id from `{$groupTable}` where gr_use_access = 1)" : '';

    $boards = array();
    foreach (nextjs_default_seo_query_rows(" select bo_table from `{$table}` where bo_list_level <= 1 and bo_read_level <= 1 and bo_use_secret < 2{$groupFilter} order by bo_order, bo_table ") as $row) {
        $bo_table = (string) $row['bo_table'];
        if (preg_match('/^[0-9A-Za-z_]+$/', $bo_table) && !nextjs_default_seo_board_excluded($bo_table)) {
            $boards[] = $bo_table;
        }
    }

    return $boards;
}

function nextjs_default_seo_catalog_entries($limit)
{
    // 한도가 있을 때 중요한 것부터 들어가도록 — 게시판, 분류, 상품, 기획전, 그다음 안내 페이지.
    $entries = array();

    foreach (nextjs_default_seo_public_boards() as $bo_table) {
        $entries[] = array('loc' => nextjs_default_seo_url('/boards/' . $bo_table));
    }

    if (nextjs_default_seo_shop_enabled()) {
        $categories = nextjs_default_seo_table('g5_shop_category_table');
        $items = nextjs_default_seo_table('g5_shop_item_table');
        $events = nextjs_default_seo_table('g5_shop_event_table');
        $blocked = array();

        if ($categories !== '') {
            foreach (nextjs_default_seo_query_rows(" select ca_id, ca_use, ca_cert_use, ca_adult_use from `{$categories}` order by ca_order, ca_id ") as $row) {
                $ca_id = (string) $row['ca_id'];
                if ((string) $row['ca_use'] !== '1' || (int) $row['ca_cert_use'] > 0 || (int) $row['ca_adult_use'] > 0) {
                    $blocked[$ca_id] = true;
                    continue;
                }
                $entries[] = array('loc' => nextjs_default_seo_url('/shop/list-' . rawurlencode($ca_id)));
            }
        }

        if ($items !== '') {
            $seo_rewrite = nextjs_default_seo_rewrite_mode() === 2;
            $sql = " select it_id, it_seo_title, ca_id, it_update_time, it_time from `{$items}` where it_use = '1' order by it_update_time desc, it_id desc limit " . (int) $limit;
            foreach (nextjs_default_seo_query_rows($sql) as $row) {
                if (isset($blocked[(string) $row['ca_id']])) {
                    continue;
                }
                $seo_title = trim((string) ($row['it_seo_title'] ?? ''));
                $path = $seo_rewrite && $seo_title !== '' ? '/shop/' . rawurlencode($seo_title) . '/' : '/shop/' . rawurlencode((string) $row['it_id']);
                $entries[] = array('loc' => nextjs_default_seo_url($path), 'lastmod' => nextjs_default_seo_iso_date($row['it_update_time'] ?: $row['it_time']));
            }
        }

        if ($events !== '') {
            foreach (nextjs_default_seo_query_rows(" select ev_id from `{$events}` where ev_use = '1' order by ev_id desc ") as $row) {
                $entries[] = array('loc' => nextjs_default_seo_url('/shop/events/' . (int) $row['ev_id']));
            }
        }
    }

    $content = nextjs_default_seo_table('content_table');
    if ($content !== '') {
        foreach (nextjs_default_seo_query_rows(" select co_id from `{$content}` order by co_id ") as $row) {
            $entries[] = array('loc' => nextjs_default_seo_url('/content/' . rawurlencode((string) $row['co_id'])));
        }
    }

    return $entries;
}

function nextjs_default_seo_post_entries($limit)
{
    $write_prefix = nextjs_default_seo_table('write_prefix');
    if ($write_prefix === '') {
        return array();
    }

    $seo_rewrite = nextjs_default_seo_rewrite_mode() === 2;
    $boards = nextjs_default_seo_public_boards();
    if (!$boards) {
        return array();
    }

    // 게시판이 많은 사이트에서도 읽는 양이 한도의 약 2배를 넘지 않게 나눈다(최소 50) — 공유 호스팅의
    // 메모리·시간 제한 보호. 최근 글이 몰린 게시판도 몫이 넉넉해 최신순 결과가 거의 달라지지 않는다.
    $per_board = (int) min($limit, max(50, ceil(2 * $limit / count($boards))));

    $entries = array();
    foreach ($boards as $bo_table) {
        $sql = " select wr_id, wr_seo_title, wr_last, wr_datetime from `{$write_prefix}{$bo_table}` where wr_is_comment = 0 and wr_option not like '%secret%' order by wr_last desc, wr_id desc limit " . $per_board;
        foreach (nextjs_default_seo_query_rows($sql) as $row) {
            $seo_title = trim((string) ($row['wr_seo_title'] ?? ''));
            $path = $seo_rewrite && $seo_title !== ''
                ? '/boards/' . $bo_table . '/' . rawurlencode($seo_title) . '/'
                : '/boards/' . $bo_table . '/' . (int) $row['wr_id'];
            $entries[] = array('loc' => nextjs_default_seo_url($path), 'lastmod' => nextjs_default_seo_iso_date($row['wr_last'] ?: $row['wr_datetime']));
        }
    }

    // 게시판을 가리지 않고 최근 것부터.
    usort($entries, function ($a, $b) {
        return strcmp((string) $b['lastmod'], (string) $a['lastmod']);
    });

    return $entries;
}

/** 사이트맵 캐시 파일. data/cache 에 쓸 수 없는 호스팅이면 서버 임시 폴더를 쓴다(키에 사이트 주소가 들어가 섞이지 않는다). */
function nextjs_default_seo_sitemap_cache_path($asset)
{
    $dirs = array();
    if (defined('G5_DATA_PATH')) {
        $dirs[] = G5_DATA_PATH . '/cache';
    }
    if (function_exists('sys_get_temp_dir')) {
        $dirs[] = sys_get_temp_dir();
    }

    foreach ($dirs as $dir) {
        if ($dir !== '' && is_dir($dir) && is_writable($dir)) {
            return rtrim($dir, '/\\') . '/nextjs_default-seo-' . md5($asset . '|' . nextjs_default_g5_url() . '|' . json_encode(nextjs_default_seo_settings())) . '.xml';
        }
    }

    return '';
}

function nextjs_default_seo_sitemap_xml($asset)
{
    $settings = nextjs_default_seo_settings();
    if (!$settings['enabled']) {
        return nextjs_default_seo_urlset(array());
    }

    if (!$settings['sitemap']) {
        return nextjs_default_seo_urlset($asset === 'sitemap.xml' ? nextjs_default_seo_fixed_pages() : array());
    }

    $cache = nextjs_default_seo_sitemap_cache_path($asset);
    if ($cache !== '' && is_file($cache) && filemtime($cache) > time() - NEXTJS_DEFAULT_SEO_SITEMAP_CACHE_SECONDS) {
        $cached = file_get_contents($cache);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }
    }

    $limit = $settings['sitemapLimit'];
    $entries = $asset === 'sitemap.xml'
        ? array_merge(nextjs_default_seo_fixed_pages(), nextjs_default_seo_catalog_entries($limit))
        : nextjs_default_seo_post_entries($limit);
    $xml = nextjs_default_seo_urlset(array_slice($entries, 0, $limit));

    if ($cache !== '') {
        @file_put_contents($cache, $xml, LOCK_EX);
    }

    return $xml;
}
