<?php
/**
 * Gnuboard5 REST API - Shop Categories
 *
 * GET /v1/shop/categories            - List categories (hierarchical)
 * GET /v1/shop/categories/{ca_id}    - Category detail with subcategories and items
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$ca_id = isset($shopSegments[0]) ? $shopSegments[0] : '';

// =========================================================================
// GET /v1/shop/categories - List all categories (hierarchical)
// =========================================================================
if ($apiMethod === 'GET' && $ca_id === '') {

    // Fetch all active categories ordered by ca_order, ca_id
    $allCategories = DB::fetchAll(
        "SELECT ca_id, ca_name, ca_order, ca_skin, ca_use
         FROM " . DB::table('g5_shop_category_table') . "
         WHERE ca_use = '1'
         ORDER BY ca_order ASC, ca_id ASC"
    );

    // Get item counts per category
    $countRows = DB::fetchAll(
        "SELECT ca_id, COUNT(*) AS cnt
         FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_use = '1' AND it_soldout != '1'
         GROUP BY ca_id"
    );
    $itemCounts = [];
    foreach ($countRows as $cr) {
        $itemCounts[$cr['ca_id']] = (int) $cr['cnt'];
    }

    // Build recursive hierarchical structure
    // Gnuboard5 categories: each depth level adds 2 characters to ca_id
    //  - "10"         depth 1
    //  - "1010"       depth 2  (parent: "10")
    //  - "101010"     depth 3  (parent: "1010")
    //  - "10101010"   depth 4  (parent: "101010")
    //
    // Item counts cascade up: a parent's count includes all descendants.
    $byId = [];
    foreach ($allCategories as $cat) {
        $catId = $cat['ca_id'];
        $byId[$catId] = [
            'ca_id'      => $catId,
            'ca_name'    => $cat['ca_name'],
            'ca_order'   => (int) $cat['ca_order'],
            'ca_skin'    => $cat['ca_skin'],
            'depth'      => (int) (strlen($catId) / 2),
            'item_count' => $itemCounts[$catId] ?? 0,
            'children'   => [],
        ];
    }

    // Cascade item counts from leaves up to ancestors
    // Sort by ca_id length descending so deepest leaves are processed first
    $sortedIds = array_keys($byId);
    usort($sortedIds, function ($a, $b) { return strlen($b) - strlen($a); });
    foreach ($sortedIds as $catId) {
        if (strlen($catId) > 2) {
            $parentId = substr($catId, 0, -2);
            if (isset($byId[$parentId])) {
                $byId[$parentId]['item_count'] += $byId[$catId]['item_count'];
            }
        }
    }

    // Attach children to parents
    $roots = [];
    foreach ($byId as $catId => &$node) {
        if (strlen($catId) > 2) {
            $parentId = substr($catId, 0, -2);
            if (isset($byId[$parentId])) {
                $byId[$parentId]['children'][] = &$node;
            }
        } else {
            $roots[] = &$node;
        }
    }
    unset($node);

    Response::success($roots);
}

// =========================================================================
// GET /v1/shop/categories/{ca_id} - Category detail with items
// =========================================================================
if ($apiMethod === 'GET' && $ca_id !== '') {

    $category = DB::fetch(
        "SELECT ca_id, ca_name, ca_order, ca_skin, ca_use
         FROM " . DB::table('g5_shop_category_table') . "
         WHERE ca_id = ? AND ca_use = '1' LIMIT 1",
        [$ca_id]
    );

    if (!$category) {
        Response::error('Category not found.', 404);
    }

    global $config;
    if (!empty($config['cf_cert_use'])) {
        shop_api_enforce_cert_access($ca_id, 'list', Auth::getUser());
    }

    // Subcategories (children whose ca_id starts with this ca_id and are longer)
    $likePattern = $ca_id . '%';
    // item_count follows the shop skin's listcategory count: items filed under
    // the subcategory in any of the three category slots.
    $subcategories = array_map(
        static function (array $row): array {
            return array_merge($row, ['item_count' => (int) ($row['item_count'] ?? 0)]);
        },
        DB::fetchAll(
            "SELECT c.ca_id, c.ca_name, c.ca_order, c.ca_skin,
                    (SELECT COUNT(*) FROM " . DB::table('g5_shop_item_table') . " i
                      WHERE (i.ca_id LIKE CONCAT(c.ca_id, '%')
                          OR i.ca_id2 LIKE CONCAT(c.ca_id, '%')
                          OR i.ca_id3 LIKE CONCAT(c.ca_id, '%'))
                        AND i.it_use = '1') AS item_count
             FROM " . DB::table('g5_shop_category_table') . " c
             WHERE c.ca_id LIKE ?
               AND c.ca_id != ?
               AND c.ca_use = '1'
             ORDER BY c.ca_order ASC, c.ca_id ASC",
            [$likePattern, $ca_id]
        )
    );

    // Items in this category (including subcategories)
    [$page, $perPage, $offset] = api_page_params(20, 100);
    $orderBy = shop_api_product_order_by($_GET['sort'] ?? '', $_GET['sortodr'] ?? '');

    $total = DB::count(
        "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_table') . "
         WHERE ca_id LIKE ? AND it_use = '1' AND it_soldout != '1'",
        [$likePattern]
    );

    $itemRows = DB::fetchAll(
        "SELECT it_id, ca_id, it_name, it_price, it_cust_price,
                it_point, it_stock_qty, it_soldout, it_tel_inq, it_img1, it_seo_title,
                it_brand, it_maker, it_type1, it_type2, it_type3, it_type4, it_type5,
                it_buy_min_qty, it_buy_max_qty, it_sc_type, it_sc_method
         FROM " . DB::table('g5_shop_item_table') . "
         WHERE ca_id LIKE ? AND it_use = '1' AND it_soldout != '1'
         ORDER BY {$orderBy}
         LIMIT ?, ?",
        [$likePattern, $offset, $perPage]
    );

    // 카드가 쓰는 부가 정보(분류 이름 · 후기 통계)는 /shop/products 목록과 같은 필드로.
    $extras = shop_api_product_list_extras($itemRows);

    $items = [];
    foreach ($itemRows as $row) {
        $review = $extras['reviews'][(string) $row['it_id']] ?? ['cnt' => 0, 'avg' => 0.0];
        $items[] = [
            'it_id'          => $row['it_id'],
            'ca_id'          => $row['ca_id'],
            'ca_name'        => $extras['categories'][(string) $row['ca_id']] ?? '',
            'it_name'        => $row['it_name'],
            'it_brand'       => $row['it_brand'] ?? '',
            'it_maker'       => $row['it_maker'] ?? '',
            'it_type1'       => (string) $row['it_type1'],
            'it_type2'       => (string) $row['it_type2'],
            'it_type3'       => (string) $row['it_type3'],
            'it_type4'       => (string) $row['it_type4'],
            'it_type5'       => (string) $row['it_type5'],
            'review_count'   => $review['cnt'],
            'review_avg'     => $review['avg'],
            'it_seo_title'   => $row['it_seo_title'] ?? '',
            'it_price'       => (int) $row['it_price'],
            'it_basic_price' => (int) $row['it_price'],
            'it_cust_price'  => (int) $row['it_cust_price'],
            'it_point'       => (int) $row['it_point'],
            'it_stock_qty'   => (int) $row['it_stock_qty'],
            'it_soldout'     => $row['it_soldout'],
            'it_tel_inq'     => (string) (int) ($row['it_tel_inq'] ?? 0),
            'it_buy_min_qty' => (int) ($row['it_buy_min_qty'] ?? 0),
            'it_buy_max_qty' => (int) ($row['it_buy_max_qty'] ?? 0),
            'it_sc_type'     => (int) ($row['it_sc_type'] ?? 0),
            'it_sc_method'   => (int) ($row['it_sc_method'] ?? 0),
            'has_options'    => isset($extras['options'][(string) $row['it_id']]),
            // 그누보드 is_soldout() 과 같은 품절 판정(선택옵션 상품은 옵션 재고 기준) — 카드의 품절 표시 · 담기 단추가 쓴다.
            'is_soldout'     => !empty($extras['soldout'][(string) $row['it_id']]),
            'image_url'      => api_image_url_with_width(api_shop_item_image_url($row['it_id'], $row['it_img1']), 400),
        ];
    }

    $data = [
        'category'      => $category,
        'subcategories' => $subcategories,
        'items'         => $items,
        'meta'          => [
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
        ],
    ];

    Response::success($data);
}

Response::error('Method not allowed.', 405);
