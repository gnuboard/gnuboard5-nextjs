<?php
/**
 * Gnuboard5 REST API - Shop Delivery Address Book
 *
 * GET    /v1/shop/addresses         - List all saved addresses (auth required)
 * POST   /v1/shop/addresses         - Save new address (auth required)
 * DELETE /v1/shop/addresses/{ad_id} - Delete address (auth required)
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$member = Auth::requireAuth();
$mb_id  = $member['mb_id'];
$addressAction = isset($shopSegments[0]) ? (string) $shopSegments[0] : '';
$ad_id  = isset($shopSegments[0]) ? (int) $shopSegments[0] : 0;

if (!function_exists('shop_api_address_input')) {
    function shop_api_address_input(): array
    {
        $input = json_decode(file_get_contents('php://input'), true);
        return is_array($input) && $input ? $input : $_POST;
    }
}

if (!function_exists('shop_api_normalize_address_zip')) {
    function shop_api_normalize_address_zip(array $input): array
    {
        if (!empty($input['ad_zip']) && empty($input['ad_zip1'])) {
            $zip = preg_replace('/[^0-9]/', '', (string) $input['ad_zip']);
            $input['ad_zip1'] = substr($zip, 0, 3);
            $input['ad_zip2'] = substr($zip, 3);
        }

        return $input;
    }
}

if (!function_exists('shop_api_address_fields')) {
    function shop_api_address_fields(): array
    {
        return [
            'ad_subject' => ['limit' => 20, 'required' => false],
            'ad_name'    => ['limit' => 50, 'required' => true],
            'ad_tel'     => ['limit' => 30, 'required' => false],
            'ad_hp'      => ['limit' => 30, 'required' => true],
            'ad_zip1'    => ['limit' => 3, 'required' => true],
            'ad_zip2'    => ['limit' => 3, 'required' => false],
            'ad_addr1'   => ['limit' => 255, 'required' => true],
            'ad_addr2'   => ['limit' => 255, 'required' => false],
            'ad_addr3'   => ['limit' => 255, 'required' => false],
            'ad_jibeon'  => ['limit' => 255, 'required' => false],
        ];
    }
}

if (!function_exists('shop_api_format_address_row')) {
    function shop_api_format_address_row(array $row): array
    {
        return [
            'ad_id'      => (int) ($row['ad_id'] ?? 0),
            'ad_subject' => (string) ($row['ad_subject'] ?? ''),
            'ad_default' => (int) ($row['ad_default'] ?? 0),
            'ad_name'    => (string) ($row['ad_name'] ?? ''),
            'ad_tel'     => (string) ($row['ad_tel'] ?? ''),
            'ad_hp'      => (string) ($row['ad_hp'] ?? ''),
            'ad_zip1'    => (string) ($row['ad_zip1'] ?? ''),
            'ad_zip2'    => (string) ($row['ad_zip2'] ?? ''),
            'ad_addr1'   => (string) ($row['ad_addr1'] ?? ''),
            'ad_addr2'   => (string) ($row['ad_addr2'] ?? ''),
            'ad_addr3'   => (string) ($row['ad_addr3'] ?? ''),
            'ad_jibeon'  => (string) ($row['ad_jibeon'] ?? ''),
        ];
    }
}

if (!function_exists('shop_api_fetch_address_list')) {
    function shop_api_fetch_address_list(string $mbId): array
    {
        $rows = DB::fetchAll(
            "SELECT ad_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp,
                    ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon
             FROM " . DB::table('g5_shop_order_address_table') . "
             WHERE mb_id = ?
             ORDER BY ad_default DESC, ad_id DESC",
            [$mbId]
        );

        $addresses = [];
        foreach ($rows as $row) {
            $addresses[] = shop_api_format_address_row($row);
        }

        return $addresses;
    }
}

// =========================================================================
// GET /v1/shop/addresses - List addresses
// =========================================================================
if ($apiMethod === 'GET' && $ad_id === 0) {
    Response::success(shop_api_fetch_address_list($mb_id));
}

// =========================================================================
// PATCH /v1/shop/addresses - Bulk update subject/default like orderaddressupdate.php
// POST /v1/shop/addresses/legacy-update - YoungCart orderaddressupdate.php compatible action
// =========================================================================
if (($apiMethod === 'PATCH' && $ad_id === 0) || ($apiMethod === 'POST' && $addressAction === 'legacy-update')) {
    $input = shop_api_address_input();
    $items = [];

    if (isset($input['items']) && is_array($input['items'])) {
        $items = $input['items'];
    } elseif (isset($input['addresses']) && is_array($input['addresses'])) {
        $items = $input['addresses'];
    } elseif (isset($input['chk']) && is_array($input['chk']) && isset($input['ad_id']) && is_array($input['ad_id'])) {
        foreach ($input['chk'] as $selectedIndex) {
            $key = (int) $selectedIndex;
            if (!isset($input['ad_id'][$key])) {
                continue;
            }
            $items[] = [
                'ad_id' => $input['ad_id'][$key],
                'ad_subject' => is_array($input['ad_subject'] ?? null) && array_key_exists($key, $input['ad_subject'])
                    ? $input['ad_subject'][$key]
                    : '',
            ];
        }
    }

    if (!$items) {
        Response::error('Select at least one address to update.', 422, ['items' => 'items is required.']);
    }

    $defaultId = isset($input['ad_default']) ? (int) $input['ad_default'] : 0;
    $updatedIds = [];
    $defaultApplied = false;

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $itemAdId = isset($item['ad_id']) ? (int) $item['ad_id'] : 0;
        if ($itemAdId <= 0) {
            continue;
        }

        $subject = shop_api_text_limit($item['ad_subject'] ?? '', 20);
        $sets = ['ad_subject = ?'];
        $params = [$subject];

        if ($defaultId > 0 && $itemAdId === $defaultId) {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_order_address_table') . "
                 SET ad_default = 0
                 WHERE mb_id = ?",
                [$mb_id]
            );
            $sets[] = 'ad_default = ?';
            $params[] = 1;
            $defaultApplied = true;
        }

        $params[] = $itemAdId;
        $params[] = $mb_id;

        DB::execute(
            "UPDATE " . DB::table('g5_shop_order_address_table') . "
             SET " . implode(', ', $sets) . "
             WHERE ad_id = ? AND mb_id = ?",
            $params
        );
        $updatedIds[] = $itemAdId;
    }

    if (!$updatedIds) {
        Response::error('No valid address was selected.', 422, ['items' => 'valid ad_id is required.']);
    }
    if ($defaultId > 0 && !$defaultApplied) {
        Response::error('Default address must be included in selected items.', 422, ['ad_default' => 'ad_default must be selected.']);
    }

    Response::success([
        'updated' => array_values(array_unique($updatedIds)),
        'addresses' => shop_api_fetch_address_list($mb_id),
    ]);
}

// =========================================================================
// POST /v1/shop/addresses - Save new address
// =========================================================================
if ($apiMethod === 'POST' && $ad_id === 0) {

    $input = shop_api_normalize_address_zip(shop_api_address_input());
    $fields = shop_api_address_fields();

    // Validate required fields
    $errors = [];
    foreach ($fields as $field => $rule) {
        if (!empty($rule['required']) && empty($input[$field])) {
            $errors[$field] = $field . ' is required.';
        }
    }
    if (!empty($errors)) {
        Response::error('Validation failed.', 422, $errors);
    }

    // 배송지는 회원마다 100개까지 — 이 경로는 주문 없이 바로 행을 만들므로(그누보드는 주문할 때만 쌓는다) 반복 호출로
    // 표를 끝없이 키우지 못하게 한다.
    $addressCount = DB::count(
        "SELECT COUNT(*) FROM " . DB::table('g5_shop_order_address_table') . " WHERE mb_id = ?",
        [$mb_id]
    );
    if ($addressCount >= 100) {
        Response::error('You can save up to 100 addresses. Please delete one first.', 422, ['ad_id' => 'address limit reached.']);
    }

    $isDefault = !empty($input['ad_default']) ? 1 : 0;

    // If setting as default, unset previous default
    if ($isDefault) {
        DB::execute(
            "UPDATE " . DB::table('g5_shop_order_address_table') . "
             SET ad_default = 0
             WHERE mb_id = ?",
            [$mb_id]
        );
    }

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_order_address_table') . " SET
            mb_id      = ?,
            ad_subject = ?,
            ad_default = ?,
            ad_name    = ?,
            ad_tel     = ?,
            ad_hp      = ?,
            ad_zip1    = ?,
            ad_zip2    = ?,
            ad_addr1   = ?,
            ad_addr2   = ?,
            ad_addr3   = ?,
            ad_jibeon  = ?",
        [
            $mb_id,
            shop_api_text_limit($input['ad_subject'] ?? '', 20),
            $isDefault,
            shop_api_text_limit($input['ad_name'] ?? '', 50),
            shop_api_text_limit($input['ad_tel'] ?? '', 30),
            shop_api_text_limit($input['ad_hp'] ?? '', 30),
            shop_api_text_limit($input['ad_zip1'] ?? '', 3),
            shop_api_text_limit($input['ad_zip2'] ?? '', 3),
            shop_api_text_limit($input['ad_addr1'] ?? '', 255),
            shop_api_text_limit($input['ad_addr2'] ?? '', 255),
            shop_api_text_limit($input['ad_addr3'] ?? '', 255),
            shop_api_text_limit($input['ad_jibeon'] ?? '', 255),
        ]
    );

    $newId = DB::lastInsertId();
    $newRow = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_address_table') . "
         WHERE ad_id = ? LIMIT 1",
        [$newId]
    );

    Response::success(shop_api_format_address_row($newRow ?: []), 201);
}

// =========================================================================
// PATCH /v1/shop/addresses/{ad_id} - Update saved address metadata/fields
// =========================================================================
if ($apiMethod === 'PATCH' && $ad_id > 0) {

    $existing = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_address_table') . "
         WHERE ad_id = ? AND mb_id = ? LIMIT 1",
        [$ad_id, $mb_id]
    );

    if (!$existing) {
        Response::error('Address not found.', 404);
    }

    $input = shop_api_normalize_address_zip(shop_api_address_input());
    $fields = shop_api_address_fields();

    $next = $existing;
    $sets = [];
    $params = [];
    foreach ($fields as $field => $rule) {
        if (!array_key_exists($field, $input)) {
            continue;
        }
        $value = shop_api_text_limit($input[$field], (int) $rule['limit']);
        $next[$field] = $value;
        $sets[] = "{$field} = ?";
        $params[] = $value;
    }

    if (array_key_exists('ad_default', $input)) {
        $isDefault = !empty($input['ad_default']) ? 1 : 0;
        if ($isDefault) {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_order_address_table') . "
                 SET ad_default = 0
                 WHERE mb_id = ?",
                [$mb_id]
            );
        }
        $next['ad_default'] = $isDefault;
        $sets[] = 'ad_default = ?';
        $params[] = $isDefault;
    }

    $errors = [];
    foreach ($fields as $field => $rule) {
        if (!empty($rule['required']) && trim((string) ($next[$field] ?? '')) === '') {
            $errors[$field] = $field . ' is required.';
        }
    }
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    if ($sets) {
        $params[] = $ad_id;
        $params[] = $mb_id;
        DB::execute(
            "UPDATE " . DB::table('g5_shop_order_address_table') . "
             SET " . implode(', ', $sets) . "
             WHERE ad_id = ? AND mb_id = ?",
            $params
        );
    }

    $updated = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_address_table') . "
         WHERE ad_id = ? AND mb_id = ? LIMIT 1",
        [$ad_id, $mb_id]
    );

    Response::success(shop_api_format_address_row($updated ?: $next));
}

// =========================================================================
// DELETE /v1/shop/addresses/{ad_id} - Delete address
// =========================================================================
if ($apiMethod === 'DELETE' && $ad_id > 0) {

    $existing = DB::fetch(
        "SELECT ad_id FROM " . DB::table('g5_shop_order_address_table') . "
         WHERE ad_id = ? AND mb_id = ? LIMIT 1",
        [$ad_id, $mb_id]
    );

    if (!$existing) {
        Response::error('Address not found.', 404);
    }

    DB::execute(
        "DELETE FROM " . DB::table('g5_shop_order_address_table') . "
         WHERE ad_id = ? AND mb_id = ?",
        [$ad_id, $mb_id]
    );

    Response::noContent();
}

Response::error('Method not allowed.', 405);
