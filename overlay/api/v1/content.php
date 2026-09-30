<?php
/**
 * Gnuboard5 REST API - Content Endpoint
 *
 * Routes handled (prefix: v1/content):
 *   GET /v1/content              - List content pages for navigation/sitemap
 *   GET /v1/content/{co_id}       - Get content by co_id (e.g. company, privacy, provision)
 *   GET /v1/content/seo/{slug}    - Get content by co_seo_title
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';
$seg1 = isset($apiSegments[1]) ? $apiSegments[1] : '';
$co_id = preg_replace('/[^a-z0-9_]/i', '', $seg0);
$contentTable = DB::table('content_table');

if ($seg0 === '') {
    $rows = DB::readFetchAll(
        "SELECT co_id, co_subject, co_seo_title FROM {$contentTable} ORDER BY co_id ASC"
    );

    $items = array_map(function ($row) {
        return [
            'co_id'        => isset($row['co_id']) ? (string) $row['co_id'] : '',
            'co_subject'   => isset($row['co_subject']) ? (string) $row['co_subject'] : '',
            'co_seo_title' => isset($row['co_seo_title']) ? (string) $row['co_seo_title'] : '',
        ];
    }, $rows);

    Response::success($items);
}

if ($seg0 === 'seo') {
    $seo_title = trim(rawurldecode((string) $seg1));
    if ($seo_title === '') {
        Response::error('Content SEO title is required.', 400);
    }
    $resolved = DB::fetch(
        "SELECT co_id FROM {$contentTable} WHERE co_seo_title = ? LIMIT 1",
        [$seo_title]
    );

    if (!$resolved || !$resolved['co_id']) {
        Response::error('Content not found.', 404);
    }

    $co_id = $resolved['co_id'];
}

if (!$co_id) {
    Response::error('Content ID is required.', 400);
}

// g5_content 테이블에서 조회
$co = DB::fetch("SELECT * FROM {$contentTable} WHERE co_id = ?", [$co_id]);

if (!$co) {
    Response::error('Content not found.', 404);
}

// 컨텐츠 HTML 처리
$content = $co['co_content'];

// co_html 값에 따른 처리 (0: text, 1: html, 2: html+auto_br)
if ($co['co_html'] == 0) {
    $content = htmlspecialchars($content);
    $content = nl2br($content);
} elseif ($co['co_html'] == 2) {
    $content = nl2br($content);
}

// 템플릿 변수 치환 (레거시와 동일)
$config = api_get_config();
$default = [];

// 쇼핑몰 설정 조회
try {
    $defaultTable = DB::table('shop_default_table');
    $default = DB::fetch("SELECT * FROM {$defaultTable}");
} catch (Exception $e) {
    // shop_default_table이 없을 수 있음
}

$replacements = [
    '/{{쇼핑몰명}}|{{홈페이지제목}}/' => isset($config['cf_title']) ? $config['cf_title'] : '',
];

if ($default) {
    $replacements['/{{회사명}}|{{상호}}/'] = isset($default['de_admin_company_name']) ? $default['de_admin_company_name'] : '';
    $replacements['/{{대표자명}}/'] = isset($default['de_admin_company_owner']) ? $default['de_admin_company_owner'] : '';
    $replacements['/{{사업자등록번호}}/'] = isset($default['de_admin_company_saupja_no']) ? $default['de_admin_company_saupja_no'] : '';
    $replacements['/{{대표전화번호}}/'] = isset($default['de_admin_company_tel']) ? $default['de_admin_company_tel'] : '';
    $replacements['/{{팩스번호}}/'] = isset($default['de_admin_company_fax']) ? $default['de_admin_company_fax'] : '';
    $replacements['/{{통신판매업신고번호}}/'] = isset($default['de_admin_company_tongsin_no']) ? $default['de_admin_company_tongsin_no'] : '';
    $replacements['/{{사업장우편번호}}/'] = isset($default['de_admin_company_zip']) ? $default['de_admin_company_zip'] : '';
    $replacements['/{{사업장주소}}/'] = isset($default['de_admin_company_addr']) ? $default['de_admin_company_addr'] : '';
    $replacements['/{{운영자명}}|{{관리자명}}/'] = isset($default['de_admin_name']) ? $default['de_admin_name'] : '';
    $replacements['/{{운영자e-mail}}|{{관리자e-mail}}/i'] = isset($default['de_admin_email']) ? $default['de_admin_email'] : '';
    $replacements['/{{정보관리책임자명}}/'] = isset($default['de_admin_info_name']) ? $default['de_admin_info_name'] : '';
    $replacements['/{{정보관리책임자e-mail}}|{{정보책임자e-mail}}/i'] = isset($default['de_admin_info_email']) ? $default['de_admin_info_email'] : '';
}

$content = preg_replace(
    array_keys($replacements),
    array_values($replacements),
    $content
);

Response::success([
    'co_id'      => $co['co_id'],
    'co_subject' => $co['co_subject'],
    'co_content' => $content,
    'co_seo_title' => isset($co['co_seo_title']) ? $co['co_seo_title'] : '',
    'co_mobile_content' => isset($co['co_mobile_content']) ? $co['co_mobile_content'] : '',
    'co_html'    => (int) $co['co_html'],
    'co_skin'    => $co['co_skin'],
]);
