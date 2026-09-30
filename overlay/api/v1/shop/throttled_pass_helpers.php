<?php
/**
 * 크론 없는 운영(카페24)용 — 요청 끝(shutdown)에 얹어 도는 주기 작업의 공통 스로틀.
 *
 * 마지막 실행 뒤 $intervalSeconds 가 지났고 MySQL 이름 락을 잡은 요청 하나만 $pass 를 돌린다.
 * 락을 못 잡으면 곧바로 끝낸다(대기 없음). 응답은 먼저 내보낸다(fastcgi_finish_request).
 * 마지막 실행 시각은 data/cache/g5app_{$name}.txt 의 수정 시각이다.
 *
 * 쓰는 곳: SC-07 주문 푸시 패스(order_push_helpers.php), SC-15 결제 초안 정리(stale_draft_helpers.php).
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('shop_api_run_throttled_pass')) {
    /**
     * @param string   $name  영문 소문자·숫자·밑줄(락 이름·스탬프 파일 이름에 쓴다)
     * @param callable $pass  실제 작업. 예외는 여기서 잡아 로그만 남긴다.
     * @return bool 이번 요청이 $pass 를 돌렸는지
     */
    function shop_api_run_throttled_pass(string $name, int $intervalSeconds, callable $pass): bool
    {
        if (!preg_match('/^[a-z0-9_]{1,40}$/', $name) || !defined('G5_DATA_PATH') || !class_exists('DB')) {
            return false;
        }
        $stamp = G5_DATA_PATH . '/cache/g5app_' . $name . '.txt';
        $due = static function () use ($stamp, $intervalSeconds): bool {
            clearstatcache(true, $stamp);
            return !is_file($stamp) || time() - (int) filemtime($stamp) >= $intervalSeconds;
        };
        if (!$due()) {
            return false;
        }
        $lockName = 'g5app_' . $name;
        try {
            $lock = DB::fetch('SELECT GET_LOCK(?, 0) AS l', [$lockName]);
            if ((int) ($lock['l'] ?? 0) !== 1) {
                return false;
            }
            try {
                if (!$due()) {
                    return false;
                }
                @file_put_contents($stamp, date('c'));
                if (function_exists('fastcgi_finish_request')) {
                    fastcgi_finish_request();
                }
                $pass();
                return true;
            } finally {
                DB::fetch('SELECT RELEASE_LOCK(?) AS l', [$lockName]);
            }
        } catch (\Throwable $e) {
            error_log('[throttled-pass] ' . $name . ' failed: ' . $e->getMessage());
            return false;
        }
    }
}
