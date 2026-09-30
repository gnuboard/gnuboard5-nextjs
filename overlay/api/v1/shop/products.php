<?php
/**
 * Gnuboard5 REST API - Shop Products
 *
 * GET /v1/shop/products              - List products (with filters, search, sort, pagination)
 * GET /v1/shop/products/{it_id}      - Product detail (options, category, related, reviews, Q&A)
 * GET /v1/shop/products/seo/{slug}   - Product detail by it_seo_title
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$it_id = isset($shopSegments[0]) ? $shopSegments[0] : '';

// =========================================================================
// GET /v1/shop/products/suggest?q=foo  — 검색 자동완성 (it_name 상위 10건).
//   it_id 가 'suggest' 인 가짜 경로로 분기. 매우 가벼운 쿼리만.
// =========================================================================
if ($apiMethod === 'GET' && $it_id === 'suggest') {
    $q = trim((string) ($_GET['q'] ?? ''));
    if ($q === '' || mb_strlen($q) < 2) {
        Response::success([]);
    }
    $like = '%' . $q . '%';
    $rows = DB::fetchAll(
        "SELECT it_id, it_name, it_price, it_img1, ca_id, it_seo_title, it_tel_inq
         FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_use = 1 AND it_soldout != 1
           AND it_name LIKE ?
         ORDER BY it_hit DESC, it_id DESC
         LIMIT 10",
        [$like]
    );
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'it_id'     => (string) $r['it_id'],
            'it_name'   => $r['it_name'],
            'it_price'  => (int) $r['it_price'],
            'it_tel_inq' => (string) (int) ($r['it_tel_inq'] ?? 0),
            'image_url' => api_shop_item_image_url($r['it_id'], $r['it_img1']),
            'ca_id'     => $r['ca_id'],
            'it_seo_title' => $r['it_seo_title'] ?? '',
        ];
    }
    Response::success($out);
}

if ($apiMethod === 'GET' && $it_id === 'seo') {
    $seo_title = trim(rawurldecode((string) ($shopSegments[1] ?? '')));
    if ($seo_title === '') {
        Response::error('Product SEO title is required.', 400);
    }

    $itemTable = DB::table('g5_shop_item_table');
    $resolved = DB::fetch(
        "SELECT it_id FROM {$itemTable}
         WHERE it_seo_title = ? AND it_use = '1'
         LIMIT 1",
        [$seo_title]
    );

    if (!$resolved || !$resolved['it_id']) {
        Response::error('Product not found.', 404);
    }

    $it_id = (string) $resolved['it_id'];
}

// ---------------------------------------------------------------------------
// Helper: build image URL for a product
// ---------------------------------------------------------------------------
if (!function_exists('api_shop_item_image_url')) {
    function api_shop_item_image_url($it_id, $imageField)
    {
        if (!$imageField) {
            return '';
        }
        if (preg_match('#^https?://#i', $imageField)) {
            return $imageField;
        }

        $imageField = ltrim(str_replace('\\', '/', $imageField), '/');
        $candidates = array($imageField);
        if ($it_id && strpos($imageField, '/') === false) {
            $candidates[] = $it_id . '/' . $imageField;
        }

        foreach ($candidates as $candidate) {
            $path = G5_DATA_PATH . '/item/' . $candidate;
            if (is_file($path)) {
                return shop_api_image_url('item', $candidate);
            }
        }

        return '';
    }
}

if (!function_exists('api_shop_item_image_urls')) {
    function api_shop_item_image_urls(array $item): array
    {
        $itId = (string) ($item['it_id'] ?? '');
        $images = [];

        for ($i = 1; $i <= 10; $i++) {
            $url = api_shop_item_image_url($itId, $item['it_img' . $i] ?? '');
            if ($url !== '') {
                $images[] = $url;
            }
        }

        return $images;
    }
}

if (!function_exists('api_shop_product_info_notice')) {
    function api_shop_product_info_notice(array $item): array
    {
        $gubun = (string) ($item['it_info_gubun'] ?? '');
        $rawValue = (string) ($item['it_info_value'] ?? '');

        if ($rawValue === '') {
            return [
                'gubun' => $gubun,
                'title' => '',
                'items' => [],
            ];
        }

        $infoData = @unserialize(stripslashes($rawValue), ['allowed_classes' => false]);
        if (!is_array($infoData)) {
            $infoData = @unserialize($rawValue, ['allowed_classes' => false]);
        }
        if (!is_array($infoData)) {
            return [
                'gubun' => $gubun,
                'title' => '',
                'items' => [],
            ];
        }

        global $item_info;
        if (defined('G5_LIB_PATH') && is_file(G5_LIB_PATH . '/iteminfo.lib.php')) {
            include_once G5_LIB_PATH . '/iteminfo.lib.php';
        }

        $noticeInfo = isset($item_info[$gubun]) && is_array($item_info[$gubun])
            ? $item_info[$gubun]
            : [];
        $article = isset($noticeInfo['article']) && is_array($noticeInfo['article'])
            ? $noticeInfo['article']
            : [];

        $items = [];
        foreach ($infoData as $key => $value) {
            $key = (string) $key;
            if ($key === '') {
                continue;
            }

            $definition = isset($article[$key]) && is_array($article[$key])
                ? $article[$key]
                : [];
            $items[] = [
                'key' => $key,
                'title' => (string) ($definition[0] ?? $key),
                'value' => (string) $value,
                'example' => (string) ($definition[1] ?? ''),
            ];
        }

        return [
            'gubun' => $gubun,
            'title' => (string) ($noticeInfo['title'] ?? ''),
            'items' => $items,
        ];
    }
}

if (!function_exists('api_shop_product_related_items')) {
    function api_shop_product_related_items(string $itId): array
    {
        global $default;

        if (isset($default['de_rel_list_use']) && (int) $default['de_rel_list_use'] !== 1) {
            return [];
        }

        $relationTable = DB::table('g5_shop_item_relation_table');
        $itemTable = DB::table('g5_shop_item_table');
        $rows = DB::fetchAll(
            "SELECT b.it_id, b.it_name, b.it_price, b.it_cust_price, b.it_img1, b.it_seo_title, b.it_tel_inq
               FROM {$relationTable} a
               LEFT JOIN {$itemTable} b ON (a.it_id2 = b.it_id)
              WHERE a.it_id = ?
                AND b.it_use = '1'
              ORDER BY a.ir_no ASC, a.it_id2 ASC",
            [$itId]
        );

        $items = [];
        foreach ($rows as $row) {
            if (empty($row['it_id'])) {
                continue;
            }
            $items[] = [
                'it_id'          => (string) $row['it_id'],
                'it_name'        => (string) $row['it_name'],
                'it_seo_title'   => (string) ($row['it_seo_title'] ?? ''),
                'it_price'       => (int) $row['it_price'],
                'it_cust_price'  => (int) $row['it_cust_price'],
                'it_tel_inq'     => (string) (int) ($row['it_tel_inq'] ?? 0),
                'image_url'      => api_shop_item_image_url((string) $row['it_id'], $row['it_img1'] ?? ''),
            ];
        }

        return $items;
    }
}

// ---------------------------------------------------------------------------
// Helper: get category name by ca_id
// ---------------------------------------------------------------------------
function api_shop_category_name($ca_id)
{
    if (!$ca_id) {
        return '';
    }
    $row = DB::fetch(
        "SELECT ca_name FROM " . DB::table('g5_shop_category_table') . " WHERE ca_id = ? LIMIT 1",
        [$ca_id]
    );
    return $row['ca_name'] ?? '';
}

// =========================================================================
// GET /v1/shop/products - List products
// =========================================================================
if ($apiMethod === 'GET' && $it_id === '') {

    $page     = max(1, (int) ($_GET['page'] ?? 1));
    $perPage  = max(1, min(100, (int) ($_GET['per_page'] ?? 20)));
    $offset   = ($page - 1) * $perPage;

    $itemTable = DB::table('g5_shop_item_table');

    // Dynamic WHERE with params
    $conditions = ["it_use = '1'", "it_soldout != '1'"];
    $params = [];

    // Filter by category
    $requestedCaId = trim((string) ($_GET['ca_id'] ?? ($_GET['qcaid'] ?? '')));
    if ($requestedCaId !== '') {
        $conditions[] = "ca_id LIKE ?";
        $params[] = $requestedCaId . '%';

        global $config;
        if (!empty($config['cf_cert_use'])) {
            shop_api_enforce_cert_access($requestedCaId, 'list', Auth::getUser());
        }
    }

    // Filter by type flags
    for ($i = 1; $i <= 5; $i++) {
        if (isset($_GET["it_type{$i}"]) && $_GET["it_type{$i}"] === '1') {
            $conditions[] = "it_type{$i} = '1'";
        }
    }

    $priceFrom = preg_replace('/[^0-9]/', '', (string) ($_GET['qfrom'] ?? ($_GET['price_min'] ?? '')));
    $priceTo = preg_replace('/[^0-9]/', '', (string) ($_GET['qto'] ?? ($_GET['price_max'] ?? '')));
    if ($priceFrom !== '' && $priceTo !== '') {
        $conditions[] = "it_price BETWEEN ? AND ?";
        $params[] = (int) $priceFrom;
        $params[] = (int) $priceTo;
    } elseif ($priceFrom !== '') {
        $conditions[] = "it_price >= ?";
        $params[] = (int) $priceFrom;
    } elseif ($priceTo !== '') {
        $conditions[] = "it_price <= ?";
        $params[] = (int) $priceTo;
    }

    // Keyword search. YoungCart shop/search.php supports qname/qexplan/qid/qbasic.
    if (!empty($_GET['q'])) {
        $rawKeywords = preg_split('/\s+/', trim((string) $_GET['q']));
        $searchFields = [];
        $hasExplicitSearchField = isset($_GET['qname']) || isset($_GET['qexplan']) || isset($_GET['qid']) || isset($_GET['qbasic']);
        if (!$hasExplicitSearchField || !empty($_GET['qname'])) {
            $searchFields[] = 'it_name';
        }
        if (!$hasExplicitSearchField || !empty($_GET['qexplan'])) {
            $searchFields[] = 'it_explan2';
            $searchFields[] = 'it_explan';
        }
        if (!$hasExplicitSearchField || !empty($_GET['qid'])) {
            $searchFields[] = 'it_id';
        }
        if (!$hasExplicitSearchField || !empty($_GET['qbasic'])) {
            $searchFields[] = 'it_basic';
        }
        $searchFields = array_values(array_unique($searchFields));

        foreach ($rawKeywords as $keyword) {
            $keyword = trim((string) $keyword);
            if ($keyword === '') {
                continue;
            }
            $fieldConditions = [];
            foreach ($searchFields as $field) {
                $fieldConditions[] = "{$field} LIKE ?";
                $params[] = '%' . $keyword . '%';
            }
            if ($fieldConditions) {
                $conditions[] = '(' . implode(' OR ', $fieldConditions) . ')';
            }
        }
    }

    $where = implode(' AND ', $conditions);

    // Sort: supports both Next.js aliases and Gnuboard/YoungCart sort + sortodr.
    $orderBy = shop_api_product_order_by($_GET['sort'] ?? ($_GET['qsort'] ?? ''), $_GET['sortodr'] ?? ($_GET['qorder'] ?? ''));

    // Count total
    $total = DB::count("SELECT COUNT(*) FROM {$itemTable} WHERE {$where}", $params);

    // Fetch items
    $rows = DB::fetchAll(
        "SELECT it_id, ca_id, it_name, it_price, it_cust_price, it_point,
                it_stock_qty, it_soldout, it_img1, it_img2, it_img3, it_img4, it_img5,
                it_img6, it_img7, it_img8, it_img9, it_img10,
                it_buy_min_qty, it_buy_max_qty, it_tel_inq, it_brand, it_maker,
                it_type1, it_type2, it_type3, it_type4, it_type5, it_hit, it_seo_title
         FROM {$itemTable}
         WHERE {$where}
         ORDER BY {$orderBy}
         LIMIT ?, ?",
        array_merge($params, [$offset, $perPage])
    );

    // 분류 이름과 후기 통계는 페이지 단위로 한 번에 (상품마다 묻지 않는다).
    $extras = shop_api_product_list_extras($rows);

    $items = [];
    foreach ($rows as $row) {
        $images = api_shop_item_image_urls($row);
        $review = $extras['reviews'][(string) $row['it_id']] ?? ['cnt' => 0, 'avg' => 0.0];
        $items[] = [
            'it_id'          => $row['it_id'],
            'ca_id'          => $row['ca_id'],
            'ca_name'        => $extras['categories'][(string) $row['ca_id']] ?? '',
            'it_name'        => $row['it_name'],
            'it_brand'       => $row['it_brand'] ?? '',
            'it_maker'       => $row['it_maker'] ?? '',
            'review_count'   => $review['cnt'],
            'review_avg'     => $review['avg'],
            'it_seo_title'   => $row['it_seo_title'] ?? '',
            'it_price'       => (int) $row['it_price'],
            'it_cust_price'  => (int) $row['it_cust_price'],
            'it_point'       => (int) $row['it_point'],
            'it_stock_qty'   => (int) $row['it_stock_qty'],
            'it_buy_min_qty' => (int) ($row['it_buy_min_qty'] ?? 0),
            'it_buy_max_qty' => (int) ($row['it_buy_max_qty'] ?? 0),
            'it_tel_inq'     => (string) (int) ($row['it_tel_inq'] ?? 0),
            'it_soldout'     => (string) (int) $row['it_soldout'],
            'it_type1'       => (string) $row['it_type1'],
            'it_type2'       => $row['it_type2'],
            'it_type3'       => $row['it_type3'],
            'it_type4'       => $row['it_type4'],
            'it_type5'       => $row['it_type5'],
            'it_hit'         => (int) $row['it_hit'],
            'image_url'      => $images[0] ?? '',
            'images'         => $images,
        ];
    }

    Response::paginated($items, $total, $page, $perPage);
}

// =========================================================================
// GET /v1/shop/products/{it_id} - Product detail
// =========================================================================
if ($apiMethod === 'GET' && $it_id !== '') {

    $itemTable    = DB::table('g5_shop_item_table');
    $catTable     = DB::table('g5_shop_category_table');
    $optTable     = DB::table('g5_shop_item_option_table');
    $reviewTable  = DB::table('g5_shop_item_use_table');
    $qaTable      = DB::table('g5_shop_item_qa_table');

    $item = DB::fetch(
        "SELECT * FROM {$itemTable} WHERE it_id = ? AND it_use = '1' LIMIT 1",
        [$it_id]
    );

    if (!$item || !$item['it_id']) {
        Response::error('Product not found.', 404);
    }

    shop_api_enforce_cert_access((string) $item['it_id'], 'item', Auth::getUser());

    // Category info
    $category = DB::fetch(
        "SELECT ca_id, ca_name FROM {$catTable} WHERE ca_id = ? LIMIT 1",
        [$item['ca_id']]
    );

    // Options
    $options = DB::fetchAll(
        "SELECT * FROM {$optTable} WHERE it_id = ? ORDER BY io_no ASC",
        [$it_id]
    );

    // Review stats
    $reviewStats = DB::fetch(
        "SELECT COUNT(*) AS cnt, IFNULL(AVG(is_score), 0) AS avg_score FROM {$reviewTable} WHERE it_id = ?",
        [$it_id]
    );

    // Q&A count
    $qaCount = DB::count(
        "SELECT COUNT(*) FROM {$qaTable} WHERE it_id = ?",
        [$it_id]
    );

    // YoungCart related items are explicitly managed in g5_shop_item_relation.
    $relatedItems = api_shop_product_related_items((string) $item['it_id']);

    $categoryRoot = substr((string) ($item['ca_id'] ?? ''), 0, 4);
    $prevItem = null;
    $nextItem = null;
    if ($categoryRoot !== '') {
        $prevItem = DB::fetch(
            "SELECT it_id, it_name, it_seo_title, it_img1
             FROM {$itemTable}
             WHERE it_id > ? AND SUBSTRING(ca_id, 1, 4) = ? AND it_use = '1'
             ORDER BY it_id ASC LIMIT 1",
            [$it_id, $categoryRoot]
        ) ?: null;
        $nextItem = DB::fetch(
            "SELECT it_id, it_name, it_seo_title, it_img1
             FROM {$itemTable}
             WHERE it_id < ? AND SUBSTRING(ca_id, 1, 4) = ? AND it_use = '1'
             ORDER BY it_id DESC LIMIT 1",
            [$it_id, $categoryRoot]
        ) ?: null;
    }

    $navItem = static function ($row): ?array {
        if (!$row || empty($row['it_id'])) {
            return null;
        }

        return [
            'it_id'        => (string) $row['it_id'],
            'it_name'      => (string) $row['it_name'],
            'it_seo_title' => (string) ($row['it_seo_title'] ?? ''),
            'image_url'    => api_shop_item_image_url((string) $row['it_id'], $row['it_img1'] ?? ''),
        ];
    };

    $images = api_shop_item_image_urls($item);
    $productInfoNotice = api_shop_product_info_notice($item);

    $data = [
        'it_id'          => $item['it_id'],
        'ca_id'          => $item['ca_id'],
        'it_brand'       => $item['it_brand'] ?? '',
        'it_maker'       => $item['it_maker'] ?? '',
        'it_origin'      => $item['it_origin'] ?? '',
        'it_model'       => $item['it_model'] ?? '',
        'it_seo_title'   => $item['it_seo_title'] ?? '',
        'it_supply_subject' => $item['it_supply_subject'] ?? '',
        'ca_name'        => $category['ca_name'] ?? '',
        'it_name'        => $item['it_name'],
        'it_price'       => (int) $item['it_price'],
        'it_cust_price'  => (int) $item['it_cust_price'],
        'it_point'       => (int) $item['it_point'],
        'it_point_type'  => (int) ($item['it_point_type'] ?? 0),
        'it_stock_qty'   => (int) $item['it_stock_qty'],
        'it_buy_min_qty' => (int) ($item['it_buy_min_qty'] ?? 0),
        'it_buy_max_qty' => (int) ($item['it_buy_max_qty'] ?? 0),
        'it_sc_type'     => (int) ($item['it_sc_type'] ?? 0),
        'it_sc_method'   => (int) ($item['it_sc_method'] ?? 0),
        'it_sc_price'    => (int) ($item['it_sc_price'] ?? 0),
        'it_sc_minimum'  => (int) ($item['it_sc_minimum'] ?? 0),
        'it_sc_qty'      => (int) ($item['it_sc_qty'] ?? 0),
        'it_tel_inq'     => (string) (int) ($item['it_tel_inq'] ?? 0),
        'it_soldout'     => (string) (int) $item['it_soldout'],
        'it_stock_sms'   => (string) (int) ($item['it_stock_sms'] ?? 0),
        'stock_sms_privacy' => shop_api_plain_text($config['cf_privacy'] ?? ''),
        'it_sc_type'     => (int) ($item['it_sc_type'] ?? 0),
        'it_sc_method'   => (int) ($item['it_sc_method'] ?? 0),
        'it_sc_price'    => (int) ($item['it_sc_price'] ?? 0),
        'it_sc_minimum'  => (int) ($item['it_sc_minimum'] ?? 0),
        'it_sc_qty'      => (int) ($item['it_sc_qty'] ?? 0),
        'it_nocoupon'    => $item['it_nocoupon'],
        'it_type1'       => $item['it_type1'],
        'it_type2'       => $item['it_type2'],
        'it_type3'       => $item['it_type3'],
        'it_type4'       => $item['it_type4'],
        'it_type5'       => $item['it_type5'],
        'it_basic'       => $item['it_basic'] ?? '',
        'it_explan'      => $item['it_explan'] ?? '',
        'it_head_html'   => $item['it_head_html'] ?? '',
        'it_tail_html'   => $item['it_tail_html'] ?? '',
        'it_info_gubun'  => $productInfoNotice['gubun'],
        'it_info_title'  => $productInfoNotice['title'],
        'it_info_items'  => $productInfoNotice['items'],
        'it_option_subject' => $item['it_option_subject'] ?? '',
        'it_supply_subject' => $item['it_supply_subject'] ?? '',
        'image_url'      => $images[0] ?? '',
        'images'         => $images,
        'options'        => $options,
        'category'       => $category ?: null,
        'review_count'   => (int) ($reviewStats['cnt'] ?? 0),
        'review_avg'     => round((float) ($reviewStats['avg_score'] ?? 0), 1),
        'qa_count'       => $qaCount,
        'related_items'  => $relatedItems,
        'prev_item'      => $navItem($prevItem),
        'next_item'      => $navItem($nextItem),
    ];

    Response::success($data);
}

// =========================================================================
// POST /v1/shop/products/{it_id}/recommend  { to_name, to_email, from_name, from_email, message }
//   상품을 지인에게 메일로 추천 — 영카트 itemrecommend.php / itemrecommendmail.php.
//   그누보드 mailer() 활용. cf_email_use=0 이면 silent fail (보안상 사용자에겐 성공 응답).
// =========================================================================
if ($apiMethod === 'POST' && $it_id !== '' && ($shopSegments[1] ?? '') === 'recommend') {
    $member = Auth::requireAuth();
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $toName  = trim((string) ($input['to_name']  ?? ''));
    $toEmail = trim((string) ($input['to_email'] ?? ''));
    $subjectInput = trim((string) ($input['subject'] ?? ''));
    $message  = trim((string) ($input['content'] ?? $input['message'] ?? ''));
    $fromName = trim((string) ($member['mb_name'] ?? $member['mb_nick'] ?? $member['mb_id'] ?? ''));
    $fromEmail = trim((string) ($member['mb_email'] ?? ''));

    if ($toEmail === '' || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        Response::error('받는 사람 이메일이 올바르지 않습니다.', 422);
    }
    if ($fromEmail === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        Response::error('보내는 사람 이메일 형식이 올바르지 않습니다.', 422);
    }
    if (function_exists('get_session') && function_exists('set_session')) {
        $lastSentAt = (int) get_session('ss_recommend_datetime');
        if ($lastSentAt >= time() - 120) {
            Response::error('너무 빠른 시간에 메일을 계속해서 보낼 수 없습니다.', 429);
        }

        $recommendMailCount = (int) get_session('ss_recommendmail_count') + 1;
        if ($recommendMailCount > 3) {
            Response::error('한번 접속에 일정량의 메일만 발송할 수 있습니다.', 429);
        }

        set_session('ss_recommend_datetime', time());
        set_session('ss_recommendmail_count', $recommendMailCount);
    }

    $item = DB::fetch(
        "SELECT it_id, it_name, it_price, it_seo_title FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? AND it_use = 1 LIMIT 1",
        [$it_id]
    );
    if (!$item) Response::error('상품을 찾을 수 없습니다.', 404);

    if (defined('G5_LIB_PATH') && !function_exists('mailer') && is_file(G5_LIB_PATH . '/mailer.lib.php')) {
        require_once G5_LIB_PATH . '/mailer.lib.php';
    }

    global $config;
    if (!function_exists('mailer') || empty($config['cf_email_use'])) {
        // 메일 모듈 미설정 — 사용자엔 성공이지만 noop. 운영자에게 안내.
        Response::success(['sent' => false, 'reason' => 'mailer not configured']);
    }

    $recommendSiteName = (string) ($config['cf_title'] ?? 'Gnuboard5');
    $recommendSubject = $subjectInput !== ''
        ? $subjectInput
        : '[' . $recommendSiteName . '] ' . ($fromName ?: 'recommender') . ' recommended ' . $item['it_name'];
    $recommendContent = nl2br(function_exists('get_text') ? get_text($message) : htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
    if ($toName !== '') {
        $recommendContent = (function_exists('get_text') ? get_text($toName) : htmlspecialchars($toName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'))
            . "<br><br>"
            . $recommendContent;
    }

    if (defined('G5_LIB_PATH')) {
        if (!function_exists('get_it_image') && is_file(G5_LIB_PATH . '/shop.lib.php')) {
            require_once G5_LIB_PATH . '/shop.lib.php';
        }
        if (!function_exists('shop_item_url') && is_file(G5_LIB_PATH . '/shop.uri.lib.php')) {
            require_once G5_LIB_PATH . '/shop.uri.lib.php';
        }
    }

    $it_id = (string) $item['it_id'];
    $it_name = $item['it_name'];
    $it_mimg = function_exists('get_it_image')
        ? get_it_image($it_id, (int) ($default['de_mimg_width'] ?? 300), (int) ($default['de_mimg_height'] ?? 300))
        : '';
    $from_name = function_exists('get_text') ? get_text($fromName) : $fromName;

    if (defined('G5_SHOP_PATH') && is_file(G5_SHOP_PATH . '/mail/itemrecommend.mail.php')) {
        $subject = $recommendSubject;
        $content = $recommendContent;
        ob_start();
        include G5_SHOP_PATH . '/mail/itemrecommend.mail.php';
        $recommendBody = (string) ob_get_clean();
        @mailer($from_name ?: $recommendSiteName, $fromEmail, $toEmail, $recommendSubject, $recommendBody, 1);
    } else {
        $itemPath = function_exists('api_shop_product_href')
            ? api_shop_product_href($it_id, $item['it_seo_title'] ?? '')
            : ('/shop/products/' . $it_id);
        $itemUrl = defined('APP_BASE_URL_CONST')
            ? (rtrim(APP_BASE_URL_CONST, '/') . $itemPath)
            : $itemPath;
        $recommendBody = ($from_name ?: 'recommender') . " recommended this product.\n\n"
            . $item['it_name'] . ' ' . number_format((int) $item['it_price']) . "\n"
            . $itemUrl . "\n\n"
            . ($message !== '' ? "[Message]\n" . $message . "\n\n" : '')
            . $recommendSiteName . "\n";
        @mailer($from_name ?: $recommendSiteName, $fromEmail, $toEmail, $recommendSubject, $recommendBody, 0);
    }

    Response::success(['sent' => true, 'template' => 'itemrecommend.mail.php']);
}

// =========================================================================
// POST /v1/shop/products/{it_id}/stock-notify  { hp }
//   재입고 SMS 알림 신청. it_soldout=1 또는 it_stock_qty<=0 인 상품에서
//   재입고 시 SMS 발송 대상 목록에 추가. 비회원도 휴대폰만 있으면 신청 가능.
// =========================================================================
if ($apiMethod === 'POST' && $it_id !== '' && ($shopSegments[1] ?? '') === 'stock-notify') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $hp = preg_replace('/[^0-9\-]/', '', (string) ($input['hp'] ?? ''));
    $hp = function_exists('hyphen_hp_number') ? hyphen_hp_number($hp) : $hp;
    $agreeValue = $input['agree'] ?? $input['privacy_agree'] ?? $input['ss_agree'] ?? '';
    $agree = is_bool($agreeValue)
        ? $agreeValue
        : in_array(strtolower(trim((string) $agreeValue)), array('1', 'y', 'yes', 'true', 'on'), true);

    $stockSmsItem = DB::fetch(
        "SELECT it_id, it_name, it_soldout, it_stock_sms FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? AND it_use = 1 LIMIT 1",
        [$it_id]
    );
    if (!$stockSmsItem) {
        Response::error('상품을 찾을 수 없습니다.', 404);
    }
    if ((int) ($stockSmsItem['it_soldout'] ?? 0) !== 1 || (int) ($stockSmsItem['it_stock_sms'] ?? 0) !== 1) {
        Response::error('재입고 SMS 알림을 신청할 수 없는 상품입니다.', 409);
    }
    if ($hp === '' || strlen(preg_replace('/-/', '', $hp)) < 9) {
        Response::error('휴대폰 번호가 올바르지 않습니다.', 422);
    }
    if (!$agree) {
        Response::error('개인정보처리방침 안내에 동의해 주세요.', 422);
    }

    $item = $stockSmsItem;

    // 동일 (it_id, hp) 미발송 신청이 이미 있으면 idempotent.
    $exists = DB::count(
        "SELECT COUNT(*) FROM " . DB::table('g5_shop_item_stocksms_table') . "
         WHERE it_id = ? AND ss_hp = ? AND ss_send = 0",
        [$it_id, $hp]
    );
    if ($exists > 0) {
        Response::error('이미 재입고 SMS 알림 신청이 등록되어 있습니다.', 409, [
            'already_subscribed' => true,
        ]);
    }

    $stockSmsTime = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_item_stocksms_table') . "
         SET it_id = ?, ss_hp = ?, ss_send = 0, ss_datetime = ?, ss_ip = ?",
        [$it_id, $hp, $stockSmsTime, $_SERVER['REMOTE_ADDR'] ?? '']
    );

    Response::success(['it_id' => $it_id, 'hp' => $hp, 'subscribed' => true], 201);
}

Response::error('Method not allowed.', 405);
