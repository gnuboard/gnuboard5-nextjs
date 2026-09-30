<?php
/**
 * Gnuboard5 REST API - YoungCart direct Naver Pay bridge
 *
 * GET  /v1/shop/naverpay
 * POST /v1/shop/naverpay/order
 * POST /v1/shop/naverpay/wish
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

if (defined('G5_LIB_PATH') && is_file(G5_LIB_PATH . '/naverpay.lib.php')) {
    require_once G5_LIB_PATH . '/naverpay.lib.php';
}

$action = isset($shopSegments[0]) ? trim((string) $shopSegments[0]) : '';

if (!function_exists('shop_api_naverpay_json_input')) {
    function shop_api_naverpay_json_input(): array
    {
        $input = json_decode(file_get_contents('php://input'), true);
        return is_array($input) ? $input : [];
    }
}

if (!function_exists('shop_api_naverpay_public_config')) {
    function shop_api_naverpay_public_config(): array
    {
        global $default, $is_admin, $is_guest, $member;

        $authMember = class_exists('Auth') ? Auth::getUser() : null;
        if ($authMember && !empty($authMember['mb_id'])) {
            $member = $authMember;
            $is_guest = false;
        }

        $enabled = true;
        $reason = '';

        if (!defined('G5_SHOP_DIRECT_NAVERPAY') || !G5_SHOP_DIRECT_NAVERPAY) {
            $enabled = false;
            $reason = 'Direct Naver Pay is disabled.';
        }

        $mid = trim((string) ($default['de_naverpay_mid'] ?? ''));
        $certKey = trim((string) ($default['de_naverpay_cert_key'] ?? ''));
        $buttonKey = trim((string) ($default['de_naverpay_button_key'] ?? ''));
        if ($enabled && ($mid === '' || $certKey === '' || $buttonKey === '')) {
            $enabled = false;
            $reason = 'Naver Pay merchant keys are not configured.';
        }

        $isTest = !empty($default['de_naverpay_test']) || !empty($default['de_card_test']);
        $testMemberId = trim((string) ($default['de_naverpay_mb_id'] ?? ''));
        $memberId = is_array($member) ? (string) ($member['mb_id'] ?? '') : '';
        if (
            $enabled
            && !$is_admin
            && empty($default['de_card_test'])
            && !empty($default['de_naverpay_test'])
            && $testMemberId !== ''
            && ($is_guest || $memberId !== $testMemberId)
        ) {
            $enabled = false;
            $reason = 'Naver Pay test mode is restricted to the configured test member.';
        }

        $isMobile = function_exists('is_mobile') ? (bool) is_mobile() : false;
        if ($isTest) {
            $host = 'test-pay.naver.com';
            $orderUrl = $isMobile
                ? 'https://test-m.pay.naver.com/mobile/customer/order.nhn'
                : 'https://test-pay.naver.com/customer/order.nhn';
            $wishUrl = $isMobile
                ? 'https://test-m.pay.naver.com/mobile/customer/wishList.nhn'
                : 'https://test-pay.naver.com/customer/wishlistPopup.nhn';
            $scriptUrl = $isMobile
                ? 'https://test-pay.naver.com/customer/js/mobile/naverPayButton.js'
                : 'https://pay.naver.com/customer/js/naverPayButton.js';
        } else {
            $host = 'pay.naver.com';
            $orderUrl = $isMobile
                ? 'https://m.pay.naver.com/mobile/customer/order.nhn'
                : 'https://pay.naver.com/customer/order.nhn';
            $wishUrl = $isMobile
                ? 'https://m.pay.naver.com/mobile/customer/wishList.nhn'
                : 'https://pay.naver.com/customer/wishlistPopup.nhn';
            $scriptUrl = $isMobile
                ? 'https://pay.naver.com/customer/js/mobile/naverPayButton.js'
                : 'https://pay.naver.com/customer/js/naverPayButton.js';
        }

        return [
            'enabled' => $enabled,
            'reason' => $reason,
            'test' => $isTest,
            'mobile' => $isMobile,
            'shop_id' => $mid,
            'button_key' => $enabled ? $buttonKey : '',
            'button_count_item' => 2,
            'button_count_cart' => 1,
            'script_url' => $scriptUrl,
            'order_url' => $orderUrl,
            'wish_url' => $wishUrl,
            'request_host' => $host,
            'request_addr' => 'ssl://' . $host,
            'request_port' => 443,
            'buy_request_line' => 'POST /customer/api/order.nhn HTTP/1.1',
            'wish_request_line' => 'POST /customer/api/wishlist.nhn HTTP/1.1',
            'additional_shipping_price' => (string) ($default['de_naverpay_sendcost'] ?? ''),
        ];
    }
}

if (!function_exists('shop_api_naverpay_require_enabled')) {
    function shop_api_naverpay_require_enabled(): array
    {
        $config = shop_api_naverpay_public_config();
        if (empty($config['enabled'])) {
            Response::error($config['reason'] ?: 'Naver Pay is not available.', 400);
        }
        if (!class_exists('naverpay_register')) {
            Response::error('Naver Pay library is not available.', 500);
        }
        return $config;
    }
}

if (!function_exists('shop_api_naverpay_url_origin')) {
    function shop_api_naverpay_url_origin($url): string
    {
        $url = trim((string) $url);
        if ($url === '' || !preg_match('#^https?://#i', $url)) {
            return '';
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $port = parse_url($url, PHP_URL_PORT);
        if ($scheme === '' || $host === '') {
            return '';
        }

        $origin = $scheme . '://' . $host;
        if ($port && !($scheme === 'http' && (int) $port === 80) && !($scheme === 'https' && (int) $port === 443)) {
            $origin .= ':' . (int) $port;
        }

        return $origin;
    }
}

if (!function_exists('shop_api_naverpay_allowed_back_origins')) {
    function shop_api_naverpay_allowed_back_origins(): array
    {
        $origins = [];

        if (defined('G5_URL')) {
            $origins[] = shop_api_naverpay_url_origin(G5_URL);
        }
        if (function_exists('api_public_request_origin')) {
            $origins[] = shop_api_naverpay_url_origin(api_public_request_origin(false));
        }
        if (function_exists('shop_api_cookie_allowed_origins')) {
            foreach (shop_api_cookie_allowed_origins() as $origin) {
                $origins[] = shop_api_naverpay_url_origin($origin);
            }
        }

        return array_values(array_unique(array_filter($origins)));
    }
}

if (!function_exists('shop_api_naverpay_back_url')) {
    function shop_api_naverpay_back_url($value, string $fallback): string
    {
        $url = trim((string) $value);
        if ($url === '') {
            return $fallback;
        }

        $origin = shop_api_naverpay_url_origin($url);
        if ($origin === '') {
            return $fallback;
        }

        return in_array($origin, shop_api_naverpay_allowed_back_origins(), true)
            ? $url
            : $fallback;
    }
}

if (!function_exists('shop_api_naverpay_clean_item_id')) {
    function shop_api_naverpay_clean_item_id($value): string
    {
        return preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $value);
    }
}

if (!function_exists('shop_api_naverpay_clean_item_ids')) {
    function shop_api_naverpay_clean_item_ids($value): array
    {
        if (!is_array($value)) {
            $value = $value !== null && $value !== '' ? [$value] : [];
        }

        $ids = [];
        foreach ($value as $itemId) {
            $itemId = shop_api_naverpay_clean_item_id($itemId);
            if ($itemId !== '') {
                $ids[] = $itemId;
            }
        }

        return array_values(array_unique($ids));
    }
}

if (!function_exists('shop_api_naverpay_post_remote')) {
    function shop_api_naverpay_post_remote(array $config, string $requestLine, string $query): string
    {
        $socket = @fsockopen(
            (string) $config['request_addr'],
            (int) $config['request_port'],
            $errno,
            $errstr,
            10
        );

        if (!$socket) {
            Response::error('Naver Pay connection failed: ' . trim((string) $errstr), 502);
        }

        fwrite($socket, $requestLine . "\r\n");
        fwrite($socket, 'Host: ' . $config['request_host'] . ':' . $config['request_port'] . "\r\n");
        fwrite($socket, "Content-type: application/x-www-form-urlencoded; charset=utf-8\r\n");
        fwrite($socket, 'Content-length: ' . strlen($query) . "\r\n");
        fwrite($socket, "Accept: */*\r\n");
        fwrite($socket, "\r\n");
        fwrite($socket, $query . "\r\n");
        fwrite($socket, "\r\n");

        $headers = '';
        $body = '';
        while (!feof($socket)) {
            $header = fgets($socket, 4096);
            if ($header === "\r\n") {
                break;
            }
            $headers .= $header;
        }
        while (!feof($socket)) {
            $body .= fgets($socket, 4096);
        }
        fclose($socket);

        $status = substr($headers, 9, 3);
        if ($status !== '200') {
            Response::error(trim($body) !== '' ? trim($body) : 'Naver Pay registration failed.', 502);
        }

        return trim($body);
    }
}

if (!function_exists('shop_api_naverpay_item_option_count')) {
    function shop_api_naverpay_item_option_count(string $itId): int
    {
        return DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_type = 0 AND io_use = 1",
            [$itId]
        );
    }
}

if (!function_exists('shop_api_naverpay_clean_option_id')) {
    function shop_api_naverpay_clean_option_id($value): string
    {
        $value = trim(stripslashes((string) $value));
        if (defined('G5_OPTION_ID_FILTER')) {
            return (string) preg_replace(G5_OPTION_ID_FILTER, '', $value);
        }

        return str_replace(["\0", "'", '"', '\\'], '', $value);
    }
}

if (!function_exists('shop_api_naverpay_item_price')) {
    function shop_api_naverpay_item_price(array $item): int
    {
        return function_exists('get_price')
            ? (int) get_price($item)
            : (int) ($item['it_price'] ?? 0);
    }
}

if (!function_exists('shop_api_naverpay_assert_orderable_item')) {
    function shop_api_naverpay_assert_orderable_item(array $item): void
    {
        if (empty($item['it_id'])) {
            Response::error('Product not found.', 404);
        }
        if (empty($item['it_use']) || !empty($item['it_soldout']) || !empty($item['it_tel_inq'])) {
            Response::error('This product is not orderable by Naver Pay.', 400);
        }
    }
}

if (!function_exists('shop_api_naverpay_fetch_option')) {
    function shop_api_naverpay_fetch_option(string $itId, string $ioId, int $ioType): array
    {
        if ($ioId === '') {
            return [];
        }

        $row = DB::fetch(
            "SELECT io_id, io_type, io_price, io_stock_qty, io_use
             FROM " . DB::table('g5_shop_item_option_table') . "
             WHERE it_id = ? AND io_id = ? AND io_type = ? LIMIT 1",
            [$itId, $ioId, $ioType]
        );

        return is_array($row) ? $row : [];
    }
}

if (!function_exists('shop_api_naverpay_stock_qty')) {
    function shop_api_naverpay_stock_qty(array $item, string $ioId, int $ioType, array $optionRow = []): int
    {
        $itId = (string) ($item['it_id'] ?? '');
        if ($ioId !== '') {
            $stock = function_exists('get_option_stock_qty')
                ? (int) get_option_stock_qty($itId, $ioId, $ioType)
                : (int) ($optionRow['io_stock_qty'] ?? 0);
        } else {
            $stock = function_exists('get_it_stock_qty')
                ? (int) get_it_stock_qty($itId)
                : (int) ($item['it_stock_qty'] ?? 0);
        }

        return max(0, $stock);
    }
}

if (!function_exists('shop_api_naverpay_send_cost')) {
    function shop_api_naverpay_send_cost(array $item, int $ioPrice, int $qty, $preferred = null): int
    {
        $ctSendCost = is_numeric($preferred) ? (int) $preferred : 0;
        if ($ctSendCost !== 1 && $ctSendCost !== 2) {
            $ctSendCost = 0;
            if ((int) ($item['it_sc_type'] ?? 0) === 1) {
                $ctSendCost = 2;
            } elseif ((int) ($item['it_sc_type'] ?? 0) > 1 && (int) ($item['it_sc_method'] ?? 0) === 1) {
                $ctSendCost = 1;
            }
        }

        if (
            (int) ($item['it_sc_type'] ?? 0) === 2
            && $ctSendCost === 1
            && ((shop_api_naverpay_item_price($item) + $ioPrice) * $qty) >= (int) ($item['it_sc_minimum'] ?? 0)
        ) {
            $ctSendCost = 2;
        }

        return $ctSendCost;
    }
}

if (!function_exists('shop_api_naverpay_validate_option_rows')) {
    function shop_api_naverpay_validate_option_rows(array $item, array $rows): array
    {
        shop_api_naverpay_assert_orderable_item($item);

        $itId = (string) $item['it_id'];
        $baseOptionCount = shop_api_naverpay_item_option_count($itId);
        $baseQty = 0;
        $hasBaseRow = false;
        $firstType = null;
        $normalized = [];

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $ioId = shop_api_naverpay_clean_option_id($row['io_id'] ?? '');
            $ioType = isset($row['type'])
                ? (int) $row['type']
                : (isset($row['io_type']) ? (int) $row['io_type'] : 0);
            $qty = max(0, (int) ($row['qty'] ?? $row['ct_qty'] ?? 1));
            if ($qty < 1) {
                Response::error('Quantity must be at least 1.', 422);
            }

            if ($firstType === null) {
                $firstType = $ioType;
            }

            $optionRow = [];
            $ioPrice = 0;
            if ($ioId !== '') {
                $optionRow = shop_api_naverpay_fetch_option($itId, $ioId, $ioType);
                if (!$optionRow || (int) ($optionRow['io_use'] ?? 0) !== 1) {
                    Response::error('Selected option is not available.', 400);
                }
                $ioPrice = (int) ($optionRow['io_price'] ?? 0);
            } elseif ($baseOptionCount > 0 && $ioType === 0) {
                Response::error('Base option is required.', 422);
            }

            if ($ioType === 0) {
                $hasBaseRow = true;
                $baseQty += $qty;
            }

            $stockQty = shop_api_naverpay_stock_qty($item, $ioId, $ioType, $optionRow);
            if ($qty > $stockQty) {
                Response::error('Requested quantity exceeds available stock. Current stock: ' . $stockQty . '.', 400);
            }

            if ($ioType === 1) {
                if ($ioPrice < 0) {
                    Response::error('Products with a negative supplemental option price cannot be purchased.', 400);
                }
            } elseif (shop_api_naverpay_item_price($item) + $ioPrice <= 0) {
                Response::error('Products with a zero or negative purchase price cannot be purchased.', 400);
            }

            $optionLabel = trim((string) ($row['option'] ?? $row['io_value'] ?? $row['label'] ?? $ioId));
            $normalized[] = [
                'option' => $optionLabel,
                'price' => $ioPrice,
                'qty' => $qty,
                'send_cost' => shop_api_naverpay_send_cost($item, $ioPrice, $qty, $row['send_cost'] ?? null),
                'type' => $ioType,
                'io_id' => $ioId,
            ];
        }

        if ($baseOptionCount > 0 && ($firstType !== 0 || !$hasBaseRow)) {
            Response::error('Base option is required.', 422);
        }

        $minQty = max(0, (int) ($item['it_buy_min_qty'] ?? 0));
        $maxQty = max(0, (int) ($item['it_buy_max_qty'] ?? 0));
        if ($minQty > 0 && $baseQty < $minQty) {
            Response::error('Minimum purchase quantity for this product is ' . $minQty . '.', 422);
        }
        if ($maxQty > 0 && $baseQty > $maxQty) {
            Response::error('Maximum purchase quantity for this product is ' . $maxQty . '.', 422);
        }

        return $normalized;
    }
}

if (!function_exists('shop_api_naverpay_product_options')) {
    function shop_api_naverpay_product_options(array $item, array $input): array
    {
        $rows = [];
        $rawOptions = isset($input['options']) && is_array($input['options']) ? $input['options'] : [];

        if (!$rawOptions) {
            $rawOptions[] = [
                'io_id' => '',
                'type' => 0,
                'option' => '',
                'qty' => max(1, (int) ($input['quantity'] ?? $input['ct_qty'] ?? 1)),
            ];
        }

        foreach ($rawOptions as $option) {
            if (!is_array($option)) {
                continue;
            }

            $rows[] = [
                'option' => trim((string) ($option['io_value'] ?? $option['label'] ?? $option['option'] ?? $option['io_id'] ?? '')),
                'qty' => max(0, (int) ($option['ct_qty'] ?? $option['qty'] ?? 1)),
                'type' => isset($option['io_type']) ? (int) $option['io_type'] : (int) ($option['type'] ?? 0),
                'io_id' => $option['io_id'] ?? '',
            ];
        }

        return shop_api_naverpay_validate_option_rows($item, $rows);
    }
}

if (!function_exists('shop_api_naverpay_register_order')) {
    function shop_api_naverpay_register_order(array $config, array $options, int $sendCost, string $backUrl): array
    {
        if (!defined('NAVERPAY_BACK_URL')) {
            define('NAVERPAY_BACK_URL', $backUrl);
        }
        if (!defined('SHIPPING_ADDITIONAL_PRICE')) {
            define('SHIPPING_ADDITIONAL_PRICE', (string) ($config['additional_shipping_price'] ?? ''));
        }

        $order = new naverpay_register($options, $sendCost);
        $query = $order->query();
        if ($query === '') {
            Response::error('No orderable Naver Pay items were selected.', 422);
        }

        $orderId = shop_api_naverpay_post_remote($config, (string) $config['buy_request_line'], $query);
        $redirectUrl = (string) $config['order_url']
            . '?ORDER_ID=' . rawurlencode($orderId)
            . '&SHOP_ID=' . rawurlencode((string) $config['shop_id'])
            . '&TOTAL_PRICE=' . rawurlencode((string) $order->total_price);

        return [
            'order_id' => $orderId,
            'shop_id' => (string) $config['shop_id'],
            'total_price' => (int) $order->total_price,
            'redirect_url' => $redirectUrl,
        ];
    }
}

if (!function_exists('shop_api_naverpay_register_wish')) {
    function shop_api_naverpay_register_wish(array $config, array $itIds): array
    {
        global $default;

        $item = '';
        foreach ($itIds as $rawItId) {
            $itId = shop_api_naverpay_clean_item_id($rawItId);
            if ($itId === '') {
                continue;
            }

            $it = function_exists('get_shop_item') ? get_shop_item($itId, true) : null;
            if (!$it || empty($it['it_id'])) {
                continue;
            }

            $image = function_exists('get_naverpay_item_image_url')
                ? get_naverpay_item_image_url($itId)
                : '';
            $itemUrl = function_exists('shop_item_url')
                ? shop_item_url($itId)
                : (defined('G5_SHOP_URL') ? G5_SHOP_URL . '/item.php?it_id=' . rawurlencode($itId) : '');

            $item .= '&ITEM_ID=' . rawurlencode($itId);
            if (!empty($it['ec_mall_pid'])) {
                $item .= '&EC_MALL_PID=' . rawurlencode((string) $it['ec_mall_pid']);
            }
            $item .= '&ITEM_NAME=' . rawurlencode((string) $it['it_name']);
            $item .= '&ITEM_DESC=' . rawurlencode((string) ($it['it_basic'] ?? ''));
            $item .= '&ITEM_UPRICE=' . (int) get_price($it);
            $item .= '&ITEM_IMAGE=' . rawurlencode($image);
            $item .= '&ITEM_THUMB=' . rawurlencode($image);
            $item .= '&ITEM_URL=' . rawurlencode($itemUrl);
        }

        if ($item === '') {
            Response::error('No wishable Naver Pay items were selected.', 422);
        }

        $query = 'SHOP_ID=' . rawurlencode((string) ($default['de_naverpay_mid'] ?? ''));
        $query .= '&CERTI_KEY=' . rawurlencode((string) ($default['de_naverpay_cert_key'] ?? ''));
        $query .= $item;

        $body = shop_api_naverpay_post_remote($config, (string) $config['wish_request_line'], $query);
        $itemIds = array_filter(array_map('trim', explode(',', $body)));
        if (!$itemIds) {
            Response::error('Naver Pay wish registration returned no item ids.', 502);
        }

        $redirectUrl = (string) $config['wish_url']
            . '?SHOP_ID=' . rawurlencode((string) $config['shop_id']);
        foreach ($itemIds as $itemId) {
            $redirectUrl .= '&ITEM_ID=' . rawurlencode($itemId);
        }

        return [
            'shop_id' => (string) $config['shop_id'],
            'item_ids' => array_values($itemIds),
            'redirect_url' => $redirectUrl,
        ];
    }
}

if ($apiMethod === 'GET' && $action === '') {
    Response::success(shop_api_naverpay_public_config());
}

if ($apiMethod === 'POST' && $action === 'order') {
    $config = shop_api_naverpay_require_enabled();
    $input = shop_api_naverpay_json_input();
    if (!$input) {
        Response::error('Request body is required.', 422);
    }

    $source = (string) ($input['source'] ?? 'item');
    $options = [];
    $sendCost = 0;
    $requestedBackUrl = isset($input['back_url']) ? (string) $input['back_url'] : '';
    $backUrl = defined('G5_SHOP_URL') ? G5_SHOP_URL . '/cart.php' : '';

    if ($source === 'cart') {
        $member = Auth::getUser();
        $cartId = shop_api_cart_id($member);
        $ctIds = shop_api_cart_ct_ids_from($input['ct_ids'] ?? null);
        $itIds = shop_api_naverpay_clean_item_ids($input['it_ids'] ?? null);

        $filterSql = '';
        $params = [$cartId];
        if (!empty($ctIds)) {
            $filterSql = ' AND c.ct_id IN (' . implode(',', array_fill(0, count($ctIds), '?')) . ')';
            $params = array_merge($params, $ctIds);
        } elseif (isset($input['ct_ids'])) {
            Response::error('Valid cart item ids are required.', 422);
        } elseif (!empty($itIds)) {
            $filterSql = ' AND c.it_id IN (' . implode(',', array_fill(0, count($itIds), '?')) . ')';
            $params = array_merge($params, $itIds);
        } elseif (isset($input['it_ids'])) {
            Response::error('Valid cart item ids are required.', 422);
        }

        $rows = DB::fetchAll(
            "SELECT c.it_id, c.ct_option, c.io_id, c.io_type, c.io_price, c.ct_qty, c.ct_send_cost
              FROM " . DB::table('g5_shop_cart_table') . " c
              WHERE c.od_id = ?
                AND c.ct_direct = 0
                {$filterSql}
                AND " . shop_api_cart_active_status_sql('c.ct_status') . "
              ORDER BY c.ct_id ASC",
            array_merge($params, shop_api_cart_active_statuses())
        );

        foreach ($rows as $row) {
            $itId = (string) $row['it_id'];
            $sendCost = (int) ($row['ct_send_cost'] ?? 0);
            $options[$itId][] = [
                'option' => (string) ($row['ct_option'] ?? ''),
                'qty' => max(1, (int) ($row['ct_qty'] ?? 1)),
                'send_cost' => $sendCost,
                'type' => (int) ($row['io_type'] ?? 0),
                'io_id' => (string) ($row['io_id'] ?? ''),
            ];
        }

        foreach ($options as $cartItId => $cartRows) {
            $item = function_exists('get_shop_item') ? get_shop_item((string) $cartItId, true) : null;
            if (!$item || empty($item['it_id'])) {
                Response::error('Product not found.', 404);
            }
            $options[$cartItId] = shop_api_naverpay_validate_option_rows($item, $cartRows);
        }
        $backUrl = shop_api_naverpay_back_url($requestedBackUrl, $backUrl);
    } else {
        $itId = shop_api_naverpay_clean_item_id($input['it_id'] ?? '');
        if ($itId === '') {
            Response::error('it_id is required.', 422);
        }

        $item = function_exists('get_shop_item') ? get_shop_item($itId, true) : null;
        if (!$item || empty($item['it_id'])) {
            Response::error('Product not found.', 404);
        }
        if (empty($item['it_use']) || !empty($item['it_soldout']) || !empty($item['it_tel_inq'])) {
            Response::error('This product is not orderable by Naver Pay.', 400);
        }

        $optionRows = shop_api_naverpay_product_options($item, $input);
        foreach ($optionRows as $row) {
            $sendCost = (int) $row['send_cost'];
            $options[$itId][] = $row;
        }

        $backUrl = function_exists('shop_item_url')
            ? shop_item_url($itId)
            : (defined('G5_SHOP_URL') ? G5_SHOP_URL . '/item.php?it_id=' . rawurlencode($itId) : '');
        $backUrl = shop_api_naverpay_back_url($requestedBackUrl, $backUrl);
    }

    if (!$options) {
        Response::error('No Naver Pay items were selected.', 422);
    }

    Response::success(shop_api_naverpay_register_order($config, $options, $sendCost, $backUrl));
}

if ($apiMethod === 'POST' && $action === 'wish') {
    $config = shop_api_naverpay_require_enabled();
    $input = shop_api_naverpay_json_input();
    if (!$input) {
        Response::error('Request body is required.', 422);
    }

    $itIds = [];
    if (!empty($input['it_ids']) && is_array($input['it_ids'])) {
        $itIds = $input['it_ids'];
    } elseif (!empty($input['it_id'])) {
        $itIds = [$input['it_id']];
    }

    Response::success(shop_api_naverpay_register_wish($config, $itIds));
}

Response::error('Unsupported Naver Pay endpoint.', 404);
