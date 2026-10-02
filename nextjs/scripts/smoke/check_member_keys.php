<?php
/**
 * 회원 공개 키(api/lib/member_key_helpers.php) 로컬 점검 — 돌고 있는 로컬 API 와 DB 에 대고 확인한다.
 *   php scripts/smoke/check_member_keys.php [--base=http://localhost/api/v1]   (npm run check:member-keys)
 *
 * 확인하는 것: 키 만들기 · 같은 키 다시 받기, 대소문자까지 같아야 받기, 자기소개에서 남의 아이디 비우기,
 * 예전 주소(아이디)도 받기, 서버가 예전 주소(bbs/profile.php)를 키 주소로 넘기기, 새글 키 필터 = 아이디 필터 ·
 * 모르는 키는 0건, 키 조회는 없는 아이디만 세기, 예전 회원의 키 무효 · 새로 발급, 표가 없을 때 물러서기.
 * DB 가 필요해서 npm run check 에는 넣지 않았다. 로컬 DB 가 아니면 돌지 않는다. 남기는 것은 회원 키 줄뿐이다
 * (요청 한도 카운트는 지운다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

$base = 'http://localhost/api/v1';
foreach ($argv ?? [] as $arg) {
    if (strpos($arg, '--base=') === 0) {
        $base = rtrim(substr($arg, 7), '/');
    }
}
if (getenv('G5_SMOKE_API_BASE')) {
    $base = rtrim((string) getenv('G5_SMOKE_API_BASE'), '/');
}

$root = dirname(__DIR__, 3);
chdir($root);
// CLI 에는 없는 웹 서버 값 — common.php 가 읽는다.
$_SERVER['HTTP_HOST'] = $_SERVER['HTTP_HOST'] ?? 'localhost';
$_SERVER['REQUEST_URI'] = $_SERVER['REQUEST_URI'] ?? '/';
$_SERVER['SERVER_PORT'] = $_SERVER['SERVER_PORT'] ?? '80';
$_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
ob_start();
require_once $root . '/common.php';
ob_end_clean();
require_once $root . '/api/lib/DB.php';
require_once $root . '/api/lib/JWT.php';
require_once $root . '/api/lib/Response.php';
require_once $root . '/api/lib/Auth.php';
require_once $root . '/api/lib/member_key_helpers.php';

$dbHost = defined('G5_MYSQL_HOST') ? strtolower((string) G5_MYSQL_HOST) : '';
if (!in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    fwrite(STDERR, "[check-member-keys] refusing to run against a non-local database\n");
    exit(1);
}

$failures = 0;
$count = 0;
function mk_expect(string $label, $actual, $expected): void
{
    global $failures, $count;
    $count++;
    if ($actual !== $expected) {
        $failures++;
        echo "FAIL  {$label}: expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n";
    }
}

/** @return array{0:int, 1:array} [status, json] */
function mk_get(string $url, string $token = ''): array
{
    $headers = "Accept: application/json\r\n" . ($token !== '' ? "Authorization: Bearer {$token}\r\n" : '');
    $body = @file_get_contents($url, false, stream_context_create(['http' => ['header' => $headers, 'ignore_errors' => true, 'timeout' => 15]]));
    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
            $status = (int) $m[1];
        }
    }
    $json = json_decode((string) $body, true);
    return [$status, is_array($json) ? $json : []];
}

$memberTable = DB::table('member_table');
$keyTable = api_member_key_table();
if ($keyTable === '') {
    fwrite(STDERR, "[check-member-keys] member_public_key table is missing — open the API once (Schema::ensure) or run adm/dbupgrade.php\n");
    exit(1);
}

// 서로 다른 일반 회원 둘(자기소개 공개). 보는 사람 · 보이는 사람.
$open = DB::fetchAll(
    "SELECT * FROM {$memberTable}
      WHERE mb_open = 1 AND mb_level BETWEEN 2 AND 9 AND mb_leave_date = '' AND mb_intercept_date = ''
      ORDER BY mb_no LIMIT 2"
);
if (count($open) < 2) {
    fwrite(STDERR, "[check-member-keys] need two open, non-admin members in the local DB\n");
    exit(1);
}
[$viewer, $target] = $open;
$viewerToken = Auth::generateToken($viewer);
$targetToken = Auth::generateToken($target);
$targetId = (string) $target['mb_id'];

// 1) 키 만들기 · 다시 받기 · 표와 같은지
[$status, $json] = mk_get("{$base}/members/" . rawurlencode($targetId) . '/key');
$key = (string) ($json['data']['mb_key'] ?? '');
mk_expect('key route 200', $status, 200);
mk_expect('key shape', api_is_member_key($key), true);
[, $again] = mk_get("{$base}/members/" . rawurlencode($targetId) . '/key');
mk_expect('same key again', (string) ($again['data']['mb_key'] ?? ''), $key);
$row = DB::fetch("SELECT mk_key FROM {$keyTable} WHERE mb_id = ?", [$targetId]);
mk_expect('key stored', (string) ($row['mk_key'] ?? ''), $key);

// 2) 자기소개: 남에게는 아이디를 비우고 키를 준다, 본인에게는 아이디, 예전 주소(아이디)도 받는다
[$status, $json] = mk_get("{$base}/members/{$key}/profile", $viewerToken);
mk_expect('profile by key 200', $status, 200);
mk_expect('profile hides id from others', (string) ($json['data']['member']['mb_id'] ?? 'x'), '');
mk_expect('profile gives key', (string) ($json['data']['member']['mb_key'] ?? ''), $key);
[, $json] = mk_get("{$base}/members/{$key}/profile", $targetToken);
mk_expect('profile shows id to self', (string) ($json['data']['member']['mb_id'] ?? ''), $targetId);
[$status] = mk_get("{$base}/members/" . rawurlencode($targetId) . '/profile', $viewerToken);
mk_expect('legacy id profile 200', $status, 200);

// 3) 대소문자까지 같아야 받는다
$flipped = strtolower($key) !== $key ? strtolower($key) : strtoupper($key);
if ($flipped !== $key) {
    [$status] = mk_get("{$base}/members/{$flipped}/profile", $viewerToken);
    mk_expect('case-changed key rejected', $status, 404);
}

// 3-1) 서버가 예전 주소를 처음부터 키 주소로 넘긴다(plugin/webapp/bridge/runtime.php). 없는 회원은 예전처럼 아이디.
$site = preg_replace('#/api/v1$#', '', $base);
$location = static function (string $url): string {
    @file_get_contents($url, false, stream_context_create(['http' => ['follow_location' => 0, 'ignore_errors' => true, 'timeout' => 15]]));
    foreach ($http_response_header ?? [] as $line) {
        if (stripos($line, 'Location:') === 0) {
            return (string) parse_url(trim(substr($line, 9)), PHP_URL_PATH);
        }
    }
    return '';
};
mk_expect('legacy profile redirects to key', $location("{$site}/bbs/profile.php?mb_id=" . rawurlencode($targetId)), "/members/{$key}");
// 비회원의 없는 아이디는 키 조회와 같은 한도로 센다(서버 IP 가 어느 모양으로 보일지 몰라 후보를 다 본다).
$guestQuotaKeys = array_map(
    static fn(string $ip): string => '__q_memberkeymiss_' . substr(hash('sha256', 'ip:' . $ip), 0, 16),
    ['127.0.0.1', '::1', 'localhost', (string) gethostbyname((string) parse_url($site, PHP_URL_HOST))]
);
$guestQuotaRows = static function () use ($guestQuotaKeys): int {
    $marks = implode(',', array_fill(0, count($guestQuotaKeys), '?'));
    return DB::count('SELECT COUNT(*) FROM ' . DB::table('login_attempt_table') . " WHERE mb_id IN ({$marks})", $guestQuotaKeys);
};
$guestBefore = $guestQuotaRows();
mk_expect('legacy profile of unknown id keeps id', $location("{$site}/bbs/profile.php?mb_id=zz_no_member"), '/members/zz_no_member');
mk_expect('legacy miss counted like key misses', $guestQuotaRows(), $guestBefore + 1);
$location("{$site}/bbs/profile.php?mb_id=" . rawurlencode($targetId));
mk_expect('legacy hit not counted', $guestQuotaRows(), $guestBefore + 1);
$marks = implode(',', array_fill(0, count($guestQuotaKeys), '?'));
DB::execute('DELETE FROM ' . DB::table('login_attempt_table') . " WHERE mb_id IN ({$marks})", $guestQuotaKeys);

// 4) 새글: 키 필터 = 아이디 필터, 모르는 키는 0건
[, $byId] = mk_get("{$base}/recent?limit=1&mb_id=" . rawurlencode($targetId));
[, $byKey] = mk_get("{$base}/recent?limit=1&mb_key=" . rawurlencode($key));
mk_expect('recent key filter = id filter', (int) ($byKey['meta']['total'] ?? -1), (int) ($byId['meta']['total'] ?? -2));
[, $unknown] = mk_get("{$base}/recent?limit=1&mb_key=AAAAAAA-BBBBBBB");
mk_expect('recent unknown key empty', (int) ($unknown['meta']['total'] ?? -1), 0);
// fallback=latest(홈 위젯)는 필터와 함께면 받지 않는다 — 모르는 키 + fallback 도 0건
[, $unknownLatest] = mk_get("{$base}/recent?limit=1&fallback=latest&mb_key=AAAAAAA-BBBBBBB");
mk_expect('fallback ignored with filters', (int) ($unknownLatest['meta']['total'] ?? -1), 0);

// 5) 키 조회 한도: 있는 아이디는 세지 않고, 없는 아이디만 한 번씩 센다(보는 사람 회원 단위)
$quotaKey = '__q_memberkeymiss_' . substr(hash('sha256', 'mb:' . (string) $viewer['mb_id']), 0, 16);
$attemptTable = DB::table('login_attempt_table');
$countRows = static fn(): int => DB::count("SELECT COUNT(*) FROM {$attemptTable} WHERE mb_id = ?", [$quotaKey]);
$before = $countRows();
mk_get("{$base}/members/" . rawurlencode($targetId) . '/key', $viewerToken);
mk_get("{$base}/members/" . rawurlencode($targetId) . '/key', $viewerToken);
mk_expect('hits are not counted', $countRows(), $before);
[$status] = mk_get("{$base}/members/zz_no_such_member_x/key", $viewerToken);
mk_expect('miss is 404', $status, 404);
mk_expect('miss counted once', $countRows(), $before + 1);
DB::execute("DELETE FROM {$attemptTable} WHERE mb_id = ?", [$quotaKey]);

// 6) 예전 회원의 키: 키를 만든 뒤에 같은 아이디로 새로 가입한 것처럼(가입 시각 > 키 시각) 만들면
//    예전 키는 받지 않고, 키를 다시 물으면 새 키를 준다. (이 회원의 키는 바뀐 채로 남는다 — 로컬 점검용)
DB::execute(
    "UPDATE {$keyTable} k JOIN {$memberTable} m ON m.mb_id = k.mb_id
        SET k.created_at = DATE_SUB(m.mb_datetime, INTERVAL 1 DAY) WHERE k.mb_id = ?",
    [$targetId]
);
[$status] = mk_get("{$base}/members/{$key}/profile", $viewerToken);
mk_expect('stale key rejected', $status, 404);
[$status, $json] = mk_get("{$base}/members/" . rawurlencode($targetId) . '/key');
$renewed = (string) ($json['data']['mb_key'] ?? '');
mk_expect('stale key renewed', api_is_member_key($renewed) && $renewed !== $key, true);
mk_expect('one key row after renewal', DB::count("SELECT COUNT(*) FROM {$keyTable} WHERE mb_id = ?", [$targetId]), 1);

// 7) 표가 없는 설치본: 예외 없이 '' 로 물러선다(요청마다 information_schema 를 보지 않고 쿼리 실패로 안다).
$savedTable = $g5['member_public_key_table'];
$g5['member_public_key_table'] = G5_TABLE_PREFIX . 'zz_no_such_member_key_table';
mk_expect('missing table: no key', api_member_public_key($targetId), '');
mk_expect('missing table: key unresolved', api_member_id_from_key($renewed), '');
mk_expect('missing table remembered', api_member_key_table(), '');
$g5['member_public_key_table'] = $savedTable;
mk_expect('real table still usable', api_member_id_from_key($renewed), $targetId);

echo ($failures === 0 ? "[check-member-keys] {$count} checks passed\n" : "[check-member-keys] {$failures}/{$count} failed\n");
exit($failures === 0 ? 0 : 1);
