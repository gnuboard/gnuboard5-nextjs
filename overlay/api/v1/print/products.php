<?php
/**
 * Gnuboard5 REST API - Print Products (오프린트미)
 *
 * Routes (prefix: v1/print/products):
 *   GET /v1/print/products            - 활성 상품 목록 (?category=slug, page, limit)
 *   GET /v1/print/products/{slug}     - 단건 (slug)
 *
 * 공개 엔드포인트(비로그인 허용). 가격/옵션은 JSON 컬럼을 디코드해 반환.
 */

if (!defined('_GNUBOARD_')) exit;

$productTable = DB::table('print_product_table');
$slug = isset($printSegments[0]) ? trim((string) $printSegments[0]) : '';

// -------------------------------------------------------------------------
// GET /v1/print/products/{slug} - 단건
// -------------------------------------------------------------------------
if ($slug !== '' && $apiMethod === 'GET') {
    $row = DB::fetch(
        "SELECT * FROM {$productTable} WHERE slug = ? AND is_active = 1 LIMIT 1",
        [$slug]
    );
    if (!$row) {
        Response::error('Product not found.', 404);
    }
    Response::success(print_decode_product($row));
}

// -------------------------------------------------------------------------
// GET /v1/print/products - 목록
// -------------------------------------------------------------------------
if ($slug === '' && $apiMethod === 'GET') {
    $page  = max(1, (int) ($_GET['page'] ?? 1));
    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    $category = isset($_GET['category']) ? trim((string) $_GET['category']) : '';

    // 관리자(super)는 include_inactive=1 로 비활성 상품까지 조회 가능.
    $includeInactive = !empty($_GET['include_inactive']);
    if ($includeInactive) {
        $me = Auth::requireAuth();
        if (Auth::adminRole($me) !== 'super') {
            Response::error('Forbidden.', 403);
        }
        $where = '1=1';
    } else {
        $where = 'is_active = 1';
    }
    $params = [];
    if ($category !== '') {
        $where .= ' AND category_slug = ?';
        $params[] = $category;
    }

    $total = (int) DB::count("SELECT COUNT(*) FROM {$productTable} WHERE {$where}", $params);

    $rows = DB::fetchAll(
        "SELECT * FROM {$productTable}
         WHERE {$where}
         ORDER BY sort_order ASC, product_id ASC
         LIMIT {$limit} OFFSET {$offset}",
        $params
    );
    $rows = array_map('print_decode_product', $rows);

    Response::paginated($rows, $total, $page, $limit);
}

// -------------------------------------------------------------------------
// PATCH /v1/print/products/{slug} - 상품 수정 (super admin 전용)
// -------------------------------------------------------------------------
if ($slug !== '' && $apiMethod === 'PATCH') {
    $me = Auth::requireAuth();
    if (Auth::adminRole($me) !== 'super') {
        Response::error('Forbidden.', 403);
    }
    $row = DB::fetch("SELECT * FROM {$productTable} WHERE slug = ? LIMIT 1", [$slug]);
    if (!$row) Response::error('Product not found.', 404);

    $input = get_request_body();
    $set = [];
    $params = [];
    $allowed = [
        'name'          => fn($v) => substr(trim((string) $v), 0, 150),
        'summary'       => fn($v) => substr((string) $v, 0, 500),
        'icon'          => fn($v) => substr((string) $v, 0, 16),
        'category_name' => fn($v) => substr(trim((string) $v), 0, 80),
        'sort_order'    => fn($v) => (int) $v,
        'is_active'     => fn($v) => $v ? 1 : 0,
        'badges'        => fn($v) => is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string) $v,
        'option_groups' => fn($v) => is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string) $v,
        'quantity_tiers'=> fn($v) => is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string) $v,
    ];
    foreach ($allowed as $col => $cast) {
        if (array_key_exists($col, $input)) {
            $set[] = "{$col} = ?";
            $params[] = $cast($input[$col]);
        }
    }
    if (!$set) Response::error('No fields to update.', 422);

    $params[] = $slug;
    DB::execute("UPDATE {$productTable} SET " . implode(', ', $set) . " WHERE slug = ?", $params);
    $row = DB::fetch("SELECT * FROM {$productTable} WHERE slug = ? LIMIT 1", [$slug]);
    Response::success(print_decode_product($row));
}

// -------------------------------------------------------------------------
// DELETE /v1/print/products/{slug} - 비활성화(soft delete, super admin 전용)
// -------------------------------------------------------------------------
if ($slug !== '' && $apiMethod === 'DELETE') {
    $me = Auth::requireAuth();
    if (Auth::adminRole($me) !== 'super') {
        Response::error('Forbidden.', 403);
    }
    $row = DB::fetch("SELECT product_id FROM {$productTable} WHERE slug = ? LIMIT 1", [$slug]);
    if (!$row) Response::error('Product not found.', 404);
    DB::execute("UPDATE {$productTable} SET is_active = 0 WHERE slug = ?", [$slug]);
    Response::success(['message' => '비활성화되었습니다.']);
}

Response::error('Method not allowed.', 405);
