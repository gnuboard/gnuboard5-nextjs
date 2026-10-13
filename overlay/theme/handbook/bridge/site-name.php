<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 브라우저 탭 · 공유 카드 · 구조화 데이터의 사이트 이름 — 정적 빌드에는 테마 기본 이름("매뉴얼")이 박혀 있어,
 * 요청 때 설치본의 사이트 제목(관리자 > 기본환경설정 > 홈페이지 제목, cf_title)으로 바꾼다.
 * theme/nextjs_default/bridge/seo.php 의 사이트 이름 부분과 같은 규칙이다(제목 · 메타 · JSON-LD · 페이지 안 React 데이터를
 * 똑같이 바꿔야 JS 가 돈 뒤에도 태그가 한 벌로 맞는다). 화면의 로고 · 바닥글 글자는 테마 화면 설정이 맡는다.
 */

/** 빌드에 박힌 테마 기본 이름 — index.html 의 <meta name="application-name">. */
function handbook_site_theme_name()
{
    static $name = null;
    if ($name !== null) {
        return $name;
    }

    $name = '';
    $path = function_exists('handbook_static_app_path') ? handbook_static_app_path('index.html') : '';
    $html = $path !== '' && is_file($path) ? file_get_contents($path) : false;
    $match = array();
    if (is_string($html) && preg_match('/<meta\s+name="application-name"\s+content="([^"]*)"/i', $html, $match)) {
        $name = html_entity_decode($match[1], ENT_QUOTES, 'UTF-8');
    }

    return $name;
}

/** 설치본의 사이트 제목(cf_title). 비어 있으면 ''. */
function handbook_site_name()
{
    global $config;

    $title = isset($config['cf_title']) ? (string) $config['cf_title'] : '';

    return trim(html_entity_decode(strip_tags($title), ENT_QUOTES, 'UTF-8'));
}

/** JSON 문자열 값 안에 들어갈 모양(양끝 따옴표 없이). < > & 는 \u 로 — HTML 안 <script> 에서도 안전. */
function handbook_site_json_inner($value)
{
    $json = json_encode((string) $value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS);

    return is_string($json) ? substr($json, 1, -1) : '';
}

function handbook_site_replace_in_group($text, $pattern, $from, $to)
{
    $result = preg_replace_callback($pattern, function ($match) use ($from, $to) {
        return $match[1] . str_replace($from, $to, $match[2]) . $match[3];
    }, $text);

    return is_string($result) ? $result : $text;
}

/**
 * $from(테마 기본 이름)을 $to(사이트 제목)로 — <head> 의 제목 · 메타, 구조화 데이터의 name, 페이지 안 React 데이터.
 * $payload 는 클라이언트 이동으로 받는 RSC 데이터(.txt)일 때. 본문 글자는 건드리지 않는다.
 */
function handbook_site_name_replace($text, $from, $to, $payload = false)
{
    $text = (string) $text;
    if ($from === '' || $to === '' || $from === $to) {
        return $text;
    }

    $json_from = handbook_site_json_inner($from);
    $json_to = handbook_site_json_inner($to);

    if ($payload) {
        $text = handbook_site_replace_in_group($text, '/("content":")([^"\\\\]*)(")/', $json_from, $json_to);

        return handbook_site_replace_in_group($text, '/("title","[^"\\\\]*",\{"children":")([^"\\\\]*)(")/', $json_from, $json_to);
    }

    $head_end = stripos($text, '</head>');
    if ($head_end !== false) {
        $head = substr($text, 0, $head_end);
        $html_from = htmlspecialchars($from, ENT_QUOTES, 'UTF-8');
        $html_to = htmlspecialchars($to, ENT_QUOTES, 'UTF-8');
        $head = handbook_site_replace_in_group($head, '#(<title>)([^<]*)(</title>)#', $html_from, $html_to);
        $head = handbook_site_replace_in_group($head, '/(<meta\s[^>]*?content=")([^"]*)(")/i', $html_from, $html_to);
        $text = $head . substr($text, $head_end);
    }

    $text = handbook_site_replace_in_group(
        $text,
        '#(<script type="application/ld\+json"[^>]*>)(.*?)(</script>)#s',
        '"name":"' . $json_from . '"',
        '"name":"' . $json_to . '"'
    );

    $flight_from = handbook_site_json_inner($json_from);
    $flight_to = handbook_site_json_inner($json_to);
    $text = handbook_site_replace_in_group($text, '/(\\\\"content\\\\":\\\\")([^"\\\\]*)(\\\\")/', $flight_from, $flight_to);

    return handbook_site_replace_in_group(
        $text,
        '/(\\\\"title\\\\",\\\\"[^"\\\\]*\\\\",\{\\\\"children\\\\":\\\\")([^"\\\\]*)(\\\\")/',
        $flight_from,
        $flight_to
    );
}

function handbook_apply_site_name($text, $payload = false)
{
    return handbook_site_name_replace($text, handbook_site_theme_name(), handbook_site_name(), $payload);
}

/** PWA 앱 이름(manifest 의 name)도 사이트 제목으로. */
function handbook_apply_site_name_to_manifest(array $manifest)
{
    $from = handbook_site_theme_name();
    $to = handbook_site_name();
    if ($to !== '' && isset($manifest['name']) && (string) $manifest['name'] === $from) {
        $manifest['name'] = $to;
    }

    return $manifest;
}
