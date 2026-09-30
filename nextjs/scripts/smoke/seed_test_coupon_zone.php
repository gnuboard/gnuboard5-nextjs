<?php
/**
 * 일회성 시드 — 쿠폰존 테스트 행 1개. /shop/couponzone 에 노출됨.
 */
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

$today = date('Y-m-d');
$end   = date('Y-m-d', strtotime('+90 days'));

$exists = sql_fetch("SELECT cz_id FROM {$g5['g5_shop_coupon_zone_table']} WHERE cz_subject = '신규가입 환영 3000원 쿠폰'");
if ($exists) {
    echo "skip (이미 존재 cz_id={$exists['cz_id']})\n";
    exit;
}

$sql = "INSERT INTO {$g5['g5_shop_coupon_zone_table']} SET
    cz_type=0, cz_subject='신규가입 환영 3000원 쿠폰',
    cz_start='$today', cz_end='$end',
    cz_period=30, cz_point=0,
    cp_method=2, cp_target='',
    cp_price=3000, cp_type=0, cp_trunc=0,
    cp_minimum=10000, cp_maximum=0,
    cz_download=0,
    cz_datetime='" . date('Y-m-d H:i:s') . "'";

sql_query($sql);
echo "inserted cz_id={$g5['connect_db']->insert_id}\n";
