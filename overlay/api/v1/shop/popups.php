<?php
/**
 * Gnuboard5 REST API - Shop Popups
 *
 * GET /v1/shop/popups - Active mobile/shop popup layers for the app home.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

function api_shop_popup_plain($value): string
{
    return trim(html_entity_decode(strip_tags((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function api_shop_popup_summary(array $row): array
{
    return [
        'nw_id' => (int) ($row['nw_id'] ?? 0),
        'nw_division' => $row['nw_division'] ?? '',
        'nw_device' => $row['nw_device'] ?? '',
        'nw_begin_time' => $row['nw_begin_time'] ?? '',
        'nw_end_time' => $row['nw_end_time'] ?? '',
        'nw_disable_hours' => (int) ($row['nw_disable_hours'] ?? 0),
        'nw_width' => (int) ($row['nw_width'] ?? 0),
        'nw_height' => (int) ($row['nw_height'] ?? 0),
        'nw_subject' => api_shop_popup_plain($row['nw_subject'] ?? ''),
        'nw_content' => (string) ($row['nw_content'] ?? ''),
        'nw_content_text' => api_shop_popup_plain($row['nw_content'] ?? ''),
        'nw_content_html' => (int) ($row['nw_content_html'] ?? 0),
    ];
}

if ($apiMethod === 'GET') {
    $limit = max(1, min(10, (int) ($_GET['limit'] ?? 5)));
    $device = strtolower(trim((string) ($_GET['device'] ?? 'all')));
    if ($device === 'pc') {
        $devices = ['pc', 'both'];
    } elseif ($device === 'mobile') {
        $devices = ['mobile', 'both'];
    } else {
        $devices = ['pc', 'mobile', 'both'];
    }

    $devicePlaceholders = implode(',', array_fill(0, count($devices), '?'));
    // 팝업레이어관리의 "구분" — comm(커뮤니티) · shop(쇼핑몰) · both. 값을 안 주면 예전처럼 쇼핑몰.
    $division = strtolower(trim((string) ($_GET['division'] ?? 'shop'))) === 'comm' ? 'comm' : 'shop';
    $popupTable = DB::table('new_win_table');
    $rows = DB::fetchAll(
        "SELECT nw_id, nw_division, nw_device, nw_begin_time, nw_end_time, nw_disable_hours,
                nw_width, nw_height, nw_subject, nw_content, nw_content_html
           FROM {$popupTable}
          WHERE NOW() BETWEEN nw_begin_time AND nw_end_time
            AND nw_device IN ({$devicePlaceholders})
            AND nw_division IN ('both', ?)
          ORDER BY nw_id ASC
          LIMIT ?",
        array_merge($devices, [$division, $limit])
    );

    Response::success(array_map('api_shop_popup_summary', $rows));
}

Response::error('Method not allowed.', 405);
