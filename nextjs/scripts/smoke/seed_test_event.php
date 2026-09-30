<?php
/**
 * 일회성 — 기획전 1개 + 상품 매핑 seed.
 */
chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
include_once dirname(__DIR__, 3) . '/common.php';

$exists = sql_fetch("SELECT ev_id FROM {$g5['g5_shop_event_table']} WHERE ev_subject='가을 신상 기획전'");
if ($exists) {
    echo "skip (ev_id={$exists['ev_id']})\n";
    exit;
}

sql_query(
    "INSERT INTO {$g5['g5_shop_event_table']}
     SET ev_subject='가을 신상 기획전', ev_subject_strong=1,
         ev_head_html='<p>가을 신상품 모음 — 한정 수량으로 진행됩니다.</p>',
         ev_tail_html='', ev_use=1,
         ev_img_width=400, ev_img_height=400, ev_list_row=4"
);
$ev_id = $g5['connect_db']->insert_id;

// 상품 3개 매핑 (실재 상품 ID 사용)
$items = ['201603292', '201603291', '1387867302'];
foreach ($items as $it) {
    sql_query("INSERT IGNORE INTO {$g5['g5_shop_event_item_table']} SET ev_id={$ev_id}, it_id='" . addslashes($it) . "'");
}
echo "inserted ev_id={$ev_id} with " . count($items) . " items\n";
