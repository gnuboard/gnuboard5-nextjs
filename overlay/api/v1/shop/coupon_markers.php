<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!defined('SHOP_API_COUPON_MARKER_ORDER')) {
    define('SHOP_API_COUPON_MARKER_ORDER', 'cp_id');
}
if (!defined('SHOP_API_COUPON_MARKER_SEND')) {
    define('SHOP_API_COUPON_MARKER_SEND', 'cp_id_send');
}

if (!function_exists('shop_api_coupon_marker_key')) {
    function shop_api_coupon_marker_key($type)
    {
        return $type === 'send' ? SHOP_API_COUPON_MARKER_SEND : SHOP_API_COUPON_MARKER_ORDER;
    }
}

if (!function_exists('shop_api_coupon_marker_value')) {
    function shop_api_coupon_marker_value($cpId, $type = 'order')
    {
        $cpId = trim((string) $cpId);
        if ($cpId === '') {
            return '';
        }

        return shop_api_coupon_marker_key($type) . '=' . $cpId;
    }
}

if (!function_exists('shop_api_coupon_marker_line')) {
    function shop_api_coupon_marker_line($cpId, $type = 'order')
    {
        $marker = shop_api_coupon_marker_value($cpId, $type);
        return $marker === '' ? '' : $marker . "\n";
    }
}

if (!function_exists('shop_api_coupon_marker_extract')) {
    function shop_api_coupon_marker_extract($history, $type = 'order')
    {
        $history = (string) $history;
        if ($history === '') {
            return '';
        }

        $key = preg_quote(shop_api_coupon_marker_key($type), '/');
        if (!preg_match('/^' . $key . '=([A-Za-z0-9_\-]+)/m', $history, $matches)) {
            return '';
        }

        return (string) $matches[1];
    }
}
