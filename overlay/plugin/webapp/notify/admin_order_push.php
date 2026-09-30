<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 그누보드5 앱 — 주문 상태 푸시 트리거 A (앱 SERVER-CHANGES SC-07).
 * 예전 extend/g5app.extend.php 를 옮긴 것(2026-09-30) — 그누보드 훅은 extend/webapp.extend.php 하나로 둔다.
 *
 * 무통장 입금 확인과 송장 입력은 레거시 관리자 화면에서만 일어나고, 그 화면들에는 run_event 훅이 없다.
 * 코어는 고치지 않고, 아래 주문 저장 스크립트에 관리자가 POST 했을 때 응답이 끝난 뒤(shutdown)
 * 주문 푸시 패스를 한 번 돌린다 — 크론 없이 곧바로 paid/shipped 알림이 간다.
 * 패스는 od_push_*_at 을 먼저 찍은 쪽만 보내므로 API 쪽 패스(api/index.php)와 겹쳐도 한 번만 간다.
 */
$g5app_order_push_scripts = array(
    'orderformreceiptupdate.php',
    'orderlistupdate.php',
    'orderdeliveryupdate.php',
    'orderformupdate.php',
    'orderformcartupdate.php',
    'orderpartcancelupdate.php',
);
$g5app_script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));

if (
    ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    && strpos($g5app_script, '/adm/shop_admin/') !== false
    && in_array(basename($g5app_script), $g5app_order_push_scripts, true)
    && is_file(G5_PATH . '/api/v1/shop/order_push_helpers.php')
) {
    register_shutdown_function(static function () {
        global $is_admin;
        if (empty($is_admin)) {
            return;
        }
        // 관리자에게 가는 리다이렉트를 먼저 내보내고 나서 보낸다.
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        require_once G5_PATH . '/api/v1/shop/order_push_helpers.php';
        shop_api_run_order_push_pass();
    });
}

unset($g5app_order_push_scripts, $g5app_script);
