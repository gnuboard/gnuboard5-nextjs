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
