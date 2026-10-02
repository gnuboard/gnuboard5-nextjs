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
            Response::error('장바구니가 바뀌었습니다. 주문서를 새로 고쳐 주문할 상품을 다시 확인해 주세요.', 409, [
                // 웹 클라이언트는 대문자 코드만 ApiError.code 로 넘긴다(EMAIL_NOT_VERIFIED 와 같은 꼴).
                'code' => 'CART_CHANGED',
            ]);
        }
    }
}
