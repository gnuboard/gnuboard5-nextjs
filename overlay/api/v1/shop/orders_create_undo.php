<?php
/**
 * 주문 만들기(POST /v1/shop/orders)가 끝내지 못했을 때 이 요청이 쓴 것을 되돌린다 — orders_create_routes.php 의 catch.
 * 쇼핑 테이블이 MyISAM 이면(그누보드 설치 기본) 트랜잭션 되돌리기가 듣지 않아 빈 주문 · 쿠폰 사용 기록 · 줄어든 재고가 남는다.
 * 묶은 줄 · 주문 행 · 쿠폰 기록은 다시 해도 결과가 같아(InnoDB 면 이미 되돌아가 맞는 행이 없다) 늘 되돌리고,
 * 두 번 하면 늘어나는 재고는 그 표가 트랜잭션을 못 하는 것이 확실할 때만 되돌린다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('shop_api_table_engine')) {
    /**
     * DB::table() 키의 테이블 엔진(대문자, 예: MYISAM · INNODB). 알 수 없으면 '' — information_schema 를 못 읽으면
     * SHOW TABLE STATUS 로 한 번 더 본다. 요청 안에서는 한 번만 묻는다.
     */
    function shop_api_table_engine(string $tableKey): string
    {
        static $engines = [];
        $table = DB::table($tableKey);
        if (array_key_exists($table, $engines)) {
            return $engines[$table];
        }
        $engine = '';
        try {
            $row = DB::fetch(
                "SELECT ENGINE FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
                [$table]
            );
            $engine = strtoupper((string) ($row['ENGINE'] ?? ''));
        } catch (\Throwable $e) {
            $engine = '';
        }
        if ($engine === '') {
            try {
                $row = DB::fetch('SHOW TABLE STATUS LIKE ?', [$table]);
                $engine = strtoupper((string) ($row['Engine'] ?? ''));
            } catch (\Throwable $e) {
                $engine = '';
            }
        }
        return $engines[$table] = $engine;
    }
}

if (!function_exists('shop_orders_undo_failed_create')) {
    /**
     * @param array $done od_id · cart_id · ct_ids(이 요청이 묶은 줄) · mb_id · cart_items ·
     *                    order_inserted(주문 행을 넣었나) · stock_decremented(재고를 줄였나)
     */
    function shop_orders_undo_failed_create(array $done): void
    {
        $odId = (string) $done['od_id'];
        try {
            if (!empty($done['order_inserted'])) {
                // 주문 행을 넣었으니 이 번호는 이 요청의 것이다 — 주문 행을 맨 먼저 지운다(뒤 단계가 실패해도 같은
                // client_uid 재시도가 '이미 접수된' 빈 주문으로 돌아오지 않게). 그 주문으로 남긴 쿠폰 사용 기록도.
                DB::execute("DELETE FROM " . DB::table('g5_shop_order_table') . " WHERE od_id = ?", [$odId]);
                DB::execute(
                    "DELETE FROM " . DB::table('g5_shop_coupon_log_table') . " WHERE od_id = ? AND mb_id = ?",
                    [$odId, (string) $done['mb_id']]
                );
            }

            shop_api_cart_unbind_rows($odId, $done['cart_id'], $done['ct_ids']);

            if (!empty($done['stock_decremented'])) {
                // 재고는 두 번 더하면 늘어난다(과판매) — 트랜잭션을 못 하는 엔진이 확실한 표만 되돌리고, 모르면 남긴다.
                $restore = [];
                foreach ($done['cart_items'] as $row) {
                    $table = trim((string) ($row['io_id'] ?? '')) !== '' ? 'g5_shop_item_option_table' : 'g5_shop_item_table';
                    $engine = shop_api_table_engine($table);
                    if ($engine === '') {
                        error_log('[orders.create] stock not restored for ' . $odId . ' (' . ($row['it_id'] ?? '') . '): table engine unknown');
                    } elseif (!in_array($engine, ['INNODB', 'NDBCLUSTER'], true)) {
                        $restore[] = $row;
                    }
                }
                if ($restore) {
                    shop_api_restore_order_stock($restore);
                }
            }
        } catch (\Throwable $e) {
            error_log('[orders.create] undo failed ' . $odId . ': ' . $e->getMessage());
        }
    }
}
