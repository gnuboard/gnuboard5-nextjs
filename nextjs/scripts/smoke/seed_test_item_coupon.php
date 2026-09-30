<?php
/**
 * 일회성 시드 — 상품 쿠폰 (cp_method=0) 1개 + 카테고리 쿠폰 (cp_method=1) 1개.
 *   ITEM10P : it_id=201603292 에만 적용되는 10% 할인 (최대 5천원, 100원 절삭)
 *   CAT5000 : ca_id=30 (테스트 카테고리) 적용되는 5,000원 정액
 */
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

$rows = [
    [
        'cp_id' => 'ITEM10P', 'cp_subject' => '컴터테스트2 10% 쿠폰',
        'cp_method' => 0, 'cp_target' => '201603292', 'mb_id' => '',
        'cz_id' => 0, 'cp_start' => date('Y-m-d'),
        'cp_end' => date('Y-m-d', strtotime('+30 days')),
        'cp_price' => 10, 'cp_type' => 1, 'cp_trunc' => 100,
        'cp_minimum' => 0, 'cp_maximum' => 5000,
        'od_id' => 0, 'cp_datetime' => date('Y-m-d H:i:s'),
    ],
    [
        'cp_id' => 'CAT5000', 'cp_subject' => '테스트 카테고리 5천원 쿠폰',
        'cp_method' => 1, 'cp_target' => '30', 'mb_id' => '',
        'cz_id' => 0, 'cp_start' => date('Y-m-d'),
        'cp_end' => date('Y-m-d', strtotime('+30 days')),
        'cp_price' => 5000, 'cp_type' => 0, 'cp_trunc' => 0,
        'cp_minimum' => 20000, 'cp_maximum' => 0,
        'od_id' => 0, 'cp_datetime' => date('Y-m-d H:i:s'),
    ],
];
foreach ($rows as $r) {
    $exists = sql_fetch("SELECT cp_no FROM {$g5['g5_shop_coupon_table']} WHERE cp_id='" . addslashes($r['cp_id']) . "'");
    if ($exists) { echo "skip {$r['cp_id']}\n"; continue; }
    sql_query(sprintf(
        "INSERT INTO %s SET cp_id='%s', cp_subject='%s', cp_method=%d, cp_target='%s', mb_id='%s',
         cz_id=%d, cp_start='%s', cp_end='%s', cp_price=%d, cp_type=%d, cp_trunc=%d,
         cp_minimum=%d, cp_maximum=%d, od_id=%d, cp_datetime='%s'",
        $g5['g5_shop_coupon_table'], addslashes($r['cp_id']), addslashes($r['cp_subject']),
        $r['cp_method'], addslashes($r['cp_target']), addslashes($r['mb_id']), $r['cz_id'],
        $r['cp_start'], $r['cp_end'], $r['cp_price'], $r['cp_type'], $r['cp_trunc'],
        $r['cp_minimum'], $r['cp_maximum'], $r['od_id'], $r['cp_datetime']
    ));
    echo "insert {$r['cp_id']}\n";
}
echo "done\n";
