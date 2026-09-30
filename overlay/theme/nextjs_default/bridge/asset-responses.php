<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function nextjs_default_try_public_asset_response($path = null)
{
    $path = $path === null ? nextjs_default_current_path() : (string) $path;
    $asset = ltrim((string) parse_url($path, PHP_URL_PATH), '/\\');

    if (!preg_match('#^(robots\.txt|sitemap(?:-posts)?\.xml|manifest\.webmanifest|manifest\.json|sw\.js|favicon\.ico|icon-[0-9]+\.png|og-default\.png|kcp-bridge\.html)$#', $asset)) {
        return false;
    }

    $file_path = nextjs_default_static_app_path($asset);
    if (!is_file($file_path)) {
        http_response_code(404);
        nextjs_default_send_public_asset_security_headers($asset);
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

    $extension = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));
    $content_type = isset($mime_types[$extension]) ? $mime_types[$extension] : 'application/octet-stream';

    nextjs_default_send_public_asset_security_headers($asset);
    nextjs_default_clear_static_asset_cookie_headers();
    header('Content-Type: ' . $content_type);

    if ($asset === 'sw.js') {
        header('Service-Worker-Allowed: ' . nextjs_default_bridge_public_scope_path());
    }

    if (
        $asset === 'robots.txt' ||
        $asset === 'sitemap.xml' ||
        $asset === 'sitemap-posts.xml' ||
        $asset === 'manifest.webmanifest' ||
        $asset === 'manifest.json'
    ) {
        $body = file_get_contents($file_path);
        if ($body === false) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Static asset not found.';
            exit;
        }

        $body = g5_nextjs_relocate_portable_build($body, nextjs_default_g5_url());
        $body = nextjs_default_bridge_rewrite_public_metadata_asset($asset, $body);
        nextjs_default_send_response_body($body, $content_type);
        exit;
    }

    // sw.js 처럼 글로 된 공개 파일에도 자리표시자가 들어 있을 수 있다.
    if (nextjs_default_is_relocatable_asset_extension($extension)) {
        $body = file_get_contents($file_path);
        if ($body !== false) {
            nextjs_default_send_response_body(g5_nextjs_relocate_portable_build($body, nextjs_default_g5_url()), $content_type);
            exit;
        }
    }
    nextjs_default_send_file_response($file_path, $content_type);
    exit;
}

function nextjs_default_is_relocatable_asset_extension($extension)
{
    return in_array((string) $extension, array('js', 'mjs', 'css', 'json', 'txt', 'webmanifest', 'xml', 'html', 'svg', 'map'), true);
}

function nextjs_default_try_next_static_asset_response($path = null)
{
    $path = $path === null ? nextjs_default_current_path() : (string) $path;
    $asset = ltrim((string) parse_url($path, PHP_URL_PATH), '/\\');

    if (strpos($asset, '_next/') !== 0) {
        return false;
    }

    $asset = rawurldecode($asset);
    if (
        $asset === '' ||
        strpos($asset, "\0") !== false ||
        strpos($asset, '\\') !== false ||
        preg_match('#(?:^|/)\.\.(?:/|$)#', $asset)
    ) {
        http_response_code(400);
        nextjs_default_send_public_asset_security_headers($asset);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Invalid static asset path.';
        exit;
    }

    $app_root = realpath(nextjs_default_static_app_path());
    $file_path = nextjs_default_static_app_path($asset);
    $real_path = realpath($file_path);

    if (
        !$app_root ||
        !$real_path ||
        strpos($real_path, $app_root . DIRECTORY_SEPARATOR) !== 0 ||
        !is_file($real_path)
    ) {
        http_response_code(404);
        nextjs_default_send_public_asset_security_headers($asset);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Static asset not found.';
        exit;
    }

    $mime_types = array(
        'css' => 'text/css; charset=utf-8',
        'gif' => 'image/gif',
        'ico' => 'image/x-icon',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'js' => 'application/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'mjs' => 'application/javascript; charset=utf-8',
        'png' => 'image/png',
        'svg' => 'image/svg+xml',
        'ttf' => 'font/ttf',
        'txt' => 'text/plain; charset=utf-8',
        'wasm' => 'application/wasm',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
    );

    $extension = strtolower(pathinfo($real_path, PATHINFO_EXTENSION));
    $content_type = isset($mime_types[$extension]) ? $mime_types[$extension] : 'application/octet-stream';

    nextjs_default_send_public_asset_security_headers($asset);
    nextjs_default_clear_static_asset_cookie_headers();
    header('Content-Type: ' . $content_type);
    nextjs_default_send_immutable_asset_cache_headers($real_path);
    // 휴대용 빌드의 JS·CSS 에는 basePath 자리표시자가 문자열로 들어 있다(라우터의 basePath,
    // CSS 의 url()). 글 파일이면 읽어서 옮긴 뒤 내보낸다.
    if (nextjs_default_is_relocatable_asset_extension($extension)) {
        $body = file_get_contents($real_path);
        if ($body !== false) {
            nextjs_default_send_response_body(g5_nextjs_relocate_portable_build($body, nextjs_default_g5_url()), $content_type);
            exit;
        }
    }
    nextjs_default_send_file_response($real_path, $content_type);
    exit;
}

/**
 * 이름에 내용 해시가 박힌 자산이므로 오래 캐시해도 안전하다.
 *
 * 그누보드 common.php 는 모든 응답에 `Expires: 0` · `Pragma: no-cache` 와 요청
 * 시각으로 갱신되는 `Last-Modified` 를 붙인다. Cache-Control 만 덮어써 봐야 이
 * 셋이 남아 브라우저가 캐시를 쓰지 못하고, 페이지를 옮길 때마다 청크 수십 개를
 * 통째로 다시 받는다. 그래서 셋을 걷어내고 파일에서 뽑은 ETag 로 갈음한다.
 */
function nextjs_default_send_immutable_asset_cache_headers($real_path)
{
    if (function_exists('header_remove')) {
        header_remove('Expires');
        header_remove('Pragma');
        header_remove('Last-Modified');
    }

    header('Cache-Control: public, max-age=31536000, immutable');

    $stat = @stat($real_path);
    if ($stat === false) {
        return;
    }

    $etag = '"' . dechex($stat['mtime']) . '-' . dechex($stat['size']) . '"';
    header('ETag: ' . $etag);

    $sent = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) : '';
    if ($sent !== '' && $sent === $etag) {
        http_response_code(304);
        exit;
    }
}

function nextjs_default_normalize_static_route_path($path = null)
{
    $path = $path === null ? nextjs_default_current_path() : (string) $path;
    $path = parse_url($path, PHP_URL_PATH);

    return $path ? '/' . trim($path, '/') : '/';
}

function nextjs_default_static_file_candidates($path = null, $extension = 'html')
{
    $extension = ltrim((string) $extension, '.');
    $path = nextjs_default_normalize_static_route_path($path);

    if ($extension === 'txt' && substr($path, -4) === '.txt') {
        $path = substr($path, 0, -4);
        $path = $path !== '' ? $path : '/';
    }

    if ($path === '/') {
        return array('index.' . $extension);
    }

    $relative = trim($path, '/');
    $candidates = array(
        $relative . '.' . $extension,
        $relative . '/index.' . $extension,
    );

    $detail_segment_candidates = function ($segment) {
        $segments = array((string) $segment, rawurldecode((string) $segment));
        $result = array();

        foreach ($segments as $candidate) {
            $candidate = trim($candidate);
            if (
                $candidate === '' ||
                $candidate === '.' ||
                $candidate === '..' ||
                strpos($candidate, '/') !== false ||
                strpos($candidate, '\\') !== false
            ) {
                continue;
            }

            $result[] = $candidate;
        }

        return array_values(array_unique($result));
    };

    $add_detail_candidates = function ($base, $segment) use (&$candidates, $extension, $detail_segment_candidates) {
        foreach ($detail_segment_candidates($segment) as $candidate) {
            $candidates[] = $base . '/' . $candidate . '.' . $extension;
            $candidates[] = $base . '/' . $candidate . '/index.' . $extension;
        }
    };

    if (preg_match('#^content/([^/]+)$#', $relative, $match)) {
        $add_detail_candidates('content', $match[1]);
    }

    if (preg_match('#^boards/([0-9A-Za-z_]+)/([^/]+)$#', $relative, $match)) {
        if ($match[2] !== 'rss' && $match[2] !== 'write') {
            $add_detail_candidates('boards/' . $match[1], $match[2]);
        }
    }

    if (
        preg_match('#^shop/products/([^/]+)$#', $relative, $match) ||
        (
            preg_match('#^shop/([^/]+)$#', $relative, $match) &&
            !nextjs_default_is_reserved_shop_short_segment($match[1]) &&
            !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $match[1])
        )
    ) {
        $add_detail_candidates('shop/products', $match[1]);
    }

    if (
        preg_match('#^([0-9A-Za-z_]+)/([^/]+)$#', $relative, $match) &&
        $match[2] !== 'rss' &&
        $match[2] !== 'write' &&
        !preg_match('#^(admin|adm|api|bbs|content|css|data|img|install|js|lib|members|mobile|plugin|shop|theme)$#', $match[1])
    ) {
        $add_detail_candidates('boards/' . $match[1], $match[2]);
    }

    $dynamic_routes = array(
        '#^boards/[^/]+$#' => 'boards/__g5_static__',
        '#^boards/[^/]+/[0-9]+$#' => 'boards/__g5_static__/0',
        '#^boards/[^/]+/write$#' => 'boards/__g5_static__/write',
        '#^content/[^/]+$#' => 'content/__g5_static__',
        '#^members/[^/]+$#' => 'members/__g5_static__',
        '#^mypage/memos/[^/]+$#' => 'mypage/memos/__g5_static__',
        '#^mypage/qas/[^/]+$#' => 'mypage/qas/__g5_static__',
        '#^shop/categories/[^/]+$#' => 'shop/categories/__g5_static__',
        '#^shop/content/[^/]+$#' => 'shop/content/__g5_static__',
        '#^shop/events/[^/]+$#' => 'shop/events/0',
        '#^shop/orders/[^/]+$#' => 'shop/orders/__g5_static__',
        '#^shop/personalpay/[^/]+/pay$#' => 'shop/personalpay/__g5_static__/pay',
        '#^shop/personalpay/[^/]+$#' => 'shop/personalpay/__g5_static__',
        '#^shop/products/[^/]+$#' => 'shop/products/__g5_static__',
        '#^shop/qas/my/[^/]+$#' => 'shop/qas/my/__g5_static__',
        '#^shop/list-[0-9a-z]+$#i' => 'shop/categories/__g5_static__',
        '#^shop/type-[0-9a-z]+$#i' => 'shop/products',
        '#^shop/(?!cart$|categories$|compare$|content$|couponzone$|events$|largeimage$|list-[0-9a-z]+$|order$|orders$|payment$|personalpay$|products$|qas$|reviews$|search$|type-[0-9a-z]+$|wishlist$)[^/]+$#i' => 'shop/products/__g5_static__',
        '#^(?!admin$|adm$|api$|bbs$|css$|data$|faq$|forgot-password$|img$|install$|js$|lib$|login$|members$|mobile$|offline$|plugin$|polls$|recent$|register$|robots\.txt$|search$|shop$|sitemap(?:-posts)?\.xml$|theme$)[0-9A-Za-z_]+$#' => 'boards/__g5_static__',
        '#^(?!admin/|adm/|api/|bbs/|css/|data/|img/|install/|js/|lib/|members/|mobile/|plugin/|shop/|theme/)[0-9A-Za-z_]+/[0-9]+$#' => 'boards/__g5_static__/0',
        '#^(?!admin/|adm/|api/|bbs/|css/|data/|img/|install/|js/|lib/|members/|mobile/|plugin/|shop/|theme/)[0-9A-Za-z_]+/write$#' => 'boards/__g5_static__/write',
        '#^(?!admin/|adm/|api/|bbs/|content/|css/|data/|img/|install/|js/|lib/|members/|mobile/|plugin/|shop/|theme/)[0-9A-Za-z_]+/[^/]+$#' => 'boards/__g5_static__/0',
    );

    foreach ($dynamic_routes as $pattern => $target) {
        if (preg_match($pattern, $relative)) {
            if (
                $target === 'shop/products/__g5_static__' &&
                preg_match('#^shop/([^/]+)$#', $relative, $shop_match) &&
                nextjs_default_is_reserved_shop_short_segment($shop_match[1])
            ) {
                continue;
            }

            $candidates[] = $target . '.' . $extension;
        }
    }

    $candidates[] = 'index.' . $extension;

    return array_values(array_unique($candidates));
}

function nextjs_default_static_html_candidates($path = null)
{
    return nextjs_default_static_file_candidates($path, 'html');
}

function nextjs_default_static_html_path($path = null)
{
    foreach (nextjs_default_static_html_candidates($path) as $candidate) {
        $html_path = nextjs_default_static_app_path($candidate);
        if (is_file($html_path)) {
            return $html_path;
        }
    }

    return nextjs_default_static_app_path('index.html');
}

function nextjs_default_static_payload_path($path = null)
{
    foreach (nextjs_default_static_file_candidates($path, 'txt') as $candidate) {
        $payload_path = nextjs_default_static_app_path($candidate);
        if (is_file($payload_path)) {
            return $payload_path;
        }
    }

    return nextjs_default_static_app_path('index.txt');
}

function nextjs_default_rewrite_static_asset_paths($html)
{
    $asset_url = nextjs_default_static_app_url();
    $asset_base = parse_url($asset_url, PHP_URL_PATH);
    if (!$asset_base) {
        $asset_base = $asset_url;
    }

    $placeholder = '__G5_NEXTJS_DEFAULT_NEXT_PREFIX__';

    $protected_bases = array_filter(array_unique(array($asset_url, $asset_base)));

    foreach ($protected_bases as $protected_base) {
        $html = str_replace($protected_base . '/_next/', $placeholder, $html);
    }

    $public_base = parse_url(nextjs_default_g5_url(), PHP_URL_PATH);
    $public_base = $public_base && $public_base !== '/' ? '/' . trim($public_base, '/') : '';

    // 사이트가 하위 경로에 있을 때만 청크 경로를 옮긴다. 루트 사이트에서 이걸
    // 무조건 돌리면 HTML 뿐 아니라 RSC 페이로드 안의 경로 문자열까지 바뀌어,
    // 브라우저가 컴포넌트를 찾지 못하고 하이드레이션이 조용히 멈춘다.
    // (루트에서는 /_next/ 를 웹서버가 그대로 테마 앱으로 넘겨 준다.)
    if ($public_base !== '') {
        $html = str_replace('/_next/', $public_base . '/_next/', $html);
    }

    $root_public_paths = array(
        '/manifest.webmanifest',
        '/manifest.json',
        '/sw.js',
    );

    foreach ($root_public_paths as $public_path) {
        $html = str_replace('href="' . $public_path . '"', 'href="' . $public_base . $public_path . '"', $html);
        $html = str_replace("href='" . $public_path . "'", "href='" . $public_base . $public_path . "'", $html);
        $html = str_replace('src="' . $public_path . '"', 'src="' . $public_base . $public_path . '"', $html);
        $html = str_replace("src='" . $public_path . "'", "src='" . $public_base . $public_path . "'", $html);
        $html = str_replace('content="' . $public_path . '"', 'content="' . $public_base . $public_path . '"', $html);
        $html = str_replace("content='" . $public_path . "'", "content='" . $public_base . $public_path . "'", $html);
    }

    $public_paths = array(
        '/favicon.ico',
        '/icon-72.png',
        '/icon-192.png',
        '/icon-512.png',
        '/og-default.png',
    );

    foreach ($public_paths as $public_path) {
        $html = str_replace('href="' . $public_path . '"', 'href="' . $asset_base . $public_path . '"', $html);
        $html = str_replace("href='" . $public_path . "'", "href='" . $asset_base . $public_path . "'", $html);
        $html = str_replace('src="' . $public_path . '"', 'src="' . $asset_base . $public_path . '"', $html);
        $html = str_replace("src='" . $public_path . "'", "src='" . $asset_base . $public_path . "'", $html);
        $html = str_replace('content="' . $public_path . '"', 'content="' . $asset_base . $public_path . '"', $html);
        $html = str_replace("content='" . $public_path . "'", "content='" . $asset_base . $public_path . "'", $html);
    }

    $html = preg_replace_callback(
        "#(?<![/A-Za-z0-9_.-])static/(chunks|css|media)/([^\"'\\\\<>\\s\\]]+)#",
        function ($match) use ($asset_base) {
            return $asset_base . '/_next/static/' . $match[1] . '/' . $match[2];
        },
        $html
    );

    return str_replace($placeholder, $asset_base . '/_next/', $html);
}
