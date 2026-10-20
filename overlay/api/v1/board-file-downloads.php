<?php
/**
 * 첨부 파일 내려받기 — 토큰(Bearer) 인증으로 앱이 받는다.
 *
 * GET /v1/board-file-downloads/{bo_table}/{wr_id}/{bf_no}
 *
 * bbs/download.php 는 PHP 세션(ss_view_ · nonce)이 있어야 해서 토큰으로 로그인하는 앱은 쓸 수 없다.
 * 이 경로는 같은 규칙을 토큰 기준으로 다시 검사한다.
 *   - 글을 읽을 수 있어야 한다(api_can_read_board_post · 신고로 가린 글 · 차단한 글쓴이).
 *   - 회원 레벨이 bo_download_level 이상이어야 한다(손님은 1).
 *   - bo_download_point 가 음수면 손님은 못 받고, 회원은 글당 한 번 포인트를 뺀다
 *     (같은 글의 '다운로드' 포인트 기록이 있으면 다시 빼지 않는다). 내 글 · 관리자는 빼지 않는다.
 *   - 받은 횟수(bf_download)를 하나 올린다 — 처음부터 받을 때만(이어받기 조각은 세지 않는다).
 * 응답은 파일 그대로(attachment). 캐시는 그 사람에게만(private, no-store) — 권한이 사람마다 다르다.
 * Range(한 구간)를 받으면 206 으로 그 부분만 보낸다 — 큰 파일을 휴대폰에서 받다 끊겨도 이어받는다.
 * 파일이 외부 저장소에만 있으면(bf_fileurl) 같은 검사를 마친 뒤 그 주소로 보낸다(302).
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/board_file_download_helpers.php';

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$bo_table = isset($apiSegments[0]) ? api_sanitize_bo_table($apiSegments[0]) : '';
$wr_id = isset($apiSegments[1]) && preg_match('/^\d+$/', (string) $apiSegments[1]) ? (int) $apiSegments[1] : 0;
$bf_no = isset($apiSegments[2]) && preg_match('/^\d+$/', (string) $apiSegments[2]) ? (int) $apiSegments[2] : -1;

if ($bo_table === '' || $wr_id < 1 || $bf_no < 0 || count($apiSegments) !== 3) {
    Response::error('File not found.', 404);
}

$board = api_get_board($bo_table);
if (!$board) {
    Response::error('File not found.', 404);
}

$write_table = DB::writeTable($bo_table);
$post = DB::readFetch(
    "SELECT * FROM {$write_table}
     WHERE wr_id = ? AND wr_is_comment = 0
     LIMIT 1",
    [$wr_id]
);
if (!$post || empty($post['wr_id'])) {
    Response::error('File not found.', 404);
}

// 회원은 Authorization: Bearer 로만 인정한다(api_download_has_bearer 설명 참고 — 쿠키로는 포인트가 빠지지 않게).
$viewer = api_download_has_bearer() ? Auth::getUser() : null;
$adminRole = $viewer ? Auth::adminRole($viewer, $bo_table) : '';
$can_manage_post = $viewer ? Auth::canManagePost($viewer, $bo_table, $post) : false;

if ((string) ($post['wr_10'] ?? '') === 'report_hidden' && !$can_manage_post) {
    Response::error('File not found.', 404);
}
if (!api_can_read_board_post($viewer, $bo_table, $board, $post)) {
    Response::error($viewer ? 'You do not have permission to read this post.' : 'Login required.', $viewer ? 403 : 401);
}
if (api_is_blocked_author($viewer, (string) ($post['mb_id'] ?? ''), (string) ($post['wr_name'] ?? '')) && !$can_manage_post) {
    Response::error('File not found.', 404);
}

// 다운로드 레벨 — 손님은 1.
$viewer_level = $viewer ? (int) ($viewer['mb_level'] ?? 1) : 1;
if ($adminRole === '' && $viewer_level < (int) ($board['bo_download_level'] ?? 1)) {
    Response::error($viewer ? 'You do not have permission to download files.' : 'Login required.', $viewer ? 403 : 401);
}

$file = DB::readFetch(
    "SELECT bf_source, bf_file, bf_fileurl
       FROM " . DB::table('board_file_table') . "
      WHERE bo_table = ? AND wr_id = ? AND bf_no = ?
      LIMIT 1",
    [$bo_table, $wr_id, $bf_no]
);
if (!$file || empty($file['bf_file'])) {
    Response::error('File not found.', 404);
}

$path = api_board_file_path($bo_table, trim(str_replace('\\', '/', (string) $file['bf_file']), '/'));
// 포인트를 빼기 전에 열어 둔다 — 못 여는 파일 때문에 포인트만 빠지는 일이 없게.
$handle = ($path !== '' && is_file($path)) ? fopen($path, 'rb') : false;
$remote_url = $handle === false ? api_download_remote_url($file) : '';
if ($handle === false && $remote_url === '') {
    Response::error('File not found.', 404);
}

// 이어받기 구간 — 포인트를 빼기 전에 본다(줄 수 없는 구간이면 아무것도 바꾸지 않고 416).
$size = $handle !== false ? (int) filesize($path) : 0;
$range = $handle !== false ? api_download_range($_SERVER['HTTP_RANGE'] ?? null, $size) : null;
if ($range === false) {
    fclose($handle);
    header('Content-Range: bytes */' . $size);
    Response::error('Requested range not satisfiable.', 416);
}

// 포인트 — 글당 한 번. 내 글 · 관리자는 빼지 않는다. 이어받기 조각도 같은 글이라 다시 빼지 않는다.
$download_point = (int) ($board['bo_download_point'] ?? 0);
$own_post = $viewer && !empty($post['mb_id']) && $post['mb_id'] === $viewer['mb_id'];
if ($download_point < 0 && !$own_post && $adminRole === '') {
    if (!$viewer) {
        Response::error('Login required.', 401);
    }
    $already = DB::readFetch(
        "SELECT po_id FROM " . DB::table('point_table') . "
          WHERE mb_id = ? AND po_rel_table = ? AND po_rel_id = ? AND po_rel_action = '다운로드'
          LIMIT 1",
        [$viewer['mb_id'], $bo_table, (string) $wr_id]
    );
    if (!$already) {
        if ((int) ($viewer['mb_point'] ?? 0) + $download_point < 0) {
            Response::error('Not enough points to download this file.', 403);
        }
        // insert_point 가 GET_LOCK 안에서 같은 기록을 다시 보므로 동시에 두 번 와도 한 번만 빠진다.
        insert_point($viewer['mb_id'], $download_point, "{$board['bo_subject']} {$wr_id} 파일 다운로드", $bo_table, $wr_id, '다운로드');
    }
}

// 받은 횟수 — 처음부터 받을 때만. 이어받기(Range 가 0 이 아닌 곳에서 시작)는 같은 받기의 나머지라 세지 않는다.
if ($range === null || $range[0] === 0) {
    DB::execute(
        "UPDATE " . DB::table('board_file_table') . "
            SET bf_download = bf_download + 1
          WHERE bo_table = ? AND wr_id = ? AND bf_no = ?",
        [$bo_table, $wr_id, $bf_no]
    );
}

if ($remote_url !== '') {
    header('Cache-Control: private, no-store');
    header('Location: ' . $remote_url, true, 302);
    exit;
}

// 파일 이름 — 한글은 RFC 5987(filename*), 옛 클라이언트용 filename 은 ASCII 로.
$source = (string) ($file['bf_source'] ?? 'download');
$ascii_name = api_download_ascii_name($source);

// common.php 가 연 출력 버퍼가 남아 있다 — 그대로 readfile 하면 파일 전체가 메모리에 쌓인다(큰 파일은 memory_limit 초과).
while (ob_get_level() > 0) {
    ob_end_clean();
}
@set_time_limit(0);

$start = $range === null ? 0 : $range[0];
$end = $range === null ? $size - 1 : $range[1];
$length = $size > 0 ? $end - $start + 1 : 0;

if ($range !== null) {
    http_response_code(206);
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}
header('Content-Type: application/octet-stream');
header('Content-Length: ' . $length);
header('Accept-Ranges: bytes');
header('Content-Disposition: attachment; filename="' . $ascii_name . '"; filename*=UTF-8\'\'' . rawurlencode($source));
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');

if ($start > 0) {
    fseek($handle, $start);
}
$remaining = $length;
while ($remaining > 0 && !feof($handle)) {
    $chunk = fread($handle, (int) min(1048576, $remaining));
    if ($chunk === false || $chunk === '') {
        break;
    }
    echo $chunk;
    flush();
    $remaining -= strlen($chunk);
}
fclose($handle);
exit;
