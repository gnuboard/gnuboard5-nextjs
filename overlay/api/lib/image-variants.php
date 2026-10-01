<?php
/**
 * 목록용 사진 파생본 — 폭을 줄인 사본과 WebP 사본.
 *
 * 목록·진열 화면은 200~400px 칸에 사진을 놓는데 원본 PNG 를 그대로 보내면 한 장이 수백 KB 다.
 * 주소에 ?w= 를 붙인 요청만 파생본을 준다(board-files, shop/images). 원본 주소는 그대로 원본이다.
 *
 * - 폭: 그누보드 코어 thumbnail() 이 원본 옆에 만드는 사본을 그대로 쓴다(게시판 목록과 같은 규칙).
 * - WebP: 브라우저가 Accept 에 image/webp 를 실어 올 때만 준다. 응답에는 Vary: Accept 를 붙여
 *   캐시가 형식별로 따로 두게 한다. GD 에 WebP 가 없거나 만들지 못하면 PNG·JPEG 를 그대로 준다.
 * - 파일 이름은 thumb-{원본 이름}_{폭}x0.webp — 코어가 원본을 지울 때 thumb-{원본 이름}* 를 함께
 *   지우므로(delete_board_thumbnail · delete_item_thumbnail) 사본만 남지 않는다.
 *
 * 끄려면 extend/ 에서 define('G5_API_IMAGE_WEBP', false); (폭 줄이기는 그대로 둔다)
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

/** WebP 품질. 측정에서 갤러리 PNG 8장 509KB → 79KB, 눈으로 구분하기 어려웠다. */
const API_IMAGE_WEBP_QUALITY = 80;
/** 이보다 큰 그림은 바꾸지 않는다 — GD 가 픽셀마다 메모리를 잡아 공유호스팅 한도를 넘긴다. */
const API_IMAGE_MAX_PIXELS = 4096 * 4096;

if (!function_exists('api_image_variant_widths')) {
    /**
     * 받는 폭. 아무 숫자나 받으면 사본이 끝없이 쌓이고, 남이 1~9999 를 훑어 디스크를 채우는 길이 된다.
     * 240·400·800 은 목록 칸(갤러리 200px, 상품 300px 안팎)을 2배수 화면까지, 1920 은 첫 화면 배너다.
     */
    function api_image_variant_widths(): array
    {
        return [240, 400, 800, 1920];
    }
}

if (!function_exists('api_image_url_with_width')) {
    /** 이 API 가 내는 사진 주소에 폭을 붙인다. 바깥 주소나 받지 않는 폭이면 그대로 둔다. */
    function api_image_url_with_width(string $url, int $width): string
    {
        if ($url === '' || !in_array($width, api_image_variant_widths(), true)) {
            return $url;
        }
        if (strpos($url, '/api/v1/') === false) {
            return $url;
        }

        return $url . (strpos($url, '?') === false ? '?' : '&') . 'w=' . $width;
    }
}

if (!function_exists('api_image_resized_copy')) {
    /**
     * 원본 옆에 폭을 줄인 사본을 만들어 두고 그 경로를 돌려준다. 만들지 못하면 빈 문자열.
     *
     * 그누보드 코어의 thumbnail() 을 그대로 쓴다 — 만드는 규칙도 파일 이름도 두는 자리도
     * 게시판 목록이 이미 쓰는 것과 같아야 설치본에 사본이 두 벌로 쌓이지 않는다.
     * GD 가 없거나(공유호스팅에 더러 있다) 원본이 이미 작으면 빈 문자열을 주고 원본을 쓰게 한다.
     */
    function api_image_resized_copy(string $source_path, string $mime, int $width): string
    {
        if ($width < 1 || !function_exists('imagecreatetruecolor')) {
            return '';
        }

        // 움직이는 그림은 줄이면 첫 장면만 남는다. 건드리지 않는다.
        if ($mime === 'image/gif' || $mime === 'image/webp') {
            return '';
        }

        $size = @getimagesize($source_path);
        if (!$size || (int) $size[0] <= $width) {
            return ''; // 원본이 이미 그 폭 이하면 줄일 것이 없다.
        }

        if (!function_exists('thumbnail')) {
            $lib = G5_LIB_PATH . '/thumbnail.lib.php';
            if (!is_file($lib)) {
                return '';
            }
            require_once $lib;
        }

        $dir = dirname($source_path);
        $name = basename($source_path);

        // 높이 0 = 비율 유지. is_create=false 면 이미 만들어 둔 사본을 그대로 쓴다.
        $thumb = @thumbnail($name, $dir, $dir, $width, 0, false);
        if (!$thumb) {
            return '';
        }

        $path = $dir . '/' . $thumb;

        return is_file($path) ? $path : '';
    }
}

if (!function_exists('api_image_webp_enabled')) {
    function api_image_webp_enabled(): bool
    {
        if (defined('G5_API_IMAGE_WEBP') && !G5_API_IMAGE_WEBP) {
            return false;
        }

        return function_exists('imagewebp')
            && function_exists('imagetypes')
            && defined('IMG_WEBP')
            && (imagetypes() & IMG_WEBP) !== 0;
    }
}

if (!function_exists('api_image_accepts_webp')) {
    function api_image_accepts_webp(): bool
    {
        $accept = isset($_SERVER['HTTP_ACCEPT']) ? (string) $_SERVER['HTTP_ACCEPT'] : '';

        return stripos($accept, 'image/webp') !== false;
    }
}

if (!function_exists('api_image_jpeg_is_upright')) {
    /**
     * 원본 JPEG 를 그대로 옮겨도 되는지 — 사진기가 회전 정보(EXIF Orientation)만 적어 둔 사진은
     * GD 로 옮기면 그 정보가 빠져 옆으로 눕는다. 확인할 수 없으면(exif 확장 없음) 옮기지 않는다.
     * 줄인 사본은 코어 thumbnail() 이 이미 바로 세워 두었으므로 여기를 거치지 않는다.
     */
    function api_image_jpeg_is_upright(string $path): bool
    {
        if (!function_exists('exif_read_data')) {
            return false;
        }
        $exif = @exif_read_data($path);
        $orientation = is_array($exif) && isset($exif['Orientation']) ? (int) $exif['Orientation'] : 1;

        return $orientation <= 1;
    }
}

if (!function_exists('api_image_webp_copy')) {
    /**
     * $base_path(줄인 사본이나 원본)를 WebP 로 옮긴 사본의 경로. 만들지 못하면 빈 문자열.
     *
     * 이름은 원본($original_path) 이름에서 짓는다 — 줄인 사본 이름에서 지으면 thumb-thumb-… 가 되어
     * 코어가 원본을 지울 때 함께 지워지지 않는다. 동시에 두 요청이 만들어도 임시 파일에 쓰고
     * 이름을 바꾸므로 반쯤 쓴 파일을 내주지 않는다.
     */
    function api_image_webp_copy(string $base_path, string $original_path, int $width): string
    {
        $dir = dirname($original_path);
        $name = preg_replace('/\.[^.\/]+$/', '', basename($original_path));
        $target = $dir . '/thumb-' . $name . '_' . $width . 'x0.webp';

        $base_time = @filemtime($base_path) ?: 0;
        if (is_file($target) && (@filemtime($target) ?: 0) >= $base_time) {
            return $target;
        }
        if (!is_writable($dir)) {
            return '';
        }

        $info = @getimagesize($base_path);
        if (!$info || (int) $info[0] * (int) $info[1] > API_IMAGE_MAX_PIXELS) {
            return '';
        }

        if ($info[2] === IMAGETYPE_PNG) {
            $image = @imagecreatefrompng($base_path);
        } elseif ($info[2] === IMAGETYPE_JPEG) {
            if ($base_path === $original_path && !api_image_jpeg_is_upright($base_path)) {
                return '';
            }
            $image = @imagecreatefromjpeg($base_path);
        } else {
            return '';
        }
        if (!$image) {
            return '';
        }

        // 팔레트 PNG 는 GD 의 WebP 인코더가 받지 않는다. 투명도는 그대로 옮긴다.
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }
        imagealphablending($image, false);
        imagesavealpha($image, true);

        $tmp = $target . '.' . getmypid() . '-' . mt_rand() . '.tmp';
        $ok = @imagewebp($image, $tmp, API_IMAGE_WEBP_QUALITY);
        imagedestroy($image);

        if (!$ok || !is_file($tmp) || (int) @filesize($tmp) === 0) {
            @unlink($tmp);
            return '';
        }
        if (!@rename($tmp, $target)) {
            // Windows 는 이미 있는 이름으로 바꾸지 못한다 — 다른 요청이 먼저 만들었으면 그것을 쓴다.
            @unlink($tmp);
            return is_file($target) ? $target : '';
        }
        if (defined('G5_FILE_PERMISSION')) {
            @chmod($target, G5_FILE_PERMISSION);
        }

        return $target;
    }
}

if (!function_exists('api_image_variant')) {
    /**
     * ?w= 요청에 내줄 파일. ['path' => 보낼 파일, 'mime' => 그 형식, 'vary' => Vary: Accept 를 붙일지].
     *
     * 'vary' 는 이 요청이 Accept 에 따라 다른 형식을 받을 수 있었는지다 — 이번에 PNG 를 줬더라도
     * 같은 주소가 다른 브라우저에는 WebP 로 나가므로 캐시에 알려야 한다.
     */
    function api_image_variant(string $path, string $mime, int $width): array
    {
        $result = ['path' => $path, 'mime' => $mime, 'vary' => false];
        if ($width < 1 || !in_array($width, api_image_variant_widths(), true)) {
            return $result;
        }

        $resized = api_image_resized_copy($path, $mime, $width);
        if ($resized !== '') {
            $result['path'] = $resized;
        }

        if (($mime !== 'image/png' && $mime !== 'image/jpeg') || !api_image_webp_enabled()) {
            return $result;
        }

        $result['vary'] = true;
        if (!api_image_accepts_webp()) {
            return $result;
        }

        $webp = api_image_webp_copy($result['path'], $path, $resized !== '' ? $width : 0);
        // 이미 잘 눌린 사진은 WebP 가 더 클 때도 있다. 작은 쪽을 보낸다.
        if ($webp !== '' && (int) @filesize($webp) < (int) @filesize($result['path'])) {
            $result['path'] = $webp;
            $result['mime'] = 'image/webp';
        }

        return $result;
    }
}
