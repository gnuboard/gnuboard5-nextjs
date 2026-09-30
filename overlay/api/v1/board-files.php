<?php
/**
 * Safe image bridge for board attachments stored below data/file/{bo_table}.
 *
 * GET /v1/board-files/{bo_table}/{wr_id}/{bf_no}/{filename...}
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if ($apiMethod !== 'GET' && $apiMethod !== 'HEAD') {
    Response::error('Method not allowed.', 405);
}

$bo_table = isset($apiSegments[0]) ? api_sanitize_bo_table($apiSegments[0]) : '';
$wr_id = isset($apiSegments[1]) && preg_match('/^\d+$/', (string) $apiSegments[1]) ? (int) $apiSegments[1] : 0;
$bf_no = isset($apiSegments[2]) && preg_match('/^\d+$/', (string) $apiSegments[2]) ? (int) $apiSegments[2] : -1;
$requested_file = implode('/', array_map('rawurldecode', array_slice($apiSegments, 3)));

if ($bo_table === '' || $wr_id < 1 || $bf_no < 0) {
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

$viewer = Auth::getUser();
$can_manage_post = $viewer ? Auth::canManagePost($viewer, $bo_table, $post) : false;

if ((string) ($post['wr_10'] ?? '') === 'report_hidden' && !$can_manage_post) {
    Response::error('File not found.', 404);
}

if (!api_can_read_board_post($viewer, $bo_table, $board, $post)) {
    Response::error('You do not have permission to read this post.', 403);
}

if (api_is_blocked_author(
    $viewer,
    (string) ($post['mb_id'] ?? ''),
    (string) ($post['wr_name'] ?? '')
) && !$can_manage_post) {
    Response::error('File not found.', 404);
}

$file = DB::readFetch(
    "SELECT bf_file, bf_type
       FROM " . DB::table('board_file_table') . "
      WHERE bo_table = ?
        AND wr_id = ?
        AND bf_no = ?
      LIMIT 1",
    [$bo_table, $wr_id, $bf_no]
);

if (!$file || empty($file['bf_file'])) {
    Response::error('File not found.', 404);
}

$stored_file = trim(str_replace('\\', '/', (string) $file['bf_file']), '/');
$requested_file = trim(str_replace('\\', '/', $requested_file), '/');
if ($requested_file !== '' && $requested_file !== $stored_file) {
    Response::error('File not found.', 404);
}

$path = api_board_file_path($bo_table, $stored_file);

if ($path === '') {
    Response::error('File not found.', 404);
}

$mime = '';
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo) {
        $mime = (string) finfo_file($finfo, $path);
        finfo_close($finfo);
    }
}

if ($mime === '' && function_exists('mime_content_type')) {
    $mime = (string) mime_content_type($path);
}

if ($mime === '' || strpos($mime, 'image/') !== 0) {
    Response::error('Unsupported file type.', 415);
}

$size = filesize($path);
$mtime = filemtime($path) ?: time();
$etag = '"' . sha1($path . '|' . $size . '|' . $mtime) . '"';
$last_modified = gmdate('D, d M Y H:i:s', $mtime) . ' GMT';

header('Content-Type: ' . $mime);
header('Content-Length: ' . $size);
// 로그아웃한 사람도 이 글을 볼 수 있을 때만 공유 캐시(CDN · 프록시)에 1년 두게 한다. 비밀글 · 회원 전용 게시판 ·
// 신고로 가린 글의 파일을 public 으로 내면, 권한 있는 사람이 먼저 받은 응답을 캐시가 다른 사람에게 그대로 내준다
// (캐시가 맞으면 위 권한 검사가 돌지 않는다). 그런 파일은 private — 그 사람의 브라우저만 둔다.
$is_public_file = (string) ($post['wr_10'] ?? '') !== 'report_hidden'
    && api_can_read_board_post(null, $bo_table, $board, $post);
header($is_public_file
    ? 'Cache-Control: public, max-age=31536000, immutable'
    : 'Cache-Control: private, max-age=3600');
header('Last-Modified: ' . $last_modified);
header('ETag: ' . $etag);
header('X-Content-Type-Options: nosniff');

$if_none_match = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) : '';
$if_modified_since = isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) ? trim((string) $_SERVER['HTTP_IF_MODIFIED_SINCE']) : '';

if ($if_none_match === $etag || $if_modified_since === $last_modified) {
    http_response_code(304);
    exit;
}

if ($apiMethod === 'HEAD') {
    exit;
}

readfile($path);
exit;
