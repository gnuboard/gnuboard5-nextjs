<?php
/**
 * Safe image bridge for YoungCart assets stored below data/.
 *
 * GET /v1/shop/images/{scope}/{path...}
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if ($apiMethod !== 'GET' && $apiMethod !== 'HEAD') {
    Response::error('Method not allowed.', 405);
}

$scope = isset($shopSegments[0]) ? (string) $shopSegments[0] : '';
$relativePath = implode('/', array_slice($shopSegments, 1));
$path = shop_api_data_image_path($scope, $relativePath);

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

// ?w= 를 붙인 목록·배너 주소에는 줄이거나 WebP 로 옮긴 사본을 준다(lib/image-variants.php).
// 상품 진열 사진은 원본 PNG 가 한 장 330KB 안팎이었다. 원본 주소(상세 화면)는 그대로 원본이다.
$variant = api_image_variant($path, $mime, isset($_GET['w']) ? (int) $_GET['w'] : 0, isset($_GET['h']) ? (int) $_GET['h'] : 0);
$path = $variant['path'];
$mime = $variant['mime'];
if ($variant['vary']) {
    header('Vary: Accept', false); // 앞서 붙은 Vary: Origin(index.php)을 덮지 않고 더한다.
}

$size = filesize($path);
$mtime = filemtime($path) ?: time();
$etag = '"' . sha1($path . '|' . $size . '|' . $mtime) . '"';
$lastModified = gmdate('D, d M Y H:i:s', $mtime) . ' GMT';

header('Content-Type: ' . $mime);
header('Content-Length: ' . $size);
header('Cache-Control: public, max-age=31536000, immutable');
header('Last-Modified: ' . $lastModified);
header('ETag: ' . $etag);
header('X-Content-Type-Options: nosniff');

$ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) : '';
$ifModifiedSince = isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) ? trim((string) $_SERVER['HTTP_IF_MODIFIED_SINCE']) : '';

if ($ifNoneMatch === $etag || $ifModifiedSince === $lastModified) {
    http_response_code(304);
    exit;
}

if ($apiMethod === 'HEAD') {
    exit;
}

readfile($path);
exit;
