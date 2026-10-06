<?php
// 세션 — 공유 호스팅(/tmp)의 세션 청소 멈춤과 쿠키 없는 요청의 빈 세션 파일을 막는다(코어보다 먼저 감싸야 한다).
require_once dirname(__DIR__) . '/session_guard.php';
webapp_session_guard_install();
require_once dirname(__DIR__, 3) . '/common.php';

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

g5_nextjs_redirect_legacy_admin_request();

$g5_nextjs_theme = g5_nextjs_runtime_active_theme();
$g5_nextjs_route = g5_nextjs_theme_route_path($g5_nextjs_theme);

if ($g5_nextjs_route !== '' && is_file($g5_nextjs_route)) {
    require $g5_nextjs_route;
    exit;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Active Next.js theme route was not found.';
