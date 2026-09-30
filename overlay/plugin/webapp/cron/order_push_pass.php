<?php
/**
 * 주문 상태 푸시 패스 수동 실행(앱 SC-07) — 개발 PC 확인용.
 *
 * 운영(카페24)은 크론이 없어 이 패스를 관리자 주문 저장 직후(plugin/webapp/notify/admin_order_push.php)와 API 요청 끝
 * (api/index.php, 5분 스로틀)에서 자동으로 돌린다. 크론이 있는 서버라면 이 파일을 5분마다 불러도 된다.
 *
 * 사용:
 *   php plugin/webapp/cron/order_push_pass.php
 *   php plugin/webapp/cron/order_push_pass.php --limit=100
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) define('_GNUBOARD_', true);

ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();

require_once dirname(__DIR__, 3) . '/api/lib/DB.php';
require_once dirname(__DIR__, 3) . '/api/lib/PushQueue.php';
require_once dirname(__DIR__, 3) . '/api/v1/shop/order_push_helpers.php';

$limit = 50;
foreach ($argv ?? [] as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) $limit = max(1, (int) $m[1]);
}

$result = shop_api_run_order_push_pass($limit);
fwrite(STDOUT, sprintf("[%s] order_push_pass paid=%d shipped=%d\n", date('Y-m-d H:i:s'), $result['paid'], $result['shipped']));
