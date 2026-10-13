<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function handbook_runtime_config()
{
    return array(
        'apiBaseUrl' => handbook_api_url(),
        'g5BaseUrl' => handbook_g5_url(),
        'appBaseUrl' => handbook_g5_url(),
        'assetBaseUrl' => handbook_static_app_url(),
        'themeUrl' => handbook_theme_url(),
        'currentPath' => handbook_current_path(),
        // 설치본의 사이트 제목(cf_title) — 브라우저 JS 가 화면을 옮길 때 제목 뒤에 붙이는 사이트 이름(site-name.php).
        'siteName' => handbook_site_name(),
        // 관리자 › 테마 설정의 공개 값(왼쪽 메뉴 · 사이트 문구) — 정적 빌드는 이 값을 화면에 붙자마자 읽는다(요청을 더하지 않는다).
        'themeSettings' => function_exists('handbook_theme_settings_public') ? handbook_theme_settings_public() : null,
        // 이 HTML 의 data-ts 글자를 위 설정으로 이미 바꿨는가 — 화면이 하이드레이션부터 설정을 쓸지 정한다(settings-html.php).
        'themeSettingsApplied' => function_exists('handbook_settings_html_applied') ? handbook_settings_html_applied() : false,
    );
}

function handbook_runtime_config_key()
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

function handbook_json($value)
{
    return json_encode(
        $value,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );
}

function handbook_json_string($value)
{
    $json = handbook_json((string) $value);

    return is_string($json) ? substr($json, 1, -1) : '';
}

function handbook_rewrite_runtime_route_sentinel($text)
{
    $path = parse_url(handbook_current_path(), PHP_URL_PATH);
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
            // 제어문자 · " · ' · / · \ 가 든 값은 넣지 않는다. 문자는 PCRE 16진 이스케이프로만 쓴다 —
            // 작은따옴표 PHP 문자열에서 '\\\x00' 은 역슬래시 뒤 "x00" 이 되어 "0-\x1F" 거꾸로 된 범위로
            // 읽히고, 그 Warning 이 gzip 본문 앞에 찍혀 /mypage/memos/new 같은 화면이 하얗게 떴다.
            if ($value !== '' && !preg_match('/[\x00-\x1F\x7F\x22\x27\x2F\x5C]/', $value)) {
                return str_replace('__g5_static__', $value, $text);
            }
        }
    }

    return $text;
}

function handbook_inject_runtime_config($html)
{
    // Theme-NEUTRAL runtime-config key so one static export resolves URLs from whichever
    // theme is active. The legacy handbook alias is emitted for one transition release so a
    // not-yet-rebuilt bundle keeps working; it can be dropped once all bundles read the
    // neutral key.
    $payload = handbook_json(handbook_runtime_config());
    $key = handbook_json(handbook_runtime_config_key());
    $config = '<script>window[' . $key . '] = ' . $payload . ';'
        . 'window.__G5_APP_CONFIG__ = window[' . $key . '];'
        . 'window.__G5_HANDBOOK_CONFIG__ = window[' . $key . '];'
        . g5_nextjs_root_payload_shim_script() . '</script>';

    // 글자 그대로 넣는다 — 관리자 문구 · 사이트 제목의 $1 · \ 를 치환 문법으로 읽지 않게(plugin/webapp/bridge/common.php).
    return g5_nextjs_insert_after_head($html, $config);
}

function handbook_render_missing_app()
{
    handbook_send_security_headers();
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
    <p>Build the web app and sync the export output into <code>theme/handbook/app</code>.</p>
    <p>API: <code><?php echo htmlspecialchars(handbook_api_url(), ENT_QUOTES, 'UTF-8'); ?></code></p>
</main>
</body>
</html>
    <?php
}

function handbook_render_app_shell()
{
    $index_path = handbook_static_html_path();

    if (!is_file($index_path)) {
        handbook_render_missing_app();
        return;
    }

    $html = file_get_contents($index_path);
    if ($html === false) {
        handbook_render_missing_app();
        return;
    }

    // 휴대용 빌드(자리표시자 basePath)는 여기서 실제 설치 경로로 옮기고, 예전 방식의
    // /_next/ 치환은 건너뛴다. 두 번 붙으면 /gnu5512/gnu5512/_next/ 가 된다.
    $portable = g5_nextjs_is_portable_build_text($html);
    $html = g5_nextjs_relocate_portable_build($html, handbook_g5_url());
    $html = handbook_rewrite_runtime_route_sentinel($html);
    if (!$portable) {
        $html = handbook_rewrite_static_asset_paths($html);
    }
    $html = handbook_rewrite_runtime_metadata_urls($html, $index_path);
    // 탭 제목 · 메타 · 구조화 데이터의 테마 기본 이름("매뉴얼")을 설치본의 사이트 제목으로.
    $html = handbook_apply_site_name($html);
    // 관리자 › 테마 화면 설정 문구(data-ts)와 이 주소의 사이드바 — 첫 그림부터 저장한 값으로(settings-html.php).
    $html = handbook_apply_theme_settings_html($html);
    $html = handbook_inject_runtime_config($html);
    $html = handbook_add_script_nonce($html);

    handbook_send_security_headers();
    handbook_send_public_revalidate_headers();
    $content_type = 'text/html; charset=utf-8';
    header('Content-Type: ' . $content_type);
    handbook_send_response_body($html, $content_type);
}

function handbook_render_static_payload()
{
    $payload_path = handbook_static_payload_path();

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
    $payload = g5_nextjs_relocate_portable_build($payload, handbook_g5_url());
    $payload = handbook_rewrite_runtime_route_sentinel($payload);
    if (!$portable) {
        $payload = handbook_rewrite_static_asset_paths($payload);
    }
    $payload = handbook_rewrite_static_payload_metadata_urls($payload);
    // 클라이언트 이동으로 받는 속 데이터도 HTML 과 같은 사이트 이름을 싣는다.
    $payload = handbook_apply_site_name($payload, true);

    handbook_send_security_headers(false);
    handbook_send_public_revalidate_headers();
    $content_type = 'text/x-component; charset=utf-8';
    header('Content-Type: ' . $content_type);
    header('X-Robots-Tag: noindex, nofollow');
    handbook_send_response_body($payload, $content_type);
}
