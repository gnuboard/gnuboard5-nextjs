<?php
// 세션 — 공유 호스팅(/tmp)의 세션 청소 멈춤을 막는다(plugin/webapp/session_guard.php). nginx 예시는 테마 화면과
// 홈을 이 파일로 바로 보낸다. 브리지(bridge/route.php)를 거쳐 왔으면 이미 감싸져 있어 아무 일도 하지 않는다.
if (is_file(dirname(__DIR__, 2) . '/plugin/webapp/session_guard.php')) {
    require_once dirname(__DIR__, 2) . '/plugin/webapp/session_guard.php';
    webapp_session_guard_install();
}
require_once dirname(__DIR__, 2) . '/common.php';

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/bridge/config.php';
g5_nextjs_redirect_legacy_admin_request();

$active_theme_path = defined('G5_THEME_PATH') ? realpath(G5_THEME_PATH) : false;
$nextjs_default_theme_path = realpath(__DIR__);

function nextjs_default_legacy_redirect($script, $params = array())
{
    $query = array_merge($_GET, $params);
    unset($query['_rsc']);

    $target = rtrim(G5_URL, '/') . '/' . ltrim($script, '/');
    if (!empty($query)) {
        $target .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    header('Location: ' . $target, true, 302);
    exit;
}

function nextjs_default_decode_route_segment($value)
{
    return rawurldecode((string) $value);
}

function nextjs_default_public_asset_response($asset)
{
    $asset = ltrim((string) $asset, '/\\');

    if (!preg_match('#^(robots\.txt|sitemap(?:-posts)?\.xml|manifest\.webmanifest|manifest\.json|sw\.js|favicon\.ico|icon-[0-9]+\.png|og-default\.png|kcp-bridge\.html)$#', $asset)) {
        return false;
    }

    $path = nextjs_default_static_app_path($asset);
    if (!is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Static asset not found.';
        exit;
    }

    $mime_types = array(
        'webmanifest' => 'application/manifest+json',
        'json' => 'application/json',
        'js' => 'text/javascript; charset=utf-8',
        'txt' => 'text/plain; charset=utf-8',
        'xml' => 'application/xml; charset=utf-8',
        'ico' => 'image/x-icon',
        'png' => 'image/png',
        'html' => 'text/html; charset=utf-8',
    );

    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $content_type = isset($mime_types[$extension]) ? $mime_types[$extension] : 'application/octet-stream';

    nextjs_default_send_public_asset_security_headers($asset);
    header('Content-Type: ' . $content_type);

    if ($asset === 'sw.js') {
        header('Service-Worker-Allowed: ' . nextjs_default_public_scope_path());
    }

    if (
        $asset === 'robots.txt' ||
        $asset === 'sitemap.xml' ||
        $asset === 'sitemap-posts.xml' ||
        $asset === 'manifest.webmanifest' ||
        $asset === 'manifest.json'
    ) {
        $body = file_get_contents($path);
        if ($body === false) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Static asset not found.';
            exit;
        }

        $body = g5_nextjs_relocate_portable_build($body, nextjs_default_g5_url());
        $body = nextjs_default_rewrite_public_metadata_asset($asset, $body);
        header('Content-Length: ' . strlen($body));
        echo $body;
        exit;
    }

    // sw.js 처럼 글로 된 공개 파일에도 자리표시자가 들어 있을 수 있다.
    if (in_array($extension, array('js', 'json', 'txt', 'xml', 'webmanifest', 'html'), true)) {
        $body = file_get_contents($path);
        if ($body !== false) {
            $body = g5_nextjs_relocate_portable_build($body, nextjs_default_g5_url());
            header('Content-Length: ' . strlen($body));
            echo $body;
            exit;
        }
    }
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

function nextjs_default_public_base_path()
{
    $base_path = parse_url(nextjs_default_g5_url(), PHP_URL_PATH);
    return $base_path && $base_path !== '/' ? '/' . trim($base_path, '/') : '';
}

function nextjs_default_public_scope_path()
{
    $base_path = nextjs_default_public_base_path();
    return $base_path !== '' ? $base_path . '/' : '/';
}

function nextjs_default_public_asset_path($path)
{
    $path = (string) $path;
    if ($path === '' || preg_match('#^https?://#i', $path) || strpos($path, 'data:') === 0) {
        return $path;
    }

    if ($path[0] !== '/') {
        return $path;
    }

    $base_path = nextjs_default_public_base_path();
    if ($base_path !== '' && ($path === $base_path || strpos($path, $base_path . '/') === 0)) {
        return $path;
    }

    return $base_path . $path;
}

function nextjs_default_public_route_path($path)
{
    $path = (string) $path;
    if ($path === '') {
        return '/';
    }

    if ($path[0] !== '/') {
        return '/' . ltrim($path, '/');
    }

    $base_path = nextjs_default_public_base_path();
    if ($base_path !== '' && ($path === $base_path || strpos($path, $base_path . '/') === 0)) {
        $path = substr($path, strlen($base_path));
        return $path !== '' ? $path : '/';
    }

    return $path;
}

function nextjs_default_public_robots_path($path)
{
    $path = trim((string) $path);
    if ($path === '') {
        return $path;
    }

    $base_path = nextjs_default_public_base_path();
    if ($base_path === '' || $path[0] !== '/') {
        return $path;
    }

    if ($path === $base_path || strpos($path, $base_path . '/') === 0) {
        return $path;
    }

    return $base_path . $path;
}

function nextjs_default_rewrite_robots_asset($body, $base)
{
    $body = preg_replace('/^User-Agent:/mi', 'User-agent:', $body);
    $body = preg_replace_callback(
        '/^(Allow|Disallow):\s*(\S*)\s*$/mi',
        function ($match) {
            return $match[1] . ': ' . nextjs_default_public_robots_path($match[2]);
        },
        $body
    );

    if (preg_match('/^Host:\s*\S+\s*$/mi', $body)) {
        $body = preg_replace('/^Host:\s*\S+\s*$/mi', 'Host: ' . $base, $body);
    } else {
        $body = rtrim($body) . "\nHost: " . $base . "\n";
    }

    if (preg_match('/^Sitemap:\s*\S+\s*$/mi', $body)) {
        $body = preg_replace_callback(
            '/^Sitemap:\s*(\S+)\s*$/mi',
            function ($match) use ($base) {
                $path = parse_url($match[1], PHP_URL_PATH);
                $path = $path ? nextjs_default_public_route_path($path) : '/sitemap.xml';

                return 'Sitemap: ' . $base . $path;
            },
            $body
        );
    } else {
        $body = rtrim($body) . "\nSitemap: " . $base . "/sitemap.xml\n";
        $body = rtrim($body) . "\nSitemap: " . $base . "/sitemap-posts.xml\n";
    }

    return $body;
}

function nextjs_default_rewrite_manifest_image_entries($items)
{
    if (!is_array($items)) {
        return $items;
    }

    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }

        if (isset($item['src']) && is_string($item['src'])) {
            $item['src'] = nextjs_default_public_asset_path($item['src']);
        }

        $items[$index] = $item;
    }

    return $items;
}

function nextjs_default_rewrite_manifest_asset($body)
{
    $manifest = json_decode($body, true);
    if (!is_array($manifest) || json_last_error() !== JSON_ERROR_NONE) {
        return $body;
    }

    $manifest['start_url'] = nextjs_default_public_scope_path();
    $manifest['scope'] = nextjs_default_public_scope_path();
    if (function_exists('nextjs_default_seo_apply_site_name_to_manifest')) {
        $manifest = nextjs_default_seo_apply_site_name_to_manifest($manifest);
    }

    if (isset($manifest['icons'])) {
        $manifest['icons'] = nextjs_default_rewrite_manifest_image_entries($manifest['icons']);
    }

    if (isset($manifest['screenshots'])) {
        $manifest['screenshots'] = nextjs_default_rewrite_manifest_image_entries($manifest['screenshots']);
    }

    if (isset($manifest['shortcuts']) && is_array($manifest['shortcuts'])) {
        foreach ($manifest['shortcuts'] as $index => $shortcut) {
            if (!is_array($shortcut)) {
                continue;
            }

            if (isset($shortcut['url']) && is_string($shortcut['url'])) {
                $shortcut['url'] = nextjs_default_public_asset_path($shortcut['url']);
            }
            if (isset($shortcut['icons'])) {
                $shortcut['icons'] = nextjs_default_rewrite_manifest_image_entries($shortcut['icons']);
            }

            $manifest['shortcuts'][$index] = $shortcut;
        }
    }

    $json = json_encode(
        $manifest,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );

    return is_string($json) ? $json . "\n" : $body;
}

function nextjs_default_rewrite_public_metadata_asset($asset, $body)
{
    $base = nextjs_default_g5_url();
    if ($base === '') {
        return $body;
    }

    if ($asset === 'manifest.webmanifest' || $asset === 'manifest.json') {
        return nextjs_default_rewrite_manifest_asset($body);
    }

    // robots.txt 와 사이트맵은 설치본의 설정(G5_NEXTJS_SEO*)과 DB 로 요청 때 만든다(bridge/seo.php).
    if (function_exists('nextjs_default_seo_robots_txt') && $asset === 'robots.txt') {
        return nextjs_default_seo_robots_txt();
    }

    if (function_exists('nextjs_default_seo_sitemap_xml') && ($asset === 'sitemap.xml' || $asset === 'sitemap-posts.xml')) {
        return nextjs_default_seo_sitemap_xml($asset);
    }

    if ($asset === 'robots.txt') {
        return nextjs_default_rewrite_robots_asset($body, $base);
    }

    if ($asset === 'sitemap.xml' || $asset === 'sitemap-posts.xml') {
        return preg_replace_callback(
            '#<loc>https?://[^/<>\s]+([^<]*)</loc>#i',
            function ($match) use ($base) {
                $path = nextjs_default_public_route_path($match[1] !== '' ? $match[1] : '/');

                return '<loc>' . $base . $path . '</loc>';
            },
            $body
        );
    }

    return $body;
}

function nextjs_default_render_legacy_rss_route($path)
{
    global $config, $g5;

    $route = trim((string) $path, '/');
    if (!preg_match('#^rss/([0-9A-Za-z_]+)$#', $route, $match)) {
        return false;
    }

    $bo_table = $match[1];
    $_GET['bo_table'] = $bo_table;
    $_REQUEST['bo_table'] = $bo_table;
    $previous_cwd = getcwd();

    if (defined('G5_BBS_PATH') && is_file(G5_BBS_PATH . '/rss.php')) {
        chdir(G5_BBS_PATH);
        include G5_BBS_PATH . '/rss.php';
        if ($previous_cwd) {
            chdir($previous_cwd);
        }
        exit;
    }

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'RSS route not found.';
    exit;
}

function nextjs_default_redirect_to_short_route_if_needed()
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    if ($method !== 'GET' && $method !== 'HEAD') {
        return;
    }

    $current = nextjs_default_current_path_with_query();
    $short = nextjs_default_short_path($current);
    if ($short === $current) {
        return;
    }

    header('Location: ' . nextjs_default_g5_url() . $short, true, 301);
    exit;
}

function nextjs_default_dispatch_inactive_legacy_route()
{
    $path = parse_url(nextjs_default_current_path(), PHP_URL_PATH);
    $route = ltrim((string) $path, '/');

    if ($route === '') {
        return false;
    }

    if (substr($route, -4) === '.txt') {
        return false;
    }

    if (preg_match('#^shop/list-([0-9a-z]+)$#i', $route, $match)) {
        nextjs_default_legacy_redirect('shop/list.php', array(
            'ca_id' => $match[1],
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^shop/type-([0-9a-z]+)$#i', $route, $match)) {
        nextjs_default_legacy_redirect('shop/listtype.php', array(
            'type' => $match[1],
            'rewrite' => '1',
        ));
    }

    if ($route === 'shop/reviews') {
        nextjs_default_legacy_redirect('shop/itemuselist.php');
    }

    if ($route === 'shop/qas') {
        nextjs_default_legacy_redirect('shop/itemqalist.php');
    }

    if ($route === 'shop/search') {
        nextjs_default_legacy_redirect('shop/search.php');
    }

    if ($route === 'shop/largeimage') {
        nextjs_default_legacy_redirect('shop/largeimage.php');
    }

    if (preg_match('#^shop/content/([0-9a-zA-Z_]+)$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/content.php', array(
            'co_id' => $match[1],
            'rewrite' => '1',
            'service' => 'shop',
        ));
    }

    if (preg_match('#^shop/content/([^/]+)/$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/content.php', array(
            'co_seo_title' => nextjs_default_decode_route_segment($match[1]),
            'rewrite' => '1',
            'service' => 'shop',
        ));
    }

    if (preg_match('#^shop/([0-9a-zA-Z_-]+)$#', $route, $match)) {
        nextjs_default_legacy_redirect('shop/item.php', array(
            'it_id' => $match[1],
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^shop/([^/]+)/$#', $route, $match)) {
        nextjs_default_legacy_redirect('shop/item.php', array(
            'it_seo_title' => nextjs_default_decode_route_segment($match[1]),
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^content/([0-9a-zA-Z_]+)$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/content.php', array(
            'co_id' => $match[1],
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^content/([^/]+)/$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/content.php', array(
            'co_seo_title' => nextjs_default_decode_route_segment($match[1]),
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^rss/([0-9a-zA-Z_]+)$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/rss.php', array('bo_table' => $match[1]));
    }

    if (preg_match('#^([0-9a-zA-Z_]+)/write$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/write.php', array(
            'bo_table' => $match[1],
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^([0-9a-zA-Z_]+)/([0-9]+)$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/board.php', array(
            'bo_table' => $match[1],
            'wr_id' => $match[2],
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^([0-9a-zA-Z_]+)/([^/]+)/$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/board.php', array(
            'bo_table' => $match[1],
            'wr_seo_title' => nextjs_default_decode_route_segment($match[2]),
            'rewrite' => '1',
        ));
    }

    if (preg_match('#^([0-9a-zA-Z_]+)$#', $route, $match)) {
        nextjs_default_legacy_redirect('bbs/board.php', array(
            'bo_table' => $match[1],
            'rewrite' => '1',
        ));
    }

    return false;
}

if (!$active_theme_path || !$nextjs_default_theme_path || $active_theme_path !== $nextjs_default_theme_path) {
    nextjs_default_dispatch_inactive_legacy_route();

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'G5 Next.js 25 theme is not active.';
    exit;
}

require_once __DIR__ . '/bridge/app-shell.php';

function nextjs_default_admin_login_target_path($value)
{
    $value = trim(rawurldecode((string) $value));
    if ($value === '') {
        return '';
    }

    $path = '';
    if (preg_match('#^https?://#i', $value)) {
        $parts = parse_url($value);
        $path = isset($parts['path']) ? (string) $parts['path'] : '';
    } else {
        $path = $value;
    }

    $path = parse_url($path, PHP_URL_PATH);
    $path = '/' . ltrim((string) $path, '/');

    return $path;
}

function nextjs_default_is_admin_login_target($value)
{
    $path = nextjs_default_admin_login_target_path($value);

    return $path === '/adm' || strpos($path, '/adm/') === 0;
}

function nextjs_default_legacy_admin_login_script($request_path)
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    if ($method !== 'GET' && $method !== 'HEAD') {
        return false;
    }

    $path = parse_url((string) $request_path, PHP_URL_PATH);
    if ($path !== '/bbs/login.php') {
        return false;
    }

    foreach (array('url', 'redirect') as $key) {
        if (isset($_GET[$key]) && nextjs_default_is_admin_login_target($_GET[$key])) {
            return defined('G5_BBS_PATH') ? G5_BBS_PATH . '/login.php' : false;
        }
    }

    return false;
}

function nextjs_default_prepare_legacy_script($script, $public_script_name)
{
    if (!is_file($script)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Legacy route not found.';
        exit;
    }

    $previous_cwd = getcwd();
    $script_dir = dirname($script);

    $_SERVER['SCRIPT_NAME'] = $public_script_name;
    $_SERVER['PHP_SELF'] = $public_script_name;
    $_SERVER['SCRIPT_FILENAME'] = $script;

    chdir($script_dir);

    return $previous_cwd;
}

function nextjs_default_forget_passthrough_param()
{
    unset($_GET['g5_nextjs_default_passthrough']);
    unset($_REQUEST['g5_nextjs_default_passthrough']);
    $_SERVER['QUERY_STRING'] = http_build_query($_GET, '', '&', PHP_QUERY_RFC3986);
}

function nextjs_default_dispatch_passthrough_legacy_route($request_path)
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    if ($method !== 'GET') {
        return false;
    }

    $path = parse_url((string) $request_path, PHP_URL_PATH);
    $search = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== ''
        ? '?' . (string) $_SERVER['QUERY_STRING']
        : '';

    if (!nextjs_default_is_passthrough_legacy_request($path, $search)) {
        return false;
    }

    if ($path === '/shop/personalpayform.php' && defined('G5_SHOP_PATH')) {
        $script = G5_SHOP_PATH . '/personalpayform.php';
        if (is_file($script)) {
            nextjs_default_forget_passthrough_param();
            require $script;
            exit;
        }
    }

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Legacy passthrough route not found.';
    exit;
}

$asset = isset($_GET['g5_nextjs_default_asset']) ? $_GET['g5_nextjs_default_asset'] : '';
$request_path = parse_url(nextjs_default_current_path(), PHP_URL_PATH);

if ($asset !== '') {
    nextjs_default_public_asset_response($asset);
} elseif ($request_path) {
    nextjs_default_public_asset_response(ltrim((string) $request_path, '/\\'));
}

nextjs_default_try_next_static_asset_response($request_path);

if ($request_path && substr($request_path, -4) === '.txt') {
    nextjs_default_render_static_payload();
    exit;
}

$legacy_admin_login_script = nextjs_default_legacy_admin_login_script($request_path);
if ($legacy_admin_login_script !== false) {
    $legacy_admin_login_previous_cwd = nextjs_default_prepare_legacy_script($legacy_admin_login_script, '/bbs/login.php');
    require $legacy_admin_login_script;
    if ($legacy_admin_login_previous_cwd) {
        chdir($legacy_admin_login_previous_cwd);
    }
    exit;
}

nextjs_default_dispatch_passthrough_legacy_route($request_path);
nextjs_default_redirect_to_short_route_if_needed();
nextjs_default_render_legacy_rss_route($request_path);
nextjs_default_render_app_shell();
exit;
