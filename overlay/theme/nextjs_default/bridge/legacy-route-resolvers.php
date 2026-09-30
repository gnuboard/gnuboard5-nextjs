<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function nextjs_default_search_params($search)
{
    $params = array();
    parse_str(ltrim((string) $search, '?'), $params);

    return is_array($params) ? $params : array();
}

function nextjs_default_is_passthrough_legacy_request($path, $search)
{
    $params = nextjs_default_search_params($search);
    if (!isset($params['g5_nextjs_default_passthrough']) || (string) $params['g5_nextjs_default_passthrough'] !== '1') {
        return false;
    }

    return in_array($path, array(
        '/shop/personalpayform.php',
    ), true);
}

function nextjs_default_first_query_param($search, $keys)
{
    $params = nextjs_default_search_params($search);

    foreach ($keys as $key) {
        if (isset($params[$key]) && trim((string) $params[$key]) !== '') {
            return trim((string) $params[$key]);
        }
    }

    return '';
}

function nextjs_default_has_query_flag($search, $keys)
{
    $params = nextjs_default_search_params($search);

    foreach ($keys as $key) {
        if (!isset($params[$key])) {
            continue;
        }

        $value = strtolower(trim((string) $params[$key]));
        if ($value !== '' && $value !== '0' && $value !== 'false' && $value !== 'no') {
            return true;
        }
    }

    return false;
}

function nextjs_default_query_has_shop_service($search)
{
    $params = nextjs_default_search_params($search);

    return isset($params['service']) && (string) $params['service'] === 'shop';
}

function nextjs_default_query_string_with_changes($search, $drop = array(), $set = array())
{
    $params = nextjs_default_search_params($search);

    foreach ($drop as $key) {
        unset($params[$key]);
    }

    foreach ($set as $key => $value) {
        if ($value === null || $value === false || $value === '') {
            unset($params[$key]);
            continue;
        }

        $params[$key] = $value === true ? '1' : (string) $value;
    }

    $query = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    return $query !== '' ? '?' . $query : '';
}

function nextjs_default_safe_shop_product_segment($value)
{
    $trimmed = trim((string) $value);
    if ($trimmed === '.') {
        return '%2E';
    }

    if ($trimmed === '..') {
        return '%2E%2E';
    }

    return rawurlencode($trimmed);
}

function nextjs_default_unsafe_short_product_segment($value)
{
    $trimmed = trim((string) $value);

    return $trimmed === '.'
        || $trimmed === '..'
        || strpos($trimmed, '/') !== false
        || strpos($trimmed, '\\') !== false
        || nextjs_default_is_reserved_shop_short_segment($trimmed);
}

function nextjs_default_legacy_product_short_path($search)
{
    $it_id = nextjs_default_first_query_param($search, array('it_id'));
    if ($it_id !== '') {
        $encoded = nextjs_default_safe_shop_product_segment($it_id);

        return nextjs_default_unsafe_short_product_segment($it_id)
            ? '/shop/products/' . $encoded
            : '/shop/' . $encoded;
    }

    $seo_title = nextjs_default_first_query_param($search, array('it_seo_title'));
    if ($seo_title !== '' && !nextjs_default_unsafe_short_product_segment($seo_title)) {
        return '/shop/' . nextjs_default_safe_shop_product_segment($seo_title) . '/';
    }

    return '/shop/products';
}

function nextjs_default_legacy_board_short_path($search)
{
    $bo_table = nextjs_default_first_query_param($search, array('bo_table'));
    if ($bo_table === '') {
        return '/boards';
    }

    $board_path = '/' . rawurlencode($bo_table);
    $seo_title = nextjs_default_first_query_param($search, array('wr_seo_title'));
    if ($seo_title !== '') {
        return $board_path . '/' . rawurlencode($seo_title) . '/';
    }

    $wr_id = nextjs_default_first_query_param($search, array('wr_id'));
    if (preg_match('/^[0-9]+$/', $wr_id)) {
        return $board_path . '/' . $wr_id;
    }

    return $board_path;
}

function nextjs_default_safe_relative_redirect($value)
{
    $decoded = rawurldecode((string) $value);
    if (
        $decoded === ''
        || strpos($decoded, '/') !== 0
        || strpos($decoded, '//') === 0
        || strpos($decoded, '\\') !== false
        || preg_match('/[\r\n]/', $decoded)
    ) {
        return '';
    }

    return $decoded;
}

function nextjs_default_path_targets_shop($path)
{
    $path = parse_url((string) $path, PHP_URL_PATH);
    $path = '/' . trim((string) $path, '/');

    return $path === '/shop' || strpos($path, '/shop/') === 0;
}

function nextjs_default_query_targets_shop($query)
{
    $params = nextjs_default_search_params($query);

    if (isset($params['service']) && (string) $params['service'] === 'shop') {
        return true;
    }

    if (!isset($params['redirect'])) {
        return false;
    }

    $redirect = nextjs_default_safe_relative_redirect($params['redirect']);

    return $redirect !== '' && nextjs_default_path_targets_shop($redirect);
}

function nextjs_default_legacy_login_search($search)
{
    $redirect = nextjs_default_safe_relative_redirect(
        nextjs_default_first_query_param($search, array('redirect', 'url'))
    );

    return nextjs_default_query_string_with_changes(
        $search,
        array('redirect', 'url', 'rewrite'),
        $redirect !== '' ? array('redirect' => $redirect) : array()
    );
}

function nextjs_default_legacy_memo_type($search)
{
    $kind = strtolower(nextjs_default_first_query_param($search, array('kind', 'type')));

    return $kind === 'send' ? 'send' : 'recv';
}

function nextjs_default_legacy_gnuboard_php_short_path($path, $search, $hash)
{
    if ($path === '/bbs/login.php') {
        $login_search = nextjs_default_legacy_login_search($search);
        $login_path = nextjs_default_query_targets_shop($login_search) ? '/shop/login' : '/login';

        return $login_path . $login_search . $hash;
    }

    $static_routes = array(
        '/bbs/register.php' => '/register',
        '/bbs/register_form.php' => '/register',
        '/bbs/register_result.php' => '/register/result',
        '/bbs/password_lost.php' => '/forgot-password',
        '/bbs/poll_result.php' => '/polls',
        '/bbs/qalist.php' => '/mypage/qas',
        '/bbs/point.php' => '/mypage/points',
        '/bbs/scrap.php' => '/mypage/scraps',
    );

    if (isset($static_routes[$path])) {
        return $static_routes[$path] . nextjs_default_query_string_with_changes($search, array('rewrite')) . $hash;
    }

    if ($path === '/bbs/qaview.php') {
        $qa_id = nextjs_default_first_query_param($search, array('qa_id'));

        return (preg_match('/^[0-9]+$/', $qa_id) ? '/mypage/qas/' . $qa_id : '/mypage/qas')
            . nextjs_default_query_string_with_changes($search, array('qa_id', 'rewrite'))
            . $hash;
    }

    if ($path === '/bbs/qawrite.php') {
        $qa_id = nextjs_default_first_query_param($search, array('qa_id'));
        $mode = strtolower(nextjs_default_first_query_param($search, array('w')));

        if ($mode === 'r' && preg_match('/^[0-9]+$/', $qa_id)) {
            return '/mypage/qas/new'
                . nextjs_default_query_string_with_changes($search, array('qa_id', 'w', 'rewrite'), array('reply_to' => $qa_id))
                . $hash;
        }

        return ($mode === 'u' && preg_match('/^[0-9]+$/', $qa_id) ? '/mypage/qas/' . $qa_id : '/mypage/qas/new')
            . nextjs_default_query_string_with_changes($search, array('qa_id', 'w', 'rewrite'))
            . $hash;
    }

    if ($path === '/bbs/memo.php') {
        $type = nextjs_default_legacy_memo_type($search);

        return '/mypage/memos'
            . nextjs_default_query_string_with_changes(
                $search,
                array('kind', 'type', 'rewrite'),
                $type === 'send' ? array('type' => 'send') : array()
            )
            . $hash;
    }

    if ($path === '/bbs/memo_form.php') {
        $recv = nextjs_default_first_query_param($search, array('recv', 'me_recv_mb_id', 'mb_id'));

        return '/mypage/memos/new'
            . nextjs_default_query_string_with_changes(
                $search,
                array('recv', 'me_recv_mb_id', 'mb_id', 'rewrite'),
                $recv !== '' ? array('recv' => $recv) : array()
            )
            . $hash;
    }

    if ($path === '/bbs/memo_view.php') {
        $me_id = nextjs_default_first_query_param($search, array('me_id'));
        $type = nextjs_default_legacy_memo_type($search);

        return (preg_match('/^[0-9]+$/', $me_id) ? '/mypage/memos/' . $me_id : '/mypage/memos')
            . nextjs_default_query_string_with_changes(
                $search,
                array('me_id', 'kind', 'type', 'rewrite'),
                $type === 'send' ? array('type' => 'send') : array()
            )
            . $hash;
    }

    if ($path === '/bbs/profile.php') {
        $mb_id = nextjs_default_first_query_param($search, array('mb_id'));
        $profile_path = preg_match('/^[0-9A-Za-z_]+$/', $mb_id)
            ? '/members/' . rawurlencode($mb_id)
            : '/';

        return $profile_path
            . nextjs_default_query_string_with_changes($search, array('mb_id', 'rewrite'))
            . $hash;
    }

    if ($path === '/bbs/board.php') {
        return nextjs_default_legacy_board_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('bo_table', 'wr_id', 'wr_seo_title', 'rewrite'))
            . $hash;
    }

    if ($path === '/bbs/write.php') {
        $bo_table = nextjs_default_first_query_param($search, array('bo_table'));

        return ($bo_table !== '' ? '/' . rawurlencode($bo_table) . '/write' : '/boards')
            . nextjs_default_query_string_with_changes($search, array('bo_table', 'rewrite'))
            . $hash;
    }

    if ($path === '/bbs/content.php') {
        $content_prefix = nextjs_default_query_has_shop_service($search) ? '/shop/content' : '/content';
        $co_id = nextjs_default_first_query_param($search, array('co_id'));
        if ($co_id !== '') {
            return $content_prefix . '/' . rawurlencode($co_id)
                . nextjs_default_query_string_with_changes($search, array('co_id', 'co_seo_title', 'rewrite', 'service'))
                . $hash;
        }

        $co_seo_title = nextjs_default_first_query_param($search, array('co_seo_title'));
        if ($co_seo_title !== '') {
            return $content_prefix . '/' . rawurlencode($co_seo_title) . '/'
                . nextjs_default_query_string_with_changes($search, array('co_id', 'co_seo_title', 'rewrite', 'service'))
                . $hash;
        }

        return ($content_prefix === '/shop/content' ? '/shop' : '/content') . nextjs_default_query_string_with_changes(
            $search,
            array('co_id', 'co_seo_title', 'rewrite', 'service')
        ) . $hash;
    }

    if ($path === '/bbs/group.php') {
        $gr_id = nextjs_default_first_query_param($search, array('gr_id'));

        return '/boards'
            . nextjs_default_query_string_with_changes($search, array('gr_id', 'rewrite'), $gr_id !== '' ? array('group' => $gr_id) : array())
            . $hash;
    }

    if ($path === '/bbs/faq.php') {
        return '/faq' . nextjs_default_query_string_with_changes($search, array('rewrite')) . $hash;
    }

    if ($path === '/bbs/new.php') {
        return '/recent' . nextjs_default_query_string_with_changes($search, array('rewrite')) . $hash;
    }

    if ($path === '/bbs/search.php') {
        $keyword = nextjs_default_first_query_param($search, array('q', 'stx'));

        return '/search'
            . nextjs_default_query_string_with_changes($search, array('stx', 'rewrite'), $keyword !== '' ? array('q' => $keyword) : array())
            . $hash;
    }

    return null;
}

function nextjs_default_legacy_shop_php_short_path($path, $search, $hash)
{
    $static_routes = array(
        '/shop/index.php' => '/shop',
        '/shop/cart.php' => '/shop/cart',
        '/shop/wishlist.php' => '/shop/wishlist',
        '/shop/couponzone.php' => '/shop/couponzone',
        '/shop/search.php' => '/shop/search',
        '/shop/largeimage.php' => '/shop/largeimage',
        '/shop/mypage.php' => '/mypage',
        '/shop/orderinquiry.php' => '/shop/orders',
        '/shop/personalpay.php' => '/shop/personalpay',
    );

    if (isset($static_routes[$path])) {
        return $static_routes[$path] . $search . $hash;
    }

    if ($path === '/shop/item.php') {
        return nextjs_default_legacy_product_short_path($search)
            . nextjs_default_query_string_with_changes($search, array('it_id', 'it_seo_title'))
            . $hash;
    }

    if ($path === '/shop/iteminfo.php') {
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

    if ($path === '/shop/category.php' || $path === '/shop/list.php') {
        $ca_id = nextjs_default_first_query_param($search, array('ca_id'));

        return ($ca_id !== '' ? '/shop/list-' . rawurlencode($ca_id) : '/shop/products')
            . nextjs_default_query_string_with_changes($search, array('ca_id'))
            . $hash;
    }

    if ($path === '/shop/listtype.php') {
        $type = nextjs_default_first_query_param($search, array('type'));
        $target = preg_match('/^[1-5]$/', $type) ? '/shop/type-' . $type : '/shop/products';

        return $target . nextjs_default_query_string_with_changes($search, array('type')) . $hash;
    }

    if ($path === '/shop/event.php') {
        $ev_id = nextjs_default_first_query_param($search, array('ev_id'));

        return ($ev_id !== '' ? '/shop/events/' . rawurlencode($ev_id) : '/shop/events')
            . nextjs_default_query_string_with_changes($search, array('ev_id'))
            . $hash;
    }

    if ($path === '/shop/orderform.php') {
        $direct = nextjs_default_has_query_flag($search, array('sw_direct', 'direct'));

        return '/shop/order'
            . nextjs_default_query_string_with_changes($search, array('sw_direct'), $direct ? array('direct' => '1') : array())
            . $hash;
    }

    if ($path === '/shop/orderinquiryview.php' || $path === '/shop/orderinquirycancel.php') {
        $od_id = nextjs_default_first_query_param($search, array('od_id'));

        return ($od_id !== '' ? '/shop/orders/' . rawurlencode($od_id) : '/shop/orders')
            . nextjs_default_query_string_with_changes($search, array('od_id', 'token', 'cancel_memo'))
            . $hash;
    }

    if ($path === '/shop/personalpayform.php') {
        $pp_id = nextjs_default_first_query_param($search, array('pp_id'));

        return ($pp_id !== '' ? '/shop/personalpay/' . rawurlencode($pp_id) . '/pay' : '/shop/personalpay')
            . nextjs_default_query_string_with_changes($search, array('pp_id'))
            . $hash;
    }

    if ($path === '/shop/personalpayresult.php') {
        $pp_id = nextjs_default_first_query_param($search, array('pp_id'));

        return ($pp_id !== '' ? '/shop/personalpay/' . rawurlencode($pp_id) : '/shop/personalpay')
            . nextjs_default_query_string_with_changes($search, array('pp_id'))
            . $hash;
    }

    return null;
}

function nextjs_default_short_path($value)
{
    $value = (string) $value;

    $hash = '';
    $hash_pos = strpos($value, '#');
    if ($hash_pos !== false) {
        $hash = substr($value, $hash_pos);
        $value = substr($value, 0, $hash_pos);
    }

    $search = '';
    $query_pos = strpos($value, '?');
    if ($query_pos !== false) {
        $search = substr($value, $query_pos);
        $value = substr($value, 0, $query_pos);
    }

    $had_trailing_slash = strlen($value) > 1 && substr($value, -1) === '/';
    $path = nextjs_default_normalize_route_path($value);
    if (nextjs_default_is_passthrough_legacy_request($path, $search)) {
        return $path . $search . $hash;
    }

    $mobile_gnuboard_short_path = nextjs_default_mobile_gnuboard_short_path($path, $search, $hash);
    if ($mobile_gnuboard_short_path !== null) {
        return $mobile_gnuboard_short_path;
    }

    $legacy_gnuboard_php_short_path = nextjs_default_legacy_gnuboard_php_short_path($path, $search, $hash);
    if ($legacy_gnuboard_php_short_path !== null) {
        return $legacy_gnuboard_php_short_path;
    }

    $mobile_shop_short_path = nextjs_default_mobile_shop_short_path($path, $search, $hash);
    if ($mobile_shop_short_path !== null) {
        return $mobile_shop_short_path;
    }

    $legacy_shop_php_short_path = nextjs_default_legacy_shop_php_short_path($path, $search, $hash);
    if ($legacy_shop_php_short_path !== null) {
        return $legacy_shop_php_short_path;
    }

    if (preg_match('#^/boards/([0-9A-Za-z_]+)$#', $path, $match)) {
        return '/' . $match[1] . $search . $hash;
    }

    if (preg_match('#^/boards/([0-9A-Za-z_]+)/rss$#', $path, $match)) {
        return '/rss/' . $match[1] . $search . $hash;
    }

    if (preg_match('#^/boards/([0-9A-Za-z_]+)/write$#', $path, $match)) {
        return '/' . $match[1] . '/write' . $search . $hash;
    }

    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([0-9]+)$#', $path, $match)) {
        return '/' . $match[1] . '/' . $match[2] . $search . $hash;
    }

    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([^/]+)$#', $path, $match)) {
        $slug = $match[2];
        if ($slug !== 'rss' && $slug !== 'write') {
            return '/' . $match[1] . '/' . $slug . ($had_trailing_slash ? '/' : '') . $search . $hash;
        }
    }

    if (preg_match('#^/shop/categories/([0-9A-Za-z]+)$#', $path, $match)) {
        return '/shop/list-' . $match[1] . $search . $hash;
    }

    if (preg_match('#^/shop/products/([^/]+)$#', $path, $match)) {
        if (
            !nextjs_default_is_reserved_shop_short_segment($match[1]) &&
            !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $match[1])
        ) {
            return '/shop/' . $match[1] . ($had_trailing_slash ? '/' : '') . $search . $hash;
        }
    }

    if ($path === '/shop/products' && $search !== '') {
        for ($index = 1; $index <= 5; $index++) {
            $type_key = 'it_type' . $index;
            $params = array();
            parse_str(ltrim($search, '?'), $params);
            if (isset($params[$type_key]) && (string) $params[$type_key] === '1') {
                return '/shop/type-' . $index . nextjs_default_query_string_without_type($search, $type_key) . $hash;
            }
        }
    }

    $final_path = $path;
    if ($had_trailing_slash && $final_path !== '/') {
        $final_path .= '/';
    }

    return $final_path . $search . $hash;
}

function nextjs_default_current_short_url()
{
    $short_path = nextjs_default_short_path(nextjs_default_current_path_with_query());

    return nextjs_default_g5_url() . ($short_path === '/' ? '' : $short_path);
}

function nextjs_default_current_payload_public_url()
{
    $path = nextjs_default_current_path();
    if (substr($path, -4) === '.txt') {
        $path = substr($path, 0, -4);
    }

    if ($path === '/index') {
        $path = '/';
    }

    $request_uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
    $query = $request_uri !== '' ? parse_url($request_uri, PHP_URL_QUERY) : '';
    $query = nextjs_default_public_query_string($query);

    $public_path = $path;
    if ($query !== '') {
        $public_path .= '?' . $query;
    }

    $short_path = nextjs_default_short_path($public_path);

    return nextjs_default_g5_url() . ($short_path === '/' ? '' : $short_path);
}
