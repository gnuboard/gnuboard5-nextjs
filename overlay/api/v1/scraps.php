<?php
/**
 * Gnuboard5 REST API - Scraps (스크랩) Endpoints
 *
 * Routes handled (prefix: v1/scraps):
 *   GET    /v1/scraps                    - 내 스크랩 목록
 *   GET    /v1/scraps/{bo_table}/{wr_id} - 특정 글 스크랩 여부
 *   POST   /v1/scraps                    - 글 스크랩 추가
 *   DELETE /v1/scraps/{ms_id}            - 스크랩 삭제
 *   DELETE /v1/scraps/{bo_table}/{wr_id} - 특정 글 스크랩 삭제
 */

if (!defined('_GNUBOARD_')) exit;

$scrapTable = DB::table('scrap_table');

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';
$seg1 = isset($apiSegments[1]) ? $apiSegments[1] : '';

function api_scrap_total($mbId)
{
    $scrapTable = DB::table('scrap_table');
    return (int) DB::count(
        "SELECT COUNT(*) FROM {$scrapTable} WHERE mb_id = ?",
        [$mbId]
    );
}

function api_scrap_update_member_count($mbId)
{
    $memberTable = DB::table('member_table');
    DB::execute(
        "UPDATE {$memberTable} SET mb_scrap_cnt = ? WHERE mb_id = ?",
        [api_scrap_total($mbId), $mbId]
    );
}

function api_scrap_find($mbId, $boTable, $wrId)
{
    $scrapTable = DB::table('scrap_table');
    return DB::fetch(
        "SELECT * FROM {$scrapTable}
         WHERE mb_id = ? AND bo_table = ? AND wr_id = ?
         LIMIT 1",
        [$mbId, $boTable, (string) $wrId]
    );
}

function api_scrap_post_row($boTable, $wrId)
{
    $board = api_get_board($boTable);
    if (!$board) {
        return [null, null];
    }

    $writeTable = DB::writeTable($boTable);
    $post = DB::fetch(
        "SELECT *
         FROM {$writeTable}
         WHERE wr_id = ? AND wr_is_comment = 0
         LIMIT 1",
        [(int) $wrId]
    );

    return [$board, $post];
}

function api_scrap_normalize($row)
{
    list($board, $post) = api_scrap_post_row($row['bo_table'], $row['wr_id']);

    $row['ms_id']       = (int) $row['ms_id'];
    $row['wr_id']       = (int) $row['wr_id'];
    $row['bo_subject']  = $board ? $board['bo_subject'] : '[게시판 없음]';
    $row['wr_subject']  = $post && $post['wr_subject'] ? $post['wr_subject'] : '[글 없음]';
    // 스크랩한 뒤 신고로 숨겨진 글은 목록에서도 제목을 가린다(목록 · 글보기와 같이 — 숨김은 이 API 가 더한 기능).
    if ($post && (string) ($post['wr_10'] ?? '') === 'report_hidden') {
        $row['wr_subject'] = '[신고로 숨겨진 글]';
    }
    $row['wr_seo_title']= $post && isset($post['wr_seo_title']) ? $post['wr_seo_title'] : '';
    $row['wr_datetime'] = $post && isset($post['wr_datetime']) ? $post['wr_datetime'] : '';
    $row['wr_name']     = $post && isset($post['wr_name']) ? $post['wr_name'] : '';
    $row['post_mb_id']  = $post && isset($post['mb_id']) ? $post['mb_id'] : '';
    $row['href']        = api_board_post_href(
        $row['bo_table'],
        $row['wr_id'],
        $row['wr_seo_title']
    );

    return $row;
}

// -------------------------------------------------------------------------
// GET /v1/scraps - 내 스크랩 목록
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'GET') {
    $me = Auth::requireAuth();

    $page    = get_page_param(1);
    $perPage = get_per_page_param(20, 100);
    $offset  = ($page - 1) * $perPage;

    $total = api_scrap_total($me['mb_id']);
    $rows = DB::fetchAll(
        "SELECT *
         FROM {$scrapTable}
         WHERE mb_id = ?
         ORDER BY ms_id DESC
         LIMIT ? OFFSET ?",
        [$me['mb_id'], $perPage, $offset]
    );

    $items = [];
    foreach ($rows as $row) {
        $items[] = api_scrap_normalize($row);
    }

    Response::paginated($items, $total, $page, $perPage);
}

// -------------------------------------------------------------------------
// GET /v1/scraps/{bo_table}/{wr_id} - 특정 글 스크랩 여부
// -------------------------------------------------------------------------
if ($seg0 && $seg1 && $apiMethod === 'GET') {
    $me = Auth::requireAuth();

    $boTable = api_sanitize_bo_table($seg0);
    $wrId    = (int) $seg1;

    if (!$boTable || $wrId <= 0) {
        Response::error('Invalid scrap target.', 422);
    }

    $scrap = api_scrap_find($me['mb_id'], $boTable, $wrId);
    Response::success([
        'scrapped' => (bool) $scrap,
        'scrap'    => $scrap ? api_scrap_normalize($scrap) : null,
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/scraps - 글 스크랩 추가
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'POST') {
    $me    = Auth::requireAuth();
    api_require_write_quota('scrap', $me, 30, 300);
    $input = get_request_body();

    $boTable = isset($input['bo_table']) ? api_sanitize_bo_table($input['bo_table']) : '';
    $wrId    = isset($input['wr_id']) ? (int) $input['wr_id'] : 0;

    if (!$boTable || $wrId <= 0) {
        Response::error('Invalid scrap target.', 422);
    }

    list($board, $post) = api_scrap_post_row($boTable, $wrId);
    if (!$board) {
        Response::error('Board not found.', 404);
    }
    if (!$post) {
        Response::error('Post not found.', 404);
    }
    if ((string) ($post['wr_10'] ?? '') === 'report_hidden'
        && !Auth::canManagePost($me, $boTable, $post)) {
        Response::error('Post not found.', 404);
    }
    if (!api_can_read_board_post($me, $boTable, $board, $post)) {
        Response::error('You do not have permission to scrap this post.', 403);
    }
    if (api_is_blocked_author(
        $me,
        (string) ($post['mb_id'] ?? ''),
        (string) ($post['wr_name'] ?? '')
    ) && !Auth::canManagePost($me, $boTable, $post)) {
        Response::error('Post not found.', 404);
    }

    $existing = api_scrap_find($me['mb_id'], $boTable, $wrId);
    if ($existing) {
        Response::success([
            'scrap'   => api_scrap_normalize($existing),
            'message' => '이미 스크랩한 글입니다.',
        ]);
    }

    DB::execute(
        "INSERT INTO {$scrapTable}
            (mb_id, bo_table, wr_id, ms_datetime)
         VALUES (?, ?, ?, ?)",
        [$me['mb_id'], $boTable, (string) $wrId, date('Y-m-d H:i:s')]
    );

    $newId = (int) DB::lastInsertId();
    api_scrap_update_member_count($me['mb_id']);

    $scrap = DB::fetch(
        "SELECT * FROM {$scrapTable} WHERE ms_id = ? LIMIT 1",
        [$newId]
    );

    Response::success([
        'scrap'   => api_scrap_normalize($scrap),
        'message' => '스크랩했습니다.',
    ], 201);
}

// -------------------------------------------------------------------------
// DELETE /v1/scraps/{ms_id}
// DELETE /v1/scraps/{bo_table}/{wr_id}
// -------------------------------------------------------------------------
if ($seg0 && $apiMethod === 'DELETE') {
    $me = Auth::requireAuth();
    $deleteById = ctype_digit((string) $seg0) && !$seg1;

    if ($deleteById) {
        $scrap = DB::fetch(
            "SELECT * FROM {$scrapTable} WHERE ms_id = ? AND mb_id = ? LIMIT 1",
            [(int) $seg0, $me['mb_id']]
        );
    } else {
        $boTable = api_sanitize_bo_table($seg0);
        $wrId    = (int) $seg1;
        $scrap   = ($boTable && $wrId > 0) ? api_scrap_find($me['mb_id'], $boTable, $wrId) : null;
    }

    if (!$scrap) {
        if (!$deleteById) {
            Response::success(['message' => '스크랩을 삭제했습니다.']);
        }
        Response::error('Scrap not found.', 404);
    }

    DB::execute(
        "DELETE FROM {$scrapTable} WHERE ms_id = ? AND mb_id = ?",
        [(int) $scrap['ms_id'], $me['mb_id']]
    );
    api_scrap_update_member_count($me['mb_id']);

    Response::success(['message' => '스크랩을 삭제했습니다.']);
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Method not allowed.', 405);
