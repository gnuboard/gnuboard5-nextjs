<?php
/**
 * Gnuboard5 REST API - Shop Sub-Router
 *
 * Parses routes under /v1/shop/ and dispatches to the appropriate handler.
 * Expects $apiSegments, $apiMethod, and $apiRoute from the main router.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

// $apiSegments at this point contains everything after "v1/shop"
// e.g. for /v1/shop/products/ABC => $apiSegments = ['products', 'ABC']
$shopResource = isset($apiSegments[0]) ? $apiSegments[0] : '';
$shopSegments = array_slice($apiSegments, 1);

$shopHandlers = [
    'products'   => __DIR__ . '/products.php',
    'categories' => __DIR__ . '/categories.php',
    'banners'    => __DIR__ . '/banners.php',
    'popups'     => __DIR__ . '/popups.php',
    'cart'       => __DIR__ . '/cart.php',
    'orders'     => __DIR__ . '/orders.php',
    'wishlist'   => __DIR__ . '/wishlist.php',
    'reviews'    => __DIR__ . '/reviews.php',
    'addresses'  => __DIR__ . '/addresses.php',
    'payment'    => __DIR__ . '/payment.php',
    'shipping'   => __DIR__ . '/shipping.php',
    'policy'     => __DIR__ . '/policy.php',
    'coupons'    => __DIR__ . '/coupons.php',
    'points'     => __DIR__ . '/points.php',
    'events'     => __DIR__ . '/events.php',
    'images'     => __DIR__ . '/images.php',
    'personalpay' => __DIR__ . '/personalpay.php',
    'receipts'   => __DIR__ . '/receipts.php',
];

if (!$shopResource || !isset($shopHandlers[$shopResource])) {
    Response::error('Unknown shop resource: ' . $shopResource, 404);
}

$shopHandlerFile = $shopHandlers[$shopResource];

if (!file_exists($shopHandlerFile)) {
    Response::error('Shop handler not implemented yet: ' . $shopResource, 501);
}

require $shopHandlerFile;
