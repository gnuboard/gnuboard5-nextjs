<?php
/**
 * Gnuboard5 REST API - FAQ Endpoints
 *
 * Routes handled (prefix: v1/faqs):
 *   GET /v1/faqs - FAQ categories and items (?fm_id, stx, page, per_page)
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

global $g5, $config;

if (!isset($g5['faq_table']) || !isset($g5['faq_master_table'])) {
    Response::error('FAQ tables are not configured.', 501);
}

$faqTable       = DB::table('faq_table');
$faqMasterTable = DB::table('faq_master_table');

function api_faq_meta($total, $page, $perPage)
{
    $total   = (int) $total;
    $page    = max(1, (int) $page);
    $perPage = max(1, (int) $perPage);

    return [
        'total'        => $total,
        'per_page'     => $perPage,
        'current_page' => $page,
        'last_page'    => (int) ceil($total / $perPage),
        'from'         => $total > 0 ? ($page - 1) * $perPage + 1 : null,
        'to'           => $total > 0 ? min($page * $perPage, $total) : null,
    ];
}

$masters = DB::fetchAll(
    "SELECT fm_id, fm_subject, fm_head_html, fm_tail_html,
            fm_mobile_head_html, fm_mobile_tail_html, fm_order
     FROM {$faqMasterTable}
     ORDER BY fm_order, fm_id"
);

foreach ($masters as &$master) {
    $master['fm_id']    = (int) $master['fm_id'];
    $master['fm_order'] = (int) $master['fm_order'];
}
unset($master);

if (!$masters) {
    Response::success([
        'masters' => [],
        'current' => null,
        'items'   => [],
        'meta'    => api_faq_meta(0, 1, 1),
    ]);
}

$requestedFmId = isset($_GET['fm_id']) ? (int) $_GET['fm_id'] : 0;
$current = null;
foreach ($masters as $master) {
    if (($requestedFmId > 0 && (int) $master['fm_id'] === $requestedFmId) || (!$current && $requestedFmId <= 0)) {
        $current = $master;
        break;
    }
}

if (!$current) {
    Response::error('FAQ category not found.', 404);
}

$page    = get_page_param(1);
$perPage = get_per_page_param(
    isset($config['cf_page_rows']) ? (int) $config['cf_page_rows'] : 15,
    100
);
$offset = ($page - 1) * $perPage;
$stx    = isset($_GET['stx']) ? trim((string) $_GET['stx']) : '';

$conditions = ['fm_id = ?'];
$params     = [(int) $current['fm_id']];

if ($stx !== '') {
    $conditions[] = '(fa_subject LIKE ? OR fa_content LIKE ?)';
    $params[] = '%' . $stx . '%';
    $params[] = '%' . $stx . '%';
}

$where = 'WHERE ' . implode(' AND ', $conditions);

$total = DB::count(
    "SELECT COUNT(*) FROM {$faqTable} {$where}",
    $params
);

$rows = DB::fetchAll(
    "SELECT fa_id, fm_id, fa_subject, fa_content, fa_order
     FROM {$faqTable}
     {$where}
     ORDER BY fa_order, fa_id
     LIMIT ? OFFSET ?",
    array_merge($params, [$perPage, $offset])
);

foreach ($rows as &$row) {
    $row['fa_id']    = (int) $row['fa_id'];
    $row['fm_id']    = (int) $row['fm_id'];
    $row['fa_order'] = (int) $row['fa_order'];
}
unset($row);

Response::success([
    'masters' => $masters,
    'current' => $current,
    'items'   => $rows,
    'meta'    => api_faq_meta($total, $page, $perPage),
]);
