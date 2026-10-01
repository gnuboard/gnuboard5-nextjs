<?php
/**
 * Gnuboard5 REST API - Shop Cart
 *
 * GET    /v1/shop/cart          - Get cart items
 * POST   /v1/shop/cart          - Add to cart
 * PATCH  /v1/shop/cart/{ct_id}  - Update cart item qty
 * DELETE /v1/shop/cart/{ct_id}  - Remove cart item
 * DELETE /v1/shop/cart          - Clear entire cart
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/coupon_markers.php';

$member  = Auth::getUser();
$mb_id   = !empty($member['mb_id']) ? $member['mb_id'] : '';
$cart_id = shop_api_cart_id($member);
$ct_id   = isset($shopSegments[0]) ? $shopSegments[0] : '';

require_once __DIR__ . '/cart_helpers.php';

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $ct_id === 'order-stock') {
    $input = shop_api_cart_legacy_input();
    $directFilter = shop_api_cart_legacy_truthy($input['direct'] ?? ($input['sw_direct'] ?? null));
    $ctIdSource = $input['ct_ids'] ?? ($input['cart_ids'] ?? null);
    $hasCtIdFilter = is_array($ctIdSource)
        ? count($ctIdSource) > 0
        : trim((string) ($ctIdSource ?? '')) !== '';
    $filterCtIds = shop_api_cart_ct_ids_from($ctIdSource);
    $filterSql = '';
    $cartParams = [$cart_id];

    if ($hasCtIdFilter && empty($filterCtIds)) {
        Response::error('Invalid cart item ids.', 422);
    }

    if (!empty($filterCtIds)) {
        $filterSql = ' AND ct_id IN (' . implode(',', array_fill(0, count($filterCtIds), '?')) . ')';
        $cartParams = array_merge($cartParams, $filterCtIds);
    } elseif (isset($input['direct']) || isset($input['sw_direct'])) {
        $filterSql = ' AND ct_direct = ?';
        $cartParams[] = $directFilter ? 1 : 0;
    }

    $cartItems = DB::fetchAll(
        "SELECT ct_id, it_id, it_name, ct_qty, ct_option, io_id, io_type, ct_select_time
         FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           AND ct_select = 1
           {$filterSql}
           AND " . shop_api_cart_active_status_sql(),
        array_merge($cartParams, shop_api_cart_active_statuses())
    );

    if (empty($cartItems)) {
        Response::error('Cart is empty. Add items before placing an order.', 400);
    }

    $shopDefault = shop_api_shop_default_config();
    $keepTerm = isset($shopDefault['de_cart_keep_term']) ? (int) $shopDefault['de_cart_keep_term'] : 15;
    if ($keepTerm <= 0) {
        $keepTerm = 15;
    }

    $cartStockLimit = defined('G5_CART_STOCK_LIMIT') ? (int) G5_CART_STOCK_LIMIT : 3;
    if ($cartStockLimit > 0) {
        if ($cartStockLimit > $keepTerm * 24) {
            $cartStockLimit = $keepTerm * 24;
        }

        $stockCutoff = date('Y-m-d H:i:s', time() - (3600 * $cartStockLimit));
        $recentSelect = false;
        foreach ($cartItems as $cartItem) {
            $selectedAt = (string) ($cartItem['ct_select_time'] ?? '');
            if ($selectedAt !== '' && $selectedAt > $stockCutoff) {
                $recentSelect = true;
                break;
            }
        }

        if (!$recentSelect) {
            Response::error('Order items were selected too long ago. Please review the cart and order again.', 400, [
                'cart_stock_limit_hours' => $cartStockLimit,
            ]);
        }
    }

    if (function_exists('before_check_cart_price') && !before_check_cart_price($cart_id)) {
        Response::error('Cart amount has changed. Please review the cart again.', 400);
    }

    shop_api_validate_order_stock($cartItems);

    Response::success([
        'ok' => true,
        'cart_id' => $cart_id,
        'checked_count' => count($cartItems),
    ]);
}

// =========================================================================
// POST /v1/shop/cart/legacy-update - YoungCart cartupdate.php compatible action
// =========================================================================
if ($apiMethod === 'POST' && $ct_id === 'legacy-update') {
    $input = shop_api_cart_legacy_input();
    $act = trim((string) ($input['act'] ?? ''));
    $sw_direct = shop_api_cart_legacy_truthy($input['sw_direct'] ?? ($input['direct'] ?? null));
    $directValue = $sw_direct ? 1 : 0;
    $cartPath = '/shop/cart';
    $orderPath = $sw_direct ? '/shop/order?direct=1' : '/shop/order';

    if ($act === 'buy') {
        $selectedCtIds = array_map('intval', shop_api_cart_legacy_selected_values($input, 'ct_id'));
        $selectedItIds = array_map('shop_api_cart_legacy_clean_it_id', shop_api_cart_legacy_selected_values($input, 'it_id'));
        $selectedItIds = array_values(array_filter($selectedItIds));

        if (empty($selectedCtIds) && empty($selectedItIds)) {
            Response::error('Select at least one cart item.', 422);
        }

        DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET ct_select = 0
             WHERE od_id = ? AND ct_direct = ?",
            [$cart_id, $directValue]
        );

        if (!empty($selectedCtIds)) {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_cart_table') . "
                 SET ct_select = 1, ct_select_time = NOW()
                 WHERE od_id = ?
                   AND ct_direct = ?
                   AND ct_id IN (" . implode(',', array_fill(0, count($selectedCtIds), '?')) . ")",
                array_merge([$cart_id, $directValue], $selectedCtIds)
            );
        }

        if (!empty($selectedItIds)) {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_cart_table') . "
                 SET ct_select = 1, ct_select_time = NOW()
                 WHERE od_id = ?
                   AND ct_direct = ?
                   AND it_id IN (" . implode(',', array_fill(0, count($selectedItIds), '?')) . ")",
                array_merge([$cart_id, $directValue], $selectedItIds)
            );
        }

        shop_api_cart_legacy_redirect($orderPath);
    }

    if ($act === 'alldelete') {
        DB::execute(
            "DELETE FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ? AND ct_direct = ?",
            [$cart_id, $directValue]
        );
        shop_api_cart_legacy_redirect($cartPath);
    }

    if ($act === 'seldelete') {
        $selectedCtIds = array_map('intval', shop_api_cart_legacy_selected_values($input, 'ct_id'));
        $selectedItIds = array_map('shop_api_cart_legacy_clean_it_id', shop_api_cart_legacy_selected_values($input, 'it_id'));
        $selectedItIds = array_values(array_filter($selectedItIds));

        if (empty($selectedCtIds) && empty($selectedItIds)) {
            Response::error('Select at least one cart item.', 422);
        }

        if (!empty($selectedCtIds)) {
            DB::execute(
                "DELETE FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE od_id = ?
                   AND ct_direct = ?
                   AND ct_id IN (" . implode(',', array_fill(0, count($selectedCtIds), '?')) . ")",
                array_merge([$cart_id, $directValue], $selectedCtIds)
            );
        }

        if (!empty($selectedItIds)) {
            DB::execute(
                "DELETE FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE od_id = ?
                   AND ct_direct = ?
                   AND it_id IN (" . implode(',', array_fill(0, count($selectedItIds), '?')) . ")",
                array_merge([$cart_id, $directValue], $selectedItIds)
            );
        }

        shop_api_cart_legacy_redirect($cartPath);
    }

    $itIds = shop_api_cart_legacy_array($input['it_id'] ?? null);
    if (empty($itIds)) {
        Response::error('it_id is required.', 422);
    }

    if ($sw_direct) {
        DB::execute(
            "DELETE FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ? AND ct_direct = 1",
            [$cart_id]
        );
    }

    $added = [];
    $checkedItems = shop_api_cart_legacy_array($input['chk_it_id'] ?? null);
    foreach ($itIds as $index => $rawItId) {
        if ($act === 'multi' && (!array_key_exists($index, $checkedItems) || !shop_api_cart_legacy_truthy($checkedItems[$index]))) {
            continue;
        }

        $it_id = shop_api_cart_legacy_clean_it_id($rawItId);
        if ($it_id === '') {
            continue;
        }

        $defaultQty = 1;
        if (isset($input['ct_qty']) && !is_array($input['ct_qty'])) {
            $defaultQty = max(1, (int) $input['ct_qty']);
        } elseif (isset($input['ct_qty'][$index]) && !is_array($input['ct_qty'][$index])) {
            $defaultQty = max(1, (int) $input['ct_qty'][$index]);
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

        if ($act === 'optionmod') {
            DB::execute(
                "DELETE FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE od_id = ? AND it_id = ? AND ct_direct = ?",
                [$cart_id, $it_id, $directValue]
            );
        }

        $ctSendCost = isset($input['ct_send_cost']) ? (int) $input['ct_send_cost'] : 0;
        $options = shop_api_cart_legacy_options_for_item($input, $it_id, $defaultQty);
        if (!empty($options)) {
            $baseQty = 0;
            foreach ($options as $option) {
                $opt = DB::fetch(
                    "SELECT io_type FROM " . DB::table('g5_shop_item_option_table') . "
                     WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
                    [$it_id, $option['io_id']]
                );
                if (!$opt) {
                    Response::error('Selected option is not available.', 400);
                }
                if ((int) $opt['io_type'] === 0) {
                    $baseQty += (int) $option['ct_qty'];
                }
            }

            if ($baseQty > 0) {
                $existingBaseQty = shop_api_cart_active_base_qty($cart_id, $it_id, $sw_direct);
                shop_api_cart_validate_buy_qty($item, $baseQty, $existingBaseQty);
            }

            foreach ($options as $option) {
                $added[] = shop_api_cart_add_row(
                    $cart_id,
                    $mb_id,
                    $item,
                    $it_id,
                    $option['io_id'],
                    (int) $option['ct_qty'],
                    $sw_direct,
                    $ctSendCost
                );
            }
            continue;
        }

        $hasOptions = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_use = 1 AND io_type = 0",
            [$it_id]
        );
        if ($hasOptions > 0) {
            Response::error('Select a product option.', 400);
        }

        $existingBaseQty = shop_api_cart_active_base_qty($cart_id, $it_id, $sw_direct);
        shop_api_cart_validate_buy_qty($item, $defaultQty, $existingBaseQty);
        $added[] = shop_api_cart_add_row($cart_id, $mb_id, $item, $it_id, '', $defaultQty, $sw_direct, $ctSendCost);
    }

    shop_api_cart_legacy_redirect($sw_direct ? $orderPath : $cartPath, [
        'items' => $added,
    ]);
}

// =========================================================================
// GET /v1/shop/cart - List cart items
// =========================================================================
if ($apiMethod === 'GET' && $ct_id === '') {

    $ctIdSource = $_GET['ct_ids'] ?? null;
    $hasCtIdFilter = is_array($ctIdSource)
        ? count($ctIdSource) > 0
        : trim((string) ($ctIdSource ?? '')) !== '';
    $filterCtIds = shop_api_cart_ct_ids_from($ctIdSource);
    $directFilter = shop_api_truthy($_GET['direct'] ?? null) || shop_api_truthy($_GET['sw_direct'] ?? null);
    $filterSql = '';
    $params = [$cart_id];
    if ($hasCtIdFilter && empty($filterCtIds)) {
        $filterSql = ' AND 1 = 0';
    } elseif (!empty($filterCtIds)) {
        shop_api_restore_pending_cart_rows_by_ct_ids(
            $member,
            $filterCtIds,
            '결제 취소: 주문서 재진입으로 임시 주문 복구'
        );
        $filterSql = ' AND c.ct_id IN (' . implode(',', array_fill(0, count($filterCtIds), '?')) . ')';
        $params = array_merge($params, $filterCtIds);
    } else {
        $filterSql = ' AND c.ct_direct = ' . ($directFilter ? '1' : '0');
    }

    $rows = DB::fetchAll(
        "SELECT c.ct_id, c.it_id, c.it_name, c.ct_price, c.ct_qty, c.ct_point,
                c.ct_option, c.io_type, c.io_price, c.ct_status, c.cp_price, c.ct_history, c.ct_direct,
                c.ct_send_cost, c.it_sc_type, c.it_sc_method, c.it_sc_price, c.it_sc_minimum, c.it_sc_qty,
                i.it_price, i.it_cust_price, i.it_img1, i.it_stock_qty, i.it_soldout,
                i.it_use, i.it_tel_inq, i.it_seo_title
         FROM " . DB::table('g5_shop_cart_table') . " c
         LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON c.it_id = i.it_id
         WHERE c.od_id = ?
           {$filterSql}
           AND " . shop_api_cart_active_status_sql('c.ct_status') . "
         ORDER BY c.ct_id DESC",
        array_merge($params, shop_api_cart_active_statuses())
    );

    $items = [];
    $totalPrice = 0;
    $totalQty   = 0;
    $totalCpPrice = 0;
    $baseSendCost = shop_api_cart_send_cost(
        $cart_id,
        !empty($filterCtIds) ? $filterCtIds : null,
        $directFilter
    );

    foreach ($rows as $row) {
        $lineTotal = shop_api_cart_line_total($row);
        $unitPrice = shop_api_cart_unit_price($row);
        $totalPrice += $lineTotal;
        $totalQty   += (int) $row['ct_qty'];
        $totalCpPrice += (int) $row['cp_price'];

        // ct_history 에서 쿠폰 마커 추출 — UI 에서 어떤 쿠폰이 묶였는지 표시용.
        $boundCpId = shop_api_coupon_marker_extract($row['ct_history'] ?? '');

        $items[] = [
            'ct_id'          => $row['ct_id'],
            'it_id'          => $row['it_id'],
            'it_name'        => $row['it_name'],
            'it_seo_title'   => $row['it_seo_title'] ?? '',
            'ct_price'       => $unitPrice,
            'ct_base_price'  => (int) $row['ct_price'],
            'ct_point'       => (int) ($row['ct_point'] ?? 0),
            'ct_qty'         => (int) $row['ct_qty'],
            'ct_option'      => $row['ct_option'],
            'io_type'        => (int) $row['io_type'],
            'io_price'       => (int) $row['io_price'],
            'cp_price'       => (int) $row['cp_price'],
            'cp_id'          => $boundCpId,
            'ct_direct'      => (int) $row['ct_direct'],
            'ct_send_cost'   => (int) $row['ct_send_cost'],
            'it_sc_type'     => (int) $row['it_sc_type'],
            'it_sc_method'   => (int) $row['it_sc_method'],
            'it_sc_price'    => (int) $row['it_sc_price'],
            'it_sc_minimum'  => (int) $row['it_sc_minimum'],
            'it_sc_qty'      => (int) $row['it_sc_qty'],
            'line_total'     => $lineTotal,
            'it_basic_price' => (int) $row['it_price'],
            'it_stock_qty'   => (int) $row['it_stock_qty'],
            'it_soldout'     => $row['it_soldout'],
            'it_use'         => (string) (int) ($row['it_use'] ?? 0),
            'it_tel_inq'     => (string) (int) ($row['it_tel_inq'] ?? 0),
            'image_url'      => api_shop_item_image_url($row['it_id'], $row['it_img1']),
        ];
    }

    Response::success([
        'cart_id'       => (string) $cart_id,
        'items'         => $items,
        'total_price'   => $totalPrice,
        'total_qty'     => $totalQty,
        'cart_coupon'   => $totalCpPrice,
        'send_cost'     => $baseSendCost,
        'shipping_cost' => $baseSendCost,
    ]);
}

// =========================================================================
// POST /v1/shop/cart - Add to cart
// =========================================================================

require_once __DIR__ . '/cart_add_routes.php';

if ($apiMethod === 'PATCH' && $ct_id !== '') {

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        Response::error('Request body is required.', 422);
    }

    $newQty = isset($input['ct_qty']) ? (int) $input['ct_qty'] : 0;
    if ($newQty < 1) {
        Response::error('ct_qty must be at least 1.', 422);
    }

    // Verify ownership
    $cartItem = DB::fetch(
        "SELECT ct_id, it_id, ct_option, io_id, io_type, ct_direct FROM " . DB::table('g5_shop_cart_table') . "
         WHERE ct_id = ?
           AND od_id = ?
           AND " . shop_api_cart_active_status_sql() . "
         LIMIT 1",
        array_merge([$ct_id, $cart_id], shop_api_cart_active_statuses())
    );

    if (!$cartItem) {
        Response::error('Cart item not found.', 404);
    }

    shop_api_enforce_cert_access((string) $cartItem['it_id'], 'item', $member);
    // 줄 쿠폰은 수량·옵션을 바꾼 뒤 지금 조건으로 다시 적용한다(shop_api_reevaluate_line_coupon).
    $patchMbId = !empty($member['mb_id']) ? (string) $member['mb_id'] : '';

    $newCtOption = isset($input['ct_option']) ? trim((string) $input['ct_option']) : null;
    $isChangingOption = $newCtOption !== null && $newCtOption !== ($cartItem['ct_option'] ?? '');
    $isDirectCart = (int) ($cartItem['ct_direct'] ?? 0) === 1;

    if (!$isChangingOption && (int) ($cartItem['io_type'] ?? 0) === 0) {
        $item = DB::fetch(
            "SELECT it_stock_qty, it_buy_min_qty, it_buy_max_qty FROM " . DB::table('g5_shop_item_table') . "
             WHERE it_id = ? LIMIT 1",
            [$cartItem['it_id']]
        );
        if ($item) {
            $activeBaseQty = shop_api_cart_active_base_qty($cart_id, $cartItem['it_id'], $isDirectCart, (int) $ct_id);
            shop_api_cart_validate_buy_qty($item, $newQty, $activeBaseQty, true);
        }
    }
    if (!empty($cartItem['ct_option'])) {
        $optStock = DB::fetch(
            "SELECT io_stock_qty FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
            [$cartItem['it_id'], $cartItem['ct_option']]
        );
        if (!$optStock) {
            Response::error('Selected option is no longer available.', 400);
        }
    }

    // 수량만 바꿀 때: 이 줄(이 행을 뺀 같은 상품 · 옵션) + 새 수량이 쓸 수 있는 재고를 넘으면 거부.
    //   담기와 같은 shop_api_cart_assert_stock — 재고 0 은 품절, 옵션 행은 옵션 재고로 센다.
    if (!$isChangingOption) {
        $lineIoId = (string) ($cartItem['io_id'] ?? '');
        $lineIoType = (int) ($cartItem['io_type'] ?? 0);
        shop_api_cart_assert_stock(
            $cartItem['it_id'],
            $lineIoId,
            $lineIoType,
            shop_api_cart_line_qty($cart_id, $cartItem['it_id'], $lineIoId, $lineIoType, $isDirectCart, (int) $ct_id) + $newQty
        );
    }

    // 옵션 변경 — input 에 ct_option(io_id) 가 들어오고 기존과 다르면 옵션 갱신.
    //   영카트 cartoption.php 대체. 새 옵션의 io_price 로 ct_price 재계산.
    //   같은 it_id + 새 io_id 의 다른 카트 행이 이미 있으면 거기로 수량 합치고
    //   현재 행 삭제 — 중복 행 방지.
    if ($isChangingOption) {
        // 새 옵션 정보 로드.
        $newOpt = DB::fetch(
            "SELECT io_id, io_type, io_price, io_stock_qty FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
            [$cartItem['it_id'], $newCtOption]
        );
        if (!$newCtOption) {
            // 옵션 해제 시 (빈 문자열) — 일반 상품은 가능하지만 옵션 필수 상품이면 거부.
        } elseif (!$newOpt) {
            Response::error('선택한 옵션을 사용할 수 없습니다.', 400);
        } else {
            $newIoType  = (int) $newOpt['io_type'];
            $newIoPrice = (int) $newOpt['io_price'];
            // 새 옵션 줄에 이미 담긴 수량(아래에서 합칠 행) + 새 수량으로 재고를 본다.
            shop_api_cart_assert_stock(
                $cartItem['it_id'],
                $newCtOption,
                $newIoType,
                shop_api_cart_line_qty($cart_id, $cartItem['it_id'], $newCtOption, $newIoType, $isDirectCart, (int) $ct_id) + $newQty
            );

            // 같은 it_id + 같은 새 io_id 의 다른 행이 이미 있으면 합쳐.
            if ($newIoType === 0) {
                $itemForLimit = DB::fetch(
                    "SELECT it_stock_qty, it_buy_min_qty, it_buy_max_qty FROM " . DB::table('g5_shop_item_table') . "
                     WHERE it_id = ? LIMIT 1",
                    [$cartItem['it_id']]
                );
                $activeBaseQty = shop_api_cart_active_base_qty($cart_id, $cartItem['it_id'], $isDirectCart, (int) $ct_id);
                if ($itemForLimit) {
                    shop_api_cart_validate_buy_qty($itemForLimit, $newQty, $activeBaseQty, true);
                }
            }

            $sibling = DB::fetch(
                "SELECT ct_id, ct_qty FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE od_id = ? AND it_id = ? AND io_id = ? AND ct_direct = ? AND ct_id <> ?
                    AND " . shop_api_cart_active_status_sql() . "
                 LIMIT 1",
                array_merge(
                    [$cart_id, $cartItem['it_id'], $newCtOption, $isDirectCart ? 1 : 0, $ct_id],
                    shop_api_cart_active_statuses()
                )
            );
            if ($sibling) {
                DB::execute(
                    "UPDATE " . DB::table('g5_shop_cart_table') . "
                     SET ct_qty = ? WHERE ct_id = ?",
                    [(int) $sibling['ct_qty'] + $newQty, $sibling['ct_id']]
                );
                DB::execute(
                    "DELETE FROM " . DB::table('g5_shop_cart_table') . " WHERE ct_id = ?",
                    [$ct_id]
                );
                shop_api_reevaluate_line_coupon((int) $sibling['ct_id'], $patchMbId);
                $merged = DB::fetch(
                    "SELECT * FROM " . DB::table('g5_shop_cart_table') . " WHERE ct_id = ? LIMIT 1",
                    [$sibling['ct_id']]
                );
                Response::success(shop_api_with_cart_id($merged, (string) $cart_id));
            }

            // 옵션만 갱신 — ct_price 는 새 io_type 에 따라 재계산.
            $itemPrice = DB::fetch(
                "SELECT it_price FROM " . DB::table('g5_shop_item_table') . " WHERE it_id = ? LIMIT 1",
                [$cartItem['it_id']]
            );
            $basePrice = (int) ($itemPrice['it_price'] ?? 0);
            $newCtPrice = $basePrice;

            DB::execute(
                "UPDATE " . DB::table('g5_shop_cart_table') . "
                 SET ct_qty = ?, ct_option = ?, io_id = ?, io_type = ?, io_price = ?, ct_price = ?
                 WHERE ct_id = ? AND od_id = ?",
                [$newQty, $newCtOption, $newCtOption, $newIoType, $newIoPrice, $newCtPrice, $ct_id, $cart_id]
            );
            shop_api_reevaluate_line_coupon((int) $ct_id, $patchMbId);
            $updated = DB::fetch(
                "SELECT * FROM " . DB::table('g5_shop_cart_table') . " WHERE ct_id = ? LIMIT 1",
                [$ct_id]
            );
            Response::success(shop_api_with_cart_id($updated, (string) $cart_id));
        }
    }

    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET ct_qty = ?
         WHERE ct_id = ?
           AND od_id = ?",
        [$newQty, $ct_id, $cart_id]
    );
    shop_api_reevaluate_line_coupon((int) $ct_id, $patchMbId);

    $updated = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_cart_table') . "
         WHERE ct_id = ? LIMIT 1",
        [$ct_id]
    );

    Response::success(shop_api_with_cart_id($updated, (string) $cart_id));
}

// =========================================================================
// DELETE /v1/shop/cart/{ct_id} - Remove single cart item
// =========================================================================
if ($apiMethod === 'DELETE' && $ct_id !== '') {

    $cartItem = DB::fetch(
        "SELECT ct_id FROM " . DB::table('g5_shop_cart_table') . "
         WHERE ct_id = ?
           AND od_id = ?
           AND " . shop_api_cart_active_status_sql() . "
         LIMIT 1",
        array_merge([$ct_id, $cart_id], shop_api_cart_active_statuses())
    );

    if (!$cartItem) {
        Response::error('Cart item not found.', 404);
    }

    DB::execute(
        "DELETE FROM " . DB::table('g5_shop_cart_table') . "
         WHERE ct_id = ? AND od_id = ?",
        [$ct_id, $cart_id]
    );

    Response::noContent();
}

// =========================================================================
// DELETE /v1/shop/cart - Clear entire cart
// =========================================================================
if ($apiMethod === 'DELETE' && $ct_id === '') {

    DB::execute(
        "DELETE FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           AND " . shop_api_cart_active_status_sql(),
        array_merge([$cart_id], shop_api_cart_active_statuses())
    );

    Response::noContent();
}

Response::error('Method not allowed.', 405);
