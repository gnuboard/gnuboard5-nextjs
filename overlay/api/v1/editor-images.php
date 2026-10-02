<?php
/**
 * Safe image bridge for editor images stored below data/editor/{ym}.
 *
 * GET /v1/editor-images/{ym}/{filename}
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if ($apiMethod !== 'GET' && $apiMethod !== 'HEAD') {
    Response::error('Method not allowed.', 405);
}

$ym = isset($apiSegments[0]) ? (string) $apiSegments[0] : '';
$filename = isset($apiSegments[1]) ? rawurldecode((string) $apiSegments[1]) : '';

$path = api_editor_image_path($ym, $filename);
if ($path === '') {
    Response::error('Image not found.', 404);
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
    Response::error('Unsupported image type.', 415);
}

// ?w= 를 붙인 주소(글 보기 본문 · 목록 썸네일)에는 줄이거나 WebP 로 옮긴 사본을 준다
// (lib/image-variants.php). 사본은 코어 thumbnail() 처럼 원본 옆에 thumb-… 이름으로 둔다 —
// 코어가 글을 지울 때 부르는 delete_editor_thumbnail 이 thumb-{원본 이름}* 를 함께 지운다.
$variant = api_image_variant($path, $mime, isset($_GET['w']) ? (int) $_GET['w'] : 0, isset($_GET['h']) ? (int) $_GET['h'] : 0);
$path = $variant['path'];
$mime = $variant['mime'];
if ($variant['vary']) {
    header('Vary: Accept', false); // 앞서 붙은 Vary: Origin(index.php)을 덮지 않고 더한다.
}

$size = filesize($path);
$mtime = filemtime($path) ?: time();
$etag = '"' . sha1($path . '|' . $size . '|' . $mtime) . '"';
$last_modified = gmdate('D, d M Y H:i:s', $mtime) . ' GMT';

header('Content-Type: ' . $mime);
header('Content-Length: ' . $size);
header('Cache-Control: public, max-age=31536000, immutable');
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
