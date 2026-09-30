<?php
/**
 * 결제 초안 24시간 자동 취소 수동 실행(앱 SC-15) — 개발 PC 확인용.
 *
 * 운영(카페24)은 크론이 없어 /shop/* API 요청 끝(api/v1/shop/common.php, 10분 스로틀)에서 자동으로 돈다.
 * 크론이 있는 서버라면 이 파일을 10분마다 불러도 된다.
 *
 * 사용:
 *   php plugin/webapp/cron/cancel_stale_payment_drafts.php
 *   php plugin/webapp/cron/cancel_stale_payment_drafts.php --limit=100
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
require_once dirname(__DIR__, 3) . '/api/v1/shop/cart_status_helpers.php';
require_once dirname(__DIR__, 3) . '/api/v1/shop/common_session_helpers.php';
require_once dirname(__DIR__, 3) . '/api/v1/shop/stale_draft_helpers.php';

$limit = 20;
foreach ($argv ?? [] as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) $limit = max(1, (int) $m[1]);
}

$cancelled = shop_api_cancel_stale_payment_drafts($limit);
fwrite(STDOUT, sprintf("[%s] cancel_stale_payment_drafts cancelled=%d\n", date('Y-m-d H:i:s'), $cancelled));
