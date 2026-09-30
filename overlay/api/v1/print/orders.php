<?php
/**
 * Gnuboard5 REST API - Print Orders (오프린트미)
 *
 * Routes (prefix: v1/print/orders):
 *   GET    /v1/print/orders          - 본인 주문 목록 (page, limit)
 *   GET    /v1/print/orders/{id}     - 단건 + 항목 (본인/super)
 *   POST   /v1/print/orders          - 주문 생성 (artwork_ids[] + 배송정보, client_uid 멱등)
 *
 * 가격은 서버의 g5_print_artwork 값을 권위 소스로 스냅샷한다(클라이언트 합계 신뢰 안 함).
 */

if (!defined('_GNUBOARD_')) exit;

$orderTable = DB::table('print_order_table');
$itemTable  = DB::table('print_order_item_table');

$id = isset($printSegments[0]) && ctype_digit((string) $printSegments[0])
    ? (int) $printSegments[0]
    : 0;

function print_order_decorate(array $order): array
{
    $order['item_count']   = (int) $order['item_count'];
    $order['total_amount'] = (int) $order['total_amount'];
    unset($order['client_uid'], $order['pg_tno']);
    return $order;
}

// -------------------------------------------------------------------------
// GET /v1/print/orders - 본인 목록
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'GET') {
    $me = Auth::requireAuth();
    $page  = max(1, (int) ($_GET['page'] ?? 1));
    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 30)));
    $offset = ($page - 1) * $limit;

    $total = (int) DB::count("SELECT COUNT(*) FROM {$orderTable} WHERE mb_id = ?", [$me['mb_id']]);
    $rows = DB::fetchAll(
        "SELECT * FROM {$orderTable} WHERE mb_id = ? ORDER BY order_id DESC LIMIT {$limit} OFFSET {$offset}",
        [$me['mb_id']]
    );
    Response::paginated(array_map('print_order_decorate', $rows), $total, $page, $limit);
}

// -------------------------------------------------------------------------
// GET /v1/print/orders/{id} - 단건 + 항목
// -------------------------------------------------------------------------
if ($id && $apiMethod === 'GET') {
    $me = Auth::requireAuth();
    $order = DB::fetch("SELECT * FROM {$orderTable} WHERE order_id = ? LIMIT 1", [$id]);
    if (!$order) Response::error('Order not found.', 404);
    if ($order['mb_id'] !== $me['mb_id'] && Auth::adminRole($me) !== 'super') {
        Response::error('Forbidden.', 403);
    }
    $items = DB::fetchAll("SELECT * FROM {$itemTable} WHERE order_id = ? ORDER BY item_id ASC", [$id]);
    $order = print_order_decorate($order);
    $order['items'] = array_map(function ($it) {
        $it['option_selection'] = json_decode($it['option_selection'] ?? '{}', true) ?: new stdClass();
        $it['qty']        = (int) $it['qty'];
        $it['unit_price'] = (int) $it['unit_price'];
        $it['subtotal']   = (int) $it['subtotal'];
        return $it;
    }, $items);
    Response::success($order);
}

// -------------------------------------------------------------------------
// POST /v1/print/orders - 생성
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    $input = get_request_body();

    $errors = Validator::validate([
        'receiver_name'  => 'required|max:50',
        'receiver_phone' => 'required|max:30',
        'addr1'          => 'required|max:255',
    ], $input);
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $artworkIds = $input['artwork_ids'] ?? [];
    if (!is_array($artworkIds) || count($artworkIds) === 0) {
        Response::error('주문할 디자인을 선택하세요.', 422, ['artwork_ids' => 'required']);
    }

    $artworkIds = array_values(array_unique(array_filter(array_map('intval', $artworkIds), function ($id) {
        return $id > 0;
    })));
    if (count($artworkIds) === 0) {
        Response::error('Invalid artwork selection.', 422, ['artwork_ids' => 'invalid']);
    }
    if (count($artworkIds) > 50) {
        Response::error('Too many artwork items.', 422, ['artwork_ids' => 'max:50']);
    }

    $clientUid = isset($input['client_uid']) && $input['client_uid'] !== ''
        ? substr((string) $input['client_uid'], 0, 64) : null;

    // 멱등 — 같은 mb_id+client_uid 주문이 있으면 반환.
    if ($clientUid !== null) {
        $existing = DB::fetch(
            "SELECT * FROM {$orderTable} WHERE mb_id = ? AND client_uid = ? LIMIT 1",
            [$me['mb_id'], $clientUid]
        );
        if ($existing && !empty($existing['order_id'])) {
            Response::success(print_order_decorate($existing), 200);
        }
    }

    // 소유 아트워크만 스냅샷.
    $artworkTable = DB::table('print_artwork_table');
    $productTable = DB::table('print_product_table');
    $items = [];
    $total = 0;

    $artworkPlaceholders = implode(',', array_fill(0, count($artworkIds), '?'));
    $artworkRows = DB::fetchAll(
        "SELECT * FROM {$artworkTable} WHERE mb_id = ? AND artwork_id IN ({$artworkPlaceholders})",
        array_merge([$me['mb_id']], $artworkIds)
    );
    $artworkById = [];
    $productSlugs = [];
    foreach ($artworkRows as $aw) {
        $awId = (int) $aw['artwork_id'];
        $artworkById[$awId] = $aw;
        $productSlugs[(string) $aw['product_slug']] = true;
    }
    if (count($artworkById) !== count($artworkIds)) {
        Response::error('Invalid artwork selection.', 422, ['artwork_ids' => 'invalid']);
    }

    $productSlugList = array_keys($productSlugs);
    $productPlaceholders = implode(',', array_fill(0, count($productSlugList), '?'));
    $productRows = DB::fetchAll(
        "SELECT * FROM {$productTable} WHERE slug IN ({$productPlaceholders}) AND is_active = 1",
        $productSlugList
    );
    $productBySlug = [];
    foreach ($productRows as $product) {
        $productBySlug[(string) $product['slug']] = $product;
    }

    foreach ($artworkIds as $awId) {
        $aw = $artworkById[$awId];
        $product = $productBySlug[(string) $aw['product_slug']] ?? null;
        if (!$product) {
            Response::error('Print product is not available.', 422, ['artwork_ids' => 'invalid_product']);
        }

        try {
            $price = print_calculate_price($product, (int) $aw['qty'], $aw['option_selection']);
            $previewUri = print_sanitize_preview_uri($aw['preview_uri'] ?? null);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        }

        $items[] = [
            'artwork_id'   => $awId,
            'product_slug' => $aw['product_slug'],
            'product_name' => $product['name'] ?? $aw['product_slug'],
            'mode'         => $aw['mode'],
            'qty'          => $price['qty'],
            'option_selection' => $price['option_selection'],
            'unit_price'   => $price['unit_price'],
            'subtotal'     => $price['subtotal'],
            'preview_uri'  => $previewUri,
        ];
        $total += $price['subtotal'];
    }

    if (count($items) === 0) {
        Response::error('유효한 디자인이 없습니다.', 422, ['artwork_ids' => 'invalid']);
    }

    $orderNo = 'OP' . date('YmdHis') . bin2hex(random_bytes(6));

    DB::beginTransaction();
    try {
        DB::execute(
            "INSERT INTO {$orderTable}
                (order_no, mb_id, receiver_name, receiver_phone, zipcode, addr1, addr2, memo,
                 item_count, total_amount, status, client_uid)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            [
                $orderNo, $me['mb_id'],
                trim((string) $input['receiver_name']),
                trim((string) $input['receiver_phone']),
                isset($input['zipcode']) ? substr((string) $input['zipcode'], 0, 10) : '',
                trim((string) $input['addr1']),
                isset($input['addr2']) ? trim((string) $input['addr2']) : '',
                isset($input['memo']) ? substr((string) $input['memo'], 0, 500) : null,
                count($items), $total, $clientUid,
            ]
        );

        $orderId = (int) DB::lastInsertId();
        foreach ($items as $it) {
            DB::execute(
                "INSERT INTO {$itemTable}
                    (order_id, artwork_id, product_slug, product_name, mode, qty, option_selection,
                     unit_price, subtotal, preview_uri)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [$orderId, $it['artwork_id'], $it['product_slug'], $it['product_name'], $it['mode'],
                 $it['qty'], $it['option_selection'], $it['unit_price'], $it['subtotal'], $it['preview_uri']]
            );
        }
        DB::commit();
    } catch (Throwable $e) {
        DB::rollBack();
        throw $e;
    }

    $order = DB::fetch("SELECT * FROM {$orderTable} WHERE order_id = ? LIMIT 1", [$orderId]);
    Response::success(print_order_decorate($order), 201);
}

Response::error('Method not allowed.', 405);
