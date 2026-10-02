<?php
/**
 * Gnuboard5 REST API - Shop Reviews & Q&A
 *
 * GET  /v1/shop/reviews?it_id={it_id}  - List reviews for a product
 * POST /v1/shop/reviews                 - Write a review (auth + Youngcart review policy)
 * GET  /v1/shop/reviews/summary?it_id={it_id} - Review score distribution
 * GET  /v1/shop/reviews/mine            - List my product reviews
 * GET  /v1/shop/reviews/{is_id}         - Read my product review detail
 * PATCH /v1/shop/reviews/{is_id}        - Update my product review
 * DELETE /v1/shop/reviews/{is_id}       - Delete my product review
 * GET  /v1/shop/reviews/qna?it_id={it_id} - List Q&A for a product
 * POST /v1/shop/reviews/qna             - Ask a question (auth required)
 * GET  /v1/shop/reviews/qna/mine        - List my product Q&A
 * GET  /v1/shop/reviews/qna/{iq_id}     - Read my product Q&A detail
 * PATCH /v1/shop/reviews/qna/{iq_id}    - Update my unanswered product Q&A
 * DELETE /v1/shop/reviews/qna/{iq_id}   - Delete my unanswered product Q&A
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$subAction = isset($shopSegments[0]) ? $shopSegments[0] : '';

require_once __DIR__ . '/reviews_helpers.php';

// ----- GET /v1/shop/reviews/summary?it_id=XXX - Review score distribution -----
if ($subAction === 'summary') {
    if ($apiMethod !== 'GET') {
        Response::error('Method not allowed.', 405);
    }

    // it_id 가 없으면 승인된 후기 전체 — 사용후기 목록(itemuselist)의 "전체 N건 · 평균 N.N★".
    $it_id = isset($_GET['it_id']) ? trim($_GET['it_id']) : '';
    $scopeSql = $it_id !== '' ? "it_id = ? AND is_confirm = '1'" : "is_confirm = '1'";
    $scopeParams = $it_id !== '' ? [$it_id] : [];

    $reviewTable = DB::table('g5_shop_item_use_table');
    $photoSql = "(is_content LIKE '%<img%' OR is_content LIKE '%&lt;img%')";
    $base = DB::fetch(
        "SELECT COUNT(*) AS total,
                IFNULL(AVG(is_score), 0) AS average_score,
                SUM(CASE WHEN {$photoSql} THEN 1 ELSE 0 END) AS photo_count
         FROM {$reviewTable}
         WHERE {$scopeSql}",
        $scopeParams
    ) ?: [];

    $total = (int) ($base['total'] ?? 0);
    $scoreRows = DB::fetchAll(
        "SELECT is_score, COUNT(*) AS cnt
         FROM {$reviewTable}
         WHERE {$scopeSql} AND is_score BETWEEN 1 AND 5
         GROUP BY is_score",
        $scopeParams
    );
    $scoreCounts = [];
    foreach ($scoreRows as $row) {
        $scoreCounts[(int) $row['is_score']] = (int) $row['cnt'];
    }

    $scores = [];
    for ($score = 5; $score >= 1; $score--) {
        $count = (int) ($scoreCounts[$score] ?? 0);
        $scores[] = [
            'score' => $score,
            'count' => $count,
            'percentage' => $total > 0 ? round(($count / $total) * 100, 1) : 0,
        ];
    }

    Response::success([
        'total' => $total,
        'average' => round((float) ($base['average_score'] ?? 0), 1),
        'photo_count' => (int) ($base['photo_count'] ?? 0),
        'scores' => $scores,
    ]);
}

// =========================================================================
// Q&A ENDPOINTS (routed via /v1/shop/reviews/qna)
// =========================================================================
if ($subAction === 'qna') {
    require __DIR__ . '/reviews_qna_routes.php';
}

// =========================================================================
// REVIEW ENDPOINTS (default: /v1/shop/reviews)
// =========================================================================

$queryReviewId = isset($_GET['is_id']) && preg_match('/^\d+$/', (string) $_GET['is_id'])
    ? (string) $_GET['is_id']
    : '';
if ($subAction === '' && $queryReviewId !== '') {
    $subAction = $queryReviewId;
}

// ----- GET/PATCH/DELETE /v1/shop/reviews/{is_id} or ?is_id=XXX -----
if ($subAction !== '' && preg_match('/^\d+$/', (string) $subAction)) {
    if (!in_array($apiMethod, ['GET', 'PATCH', 'DELETE'], true)) {
        Response::error('Method not allowed.', 405);
    }

    $member = Auth::requireAuth();
    $reviewId = (int) $subAction;
    $reviewTable = DB::table('g5_shop_item_use_table');
    $itemTable = DB::table('g5_shop_item_table');

    $review = DB::fetch(
        "SELECT r.is_id, r.it_id, r.mb_id, r.is_subject, r.is_content, r.is_score,
                r.is_name, r.is_confirm, r.is_time,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$reviewTable} r
         LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
         WHERE r.is_id = ? AND r.mb_id = ? LIMIT 1",
        [$reviewId, $member['mb_id']]
    );
    if (!$review) {
        Response::error('Product review not found.', 404);
    }

    if ($apiMethod === 'GET') {
        Response::success(shop_api_format_my_review_row($review));
    }

    $wasConfirmed = (string) ($review['is_confirm'] ?? '0') === '1';

    if ($apiMethod === 'DELETE') {
        shop_api_delete_editor_thumbnails($review['is_content'] ?? '');

        DB::execute(
            "DELETE FROM {$reviewTable}
             WHERE is_id = ? AND mb_id = ?",
            [$reviewId, $member['mb_id']]
        );
        if (function_exists('run_event')) {
            api_run_event('shop_item_use_deleted', array($reviewId, (string) ($review['it_id'] ?? '')), $member);
        }
        if ($wasConfirmed) {
            shop_api_refresh_review_stats((string) $review['it_id']);
        }
        Response::success([
            'deleted' => true,
            'is_id' => $reviewId,
        ]);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $is_subject = isset($input['is_subject']) ? shop_api_clean_plain_text($input['is_subject']) : '';
    $is_content = isset($input['is_content']) ? shop_api_clean_review_content($input['is_content']) : '';
    $is_score = shop_api_normalize_review_score($input['is_score'] ?? 0);

    $errors = [];
    if ($is_subject === '') {
        $errors['is_subject'] = 'is_subject is required.';
    }
    if ($is_content === '') {
        $errors['is_content'] = 'is_content is required.';
    }
    if (!empty($errors)) {
        Response::error('Validation failed.', 422, $errors);
    }

    DB::execute(
        "UPDATE {$reviewTable}
         SET is_subject = ?,
             is_content = ?,
             is_score = ?
         WHERE is_id = ? AND mb_id = ?",
        [$is_subject, $is_content, $is_score, $reviewId, $member['mb_id']]
    );
    if (function_exists('run_event')) {
        api_run_event('shop_item_use_updated', array($reviewId, (string) ($review['it_id'] ?? '')), $member);
    }

    if ($wasConfirmed) {
        shop_api_refresh_review_stats((string) $review['it_id']);
    }

    $updated = DB::fetch(
        "SELECT r.is_id, r.it_id, r.mb_id, r.is_subject, r.is_content, r.is_score,
                r.is_name, r.is_confirm, r.is_time,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$reviewTable} r
         LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
         WHERE r.is_id = ? AND r.mb_id = ? LIMIT 1",
        [$reviewId, $member['mb_id']]
    );

    Response::success(shop_api_format_my_review_row($updated));
}

// ----- GET /v1/shop/reviews/mine - List my product reviews -----
if ($apiMethod === 'GET' && $subAction === 'mine') {
    $member = Auth::requireAuth();

    [$page, $perPage, $offset] = api_page_params(10, 100);
    $status  = trim((string) ($_GET['status'] ?? ''));
    $q       = trim((string) ($_GET['q'] ?? ''));

    $reviewTable = DB::table('g5_shop_item_use_table');
    $itemTable = DB::table('g5_shop_item_table');
    $where = ['r.mb_id = ?'];
    $params = [$member['mb_id']];

    if ($status === 'confirmed') {
        $where[] = "r.is_confirm = '1'";
    } elseif ($status === 'pending') {
        $where[] = "(r.is_confirm IS NULL OR r.is_confirm <> '1')";
    }

    if ($q !== '') {
        $where[] = "(r.is_subject LIKE ? OR r.is_content LIKE ? OR i.it_name LIKE ?)";
        $like = '%' . $q . '%';
        array_push($params, $like, $like, $like);
    }

    $whereSql = implode(' AND ', $where);
    $total = DB::count(
        "SELECT COUNT(*)
         FROM {$reviewTable} r
         LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
         WHERE {$whereSql}",
        $params
    );

    $rows = DB::fetchAll(
        "SELECT r.is_id, r.it_id, r.mb_id, r.is_subject, r.is_content, r.is_score,
                r.is_name, r.is_confirm, r.is_time,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$reviewTable} r
         LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
         WHERE {$whereSql}
         ORDER BY r.is_id DESC
         LIMIT ?, ?",
        array_merge($params, [$offset, $perPage])
    );

    $reviews = [];
    foreach ($rows as $row) {
        $reviews[] = shop_api_format_my_review_row($row);
    }

    Response::paginated($reviews, $total, $page, $perPage);
}

// ----- GET /v1/shop/reviews?it_id=XXX - List product reviews, or all confirmed reviews if it_id is omitted -----
if ($apiMethod === 'GET' && $subAction === '') {

    $it_id = isset($_GET['it_id']) ? trim($_GET['it_id']) : '';
    [$page, $perPage, $offset] = api_page_params(20, 100);
    $q       = trim((string) ($_GET['q'] ?? ($_GET['stx'] ?? '')));
    $sfl     = trim((string) ($_GET['sfl'] ?? ''));
    $sst     = trim((string) ($_GET['sst'] ?? 'r.is_id'));
    $sod     = strtolower(trim((string) ($_GET['sod'] ?? 'desc')));

    $reviewTable = DB::table('g5_shop_item_use_table');
    $itemTable = DB::table('g5_shop_item_table');
    $where = ["r.is_confirm = '1'"];
    $params = [];
    if ($it_id !== '') {
        $where[] = 'r.it_id = ?';
        $params[] = $it_id;
    }
    if ($q !== '') {
        $allowedSearchFields = [
            'i.it_name' => 'i.it_name',
            'r.it_id' => 'r.it_id',
            'r.is_subject' => 'r.is_subject',
            'r.is_content' => 'r.is_content',
            'r.is_name' => 'r.is_name',
            'r.mb_id' => 'r.mb_id',
        ];
        $field = $allowedSearchFields[$sfl] ?? '';
        if ($field === '') {
            $where[] = "(i.it_name LIKE ? OR r.is_subject LIKE ? OR r.is_content LIKE ? OR r.is_name LIKE ? OR r.it_id LIKE ?)";
            $like = '%' . $q . '%';
            array_push($params, $like, $like, $like, $like, $like);
        } elseif ($field === 'r.it_id') {
            $where[] = "{$field} LIKE ?";
            $params[] = $q . '%';
        } elseif ($field === 'r.is_name' || $field === 'r.mb_id') {
            $where[] = "{$field} = ?";
            $params[] = $q;
        } else {
            $where[] = "{$field} LIKE ?";
            $params[] = '%' . $q . '%';
        }
    }
    $whereSql = implode(' AND ', $where);
    $allowedSortFields = [
        'r.is_id' => 'r.is_id',
        'r.is_time' => 'r.is_time',
        'r.is_datetime' => 'r.is_time',
        'r.is_score' => 'r.is_score',
        'r.it_id' => 'r.it_id',
        'i.it_name' => 'i.it_name',
    ];
    $sortField = $allowedSortFields[$sst] ?? 'r.is_id';
    $sortDirection = in_array($sod, ['asc', 'desc'], true) ? $sod : 'desc';

    // 후기 하나를 가리켜 들어오면(?focus_is_id= — 상품 상세 주소의 is_id, 사용후기 목록의 "후기 바로가기")
    // 그 후기가 실린 쪽을 연다. 레퍼런스 테마(solune_shop_review_page)처럼 서버에서 한 번 세어 맞춘다.
    // 상품이 정해져 있고 번호순 정렬일 때만 — 이 상품의 승인된 후기가 아니면 없던 일로 한다.
    // (?is_id= 는 "내 후기 하나 보기"로 이미 쓰이므로 이름을 달리 둔다.)
    $focusIsId = isset($_GET['focus_is_id']) ? (int) $_GET['focus_is_id'] : 0;
    if ($focusIsId > 0 && $it_id !== '' && $sortField === 'r.is_id') {
        $focusRow = DB::fetch(
            "SELECT is_id FROM {$reviewTable} WHERE is_id = ? AND it_id = ? AND is_confirm = '1' LIMIT 1",
            [$focusIsId, $it_id]
        );
        if ($focusRow) {
            $comparison = $sortDirection === 'desc' ? '>' : '<';
            $before = DB::count(
                "SELECT COUNT(*)
                 FROM {$reviewTable} r
                 LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
                 WHERE {$whereSql} AND r.is_id {$comparison} ?",
                array_merge($params, [$focusIsId])
            );
            $page = intdiv($before, $perPage) + 1;
            $offset = ($page - 1) * $perPage;
        }
    }

    $total = DB::count(
        "SELECT COUNT(*)
         FROM {$reviewTable} r
         LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
         WHERE {$whereSql}",
        $params
    );

    $rows = DB::fetchAll(
        "SELECT r.is_id, r.it_id, r.mb_id, r.is_subject, r.is_content, r.is_score,
                r.is_name, r.is_confirm, r.is_time,
                r.is_reply_subject, r.is_reply_content, r.is_reply_name,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$reviewTable} r
         LEFT JOIN {$itemTable} i ON i.it_id = r.it_id
         WHERE {$whereSql}
         ORDER BY {$sortField} {$sortDirection}
         LIMIT ?, ?",
        array_merge($params, [$offset, $perPage])
    );

    $reviews = [];
    foreach ($rows as $row) {
        $productImage = api_image_url_with_width(shop_api_item_image_url($row['it_id'] ?? '', $row['it_img1'] ?? ''), 400);
        $reviews[] = [
            'is_id'      => $row['is_id'],
            'it_id'      => $row['it_id'],
            'it_name'    => $row['it_name'] ?? '',
            'it_seo_title' => $row['it_seo_title'] ?? '',
            'ca_id'      => $row['ca_id'] ?? '',
            'it_price'   => (int) ($row['it_price'] ?? 0),
            'mb_id'      => $row['mb_id'],
            'is_subject' => $row['is_subject'],
            'is_content' => $row['is_content'],
            'is_score'   => (int) $row['is_score'],
            'is_name'    => $row['is_name'],
            'is_time'    => $row['is_time'],
            'is_confirm' => $row['is_confirm'],
            'mb_nick'    => $row['is_name'],
            // 관리자 답변(그누보드 itemuselist 의 내용보기 겹창에 함께 나온다).
            'is_reply_subject' => (string) ($row['is_reply_subject'] ?? ''),
            'is_reply_content' => (string) ($row['is_reply_content'] ?? ''),
            'is_reply_name'    => (string) ($row['is_reply_name'] ?? ''),
            'product_image_url' => $productImage,
            // 후기 카드 사진 — 후기 본문의 첫 사진, 없으면 상품 사진(그누보드 get_itemuselist_thumbnail 과 같다).
            'thumbnail_url' => api_editor_first_image_url($row['is_content'] ?? '', 400) ?: $productImage,
        ];
    }

    Response::paginated($reviews, $total, $page, $perPage);
}

// ----- POST /v1/shop/reviews - Write a review -----
if ($apiMethod === 'POST' && $subAction === '') {

    $member = Auth::requireAuth();

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $it_id      = isset($input['it_id']) ? trim($input['it_id']) : '';
    $is_subject = isset($input['is_subject']) ? shop_api_clean_plain_text($input['is_subject']) : '';
    $is_content = isset($input['is_content']) ? shop_api_clean_review_content($input['is_content']) : '';
    $is_score   = shop_api_normalize_review_score($input['is_score'] ?? 0);

    $errors = [];
    if (!$it_id) {
        $errors['it_id'] = 'it_id is required.';
    }
    if (!$is_subject) {
        $errors['is_subject'] = 'is_subject is required.';
    }
    if (!$is_content) {
        $errors['is_content'] = 'is_content is required.';
    }
    if (!empty($errors)) {
        Response::error('Validation failed.', 422, $errors);
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

    $default = DB::fetch("SELECT de_item_use_write, de_item_use_use FROM " . DB::table('g5_shop_default_table') . " LIMIT 1") ?: [];
    $isAdmin = Auth::adminRole($member) === 'super';

    if (!$isAdmin && (int) ($default['de_item_use_write'] ?? 0) === 1) {
        $completeStatus = "\xEC\x99\x84\xEB\xA3\x8C";
        $completed = DB::fetch(
            "SELECT ct_id
             FROM " . DB::table('g5_shop_cart_table') . "
             WHERE mb_id = ?
               AND it_id = ?
               AND ct_status = ?
             LIMIT 1",
            [$member['mb_id'], $it_id, $completeStatus]
        );

        if (!$completed) {
            Response::error('Reviews can only be written for completed purchases.', 403);
        }
    }

    $isConfirm = (int) ($default['de_item_use_use'] ?? 0) === 1 ? '0' : '1';
    $isName = shop_api_review_author_name($member);
    $isPassword = (string) ($member['mb_password'] ?? '');

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_item_use_table') . " SET
            it_id      = ?,
            mb_id      = ?,
            is_subject = ?,
            is_content = ?,
            is_score   = ?,
            is_name    = ?,
            is_password = ?,
            is_confirm = ?,
            is_reply_subject = '',
            is_reply_content = '',
            is_reply_name = '',
            is_time    = ?,
            is_ip      = ?",
        [
            $it_id, $member['mb_id'], $is_subject, $is_content, $is_score, $isName, $isPassword, $isConfirm,
            defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s'),
            $_SERVER['REMOTE_ADDR'] ?? '',
        ]
    );

    $newId = DB::lastInsertId();
    if (function_exists('run_event')) {
        api_run_event('shop_item_use_created', array($newId, $it_id), $member);
    }

    if ($isConfirm === '1') {
        shop_api_refresh_review_stats($it_id);
    }

    $newReview = DB::fetch(
        "SELECT r.is_id, r.it_id, r.mb_id, r.is_subject, r.is_content, r.is_score,
                r.is_name, r.is_confirm, r.is_time,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM " . DB::table('g5_shop_item_use_table') . " r
         LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = r.it_id
         WHERE r.is_id = ? LIMIT 1",
        [$newId]
    );

    Response::success(shop_api_format_my_review_row($newReview), 201);
}

Response::error('Method not allowed.', 405);
