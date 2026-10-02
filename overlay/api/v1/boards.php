<?php
/**
 * Gnuboard5 REST API - Board Endpoints
 *
 * Routes handled (prefix: v1/boards):
 *   GET    /v1/boards                      - List all boards
 *   GET    /v1/boards/{bo_table}           - Get single board info
 *   GET    /v1/boards/{bo_table}/posts     - List posts in a board
 *   POST   /v1/boards/{bo_table}/posts     - Create new post (auth required)
 *                                              body.reply_to = 원글 wr_id 면 답글(w=r)로 만든다
 */

if (!defined('_GNUBOARD_')) exit;

$bo_table    = isset($apiSegments[0]) ? api_sanitize_bo_table($apiSegments[0]) : '';
$subResource = isset($apiSegments[1]) ? $apiSegments[1] : '';
$thirdSeg    = isset($apiSegments[2]) ? $apiSegments[2] : '';

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

// File reconciliation endpoint: /v1/boards/{bo_table}/{wr_id}/files
// Delegated to a dedicated handler because of multipart/form-data + reconcile logic.
if ($bo_table && ctype_digit((string) $subResource) && $thirdSeg === 'files') {
    $wr_id = (int) $subResource;
    require __DIR__ . '/post-files.php';
    exit;
}

// -------------------------------------------------------------------------
// GET /v1/boards - List all boards
// -------------------------------------------------------------------------
if (!$bo_table && $apiMethod === 'GET') {

    $conditions = ["1=1"];
    $params     = [];

    // Filter by group
    if (isset($_GET['group']) && $_GET['group'] !== '') {
        $conditions[] = "a.gr_id = ?";
        $params[]     = $_GET['group'];
    }

    $where = "WHERE " . implode(" AND ", $conditions);

    $sql = "SELECT a.bo_table, a.gr_id, a.bo_subject, a.bo_skin, a.bo_mobile_skin,
                   a.bo_read_point, a.bo_write_point, a.bo_comment_point,
                   a.bo_download_point, a.bo_use_category, a.bo_category_list,
                   a.bo_write_min, a.bo_write_max, a.bo_comment_min, a.bo_comment_max,
                   a.bo_notice, a.bo_upload_count, a.bo_upload_size,
                   a.bo_count_write, a.bo_count_comment
            FROM " . DB::table('board_table') . " a
            {$where}
            ORDER BY a.gr_id, a.bo_table";

    // read-only — replica 라우팅 가능 (설정돼있을 때만)
    $boards = DB::readFetchAll($sql, $params);

    Response::success($boards);
}

// -------------------------------------------------------------------------
// GET /v1/boards/{bo_table} - Get single board info
// -------------------------------------------------------------------------
if ($bo_table && !$subResource && $apiMethod === 'GET') {

    $board = api_get_board($bo_table);
    if (!$board) {
        Response::error('Board not found.', 404);
    }

    // 분류별 글 수. 목록 화면의 분류 칩이 "이 갈래에 몇 개가 있는지" 를 함께
    // 보여 줄 수 있도록 한 번의 GROUP BY 로 세어 붙인다. 분류를 쓰지 않는
    // 게시판에는 넣지 않는다.
    if ((int) ($board['bo_use_category'] ?? 0) === 1) {
        $writeTable = DB::writeTable($bo_table);
        $counts = [];

        try {
            $rows = DB::readFetchAll(
                "SELECT ca_name, COUNT(*) AS cnt
                 FROM {$writeTable}
                 WHERE wr_is_comment = 0 AND ca_name <> ''
                 GROUP BY ca_name"
            );
            foreach ($rows as $row) {
                $counts[(string) $row['ca_name']] = (int) $row['cnt'];
            }
        } catch (Throwable $e) {
            // 글 테이블이 아직 없거나 조회에 실패해도 게시판 정보는 내보낸다.
            $counts = [];
        }

        $board['category_counts'] = (object) $counts;
    }

    Response::success($board);
}

// -------------------------------------------------------------------------
// GET /v1/boards/{bo_table}/posts - List posts in a board
// -------------------------------------------------------------------------
if ($bo_table && $subResource === 'posts' && $apiMethod === 'GET') {

    $board = api_get_board($bo_table);
    if (!$board) {
        Response::error('Board not found.', 404);
    }

    $viewer = Auth::getUser();
    if (!api_can_access_board_list($viewer, $bo_table, $board)) {
        Response::error('You do not have permission to list this board.', 403);
    }

    $write_table = DB::writeTable($bo_table);

    // Pagination
    $page    = get_page_param(1);
    $perPage = get_per_page_param(15, 100);
    $offset  = ($page - 1) * $perPage;

    // Search filters
    $conditions = ["wr_is_comment = 0", "(wr_10 IS NULL OR wr_10 <> 'report_hidden')"];
    $params     = [];
    api_add_blocked_author_condition($conditions, $params, $viewer);

    // Category filter
    if (isset($_GET['sca']) && $_GET['sca'] !== '') {
        $conditions[] = "ca_name = ?";
        $params[]     = $_GET['sca'];
    }

    // Search field + keyword
    if (isset($_GET['stx']) && $_GET['stx'] !== '') {
        $stx = $_GET['stx'];
        $sfl = isset($_GET['sfl']) ? $_GET['sfl'] : 'wr_subject';

        // Allow only safe column names for search
        $allowedFields = ['wr_subject', 'wr_content', 'wr_name', 'mb_id'];
        if (in_array($sfl, $allowedFields, true)) {
            $conditions[] = "{$sfl} LIKE ?";
            $params[]     = '%' . $stx . '%';
        } elseif ($sfl === 'wr_subject||wr_content') {
            $conditions[] = "(wr_subject LIKE ? OR wr_content LIKE ?)";
            $params[]     = '%' . $stx . '%';
            $params[]     = '%' . $stx . '%';
        } else {
            $conditions[] = "wr_subject LIKE ?";
            $params[]     = '%' . $stx . '%';
        }
    }

    // Sorting
    $sst = 'wr_num, wr_reply';
    $sod = 'ASC';

    if (isset($_GET['sst']) && $_GET['sst'] !== '') {
        $allowedSort = ['wr_num', 'wr_reply', 'wr_datetime', 'wr_hit', 'wr_good', 'wr_comment', 'wr_subject'];
        $sortParts = explode(',', $_GET['sst']);
        $validSorts = [];
        foreach ($sortParts as $sp) {
            $sp = trim($sp);
            if (in_array($sp, $allowedSort, true)) {
                $validSorts[] = $sp;
            }
        }
        if ($validSorts) {
            $sst = implode(', ', $validSorts);
        }
    }

    if (isset($_GET['sod']) && strtolower($_GET['sod']) === 'desc') {
        $sod = 'DESC';
    }

    $where = "WHERE " . implode(" AND ", $conditions);

    // Count from the write table because report-hidden posts must not inflate totals.
    $sqlCount     = "SELECT COUNT(*) FROM {$write_table} {$where}";
    $totalDisplay = DB::readCount($sqlCount, $params);

    // Notice posts (stored as comma-separated wr_id in bo_notice)
    $noticeIds = [];
    if (!empty($board['bo_notice'])) {
        $noticeIds = array_map('trim', explode(',', $board['bo_notice']));
        $noticeIds = array_filter($noticeIds, function($v) { return $v !== ''; });
    }

    if (!function_exists('api_post_excerpt')) {
        /**
         * 목록 카드(갤러리)에 깔 두 줄 발췌. 목록 질의가 이미 wr_content 를 들고 오므로
         * 따로 묻지 않고, 본문 HTML 에서 태그만 걷은 평문을 $len 자로 자른다.
         * <br> · </p> 는 공백으로 바꿔야 앞뒤 문장이 붙지 않는다.
         */
        function api_post_excerpt($content, $len = 70)
        {
            $text = preg_replace('#<(br\s*/?|/p|/div|/li|/h[1-6])>#i', ' ', (string) $content);
            $text = preg_replace('/\{(이미지|동영상)\s*:\s*\d+\}/u', ' ', $text);
            $text = html_entity_decode(strip_tags($text), ENT_QUOTES, 'UTF-8');
            $text = trim(preg_replace('/\s+/u', ' ', $text));
            if ($text === '') {
                return '';
            }
            return mb_strlen($text, 'UTF-8') > $len ? mb_substr($text, 0, $len, 'UTF-8') . '…' : $text;
        }
    }

    $memberTable    = DB::table('member_table');
    $boardFileTable = DB::table('board_file_table');

    /**
     * 게시글 row 묶음을 받아 한 번에 enrich.
     * 기존 N+1: 글 15건 → mb_nick 15회 + thumbnail 15회 = 30 round-trip.
     * 새 방식: WHERE mb_id IN (...) 1회 + WHERE (bo_table, wr_id) IN (...) 1회 = 2 round-trip.
     */
    // 목록 썸네일 크기 — 그누보드 갤러리 목록과 같은 게시판 갤러리 크기 · 자르기(2배 밀도, lib/image-variants.php).
    $listThumbSize = api_image_board_list_size($board);
    // 본문 발췌(wr_excerpt)는 글을 읽을 수 있는 사람에게만 낸다 — 목록 보기 권한만으로 본문 일부가 보이면 안 된다.
    // 읽을 때 포인트를 깎는 게시판(bo_read_point < 0)도 발췌로 본문을 공짜로 보이지 않게 뺀다.
    $canExcerpt = api_can_read_board($viewer, $bo_table, $board) && (int) ($board['bo_read_point'] ?? 0) >= 0;

    $enrichPosts = function(array $posts, bool $isNotice) use ($bo_table, $memberTable, $boardFileTable, $listThumbSize, $canExcerpt): array {
        if (!$posts) return [];

        // 1) mb_id 들 모아 한 번에 mb_nick 조회
        $mbIds = [];
        foreach ($posts as $p) {
            if (!empty($p['mb_id'])) $mbIds[$p['mb_id']] = true;
        }
        $nickByMb = [];
        if ($mbIds) {
            $ids = array_keys($mbIds);
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $rows = DB::readFetchAll(
                "SELECT mb_id, mb_nick FROM {$memberTable} WHERE mb_id IN ({$ph})",
                $ids
            );
            foreach ($rows as $r) {
                $nickByMb[$r['mb_id']] = $r['mb_nick'];
            }
        }

        // 2) 첨부 thumbnail 한 번에 조회 — (bo_table, wr_id) IN ((b,1),(b,2)…)
        //    MySQL 의 row-IN syntax: WHERE (col1, col2) IN ((?,?),(?,?), …)
        $wrIds = array_map(static fn($p) => (int) $p['wr_id'], $posts);
        $thumbByWr = [];
        if ($wrIds) {
            $ph = implode(',', array_fill(0, count($wrIds), '?'));
            // 같은 글에 여러 첨부 → bf_no ASC 첫 번째만 효과. GROUP BY + MIN 으로 1회 쿼리.
            $rows = DB::readFetchAll(
                "SELECT wr_id, SUBSTRING_INDEX(
                    GROUP_CONCAT(bf_file ORDER BY bf_no ASC SEPARATOR '||'),
                    '||', 1
                ) AS bf_file,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(bf_no ORDER BY bf_no ASC SEPARATOR '||'),
                    '||', 1
                ) AS bf_no,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(bf_fileurl ORDER BY bf_no ASC SEPARATOR '||'),
                    '||', 1
                ) AS bf_fileurl,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(bf_thumburl ORDER BY bf_no ASC SEPARATOR '||'),
                    '||', 1
                ) AS bf_thumburl
                 FROM {$boardFileTable}
                 WHERE bo_table = ? AND bf_type IN (2, 3) AND wr_id IN ({$ph})
                 GROUP BY wr_id",
                array_merge([$bo_table], $wrIds)
            );
            foreach ($rows as $r) {
                if (!empty($r['bf_file'])) {
                    $fileName = ltrim(str_replace('\\', '/', $r['bf_file']), '/');
                    // 목록 썸네일은 작은 칸에 들어간다. 원본을 그대로 내보내면 갤러리
                    // 한 화면이 수 MB 가 된다(실측 여덟 장 2.4MB). 줄인 사본을 가리킨다.
                    // 로컬에 없으면 외부 저장소 주소(bf_thumburl · bf_fileurl), 그것도 없으면 썸네일 없음.
                    $thumbUrl = api_board_file_url(
                        $bo_table,
                        (int) $r['wr_id'],
                        (int) $r['bf_no'],
                        $fileName,
                        $listThumbSize[0],
                        $listThumbSize[1],
                        $r,
                        true
                    );
                    if ($thumbUrl !== '') {
                        $thumbByWr[(int) $r['wr_id']] = $thumbUrl;
                    }
                }
            }
        }

        // 3) post 별 enrich (인-메모리만)
        $out = [];
        foreach ($posts as $post) {
            $post['is_notice'] = $isNotice;
            $post['is_secret'] = api_is_secret_option($post['wr_option']);
            $post = array_merge($post, api_member_media_urls($post['mb_id']));
            $post['mb_nick'] = $post['mb_id'] && isset($nickByMb[$post['mb_id']])
                ? $nickByMb[$post['mb_id']]
                : $post['wr_name'];

            $post['thumbnail'] = $post['is_secret'] ? '' : ($thumbByWr[(int) $post['wr_id']] ?? '');
            // 첨부 사진이 없으면 본문의 첫 사진(그누보드 get_list_thumbnail 과 같다). 비밀글은 내지 않는다.
            if ($post['thumbnail'] === '' && !$post['is_secret']) {
                $post['thumbnail'] = api_editor_first_image_url($post['wr_content'] ?? '', $listThumbSize[0], $listThumbSize[1]);
            }
            $post['wr_excerpt'] = ($canExcerpt && !$post['is_secret']) ? api_post_excerpt($post['wr_content'] ?? '') : '';
            unset($post['wr_content'], $post['wr_ip']);
            $out[] = $post;
        }
        return $out;
    };

    // Fetch notice posts separately. Include them only on the first page so
    // infinite-scroll clients do not receive duplicate notice rows.
    $noticePosts = [];
    if ($noticeIds && $page === 1) {
        $placeholders = implode(',', array_fill(0, count($noticeIds), '?'));
        $noticeConditions = [
            "wr_id IN ({$placeholders})",
            "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
        ];
        $noticeParams = array_values($noticeIds);
        api_add_blocked_author_condition($noticeConditions, $noticeParams, $viewer);
        $noticeWhere = "WHERE " . implode(" AND ", $noticeConditions);

        $noticeSql = "SELECT wr_id, wr_num, wr_reply, wr_subject, wr_seo_title, wr_name, mb_id,
                             wr_datetime, wr_hit, wr_good, wr_nogood, wr_comment,
                             wr_option, ca_name, wr_link1, wr_link2, wr_ip, wr_content
                       FROM {$write_table}
                       {$noticeWhere}
                      ORDER BY FIELD(wr_id, {$placeholders})";
        $noticeParams = array_merge($noticeParams, array_values($noticeIds));
        $noticeRows = DB::readFetchAll($noticeSql, $noticeParams);
        $noticePosts = $enrichPosts($noticeRows, true);
    }

    // Fetch regular posts (exclude notice posts)
    $postParams = $params;
    if ($noticeIds) {
        $placeholders = implode(',', array_fill(0, count($noticeIds), '?'));
        $conditions[] = "wr_id NOT IN ({$placeholders})";
        $postParams = array_merge($postParams, array_values($noticeIds));
        $where = "WHERE " . implode(" AND ", $conditions);

        // Recalculate for pagination (excluding notices)
        $sqlCount      = "SELECT COUNT(*) FROM {$write_table} {$where}";
        $regularCount  = DB::readCount($sqlCount, $postParams);
    }

    $postParams[] = $offset;
    $postParams[] = $perPage;

    $sql = "SELECT wr_id, wr_num, wr_reply, wr_subject, wr_seo_title, wr_name, mb_id,
                   wr_datetime, wr_hit, wr_good, wr_nogood, wr_comment,
                   wr_option, ca_name, wr_link1, wr_link2, wr_ip, wr_content
            FROM {$write_table}
            {$where}
            ORDER BY {$sst} {$sod}
            LIMIT ?, ?";

    $rows  = DB::readFetchAll($sql, $postParams);
    $regularPosts = $enrichPosts($rows, false);

    // Combine: notices first, then regular posts
    $posts = array_merge($noticePosts, $regularPosts);

    // Use regularCount for pagination, totalDisplay for total count
    $paginationCount = isset($regularCount) ? $regularCount : ($totalDisplay - count($noticePosts));
    Response::paginated($posts, $totalDisplay, $page, $perPage, 200, $paginationCount);
}

// -------------------------------------------------------------------------
// POST /v1/boards/{bo_table}/posts - Create new post
// -------------------------------------------------------------------------
if ($bo_table && $subResource === 'posts' && $apiMethod === 'POST') {

    $member = Auth::requireAuth();

    $board = api_get_board($bo_table);
    if (!$board) {
        Response::error('Board not found.', 404);
    }

    $adminRole = Auth::adminRole($member, $bo_table);

    // Check original Gnuboard write gates: level, group access, and board cert mode.
    if (!api_can_write_board_post($member, $bo_table, $board)) {
        Response::error('You do not have permission to write in this board.', 403);
    }

    $input = get_request_body();

    // Validate required fields
    $errors = Validator::validate([
        'wr_subject' => 'required|max:255',
        'wr_content' => 'required',
    ], $input);

    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $write_table = DB::writeTable($bo_table);

    // 어드민은 anti-spam 우회. 일반 회원만 throttle 체크.
    if ($adminRole === '') {
        $throttleMsg = Throttle::checkPostCreate($write_table, (string) $member['mb_id']);
        if ($throttleMsg !== null) {
            Response::error($throttleMsg, 429);
        }
    }

    $writePoint = (int) ($board['bo_write_point'] ?? 0);
    $memberPoint = (int) ($member['mb_point'] ?? 0);
    $availablePoint = $memberPoint > 0 ? $memberPoint : 0;
    if ($adminRole === '' && $availablePoint + $writePoint < 0) {
        Response::error('Not enough points to write in this board.', 403);
    }

    // 답글(reply_to): 그누보드 bbs/write_update.php 의 w=r 과 같은 규칙.
    //   - bo_reply_level 이상이어야 하고, wr_reply 는 최대 10글자(깊이 10),
    //   - 같은 wr_num 묶음 안에서 bo_reply_order 에 따라 A→Z 또는 Z→A 로 다음 글자를 고른다,
    //   - 원글이 비밀글이면 답글도 비밀글.
    $replyTo = isset($input['reply_to']) ? (int) $input['reply_to'] : 0;
    $replyParent = null;
    $wrReply = '';
    if ($replyTo > 0) {
        $replyParent = DB::fetch(
            "SELECT wr_id, wr_num, wr_reply, wr_subject, wr_option, mb_id FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = 0",
            [$replyTo]
        );
        if (!$replyParent) {
            Response::error('Post to reply to was not found.', 404);
        }
        if ($adminRole === '' && (int) ($member['mb_level'] ?? 0) < (int) ($board['bo_reply_level'] ?? 1)) {
            Response::error('You do not have permission to reply in this board.', 403);
        }
        if (strlen((string) $replyParent['wr_reply']) >= 10) {
            Response::error('This thread cannot take any more replies.', 400);
        }
        $replyLen = strlen((string) $replyParent['wr_reply']) + 1;
        $ascending = (int) ($board['bo_reply_order'] ?? 0) === 1;
        $agg = $ascending ? 'MAX' : 'MIN';
        $row = DB::fetch(
            "SELECT {$agg}(SUBSTRING(wr_reply, {$replyLen}, 1)) AS reply FROM {$write_table}
              WHERE wr_num = ? AND SUBSTRING(wr_reply, {$replyLen}, 1) <> '' AND wr_reply LIKE ?",
            [(int) $replyParent['wr_num'], (string) $replyParent['wr_reply'] . '%']
        );
        $last = $row && $row['reply'] !== null ? (string) $row['reply'] : '';
        if ($last === '') {
            $replyChar = $ascending ? 'A' : 'Z';
        } elseif ($last === ($ascending ? 'Z' : 'A')) {
            Response::error('This thread cannot take any more replies.', 400);
        } else {
            $replyChar = chr(ord($last) + ($ascending ? 1 : -1));
        }
        $wrReply = (string) $replyParent['wr_reply'] . $replyChar;
    }

    // Get next wr_num (negative, descending for newest-first ordering); a reply shares the parent's wr_num.
    if ($replyParent) {
        $wrNum = (int) $replyParent['wr_num'];
    } else {
        $numRow = DB::fetch("SELECT MIN(wr_num) - 1 AS next_num FROM {$write_table}");
        $wrNum  = isset($numRow['next_num']) && $numRow['next_num'] ? (int) $numRow['next_num'] : -1;
    }

    // Prepare fields
    $wr_subject   = $input['wr_subject'];
    $wr_content   = $input['wr_content'];
    $wr_seo_source = isset($input['wr_seo_title']) && trim((string) $input['wr_seo_title']) !== ''
        ? trim((string) $input['wr_seo_title'])
        : $wr_subject;
    $wr_seo_title = exist_seo_title_recursive(
        'bbs',
        generate_seo_title($wr_seo_source),
        $write_table,
        0
    );
    $ca_name      = isset($input['ca_name']) ? $input['ca_name'] : '';
    $wr_link1     = isset($input['wr_link1']) ? api_safe_board_link($input['wr_link1']) : '';
    $wr_link2     = isset($input['wr_link2']) ? api_safe_board_link($input['wr_link2']) : '';

    // Options (secret, html)
    $options = [];
    if (isset($input['wr_option'])) {
        $allowedOptions = ['secret', 'html1', 'html2'];
        if (is_array($input['wr_option'])) {
            foreach ($input['wr_option'] as $option) {
                if (in_array($option, $allowedOptions, true) && !in_array($option, $options, true)) {
                    $options[] = $option;
                }
            }
        } else {
            // Validate single option value against allowed list
            if (in_array($input['wr_option'], $allowedOptions, true)) {
                $options[] = $input['wr_option'];
            }
        }
    }
    if ($adminRole === '' && (int) ($board['bo_use_secret'] ?? 0) === 0 && in_array('secret', $options, true)) {
        Response::error('Secret posts are not enabled in this board.', 403);
    }
    if ($adminRole === '' && (int) ($board['bo_use_secret'] ?? 0) === 2 && !in_array('secret', $options, true)) {
        $options[] = 'secret';
    }
    if ($replyParent && api_is_secret_option($replyParent['wr_option']) && !in_array('secret', $options, true)) {
        $options[] = 'secret'; // 비밀글의 답글은 비밀글
    }
    $wr_option = implode(',', $options);

    // 그누보드 훅(bbs/write_update.php 와 같은 인자) — 새 글은 $w = '', 답글은 $w = 'r'($wr_id 는 원글).
    // $qstr(목록 쿼리)과 이동 주소는 API 에 없으므로 빈 값.
    $hookW = $replyParent ? 'r' : '';
    api_run_before_event('write_update_before', array($board, $replyParent ? (int) $replyParent['wr_id'] : 0, $hookW, ''), $member);

    $now = date('Y-m-d H:i:s');
    $ip  = $_SERVER['REMOTE_ADDR'];

    $sql = "INSERT INTO {$write_table} SET
            wr_num         = ?,
            wr_reply       = ?,
            wr_parent      = 0,
            wr_is_comment  = 0,
            wr_comment_reply = '',
            wr_subject     = ?,
            wr_content     = ?,
            wr_seo_title   = ?,
            ca_name        = ?,
            wr_option      = ?,
            wr_link1       = ?,
            wr_link2       = ?,
            wr_hit         = 0,
            wr_good        = 0,
            wr_nogood      = 0,
            wr_comment     = 0,
            mb_id          = ?,
            wr_name        = ?,
            wr_password    = ?,
            wr_email       = ?,
            wr_homepage    = '',
            wr_datetime    = ?,
            wr_last        = ?,
            wr_ip          = ?,
            wr_facebook_user = '',
            wr_twitter_user  = '',
            wr_1 = '', wr_2 = '', wr_3 = '', wr_4 = '', wr_5 = '',
            wr_6 = '', wr_7 = '', wr_8 = '', wr_9 = '', wr_10 = ''";

    DB::execute($sql, [
        $wrNum,
        $wrReply,
        $wr_subject,
        $wr_content,
        $wr_seo_title,
        $ca_name,
        $wr_option,
        $wr_link1,
        $wr_link2,
        $member['mb_id'],
        $member['mb_nick'],
        '',
        $member['mb_email'],
        $now,
        $now,
        $ip,
    ]);

    // Get the inserted wr_id
    $wr_id = (int) DB::lastInsertId();

    // Update wr_parent to self (Gnuboard convention: top-level posts have wr_parent = wr_id)
    DB::execute(
        "UPDATE {$write_table} SET wr_parent = ? WHERE wr_id = ?",
        [$wr_id, $wr_id]
    );

    DB::execute(
        "INSERT INTO " . DB::table('board_new_table') . "
            (bo_table, wr_id, wr_parent, bn_datetime, mb_id)
         VALUES (?, ?, ?, ?, ?)",
        [$bo_table, $wr_id, $wr_id, $now, $member['mb_id']]
    );

    // Update board write count
    DB::execute(
        "UPDATE " . DB::table('board_table') . " SET bo_count_write = bo_count_write + 1 WHERE bo_table = ?",
        [$bo_table]
    );

    if (function_exists('insert_point')) {
        $writeLabel = json_decode('"\uAE00\uC4F0\uAE30"');
        $writeAction = json_decode('"\uC4F0\uAE30"');
        insert_point(
            $member['mb_id'],
            $writePoint,
            $board['bo_subject'] . ' ' . $wr_id . ' ' . $writeLabel,
            $bo_table,
            $wr_id,
            $writeAction
        );
    }

    if (api_is_secret_option($wr_option) && function_exists('set_session')) {
        set_session('ss_secret_' . $bo_table . '_' . $wrNum, true);
    }

    // 답글이면 원글 작성자에게 알림 (그누보드 화면의 write_update_after 이벤트와 같은 이벤트 이름).
    if ($replyParent && (string) $replyParent['mb_id'] !== '' && (string) $replyParent['mb_id'] !== (string) $member['mb_id']
        && class_exists('Notify')) {
        try {
            Notify::emit('reply.created', (string) $replyParent['mb_id'], '[' . $bo_table . '] 내 글에 답글',
                mb_substr(strip_tags((string) $wr_subject), 0, 80, 'UTF-8'), [
                    'bo_table' => $bo_table,
                    'wr_id'    => $wr_id,
                    'link'     => '/' . $bo_table . '/' . $wr_id,
                    'author'   => (string) $member['mb_nick'],
                    'reply_to' => (int) $replyParent['wr_id'],
                ]);
        } catch (\Throwable $e) {
            error_log('[api/boards] reply notify failed: ' . $e->getMessage());
        }
    }

    // 그누보드 latest() 위젯 캐시를 비운다(원본과 같이 훅 앞에서). 안의 delete_cache_latest 훅도 보호해서 부른다.
    api_call_core('delete_cache_latest', array($bo_table), $member);
    api_run_event('write_update_after', array($board, $wr_id, $hookW, '', ''), $member);

    // Fetch and return the created post
    $post = DB::fetch(
        "SELECT * FROM {$write_table} WHERE wr_id = ? LIMIT 1",
        [$wr_id]
    );

    // Remove sensitive fields
    unset($post['wr_password'], $post['wr_ip']);

    Response::success($post, 201);
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Not found.', 404);
