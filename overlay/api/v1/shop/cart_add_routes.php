<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if ($apiMethod === 'POST' && $ct_id === '') {

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $it_id    = isset($input['it_id']) ? trim($input['it_id']) : '';
    $ct_qty   = isset($input['ct_qty']) ? (int) $input['ct_qty'] : 1;
    $ct_option = isset($input['ct_option']) ? trim($input['ct_option']) : '';
    $ct_send_cost = isset($input['ct_send_cost'])
        ? (int) $input['ct_send_cost']
        : (isset($input['send_cost']) ? (int) $input['send_cost'] : 0);
    $sw_direct = !empty($input['direct']) || !empty($input['sw_direct']);
    $replace_direct = !array_key_exists('replace_direct', $input) || !empty($input['replace_direct']);
    if ($ct_option === '' && !empty($input['options']) && is_array($input['options'])) {
        $firstOption = reset($input['options']);
        if (is_array($firstOption) && !empty($firstOption['io_id'])) {
            $ct_option = trim((string) $firstOption['io_id']);
        }
    }

    if (!$it_id) {
        Response::error('it_id is required.', 422);
    }
    if ($ct_qty < 1) {
        Response::error('ct_qty must be at least 1.', 422);
    }

    // Check product exists and is available — it_point_type 도 함께 가져와야
    // get_item_point() 가 정률/정액 정확히 계산.
    $item = DB::fetch(
        "SELECT it_id, it_name, it_price, it_stock_qty, it_soldout, it_use, it_tel_inq,
                it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty,
                it_point, it_point_type, it_supply_point, it_notax, it_buy_min_qty, it_buy_max_qty
         FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? LIMIT 1",
        [$it_id]
    );

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
    $ct_send_cost = shop_api_cart_normalize_send_cost_choice($item, $ct_send_cost);

    if ($sw_direct && $replace_direct) {
        DB::execute(
            "DELETE FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ?
               AND ct_direct = 1",
            [$cart_id]
        );
    }

    $optionInputs = shop_api_cart_option_inputs($input, $ct_qty);
    if (!empty($optionInputs)) {
        $baseBatchQty = 0;
        $optionBatch = [];
        $optionTypeById = [];
        foreach ($optionInputs as $optionInput) {
            $optRow = DB::fetch(
                "SELECT io_id, io_type, io_stock_qty FROM " . DB::table('g5_shop_item_option_table') . "
                 WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
                [$it_id, $optionInput['io_id']]
            );
            if (!$optRow) {
                Response::error('Selected option is not available.', 400);
            }

            $ioType = (int) $optRow['io_type'];
            $optionTypeById[$optRow['io_id']] = $ioType;
            if ($ioType === 0) {
                $baseBatchQty += (int) $optionInput['ct_qty'];
            }

            $key = $ioType . '|' . $optRow['io_id'];
            if (!isset($optionBatch[$key])) {
                $optionBatch[$key] = [
                    'io_id' => $optRow['io_id'],
                    'io_type' => $ioType,
                    'io_stock_qty' => (int) $optRow['io_stock_qty'],
                    'ct_qty' => 0,
                ];
            }
            $optionBatch[$key]['ct_qty'] += (int) $optionInput['ct_qty'];
        }

        if ($baseBatchQty > 0) {
            $existingBaseQty = shop_api_cart_active_base_qty($cart_id, $it_id, $sw_direct);
            shop_api_cart_validate_buy_qty($item, $baseBatchQty, $existingBaseQty);
        }

        if ((int) $item['it_stock_qty'] > 0 && $baseBatchQty > 0) {
            $activeQty = DB::fetch(
                "SELECT IFNULL(SUM(ct_qty), 0) AS qty FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE od_id = ? AND it_id = ? AND io_type = 0
                   AND " . shop_api_cart_active_status_sql(),
                array_merge([$cart_id, $it_id], shop_api_cart_active_statuses())
            );
            if ((int) ($activeQty['qty'] ?? 0) + $baseBatchQty > (int) $item['it_stock_qty']) {
                Response::error('Requested quantity exceeds available stock (' . $item['it_stock_qty'] . ').', 400);
            }
        }

        $hasBaseOptions = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_use = 1 AND io_type = 0",
            [$it_id]
        );
        if ($hasBaseOptions > 0 && $baseBatchQty <= 0) {
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

        foreach ($optionBatch as $batch) {
            if ((int) $batch['io_stock_qty'] <= 0) {
                continue;
            }
            $activeOptionQty = DB::fetch(
                "SELECT IFNULL(SUM(ct_qty), 0) AS qty FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE od_id = ? AND it_id = ? AND io_id = ? AND io_type = ?
                   AND " . shop_api_cart_active_status_sql(),
                array_merge([$cart_id, $it_id, $batch['io_id'], $batch['io_type']], shop_api_cart_active_statuses())
            );
            if ((int) ($activeOptionQty['qty'] ?? 0) + (int) $batch['ct_qty'] > (int) $batch['io_stock_qty']) {
                Response::error('Requested quantity exceeds available option stock (' . $batch['io_stock_qty'] . ').', 400);
            }
        }

        $cartItems = [];
        usort($optionInputs, function ($a, $b) use ($optionTypeById) {
            return ($optionTypeById[$a['io_id']] ?? 0) <=> ($optionTypeById[$b['io_id']] ?? 0);
        });
        foreach ($optionInputs as $optionInput) {
            $cartItems[] = shop_api_cart_add_row(
                $cart_id,
                $mb_id,
                $item,
                $it_id,
                $optionInput['io_id'],
                $optionInput['ct_qty'],
                $sw_direct,
                $ct_send_cost
            );
        }

        Response::success(['items' => $cartItems, 'cart_id' => (string) $cart_id], 201);
    }

    if ($ct_option !== '') {
        $singleOpt = DB::fetch(
            "SELECT io_type FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
            [$it_id, $ct_option]
        );
        if (!$singleOpt) {
            Response::error('Selected option is not available.', 400);
        }
        if ((int) ($singleOpt['io_type'] ?? 0) === 0) {
            $existingBaseQty = shop_api_cart_active_base_qty($cart_id, $it_id, $sw_direct);
            shop_api_cart_validate_buy_qty($item, $ct_qty, $existingBaseQty);
        }

        $cartItem = shop_api_cart_add_row($cart_id, $mb_id, $item, $it_id, $ct_option, $ct_qty, $sw_direct, $ct_send_cost);
        Response::success(shop_api_with_cart_id($cartItem, (string) $cart_id), 201);
    }

    if ((int) $item['it_stock_qty'] > 0 && $ct_qty > (int) $item['it_stock_qty']) {
        Response::error('Requested quantity exceeds available stock (' . $item['it_stock_qty'] . ').', 400);
    }

    // 옵션별 재고 검사 — 옵션이 지정된 상품은 해당 io_stock_qty 가 0 보다 크면 그 한도까지만.
    //   상품에 옵션 목록이 있는데 사용자가 옵션을 안 골랐다면 거부 (선택 강제).
    $hasOptions = DB::count(
        "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_option_table') . "
         WHERE it_id = ? AND io_use = 1 AND io_type = 0",
        [$it_id]
    );
    if ($hasOptions > 0 && $ct_option === '') {
        Response::error('옵션을 선택해주세요.', 400);
    }
    $optQty = 0;
    if ($ct_option !== '') {
        $optStock = DB::fetch(
            "SELECT io_stock_qty FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
            [$it_id, $ct_option]
        );
        if (!$optStock) {
            Response::error('선택한 옵션을 사용할 수 없습니다.', 400);
        }
        $optQty = (int) $optStock['io_stock_qty'];
        if ($optQty > 0 && $ct_qty > $optQty) {
            Response::error('해당 옵션 재고 부족 (' . $optQty . ').', 400);
        }
    }

    $existingBaseQty = shop_api_cart_active_base_qty($cart_id, $it_id, $sw_direct);
    shop_api_cart_validate_buy_qty($item, $ct_qty, $existingBaseQty);

    // Check if same item + option already in cart
    $existing = DB::fetch(
        "SELECT ct_id, ct_qty FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           AND it_id = ?
           AND ct_option = ?
           AND ct_direct = ?
           AND " . shop_api_cart_active_status_sql() . "
         LIMIT 1",
        array_merge([$cart_id, $it_id, $ct_option, $sw_direct ? 1 : 0], shop_api_cart_active_statuses())
    );

    if ($existing) {
        // Update existing cart item qty
        $newQty = (int) $existing['ct_qty'] + $ct_qty;
        if ((int) $item['it_stock_qty'] > 0 && $newQty > (int) $item['it_stock_qty']) {
            Response::error('Requested quantity exceeds available stock (' . $item['it_stock_qty'] . ').', 400);
        }
        if ($optQty > 0 && $newQty > $optQty) {
            Response::error('Requested quantity exceeds available option stock (' . $optQty . ').', 400);
        }
        DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET ct_qty = ?,
                 ct_send_cost = ?
             WHERE ct_id = ?
               AND od_id = ?",
            [$newQty, $ct_send_cost, $existing['ct_id'], $cart_id]
        );

        $cartItem = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_cart_table') . "
             WHERE ct_id = ? LIMIT 1",
            [$existing['ct_id']]
        );
    } else {
        // Insert new cart row
        $ct_price = (int) $item['it_price'];
        $io_id = $ct_option;
        $io_type = 0;
        $io_price = 0;

        // Add option price if option selected
        if ($ct_option !== '') {
            $optRow = DB::fetch(
                "SELECT io_id, io_type, io_price FROM " . DB::table('g5_shop_item_option_table') . "
                 WHERE it_id = ? AND io_id = ? AND io_use = 1 LIMIT 1",
                [$it_id, $ct_option]
            );
            if ($optRow) {
                $io_id = $optRow['io_id'];
                $io_type = (int) $optRow['io_type'];
                $io_price = (int) $optRow['io_price'];
                $ct_option = $optRow['io_id'] ?: $ct_option;
            }
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
                $ct_price,
                // ct_point — 정률 상품은 get_item_point() 로 단가 기준 적립액 계산.
                // 옵션 가격 포함 (io_id 전달). 함수 없으면 raw it_point fallback.
                $io_type === 1
                    ? max(0, (int) ($item['it_supply_point'] ?? 0))
                    : (function_exists('get_item_point')
                        ? max(0, (int) get_item_point($item, $ct_option))
                        : max(0, (int) ($item['it_point'] ?? 0))),
                $ct_qty,
                $ct_option,
                (int) ($item['it_notax'] ?? 0),
                $io_id,
                $io_type,
                $io_price,
                shop_api_cart_status_shopping(),
                $_SERVER['REMOTE_ADDR'] ?? '',
                $ct_send_cost,
                $sw_direct ? 1 : 0,
            ]
        );

        $newCtId = DB::lastInsertId();
        $cartItem = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_cart_table') . "
             WHERE ct_id = ? LIMIT 1",
            [$newCtId]
        );
    }

    Response::success(shop_api_with_cart_id($cartItem, (string) $cart_id), 201);
}

// =========================================================================
// PATCH /v1/shop/cart/{ct_id} - Update cart item qty
// =========================================================================
