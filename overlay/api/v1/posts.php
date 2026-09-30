<?php
/**
 * Gnuboard5 REST API - Individual Post Endpoints
 *
 * Routes handled (prefix: v1/posts):
 *   GET    /v1/posts/latest                       - Get latest posts across boards
 *   GET    /v1/posts/{bo_table}/{wr_id}           - Get single post
 *   GET    /v1/posts/{bo_table}/seo/{slug}        - Get single post by wr_seo_title
 *   PATCH  /v1/posts/{bo_table}/{wr_id}           - Update post (auth + owner/admin)
 *   DELETE /v1/posts/{bo_table}/{wr_id}           - Delete post (auth + owner/admin)
 *   POST   /v1/posts/{bo_table}/{wr_id}/good      - Recommend/like post (auth)
 *   POST   /v1/posts/{bo_table}/{wr_id}/nogood    - Not recommend/dislike post (auth)
 */

if (!defined('_GNUBOARD_')) exit;

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';
$seg1 = isset($apiSegments[1]) ? $apiSegments[1] : '';
$seg2 = isset($apiSegments[2]) ? $apiSegments[2] : '';

if (!function_exists('api_safe_board_link')) {
    function api_safe_board_link($value)
    {
        $value = trim((string) $value);
        if ($value === '' || preg_match('/[\x00-\x1F\x7F]/', $value)) {
            return '';
        }

        $decoded = trim(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($decoded === '' || strpos($decoded, '//') === 0) {
            return '';
        }

        if (preg_match('/^([a-z][a-z0-9+.-]*):/i', $decoded, $matches)) {
            $scheme = strtolower($matches[1]);
            return in_array($scheme, array('http', 'https', 'mailto', 'tel'), true) ? $value : '';
        }

        return $value;
    }
}

// -------------------------------------------------------------------------
// GET /v1/posts/latest - Get latest posts across boards
// -------------------------------------------------------------------------
if ($seg0 === 'latest' && $apiMethod === 'GET') {

    $rows = isset($_GET['rows']) ? max(1, min((int) $_GET['rows'], 50)) : 5;
    $viewer = Auth::getUser();

    // Optional board filter
    $boardFilter = '';
    if (isset($_GET['bo_table']) && $_GET['bo_table'] !== '') {
        $tables = explode(',', $_GET['bo_table']);
        $safeTables = [];
        foreach ($tables as $t) {
            $t = api_sanitize_bo_table(trim($t));
            if ($t) {
                $safeTables[] = $t;
            }
        }
        if (empty($safeTables)) {
            Response::success([]);
        }
    } else {
        // Get all board tables (read-only — replica 가능)
        $safeTables = array_column(
            DB::readFetchAll("SELECT bo_table FROM " . DB::table('board_table') . " ORDER BY bo_table"),
            'bo_table'
        );
    }

    $latestPosts = [];

    foreach ($safeTables as $bt) {
        $board = api_get_board($bt);
        if (!$board || !api_can_access_board_list($viewer, $bt, $board)) {
            continue;
        }

        $write_table = DB::writeTable($bt);

        // Check if table exists (스키마 조회 — replica 도 동일 스키마 보유 가정)
        $checkResult = DB::getPdo()->query("SHOW TABLES LIKE '" . str_replace("'", "\\'", $write_table) . "'");
        if (!$checkResult->fetch()) {
            continue;
        }

        $latestConditions = [
            "wr_is_comment = 0",
            "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
        ];
        $latestParams = [];
        api_add_blocked_author_condition($latestConditions, $latestParams, $viewer);
        $latestParams[] = $rows;
        $latestWhere = "WHERE " . implode(" AND ", $latestConditions);

        $posts = DB::readFetchAll(
            "SELECT wr_id, wr_subject, wr_seo_title, wr_name, mb_id, wr_datetime,
                    wr_hit, wr_good, wr_comment, wr_option, ca_name
             FROM {$write_table}
             {$latestWhere}
             ORDER BY wr_id DESC
             LIMIT ?",
            $latestParams
        );

        foreach ($posts as $post) {
            $post['bo_table']  = $bt;
            $post['is_secret'] = (strpos($post['wr_option'], 'secret') !== false);

            // Thumbnail: first image attachment
            $post['thumbnail'] = '';
            if (!$post['is_secret']) {
                $fileRow = DB::readFetch(
                    "SELECT bf_no, bf_file FROM " . DB::table('board_file_table') . "
                     WHERE bo_table = ?
                       AND wr_id = ?
                       AND bf_type IN (2, 3)
                     ORDER BY bf_no ASC LIMIT 1",
                    [$bt, $post['wr_id']]
                );
                if ($fileRow && $fileRow['bf_file']) {
                    $post['thumbnail'] = api_board_file_url(
                        $bt,
                        (int) $post['wr_id'],
                        (int) $fileRow['bf_no'],
                        $fileRow['bf_file']
                    );
                }
            }

            $latestPosts[] = $post;
        }
    }

    // Sort all by datetime descending and limit
    usort($latestPosts, function ($a, $b) {
        return strcmp($b['wr_datetime'], $a['wr_datetime']);
    });

    $latestPosts = array_slice($latestPosts, 0, $rows);

    Response::success($latestPosts);
}

// -------------------------------------------------------------------------
// GET /v1/posts/{bo_table}/seo/{slug} - Resolve wr_seo_title to wr_id
// -------------------------------------------------------------------------
if ($apiMethod === 'GET' && $seg1 === 'seo') {
    $resolve_bo_table = api_sanitize_bo_table($seg0);
    $seo_title = generate_seo_title(trim(rawurldecode((string) $seg2)));

    if (!$resolve_bo_table || $seo_title === '') {
        Response::error('Not found. Expected /v1/posts/{bo_table}/seo/{slug}', 404);
    }

    $resolve_board = api_get_board($resolve_bo_table);
    if (!$resolve_board) {
        Response::error('Board not found.', 404);
    }

    $resolve_write_table = DB::writeTable($resolve_bo_table);
    $resolved = DB::readFetch(
        "SELECT wr_id FROM {$resolve_write_table}
         WHERE wr_seo_title = ? AND wr_is_comment = 0
         LIMIT 1",
        [$seo_title]
    );

    if (!$resolved || !$resolved['wr_id']) {
        Response::error('Post not found.', 404);
    }

    $seg1 = (string) $resolved['wr_id'];
    $seg2 = '';
}

// -------------------------------------------------------------------------
// Route: /v1/posts/{bo_table}/{wr_id}[/{action}]
// -------------------------------------------------------------------------
$bo_table = api_sanitize_bo_table($seg0);
$wr_id    = (int) $seg1;
$action   = $seg2;

if (!$bo_table || !$wr_id) {
    Response::error('Not found. Expected /v1/posts/{bo_table}/{wr_id}', 404);
}

$board = api_get_board($bo_table);
if (!$board) {
    Response::error('Board not found.', 404);
}

$write_table = DB::writeTable($bo_table);

require_once __DIR__ . '/post_comments_helpers.php';

// -------------------------------------------------------------------------
// GET /v1/posts/{bo_table}/{wr_id}/comments?page=&per_page= (SC-12) — 상세 comments[] 와 같은 항목, 페이지 단위.
//   읽기 게이트는 상세와 같다. 글읽기 비용이 있는 게시판은 이미 치른(상세를 연) 회원만 — 여기서는 차감하지 않는다.
// -------------------------------------------------------------------------
if ($action === 'comments' && $apiMethod === 'GET') {
    $post = DB::readFetch("SELECT * FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = 0 LIMIT 1", [$wr_id]);
    $viewer = Auth::getUser();
    if (!$post || ((string) ($post['wr_10'] ?? '') === 'report_hidden' && (!$viewer || !Auth::canManagePost($viewer, $bo_table, $post)))) {
        Response::error('Post not found.', 404);
    }
    if (!api_can_read_board_post($viewer, $bo_table, $board, $post)) {
        Response::error('You do not have permission to read this post.', 403);
    }
    if (api_is_blocked_author($viewer, (string) ($post['mb_id'] ?? ''), (string) ($post['wr_name'] ?? ''))
        && !Auth::canManagePost($viewer, $bo_table, $post)) {
        Response::error('Post not found.', 404);
    }
    $readPoint = (int) ($board['bo_read_point'] ?? 0);
    $config = api_get_config();
    if ($readPoint < 0 && !empty($config['cf_use_point']) && !api_is_board_read_point_exempt($viewer, $board, $post)) {
        $paid = $viewer && !empty($viewer['mb_id']) && DB::readFetch(
            'SELECT 1 AS x FROM ' . DB::table('point_table') . " WHERE mb_id = ? AND po_rel_table = ? AND po_rel_id = ? AND po_rel_action = '읽기' LIMIT 1",
            [(string) $viewer['mb_id'], $bo_table, (string) $wr_id]
        );
        if (!$paid) {
            Response::error('Open the post first to read its comments.', 403);
        }
    }
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 50)));
    $total = api_post_count_comments($write_table, $wr_id, $viewer);
    $rows = api_post_load_comments($write_table, $bo_table, $post, $viewer, $perPage, ($page - 1) * $perPage);
    Response::paginated($rows, $total, $page, $perPage);
}

// -------------------------------------------------------------------------
// GET /v1/posts/{bo_table}/{wr_id} - Get single post
// -------------------------------------------------------------------------
if (!$action && $apiMethod === 'GET') {

    // 단건 글: replica 에서 읽고 hit++ 만 primary 쓰기.
    // replica lag 이 있어도 wr_hit 은 PHP에서 +1 보정하므로 표시 영향 없음.
    $post = DB::readFetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0
         LIMIT 1",
        [$wr_id]
    );

    if (!$post || !$post['wr_id']) {
        Response::error('Post not found.', 404);
    }

    $viewer = Auth::getUser();
    if ((string) ($post['wr_10'] ?? '') === 'report_hidden'
        && (!$viewer || !Auth::canManagePost($viewer, $bo_table, $post))) {
        Response::error('Post not found.', 404);
    }

    if (!api_can_read_board_post($viewer, $bo_table, $board, $post)) {
        Response::error('You do not have permission to read this post.', 403);
    }

    if (api_is_blocked_author(
        $viewer,
        (string) ($post['mb_id'] ?? ''),
        (string) ($post['wr_name'] ?? '')
    ) && !Auth::canManagePost($viewer, $bo_table, $post)) {
        Response::error('Post not found.', 404);
    }

    // Match Gnuboard's view/download session gate. bbs/download.php requires
    // ss_view_{bo_table}_{wr_id}, and hit count should only increment once per session.
    $viewSessionName = 'ss_view_' . $bo_table . '_' . $wr_id;
    $countView = true;
    if (function_exists('get_session') && function_exists('set_session')) {
        $countView = !get_session($viewSessionName);
    }
    if ($countView) {
        DB::execute("UPDATE {$write_table} SET wr_hit = wr_hit + 1 WHERE wr_id = ?", [$wr_id]);
        $post['wr_hit'] = (int) $post['wr_hit'] + 1;

        $readPoint = (int) ($board['bo_read_point'] ?? 0);
        $config = api_get_config();
        $shouldApplyReadPoint = !api_is_board_read_point_exempt($viewer, $board, $post)
            && !empty($config['cf_use_point'])
            && $readPoint !== 0;
        if ($shouldApplyReadPoint) {
            $viewerPoint = $viewer ? (int) ($viewer['mb_point'] ?? 0) : 0;
            if ($readPoint < 0 && $viewerPoint + $readPoint < 0) {
                Response::error('Not enough points to read this post.', 403);
            }

            if (function_exists('insert_point')) {
                $boardSubject = (defined('G5_IS_MOBILE') && G5_IS_MOBILE && !empty($board['bo_mobile_subject']))
                    ? (string) $board['bo_mobile_subject']
                    : (string) ($board['bo_subject'] ?? '');
                insert_point(
                    (string) ($viewer['mb_id'] ?? ''),
                    $readPoint,
                    $boardSubject . ' ' . $wr_id . ' 글읽기',
                    $bo_table,
                    $wr_id,
                    '읽기'
                );
            }
        }
    }
    if (function_exists('set_session')) {
        set_session($viewSessionName, true);
    }

    // Remove sensitive fields. Keep wr_email present for old clients, but never expose PII.
    unset($post['wr_password'], $post['wr_ip']);
    $post['wr_email'] = '';
    $post['wr_content'] = api_rewrite_editor_image_urls($post['wr_content'] ?? '');

    // Member info
    if ($post['mb_id']) {
        $mbRow = DB::readFetch(
            "SELECT mb_nick FROM " . DB::table('member_table') . "
             WHERE mb_id = ? LIMIT 1",
            [$post['mb_id']]
        );
        $post['mb_nick']      = isset($mbRow['mb_nick']) ? $mbRow['mb_nick'] : $post['wr_name'];
        $post['mb_icon_path'] = get_member_icon_url($post['mb_id']);
    } else {
        $post['mb_nick']      = $post['wr_name'];
        $post['mb_icon_path'] = null;
    }

    // Get file attachments
    $files = DB::readFetchAll(
        "SELECT bf_no, bo_table, wr_id, bf_source, bf_file, bf_download,
                bf_content, bf_filesize, bf_width, bf_height, bf_type,
                bf_datetime
         FROM " . DB::table('board_file_table') . "
         WHERE bo_table = ?
           AND wr_id = ?
         ORDER BY bf_no",
        [$bo_table, $wr_id]
    );
    foreach ($files as &$file) {
        $file['bf_url'] = api_board_file_url($bo_table, $wr_id, $file['bf_no'], $file['bf_file']);
        $file['bf_download_url'] = api_board_file_download_url($bo_table, $wr_id, $file['bf_no']);
    }
    unset($file);
    $post['files'] = $files;

    // Get comments (SC-12 — post_comments_helpers.php). ?comments_limit=N 이면 앞 N건 + comments_meta, 없으면 전량.
    $commentsLimit = isset($_GET['comments_limit']) ? max(1, min(100, (int) $_GET['comments_limit'])) : 0;
    if ($commentsLimit > 0) {
        $commentTotal = api_post_count_comments($write_table, $wr_id, $viewer);
        $post['comments'] = api_post_load_comments($write_table, $bo_table, $post, $viewer, $commentsLimit, 0);
        $post['comments_meta'] = [
            'total'     => $commentTotal,
            'per_page'  => $commentsLimit,
            'last_page' => max(1, (int) ceil($commentTotal / $commentsLimit)),
        ];
    } else {
        $post['comments'] = api_post_load_comments($write_table, $bo_table, $post, $viewer);
    }

    // Previous / Next post navigation
    $prevConditions = [
        "wr_id < ?",
        "wr_is_comment = 0",
        "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
    ];
    $prevParams = [$wr_id];
    api_add_blocked_author_condition($prevConditions, $prevParams, $viewer);
    $prevWhere = "WHERE " . implode(" AND ", $prevConditions);
    $prevPost = DB::readFetch(
         "SELECT wr_id, wr_subject, wr_seo_title FROM {$write_table}
          {$prevWhere}
          ORDER BY wr_id DESC LIMIT 1",
        $prevParams
    );

    $nextConditions = [
        "wr_id > ?",
        "wr_is_comment = 0",
        "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
    ];
    $nextParams = [$wr_id];
    api_add_blocked_author_condition($nextConditions, $nextParams, $viewer);
    $nextWhere = "WHERE " . implode(" AND ", $nextConditions);
    $nextPost = DB::readFetch(
         "SELECT wr_id, wr_subject, wr_seo_title FROM {$write_table}
          {$nextWhere}
          ORDER BY wr_id ASC LIMIT 1",
        $nextParams
    );
    $post['prev_post'] = $prevPost ?: null;

    // Permission hint for the caller
    $post['admin_role']  = $viewer ? Auth::adminRole($viewer, $bo_table) : '';
    $post['can_manage']  = $viewer ? Auth::canManagePost($viewer, $bo_table, $post) : false;
    $post['bo_use_good'] = (int) ($board['bo_use_good'] ?? 0);
    $post['bo_use_nogood'] = (int) ($board['bo_use_nogood'] ?? 0);
    $post['is_scrapped'] = false;
    $post['scrap_id']    = 0;
    if ($viewer) {
        $scrap = DB::readFetch(
            "SELECT ms_id FROM " . DB::table('scrap_table') . "
             WHERE mb_id = ? AND bo_table = ? AND wr_id = ?
             LIMIT 1",
            [$viewer['mb_id'], $bo_table, (string) $wr_id]
        );
        $post['is_scrapped'] = (bool) $scrap;
        $post['scrap_id']    = $scrap ? (int) $scrap['ms_id'] : 0;
    }
    $post['next_post'] = $nextPost ?: null;

    Response::success($post);
}

// -------------------------------------------------------------------------
// PATCH /v1/posts/{bo_table}/{wr_id} - Update post
// -------------------------------------------------------------------------
if (!$action && $apiMethod === 'PATCH') {
    $member = Auth::requireAuth();
    // Fetch existing post
    $post = DB::fetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0
         LIMIT 1",
        [$wr_id]
    );
    if (!$post || !$post['wr_id']) {
        Response::error('Post not found.', 404);
    }

    // 그누보드 표준 권한: 본인 OR cf_admin / gr_admin / bo_admin 중 하나
    if (!Auth::canManagePost($member, $bo_table, $post)) {
        Response::error('You do not have permission to edit this post.', 403);
    }

    $input = get_request_body();

    if (isset($input['wr_subject']) || isset($input['wr_seo_title'])) {
        $seoSource = isset($input['wr_seo_title']) && trim((string) $input['wr_seo_title']) !== ''
            ? trim((string) $input['wr_seo_title'])
            : (isset($input['wr_subject']) ? (string) $input['wr_subject'] : (string) $post['wr_subject']);
        $input['wr_seo_title'] = exist_seo_title_recursive(
            'bbs',
            generate_seo_title($seoSource),
            $write_table,
            $wr_id
        );
    }

    if (isset($input['wr_link1'])) {
        $input['wr_link1'] = api_safe_board_link($input['wr_link1']);
    }
    if (isset($input['wr_link2'])) {
        $input['wr_link2'] = api_safe_board_link($input['wr_link2']);
    }
    if (isset($input['wr_option'])) {
        $adminRole = Auth::adminRole($member, $bo_table);
        $allowedOptions = array('secret', 'html1', 'html2');
        $requestedOptions = is_array($input['wr_option'])
            ? $input['wr_option']
            : explode(',', (string) $input['wr_option']);
        $options = array();
        foreach ($requestedOptions as $option) {
            $option = trim((string) $option);
            if (in_array($option, $allowedOptions, true) && !in_array($option, $options, true)) {
                $options[] = $option;
            }
        }
        if ($adminRole === '' && (int) ($board['bo_use_secret'] ?? 0) === 0 && in_array('secret', $options, true)) {
            Response::error('Secret posts are not enabled in this board.', 403);
        }
        if ($adminRole === '' && (int) ($board['bo_use_secret'] ?? 0) === 2 && !in_array('secret', $options, true)) {
            $options[] = 'secret';
        }
        $input['wr_option'] = implode(',', $options);
    }

    // Build SET clause with only allowed fields using parameterized bindings
    $setClauses = [];
    $params     = [];
    $allowedFields = [
        'wr_subject', 'wr_content', 'wr_seo_title', 'ca_name',
        'wr_option', 'wr_link1', 'wr_link2',
    ];

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $setClauses[] = "{$field} = ?";
            $params[]     = $input[$field];
        }
    }

    if (empty($setClauses)) {
        Response::error('No valid fields provided for update.', 422);
    }

    // Add last modified timestamp
    $now = date('Y-m-d H:i:s');
    $setClauses[] = "wr_last = ?";
    $params[]     = $now;

    // Add wr_id for WHERE clause
    $params[] = $wr_id;

    $setStr = implode(', ', $setClauses);
    DB::execute("UPDATE {$write_table} SET {$setStr} WHERE wr_id = ?", $params);

    // Return updated post
    $updatedPost = DB::fetch(
        "SELECT * FROM {$write_table} WHERE wr_id = ? LIMIT 1",
        [$wr_id]
    );
    unset($updatedPost['wr_password'], $updatedPost['wr_ip']);
    $updatedPost['wr_email'] = '';
    $updatedPost['wr_content'] = api_rewrite_editor_image_urls($updatedPost['wr_content'] ?? '');

    Response::success($updatedPost);
}

// -------------------------------------------------------------------------
// DELETE /v1/posts/{bo_table}/{wr_id} - Delete post
// -------------------------------------------------------------------------
if (!$action && $apiMethod === 'DELETE') {

    $member = Auth::requireAuth();

    // Fetch existing post
    $post = DB::fetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0
         LIMIT 1",
        [$wr_id]
    );

    if (!$post || !$post['wr_id']) {
        Response::error('Post not found.', 404);
    }

    // 그누보드 표준 권한: 본인 OR cf_admin / gr_admin / bo_admin 중 하나
    if (!Auth::canManagePost($member, $bo_table, $post)) {
        Response::error('You do not have permission to delete this post.', 403);
    }

    // 지울 댓글 수. 코어 delete.php 처럼 게시판 댓글 수(bo_count_comment)에서도 뺀다.
    $commentCountRow = DB::fetch(
        "SELECT COUNT(*) AS cnt FROM {$write_table}
         WHERE wr_parent = ? AND wr_is_comment = 1",
        [$wr_id]
    );
    $deletedComments = (int) ($commentCountRow['cnt'] ?? 0);

    // Delete comments belonging to this post
    DB::execute(
        "DELETE FROM {$write_table}
         WHERE wr_parent = ? AND wr_is_comment = 1",
        [$wr_id]
    );

    // Delete file records
    DB::execute(
        "DELETE FROM " . DB::table('board_file_table') . "
         WHERE bo_table = ?
           AND wr_id = ?",
        [$bo_table, $wr_id]
    );

    // Delete good/nogood records
    DB::execute(
        "DELETE FROM " . DB::table('board_good_table') . "
         WHERE bo_table = ?
           AND wr_id = ?",
        [$bo_table, $wr_id]
    );

    // Delete the post itself
    DB::execute("DELETE FROM {$write_table} WHERE wr_id = ?", [$wr_id]);

    // Update board write / comment counts
    DB::execute(
        "UPDATE " . DB::table('board_table') . "
         SET bo_count_write = GREATEST(bo_count_write - 1, 0),
             bo_count_comment = GREATEST(bo_count_comment - ?, 0)
         WHERE bo_table = ?",
        [$deletedComments, $bo_table]
    );

    // Delete from board_new table
    DB::execute(
        "DELETE FROM " . DB::table('board_new_table') . "
         WHERE bo_table = ?
           AND wr_id = ?",
        [$bo_table, $wr_id]
    );

    // 공지였다면 게시판 공지 목록(bo_notice)에서도 뺀다(그누보드 delete.php 의 board_notice 와 같음).
    $noticeRow = DB::fetch("SELECT bo_notice FROM " . DB::table('board_table') . " WHERE bo_table = ?", [$bo_table]);
    $noticeIds = array_filter(explode(',', (string) ($noticeRow['bo_notice'] ?? '')), 'strlen');
    if (in_array((string) $wr_id, $noticeIds, true)) {
        DB::execute(
            "UPDATE " . DB::table('board_table') . " SET bo_notice = ? WHERE bo_table = ?",
            [implode(',', array_diff($noticeIds, [(string) $wr_id])), $bo_table]
        );
    }

    Response::noContent();
}

// -------------------------------------------------------------------------
// POST /v1/posts/{bo_table}/{wr_id}/good|nogood - Recommend or not recommend post
// -------------------------------------------------------------------------
if (($action === 'good' || $action === 'nogood') && $apiMethod === 'POST') {

    $member = Auth::requireAuth();
    $flag = $action;
    $countColumn = $flag === 'good' ? 'wr_good' : 'wr_nogood';

    // Fetch existing post
    $post = DB::fetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0
         LIMIT 1",
        [$wr_id]
    );

    if (!$post || !$post['wr_id']) {
        Response::error('Post not found.', 404);
    }

    if ((string) ($post['wr_10'] ?? '') === 'report_hidden'
        && !Auth::canManagePost($member, $bo_table, $post)) {
        Response::error('Post not found.', 404);
    }

    if (!api_can_read_board_post($member, $bo_table, $board, $post)) {
        Response::error('You do not have permission to recommend this post.', 403);
    }

    if (api_is_blocked_author(
        $member,
        (string) ($post['mb_id'] ?? ''),
        (string) ($post['wr_name'] ?? '')
    ) && !Auth::canManagePost($member, $bo_table, $post)) {
        Response::error('Post not found.', 404);
    }

    $viewSessionName = 'ss_view_' . $bo_table . '_' . $wr_id;
    if (function_exists('get_session') && !get_session($viewSessionName)) {
        Response::error('You can recommend this post only after reading it.', 403);
    }

    // Cannot recommend own post
    if ($post['mb_id'] === $member['mb_id']) {
        Response::error('You cannot recommend or not recommend your own post.', 422);
    }

    if ($flag === 'good' && (int) ($board['bo_use_good'] ?? 0) !== 1) {
        Response::error('This board does not allow recommendations.', 403);
    }

    if ($flag === 'nogood' && (int) ($board['bo_use_nogood'] ?? 0) !== 1) {
        Response::error('This board does not allow not recommendations.', 403);
    }

    // Gnuboard allows only one good/nogood record per member and post.
    $existing = DB::fetch(
        "SELECT bg_id, bg_flag FROM " . DB::table('board_good_table') . "
         WHERE bo_table = ?
           AND wr_id    = ?
           AND mb_id    = ?
           AND bg_flag  IN ('good', 'nogood')
         LIMIT 1",
        [$bo_table, $wr_id, $member['mb_id']]
    );

    if ($existing && $existing['bg_id']) {
        Response::error('You have already recommended or not recommended this post.', 409);
    }

    $now = date('Y-m-d H:i:s');
    $affected = DB::execute(
        "INSERT IGNORE INTO " . DB::table('board_good_table') . "
         (bo_table, wr_id, mb_id, bg_flag, bg_datetime)
         VALUES (?, ?, ?, ?, ?)",
        [$bo_table, $wr_id, $member['mb_id'], $flag, $now]
    );

    if ($affected <= 0) {
        Response::error('You have already recommended or not recommended this post.', 409);
    }

    DB::execute(
        "UPDATE {$write_table}
         SET {$countColumn} = {$countColumn} + 1
         WHERE wr_id = ?",
        [$wr_id]
    );

    $updated = DB::fetch("SELECT wr_good, wr_nogood FROM {$write_table} WHERE wr_id = ?", [$wr_id]);

    Response::success([
        'wr_id'     => $wr_id,
        'flag'      => $flag,
        'wr_good'   => (int) $updated['wr_good'],
        'wr_nogood' => (int) $updated['wr_nogood'],
        'message'   => $flag === 'good'
            ? 'Post recommended successfully.'
            : 'Post not recommended successfully.',
    ]);
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Not found.', 404);
