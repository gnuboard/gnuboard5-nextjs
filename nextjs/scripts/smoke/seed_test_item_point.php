<?php
/**
 * 일회성 시드 — 테스트 상품(it_id=201603292) 에 it_point=500 으로 설정해
 * 구매 적립 흐름을 테스트할 수 있게 함. 운영 안 함.
 */
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

sql_query("UPDATE {$g5['g5_shop_item_table']} SET it_point=500, it_point_type=0 WHERE it_id='201603292'");
$row = sql_fetch("SELECT it_id, it_name, it_point, it_point_type FROM {$g5['g5_shop_item_table']} WHERE it_id='201603292'");
echo "updated: " . json_encode($row, JSON_UNESCAPED_UNICODE) . "\n";
