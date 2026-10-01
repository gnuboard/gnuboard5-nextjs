<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function shop_api_cart_option_inputs($input, $defaultQty) {
    if (empty($input['options']) || !is_array($input['options'])) {
        return [];
    }

    $rows = [];
    foreach ($input['options'] as $option) {
        if (!is_array($option)) {
            Response::error('options must be an array of objects.', 422);
        }

        $ioId = trim((string) ($option['io_id'] ?? $option['ct_option'] ?? ''));
        $qty = isset($option['ct_qty'])
            ? (int) $option['ct_qty']
            : (isset($option['qty']) ? (int) $option['qty'] : (int) $defaultQty);

        if ($ioId === '') {
            Response::error('options[].io_id is required.', 422);
        }
        if ($qty < 1) {
            Response::error('options[].ct_qty must be at least 1.', 422);
        }

        $rows[] = [
            'io_id' => $ioId,
            'ct_qty' => $qty,
        ];
    }

    return $rows;
}

function shop_api_cart_active_base_qty($cart_id, $it_id, $direct = false, $excludeCtId = 0) {
    $sql = "SELECT IFNULL(SUM(ct_qty), 0) AS qty FROM " . DB::table('g5_shop_cart_table') . "
            WHERE od_id = ? AND it_id = ? AND io_type = 0 AND ct_direct = ?
              AND " . shop_api_cart_active_status_sql();
    $params = array_merge([$cart_id, $it_id, $direct ? 1 : 0], shop_api_cart_active_statuses());

    if ((int) $excludeCtId > 0) {
        $sql .= " AND ct_id <> ?";
        $params[] = (int) $excludeCtId;
    }

    $row = DB::fetch($sql, $params);
    return (int) ($row['qty'] ?? 0);
}

/**
 * 이 장바구니에 이미 담긴 같은 줄(같은 상품 · 같은 옵션 · 바로구매 여부)의 수량. $excludeCtId 행은 뺀다(수량 바꾸기).
 */
function shop_api_cart_line_qty($cart_id, $it_id, $ioId, $ioType, $direct = false, $excludeCtId = 0) {
    $sql = "SELECT IFNULL(SUM(ct_qty), 0) AS qty FROM " . DB::table('g5_shop_cart_table') . "
            WHERE od_id = ? AND it_id = ? AND io_id = ? AND io_type = ? AND ct_direct = ?
              AND " . shop_api_cart_active_status_sql();
    $params = array_merge([$cart_id, $it_id, (string) $ioId, (int) $ioType, $direct ? 1 : 0], shop_api_cart_active_statuses());

    if ((int) $excludeCtId > 0) {
        $sql .= " AND ct_id <> ?";
        $params[] = (int) $excludeCtId;
    }

    $row = DB::fetch($sql, $params);
    return (int) ($row['qty'] ?? 0);
}

/**
 * 담기 · 수량 바꾸기의 재고 검사 — 주문 때의 shop_api_validate_order_stock() 과 같은 기준(영카트 cartupdate.php).
 * 쓸 수 있는 재고(창고 재고 - 주문 대기 수량, shop_api_stock_available_qty)를 이 줄의 합계 수량이 넘으면 거부한다.
 * 재고 0 은 품절이다 — 전에는 0 을 '재고 관리 안 함'으로 보아 담기는 되고 주문 단계에서야 막혔다.
 * 옵션 없는 본품은 상품 재고, 옵션 행(선택 · 추가)은 그 옵션 재고만 본다(영카트 원본과 같다).
 */
function shop_api_cart_assert_stock($it_id, $ioId, $ioType, $totalQty) {
    $ioId = (string) $ioId;
    $available = shop_api_stock_available_qty((string) $it_id, $ioId, (int) $ioType);
    if ((int) $totalQty <= $available) {
        return;
    }

    $context = ['it_id' => (string) $it_id, 'io_id' => $ioId, 'available_qty' => max(0, $available)];
    if ($available <= 0) {
        Response::error($ioId !== '' ? '선택한 옵션은 품절입니다.' : 'Product is sold out.', 400, $context);
    }
    Response::error(
        'Requested quantity exceeds available ' . ($ioId !== '' ? 'option ' : '') . 'stock (' . $available . ').',
        400,
        $context
    );
}

function shop_api_cart_validate_buy_qty($item, $submittedBaseQty, $existingBaseQty = 0, $useTotalForMin = false) {
    $submittedBaseQty = max(0, (int) $submittedBaseQty);
    $existingBaseQty = max(0, (int) $existingBaseQty);
    if ($submittedBaseQty <= 0) {
        return;
    }

    $minQty = max(0, (int) ($item['it_buy_min_qty'] ?? 0));
    $maxQty = max(0, (int) ($item['it_buy_max_qty'] ?? 0));
    $totalQty = $existingBaseQty + $submittedBaseQty;
    $minTargetQty = $useTotalForMin ? $totalQty : $submittedBaseQty;

    if ($minQty > 0 && $minTargetQty < $minQty) {
        Response::error('Minimum purchase quantity for this product is ' . $minQty . '.', 422);
    }

    if ($maxQty > 0 && $submittedBaseQty > $maxQty) {
        Response::error('Maximum purchase quantity for this product is ' . $maxQty . '.', 422);
    }

    if ($maxQty > 0 && $totalQty > $maxQty) {
        Response::error('You can add up to ' . $maxQty . ' items for this product.', 422);
    }
}

function shop_api_cart_normalize_send_cost_choice($item, $requested = 0) {
    $scType = (int) ($item['it_sc_type'] ?? 0);
    $scMethod = (int) ($item['it_sc_method'] ?? 0);

    if ($scType === 1) {
        return 2; // 무료배송
    }

    if ($scType > 1 && $scMethod === 1) {
        return 1; // 수령후 지불
    }

    if ($scType > 1 && $scMethod === 2) {
        return (int) $requested === 1 ? 1 : 0; // 사용자 선택
    }

    return 0; // 주문시 결제
}

function shop_api_cart_add_row($cart_id, $mb_id, $item, $it_id, $ioId, $qty, $direct = false, $ctSendCost = 0) {
    $optRow = null;
    $ioType = 0;
    $ioPrice = 0;

    if ($ioId !== '') {
        $optRow = DB::fetch(
            "SELECT io_id, io_type, io_price, io_stock_qty FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
            [$it_id, $ioId]
        );
        if (!$optRow) {
            Response::error('Selected option is not available.', 400);
        }
        $ioType = (int) $optRow['io_type'];
        $ioPrice = (int) $optRow['io_price'];

        if ($ioType === 1 && $ioPrice < 0) {
            Response::error('Products with a negative purchase amount cannot be purchased.', 400);
        }
        if ($ioType === 0 && (int) $item['it_price'] + $ioPrice < 0) {
            Response::error('Products with a negative purchase amount cannot be purchased.', 400);
        }

        if ($ioType === 1) {
            $activeBaseQty = shop_api_cart_active_base_qty($cart_id, $it_id, $direct);
            if ($activeBaseQty <= 0) {
                Response::error('Base option is required before adding supply options.', 400);
            }
            $hasBaseOptions = DB::count(
                "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_option_table') . "
                 WHERE it_id = ? AND io_use = 1 AND io_type = 0",
                [$it_id]
            );
            if ($hasBaseOptions > 0) {
                $activeBase = DB::fetch(
                    "SELECT IFNULL(SUM(ct_qty), 0) AS qty FROM " . DB::table('g5_shop_cart_table') . "
                     WHERE od_id = ? AND it_id = ? AND io_type = 0
                       AND " . shop_api_cart_active_status_sql(),
                    array_merge([$cart_id, $it_id], shop_api_cart_active_statuses())
                );
                if ((int) ($activeBase['qty'] ?? 0) <= 0) {
                    Response::error('Base option is required before adding supply options.', 400);
                }
            }
        }
    }

    $existing = DB::fetch(
        "SELECT ct_id, ct_qty FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ? AND it_id = ? AND io_id = ? AND io_type = ?
           AND ct_direct = ?
           AND " . shop_api_cart_active_status_sql() . "
         LIMIT 1",
        array_merge([$cart_id, $it_id, $ioId, $ioType, $direct ? 1 : 0], shop_api_cart_active_statuses())
    );

    // 이 줄에 이미 담긴 수량 + 이번 수량이 쓸 수 있는 재고를 넘으면 거부(재고 0 은 품절).
    shop_api_cart_assert_stock($it_id, $ioId, $ioType, (int) ($existing['ct_qty'] ?? 0) + $qty);

    $ctSendCost = shop_api_cart_normalize_send_cost_choice($item, $ctSendCost);

    if ($existing) {
        $newQty = (int) $existing['ct_qty'] + $qty;
        DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET ct_qty = ?,
                 ct_send_cost = ?
             WHERE ct_id = ? AND od_id = ?",
            [$newQty, $ctSendCost, $existing['ct_id'], $cart_id]
        );

        return DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_cart_table') . "
             WHERE ct_id = ? LIMIT 1",
            [$existing['ct_id']]
        );
    }

    $ctPrice = (int) $item['it_price'];
    $ctPoint = $ioType === 1
        ? max(0, (int) ($item['it_supply_point'] ?? 0))
        : (function_exists('get_item_point') ? (int) get_item_point($item, $ioId) : (int) ($item['it_point'] ?? 0));
    if ($ctPoint < 0) {
        $ctPoint = 0;
    }

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_cart_table') . "
         SET od_id     = ?,
             mb_id     = ?,
             it_id     = ?,
             it_name   = ?,
             it_sc_type = ?,
             it_sc_method = ?,
             it_sc_price = ?,
             it_sc_minimum = ?,
             it_sc_qty = ?,
             ct_price  = ?,
             ct_point  = ?,
             ct_point_use = 0,
             ct_stock_use = 0,
             ct_qty    = ?,
             ct_option = ?,
             ct_notax  = ?,
             io_id     = ?,
             io_type   = ?,
             io_price  = ?,
             ct_status = ?,
             ct_history = '',
             ct_time   = NOW(),
             ct_ip     = ?,
             ct_send_cost = ?,
             ct_direct = ?,
             ct_select = 1,
             ct_select_time = NOW()",
        [
            $cart_id,
            $mb_id,
            $it_id,
            $item['it_name'],
            (int) ($item['it_sc_type'] ?? 0),
            (int) ($item['it_sc_method'] ?? 0),
            (int) ($item['it_sc_price'] ?? 0),
            (int) ($item['it_sc_minimum'] ?? 0),
            (int) ($item['it_sc_qty'] ?? 0),
            $ctPrice,
            $ctPoint,
            $qty,
            $ioId,
            (int) ($item['it_notax'] ?? 0),
            $ioId,
            $ioType,
            $ioPrice,
            shop_api_cart_status_shopping(),
            $_SERVER['REMOTE_ADDR'] ?? '',
            $ctSendCost,
            $direct ? 1 : 0,
        ]
    );

    $newCtId = DB::lastInsertId();
    return DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_cart_table') . "
         WHERE ct_id = ? LIMIT 1",
        [$newCtId]
    );
}

function shop_api_cart_legacy_input() {
    $input = $_POST;
    if (empty($input)) {
        $json = json_decode(file_get_contents('php://input'), true);
        if (is_array($json)) {
            $input = $json;
        }
    }

    foreach ($_GET as $key => $value) {
        if (!array_key_exists($key, $input)) {
            $input[$key] = $value;
        }
    }

    return is_array($input) ? $input : [];
}

function shop_api_cart_legacy_truthy($value) {
    if (is_array($value)) {
        $value = reset($value);
    }

    $normalized = strtolower(trim((string) $value));
    return $normalized !== '' && $normalized !== '0' && $normalized !== 'false' && $normalized !== 'no';
}

function shop_api_cart_legacy_clean_it_id($value) {
    return preg_replace('/[^0-9a-z_\-]/i', '', (string) $value);
}

function shop_api_cart_legacy_array($value) {
    if (is_array($value)) {
        return $value;
    }
    if ($value === null || $value === '') {
        return [];
    }
    return [$value];
}

function shop_api_cart_legacy_selected_values(array $input, $field) {
    $values = shop_api_cart_legacy_array($input[$field] ?? null);
    $checks = shop_api_cart_legacy_array($input['ct_chk'] ?? null);

    if (empty($checks)) {
        return array_values(array_filter($values, function ($value) {
            return trim((string) $value) !== '';
        }));
    }

    $selected = [];
    foreach ($values as $index => $value) {
        if (array_key_exists($index, $checks) && shop_api_cart_legacy_truthy($checks[$index])) {
            $selected[] = $value;
        }
    }

    return $selected;
}

function shop_api_cart_legacy_redirect($path, array $data = []) {
    Response::success(array_merge([
        'redirect' => $path,
    ], $data));
}

function shop_api_cart_legacy_product($it_id) {
    return DB::fetch(
        "SELECT it_id, it_name, it_price, it_stock_qty, it_soldout, it_use, it_tel_inq,
                it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty,
                it_point, it_point_type, it_supply_point, it_notax, it_buy_min_qty, it_buy_max_qty
         FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? LIMIT 1",
        [$it_id]
    );
}

function shop_api_cart_legacy_options_for_item(array $input, $it_id, $defaultQty) {
    $ioIds = [];
    if (isset($input['io_id'][$it_id])) {
        $ioIds = shop_api_cart_legacy_array($input['io_id'][$it_id]);
    } elseif (isset($input['ct_option'][$it_id])) {
        $ioIds = shop_api_cart_legacy_array($input['ct_option'][$it_id]);
    } elseif (isset($input['io_id']) && !is_array($input['io_id'])) {
        $ioIds = [trim((string) $input['io_id'])];
    } elseif (isset($input['ct_option']) && !is_array($input['ct_option'])) {
        $ioIds = [trim((string) $input['ct_option'])];
    }

    $qtys = [];
    if (isset($input['ct_qty'][$it_id])) {
        $qtys = shop_api_cart_legacy_array($input['ct_qty'][$it_id]);
    }

    $rows = [];
    foreach ($ioIds as $index => $ioId) {
        $ioId = trim((string) $ioId);
        $qty = isset($qtys[$index]) ? (int) $qtys[$index] : (int) $defaultQty;
        if ($qty < 1) {
            Response::error('ct_qty must be at least 1.', 422);
        }
        $rows[] = [
            'io_id' => $ioId,
            'ct_qty' => $qty,
        ];
    }

    return $rows;
}

// =========================================================================
// GET|POST /v1/shop/cart/order-stock - YoungCart ajax.orderstock.php compatible check
// =========================================================================
