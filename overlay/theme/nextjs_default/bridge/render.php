<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function nextjs_default_runtime_config()
{
    return array(
        'apiBaseUrl' => nextjs_default_api_url(),
        'g5BaseUrl' => nextjs_default_g5_url(),
        'appBaseUrl' => nextjs_default_g5_url(),
        'assetBaseUrl' => nextjs_default_static_app_url(),
        'themeUrl' => nextjs_default_theme_url(),
        'currentPath' => nextjs_default_current_path(),
        // 검색엔진 노출 설정(G5_NEXTJS_SEO*, 설치본의 api/.env) — 상세 화면의 JS 가 robots 를 같은 값으로 맞춘다.
        'seo' => nextjs_default_seo_runtime_config(),
        // 설치본의 사이트 제목(cf_title) — 브라우저 JS 가 제목 뒤에 붙이는 사이트 이름.
        'siteName' => nextjs_default_seo_site_name(),
    );
}

function nextjs_default_runtime_config_key()
{
    $key = '';

    foreach (array('G5_RUNTIME_CONFIG_KEY', 'G5_WEBAPP_RUNTIME_CONFIG_KEY', 'NEXT_PUBLIC_RUNTIME_CONFIG_KEY') as $constant) {
        if (defined($constant) && trim((string) constant($constant)) !== '') {
            $key = trim((string) constant($constant));
            break;
        }
    }

    if ($key === '') {
        $env_key = getenv('NEXT_PUBLIC_RUNTIME_CONFIG_KEY');
        if (is_string($env_key) && trim($env_key) !== '') {
            $key = trim($env_key);
        }
    }

    if (
        $key === '' ||
        !preg_match('/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/', $key) ||
        in_array($key, array('__proto__', 'prototype', 'constructor'), true)
    ) {
        return '__G5_APP_CONFIG__';
    }

    return $key;
}

function nextjs_default_json($value)
{
    return json_encode(
        $value,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );
}

function nextjs_default_json_string($value)
{
    $json = nextjs_default_json((string) $value);

    return is_string($json) ? substr($json, 1, -1) : '';
}

function nextjs_default_rewrite_runtime_route_sentinel($text)
{
    $path = parse_url(nextjs_default_current_path(), PHP_URL_PATH);
    $route = trim((string) $path, '/');
    if (substr($route, -4) === '.txt') {
        $route = substr($route, 0, -4);
    }

    $patterns = array(
        '#^mypage/memos/([^/]+)$#',
        '#^mypage/qas/([^/]+)$#',
        '#^shop/qas/my/([^/]+)$#',
    );
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $route, $match)) {
            $value = rawurldecode((string) $match[1]);
            // 영문 · 숫자 · _ · - 만 넣는다(실제 값은 쪽지 · 문의 번호). 값이 HTML 의 스크립트 문자열 안에 그대로
            // 들어가므로, 금지 문자를 고르는 대신 허용 문자만 받는다 — < > & = 등도 들어가지 않게.
            if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $value)) {
                return str_replace('__g5_static__', $value, $text);
            }
        }
    }

    return $text;
}

function nextjs_default_inject_runtime_config($html)
{
    // Theme-NEUTRAL runtime-config key so one static export resolves URLs from whichever
    // theme is active. The legacy nextjs_default alias is emitted for one transition release so a
    // not-yet-rebuilt bundle keeps working; it can be dropped once all bundles read the
    // neutral key.
    $payload = nextjs_default_json(nextjs_default_runtime_config());
    $key = nextjs_default_json(nextjs_default_runtime_config_key());
    $config = '<script>window[' . $key . '] = ' . $payload . ';'
        . 'window.__G5_APP_CONFIG__ = window[' . $key . '];'
        . 'window.__G5_NEXTJS_DEFAULT_CONFIG__ = window[' . $key . '];'
        . g5_nextjs_root_payload_shim_script() . '</script>';

    if (preg_match('/<head([^>]*)>/i', $html)) {
        return preg_replace('/<head([^>]*)>/i', '<head$1>' . "\n" . $config, $html, 1);
    }

    return $config . "\n" . $html;
}

function nextjs_default_render_missing_app()
{
    nextjs_default_send_security_headers();
    header('Content-Type: text/html; charset=utf-8');
    ?>
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>G5 Next.js 25</title>
</head>
<body>
<main style="max-width:720px;margin:48px auto;font-family:Arial,sans-serif;line-height:1.6">
    <h1>G5 Next.js 25 static app is not installed.</h1>
    <p>Build the web app and sync the export output into <code>theme/nextjs_default/app</code>.</p>
    <p>API: <code><?php echo htmlspecialchars(nextjs_default_api_url(), ENT_QUOTES, 'UTF-8'); ?></code></p>
</main>
</body>
</html>
    <?php
}

function nextjs_default_render_app_shell()
{
    $index_path = nextjs_default_static_html_path();

    if (!is_file($index_path)) {
        nextjs_default_render_missing_app();
        return;
    }

    $html = file_get_contents($index_path);
    if ($html === false) {
        nextjs_default_render_missing_app();
        return;
    }

    // 휴대용 빌드(자리표시자 basePath)는 여기서 실제 설치 경로로 옮기고, 예전 방식의
    // /_next/ 치환은 건너뛴다. 두 번 붙으면 /gnu5512/gnu5512/_next/ 가 된다.
    $portable = g5_nextjs_is_portable_build_text($html);
    $html = g5_nextjs_relocate_portable_build($html, nextjs_default_g5_url());
    $html = nextjs_default_rewrite_runtime_route_sentinel($html);
    if (!$portable) {
        $html = nextjs_default_rewrite_static_asset_paths($html);
    }
    $html = nextjs_default_rewrite_runtime_metadata_urls($html, $index_path);
    // 검색엔진 노출은 빌드에 굽지 않고 여기서 정한다 — 목록·분류 제목, robots(<head>·React 데이터 모두 같은 값).
    $html = nextjs_default_seo_apply_to_html($html, $index_path);
    $html = nextjs_default_seo_apply_site_name($html);
    $html = nextjs_default_inject_runtime_config($html);
    // 쇼핑 홈 배너 · 분류 줄이 있는지 첫 페인트 전에 알린다(shop-layout-hint.ts). 예전 핵심 꾸러미에는 없는 함수다.
    if (function_exists('g5_webapp_inject_shop_home_layout')) {
        $html = g5_webapp_inject_shop_home_layout($html);
    }
    $html = nextjs_default_add_script_nonce($html);

    // 없는 글·상품 주소는 404 — 화면은 앱의 "찾을 수 없습니다" 그대로. 권한 때문에 못 보는 글은 200.
    if (nextjs_default_requested_record_missing($index_path)) {
        http_response_code(404);
    }
    nextjs_default_send_security_headers();
    nextjs_default_seo_send_robots_header($index_path);
    nextjs_default_send_public_revalidate_headers();
    $content_type = 'text/html; charset=utf-8';
    header('Content-Type: ' . $content_type);
    nextjs_default_send_response_body($html, $content_type);
}

function nextjs_default_render_static_payload()
{
    $payload_path = nextjs_default_static_payload_path();

    if (!is_file($payload_path)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Static payload not found.';
        return;
    }

    $payload = file_get_contents($payload_path);
    if ($payload === false) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Static payload not found.';
        return;
    }

    $portable = g5_nextjs_is_portable_build_text($payload);
    $payload = g5_nextjs_relocate_portable_build($payload, nextjs_default_g5_url());
    $payload = nextjs_default_rewrite_runtime_route_sentinel($payload);
    if (!$portable) {
        $payload = nextjs_default_rewrite_static_asset_paths($payload);
    }
    $payload = nextjs_default_rewrite_static_payload_metadata_urls($payload);
    // 클라이언트 이동으로 받는 속 데이터도 HTML 과 같은 robots 값을 싣는다.
    $payload = nextjs_default_seo_rewrite_robots($payload, nextjs_default_seo_robots_for($payload_path));
    $payload = nextjs_default_seo_apply_site_name($payload, true);

    nextjs_default_send_security_headers(false);
    nextjs_default_send_public_revalidate_headers();
    $content_type = 'text/x-component; charset=utf-8';
    header('Content-Type: ' . $content_type);
    header('X-Robots-Tag: noindex, nofollow');
    nextjs_default_send_response_body($payload, $content_type);
}
