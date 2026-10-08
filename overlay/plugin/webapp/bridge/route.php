<?php
// 세션 — 공유 호스팅(/tmp)의 세션 청소 멈춤과 쿠키 없는 요청의 빈 세션 파일을 막는다(코어보다 먼저 감싸야 한다).
require_once dirname(__DIR__) . '/session_guard.php';
webapp_session_guard_install();
require_once dirname(__DIR__, 3) . '/common.php';

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

// 홈(/ · /index.php) — .htaccess 가 위의 세션 처리기를 거치게 하려고 이리 보낸다. 그리는 일은 원래처럼 그누보드
// index.php 가 한다(테마 index · 설치 안내 · 커뮤니티 끔 처리 그대로). 전역 변수를 쓰므로 함수 밖에서 읽는다.
if (g5_nextjs_is_home_request() && is_file(G5_PATH . '/index.php')) {
    $g5_nextjs_home_script = rtrim((string) parse_url(G5_URL, PHP_URL_PATH), '/') . '/index.php';
    $_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = $g5_nextjs_home_script;
    $_SERVER['SCRIPT_FILENAME'] = G5_PATH . '/index.php';
    chdir(G5_PATH); // index.php 는 './_common.php' 처럼 현재 폴더 기준으로 읽는다
    require G5_PATH . '/index.php';
    exit;
}

g5_nextjs_redirect_legacy_admin_request();

$g5_nextjs_theme = g5_nextjs_runtime_active_theme();
$g5_nextjs_route = g5_nextjs_theme_route_path($g5_nextjs_theme);

if ($g5_nextjs_route !== '' && is_file($g5_nextjs_route)) {
    require $g5_nextjs_route;
    exit;
}

http_response_code(404);
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Content-Type: text/plain; charset=utf-8');
echo 'Active Next.js theme route was not found.';
