<?php
/**
 * Gnuboard5 REST API - Shop Events (기획전).
 *
 *   GET /v1/shop/events           — 활성 이벤트 목록 (ev_use=1) + 각 이벤트의 상품 개수.
 *   GET /v1/shop/events/{ev_id}   — 이벤트 상세 + 묶인 상품 목록.
 *
 * 그누보드5 표준 테이블:
 *   g5_shop_event       — 이벤트 메타 (subject, head/tail html, skin, etc.)
 *   g5_shop_event_item  — (ev_id, it_id) 매핑.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

// 상품 이미지 주소는 api_shop_item_image_url()(api/lib/helpers.php, 모든 핸들러보다 먼저 실림)을 쓴다.

if (!function_exists('api_shop_event_image_url')) {
    function api_shop_event_image_url(int $evId, string $suffix): string
    {
        if ($evId <= 0 || !in_array($suffix, ['h', 't'], true)) {
            return '';
        }

        $path = G5_DATA_PATH . '/event/' . $evId . '_' . $suffix;
        if (!is_file($path)) {
            return '';
        }

        $stamp = filemtime($path) ?: 0;
        return shop_api_image_url('event', $evId . '_' . $suffix) . ($stamp ? '?' . $stamp : '');
    }
}

$ev_id = isset($shopSegments[0]) ? (int) $shopSegments[0] : 0;

// =========================================================================
// GET /v1/shop/events
// =========================================================================
if ($apiMethod === 'GET' && $ev_id === 0) {
    $rows = DB::fetchAll(
        "SELECT e.ev_id, e.ev_subject, e.ev_subject_strong, e.ev_img_width, e.ev_img_height,
                COUNT(ei.it_id) AS item_count
         FROM " . DB::table('g5_shop_event_table') . " e
         LEFT JOIN " . DB::table('g5_shop_event_item_table') . " ei ON e.ev_id = ei.ev_id
         WHERE e.ev_use = 1
         GROUP BY e.ev_id
         ORDER BY e.ev_id DESC
         LIMIT 50"
    );
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'ev_id'           => (int) $r['ev_id'],
            'ev_subject'      => $r['ev_subject'],
            'ev_subject_strong' => (int) $r['ev_subject_strong'],
            'item_count'      => (int) $r['item_count'],
        ];
    }
    Response::success($out);
}

// =========================================================================
// GET /v1/shop/events/{ev_id}
// =========================================================================
if ($apiMethod === 'GET' && $ev_id > 0) {
    $event = DB::fetch(
        "SELECT ev_id, ev_subject, ev_subject_strong, ev_head_html, ev_tail_html,
                ev_img_width, ev_img_height, ev_list_row, ev_use
         FROM " . DB::table('g5_shop_event_table') . "
         WHERE ev_id = ? AND ev_use = 1 LIMIT 1",
        [$ev_id]
    );
    if (!$event) Response::error('Event not found.', 404);

    $orderBy = shop_api_product_order_by($_GET['sort'] ?? '', $_GET['sortodr'] ?? '', 'i.');

    $items = DB::fetchAll(
        "SELECT i.it_id, i.ca_id, i.it_name, i.it_price, i.it_cust_price,
                i.it_stock_qty, i.it_soldout, i.it_tel_inq, i.it_img1,
                i.it_type1, i.it_type2, i.it_type4, i.it_type5, i.it_seo_title
         FROM " . DB::table('g5_shop_event_item_table') . " ei
         JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = ei.it_id
         WHERE ei.ev_id = ? AND i.it_use = 1
         ORDER BY {$orderBy}",
        [$ev_id]
    );

    $products = [];
    foreach ($items as $row) {
        $products[] = [
            'it_id'         => $row['it_id'],
            'ca_id'         => $row['ca_id'],
            'it_name'       => $row['it_name'],
            'it_seo_title'  => $row['it_seo_title'] ?? '',
            'it_price'      => (int) $row['it_price'],
            'it_cust_price' => (int) $row['it_cust_price'],
            'it_stock_qty'  => (int) $row['it_stock_qty'],
            'it_soldout'    => (string) (int) $row['it_soldout'],
            'it_tel_inq'    => (string) (int) ($row['it_tel_inq'] ?? 0),
            'it_type1'      => (string) $row['it_type1'],
            'it_type2'      => (string) $row['it_type2'],
            'it_type4'      => (string) $row['it_type4'],
            'it_type5'      => (string) $row['it_type5'],
            'image_url'     => api_image_url_with_width(api_shop_item_image_url($row['it_id'], $row['it_img1']), 400),
        ];
    }

    Response::success([
        'ev_id'             => (int) $event['ev_id'],
        'ev_subject'        => $event['ev_subject'],
        'ev_subject_strong' => (int) $event['ev_subject_strong'],
        'ev_head_image_url' => api_shop_event_image_url((int) $event['ev_id'], 'h'),
        'ev_head_html'      => $event['ev_head_html'] ?? '',
        'ev_tail_html'      => $event['ev_tail_html'] ?? '',
        'ev_tail_image_url' => api_shop_event_image_url((int) $event['ev_id'], 't'),
        'products'          => $products,
    ]);
}

Response::error('Method not allowed.', 405);
