<?php
/**
 * 푸시 큐 워커 — push_queue 의 pending 작업을 청크 단위로 claim → Expo Push 호출.
 *
 * 단일 cron 으로 충분: 매분 실행해 시간 예산 안에서 처리 가능한 만큼만 처리하고,
 * 남은 pending 은 다음 cron 이 이어받음. SELECT … FOR UPDATE SKIP LOCKED 로
 * 동시 worker 가 같이 실행돼도 안전.
 *
 * 사용:
 *   php plugin/webapp/cron/process_push_queue.php
 *   php plugin/webapp/cron/process_push_queue.php --limit=500
 *   php plugin/webapp/cron/process_push_queue.php --time-budget=50    # 초, 기본 50
 *   php plugin/webapp/cron/process_push_queue.php --verbose
 */
declare(strict_types=1);

// 부트스트랩 여부 판정 — DB 클래스 로드돼있고 _GNUBOARD_ 정의돼있으면 inline 호출로 간주.
$invokedDirectly = !class_exists('DB');

if ($invokedDirectly) {
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
    require_once dirname(__DIR__, 3) . '/api/lib/SentryReport.php';
}

if (!function_exists('worker_logf')) {
    function worker_logf(string $fmt, ...$args): void
    {
        $line = '[' . date('Y-m-d H:i:s') . '] ' . vsprintf($fmt, $args);
        fwrite(STDOUT, $line . PHP_EOL);
    }
}

// argv 가 enqueuer 에서 require 된 경우엔 그대로 공유됨.
$LIMIT       = 500;
$TIME_BUDGET = 50; // seconds — cron 1분 주기에서 안전 마진
$VERBOSE     = false;
foreach ($argv ?? [] as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) $LIMIT = max(1, (int) $m[1]);
    if (preg_match('/^--time-budget=(\d+)$/', $arg, $m)) $TIME_BUDGET = max(1, (int) $m[1]);
    if ($arg === '--verbose') $VERBOSE = true;
}

worker_logf("=== process_push_queue start (limit=%d, time_budget=%ds) ===", $LIMIT, $TIME_BUDGET);

// 발송 자체는 PushQueue::process() — Notify::emit 의 즉시 발송과 같은 코드다.
$result    = PushQueue::process($LIMIT, (float) $TIME_BUDGET, 'worker_logf', $VERBOSE);
$processed = $result['processed'];
$sentOk    = $result['ok'];
$failed    = $result['err'];

$stats = PushQueue::stats();
worker_logf("=== process_push_queue done. processed=%d ok=%d err=%d ===", $processed, $sentOk, $failed);
worker_logf("queue stats: pending=%d processing=%d sent=%d failed=%d",
    $stats['pending'], $stats['processing'], $stats['sent'], $stats['failed']);

// 실패율 임계치 — Sentry 보고
$total = $sentOk + $failed;
if ($total > 0 && $failed > 0) {
    $failureRate = $failed / $total;
    if ($failureRate >= 0.2) {
        SentryReport::error('push queue worker high failure rate', [
            'processed'    => $processed,
            'ok'           => $sentOk,
            'err'          => $failed,
            'failure_rate' => round($failureRate * 100, 1) . '%',
            'queue_stats'  => $stats,
        ]);
    } elseif ($failureRate >= 0.05) {
        SentryReport::warn('push queue worker elevated failure rate', [
            'processed'    => $processed,
            'ok'           => $sentOk,
            'err'          => $failed,
            'failure_rate' => round($failureRate * 100, 1) . '%',
        ]);
    }
}

if ($invokedDirectly) {
    exit($failed === 0 ? 0 : 1);
}
