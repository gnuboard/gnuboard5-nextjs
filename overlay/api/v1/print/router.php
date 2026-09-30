<?php
/**
 * Gnuboard5 REST API - Print Sub-Router (오프린트미)
 *
 * /v1/print/ 하위 라우트를 파싱해 핸들러로 분기한다.
 * 메인 라우터에서 $apiSegments, $apiMethod, $apiRoute 를 받는다.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

// $apiSegments: "v1/print" 이후 전부. 예) /v1/print/products/abc => ['products','abc']
$printResource = isset($apiSegments[0]) ? $apiSegments[0] : '';
$printSegments = array_slice($apiSegments, 1);

$printHandlers = [
    'products'   => __DIR__ . '/products.php',
    'categories' => __DIR__ . '/categories.php',
    'artwork'    => __DIR__ . '/artwork.php',
    'orders'     => __DIR__ . '/orders.php',
    'reviews'    => __DIR__ . '/reviews.php',
    'payment'    => __DIR__ . '/payment.php',
];

if (!$printResource || !isset($printHandlers[$printResource])) {
    Response::error('Unknown print resource: ' . $printResource, 404);
}

$printHandlerFile = $printHandlers[$printResource];

if (!file_exists($printHandlerFile)) {
    Response::error('Print handler not implemented yet: ' . $printResource, 501);
}

require $printHandlerFile;
