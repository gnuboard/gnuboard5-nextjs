<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_cart_status_shopping')) {
    function shop_api_cart_status_shopping(): string
    {
        return '쇼핑';
    }
}

if (!function_exists('shop_api_cart_active_statuses')) {
    function shop_api_cart_active_statuses(): array
    {
        return array(shop_api_cart_status_shopping(), '');
    }
}

if (!function_exists('shop_api_cart_active_or_pending_statuses')) {
    function shop_api_cart_active_or_pending_statuses(): array
    {
        return array(shop_api_cart_status_shopping(), '', '준비');
    }
}

if (!function_exists('shop_api_cart_status_column')) {
    function shop_api_cart_status_column(string $column): string
    {
        return preg_match('/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/', $column)
            ? $column
            : 'ct_status';
    }
}

if (!function_exists('shop_api_cart_active_status_sql')) {
    function shop_api_cart_active_status_sql(string $column = 'ct_status'): string
    {
        $column = shop_api_cart_status_column($column);
        return '(' . $column . ' = ? OR ' . $column . ' = ?)';
    }
}

if (!function_exists('shop_api_cart_active_or_pending_status_sql')) {
    function shop_api_cart_active_or_pending_status_sql(string $column = 'ct_status'): string
    {
        $column = shop_api_cart_status_column($column);
        return '(' . $column . ' = ? OR ' . $column . ' = ? OR ' . $column . ' = ?)';
    }
}

if (!function_exists('shop_api_cart_require_shown_rows')) {
    /**
     * 주문서가 보여 준 줄(ct_ids)이 장바구니에 모두 그대로 있는지 — 하나라도 없으면 주문 · 결제 준비를 멈춘다(409).
     * 다른 탭 · 기기에서 지웠거나 장바구니 모으기(shop_api_cart_adopt_member_items)로 다른 장바구니로 간 줄이 있을 때,
     * 남은 줄만 조용히 주문하지 않고 주문서를 다시 보게 한다. ct_ids 없이 온 요청(예전 앱 등)은 예전대로 둔다.
     */
    function shop_api_cart_require_shown_rows(array $rows, array $shownCtIds)
    {
        if (empty($shownCtIds)) {
            return;
        }
        $found = array_map('intval', array_column($rows, 'ct_id'));
        if (array_diff($shownCtIds, $found)) {
            shop_api_cart_changed_error();
        }
    }
}

/** 한 요청이 받는 장바구니 줄 수 — shop_api_cart_ct_ids_from() 이 이만큼에서 잘라 낸다. */
if (!defined('SHOP_API_CART_MAX_CT_IDS')) {
    define('SHOP_API_CART_MAX_CT_IDS', 100);
}

if (!function_exists('shop_api_cart_ct_id_count')) {
    /** 보낸 줄 번호의 개수(shop_api_cart_ct_ids_from 과 같은 규칙 — 숫자만, 0 제외, 중복 제외 — 이지만 자르지 않고). */
    function shop_api_cart_ct_id_count($source): int
    {
        if ($source === null || $source === '') {
            return 0;
        }
        $raw = is_array($source) ? $source : preg_split('/[,\s]+/', (string) $source);
        $ids = [];
        foreach ($raw as $value) {
            $id = trim((string) $value);
            if ($id !== '' && ctype_digit($id) && (int) $id > 0) {
                $ids[(int) $id] = true;
            }
        }
        return count($ids);
    }
}

if (!function_exists('shop_api_cart_require_ct_ids_within_limit')) {
    /**
     * 주문 · 결제 준비가 받는 줄 번호는 SHOP_API_CART_MAX_CT_IDS 개까지 — 넘으면 422. 그대로 받으면 앞의 줄만 잘라
     * 그 줄만 주문된다(웹 · 앱은 넘으면 줄 번호를 보내지 않고 장바구니 전부로 주문한다).
     */
    function shop_api_cart_require_ct_ids_within_limit($source): void
    {
        if (shop_api_cart_ct_id_count($source) > SHOP_API_CART_MAX_CT_IDS) {
            Response::error('한 번에 주문할 수 있는 장바구니 줄은 ' . SHOP_API_CART_MAX_CT_IDS . '개까지입니다.', 422, [
                'code' => 'TOO_MANY_CART_ROWS',
                'max' => SHOP_API_CART_MAX_CT_IDS,
            ]);
        }
    }
}

if (!function_exists('shop_api_cart_changed_error')) {
    /** 주문서가 본 줄이 장바구니에 그대로 있지 않다 — 409 CART_CHANGED(웹 · 앱은 상품 줄을 다시 불러온다). */
    function shop_api_cart_changed_error()
    {
        Response::error('장바구니가 바뀌었습니다. 주문서를 새로 고쳐 주문할 상품을 다시 확인해 주세요.', 409, [
            // 웹 클라이언트는 대문자 코드만 ApiError.code 로 넘긴다(EMAIL_NOT_VERIFIED 와 같은 꼴).
            'code' => 'CART_CHANGED',
        ]);
    }
}

if (!function_exists('shop_api_cart_unbind_rows')) {
    /**
     * 주문 · 임시 주문에 묶은 줄을 장바구니로 돌려놓는다(쇼핑 중, 재고 사용 전으로) — 묶은 뒤 주문을 끝내지 못했을 때.
     * 이 요청이 묶은 줄($ctIds)만 — 주문번호가 같은 초에 겹쳤다면 그 번호의 다른 주문 줄은 건드리지 않는다.
     * 쇼핑 테이블이 MyISAM 이면 트랜잭션 되돌리기가 듣지 않으므로 직접 되돌린다(InnoDB 면 되돌린 뒤라 맞는 줄이 없다).
     */
    function shop_api_cart_unbind_rows($orderId, $cartId, array $ctIds)
    {
        $ctIds = array_values(array_filter(array_map('intval', $ctIds)));
        if (!$ctIds) {
            return 0;
        }
        return DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
                SET od_id = ?, ct_status = ?, ct_stock_use = 0
              WHERE od_id = ?
                AND ct_id IN (" . implode(',', array_fill(0, count($ctIds), '?')) . ")",
            array_merge([(string) $cartId, shop_api_cart_status_shopping(), (string) $orderId], $ctIds)
        );
    }
}

if (!function_exists('shop_api_new_order_id')) {
    /**
     * 새 주문 · 임시 주문 번호 — 날짜시각 + 무작위 4자리(앱 · 웹이 아는 18자리 꼴)에서 아직 쓰이지 않은 것.
     * 같은 초에 겹칠 수 있어 주문 행과 묶인 장바구니 줄(주문 만들기는 줄을 먼저 묶는다)을 보고 고른다.
     */
    function shop_api_new_order_id(): string
    {
        $orderTable = DB::table('g5_shop_order_table');
        $cartTable = DB::table('g5_shop_cart_table');
        $id = '';
        for ($try = 0; $try < 10; $try++) {
            $id = date('YmdHis') . sprintf('%04d', random_int(0, 9999));
            $used = DB::fetch(
                "SELECT 1 AS hit FROM {$orderTable} WHERE od_id = ?
                 UNION ALL SELECT 1 FROM {$cartTable} WHERE od_id = ? LIMIT 1",
                [$id, $id]
            );
            if (!$used) {
                break;
            }
        }
        return $id;
    }
}

if (!class_exists('ShopApiCartChangedException')) {
    /**
     * 주문 만들기 트랜잭션 안에서 줄을 묶다가 읽은 줄이 그새 옮겨진(장바구니 모으기 · 다른 탭의 삭제) 것을 알았다 —
     * catch 가 트랜잭션을 되돌린 뒤 shop_api_cart_changed_error() 로 답한다.
     */
    class ShopApiCartChangedException extends RuntimeException
    {
    }
}
