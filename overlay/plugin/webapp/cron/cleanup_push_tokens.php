<?php
/**
 * 쌓이는 표 정리 cron — 푸시 토큰 · 푸시 큐 · 알림함 · 만료된 로그인 유지 토큰 · 소셜 가입 입장권 · 오래된 기기의 IP.
 *
 * 무엇을 언제 지우는지는 api/lib/TableCleanup.php 에 있다(보존 일수는 WEBAPP_*_KEEP_DAYS 상수, 0 이면 건너뜀).
 * 크론을 걸 수 없는 호스팅에서는 새 화면이 보내는 유지보수 신호(POST /v1/maintenance/tick)가 하루 한 번 같은 정리를 돈다.
 *
 * 사용:
 *   php plugin/webapp/cron/cleanup_push_tokens.php             # 실제 정리
 *   php plugin/webapp/cron/cleanup_push_tokens.php --dry-run   # 개수만
 *
 * 등록 (Linux cron):
 *   0 3 * * 0  /usr/bin/php /var/www/g5site/plugin/webapp/cron/cleanup_push_tokens.php >> /var/log/cleanup_push.log 2>&1
 *   (매주 일요일 새벽 3시)
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

$DRY_RUN = in_array('--dry-run', $argv, true);

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) define('_GNUBOARD_', true);
ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();
require_once dirname(__DIR__, 3) . '/api/lib/TableCleanup.php';

$failed = false;
foreach (TableCleanup::run($DRY_RUN) as $step => $rows) {
    if ($rows < 0) {
        $failed = true;
        logf("%s failed (see the PHP error log)", $step);
        continue;
    }
    logf($DRY_RUN ? "--dry-run: would clean %s=%d" : "cleaned %s=%d", $step, $rows);
}
exit($failed ? 1 : 0);

function logf(string $fmt, ...$args): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . vsprintf($fmt, $args);
    fwrite(STDOUT, $line . PHP_EOL);
}
