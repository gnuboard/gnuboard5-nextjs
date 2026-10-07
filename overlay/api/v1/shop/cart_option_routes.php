<?php
/**
 * POST /v1/shop/cart/options — 장바구니의 선택사항수정(영카트 cartoption.php · cartupdate.php act=optionmod 자리).
 * body: { it_id, options: [{ io_id, io_type, ct_qty }, ...] } — 고친 뒤 그 상품의 장바구니 줄 전부(바로구매 줄은 아니다).
 *
 * 고친 뒤의 모습을 먼저 모두 검사하고(shop_api_cart_option_replace_plan) 통과해야 바꾼다. 줄마다 따로 보내면 중간 상태가
 * 최소 · 최대 구매수량에 걸리고, 중간에 실패하면 지운 줄이 빠진 채 남는다. 영카트처럼 다 지우고 다시 담지 않고 달라진
 * 줄만 고쳐서 줄에 묶인 쿠폰이 풀리지 않는다(수량이 바뀐 줄은 지금 조건으로 쿠폰을 다시 적용한다 — PATCH 와 같다).
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

/** @var string $apiMethod */
/** @var string $ct_id */
/** @var string $cart_id */
/** @var string $mb_id */
/** @var array|null $member */

if ($apiMethod === 'POST' && $ct_id === 'options') {
    require_once __DIR__ . '/cart_option_replace.php';

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        Response::error('Request body is required.', 422);
    }
    $it_id = shop_api_cart_legacy_clean_it_id($input['it_id'] ?? '');
    if ($it_id === '') {
        Response::error('it_id is required.', 422);
    }
    $rawOptions = $input['options'] ?? null;
    if (!is_array($rawOptions) || count($rawOptions) > 100) {
        Response::error('options is required.', 422);
    }

    $item = shop_api_cart_legacy_product($it_id);
    if (!$item) {
        Response::error('Product not found.', 404);
    }
    shop_api_enforce_cert_access((string) $item['it_id'], 'item', $member);
    if ((int) $item['it_use'] !== 1) {
        Response::error('Product is not available.', 400);
    }
    if ((int) $item['it_soldout'] === 1) {
        Response::error('Product is sold out.', 400);
    }
    if ((int) ($item['it_tel_inq'] ?? 0) === 1) {
        Response::error('This product is available by phone inquiry only.', 400);
    }

    $lines = DB::fetchAll(
        "SELECT ct_id, io_id, io_type, ct_qty, ct_send_cost FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ? AND it_id = ? AND ct_direct = 0
           AND " . shop_api_cart_active_status_sql() . "
         ORDER BY io_type ASC, ct_id ASC",
        array_merge([$cart_id, $it_id], shop_api_cart_active_statuses())
    );
    if (empty($lines)) {
        Response::error('Cart item not found.', 404);
    }
    $options = DB::fetchAll(
        "SELECT io_id, io_type FROM " . DB::table('g5_shop_item_option_table') . "
         WHERE it_id = ? AND io_use = 1",
        [$it_id]
    );

    $desired = [];
    foreach ($rawOptions as $row) {
        if (is_array($row)) {
            $desired[] = [
                'io_id' => trim((string) ($row['io_id'] ?? '')),
                'io_type' => (int) ($row['io_type'] ?? 0),
                'ct_qty' => (int) ($row['ct_qty'] ?? 0),
            ];
        }
    }

    $plan = shop_api_cart_option_replace_plan($item, $lines, $desired, $options, function ($ioId, $ioType) use ($it_id) {
        return shop_api_stock_available_qty($it_id, (string) $ioId, (int) $ioType);
    });
    if ($plan['error'] !== null) {
        Response::error($plan['error']['message'], $plan['error']['status']);
    }

    $couponMbId = !empty($member['mb_id']) ? (string) $member['mb_id'] : '';
    foreach ($plan['update'] as $change) {
        DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . " SET ct_qty = ? WHERE ct_id = ? AND od_id = ? AND ct_direct = 0",
            [$change[1], $change[0], $cart_id]
        );
        shop_api_reevaluate_line_coupon((int) $change[0], $couponMbId);
    }
    // 새 줄은 본품 먼저(계획이 그 순서로 준다), 지우기는 마지막 — 추가옵션을 담는 동안 본품이 있어야 한다.
    $sendCost = (int) ($lines[0]['ct_send_cost'] ?? 0);
    foreach ($plan['insert'] as $row) {
        shop_api_cart_add_row($cart_id, $mb_id, $item, $it_id, $row['io_id'], (int) $row['ct_qty'], false, $sendCost);
    }
    if (!empty($plan['delete'])) {
        DB::execute(
            "DELETE FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ? AND ct_direct = 0
               AND ct_id IN (" . implode(',', array_fill(0, count($plan['delete']), '?')) . ")",
            array_merge([$cart_id], $plan['delete'])
        );
    }

    Response::success([
        'cart_id' => (string) $cart_id,
        'updated' => count($plan['update']),
        'inserted' => count($plan['insert']),
        'deleted' => count($plan['delete']),
    ]);
}
