<?php
/**
 * 일회성 — PG 서비스 전환. CLI 인자로 'toss' / 'kcp' / 'inicis' / 'nicepay' 받음.
 *
 *   php nextjs/scripts/smoke/switch_pg_service.php toss
 *
 * de_card_test=1 (test 모드) 도 같이 켜준다.
 */
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

$svc = $argv[1] ?? '';
$allowed = ['toss', 'kcp', 'inicis', 'nicepay'];
if (!in_array($svc, $allowed, true)) {
    echo "usage: php switch_pg_service.php <" . implode('|', $allowed) . ">\n";
    exit(1);
}

sql_query("UPDATE {$g5['g5_shop_default_table']} SET de_pg_service = '" . addslashes($svc) . "', de_card_test = 1");
$row = sql_fetch("SELECT de_pg_service, de_card_test FROM {$g5['g5_shop_default_table']} LIMIT 1");
echo "set: " . json_encode($row, JSON_UNESCAPED_UNICODE) . "\n";
