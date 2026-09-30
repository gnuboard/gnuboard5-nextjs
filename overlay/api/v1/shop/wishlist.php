<?php
/**
 * Gnuboard5 REST API - Shop Wishlist
 *
 * All endpoints require authentication.
 *
 * GET    /v1/shop/wishlist              - List wishlist items
 * POST   /v1/shop/wishlist              - Add item to wishlist
 * DELETE /v1/shop/wishlist/{it_id}      - Remove item from wishlist
 * GET    /v1/shop/wishlist/check/{it_id} - Check if item is wishlisted
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$member = Auth::requireAuth();
$mb_id  = $member['mb_id'];

$action = isset($shopSegments[0]) ? $shopSegments[0] : '';
$param  = isset($shopSegments[1]) ? $shopSegments[1] : '';

function shop_api_wishlist_legacy_input() {
    $input = $_POST;
    if (empty($input)) {
        $json = json_decode(file_get_contents('php://input'), true);
        if (is_array($json)) {
            $input = $json;
        }
    }

    foreach ($_GET as $key => $value) {
        if (!array_key_exists($key, $input)) {
            $input[$key] = $value;
        }
    }

    return is_array($input) ? $input : [];
}

function shop_api_wishlist_legacy_it_id($value) {
    if (is_array($value)) {
        $value = reset($value);
    }

    return preg_replace('/[^0-9a-z_\-]/i', '', (string) $value);
}

// =========================================================================
// GET|POST /v1/shop/wishlist/legacy-update - YoungCart wishupdate.php compatible action
// =========================================================================
if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'legacy-update') {
    $input = shop_api_wishlist_legacy_input();
    $w = trim((string) ($input['w'] ?? ''));

    if ($w === 'd') {
        $wiId = isset($input['wi_id']) ? (int) $input['wi_id'] : 0;
        if ($wiId < 1) {
            Response::error('wi_id is required.', 422);
        }

        DB::execute(
            "DELETE FROM " . DB::table('g5_shop_wish_table') . "
             WHERE wi_id = ? AND mb_id = ?",
            [$wiId, $mb_id]
        );

        Response::success([
            'redirect' => '/shop/wishlist',
            'deleted' => true,
            'wi_id' => $wiId,
        ]);
    }

    $it_id = shop_api_wishlist_legacy_it_id($input['it_id'] ?? null);
    if ($it_id === '') {
        Response::error('it_id is required.', 422);
    }

    $item = DB::fetch(
        "SELECT it_id FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? AND it_use = '1' LIMIT 1",
        [$it_id]
    );
    if (!$item) {
        Response::error('Product not found.', 404);
    }
    shop_api_enforce_cert_access((string) $item['it_id'], 'item', $member);

    $existing = DB::fetch(
        "SELECT wi_id FROM " . DB::table('g5_shop_wish_table') . "
         WHERE mb_id = ? AND it_id = ? LIMIT 1",
        [$mb_id, $it_id]
    );

    if (!$existing) {
        DB::execute(
            "INSERT INTO " . DB::table('g5_shop_wish_table') . "
             SET mb_id = ?,
                 it_id = ?,
                 wi_time = ?",
            [$mb_id, $it_id, date('Y-m-d H:i:s')]
        );
    }

    Response::success([
        'redirect' => '/shop/wishlist',
        'it_id' => $it_id,
        'wishlisted' => true,
    ], $existing ? 200 : 201);
}

// =========================================================================
// GET /v1/shop/wishlist/check/{it_id} - Check if item is wishlisted
// =========================================================================
if ($apiMethod === 'GET' && $action === 'check' && $param !== '') {

    $row = DB::fetch(
        "SELECT wi_id FROM " . DB::table('g5_shop_wish_table') . "
         WHERE mb_id = ? AND it_id = ? LIMIT 1",
        [$mb_id, $param]
    );

    Response::success([
        'wishlisted' => (bool) $row,
        'it_id'      => $param,
    ]);
}

// =========================================================================
// GET /v1/shop/wishlist - List wishlist items
// =========================================================================
if ($apiMethod === 'GET' && $action === '') {

    $page    = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 20)));
    $offset  = ($page - 1) * $perPage;

    $total = DB::count(
        "SELECT COUNT(*) FROM " . DB::table('g5_shop_wish_table') . "
         WHERE mb_id = ?",
        [$mb_id]
    );

    $rows = DB::fetchAll(
        "SELECT w.wi_id, w.it_id, w.wi_time,
                i.it_name, i.it_price, i.it_cust_price, i.it_img1,
                i.it_soldout, i.it_use, i.it_stock_qty, i.it_tel_inq, i.it_seo_title,
                (
                    SELECT COUNT(*)
                    FROM " . DB::table('g5_shop_item_option_table') . " io
                    WHERE io.it_id = w.it_id
                      AND io.io_type = 0
                      AND io.io_use = 1
                ) AS option_count
         FROM " . DB::table('g5_shop_wish_table') . " w
         LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON w.it_id = i.it_id
         WHERE w.mb_id = ?
         ORDER BY w.wi_id DESC
         LIMIT ?, ?",
        [$mb_id, $offset, $perPage]
    );

    $items = [];
    foreach ($rows as $row) {
        $optionCount = (int) ($row['option_count'] ?? 0);
        $isTelInquiry = (int) ($row['it_tel_inq'] ?? 0) === 1;
        $isSoldout = (int) ($row['it_soldout'] ?? 0) === 1;
        $isAvailable = (int) ($row['it_use'] ?? 0) === 1;
        $cartBlockReason = '';
        if (!$isAvailable) {
            $cartBlockReason = '판매중지';
        } elseif ($isSoldout) {
            $cartBlockReason = '품절';
        } elseif ($isTelInquiry) {
            $cartBlockReason = '전화문의';
        } elseif ($optionCount > 0) {
            $cartBlockReason = '옵션 선택 필요';
        }

        $items[] = [
            'wi_id'          => $row['wi_id'],
            'it_id'          => $row['it_id'],
            'wi_time'        => $row['wi_time'],
            'it_name'        => $row['it_name'],
            'it_seo_title'   => $row['it_seo_title'] ?? '',
            'it_basic_price' => (int) $row['it_price'],
            'it_cust_price'  => (int) $row['it_cust_price'],
            'it_soldout'     => $row['it_soldout'],
            'it_use'         => $row['it_use'],
            'it_stock_qty'   => (int) $row['it_stock_qty'],
            'it_tel_inq'     => (string) (int) ($row['it_tel_inq'] ?? 0),
            'option_count'   => $optionCount,
            'can_add_cart'   => $cartBlockReason === '',
            'cart_block_reason' => $cartBlockReason,
            'image_url'      => api_shop_item_image_url($row['it_id'], $row['it_img1']),
        ];
    }

    Response::paginated($items, $total, $page, $perPage);
}

// =========================================================================
// POST /v1/shop/wishlist - Add item to wishlist
// =========================================================================
if ($apiMethod === 'POST' && $action === '') {

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $it_id = isset($input['it_id']) ? trim($input['it_id']) : '';
    if (!$it_id) {
        Response::error('it_id is required.', 422);
    }

    // Check product exists
    $item = DB::fetch(
        "SELECT it_id FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? AND it_use = '1' LIMIT 1",
        [$it_id]
    );
    if (!$item) {
        Response::error('Product not found.', 404);
    }
    shop_api_enforce_cert_access((string) $item['it_id'], 'item', $member);

    // Check if already wishlisted
    $existing = DB::fetch(
        "SELECT wi_id FROM " . DB::table('g5_shop_wish_table') . "
         WHERE mb_id = ? AND it_id = ? LIMIT 1",
        [$mb_id, $it_id]
    );
    if ($existing) {
        Response::error('Item is already in your wishlist.', 409);
    }

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_wish_table') . "
         SET mb_id  = ?,
             it_id  = ?,
             wi_time = ?",
        [$mb_id, $it_id, date('Y-m-d H:i:s')]
    );

    $newId = DB::lastInsertId();
    $wishItem = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_wish_table') . "
         WHERE wi_id = ? LIMIT 1",
        [$newId]
    );

    Response::success($wishItem, 201);
}

// =========================================================================
// DELETE /v1/shop/wishlist/{it_id} - Remove item from wishlist
// =========================================================================
if ($apiMethod === 'DELETE' && $action !== '') {

    $row = DB::fetch(
        "SELECT wi_id FROM " . DB::table('g5_shop_wish_table') . "
         WHERE mb_id = ? AND it_id = ? LIMIT 1",
        [$mb_id, $action]
    );

    if (!$row) {
        Response::error('Wishlist item not found.', 404);
    }

    DB::execute(
        "DELETE FROM " . DB::table('g5_shop_wish_table') . "
         WHERE mb_id = ? AND it_id = ?",
        [$mb_id, $action]
    );

    Response::noContent();
}

Response::error('Method not allowed.', 405);
