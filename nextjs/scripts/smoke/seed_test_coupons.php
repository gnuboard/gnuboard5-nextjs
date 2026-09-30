<?php
/**
 * 일회성 시드 — 쿠폰 적용 테스트용 g5_shop_coupon 행 2개 INSERT.
 *
 *   TEST10K  : 30,000원 이상 주문에 10,000원 정액 할인
 *   TEST5PCT : 50,000원 이상 주문에 5% 할인 (최대 5,000원, 100원 단위 절삭)
 *
 * 운영에선 /adm/shop_admin/couponform.php 로 등록. 이 스크립트는 dev/test 전용.
 *
 *   php.exe nextjs/scripts/smoke/seed_test_coupons.php
 */
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

$rows = [
    [
        'cp_id'      => 'TEST10K',
        'cp_subject' => '테스트 1만원 할인쿠폰',
        'cp_method'  => 2,           // 주문 쿠폰
        'cp_target'  => '',
        'mb_id'      => '',          // 전체 회원 공개
        'cz_id'      => 0,
        'cp_start'   => date('Y-m-d'),
        'cp_end'     => date('Y-m-d', strtotime('+30 days')),
        'cp_price'   => 10000,
        'cp_type'    => 0,           // 정액
        'cp_trunc'   => 0,
        'cp_minimum' => 30000,
        'cp_maximum' => 0,
        'od_id'      => 0,
        'cp_datetime'=> date('Y-m-d H:i:s'),
    ],
    [
        'cp_id'      => 'TEST5PCT',
        'cp_subject' => '테스트 5% 할인쿠폰 (최대 5,000원)',
        'cp_method'  => 2,
        'cp_target'  => '',
        'mb_id'      => '',
        'cz_id'      => 0,
        'cp_start'   => date('Y-m-d'),
        'cp_end'     => date('Y-m-d', strtotime('+30 days')),
        'cp_price'   => 5,
        'cp_type'    => 1,           // 정률 (%)
        'cp_trunc'   => 100,         // 100원 단위 절삭
        'cp_minimum' => 50000,
        'cp_maximum' => 5000,
        'od_id'      => 0,
        'cp_datetime'=> date('Y-m-d H:i:s'),
    ],
];

$ins = 0;
$skip = 0;
foreach ($rows as $r) {
    $exists = sql_fetch(sprintf(
        "SELECT cp_no FROM %s WHERE cp_id = '%s'",
        $g5['g5_shop_coupon_table'],
        addslashes($r['cp_id'])
    ));
    if ($exists) {
        $skip++;
        echo "skip {$r['cp_id']} (이미 존재)\n";
        continue;
    }
    $sql = sprintf(
        "INSERT INTO %s SET
            cp_id='%s', cp_subject='%s', cp_method=%d, cp_target='%s', mb_id='%s',
            cz_id=%d, cp_start='%s', cp_end='%s', cp_price=%d, cp_type=%d,
            cp_trunc=%d, cp_minimum=%d, cp_maximum=%d, od_id=%d, cp_datetime='%s'",
        $g5['g5_shop_coupon_table'],
        addslashes($r['cp_id']),
        addslashes($r['cp_subject']),
        $r['cp_method'],
        addslashes($r['cp_target']),
        addslashes($r['mb_id']),
        $r['cz_id'],
        $r['cp_start'],
        $r['cp_end'],
        $r['cp_price'],
        $r['cp_type'],
        $r['cp_trunc'],
        $r['cp_minimum'],
        $r['cp_maximum'],
        $r['od_id'],
        $r['cp_datetime']
    );
    sql_query($sql);
    $ins++;
    echo "insert {$r['cp_id']}\n";
}

echo "done — inserted={$ins}, skipped={$skip}\n";
