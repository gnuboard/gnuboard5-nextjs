<?php
/**
 * Gnuboard5 REST API - Search Endpoint
 *
 * Routes handled (prefix: v1/search):
 *   GET /v1/search?q=keyword&bo_table=board1&sfl=wr_subject|wr_content
 *   GET /v1/search/popular?limit=7&days=3
 */

if (!defined('_GNUBOARD_')) exit;

// -------------------------------------------------------------------------
// GET /v1/search
// -------------------------------------------------------------------------
if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$action = $apiSegments[0] ?? '';

// -------------------------------------------------------------------------
// GET /v1/search/popular - 인기검색어
//
// 아래 본문이 기록하는 g5_popular 를 그대로 읽는다. 집계 방식(기간 안에서
// 검색어별 건수 내림차순)은 lib/popular.lib.php 의 popular() 와 같게 두어,
// 레거시 테마의 인기검색어 위젯과 같은 순서가 나오게 한다.
// -------------------------------------------------------------------------
if ($action === 'popular') {
    $popularLimit = min(20, max(1, (int) ($_GET['limit'] ?? 7)));
    $popularDays  = min(30, max(1, (int) ($_GET['days'] ?? 3)));
    $fromDate     = date('Y-m-d', time() - ($popularDays * 86400));
    $toDate       = date('Y-m-d');

    $popularTable = DB::table('popular_table');
    $rows = DB::readFetchAll(
        "SELECT pp_word, COUNT(*) AS cnt
           FROM {$popularTable}
          WHERE pp_date BETWEEN ? AND ?
            AND pp_word <> ''
          GROUP BY pp_word
          ORDER BY cnt DESC, pp_word
          LIMIT {$popularLimit}",
        [$fromDate, $toDate]
    );

    Response::success(array_map(static function ($row) {
        return [
            'pp_word' => (string) $row['pp_word'],
            'cnt'     => (int) $row['cnt'],
        ];
    }, $rows));
}

// Query keyword
$q = isset($_GET['q']) ? trim($_GET['q']) : '';
if ($q === '') {
    Response::error('Search keyword (q) is required.', 422, [
        'q' => 'q is required.',
    ]);
}

$keyword = $q;

if (!function_exists('api_search_snippet')) {
    /**
     * 검색어가 나오는 자리를 중심으로 본문을 잘라 준다.
     *
     * 앞에서 200자를 자르면 긴 글에서는 늘 도입부만 보여서, 왜 이 글이 걸렸는지
     * 알 수 없다. 검색어가 있으면 그 앞뒤를 함께 보여 주고, 없으면(제목만 맞은
     * 경우) 앞부분을 준다. 잘린 쪽에는 줄임표를 붙여 잘렸음을 알린다.
     */
    function api_search_snippet(string $content, string $keyword, int $length = 220, int $lead = 70): string
    {
        if ($content === '') {
            return '';
        }

        $total = mb_strlen($content);
        $position = $keyword !== '' ? mb_stripos($content, $keyword) : false;
        $start = $position === false ? 0 : max(0, $position - $lead);
        $snippet = mb_substr($content, $start, $length);

        if ($start > 0) {
            $snippet = '...' . $snippet;
        }
        if ($start + $length < $total) {
            $snippet .= '...';
        }

        return $snippet;
    }
}

// Search field (default: subject + content)
$sfl = isset($_GET['sfl']) ? $_GET['sfl'] : 'wr_subject|wr_content';

// Build the WHERE condition based on search field
$allowedFields = ['wr_subject', 'wr_content', 'wr_name', 'mb_id'];
$sflParts = explode('|', $sfl);
$searchConditions = [];

foreach ($sflParts as $field) {
    $field = trim($field);
    if (in_array($field, $allowedFields, true)) {
        $searchConditions[] = "{$field} LIKE ?";
    }
}

if (empty($searchConditions)) {
    $searchConditions[] = "wr_subject LIKE ?";
}

$searchWhere = '(' . implode(' OR ', $searchConditions) . ')';

// Build the search params array (one ? param per condition)
$likeValue = '%' . $keyword . '%';
$searchParams = array_fill(0, count($searchConditions), $likeValue);
$viewer = Auth::getUser();
$viewerLevel = $viewer && isset($viewer['mb_level']) ? (int) $viewer['mb_level'] : 1;

$canSearchBoard = function (array $board) use ($viewer, $viewerLevel): bool {
    if ((int) ($board['bo_use_search'] ?? 0) !== 1) {
        return false;
    }

    if ($viewerLevel < (int) ($board['bo_list_level'] ?? 1)) {
        return false;
    }

    return api_board_group_access_allowed($viewer, (string) $board['bo_table'], $board, false);
};

// Determine which boards to search
$targetBoards = [];

if (isset($_GET['bo_table']) && $_GET['bo_table'] !== '') {
    $tables = explode(',', $_GET['bo_table']);
    foreach ($tables as $t) {
        $t = api_sanitize_bo_table(trim($t));
        if ($t) {
            $board = api_get_board($t);
            if ($board && $canSearchBoard($board)) {
                $targetBoards[] = $board;
            }
        }
    }
} else {
    // Search all boards (read-only — replica 가능)
    $allBoards = DB::readFetchAll("SELECT * FROM " . DB::table('board_table') . " ORDER BY gr_id, bo_table");
    foreach ($allBoards as $board) {
        if ($canSearchBoard($board)) {
            $targetBoards[] = $board;
        }
    }
}

if (empty($targetBoards)) {
    Response::success([
        'keyword'      => $q,
        'total_count'  => 0,
        'results'      => [],
    ]);
}

// Pagination
$page    = get_page_param(1);
$perPage = get_per_page_param(10, 50);

// Search each board and collect results
$groupedResults = [];
$totalCount = 0;

foreach ($targetBoards as $board) {
    $write_table = DB::writeTable($board['bo_table']);

    // Check if table exists
    $checkResult = DB::getPdo()->query("SHOW TABLES LIKE '{$write_table}'");
    if (!$checkResult->fetch()) {
        continue;
    }

    $conditions = [
        'wr_is_comment = 0',
        "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
        $searchWhere,
    ];
    $params = $searchParams;
    api_add_blocked_author_condition($conditions, $params, $viewer);
    $where = 'WHERE ' . implode(' AND ', $conditions);

    // Count matches in this board
    $countSql = "SELECT COUNT(*) FROM {$write_table} {$where}";
    $boardCount = DB::readCount($countSql, $params);

    if ($boardCount === 0) {
        continue;
    }

    $totalCount += $boardCount;

    // Fetch matching posts (limited per board)
    $boardLimit = (int) $perPage;
    $sql = "SELECT wr_id, wr_subject, wr_seo_title, wr_content, wr_name, mb_id,
                   wr_datetime, wr_hit, wr_good, wr_comment, ca_name, wr_option
            FROM {$write_table}
            {$where}
            ORDER BY (CASE WHEN wr_subject LIKE ? THEN 0 ELSE 1 END), wr_id DESC
            LIMIT {$boardLimit}";

    // 제목이 맞은 글을 먼저 보여 준다. 본문에만 스친 글이 최신이라는 이유로
    // 위에 오면, 찾는 사람이 목록을 끝까지 훑어야 한다.
    $orderParams = array_merge($params, [$likeValue]);
    $rows = DB::readFetchAll($sql, $orderParams);
    $posts = [];

    foreach ($rows as $post) {
        // Truncate content for search preview
        $isSecret = api_is_secret_option($post['wr_option'] ?? '');
        // 본문 요약은 글을 읽을 수 있을 때만 — 읽기 레벨뿐 아니라 그룹 접근 · 본인확인 제한까지(api_can_read_board).
        if (!api_can_read_board($viewer ?: null, (string) $board['bo_table'], $board)) {
            $content = '';
        } elseif ($isSecret) {
            $content = json_decode('"\uBE44\uBC00\uAE00\uC785\uB2C8\uB2E4."');
        } else {
            // 태그를 걷어낸 뒤 남는 &lt; 같은 문자까지 풀어야 사람이 읽는 문장이 된다.
            $content = html_entity_decode(strip_tags($post['wr_content']), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $content = preg_replace('/\s+/u', ' ', trim($content));
            $content = api_search_snippet($content, $keyword);
        }
        $post['wr_content_preview'] = $content;
        $post['is_secret'] = $isSecret;
        unset($post['wr_content']);

        $posts[] = $post;
    }

    $groupedResults[] = [
        'bo_table'   => $board['bo_table'],
        'bo_subject' => $board['bo_subject'],
        'count'      => $boardCount,
        'posts'      => $posts,
    ];
}

// Record popular search keyword
$today = date('Y-m-d');
$checkPopular = DB::fetch("SELECT pp_id FROM " . DB::table('popular_table') . "
                           WHERE pp_word = ?
                             AND pp_date = ?
                           LIMIT 1", [$keyword, $today]);

if (!$checkPopular || !$checkPopular['pp_id']) {
    DB::execute("INSERT INTO " . DB::table('popular_table') . "
               SET pp_word = ?,
                   pp_date = ?,
                   pp_ip   = ?", [$keyword, $today, $_SERVER['REMOTE_ADDR']]);
}

Response::success([
    'keyword'     => $q,
    'total_count' => $totalCount,
    'results'     => $groupedResults,
]);
