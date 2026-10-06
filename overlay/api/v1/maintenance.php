<?php
/**
 * POST /v1/maintenance/tick — 화면이 다 뜬 뒤 보내는 백그라운드 신호(nextjs/src/lib/maintenance-beacon.ts).
 *
 * 크론 없는 공유 호스팅(카페24 — PHP 가 Apache 모듈이라 fastcgi_finish_request 로 응답을 먼저 끝낼 수 없다)에서
 * 주기 작업을 손님 요청 끝에 얹으면 그 손님이 기다린다. 이 요청은 아무도 결과를 기다리지 않으므로 여기서 돌린다.
 * - 만료된 우리 세션 파일 청소 — 한 시간에 한 번(plugin/webapp/session_guard.php, 응답 뒤 청소와 같은 차례 표시)
 * - 쇼핑몰 주기 작업(주문 상태 푸시 5분 · 결제 초안 정리 10분) — 이 요청 끝에서 돈다. 손님 요청 끝에서도
 *   그대로 돌므로(신호가 오지 않는 사이트도 있다) 여기서 먼저 처리해 두면 손님 요청이 떠안는 일이 줄어든다.
 * 할 일이 없으면 바로 끝난다. 누구나 부를 수 있지만 각 작업은 정해진 간격보다 자주 돌지 않는다.
 */

if (!defined('_GNUBOARD_')) exit;

/** @var string   $apiMethod */
/** @var string[] $apiSegments */

if ($apiMethod !== 'POST' || ($apiSegments[0] ?? '') !== 'tick') {
    Response::error('Not found.', 404);
}

// 세션 잠금을 오래 쥐지 않게 먼저 닫고, 브라우저가 연결을 먼저 끊어도 끝까지 돈다.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
ignore_user_abort(true);

$ran = array();

if (function_exists('webapp_session_gc_claim') && class_exists('WebappSessionHandler', false)
    && WebappSessionHandler::$installed && defined('G5_DATA_PATH')) {
    $sessionDir = webapp_session_files_dir();
    if ($sessionDir !== '' && webapp_session_gc_claim(G5_DATA_PATH . '/cache/g5app_session_gc.txt', 3600)) {
        $cleaned = webapp_session_gc_run($sessionDir, (int) ini_get('session.gc_maxlifetime'), 20.0);
        $ran['session_gc'] = $cleaned['deleted'];
    }
}

// 쇼핑몰 주기 작업은 shop/common.php 가(결제 초안 정리) · api/index.php 가(주문 상태 푸시) shutdown 에 건다.
if (defined('G5_USE_SHOP') && G5_USE_SHOP && is_file(__DIR__ . '/shop/common.php')) {
    require_once __DIR__ . '/shop/common.php';
    $ran['shop_passes'] = true;
}

Response::success(array('ran' => $ran));
