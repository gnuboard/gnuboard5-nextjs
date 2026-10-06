<?php
/**
 * 주문 재고: 남은 수량 계산 · 주문 전 재고 확인 · 주문 확정 때 재고 빼기.
 * api/v1/shop/common.php 가 불러 쓴다.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_stock_available_qty')) {
    function shop_api_stock_available_qty(string $itId, string $ioId = '', int $ioType = 0): int
    {
        if ($ioId !== '') {
            if (function_exists('get_option_stock_qty')) {
                return (int) get_option_stock_qty($itId, $ioId, $ioType);
            }

            $row = DB::fetch(
                "SELECT io_stock_qty FROM " . DB::table('g5_shop_item_option_table') . "
                 WHERE it_id = ? AND io_id = ? AND io_type = ? AND io_use = 1 LIMIT 1",
                [$itId, $ioId, $ioType]
            );
            $stock = (int) ($row['io_stock_qty'] ?? 0);
            $pending = DB::fetch(
                "SELECT SUM(ct_qty) AS qty FROM " . DB::table('g5_shop_cart_table') . "
                 WHERE it_id = ? AND io_id = ? AND io_type = ?
                   AND ct_stock_use = 0
                   AND ct_status IN ('주문', '입금', '준비')",
                [$itId, $ioId, $ioType]
            );
            return $stock - (int) ($pending['qty'] ?? 0);
        }

        if (function_exists('get_it_stock_qty')) {
            return (int) get_it_stock_qty($itId);
        }

        $row = DB::fetch(
            "SELECT it_stock_qty FROM " . DB::table('g5_shop_item_table') . "
             WHERE it_id = ? LIMIT 1",
            [$itId]
        );
        $stock = (int) ($row['it_stock_qty'] ?? 0);
        $pending = DB::fetch(
            "SELECT SUM(ct_qty) AS qty FROM " . DB::table('g5_shop_cart_table') . "
             WHERE it_id = ? AND io_id = ''
               AND ct_stock_use = 0
               AND ct_status IN ('주문', '입금', '준비')",
            [$itId]
        );
        return $stock - (int) ($pending['qty'] ?? 0);
    }
}

if (!function_exists('shop_api_validate_order_stock')) {
    function shop_api_validate_order_stock(array $cartItems): void
    {
        $groups = [];
        $checkedItems = [];

        foreach ($cartItems as $row) {
            $itId = (string) ($row['it_id'] ?? '');
            if ($itId === '') {
                Response::error('Invalid cart item.', 400);
            }

            if (!isset($checkedItems[$itId])) {
                $item = DB::fetch(
                    "SELECT it_id, it_name, it_soldout, it_use, ca_id, ca_id2, ca_id3
                     FROM " . DB::table('g5_shop_item_table') . "
                     WHERE it_id = ? LIMIT 1",
                    [$itId]
                );
                if (!$item) {
                    Response::error('Cart item no longer exists.', 400, ['it_id' => $itId]);
                }

                $categoryDisabled = false;
                $categoryIds = array_values(array_filter([
                    (string) ($item['ca_id'] ?? ''),
                    (string) ($item['ca_id2'] ?? ''),
                    (string) ($item['ca_id3'] ?? ''),
                ]));
                if ((int) ($item['it_use'] ?? 0) === 1 && $categoryIds) {
                    $placeholders = implode(',', array_fill(0, count($categoryIds), '?'));
                    $categories = DB::fetchAll(
                        "SELECT ca_use FROM " . DB::table('g5_shop_category_table') . "
                         WHERE ca_id IN ({$placeholders})",
                        $categoryIds
                    );
                    foreach ($categories as $category) {
                        if ((int) ($category['ca_use'] ?? 0) !== 1) {
                            $categoryDisabled = true;
                            break;
                        }
                    }
                }

                if ((int) ($item['it_soldout'] ?? 0) === 1 || (int) ($item['it_use'] ?? 0) !== 1 || $categoryDisabled) {
                    $reason = (int) ($item['it_soldout'] ?? 0) === 1 ? '품절' : '판매중지';
                    Response::error((string) ($item['it_name'] ?? $itId) . ' 상품은 ' . $reason . ' 상태입니다. 장바구니에서 다시 확인해 주세요.', 400, [
                        'it_id' => $itId,
                        'reason' => $reason,
                    ]);
                }

                $checkedItems[$itId] = true;
            }

            $ioId = (string) ($row['io_id'] ?? '');
            $ioType = (int) ($row['io_type'] ?? 0);
            $key = $itId . "\x1f" . $ioId . "\x1f" . $ioType;
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'it_id' => $itId,
                    'it_name' => (string) ($row['it_name'] ?? $itId),
                    'io_id' => $ioId,
                    'io_type' => $ioType,
                    'ct_option' => (string) ($row['ct_option'] ?? ''),
                    'qty' => 0,
                ];
            }
            $groups[$key]['qty'] += (int) ($row['ct_qty'] ?? 0);
        }

        foreach ($groups as $group) {
            $available = shop_api_stock_available_qty($group['it_id'], $group['io_id'], $group['io_type']);
            if ((int) $group['qty'] > $available) {
                $label = $group['it_name'];
                if ($group['io_id'] !== '') {
                    $label .= '(' . ($group['ct_option'] !== '' ? $group['ct_option'] : $group['io_id']) . ')';
                }
                Response::error($label . ' 의 재고수량이 부족합니다. 현재 재고수량 : ' . number_format($available) . ' 개', 400, [
                    'it_id' => $group['it_id'],
                    'io_id' => $group['io_id'],
                    'requested_qty' => (int) $group['qty'],
                    'available_qty' => $available,
                ]);
            }
        }
    }
}

if (!function_exists('shop_api_decrement_order_stock')) {
    /**
     * 주문 줄의 재고를 줄인다(상품 · 선택옵션별로 합쳐서, 재고가 모자라지 않을 때만). 중간 상품이 모자라거나(동시에 마지막
     * 재고를 산 경우) DB 오류가 나면 앞에서 줄인 재고를 되돌린 뒤 멈춘다 — 쇼핑 테이블이 MyISAM 이면 트랜잭션 되돌리기가
     * 듣지 않는다.
     */
    function shop_api_decrement_order_stock(array $cartItems): void
    {
        $done = [];
        try {
            foreach (shop_api_order_stock_groups($cartItems) as $group) {
                if (shop_api_change_stock_group($group, -1) !== 1) {
                    throw new RuntimeException(shop_api_order_stock_label($group) . ' 의 재고수량이 부족합니다. 장바구니에서 다시 확인해 주세요.');
                }
                $done[] = $group;
            }
        } catch (\Throwable $e) {
            foreach ($done as $taken) {
                try {
                    shop_api_change_stock_group($taken, 1);
                } catch (\Throwable $restoreError) {
                    error_log('[stock] restore failed ' . $taken['it_id'] . ': ' . $restoreError->getMessage());
                }
            }
            throw $e;
        }
    }
}

if (!function_exists('shop_api_restore_order_stock')) {
    /** shop_api_decrement_order_stock() 이 줄인 재고를 그대로 되돌린다 — 주문을 끝내지 못했을 때. */
    function shop_api_restore_order_stock(array $cartItems): void
    {
        foreach (shop_api_order_stock_groups($cartItems) as $group) {
            shop_api_change_stock_group($group, 1);
        }
    }
}

if (!function_exists('shop_api_change_stock_group')) {
    /** 한 상품 · 선택옵션의 재고를 $direction(-1 줄임, 1 되돌림) 만큼. 줄일 때는 재고가 모자라면 바꾸지 않는다. @return int 바뀐 행 수 */
    function shop_api_change_stock_group(array $group, int $direction): int
    {
        $qty = (int) $group['qty'];
        if ($group['io_id'] !== '') {
            return DB::execute(
                "UPDATE " . DB::table('g5_shop_item_option_table') . "
                 SET io_stock_qty = io_stock_qty " . ($direction < 0 ? '-' : '+') . " ?
                 WHERE it_id = ? AND io_id = ? AND io_type = ?"
                    . ($direction < 0 ? " AND io_use = 1 AND io_stock_qty >= ?" : ''),
                $direction < 0
                    ? [$qty, $group['it_id'], $group['io_id'], $group['io_type'], $qty]
                    : [$qty, $group['it_id'], $group['io_id'], $group['io_type']]
            );
        }
        return DB::execute(
            "UPDATE " . DB::table('g5_shop_item_table') . "
             SET it_stock_qty = it_stock_qty " . ($direction < 0 ? '-' : '+') . " ?
             WHERE it_id = ?"
                . ($direction < 0 ? " AND it_use = 1 AND it_soldout = 0 AND it_stock_qty >= ?" : ''),
            $direction < 0 ? [$qty, $group['it_id'], $qty] : [$qty, $group['it_id']]
        );
    }
}

if (!function_exists('shop_api_order_stock_label')) {
    function shop_api_order_stock_label(array $group): string
    {
        $label = $group['it_name'];
        if ($group['io_id'] !== '') {
            $label .= '(' . ($group['ct_option'] !== '' ? $group['ct_option'] : $group['io_id']) . ')';
        }
        return $label;
    }
}

if (!function_exists('shop_api_order_stock_groups')) {
    /** 주문 줄을 상품 · 선택옵션별 수량으로 합친다(재고를 줄이고 되돌리는 단위). */
    function shop_api_order_stock_groups(array $cartItems): array
    {
        $groups = [];

        foreach ($cartItems as $row) {
            $itId = (string) ($row['it_id'] ?? '');
            $qty = (int) ($row['ct_qty'] ?? 0);
            if ($itId === '' || $qty <= 0) {
                throw new RuntimeException('Invalid cart item stock quantity.');
            }

            $ioId = trim((string) ($row['io_id'] ?? ''));
            $ioType = (int) ($row['io_type'] ?? 0);
            $key = $itId . "\x1f" . $ioId . "\x1f" . $ioType;
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'it_id' => $itId,
                    'it_name' => (string) ($row['it_name'] ?? $itId),
                    'io_id' => $ioId,
                    'io_type' => $ioType,
                    'ct_option' => (string) ($row['ct_option'] ?? ''),
                    'qty' => 0,
                ];
            }
            $groups[$key]['qty'] += $qty;
        }

        return array_values($groups);
    }
}
