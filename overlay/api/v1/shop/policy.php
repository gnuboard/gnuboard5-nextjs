<?php
/**
 * Gnuboard5 REST API - Shop Policy
 *
 * GET /v1/shop/policy - Public shipping, delivery, exchange and return policy.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

if ($apiMethod === 'GET') {
    Response::success(shop_api_policy_summary());
}

Response::error('Method not allowed.', 405);
