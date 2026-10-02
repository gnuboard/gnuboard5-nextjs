<?php
/**
 * Gnuboard5 REST API - Recent posts/comments across all boards
 *
 * Replicates the behavior of /bbs/new.php (전체 게시물).
 *
 * Routes:
 *   GET /v1/recent
 *     Query params:
 *       view  = 'w' (글만) | 'c' (댓글만) | '' (둘다)
 *       gr_id = 그룹 id로 필터
 *       mb_id = 작성자로 필터
 *       mb_key = 작성자 공개 키로 필터(사이드뷰 "최근 글" — 주소에 아이디를 남기지 않는다)
 *       page  = 1-based page (default 1)
 *       limit = 1..100 (default 20)
 *
 *   GET /v1/recent/groups
 *     그룹 목록 (필터 dropdown용)
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$action = $apiSegments[0] ?? '';

// -------------------------------------------------------------------------
// GET /v1/recent/groups - 그룹 목록 (필터 옵션용)
// -------------------------------------------------------------------------
if ($action === 'groups') {
    $groupTable = DB::table('group_table');
    $groups = DB::fetchAll(
        "SELECT gr_id, gr_subject FROM {$groupTable} ORDER BY gr_id"
    );
    Response::success($groups);
}

// -------------------------------------------------------------------------
// GET /v1/recent - 새글/새댓글 목록
// -------------------------------------------------------------------------
$view  = isset($_GET['view']) && in_array($_GET['view'], ['w', 'c'], true) ? $_GET['view'] : '';
$gr_id = isset($_GET['gr_id']) ? preg_replace('/[^a-z0-9_]/i', '', substr((string) $_GET['gr_id'], 0, 10)) : '';
$mb_id = isset($_GET['mb_id']) ? preg_replace('/[^a-z0-9_]/i', '', substr((string) $_GET['mb_id'], 0, 20)) : '';
if ($mb_id === '' && isset($_GET['mb_key']) && (string) $_GET['mb_key'] !== '') {
    require_once __DIR__ . '/../lib/member_key_helpers.php';
    // 모르는 키면 전체 목록이 아니라 빈 목록이어야 한다 — 아이디에 올 수 없는 '-' 로 걸러 아무 줄도 맞지 않게 한다.
    $mb_id = api_member_id_from_key((string) $_GET['mb_key']) ?: '-';
}
[$page, $limit, $offset] = api_page_params(20, 100, 'limit');

$boardNewTable = DB::table('board_new_table');
$boardTable    = DB::table('board_table');
$groupTable    = DB::table('group_table');
$viewer         = Auth::getUser();

require_once __DIR__ . '/recent_helpers.php'; // api_recent_comment_excerpt()

// gnuboard new.php와 동일하게 bo_use_search=1인 게시판만 포함
if (!function_exists('api_recent_fallback_from_write_tables')) {
    function api_recent_fallback_from_write_tables($view, $gr_id, $mb_id, $page, $limit)
    {
        $offset = ($page - 1) * $limit;
        $scanLimit = $offset + $limit;

        $boardTable = DB::table('board_table');
        $groupTable = DB::table('group_table');
        // g5_board_new 가 비었을 때만 쓰는 대체 경로 — 그래도 원본 bbs/new.php 처럼 검색 사용 게시판(bo_use_search = 1)만.
        // 검색을 끈 게시판(운영자가 목록 · 검색에서 숨긴 게시판)까지 넣으면 최근 글로 새어 나간다.
        $boardWhere = "WHERE b.gr_id = g.gr_id AND b.bo_use_search = 1";
        $boardParams = array();

        if ($gr_id !== '') {
            $boardWhere .= " AND b.gr_id = ?";
            $boardParams[] = $gr_id;
        }

        $boards = DB::fetchAll(
            "SELECT b.bo_table, b.bo_subject, b.bo_use_search, b.bo_read_level,
                    b.bo_count_write, b.bo_count_comment, g.gr_id, g.gr_subject
             FROM {$boardTable} b, {$groupTable} g
             {$boardWhere}
             ORDER BY b.gr_id, b.bo_table",
            $boardParams
        );

        $items = array();
        $total = 0;
        $viewer = Auth::getUser();

        foreach ($boards as $board) {
            $boTable = (string) $board['bo_table'];
            $writeTable = api_write_table($boTable);

            $checkResult = DB::getPdo()->query("SHOW TABLES LIKE '" . str_replace("'", "\\'", $writeTable) . "'");
            if (!$checkResult || !$checkResult->fetch()) {
                continue;
            }

            $conditions = array(
                "(w.wr_10 IS NULL OR w.wr_10 <> 'report_hidden')",
                "(p.wr_10 IS NULL OR p.wr_10 <> 'report_hidden')",
            );
            $params = array();

            if ($view === 'w') {
                $conditions[] = "w.wr_is_comment = 0";
            } elseif ($view === 'c') {
                $conditions[] = "w.wr_is_comment = 1";
            }

            if ($mb_id !== '') {
                $conditions[] = "w.mb_id = ?";
                $params[] = $mb_id;
            }

            api_add_blocked_author_condition($conditions, $params, $viewer, 'w');
            api_add_blocked_author_condition($conditions, $params, $viewer, 'p');
            $where = "WHERE " . implode(" AND ", $conditions);

            $total += (int) DB::count(
                "SELECT COUNT(*)
                   FROM {$writeTable} w
                   LEFT JOIN {$writeTable} p ON p.wr_id = w.wr_parent
                   {$where}",
                $params
            );

            $rows = DB::fetchAll(
                "SELECT
                    w.wr_id,
                    w.wr_parent,
                    w.wr_is_comment,
                    w.mb_id,
                    w.wr_name,
                    w.wr_datetime,
                    w.wr_option,
                    IF(w.wr_is_comment = 1, w.wr_content, '') AS wr_content,
                    p.wr_option AS parent_option,
                    p.wr_subject AS parent_subject,
                    p.wr_seo_title AS parent_seo_title
                 FROM {$writeTable} w
                 LEFT JOIN {$writeTable} p ON p.wr_id = w.wr_parent
                 {$where}
                 ORDER BY w.wr_datetime DESC, w.wr_id DESC
                 LIMIT {$scanLimit}",
                $params
            );

            foreach ($rows as $row) {
                $isComment = (int) $row['wr_is_comment'] === 1;
                $parentSubject = isset($row['parent_subject']) ? (string) $row['parent_subject'] : '';
                if ($parentSubject === '') {
                    continue;
                }

                $items[] = array(
                    'bn_id'        => 0,
                    'gr_id'        => $board['gr_id'],
                    'gr_subject'   => $board['gr_subject'],
                    'bo_table'     => $boTable,
                    'bo_subject'   => $board['bo_subject'],
                    'wr_id'        => (int) $row['wr_id'],
                    'wr_parent'    => (int) $row['wr_parent'],
                    'wr_subject'   => $parentSubject,
                    'wr_seo_title' => isset($row['parent_seo_title']) ? (string) $row['parent_seo_title'] : '',
                    'is_comment'   => $isComment,
                    'comment_excerpt' => $isComment
                        ? api_recent_comment_excerpt(
                            $row,
                            array('wr_option' => $row['parent_option'] ?? ''),
                            (int) ($board['bo_read_level'] ?? 1),
                            $viewer,
                            (string) $board['bo_table']
                        )
                        : null,
                    'mb_id'        => $row['mb_id'],
                    'wr_name'      => $row['wr_name'],
                    'wr_email'     => '',
                    'wr_homepage'  => '',
                    'wr_datetime'  => $row['wr_datetime'],
                    'bn_datetime'  => $row['wr_datetime'],
                    'href'         => api_board_post_href(
                        $boTable,
                        (int) $row['wr_parent'],
                        isset($row['parent_seo_title']) ? $row['parent_seo_title'] : '',
                        $isComment ? '#c_' . (int) $row['wr_id'] : ''
                    ),
                );
            }
        }

        usort($items, function ($a, $b) {
            $dateCompare = strcmp((string) $b['wr_datetime'], (string) $a['wr_datetime']);
            if ($dateCompare !== 0) {
                return $dateCompare;
            }

            return (int) $b['wr_id'] <=> (int) $a['wr_id'];
        });

        $items = array_slice($items, $offset, $limit);
        foreach ($items as $index => &$item) {
            $item['bn_id'] = -1 * ($offset + $index + 1);
        }
        unset($item);

        return array($items, $total);
    }
}

$where  = " WHERE a.bo_table = b.bo_table AND b.gr_id = c.gr_id AND b.bo_use_search = 1 ";
$params = [];

if ($view === 'w') {
    $where .= " AND a.wr_id = a.wr_parent ";
} elseif ($view === 'c') {
    $where .= " AND a.wr_id <> a.wr_parent ";
}

if ($gr_id !== '') {
    $where .= " AND b.gr_id = ? ";
    $params[] = $gr_id;
}

if ($mb_id !== '') {
    $where .= " AND a.mb_id = ? ";
    $params[] = $mb_id;
}

// Count
$total = (int) DB::count(
    "SELECT COUNT(*) FROM {$boardNewTable} a, {$boardTable} b, {$groupTable} c {$where}",
    $params
);

// Page rows
$newRows = DB::fetchAll(
    "SELECT a.bn_id, a.bo_table, a.wr_id, a.wr_parent, a.mb_id AS bn_mb_id, a.bn_datetime,
            b.bo_subject, b.bo_read_level, c.gr_id, c.gr_subject
     FROM {$boardNewTable} a, {$boardTable} b, {$groupTable} c
     {$where}
     ORDER BY a.bn_id DESC
     LIMIT {$limit} OFFSET {$offset}",
    $params
);

// 그누보드 write 테이블은 게시판별로 분리되어 있어 단일 JOIN이 불가능.
// bo_table별로 그룹핑한 뒤 IN 쿼리로 한 번에 fetch — 쿼리 횟수가 페이지 row 수에 비례하지 않고
// 페이지에 등장한 unique bo_table 수에 비례한다 (보통 5~10).
if ($total === 0 && !$newRows) {
    list($fallbackItems, $fallbackTotal) = api_recent_fallback_from_write_tables(
        $view,
        $gr_id,
        $mb_id,
        $page,
        $limit
    );

    Response::paginated($fallbackItems, $fallbackTotal, $page, $limit);
}

$needsByTable = []; // ['free' => [3 => true, 5 => true, ...], ...]
foreach ($newRows as $row) {
    $tbl = $row['bo_table'];
    if (!isset($needsByTable[$tbl])) {
        $needsByTable[$tbl] = [];
    }
    $needsByTable[$tbl][(int) $row['wr_parent']] = true;
    if ($row['wr_id'] !== $row['wr_parent']) {
        $needsByTable[$tbl][(int) $row['wr_id']] = true;
    }
}

$rowsByTable = []; // ['free' => [wr_id => row, ...], ...]
foreach ($needsByTable as $tbl => $idsMap) {
    $ids = array_keys($idsMap);
    if (!$ids) continue;

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $writeTable   = api_write_table($tbl);
    // wr_email / wr_homepage 는 비회원 작성 글 작성자 입력 필드 — PII 라 응답 미포함.
    $rows = DB::fetchAll(
        "SELECT wr_id, wr_subject, wr_seo_title, mb_id, wr_name, wr_datetime, wr_10, wr_option,
                IF(wr_is_comment = 1, wr_content, '') AS wr_content
         FROM {$writeTable}
         WHERE wr_id IN ({$placeholders})",
        $ids
    );

    $byId = [];
    foreach ($rows as $r) {
        $byId[(int) $r['wr_id']] = $r;
    }
    $rowsByTable[$tbl] = $byId;
}

// 원본 순서를 유지하며 응답 빌드.
$items = [];
foreach ($newRows as $row) {
    $tbl       = $row['bo_table'];
    $isComment = $row['wr_id'] !== $row['wr_parent'];

    $parent = $rowsByTable[$tbl][(int) $row['wr_parent']] ?? null;
    if (!$parent) {
        // 글이 삭제됐는데 board_new가 남아있는 케이스 — 스킵.
        continue;
    }

    // 댓글이면 댓글 row가 작성자 정보, 글이면 부모와 동일.
    $author = $isComment
        ? ($rowsByTable[$tbl][(int) $row['wr_id']] ?? null)
        : $parent;
    if (!$author) {
        continue;
    }

    if ((string) ($parent['wr_10'] ?? '') === 'report_hidden'
        && (!$viewer || !Auth::canManagePost($viewer, $tbl, $parent))) {
        continue;
    }

    if ($isComment
        && (string) ($author['wr_10'] ?? '') === 'report_hidden'
        && (!$viewer || !Auth::canManagePost($viewer, $tbl, $author))) {
        continue;
    }

    if (api_is_blocked_author(
        $viewer,
        (string) ($parent['mb_id'] ?? ''),
        (string) ($parent['wr_name'] ?? '')
    )) {
        continue;
    }

    if ($isComment && api_is_blocked_author(
        $viewer,
        (string) ($author['mb_id'] ?? ''),
        (string) ($author['wr_name'] ?? '')
    )) {
        continue;
    }

    $items[] = [
        'bn_id'       => (int) $row['bn_id'],
        'gr_id'       => $row['gr_id'],
        'gr_subject'  => $row['gr_subject'],
        'bo_table'    => $row['bo_table'],
        'bo_subject'  => $row['bo_subject'],
        'wr_id'       => (int) $row['wr_id'],
        'wr_parent'   => (int) $row['wr_parent'],
        'wr_subject'  => $parent['wr_subject'],
        'wr_seo_title'=> isset($parent['wr_seo_title']) ? (string) $parent['wr_seo_title'] : '',
        'is_comment'  => $isComment,
        // 댓글 본문 요약(읽을 수 있고 비밀이 아닐 때만). 글이면 null.
        'comment_excerpt' => $isComment
            ? api_recent_comment_excerpt($author, $parent, (int) ($row['bo_read_level'] ?? 1), $viewer, (string) $row['bo_table'])
            : null,
        'mb_id'       => $author['mb_id'],
        'wr_name'     => $author['wr_name'],
        'wr_email'    => '',
        'wr_homepage' => isset($author['wr_homepage']) ? $author['wr_homepage'] : '',
        'wr_datetime' => $author['wr_datetime'],
        'href'        => api_board_post_href(
            $row['bo_table'],
            (int) $row['wr_parent'],
            isset($parent['wr_seo_title']) ? $parent['wr_seo_title'] : '',
            $isComment ? '#c_' . (int) $row['wr_id'] : ''
        ),
    ];
}

Response::paginated($items, $total, $page, $limit);
