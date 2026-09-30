<?php
/**
 * Gnuboard5 REST API - Menu Endpoints
 *
 * GET /v1/menus - Get hierarchical menu (from g5_menu table)
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$menuTable = DB::table('menu_table');

$rows = DB::fetchAll(
    "SELECT me_id, me_code, me_name, me_link, me_target, me_order
     FROM {$menuTable}
     WHERE me_use = 1
     ORDER BY me_order, me_id"
);

// Build hierarchy: 2-char code = parent, 4-char code = child
$parents = [];
$children = [];

foreach ($rows as $row) {
    $code = $row['me_code'];
    // Convert local Gnuboard links when possible while preserving every
    // administrator-configured menu item as a usable fallback.
    $link = convertMenuLink($row['me_link'], $row['me_name']);
    if ($link === '') {
        continue;
    }

    $item = [
        'me_id'     => (int) $row['me_id'],
        'me_code'   => $code,
        'me_name'   => $row['me_name'],
        'me_link'   => $link,
        'me_target'  => $row['me_target'],
    ];

    if (strlen($code) <= 2) {
        $item['children'] = [];
        $parents[$code] = $item;
    } else {
        $parentCode = substr($code, 0, 2);
        $children[$parentCode][] = $item;
    }
}

// Attach children to parents
foreach ($children as $parentCode => $kids) {
    if (isset($parents[$parentCode])) {
        $parents[$parentCode]['children'] = $kids;
    }
}

Response::success(array_values($parents));

// ---------------------------------------------------------------------------
// Helper: convert Gnuboard5 absolute menu URLs to Next.js relative paths
// ---------------------------------------------------------------------------
function convertMenuLink(string $link, string $label = ''): string
{
    $link = normalizeMenuLinkValue($link);

    // board.php?bo_table=xxx -> /xxx when the target board exists locally.
    // Imported external menus stay external when no local equivalent exists.
    if (preg_match('/board\.php\?/i', $link)) {
        $boardLink = localMenuBoardLink($link, $label);
        if ($boardLink !== '') {
            return $boardLink;
        }

        return fallbackMenuLink($link);
    }

    // group.php?gr_id=xxx → /boards?group=xxx
    if (preg_match('/group\.php\?gr_id=(\w+)/', $link, $m)) {
        return '/boards?group=' . $m[1];
    }

    // content.php?co_id=xxx -> /content/{local co_id} when the menu label maps
    // to a local content page. Otherwise preserve the administrator's URL.
    if (preg_match('/content\.php\?([^#]+)/i', $link, $m)) {
        parse_str($m[1], $query);
        $contentLink = localMenuContentLink(
            isset($query['co_id']) ? (string) $query['co_id'] : '',
            $label
        );
        if ($contentLink !== '') {
            return $contentLink;
        }

        return fallbackMenuLink($link);
    }

    $shortLink = api_g5_short_href($link);
    if ($shortLink !== $link) {
        return $shortLink;
    }

    // Next.js internal board paths -> Gnuboard5 rewrite paths.
    if (preg_match('#^/boards/([0-9A-Za-z_]+)$#', $link, $m)) {
        return '/' . $m[1];
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/rss$#', $link, $m)) {
        return '/rss/' . $m[1];
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/write$#', $link, $m)) {
        return '/' . $m[1] . '/write';
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([0-9]+)$#', $link, $m)) {
        return '/' . $m[1] . '/' . $m[2];
    }

    // Next.js internal shop paths -> YoungCart rewrite paths.
    if (preg_match('#^/shop/categories/([0-9A-Za-z]+)$#', $link, $m)) {
        return '/shop/list-' . $m[1];
    }
    if (preg_match('#^/shop/products/([^/]+)/$#', $link, $m)) {
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];
        if (empty($reserved[$m[1]]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $m[1])) {
            return '/shop/' . $m[1] . '/';
        }
    }
    if (preg_match('#^/shop/products/([^/]+)$#', $link, $m)) {
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];
        if (empty($reserved[$m[1]]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $m[1])) {
            return '/shop/' . $m[1];
        }
    }
    if (preg_match('#^/shop/products\?(.*)$#', $link, $m)) {
        parse_str($m[1], $query);
        for ($i = 1; $i <= 5; $i++) {
            $key = 'it_type' . $i;
            if (($query[$key] ?? '') === '1') {
                unset($query[$key]);
                $suffix = http_build_query($query);
                return '/shop/type-' . $i . ($suffix ? '?' . $suffix : '');
            }
        }
    }

    // External URLs: keep as-is
    return fallbackMenuLink($link);
}

function fallbackMenuLink(string $link): string
{
    $link = trim($link);
    if ($link === '') {
        return '';
    }

    if (preg_match('#^(?:https?://|/|\#|mailto:|tel:)#i', $link)) {
        return $link;
    }

    return '/' . ltrim($link, '/');
}

function localMenuContentLink(string $coId, string $label): string
{
    $label = trim($label);
    $coId = preg_replace('/[^a-z0-9_]/i', '', trim($coId));

    if ($label === '') {
        return '';
    }

    try {
        $contentTable = DB::table('content_table');
        $labels = localMenuContentLabels($label);

        if ($coId !== '') {
            $exact = DB::fetch(
                "SELECT co_id, co_subject FROM {$contentTable} WHERE co_id = ? LIMIT 1",
                [$coId]
            );
            if ($exact && in_array(trim((string) $exact['co_subject']), $labels, true)) {
                return '/content/' . rawurlencode((string) $exact['co_id']);
            }
        }

        foreach ($labels as $candidate) {
            $byLabel = DB::fetch(
                "SELECT co_id FROM {$contentTable} WHERE co_subject = ? ORDER BY co_id ASC LIMIT 1",
                [$candidate]
            );
            if ($byLabel && !empty($byLabel['co_id'])) {
                return '/content/' . rawurlencode((string) $byLabel['co_id']);
            }
        }
    } catch (Exception $e) {
        return '';
    }

    return '';
}

function normalizeMenuLinkValue(string $link): string
{
    $link = trim(html_entity_decode($link, ENT_QUOTES | ENT_HTML5, 'UTF-8'));

    // Some imported menu rows contain a second "?" where an "&" should be,
    // for example board.php?bo_table=sermon?sca=... . Keep the target intact
    // while making the URL clickable and parseable.
    $phpQueryPos = stripos($link, '.php?');
    if ($phpQueryPos === false) {
        return $link;
    }

    $queryStart = $phpQueryPos + 5;
    $extraQuestionPos = strpos($link, '?', $queryStart);
    if ($extraQuestionPos === false) {
        return $link;
    }

    return substr($link, 0, $extraQuestionPos)
        . '&'
        . substr($link, $extraQuestionPos + 1);
}

function localMenuBoardLink(string $link, string $label = ''): string
{
    $parts = parse_url($link);
    if (!is_array($parts)) {
        return '';
    }

    $path = isset($parts['path']) ? (string) $parts['path'] : '';
    if ($path !== '' && !preg_match('#(?:^|/)board\.php$#i', $path)) {
        return '';
    }

    $queryString = isset($parts['query']) ? (string) $parts['query'] : '';
    if ($queryString === '') {
        return '';
    }

    parse_str($queryString, $query);
    $requestedBoTable = api_sanitize_bo_table(isset($query['bo_table']) ? (string) $query['bo_table'] : '');
    if ($requestedBoTable === '') {
        return '';
    }

    $board = localMenuBoardRow($requestedBoTable);
    $resolvedByLabel = false;
    if (!$board) {
        $board = localMenuBoardRowForLabel($label);
        $resolvedByLabel = (bool) $board;
    }
    if (!$board || empty($board['bo_table'])) {
        return '';
    }

    $boTable = api_sanitize_bo_table((string) $board['bo_table']);
    if ($boTable === '') {
        return '';
    }

    $wrId = 0;
    if (!$resolvedByLabel && isset($query['wr_id']) && ctype_digit((string) $query['wr_id'])) {
        $wrId = (int) $query['wr_id'];
    }

    unset($query['bo_table'], $query['wr_id']);
    if (isset($query['sca']) && !localMenuBoardAllowsCategory($board, (string) $query['sca'])) {
        unset($query['sca']);
    }
    $nextQuery = http_build_query($query, '', '&');
    $hash = isset($parts['fragment']) && $parts['fragment'] !== ''
        ? '#' . rawurlencode((string) $parts['fragment'])
        : '';
    $suffix = ($nextQuery !== '' ? '?' . $nextQuery : '') . $hash;

    if ($wrId > 0) {
        return api_g5_short_href('/boards/' . rawurlencode($boTable) . '/' . $wrId . $suffix);
    }

    return api_g5_short_href('/boards/' . rawurlencode($boTable) . $suffix);
}

function localMenuBoardRow(string $boTable): ?array
{
    static $cache = [];

    $boTable = api_sanitize_bo_table($boTable);
    if ($boTable === '') {
        return null;
    }

    if (array_key_exists($boTable, $cache)) {
        return $cache[$boTable];
    }

    try {
        $boardTable = DB::table('board_table');
        $row = DB::fetch(
            "SELECT bo_table, bo_subject, bo_use_category, bo_category_list
             FROM {$boardTable}
             WHERE bo_table = ? LIMIT 1",
            [$boTable]
        );
        $cache[$boTable] = $row ?: null;
    } catch (Exception $e) {
        $cache[$boTable] = null;
    }

    return $cache[$boTable];
}

function localMenuBoardRowForLabel(string $label): ?array
{
    $labels = localMenuBoardLabels($label);
    if (!$labels) {
        return null;
    }

    try {
        $boardTable = DB::table('board_table');
        foreach ($labels as $candidate) {
            $row = DB::fetch(
                "SELECT bo_table, bo_subject, bo_use_category, bo_category_list
                 FROM {$boardTable}
                 WHERE bo_subject = ?
                 ORDER BY bo_table ASC
                 LIMIT 1",
                [$candidate]
            );
            if ($row) {
                return $row;
            }
        }
    } catch (Exception $e) {
        return null;
    }

    return null;
}

function localMenuBoardAllowsCategory(array $board, string $category): bool
{
    $category = trim($category);
    if ($category === '') {
        return true;
    }

    if ((int) ($board['bo_use_category'] ?? 0) !== 1) {
        return false;
    }

    $categories = array_filter(array_map('trim', explode('|', (string) ($board['bo_category_list'] ?? ''))));
    return in_array($category, $categories, true);
}

function localMenuBoardLabels(string $label): array
{
    $label = trim($label);
    if ($label === '') {
        return [];
    }

    $aliases = [
        '교회소식' => ['공지사항'],
        '공지사항' => ['공지사항', 'notice'],
        '코이노니아' => ['갤러리', '포토'],
    ];

    return array_values(array_unique(array_filter(array_merge([$label], $aliases[$label] ?? []))));
}

function localMenuContentLabels(string $label): array
{
    $aliases = [
        '교회소개' => ['교회소개', '회사소개'],
        '오시는길' => ['오시는길', '찾아오시는길'],
    ];

    return $aliases[$label] ?? [$label];
}
