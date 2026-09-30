<?php
/**
 * Gnuboard5 REST API - Shop Payment Gateway Integration
 *
 * GET  /v1/shop/payment/config             - Get active PG, payment methods, client keys (no auth)
 * GET  /v1/shop/payment/diagnostics        - Check mobile PG runtime readiness (admin)
 * GET  /v1/shop/payment/mobile-status      - Check prepared/mobile payment order state (auth)
 * POST /v1/shop/payment/prepare            - Create draft order, return order info for PG (auth)
 * POST /v1/shop/payment/cancel             - Cancel draft order, restore cart rows (auth/guest cookie)
 * POST /v1/shop/payment/confirm            - Verify PG payment, finalize order (auth)
 * GET  /v1/shop/payment/status             - Query PG transaction status (admin)
 * POST /v1/shop/payment/notify/{provider}  - Receive virtual-account deposit notifications
 * GET/POST /v1/shop/payment/kcp-return     - KCP browser return bridge
 * GET/POST /v1/shop/payment/inicis-return  - KG Inicis browser return bridge
 *
 * Supported PGs: toss (Toss Payments), inicis (KG Inicis), kcp (NHN KCP), nicepay (Nicepay)
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

$action = isset($shopSegments[0]) ? $shopSegments[0] : '';

require_once __DIR__ . '/payment_helpers.php';

require_once __DIR__ . '/payment_return_routes.php';
require_once __DIR__ . '/payment_status_routes.php';
require_once __DIR__ . '/payment_prepare_route.php';
require_once __DIR__ . '/payment_cancel_route.php';
require_once __DIR__ . '/payment_confirm_route.php';

Response::error('Method not allowed.', 405);