<?php
/**
 * Gnuboard5 REST API - Shop Banners
 *
 * GET /v1/shop/banners - Active mobile/main banners for app home.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

function api_shop_banner_image_url(array $row): string
{
    $id = (int) ($row['bn_id'] ?? 0);
    if ($id <= 0) {
        return '';
    }

    $path = G5_DATA_PATH . '/banner/' . $id;
    if (!is_file($path)) {
        return '';
    }

    $stamp = preg_replace('/[^0-9]/', '', (string) ($row['bn_time'] ?? ''));
    // 첫 화면 배너 — 1920 폭 안으로 맞추고 받아 주는 브라우저에는 WebP 로(lib/image-variants.php).
    return api_image_url_with_width(shop_api_image_url('banner', (string) $id) . ($stamp ? '?' . $stamp : ''), 1920);
}

function api_shop_banner_summary(array $row): array
{
    $id = (int) $row['bn_id'];
    $hitUrl = defined('G5_SHOP_URL') && G5_SHOP_URL
        ? rtrim(G5_SHOP_URL, '/') . '/bannerhit.php?bn_id=' . $id
        : '';

    return [
        'bn_id' => $id,
        'bn_alt' => $row['bn_alt'] ?? '',
        'bn_url' => $row['bn_url'] ?? '',
        'bn_position' => $row['bn_position'] ?? '',
        'bn_device' => $row['bn_device'] ?? '',
        'bn_border' => (int) ($row['bn_border'] ?? 0),
        'bn_new_win' => (int) ($row['bn_new_win'] ?? 0),
        'bn_order' => (int) ($row['bn_order'] ?? 0),
        'image_url' => api_shop_banner_image_url($row),
        'hit_url' => $hitUrl,
    ];
}

function api_shop_banner_redirect_url(array $row): string
{
    $url = trim((string) ($row['bn_url'] ?? ''));
    if ($url === '') {
        return defined('G5_SHOP_URL') && G5_SHOP_URL ? rtrim(G5_SHOP_URL, '/') : '/shop';
    }

    if (function_exists('clean_xss_tags')) {
        $url = clean_xss_tags($url);
    } else {
        $url = strip_tags($url);
    }

    return trim($url);
}

function api_shop_banner_should_count_hit($value): bool
{
    if (is_array($value)) {
        $value = reset($value);
    }

    $normalized = strtolower(trim((string) $value));
    return $normalized === ''
        || ($normalized !== '0'
            && $normalized !== 'false'
            && $normalized !== 'no'
            && $normalized !== 'off');
}

if ($apiMethod === 'GET' && isset($shopSegments[1]) && $shopSegments[1] === 'hit') {
    $bannerId = (int) ($shopSegments[0] ?? 0);
    if ($bannerId <= 0) {
        Response::error('Invalid banner id.', 422);
    }

    $bannerTable = DB::table('g5_shop_banner_table');
    $row = DB::fetch(
        "SELECT bn_id, bn_alt, bn_url, bn_position, bn_device, bn_border, bn_new_win, bn_order, bn_time
           FROM {$bannerTable}
          WHERE bn_id = ?
          LIMIT 1",
        [$bannerId]
    );

    if (!$row || empty($row['bn_id'])) {
        Response::error('Banner not found.', 404);
    }

    $countHit = api_shop_banner_should_count_hit($_GET['count'] ?? $_GET['hit'] ?? '1');
    if ($countHit) {
        DB::execute(
            "UPDATE {$bannerTable}
                SET bn_hit = bn_hit + 1
              WHERE bn_id = ?",
            [$bannerId]
        );
    }

    Response::success([
        'banner' => api_shop_banner_summary($row),
        'redirect_url' => api_shop_banner_redirect_url($row),
        'counted' => $countHit,
    ]);
}

if ($apiMethod === 'GET') {
    $position = trim((string) ($_GET['position'] ?? '메인'));
    if ($position === '') {
        $position = '메인';
    }

    $device = strtolower(trim((string) ($_GET['device'] ?? 'all')));
    if ($device === 'pc') {
        $devices = ['pc', 'both', ''];
    } elseif ($device === 'mobile') {
        $devices = ['mobile', 'both', ''];
    } else {
        $devices = ['pc', 'mobile', 'both', ''];
    }

    $devicePlaceholders = implode(',', array_fill(0, count($devices), '?'));
    $bannerTable = DB::table('g5_shop_banner_table');
    $rows = DB::fetchAll(
        "SELECT bn_id, bn_alt, bn_url, bn_position, bn_device, bn_border, bn_new_win, bn_order, bn_time
           FROM {$bannerTable}
          WHERE bn_position = ?
            AND bn_device IN ({$devicePlaceholders})
            AND NOW() BETWEEN bn_begin_time AND bn_end_time
          ORDER BY bn_order ASC, bn_id DESC
          LIMIT 20",
        array_merge([$position], $devices)
    );

    $items = [];
    foreach ($rows as $row) {
        $item = api_shop_banner_summary($row);
        if ($item['image_url'] !== '') {
            $items[] = $item;
        }
    }

    Response::success($items);
}

Response::error('Method not allowed.', 405);
