<?php
/**
 * 장바구니 선택사항수정의 계획 — 한 상품의 줄을 고친 뒤의 목록으로 바꾸려면 무엇을 고치는가.
 * (POST /v1/shop/cart/options — cart_option_routes.php. DB 없이 시험할 수 있게 계산만 한다.)
 *
 * 고친 뒤의 모습을 먼저 다 검사한다 — 본품(선택옵션)이 하나는 있어야 하고, 최소 · 최대 구매수량은 고친 뒤 본품 합계로,
 * 새로 담거나 늘린 줄은 옵션을 쓰는지 · 재고가 되는지. 통과하면 달라진 줄만 고친다(수량 바꾸기 · 새 줄 · 빠진 줄 지우기).
 * 줄이거나 그대로 둔 줄은 옵션을 이제 쓰지 않거나 재고가 모자라도 막지 않는다(PATCH 와 같다 — 손님이 장바구니를
 * 고칠 길은 남긴다. 주문 때 재고를 다시 본다).
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * @param array    $item      ['it_buy_min_qty' => int, 'it_buy_max_qty' => int]
 * @param array    $lines     지금 그 상품의 장바구니 줄 [['ct_id', 'io_id', 'io_type', 'ct_qty'], ...]
 * @param array    $desired   고친 뒤 [['io_id', 'io_type', 'ct_qty'], ...] — 수량 0 은 빼고, 같은 옵션은 합친다
 * @param array    $options   그 상품이 쓰는 옵션 [['io_id', 'io_type'], ...] (io_use = 1)
 * @param callable $available fn(string $ioId, int $ioType): int — 쓸 수 있는 재고(shop_api_stock_available_qty)
 * @return array ['error' => null|['message' => string, 'status' => int],
 *                'update' => [[ct_id, qty], ...], 'insert' => [['io_id', 'io_type', 'ct_qty'], ...], 'delete' => [ct_id, ...]]
 */
function shop_api_cart_option_replace_plan(array $item, array $lines, array $desired, array $options, callable $available): array
{
    $key = function ($ioId, $ioType): string {
        return ((int) $ioType === 1 ? 1 : 0) . '|' . (string) $ioId;
    };
    $fail = function (string $message, int $status): array {
        return ['error' => ['message' => $message, 'status' => $status], 'update' => [], 'insert' => [], 'delete' => []];
    };

    $want = [];
    foreach ($desired as $row) {
        $qty = (int) ($row['ct_qty'] ?? 0);
        if ($qty < 1) {
            continue;
        }
        $ioType = (int) ($row['io_type'] ?? 0) === 1 ? 1 : 0;
        $ioId = (string) ($row['io_id'] ?? '');
        $k = $key($ioId, $ioType);
        if (isset($want[$k])) {
            $want[$k]['ct_qty'] += $qty;
        } else {
            $want[$k] = ['io_id' => $ioId, 'io_type' => $ioType, 'ct_qty' => $qty];
        }
    }

    $baseTotal = 0;
    foreach ($want as $w) {
        if ($w['io_type'] === 0) {
            $baseTotal += $w['ct_qty'];
        }
    }
    if ($baseTotal < 1) {
        return $fail('Base option is required.', 422);
    }

    $current = [];
    foreach ($lines as $line) {
        $k = $key($line['io_id'] ?? '', $line['io_type'] ?? 0);
        $current[$k] = ($current[$k] ?? 0) + (int) ($line['ct_qty'] ?? 0);
    }
    $usable = [];
    $hasBaseOptions = false;
    foreach ($options as $option) {
        $usable[$key($option['io_id'] ?? '', $option['io_type'] ?? 0)] = true;
        if ((int) ($option['io_type'] ?? 0) !== 1) {
            $hasBaseOptions = true;
        }
    }

    // 새로 담거나 늘린 줄만 — 쓰는 옵션인가, 재고가 되는가.
    foreach ($want as $k => $w) {
        if ($w['ct_qty'] <= ($current[$k] ?? 0)) {
            continue;
        }
        if ($w['io_id'] === '') {
            if ($w['io_type'] === 1 || $hasBaseOptions) {
                return $fail('Select a product option.', 400);
            }
        } elseif (!isset($usable[$k])) {
            return $fail('Selected option is not available.', 400);
        }
        $stock = (int) $available($w['io_id'], $w['io_type']);
        if ($w['ct_qty'] > $stock) {
            if ($stock <= 0) {
                return $fail($w['io_id'] !== '' ? '선택한 옵션은 품절입니다.' : 'Product is sold out.', 400);
            }
            return $fail('Requested quantity exceeds available ' . ($w['io_id'] !== '' ? 'option ' : '') . 'stock (' . $stock . ').', 400);
        }
    }

    $minQty = max(0, (int) ($item['it_buy_min_qty'] ?? 0));
    $maxQty = max(0, (int) ($item['it_buy_max_qty'] ?? 0));
    if ($minQty > 0 && $baseTotal < $minQty) {
        return $fail('Minimum purchase quantity for this product is ' . $minQty . '.', 422);
    }
    if ($maxQty > 0 && $baseTotal > $maxQty) {
        return $fail('You can add up to ' . $maxQty . ' items for this product.', 422);
    }

    $update = [];
    $delete = [];
    $kept = [];
    foreach ($lines as $line) {
        $k = $key($line['io_id'] ?? '', $line['io_type'] ?? 0);
        $ctId = (int) ($line['ct_id'] ?? 0);
        // 고친 뒤에 없는 옵션, 또는 같은 옵션의 두 번째 줄(첫 줄에 합계를 둔다)은 지운다.
        if (!isset($want[$k]) || isset($kept[$k])) {
            $delete[] = $ctId;
            continue;
        }
        $kept[$k] = true;
        if ((int) ($line['ct_qty'] ?? 0) !== $want[$k]['ct_qty']) {
            $update[] = [$ctId, $want[$k]['ct_qty']];
        }
    }

    // 새 줄은 본품 먼저 — 추가옵션은 본품이 담겨 있어야 담긴다.
    $insert = [];
    foreach ([0, 1] as $ioType) {
        foreach ($want as $k => $w) {
            if ($w['io_type'] === $ioType && !isset($current[$k])) {
                $insert[] = $w;
            }
        }
    }

    return ['error' => null, 'update' => $update, 'insert' => $insert, 'delete' => $delete];
}
