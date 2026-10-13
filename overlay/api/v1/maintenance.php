<?php
/**
 * POST /v1/maintenance/tick — 화면이 다 뜬 뒤 보내는 백그라운드 신호(nextjs/src/lib/maintenance-beacon.ts).
 *
 * 크론 없는 공유 호스팅(카페24 — PHP 가 Apache 모듈이라 fastcgi_finish_request 로 응답을 먼저 끝낼 수 없다)에서
 * 주기 작업을 손님 요청 끝에 얹으면 그 손님이 기다린다. 이 요청은 아무도 결과를 기다리지 않으므로 여기서 돌린다.
 * - 만료된 우리 세션 파일 청소 — 한 시간에 한 번(plugin/webapp/session_guard.php, 응답 뒤 청소와 같은 차례 표시)
 * - 쌓이는 표 정리 — 하루에 한 번(api/lib/TableCleanup.php, 정리 크론과 같은 일). 크론이 없어도 알림 · 로그인 토큰 ·
 *   가입 입장권 · 기기 IP 가 끝없이 쌓이지 않게 한다. 결과는 돌았다는 것만 알린다(지운 개수는 내지 않는다).
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

// 크론으로 이미 정리하는 사이트는 extend/ 에서 define('WEBAPP_TICK_CLEANUP', false) 로 끌 수 있다.
// 표 정리는 이 요청이 이미 쓴 시간(세션 청소 등)을 뺀 나머지만 쓴다 — 최대 8초, 합쳐 25초 안(PHP 실행 제한은 보통 30초).
// 2초도 안 남으면 차례 표시를 잡지 않고 다음 신호로 넘긴다(하루를 잃지 않는다).
$tickStarted = isset($_SERVER['REQUEST_TIME_FLOAT']) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : microtime(true);
$tableCleanupBudget = min(8.0, 25.0 - (microtime(true) - $tickStarted));
$tableCleanupStamp = defined('G5_DATA_PATH') ? G5_DATA_PATH . '/cache/g5app_table_cleanup.txt' : '';
if ((!defined('WEBAPP_TICK_CLEANUP') || WEBAPP_TICK_CLEANUP) && $tableCleanupStamp !== '' && $tableCleanupBudget >= 2.0
    && function_exists('webapp_session_gc_claim') && webapp_session_gc_claim($tableCleanupStamp, 86400)) {
    require_once dirname(__DIR__) . '/lib/TableCleanup.php';
    // 웹 요청이라 몇 초 안에서만 — 나눠 지운 몫은 남으므로, 다 못 끝냈으면 하루가 아니라 5분 뒤 이어서 하게 표식을 당긴다.
    $ran['table_cleanup'] = TableCleanup::runWithin($tableCleanupBudget);
    if (!$ran['table_cleanup']) {
        @touch($tableCleanupStamp, time() - 86400 + 300);
    }
}

// 쇼핑몰 주기 작업은 shop/common.php 가(결제 초안 정리) · api/index.php 가(주문 상태 푸시) shutdown 에 건다.
if (defined('G5_USE_SHOP') && G5_USE_SHOP && is_file(__DIR__ . '/shop/common.php')) {
    require_once __DIR__ . '/shop/common.php';
    $ran['shop_passes'] = true;
}

Response::success(array('ran' => $ran));
