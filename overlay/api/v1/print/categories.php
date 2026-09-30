<?php
/**
 * Gnuboard5 REST API - Print Categories (오프린트미)
 *
 * Routes (prefix: v1/print/categories):
 *   GET /v1/print/categories - 활성 상품에서 카테고리 집계 (slug, name, 상품수, 최저단가)
 *
 * 공개 엔드포인트. 카테고리는 별도 테이블 없이 상품에서 파생한다.
 */

if (!defined('_GNUBOARD_')) exit;

$productTable = DB::table('print_product_table');

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$rows = DB::fetchAll(
    "SELECT category_slug, category_name, COUNT(*) AS product_count
     FROM {$productTable}
     WHERE is_active = 1
     GROUP BY category_slug, category_name
     ORDER BY MIN(sort_order) ASC",
    []
);

$categories = array_map(function ($row) {
    return [
        'slug'          => $row['category_slug'],
        'name'          => $row['category_name'],
        'product_count' => (int) $row['product_count'],
    ];
}, $rows);

Response::success($categories);
