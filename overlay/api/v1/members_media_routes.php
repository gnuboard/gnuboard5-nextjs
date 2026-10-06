<?php
/**
 * 회원이미지 · 회원아이콘 — 그누보드 회원정보 수정(bbs/register_form_update.php)과 같은 규칙.
 *
 *   POST   /v1/members/me/image   회원이미지 올리기 (multipart, 필드 mb_img)
 *   DELETE /v1/members/me/image   회원이미지 지우기
 *   DELETE /v1/members/me/icon    회원아이콘 지우기 (올리기는 members.php 의 POST /me/icon)
 *
 * 회원이미지는 관리자 > 기본환경설정 > 회원가입의 "회원이미지 용량 · 폭 · 높이"가 모두 있어야 쓸 수 있고,
 * 회원 레벨이 "회원아이콘 · 이미지 업로드 권한"(cf_icon_level) 이상이어야 한다. gif · jpg · png 만 받고,
 * 설정한 폭 · 높이보다 크면 가운데를 잘라 그 크기로 줄인다. 받은 그림은 새로 그려 저장하므로 그림 안에
 * 숨긴 코드는 남지 않는다. 파일은 data/member_image/앞두글자/<아이콘이름>.gif (그누보드와 같은 자리).
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('api_member_media_image_limits')) {
    /** 회원이미지 설정 — 셋 중 하나라도 0 이면 그누보드처럼 기능이 꺼진 것으로 본다. */
    function api_member_media_image_limits(): array
    {
        global $config;
        $size = (int) ($config['cf_member_img_size'] ?? 0);
        $width = (int) ($config['cf_member_img_width'] ?? 0);
        $height = (int) ($config['cf_member_img_height'] ?? 0);

        return [
            'enabled' => $size > 0 && $width > 0 && $height > 0,
            'level' => (int) ($config['cf_icon_level'] ?? 0),
            'size' => $size,
            'width' => $width,
            'height' => $height,
        ];
    }
}

if (!function_exists('api_member_media_path')) {
    /** data/<folder>/앞두글자/<아이콘이름>.gif */
    function api_member_media_path(string $folder, string $mbId): string
    {
        $name = function_exists('get_mb_icon_name') ? get_mb_icon_name($mbId) : $mbId;
        return G5_DATA_PATH . '/' . $folder . '/' . substr($mbId, 0, 2) . '/' . $name . '.gif';
    }
}

if (!function_exists('api_member_media_store')) {
    /**
     * 올라온 그림을 검사해 $dest 에 저장한다. 폭 · 높이가 한도보다 크면 가운데를 잘라 한도 크기로 줄인다.
     * 원래 형식(gif · jpg · png)으로 새로 그려 저장한다. 실패하면 Response::error 로 끝난다.
     */
    function api_member_media_store(array $file, string $dest, int $maxBytes, int $maxW, int $maxH): void
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
            Response::error('파일 업로드에 실패했습니다.', 400);
        }
        if ((int) $file['size'] > $maxBytes) {
            Response::error('회원이미지는 ' . number_format($maxBytes) . '바이트 이하로 올려 주세요.', 422);
        }

        $info = @getimagesize($file['tmp_name']);
        $type = is_array($info) ? (int) $info[2] : 0;
        $decoders = [IMAGETYPE_GIF => 'imagecreatefromgif', IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng'];
        if (!isset($decoders[$type]) || !function_exists($decoders[$type])) {
            Response::error('gif · jpg · png 그림만 올릴 수 있습니다.', 422);
        }
        // 펼치기 전에 크기를 본다 — 바이트는 작아도 가로 · 세로가 큰 그림(한 색 PNG 등)은 펼치는 순간 메모리를
        // 수백 MB 잡는다. 다른 사진 처리와 같은 픽셀 · 메모리 한도(api_image_decodable)를 쓴다.
        $infoW = (int) ($info[0] ?? 0);
        $infoH = (int) ($info[1] ?? 0);
        $decodable = function_exists('api_image_decodable')
            ? api_image_decodable($infoW, $infoH)
            : ($infoW > 0 && $infoH > 0 && $infoW * $infoH <= 4096 * 4096);
        if (!$decodable) {
            Response::error('그림의 가로 · 세로가 너무 큽니다. 더 작은 그림을 올려 주세요.', 422);
        }

        $src = @$decoders[$type]($file['tmp_name']);
        if (!$src) {
            Response::error('그림을 읽을 수 없습니다.', 422);
        }

        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $dstW = $srcW;
        $dstH = $srcH;
        $cropX = 0;
        $cropY = 0;
        $cropW = $srcW;
        $cropH = $srcH;
        if ($srcW > $maxW || $srcH > $maxH) {
            // 그누보드 thumbnail(..., true, true) 처럼 한도 비율로 가운데를 잘라 한도 크기로 만든다.
            $dstW = $maxW;
            $dstH = $maxH;
            $scale = max($maxW / $srcW, $maxH / $srcH);
            $cropW = (int) round($maxW / $scale);
            $cropH = (int) round($maxH / $scale);
            $cropX = (int) floor(($srcW - $cropW) / 2);
            $cropY = (int) floor(($srcH - $cropH) / 2);
        }

        $dst = imagecreatetruecolor($dstW, $dstH);
        if ($type === IMAGETYPE_PNG || $type === IMAGETYPE_GIF) {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        }
        imagecopyresampled($dst, $src, 0, 0, $cropX, $cropY, $dstW, $dstH, $cropW, $cropH);

        $dir = dirname($dest);
        if (!is_dir($dir)) {
            @mkdir($dir, G5_DIR_PERMISSION, true);
            @chmod($dir, G5_DIR_PERMISSION);
        }
        @unlink($dest);

        $saved = $type === IMAGETYPE_JPEG ? imagejpeg($dst, $dest, 90)
            : ($type === IMAGETYPE_PNG ? imagepng($dst, $dest) : imagegif($dst, $dest));
        unset($src, $dst);
        if (!$saved) {
            Response::error('파일 저장에 실패했습니다.', 500);
        }
        @chmod($dest, G5_FILE_PERMISSION);
    }
}

$apiMediaTarget = ($seg0 === 'me' && isset($apiSegments[1])) ? (string) $apiSegments[1] : '';

// POST /v1/members/me/image
if ($apiMediaTarget === 'image' && $apiMethod === 'POST') {
    $member = Auth::requireAuth();
    $limits = api_member_media_image_limits();
    if (!$limits['enabled']) {
        Response::error('이 사이트는 회원이미지를 쓰지 않습니다.', 403);
    }
    if ((int) $member['mb_level'] < $limits['level']) {
        Response::error('회원이미지를 올릴 수 있는 레벨이 아닙니다.', 403);
    }
    if (!isset($_FILES['mb_img'])) {
        Response::error('파일 업로드에 실패했습니다.', 400);
    }

    api_member_media_store($_FILES['mb_img'], api_member_media_path('member_image', $member['mb_id']),
        $limits['size'], $limits['width'], $limits['height']);

    Response::success([
        'mb_image_path' => get_member_image_url($member['mb_id']),
        'message' => '회원이미지가 변경되었습니다.',
    ]);
}

// DELETE /v1/members/me/image · /v1/members/me/icon
if (($apiMediaTarget === 'image' || $apiMediaTarget === 'icon') && $apiMethod === 'DELETE') {
    $member = Auth::requireAuth();
    $folder = $apiMediaTarget === 'image' ? 'member_image' : 'member';
    @unlink(api_member_media_path($folder, $member['mb_id']));

    Response::success([
        $apiMediaTarget === 'image' ? 'mb_image_path' : 'mb_icon_path' => null,
        'message' => $apiMediaTarget === 'image' ? '회원이미지를 지웠습니다.' : '회원아이콘을 지웠습니다.',
    ]);
}

unset($apiMediaTarget);
