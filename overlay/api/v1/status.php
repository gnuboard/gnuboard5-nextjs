<?php
/**
 * Gnuboard5 Next.js API deployment status.
 *
 * Public, read-only diagnostic endpoint for checking whether the uploaded API
 * overlay is current. It intentionally avoids exposing secrets or filesystem
 * paths.
 *
 * Route:
 *   GET /v1/status
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$dbOk = false;
$boardCount = null;
$boardNewCount = null;

try {
    $row = DB::fetch('SELECT 1 AS ok');
    $dbOk = isset($row['ok']) && (int) $row['ok'] === 1;

    $boardCount = DB::count('SELECT COUNT(*) FROM ' . DB::table('board_table'));
    $boardNewCount = DB::count('SELECT COUNT(*) FROM ' . DB::table('board_new_table'));
} catch (Throwable $e) {
    $dbOk = false;
    error_log('[api/status] Database check failed: ' . $e->getMessage());
}

Response::success(array(
    'name' => 'gnuboard5-nextjs25-api',
    'version' => '0.1.0',
    'time' => date('c'),
    'g5_url' => defined('G5_URL') ? G5_URL : '',
    'features' => array(
        'recent_write_table_fallback' => true,
        'social_signup_bridge' => true,
        'social_existing_account_link' => true,
        'shop_seo_short_url' => true,
    ),
    'configuration' => array(
        'cors_allowed_origins_configured' => g5_api_configured('G5_CORS_ALLOWED_ORIGINS'),
        'social_web_hosts_configured' => g5_api_configured('G5_SOCIAL_WEB_HOSTS'),
    ),
    'database' => array(
        'ok' => $dbOk,
        'board_count' => $boardCount,
        'board_new_count' => $boardNewCount,
    ),
    // 로그인에 필요한 확장 테이블이 갖춰졌는지. 파일만 올리고 dbupgrade 를 안 돌린 설치본을
    // 여기서 바로 가려낸다. ensure() 가 한 번 만들어 두므로 보통은 ok:true 다.
    'schema' => Schema::ensure(),
));
