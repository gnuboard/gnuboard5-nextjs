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

function nextjs25_render_page($title, $checks, $manual_links = array(), $actions_html = '')
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
    .links, .actions { margin-top: 24px; background: #fff; border: 1px solid #e5e7eb; padding: 16px; }
    .actions button { margin-top: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
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

  <?php echo $actions_html; // 이 파일이 만든 양식만(값은 nextjs25_h 로 감쌌다) ?>

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

/** PHP 가 세션 파일을 두는 폴더 — save_path 의 "N;/path" 꼴도 풀고, 비면 시스템 임시 폴더. */
function nextjs25_session_dir()
{
    $path = (string) session_save_path();
    if ($path === '') {
        $path = (string) ini_get('session.save_path');
    }
    if (strpos($path, ';') !== false) {
        $parts = explode(';', $path);
        $path = (string) end($parts);
    }
    if ($path === '') {
        $path = sys_get_temp_dir();
    }
    return rtrim($path, '/\\');
}

/**
 * 세션 폴더를 시간 한도 안에서 한 번 훑는다 — PHP 세션 청소(GC)가 하는 일(목록 + 파일마다 수정 시각)과 같아서
 * 걸린 시간이 곧 청소가 걸리는 요청이 멈추는 시간이다. $delete 면 만료된 이 계정의 sess_ 파일을 지운다.
 */
function nextjs25_scan_sessions($dir, $max_lifetime, $budget_seconds, $delete)
{
    $result = array('readable' => false, 'files' => 0, 'expired' => 0, 'deleted' => 0, 'complete' => false, 'seconds' => 0.0);
    $started = microtime(true);
    $handle = @opendir($dir);
    if (!$handle) {
        return $result;
    }
    $result['readable'] = true;
    $cutoff = time() - max(60, (int) $max_lifetime);
    $uid = function_exists('posix_geteuid') ? posix_geteuid() : null;
    $complete = true;
    while (($name = readdir($handle)) !== false) {
        if (strncmp($name, 'sess_', 5) !== 0) {
            continue;
        }
        $result['files']++;
        $file = $dir . '/' . $name;
        $mtime = @filemtime($file);
        if ($mtime !== false && $mtime < $cutoff) {
            $result['expired']++;
            if ($delete && preg_match('/^sess_[A-Za-z0-9,-]+$/', $name)
                && ($uid === null || @fileowner($file) === $uid) && @unlink($file)) {
                $result['deleted']++;
            }
        }
        if (($result['files'] & 255) === 0 && microtime(true) - $started > $budget_seconds) {
            $complete = false;
            break;
        }
    }
    closedir($handle);
    $result['complete'] = $complete;
    $result['seconds'] = microtime(true) - $started;
    return $result;
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

// 비밀번호 찾기 · 메일 인증 메일 — API 는 링크 주소가 정해졌을 때만 이 메일을 보낸다(요청의 Host 로 만든
// 주소는 쓰지 않는다). API 와 같은 판단을 쓰도록 api/lib/mail_link.php 를 읽는다. 없으면(예전 API) 건너뛴다.
$mail_link_lib = $root . '/api/lib/mail_link.php';
if ($common_loaded && is_file($mail_link_lib)) {
    include_once $mail_link_lib;
    $mail_link_base = function_exists('api_mail_link_base') ? api_mail_link_base() : '';
    nextjs25_add_check(
        $checks,
        '메일',
        '비밀번호 찾기 · 인증 메일 링크 주소',
        $mail_link_base !== '',
        $mail_link_base !== ''
            ? $mail_link_base
            : 'api/.env 에 NEXT_PUBLIC_APP_URL=https://내사이트 (또는 config.php 의 G5_DOMAIN)를 적어야 이 메일이 나갑니다. 하위 폴더면 폴더까지 적으세요.',
        'warning'
    );
    nextjs25_add_check(
        $checks,
        '메일',
        '메일발송 사용',
        isset($config['cf_email_use']) && !empty($config['cf_email_use']),
        '관리자 > 환경설정 > 기본환경설정의 "메일발송 사용"',
        'warning'
    );
}

// PHP 세션 파일 — 그누보드 코어는 요청마다 세션을 열고(쿠키 없이 오는 앱 · 봇 요청도 빈 세션 파일을 하나씩 만든다)
// 요청 1%마다 세션 폴더 전체를 훑어 오래된 파일을 지운다(gc_probability 1/100). 파일이 아주 많으면 그 1% 요청이
// 폴더를 훑는 동안 수 초씩 멈춘다. 셸 없는 호스팅에서도 여기서 상태를 보고 만료된 파일을 지울 수 있다.
$session_actions_html = '';
if ($common_loaded && session_status() === PHP_SESSION_ACTIVE) {
    $session_handler = (string) ini_get('session.save_handler');
    if ($session_handler !== 'files') {
        nextjs25_add_check($checks, '세션', 'PHP 세션 저장 방식', true, $session_handler . ' — 파일 세션이 아니라 이 점검은 해당 없음');
    } else {
        $session_dir = nextjs25_session_dir();
        $session_lifetime = (int) ini_get('session.gc_maxlifetime');
        if (empty($_SESSION['nextjs25_check_token'])) {
            $_SESSION['nextjs25_check_token'] = bin2hex(random_bytes(16));
        }
        $session_token = (string) $_SESSION['nextjs25_check_token'];
        $session_cleanup = isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST'
            && isset($_POST['nextjs25_session_cleanup'], $_POST['token'])
            && hash_equals($session_token, (string) $_POST['token']);
        if ($session_cleanup) {
            $cleaned = nextjs25_scan_sessions($session_dir, $session_lifetime, 20, true);
            nextjs25_add_check(
                $checks,
                '세션',
                '만료된 세션 파일 지우기',
                $cleaned['readable'],
                $cleaned['deleted'] . '개 지움(' . round($cleaned['seconds'], 1) . '초' . ($cleaned['complete'] ? '' : ' — 시간 한도로 중간에 멈춤, 다시 누르세요') . ')'
            );
        }
        $scan = nextjs25_scan_sessions($session_dir, $session_lifetime, 8, false);
        nextjs25_add_check($checks, '세션', 'PHP 세션 폴더', $scan['readable'], $session_dir . ($scan['readable'] ? '' : ' — 읽을 수 없음'), 'warning');
        if ($scan['readable']) {
            $session_slow = !$scan['complete'] || $scan['seconds'] > 1.0 || $scan['files'] > 20000;
            nextjs25_add_check(
                $checks,
                '세션',
                '세션 파일 수 · 한 번 훑는 시간',
                !$session_slow,
                ($scan['complete'] ? '' : '8초 안에 다 못 셈 — 최소 ') . number_format($scan['files']) . '개, 그중 만료(' . round($session_lifetime / 3600, 1) . '시간 넘음) '
                    . number_format($scan['expired']) . '개 · 훑는 데 ' . round($scan['seconds'], 2) . '초'
                    . ($session_slow ? ' — 요청 ' . ini_get('session.gc_probability') . '/' . ini_get('session.gc_divisor') . '마다 이만큼 멈춥니다' : ''),
                'warning'
            );
            if ($scan['expired'] > 0) {
                $session_actions_html = '<form class="actions" method="post"><strong>만료된 세션 파일 지우기</strong>'
                    . '<p>' . nextjs25_h(number_format($scan['expired'])) . '개 이상이 만료됐습니다. 이 계정 소유의 만료된 sess_ 파일만 지웁니다'
                    . '(한 번에 최대 20초 — 남으면 다시 누르세요). 로그인 중인 회원의 세션은 만료 전이라 지워지지 않습니다.</p>'
                    . '<input type="hidden" name="token" value="' . nextjs25_h($session_token) . '">'
                    . '<button type="submit" name="nextjs25_session_cleanup" value="1">만료된 세션 파일 지우기</button></form>';
            }
        }
    }
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

// 결제 확정 · 주문 만들기는 이름 잠금(GET_LOCK)을 둘 겹쳐 잡는다. MySQL 5.7.5 · MariaDB 10.0.2 보다 옛 DB 는
// 연결마다 잠금을 하나만 들어 둘째(회원) 잠금을 건너뛴다. /api/v1/status 의 database.multiple_named_locks 와 같은 판단.
if ($common_loaded && function_exists('sql_fetch')) {
    $db_version_row = @sql_fetch('SELECT VERSION() AS v', false);
    $db_version = is_array($db_version_row) && isset($db_version_row['v']) ? (string) $db_version_row['v'] : '';
    if (preg_match('/(\d+\.\d+\.\d+)-MariaDB/i', $db_version, $db_version_match)) {
        $db_multiple_locks = version_compare($db_version_match[1], '10.0.2', '>=');
    } elseif (preg_match('/^(\d+\.\d+\.\d+)/', $db_version, $db_version_match)) {
        $db_multiple_locks = version_compare($db_version_match[1], '5.7.5', '>=');
    } else {
        $db_multiple_locks = false;
    }
    nextjs25_add_check(
        $checks,
        'DB',
        'DB 버전 (이름 잠금 여러 개)',
        $db_multiple_locks,
        $db_multiple_locks
            ? $db_version
            : ($db_version !== '' ? $db_version . ' — ' : '')
                . 'MySQL 5.7.5 / MariaDB 10.0.2 이상을 권장합니다. 더 옛 DB 에서는 같은 회원의 주문 · 결제 확정을 함께 묶는 잠금을 건너뜁니다(쿠폰 중복 사용은 그래도 막습니다).',
        'warning'
    );
}

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

nextjs25_render_page('G5 Next.js 25 설치 진단', $checks, $manual_links, $session_actions_html);
