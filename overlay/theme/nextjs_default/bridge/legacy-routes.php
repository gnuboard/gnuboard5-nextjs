<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function nextjs_default_maybe_redirect_current_short_route()
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    if ($method !== 'GET' && $method !== 'HEAD') {
        return false;
    }

    $current = nextjs_default_current_path_with_query();
    $short = nextjs_default_short_path($current);
    if ($short === $current) {
        return false;
    }

    header('Location: ' . nextjs_default_g5_url() . $short, true, 301);
    exit;
}

function nextjs_default_try_render_legacy_rss_route($path = null)
{
    global $config, $g5;

    $path = $path === null ? nextjs_default_current_path() : (string) $path;
    $route = trim((string) parse_url($path, PHP_URL_PATH), '/');

    if (!preg_match('#^rss/([0-9A-Za-z_]+)$#', $route, $match)) {
        return false;
    }

    $bo_table = $match[1];
    nextjs_default_require_legacy_rss_route_allowed($bo_table);
    $_GET['bo_table'] = $bo_table;
    $_REQUEST['bo_table'] = $bo_table;
    $previous_cwd = getcwd();

    if (defined('G5_BBS_PATH') && is_file(G5_BBS_PATH . '/rss.php')) {
        chdir(G5_BBS_PATH);
        include G5_BBS_PATH . '/rss.php';
        if ($previous_cwd) {
            chdir($previous_cwd);
        }
        exit;
    }

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'RSS route not found.';
    exit;
}

function nextjs_default_should_noindex_route($path = null)
{
    $path = nextjs_default_normalize_static_route_path($path);
    $private_roots = array(
        '/admin',
        '/forgot-password',
        '/login',
        '/members',
        '/mypage',
        '/register',
        '/shop/cart',
        '/shop/order',
        '/shop/orders',
        '/shop/payment',
        '/shop/personalpay',
        '/shop/wishlist',
    );

    foreach ($private_roots as $root) {
        if ($path === $root || strpos($path, $root . '/') === 0) {
            return true;
        }
    }

    return false;
}

function nextjs_default_reserved_shop_short_segments()
{
    return array(
        'cart' => true,
        'categories' => true,
        'compare' => true,
        'content' => true,
        'couponzone' => true,
        'events' => true,
        'largeimage' => true,
        'order' => true,
        'orders' => true,
        'payment' => true,
        'personalpay' => true,
        'products' => true,
        'qas' => true,
        'reviews' => true,
        'search' => true,
        'wishlist' => true,
        '_common' => true,
        '_head' => true,
        '_tail' => true,
        'ajax.action' => true,
        'ajax.coupondownload' => true,
        'ajax.list' => true,
        'ajax.orderdatasave' => true,
        'ajax.orderstock' => true,
        'bannerhit' => true,
        'cancel_pg.inc' => true,
        'cartoption' => true,
        'cartupdate' => true,
        'category' => true,
        'coupon' => true,
        'event' => true,
        'img' => true,
        'index' => true,
        'inicis' => true,
        'item' => true,
        'iteminfo' => true,
        'itemoption' => true,
        'itemqa' => true,
        'itemqaform' => true,
        'itemqaformupdate' => true,
        'itemqalist' => true,
        'itemrecommend' => true,
        'itemrecommendmail' => true,
        'itemstocksms' => true,
        'itemstocksmsupdate' => true,
        'itemuse' => true,
        'itemuseform' => true,
        'itemuseformupdate' => true,
        'itemuselist' => true,
        'kakaopay' => true,
        'kcp' => true,
        'lg' => true,
        'list' => true,
        'listtype' => true,
        'mail' => true,
        'mypage' => true,
        'nicepay' => true,
        'orderaddress' => true,
        'orderaddressupdate' => true,
        'ordercoupon' => true,
        'ordererrormail' => true,
        'orderform' => true,
        'orderform.sub' => true,
        'orderformupdate' => true,
        'orderinquiry' => true,
        'orderinquiry.sub' => true,
        'orderinquirycancel' => true,
        'orderinquiryview' => true,
        'orderitemcoupon' => true,
        'ordermail1.inc' => true,
        'ordermail2.inc' => true,
        'ordersendcost' => true,
        'ordersendcostcoupon' => true,
        'personalpayform' => true,
        'personalpayform.sub' => true,
        'personalpayformupdate' => true,
        'personalpayresult' => true,
        'price' => true,
        'settle_inicis.inc' => true,
        'settle_inicis_common' => true,
        'settle_kakaopay.inc' => true,
        'settle_kcp.inc' => true,
        'settle_kcp_common' => true,
        'settle_lg.inc' => true,
        'settle_lg_common' => true,
        'settle_nicepay.inc' => true,
        'settle_nicepay_common' => true,
        'settle_toss.inc' => true,
        'settle_toss_common' => true,
        'shop.head' => true,
        'shop.tail' => true,
        'taxsave' => true,
        'toss' => true,
        'wishupdate' => true,
    );
}

function nextjs_default_is_reserved_shop_short_segment($segment)
{
    $segment = rawurldecode((string) $segment);
    $segment = strtolower(preg_replace('/\.php$/i', '', $segment));
    $reserved = nextjs_default_reserved_shop_short_segments();

    return isset($reserved[$segment]);
}

function nextjs_default_is_legacy_shop_php_request($path = null)
{
    $path = $path === null ? nextjs_default_current_path() : (string) $path;
    $route = trim((string) parse_url($path, PHP_URL_PATH), '/');

    if ($route === '' || !preg_match('/\.php$/i', $route)) {
        return false;
    }

    $parts = explode('/', $route);
    if (count($parts) < 2) {
        return false;
    }

    $is_shop_route = $parts[0] === 'shop';
    $is_mobile_shop_route = count($parts) >= 3 && $parts[0] === 'mobile' && $parts[1] === 'shop';
    if (!$is_shop_route && !$is_mobile_shop_route) {
        return false;
    }

    $script = strtolower(preg_replace('/\.php$/i', '', basename($route)));

    return nextjs_default_is_reserved_shop_short_segment($script);
}

function nextjs_default_current_path_with_query()
{
    $path = nextjs_default_current_path();
    $request_uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
    $query = $request_uri !== '' ? parse_url($request_uri, PHP_URL_QUERY) : '';
    $query = nextjs_default_public_query_string($query);

    return $path . ($query !== '' ? '?' . $query : '');
}

function nextjs_default_is_public_query_param($key)
{
    $key = strtolower((string) $key);
    if ($key === '' || $key === '_rsc' || strpos($key, 'runtime-') === 0 || strpos($key, 'utm_') === 0) {
        return false;
    }

    $tracking_params = array(
        'fbclid' => true,
        'gclid' => true,
        'mc_cid' => true,
        'mc_eid' => true,
        'metadata-smoke' => true,
        'msclkid' => true,
        'yclid' => true,
    );

    return !isset($tracking_params[$key]);
}

function nextjs_default_public_query_string($query)
{
    $query = ltrim((string) $query, '?');
    if ($query === '') {
        return '';
    }

    $params = array();
    parse_str($query, $params);

    foreach (array_keys($params) as $key) {
        if (!nextjs_default_is_public_query_param($key)) {
            unset($params[$key]);
        }
    }

    return http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function nextjs_default_normalize_route_path($path)
{
    $path = (string) $path;
    $path = parse_url($path, PHP_URL_PATH);
    if (!$path) {
        return '/';
    }

    $base_path = parse_url(nextjs_default_g5_url(), PHP_URL_PATH);
    if ($base_path && $base_path !== '/') {
        $base_path = '/' . trim($base_path, '/');
        if ($path === $base_path) {
            return '/';
        }
        if (strpos($path, $base_path . '/') === 0) {
            $path = substr($path, strlen($base_path));
        }
    }

    $path = '/' . trim($path, '/');

    return $path === '/' ? '/' : $path;
}

function nextjs_default_mobile_gnuboard_short_path($path, $search, $hash)
{
    if ($path === '/mobile' || $path === '/mobile/index.php') {
        return '/' . $search . $hash;
    }

    if ($path === '/mobile/group.php') {
        $gr_id = nextjs_default_first_query_param($search, array('gr_id'));

        return '/boards'
            . nextjs_default_query_string_with_changes($search, array('gr_id'), $gr_id !== '' ? array('group' => $gr_id) : array())
            . $hash;
    }

    if ($path === '/mobile/content.php') {
        $content_prefix = nextjs_default_query_has_shop_service($search) ? '/shop/content' : '/content';
        $co_id = nextjs_default_first_query_param($search, array('co_id'));
        if ($co_id !== '') {
            return $content_prefix . '/' . rawurlencode($co_id)
                . nextjs_default_query_string_with_changes($search, array('co_id', 'co_seo_title', 'service'))
                . $hash;
        }

        $co_seo_title = nextjs_default_first_query_param($search, array('co_seo_title'));
        if ($co_seo_title !== '') {
            return $content_prefix . '/' . rawurlencode($co_seo_title) . '/'
                . nextjs_default_query_string_with_changes($search, array('co_id', 'co_seo_title', 'service'))
                . $hash;
        }

        return ($content_prefix === '/shop/content' ? '/shop' : '/')
            . nextjs_default_query_string_with_changes($search, array('co_id', 'co_seo_title', 'service'))
            . $hash;
    }

    return null;
}

function nextjs_default_query_string_without_type($search, $type_key)
{
    if ($search === '') {
        return '';
    }

    $params = array();
    parse_str(ltrim($search, '?'), $params);
    unset($params[$type_key]);

    $query = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    return $query !== '' ? '?' . $query : '';
}

function nextjs_default_query_string_without_keys($search, $keys)
{
    if ($search === '') {
        return '';
    }

    $params = array();
    parse_str(ltrim($search, '?'), $params);
    foreach ($keys as $key) {
        unset($params[$key]);
    }

    $query = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    return $query !== '' ? '?' . $query : '';
}

function nextjs_default_mobile_shop_short_path($path, $search, $hash)
{
    if ($path === '/mobile/shop' || $path === '/mobile/shop/index.php') {
        return '/shop' . $search . $hash;
    }

    if ($path === '/mobile/shop/cart.php') {
        return '/shop/cart' . nextjs_default_query_string_without_keys($search, array()) . $hash;
    }

    if ($path === '/mobile/shop/wishlist.php') {
        return '/shop/wishlist' . nextjs_default_query_string_without_keys($search, array()) . $hash;
    }

    $static_routes = array(
        '/mobile/shop/coupon.php' => '/mypage/coupons',
        '/mobile/shop/largeimage.php' => '/shop/largeimage',
        '/mobile/shop/mypage.php' => '/mypage',
        '/mobile/shop/orderaddress.php' => '/mypage/addresses',
        '/mobile/shop/orderinquiry.php' => '/shop/orders',
        '/mobile/shop/personalpay.php' => '/shop/personalpay',
        '/mobile/shop/search.php' => '/shop/search',
    );

    if (isset($static_routes[$path])) {
        return $static_routes[$path] . $search . $hash;
    }

    if ($path === '/mobile/shop/category.php' || $path === '/mobile/shop/list.php') {
        $ca_id = nextjs_default_first_query_param($search, array('ca_id'));

        return ($ca_id !== '' ? '/shop/list-' . rawurlencode($ca_id) : '/shop/products')
            . nextjs_default_query_string_with_changes($search, array('ca_id'))
            . $hash;
    }

    if ($path === '/mobile/shop/event.php') {
        $ev_id = nextjs_default_first_query_param($search, array('ev_id'));

        return ($ev_id !== '' ? '/shop/events/' . rawurlencode($ev_id) : '/shop/events')
            . nextjs_default_query_string_with_changes($search, array('ev_id'))
            . $hash;
    }

    if ($path === '/mobile/shop/item.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('it_id', 'it_seo_title'))
            . $hash;
    }

    if ($path === '/mobile/shop/iteminfo.php') {
        $it_id = nextjs_default_first_query_param($search, array('it_id'));
        $info = strtolower(nextjs_default_first_query_param($search, array('info')));
        $set = array();

        if ($info === 'use' || $info === 'review' || $info === 'reviews') {
            $set['tab'] = 'reviews';
        } elseif ($info === 'qa' || $info === 'qna') {
            $set['tab'] = 'qa';
        }

        return ($it_id !== '' ? '/shop/' . rawurlencode($it_id) : '/shop/products')
            . nextjs_default_query_string_with_changes($search, array('it_id', 'info'), $set)
            . $hash;
    }

    if ($path === '/mobile/shop/itemqa.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('it_id', 'it_seo_title'), array('tab' => 'qa'))
            . $hash;
    }

    if ($path === '/mobile/shop/itemqaform.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes(
                $search,
                array('it_id', 'it_seo_title'),
                array('tab' => 'qa', 'form' => 'qa')
            )
            . $hash;
    }

    if ($path === '/mobile/shop/itemrecommend.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('it_id', 'it_seo_title'), array('modal' => 'recommend'))
            . $hash;
    }

    if ($path === '/mobile/shop/itemstocksms.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('it_id', 'it_seo_title'), array('modal' => 'restock'))
            . $hash;
    }

    if ($path === '/mobile/shop/itemuse.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('it_id', 'it_seo_title'), array('tab' => 'reviews'))
            . $hash;
    }

    if ($path === '/mobile/shop/itemuseform.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes(
                $search,
                array('it_id', 'it_seo_title'),
                array('tab' => 'reviews', 'form' => 'review')
            )
            . $hash;
    }

    if ($path === '/mobile/shop/listtype.php') {
        $type = nextjs_default_first_query_param($search, array('type'));
        $target = preg_match('/^[1-5]$/', $type) ? '/shop/type-' . $type : '/shop/products';

        return $target . nextjs_default_query_string_with_changes($search, array('type')) . $hash;
    }

    if ($path === '/mobile/shop/orderform.php') {
        $direct = nextjs_default_has_query_flag($search, array('sw_direct', 'direct'));

        return '/shop/order'
            . nextjs_default_query_string_with_changes($search, array('sw_direct'), $direct ? array('direct' => '1') : array())
            . $hash;
    }

    if ($path === '/mobile/shop/orderinquiryview.php') {
        $od_id = nextjs_default_first_query_param($search, array('od_id'));

        return ($od_id !== '' ? '/shop/orders/' . rawurlencode($od_id) : '/shop/orders')
            . nextjs_default_query_string_with_changes($search, array('od_id'))
            . $hash;
    }

    if ($path === '/mobile/shop/personalpayform.php') {
        $pp_id = nextjs_default_first_query_param($search, array('pp_id'));

        return ($pp_id !== '' ? '/shop/personalpay/' . rawurlencode($pp_id) . '/pay' : '/shop/personalpay')
            . nextjs_default_query_string_with_changes($search, array('pp_id'))
            . $hash;
    }

    if ($path === '/mobile/shop/personalpayresult.php') {
        $pp_id = nextjs_default_first_query_param($search, array('pp_id'));

        return ($pp_id !== '' ? '/shop/personalpay/' . rawurlencode($pp_id) : '/shop/personalpay')
            . nextjs_default_query_string_with_changes($search, array('pp_id'))
            . $hash;
    }

    return null;
}

require_once __DIR__ . '/legacy-route-resolvers.php';
