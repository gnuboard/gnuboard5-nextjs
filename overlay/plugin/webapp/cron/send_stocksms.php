<?php
/**
 * 재입고 SMS 발송 cron — 5~10분 주기로 호출 권장.
 *
 *   php plugin/webapp/cron/send_stocksms.php           — 실제 발송 (운영자 SMS 모듈 의존)
 *   php plugin/webapp/cron/send_stocksms.php --dry-run — 후보만 출력
 *
 * 동작:
 *   1) g5_shop_item_stocksms.ss_send=0 인 모든 행 조회.
 *   2) 해당 it_id 가 재입고됐는지 확인 (it_soldout=0 AND it_stock_qty > 0).
 *   3) 재입고된 경우 SMS 발송 후 ss_send=1, ss_send_time=NOW().
 *
 * SMS 실제 발송:
 *   - 그누보드 SMS 모듈(plugin/sms*) 또는 운영자 외부 API.
 *   - 이 스크립트는 후보 행과 메시지 페이로드를 stdout 으로 출력하므로,
 *     운영자는 자기 SMS 게이트웨이에 맞춰 send_sms_via_gateway() 만 교체.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.
");
}
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

$dryRun = in_array('--dry-run', $argv ?? [], true);

$rows = sql_query(sprintf(
    "SELECT ss.ss_id, ss.it_id, ss.ss_hp, i.it_name, i.it_soldout, i.it_stock_qty
       FROM %s ss
       JOIN %s i ON i.it_id = ss.it_id
      WHERE ss.ss_send = 0
        AND i.it_use = 1
        AND i.it_soldout = 0
        AND i.it_stock_qty > 0
      ORDER BY ss.ss_id ASC
      LIMIT 500",
    $g5['g5_shop_item_stocksms_table'],
    $g5['g5_shop_item_table']
));

$sent = 0;
$skipped = 0;
while ($r = sql_fetch_array($rows)) {
    $msg = sprintf('[재입고] %s 상품이 재입고됐습니다.', $r['it_name']);

    if ($dryRun) {
        echo sprintf("dry-run ss_id=%d hp=%s it=%s msg=%s\n",
            (int) $r['ss_id'], $r['ss_hp'], $r['it_id'], $msg);
        $sent++;
        continue;
    }

    if (function_exists('send_sms_via_gateway')) {
        $ok = send_sms_via_gateway($r['ss_hp'], $msg);
    } else {
        // 운영자 SMS 모듈 미통합 — error_log 만 남기고 스킵.
        error_log("[stocksms] SMS gateway not configured. ss_id={$r['ss_id']} hp={$r['ss_hp']}");
        $ok = false;
    }

    if ($ok) {
        sql_query(sprintf(
            "UPDATE %s SET ss_send=1, ss_send_time='%s' WHERE ss_id=%d",
            $g5['g5_shop_item_stocksms_table'],
            date('Y-m-d H:i:s'),
            (int) $r['ss_id']
        ));
        $sent++;
    } else {
        $skipped++;
    }
}

echo "stocksms done — sent={$sent}, skipped={$skipped}, dry_run=" . ($dryRun ? '1' : '0') . "\n";
