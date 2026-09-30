<?php
/**
 * Gnuboard5 REST API - Print Artwork (오프린트미)
 *
 * Routes (prefix: v1/print/artwork):
 *   GET    /v1/print/artwork          - 본인 아트워크 목록 (?product=slug, page, limit)
 *   GET    /v1/print/artwork/{id}     - 단건 (본인/super)
 *   POST   /v1/print/artwork          - 생성 (client_uid 멱등)
 *   DELETE /v1/print/artwork/{id}     - 삭제 (본인/super)
 *
 * 사용자 디자인(에디터 doc) 또는 업로드 산출물을 저장한다. 주문 항목에 연결될 자산.
 */

if (!defined('_GNUBOARD_')) exit;

$artworkTable = DB::table('print_artwork_table');
$productTable = DB::table('print_product_table');

$id = isset($printSegments[0]) && ctype_digit((string) $printSegments[0])
    ? (int) $printSegments[0]
    : 0;

function print_decode_artwork(array $row): array
{
    $row['option_selection'] = json_decode($row['option_selection'] ?? '{}', true) ?: new stdClass();
    $row['qty']        = (int) $row['qty'];
    $row['unit_price'] = (int) $row['unit_price'];
    $row['subtotal']   = (int) $row['subtotal'];
    return $row;
}

// JSON 컬럼 입력 정규화: 배열/객체면 인코드, 문자열이면 그대로.
function print_json_text($value, string $fallback): ?string
{
    if ($value === null) return null;
    if (is_array($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE);
    }
    $text = (string) $value;
    return $text === '' ? $fallback : $text;
}

// -------------------------------------------------------------------------
// GET /v1/print/artwork - 본인 목록
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'GET') {
    $me = Auth::requireAuth();
    $page  = max(1, (int) ($_GET['page'] ?? 1));
    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    $product = isset($_GET['product']) ? trim((string) $_GET['product']) : '';

    $where = 'mb_id = ?';
    $params = [$me['mb_id']];
    if ($product !== '') {
        $where .= ' AND product_slug = ?';
        $params[] = $product;
    }

    $total = (int) DB::count("SELECT COUNT(*) FROM {$artworkTable} WHERE {$where}", $params);
    $rows = DB::fetchAll(
        "SELECT * FROM {$artworkTable} WHERE {$where} ORDER BY artwork_id DESC LIMIT {$limit} OFFSET {$offset}",
        $params
    );
    $rows = array_map('print_decode_artwork', $rows);
    Response::paginated($rows, $total, $page, $limit);
}

// -------------------------------------------------------------------------
// GET /v1/print/artwork/{id} - 단건
// -------------------------------------------------------------------------
if ($id && $apiMethod === 'GET') {
    $me = Auth::requireAuth();
    $row = print_find_owned_artwork($id, $me);
    if (!$row) Response::error('Artwork not found.', 404);
    Response::success(print_decode_artwork($row));
}

// -------------------------------------------------------------------------
// POST /v1/print/artwork - 생성
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    $input = get_request_body();

    $errors = Validator::validate([
        'product_slug' => 'required|max:80',
    ], $input);
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $productSlug = trim((string) $input['product_slug']);
    $mode = isset($input['mode']) && $input['mode'] === 'upload' ? 'upload' : 'design';
    $qty = max(1, (int) ($input['qty'] ?? 1));

    $product = DB::fetch(
        "SELECT * FROM {$productTable} WHERE slug = ? AND is_active = 1 LIMIT 1",
        [$productSlug]
    );
    if (!$product) {
        Response::error('Product not found.', 404);
    }

    try {
        $price = print_calculate_price($product, $qty, $input['option_selection'] ?? []);
        $optionSelection = $price['option_selection'];
        $unitPrice = $price['unit_price'];
        $subtotal = $price['subtotal'];
        $previewUri = print_sanitize_preview_uri($input['preview_uri'] ?? null);
    } catch (InvalidArgumentException $e) {
        Response::error($e->getMessage(), 422);
    }

    $docJson = print_json_text($input['doc_json'] ?? null, '');
    if ($docJson === '') $docJson = null;
    $uploadName = isset($input['upload_name']) && $input['upload_name'] !== ''
        ? substr((string) $input['upload_name'], 0, 255) : null;
    $clientUid = isset($input['client_uid']) && $input['client_uid'] !== ''
        ? substr((string) $input['client_uid'], 0, 64) : null;

    // client_uid 멱등 — 이미 같은 mb_id+client_uid 가 있으면 그걸 반환.
    if ($clientUid !== null) {
        $existing = DB::fetch(
            "SELECT * FROM {$artworkTable} WHERE mb_id = ? AND client_uid = ? LIMIT 1",
            [$me['mb_id'], $clientUid]
        );
        if ($existing && !empty($existing['artwork_id'])) {
            Response::success(print_decode_artwork($existing), 200);
        }
    }

    DB::execute(
        "INSERT INTO {$artworkTable}
            (mb_id, product_slug, mode, qty, option_selection, unit_price, subtotal,
             doc_json, preview_uri, upload_name, client_uid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [$me['mb_id'], $productSlug, $mode, $qty, $optionSelection, $unitPrice, $subtotal,
         $docJson, $previewUri, $uploadName, $clientUid]
    );

    $newId = (int) DB::lastInsertId();
    $row = DB::fetch("SELECT * FROM {$artworkTable} WHERE artwork_id = ? LIMIT 1", [$newId]);
    Response::success(print_decode_artwork($row), 201);
}

// -------------------------------------------------------------------------
// DELETE /v1/print/artwork/{id} - 삭제
// -------------------------------------------------------------------------
if ($id && $apiMethod === 'DELETE') {
    $me = Auth::requireAuth();
    $row = print_find_owned_artwork($id, $me);
    if (!$row) Response::error('Artwork not found.', 404);
    DB::execute("DELETE FROM {$artworkTable} WHERE artwork_id = ?", [$id]);
    Response::success(['message' => '삭제되었습니다.']);
}

Response::error('Method not allowed.', 405);
