<?php
/*
 * G5 Next.js 25 install diagnostic.
 *
 * Upload location: /nextjs-install/check.php
 * Run as a super administrator after extracting the release zip.
 */

@ini_set('display_errors', '0');

$root = dirname(__DIR__);
$common_path = $root . '/common.php';
$common_loaded = false;

if (is_file($common_path)) {
    include_once $common_path;
    $common_loaded = defined('_GNUBOARD_');
}

function nextjs25_h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function nextjs25_render_page($title, $checks, $manual_links = array())
{
    $counts = array('ok' => 0, 'warning' => 0, 'error' => 0);
    foreach ($checks as $check) {
        $counts[$check['status']]++;
    }

    header('Content-Type: text/html; charset=utf-8');
    ?>
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?php echo nextjs25_h($title); ?></title>
  <style>
    body { margin: 0; background: #f6f7f9; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 56px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    p { line-height: 1.65; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0; }
    .pill { border-radius: 999px; padding: 6px 12px; font-size: 14px; font-weight: 700; }
    .ok { background: #dcfce7; color: #166534; }
    .warning { background: #fef3c7; color: #92400e; }
    .error { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e7eb; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { background: #f9fafb; font-size: 13px; color: #4b5563; }
    tr:last-child td { border-bottom: 0; }
    code { background: #f3f4f6; border-radius: 4px; padding: 2px 5px; }
    .links { margin-top: 24px; background: #fff; border: 1px solid #e5e7eb; padding: 16px; }
    .links a { color: #075985; }
  </style>
</head>
<body>
<main>
  <h1><?php echo nextjs25_h($title); ?></h1>
  <p>이 화면은 배포 ZIP을 그누보드 루트에 푼 뒤, 필수 파일과 런타임 테이블 상태를 빠르게 확인합니다.</p>
  <div class="summary">
    <span class="pill ok">정상 <?php echo (int) $counts['ok']; ?></span>
    <span class="pill warning">확인 필요 <?php echo (int) $counts['warning']; ?></span>
    <span class="pill error">오류 <?php echo (int) $counts['error']; ?></span>
  </div>
  <table>
    <thead>
      <tr>
        <th>상태</th>
        <th>구분</th>
        <th>항목</th>
        <th>상세</th>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($checks as $check) { ?>
      <tr>
        <td><span class="pill <?php echo nextjs25_h($check['status']); ?>"><?php echo nextjs25_h($check['label']); ?></span></td>
        <td><?php echo nextjs25_h($check['section']); ?></td>
        <td><?php echo nextjs25_h($check['name']); ?></td>
        <td><?php echo $check['detail'] !== '' ? nextjs25_h($check['detail']) : '&nbsp;'; ?></td>
      </tr>
    <?php } ?>
    </tbody>
  </table>

  <?php if (!empty($manual_links)) { ?>
  <div class="links">
    <strong>수동 확인 링크</strong>
    <ul>
      <?php foreach ($manual_links as $link) { ?>
      <li><a href="<?php echo nextjs25_h($link); ?>" target="_blank" rel="noreferrer"><?php echo nextjs25_h($link); ?></a></li>
      <?php } ?>
    </ul>
  </div>
  <?php } ?>
</main>
</body>
</html>
    <?php
}

function nextjs25_add_check(&$checks, $section, $name, $passed, $detail = '', $level = 'error')
{
    if ($passed) {
        $status = 'ok';
        $label = '정상';
    } else {
        $status = $level === 'warning' ? 'warning' : 'error';
        $label = $status === 'warning' ? '확인 필요' : '오류';
    }

    $checks[] = array(
        'section' => $section,
        'name' => $name,
        'status' => $status,
        'label' => $label,
        'detail' => $detail,
    );
}

function nextjs25_relative_exists(&$checks, $root, $path, $label, $type = 'file', $level = 'error')
{
    $absolute = $root . '/' . $path;
    $ok = $type === 'dir' ? is_dir($absolute) : is_file($absolute);
    nextjs25_add_check($checks, '파일', $label, $ok, $path, $level);
}

function nextjs25_sql_escape_value($value)
{
    if (function_exists('sql_escape_string')) {
        return sql_escape_string($value);
    }

    return addslashes($value);
}

function nextjs25_table_exists($table)
{
    if (!function_exists('sql_query') || !function_exists('sql_fetch_array')) {
        return null;
    }

    $safe_table = nextjs25_sql_escape_value($table);
    $result = @sql_query("SHOW TABLES LIKE '{$safe_table}'", false);
    if (!$result) {
        return null;
    }

    return sql_fetch_array($result) ? true : false;
}

$checks = array();

nextjs25_add_check(
    $checks,
    '그누보드',
    'common.php 로드',
    $common_loaded,
    $common_loaded ? '그누보드 환경을 불러왔습니다.' : 'nextjs25-install 폴더가 그누보드 루트 바로 아래에 있는지 확인하세요.'
);

if ($common_loaded && (!isset($is_admin) || $is_admin !== 'super')) {
    nextjs25_add_check($checks, '보안', '관리자 권한', false, '최고관리자로 로그인한 뒤 다시 실행하세요.');
    nextjs25_render_page('G5 Next.js 25 설치 진단', $checks);
    exit;
}

nextjs25_add_check($checks, 'PHP', 'PHP 버전', version_compare(PHP_VERSION, '7.4.0', '>='), PHP_VERSION, 'warning');
nextjs25_add_check($checks, 'PHP', 'json 확장', extension_loaded('json'), 'API 응답 처리에 필요합니다.');
nextjs25_add_check($checks, 'PHP', 'mbstring 확장', extension_loaded('mbstring'), '문자열 처리에 필요합니다.', 'warning');
nextjs25_add_check($checks, 'PHP', 'curl 확장', extension_loaded('curl'), '소셜 로그인/외부 연동에 필요할 수 있습니다.', 'warning');
nextjs25_add_check($checks, 'PHP', 'openssl 확장', extension_loaded('openssl'), '인증/토큰 처리에 필요할 수 있습니다.', 'warning');

nextjs25_relative_exists($checks, $root, 'api/index.php', 'API 라우터');
nextjs25_relative_exists($checks, $root, 'api/.htaccess', 'API Apache rewrite', 'file', 'warning');
nextjs25_relative_exists($checks, $root, 'api/v1/settings.php', '설정 API');
nextjs25_relative_exists($checks, $root, 'plugin/webapp/bridge/common.php', 'Next.js 공용 런타임 헬퍼');
nextjs25_relative_exists($checks, $root, 'plugin/webapp/bridge/route.php', 'Next.js 공용 라우트 프론트 컨트롤러');
nextjs25_relative_exists($checks, $root, 'plugin/webapp/bridge/runtime.php', '런타임 부팅(주소·rewrite 훅)');
nextjs25_relative_exists($checks, $root, 'plugin/webapp/notify/tables.php', '표 등록/마이그레이션');
nextjs25_relative_exists($checks, $root, 'extend/webapp.extend.php', '그누보드 extend 로더');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/route.php', '테마 라우트 브리지');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/app-shell.php', '앱 셸 브리지');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/asset-responses.php', 'asset response bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/legacy-routes.php', 'legacy route bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/metadata.php', 'metadata bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/public-assets.php', 'public asset bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/render.php', 'render bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/security-headers.php', 'security header bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/bridge/static-paths.php', 'static app path bridge');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/app/index.html', '정적 export index');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/app/_next/static', 'Next.js 정적 청크', 'dir');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/app/.htaccess', 'Apache 앱 캐시 헤더', 'file', 'warning');
nextjs25_relative_exists($checks, $root, 'theme/nextjs_default/app/_next/static/.htaccess', 'Apache 청크 캐시 헤더', 'file', 'warning');

$root_htaccess = $root . '/.htaccess';
if (is_file($root_htaccess)) {
    $root_htaccess_text = (string) @file_get_contents($root_htaccess);
    nextjs25_add_check(
        $checks,
        '웹서버',
        'nextjs_default rewrite 규칙',
        strpos($root_htaccess_text, 'theme/nextjs_default/route.php') !== false && strpos($root_htaccess_text, '_next/') !== false,
        '.htaccess에 nextjs_default rewrite 블록이 보이는지 확인합니다.',
        'warning'
    );
} else {
    nextjs25_add_check($checks, '웹서버', '루트 .htaccess', false, 'nginx 환경이면 snippet 적용 여부를 별도로 확인하세요.', 'warning');
}

if ($common_loaded && isset($config) && is_array($config)) {
    $active_theme = isset($config['cf_theme']) ? (string) $config['cf_theme'] : '';
    nextjs25_add_check(
        $checks,
        '그누보드',
        '활성 테마',
        $active_theme === 'nextjs_default',
        $active_theme !== '' ? '현재 테마: ' . $active_theme : '테마 설정을 읽지 못했습니다.',
        'warning'
    );
}

$prefix = defined('G5_TABLE_PREFIX') ? G5_TABLE_PREFIX : 'g5_';
$tables = array(
    'user_dday',
    'push_token',
    'notification_log',
    'device',
    'push_queue',
    'refresh_token',
    'content_report',
    'member_block',
    'account_deletion_request',
    'login_attempt',
    'member_pref',
    'social_mobile_ticket',
);

if ($common_loaded) {
    foreach ($tables as $suffix) {
        $table = $prefix . $suffix;
        $exists = nextjs25_table_exists($table);
        nextjs25_add_check(
            $checks,
            'DB',
            $table,
            $exists === true,
            $exists === null ? 'DB 조회를 실행하지 못했습니다. /adm/dbupgrade.php 또는 tables.sql을 확인하세요.' : '',
            'warning'
        );
    }
}

$manual_links = array();
if (defined('G5_URL') && G5_URL) {
    $base_url = rtrim(G5_URL, '/');
    $manual_links[] = $base_url . '/api/v1/settings';
    $manual_links[] = $base_url . '/theme/nextjs_default/app/index.html';
    $manual_links[] = $base_url . '/';
    $manual_links[] = $base_url . '/boards';
    $manual_links[] = $base_url . '/shop';
}

nextjs25_render_page('G5 Next.js 25 설치 진단', $checks, $manual_links);
