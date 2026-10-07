<?php
/**
 * Gnuboard5 REST API - File Upload
 *
 * POST /v1/upload - Upload an image file (requires auth)
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if ($apiMethod !== 'POST') {
    Response::error('Method not allowed.', 405);
}

$member = Auth::requireAuth();
$action = isset($apiSegments[0]) ? (string) $apiSegments[0] : '';

function api_upload_editor_file_path_from_url($fileUrl)
{
    $fileUrl = trim((string) $fileUrl);
    if ($fileUrl === '') {
        return null;
    }

    $decoded = html_entity_decode($fileUrl, ENT_QUOTES, 'UTF-8');
    $urlPath = parse_url($decoded, PHP_URL_PATH);
    if (!is_string($urlPath) || $urlPath === '') {
        return null;
    }

    $urlPath = str_replace('\\', '/', rawurldecode($urlPath));
    $marker = '/editor/';
    $pos = strpos($urlPath, $marker);
    if ($pos === false) {
        return null;
    }

    $relative = substr($urlPath, $pos + strlen($marker));
    if (!preg_match('#^[0-9]{4}/[A-Za-z0-9][A-Za-z0-9_.-]*$#', $relative)) {
        return null;
    }

    $editorRoot = G5_DATA_PATH . '/editor';
    $editorRootReal = realpath($editorRoot);
    if ($editorRootReal === false) {
        return null;
    }

    $candidate = $editorRoot . '/' . $relative;
    $candidateDir = realpath(dirname($candidate));
    if ($candidateDir === false) {
        return null;
    }

    $base = rtrim($editorRootReal, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (strpos($candidateDir . DIRECTORY_SEPARATOR, $base) !== 0) {
        return null;
    }

    return $candidateDir . DIRECTORY_SEPARATOR . basename($candidate);
}

// 그림 옆에 두는 올린 사람 정보(owner_hash 등). .php 로 두고 맨 앞에 exit 를 넣는다 — 원본 data/.htaccess 가
// .php 를 막고, 그 규칙이 없는 서버(nginx 등)에서 PHP 로 실행돼도 아무것도 내보내지 않는다. 예전 .meta.json 은
// 웹에서 그대로 열렸다(회원별 고정 값 · 올린 시각) — 읽기 · 지우기만 한다.
if (!defined('API_UPLOAD_META_GUARD')) {
    // 예전 .meta.json 을 옮기는 설치기(plugin/webapp/notify/tables.php)도 같은 머리말을 쓴다.
    define('API_UPLOAD_META_GUARD', "<?php exit; ?>\n");
}

function api_upload_editor_meta_path($filePath)
{
    return $filePath . '.meta.php';
}

function api_upload_editor_legacy_meta_path($filePath)
{
    return $filePath . '.meta.json';
}

function api_upload_read_editor_meta($filePath)
{
    foreach ([api_upload_editor_meta_path($filePath), api_upload_editor_legacy_meta_path($filePath)] as $metaPath) {
        if (!is_file($metaPath)) {
            continue;
        }

        $raw = @file_get_contents($metaPath);
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        if (strpos($raw, API_UPLOAD_META_GUARD) === 0) {
            $raw = substr($raw, strlen(API_UPLOAD_META_GUARD));
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return [];
}

function api_upload_owner_hash($member)
{
    $secret = defined('JWT_SECRET') ? JWT_SECRET : (defined('G5_TOKEN_ENCRYPTION_KEY') ? G5_TOKEN_ENCRYPTION_KEY : '');
    return hash_hmac('sha256', (string) ($member['mb_id'] ?? ''), (string) $secret);
}

function api_upload_editor_file_is_referenced($filePath)
{
    $fileName = basename((string) $filePath);
    if ($fileName === '') {
        return true;
    }

    try {
        $boardTable = DB::table('board_table');
        $boards = DB::fetchAll("SELECT bo_table FROM {$boardTable}");
        foreach ($boards as $board) {
            $boTable = api_sanitize_bo_table((string) ($board['bo_table'] ?? ''));
            if ($boTable === '') {
                continue;
            }
            $writeTable = DB::writeTable($boTable);
            $row = DB::fetch(
                "SELECT wr_id FROM {$writeTable} WHERE wr_content LIKE ? LIMIT 1",
                ['%' . $fileName . '%']
            );
            if ($row) {
                return true;
            }
        }
    } catch (Throwable $e) {
        return true;
    }

    return false;
}

if ($action === 'delete') {
    $body = get_request_body();
    $filePath = api_upload_editor_file_path_from_url($body['file_url'] ?? '');
    if (!$filePath) {
        Response::success(['deleted' => false]);
    }

    $meta = api_upload_read_editor_meta($filePath);
    $ownerHash = isset($meta['owner_hash']) ? (string) $meta['owner_hash'] : '';
    $isSuperAdmin = Auth::adminRole($member) === 'super';
    if (!$isSuperAdmin && ($ownerHash === '' || !hash_equals($ownerHash, api_upload_owner_hash($member)))) {
        Response::error('Forbidden.', 403);
    }

    if (api_upload_editor_file_is_referenced($filePath)) {
        Response::success(['deleted' => false]);
    }

    $deleted = false;
    if (is_file($filePath)) {
        $deleted = @unlink($filePath);
    }
    @unlink(api_upload_editor_meta_path($filePath));
    @unlink(api_upload_editor_legacy_meta_path($filePath));

    Response::success(['deleted' => (bool) $deleted]);
}

if ($action !== '') {
    Response::error('Unknown upload action.', 404);
}

// ---------------------------------------------------------------------------
// Validate upload
// ---------------------------------------------------------------------------
if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE   => 'File exceeds the server upload_max_filesize.',
        UPLOAD_ERR_FORM_SIZE  => 'File exceeds the form MAX_FILE_SIZE.',
        UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded.',
        UPLOAD_ERR_NO_FILE    => 'No file was uploaded. Send a file in the "file" field.',
        UPLOAD_ERR_NO_TMP_DIR => 'Server missing temporary folder.',
        UPLOAD_ERR_CANT_WRITE => 'Server failed to write file to disk.',
        UPLOAD_ERR_EXTENSION  => 'Upload stopped by a PHP extension.',
    ];

    $errCode = isset($_FILES['file']['error']) ? $_FILES['file']['error'] : UPLOAD_ERR_NO_FILE;
    $msg = isset($errorMessages[$errCode]) ? $errorMessages[$errCode] : 'File upload failed.';

    Response::error($msg, 400);
}

$file = $_FILES['file'];

// Max file size: 20 MB (SmartEditor2 규격 적용)
$maxSize = 20 * 1024 * 1024;
if ($file['size'] > $maxSize) {
    Response::error('File size exceeds the 20 MB limit.', 400);
}

// Allowed extensions (SmartEditor2 규격: gif, jpg, jpeg, bmp, png, webp)
$allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
$originalName = $file['name'];
$ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

if (!in_array($ext, $allowedExtensions)) {
    Response::error('Invalid file type. Allowed: ' . implode(', ', $allowedExtensions), 400);
}

// Validate MIME type as an extra safeguard
$allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/x-ms-bmp',
];

$finfo = new finfo(FILEINFO_MIME_TYPE);
$detectedMime = $finfo->file($file['tmp_name']);

if (!in_array($detectedMime, $allowedMimes)) {
    Response::error('Invalid file content. Only image files are allowed.', 400);
}

// 디코딩 전에 헤더로 가로 · 세로를 본다. 20MB 한도는 압축된 크기라, 압축이 잘 되는 큰 그림(예: 3만 x 3만
// PNG)은 GD 가 풀면서 수 GB 를 잡는다. 메모리 한도에서 죽으면 아래에서 옮겨 둔 원본(재인코딩 전)이 남는다.
// 한 변 20000px · 전체 4천만 화소(GD 로 약 200MB)를 넘으면 풀기 전에 거절한다.
$imageInfo = @getimagesize($file['tmp_name']);
$imageWidth = is_array($imageInfo) ? (int) $imageInfo[0] : 0;
$imageHeight = is_array($imageInfo) ? (int) $imageInfo[1] : 0;
if ($imageWidth <= 0 || $imageHeight <= 0) {
    Response::error('Image decode failed. File may be corrupted or malformed.', 400);
}
$maxImageSide = 20000;
$maxImagePixels = 40000000;
if ($imageWidth > $maxImageSide || $imageHeight > $maxImageSide || $imageWidth * $imageHeight > $maxImagePixels) {
    Response::error('Image dimensions are too large.', 400);
}
// 상한 안이라도 이 서버의 메모리로 풀 수 없으면 거절한다 — 풀다 죽으면 재인코딩 전 원본이 남는다.
if (function_exists('api_image_memory_fits') && !api_image_memory_fits($imageWidth * $imageHeight)) {
    Response::error('Image dimensions are too large.', 400);
}

// 회원별 업로드 한도 — 올린 그림은 data/editor/ 에 계속 남고(운영에 정리 크론이 없다) 한 장이 최대 20MB 다.
// 앱은 사진을 한 장씩 골라 올리고(글쓰기 · 리뷰 최대 5장) 디데이 앱은 동기화 때 사진 있는 디데이마다 차례로 한 장씩
// 올리므로 분당 30 · 시간당 300 은 정상 사용이 닿지 않는다. 검사를 통과해 실제로 저장할 요청만 센다.
// 셀 표(login_attempt)가 없는 설치본은 막지 않는다 — 쪽지(memos.php)처럼 비용이 드는 부수 효과가 없는 글쓰기 기능이라
// 표 하나 때문에 편집기 사진 올리기 전체가 멈추면 안 된다.
$uploadQuotaMsg = Throttle::checkMemberQuota('editorupload', (string) $member['mb_id'], 30, 300);
if ($uploadQuotaMsg !== null) {
    Response::error($uploadQuotaMsg, 429);
}

// ---------------------------------------------------------------------------
// Save file (그누보드5 표준: /data/editor/YYMM/)
// ---------------------------------------------------------------------------
$ym = date('ym');
$uploadDir = G5_DATA_PATH . '/editor/' . $ym;

if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0755, true);
    @file_put_contents($uploadDir . '/index.html', '');
}

// 파일 이름: 시각 + 16자 난수(random_int, 영숫자 62자) + 확장자. 그림은 인증 없이 열리므로(/v1/editor-images) 이름을
// 맞혀 남의 그림을 찾을 수 없어야 한다 — 예전 6자리 mt_rand 는 올린 시각만 알면 훑을 수 있었다(post-files.php 와 같은 방식).
// 예전 이름도 같은 문자 규칙이라 api_editor_image_ref() · 앱의 주소 규칙에 그대로 맞는다.
$nameChars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
$nameRand = '';
for ($k = 0; $k < 16; $k++) {
    $nameRand .= $nameChars[random_int(0, strlen($nameChars) - 1)];
}
$newFilename = date('YmdHis') . '_' . $nameRand . '.' . $ext;
$destPath = $uploadDir . '/' . $newFilename;

if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    Response::error('Failed to save uploaded file.', 500);
}

// 재인코딩을 마치기 전에 요청이 죽으면(메모리 한도 · 시간 초과) 옮겨 둔 원본을 지운다 — 메타데이터나
// polyglot 이 그대로인 파일이 공개 폴더에 남지 않게.
$uploadFinished = false;
register_shutdown_function(static function () use (&$uploadFinished, $destPath) {
    if (!$uploadFinished && is_file($destPath)) {
        @unlink($destPath);
    }
});

// ---------------------------------------------------------------------------
// Image resize (SmartEditor2 규격: 최대 1200x2800, 품질 98)
// ---------------------------------------------------------------------------
$resizeMaxWidth  = defined('SMARTEDITOR_UPLOAD_MAX_WIDTH')  ? SMARTEDITOR_UPLOAD_MAX_WIDTH  : 1200;
$resizeMaxHeight = defined('SMARTEDITOR_UPLOAD_MAX_HEIGHT') ? SMARTEDITOR_UPLOAD_MAX_HEIGHT : 2800;
$imageQuality    = defined('SMARTEDITOR_UPLOAD_IMAGE_QUALITY') ? SMARTEDITOR_UPLOAD_IMAGE_QUALITY : 98;

// 보안: 모든 이미지를 GD 로 재인코딩 — 메타데이터 / EXIF / polyglot payload 제거.
// resize 가 필요 없는 작은 이미지도 sanitize 위해 재인코딩한다.
// GIF 는 첫 프레임만 보존 (애니메이션 손실 trade-off — 보안 우선).
$srcImg = null;
switch ($detectedMime) {
    case 'image/jpeg': $srcImg = @imagecreatefromjpeg($destPath); break;
    case 'image/png':  $srcImg = @imagecreatefrompng($destPath); break;
    case 'image/webp': $srcImg = @imagecreatefromwebp($destPath); break;
    case 'image/gif':  $srcImg = @imagecreatefromgif($destPath); break;
    case 'image/bmp':
    case 'image/x-ms-bmp': $srcImg = @imagecreatefrombmp($destPath); break;
}

if (!$srcImg) {
    // GD 가 디코딩 실패 — 형식 위장 가능성 (예: PNG header 만 가짜)
    @unlink($destPath);
    Response::error('Image decode failed. File may be corrupted or malformed.', 400);
}

$srcW = imagesx($srcImg);
$srcH = imagesy($srcImg);

// resize 필요 여부 — 한도 초과 시 비례 축소, 아니면 그대로
$ratio = min(1.0, $resizeMaxWidth / $srcW, $resizeMaxHeight / $srcH);
$dstW = (int) round($srcW * $ratio);
$dstH = (int) round($srcH * $ratio);

$dstImg = imagecreatetruecolor($dstW, $dstH);
// 투명도 보존 (PNG / WebP / GIF)
if (in_array($detectedMime, ['image/png', 'image/webp', 'image/gif'])) {
    imagealphablending($dstImg, false);
    imagesavealpha($dstImg, true);
    $transparent = imagecolorallocatealpha($dstImg, 0, 0, 0, 127);
    imagefilledrectangle($dstImg, 0, 0, $dstW, $dstH, $transparent);
}
imagecopyresampled($dstImg, $srcImg, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);

switch ($detectedMime) {
    case 'image/jpeg': imagejpeg($dstImg, $destPath, $imageQuality); break;
    case 'image/png':  imagepng($dstImg, $destPath, min(9, (int)(9 - $imageQuality / 11))); break;
    case 'image/webp': imagewebp($dstImg, $destPath, $imageQuality); break;
    case 'image/gif':  imagegif($dstImg, $destPath); break;
    case 'image/bmp':
    case 'image/x-ms-bmp': imagebmp($dstImg, $destPath); break;
}

// PHP 8.0+ 는 GD resource 자동 free — imagedestroy 가 8.5 deprecated.
unset($srcImg, $dstImg);

$finalSize = filesize($destPath);
$fileUrl = G5_DATA_URL . '/editor/' . $ym . '/' . $newFilename;
@file_put_contents(
    api_upload_editor_meta_path($destPath),
    API_UPLOAD_META_GUARD . json_encode([
        'owner_hash' => api_upload_owner_hash($member),
        'file_name' => $newFilename,
        'file_url' => $fileUrl,
        'uploaded_at' => date('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

$uploadFinished = true;
Response::success([
    'file_name' => $newFilename,
    'file_url'  => $fileUrl,
    'file_size' => $finalSize,
    'mime_type' => $detectedMime,
], 201);
