<?php
/**
 * Gnuboard5 REST API - Print Reviews (오프린트미)
 *
 * Routes (prefix: v1/print/reviews):
 *   GET  /v1/print/reviews?product={slug}  - 상품 리뷰 목록 + 평균 별점 (공개)
 *   POST /v1/print/reviews                 - 리뷰 작성 (인증, client_uid 멱등)
 *   DELETE /v1/print/reviews/{id}          - 삭제 (본인/super)
 */

if (!defined('_GNUBOARD_')) exit;

$reviewTable = DB::table('print_review_table');

$id = isset($printSegments[0]) && ctype_digit((string) $printSegments[0])
    ? (int) $printSegments[0]
    : 0;

function print_decode_review(array $row, ?array $viewer = null): array
{
    $row['rating'] = (int) $row['rating'];
    unset($row['client_uid']);
    // 공개 목록에 로그인 아이디를 내지 않는다(원본 상품 후기도 이름만 보인다) — 본인 · 최고관리자만 보고, 나머지는 is_mine 으로.
    $viewerId = $viewer && !empty($viewer['mb_id']) ? (string) $viewer['mb_id'] : '';
    $row['is_mine'] = $viewerId !== '' && $viewerId === (string) ($row['mb_id'] ?? '');
    if (!$row['is_mine'] && !($viewer && Auth::adminRole($viewer) === 'super')) {
        unset($row['mb_id']);
    }
    return $row;
}

// -------------------------------------------------------------------------
// GET /v1/print/reviews?product={slug}
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'GET') {
    $product = isset($_GET['product']) ? trim((string) $_GET['product']) : '';
    if ($product === '') {
        Response::error('product 파라미터가 필요합니다.', 422);
    }
    [$page, $limit, $offset] = api_page_params(20, 100, 'limit');
    $viewer = Auth::getUser();

    $total = (int) DB::count("SELECT COUNT(*) FROM {$reviewTable} WHERE product_slug = ?", [$product]);
    $avgRow = DB::fetch("SELECT AVG(rating) AS avg_rating FROM {$reviewTable} WHERE product_slug = ?", [$product]);
    $avg = $avgRow && $avgRow['avg_rating'] !== null ? round((float) $avgRow['avg_rating'], 1) : 0;

    $rows = DB::fetchAll(
        "SELECT * FROM {$reviewTable} WHERE product_slug = ? ORDER BY review_id DESC LIMIT {$limit} OFFSET {$offset}",
        [$product]
    );
    Response::success([
        'items'      => array_map(static fn(array $row): array => print_decode_review($row, $viewer), $rows),
        'total'      => $total,
        'avg_rating' => $avg,
        'page'       => $page,
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/print/reviews
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    $input = get_request_body();

    $errors = Validator::validate([
        'product_slug' => 'required|max:80',
        'content'      => 'required|max:1000',
    ], $input);
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $productSlug = trim((string) $input['product_slug']);
    $rating = (int) ($input['rating'] ?? 5);
    if ($rating < 1) $rating = 1;
    if ($rating > 5) $rating = 5;
    $content = substr(trim((string) $input['content']), 0, 1000);
    $displayName = trim((string) ($me['mb_nick'] ?? ''));
    if ($displayName === '') {
        $displayName = trim((string) ($me['mb_name'] ?? ''));
    }
    if ($displayName === '') {
        $displayName = (string) $me['mb_id'];
    }
    $mbName = substr($displayName, 0, 50);
    $clientUid = isset($input['client_uid']) && $input['client_uid'] !== ''
        ? substr((string) $input['client_uid'], 0, 64) : null;

    if ($clientUid !== null) {
        $existing = DB::fetch(
            "SELECT * FROM {$reviewTable} WHERE mb_id = ? AND client_uid = ? LIMIT 1",
            [$me['mb_id'], $clientUid]
        );
        if ($existing && !empty($existing['review_id'])) {
            Response::success(print_decode_review($existing, $me), 200);
        }
    }

    // 새 리뷰는 회원마다 1분 3건 · 1시간 20건까지(게시판 글쓰기와 같은 수) — 같은 요청의 재시도는 위에서 돌려주므로 세지 않는다.
    if (Auth::adminRole($me) !== 'super') {
        $reviewQuotaMsg = Throttle::checkMemberQuota('printreview', (string) $me['mb_id'], 3, 20, true, true);
        if ($reviewQuotaMsg !== null) {
            Response::error($reviewQuotaMsg, 429);
        }
    }

    DB::execute(
        "INSERT INTO {$reviewTable} (product_slug, mb_id, mb_name, rating, content, client_uid)
         VALUES (?, ?, ?, ?, ?, ?)",
        [$productSlug, $me['mb_id'], $mbName, $rating, $content, $clientUid]
    );
    $newId = (int) DB::lastInsertId();
    $row = DB::fetch("SELECT * FROM {$reviewTable} WHERE review_id = ? LIMIT 1", [$newId]);
    Response::success(print_decode_review($row, $me), 201);
}

// -------------------------------------------------------------------------
// DELETE /v1/print/reviews/{id}
// -------------------------------------------------------------------------
if ($id && $apiMethod === 'DELETE') {
    $me = Auth::requireAuth();
    $row = DB::fetch("SELECT mb_id FROM {$reviewTable} WHERE review_id = ? LIMIT 1", [$id]);
    if (!$row) Response::error('Review not found.', 404);
    if ($row['mb_id'] !== $me['mb_id'] && Auth::adminRole($me) !== 'super') {
        Response::error('Forbidden.', 403);
    }
    DB::execute("DELETE FROM {$reviewTable} WHERE review_id = ?", [$id]);
    Response::success(['message' => '삭제되었습니다.']);
}

Response::error('Method not allowed.', 405);
