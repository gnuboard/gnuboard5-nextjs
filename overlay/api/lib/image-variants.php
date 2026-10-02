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

if (!function_exists('api_image_board_view_widths')) {
    /**
     * 게시판에 설정된 글 보기 이미지 폭(bo_image_width). 그누보드는 글 보기의 본문·첨부 사진을 이 폭의
     * 썸네일로 보인다(get_view_thumbnail). 관리자가 정한 값만이라 아무 폭이나 받는 것과는 다르다.
     */
    function api_image_board_view_widths(): array
    {
        static $widths = null;
        if ($widths !== null) {
            return $widths;
        }

        $widths = [];
        if (!class_exists('DB')) {
            return $widths;
        }
        try {
            $rows = DB::readFetchAll(
                "SELECT DISTINCT bo_image_width FROM " . DB::table('board_table') . " WHERE bo_image_width BETWEEN 100 AND 2400"
            );
            foreach ($rows as $row) {
                $widths[] = (int) $row['bo_image_width'];
            }
        } catch (Throwable $e) {
            error_log('[image-variants] board image widths unavailable: ' . $e->getMessage());
        }

        return $widths;
    }
}

/**
 * 목록 썸네일 배율. 그누보드는 게시판 갤러리 크기(bo_gallery_width × bo_gallery_height) 그대로 만들지만,
 * 요즘 화면은 대개 2배 밀도라 그 크기면 흐리다. 같은 비율 · 같은 자르기로 2배 크기를 만든다.
 */
const API_IMAGE_LIST_DENSITY = 2;

if (!function_exists('api_image_board_gallery_sizes')) {
    /**
     * 게시판들의 목록 썸네일 크기 [[가로, 세로], …] — 갤러리 크기에 배율을 곱한 것. 세로 0 은 비율 유지.
     * 관리자가 정한 값만이라 아무 크기나 받는 것과는 다르다.
     */
    function api_image_board_gallery_sizes(): array
    {
        static $sizes = null;
        if ($sizes !== null) {
            return $sizes;
        }

        $sizes = [];
        if (!class_exists('DB')) {
            return $sizes;
        }
        try {
            $rows = DB::readFetchAll(
                "SELECT DISTINCT bo_gallery_width, bo_gallery_height FROM " . DB::table('board_table')
                . " WHERE bo_gallery_width BETWEEN 50 AND 1200 AND bo_gallery_height BETWEEN 0 AND 1200"
            );
            foreach ($rows as $row) {
                $sizes[] = [
                    (int) $row['bo_gallery_width'] * API_IMAGE_LIST_DENSITY,
                    (int) $row['bo_gallery_height'] * API_IMAGE_LIST_DENSITY,
                ];
            }
        } catch (Throwable $e) {
            error_log('[image-variants] board gallery sizes unavailable: ' . $e->getMessage());
        }

        return $sizes;
    }
}

if (!function_exists('api_image_board_list_size')) {
    /**
     * 이 게시판의 목록 썸네일 크기 [가로, 세로] — 그누보드 갤러리 목록(get_list_thumbnail 에 bo_gallery_width ·
     * bo_gallery_height, 자르기)과 같은 비율. 갤러리 크기가 비어 있으면 400 폭 · 비율 유지.
     */
    function api_image_board_list_size(array $board): array
    {
        $width = (int) ($board['bo_gallery_width'] ?? 0);
        $height = (int) ($board['bo_gallery_height'] ?? 0);
        if ($width < 50 || $width > 1200 || $height < 0 || $height > 1200) {
            return [400, 0];
        }

        return [$width * API_IMAGE_LIST_DENSITY, $height * API_IMAGE_LIST_DENSITY];
    }
}

if (!function_exists('api_image_variant_widths')) {
    /**
     * 받는 폭(비율 유지). 아무 숫자나 받으면 사본이 끝없이 쌓이고, 남이 1~9999 를 훑어 디스크를 채우는 길이 된다.
     * 240·400·800 은 목록 칸(갤러리 200px, 상품 300px 안팎)을 2배수 화면까지, 1440·1920 은 첫 화면 배너다.
     * 여기에 게시판의 글 보기 이미지 폭(그누보드 글 보기 썸네일)과, 세로가 0 인 갤러리 크기를 더한다.
     */
    function api_image_variant_widths(): array
    {
        $galleryWidths = [];
        foreach (api_image_board_gallery_sizes() as $size) {
            if ($size[1] === 0) {
                $galleryWidths[] = $size[0];
            }
        }

        return array_values(array_unique(array_merge([240, 400, 800, 1440, 1920], api_image_board_view_widths(), $galleryWidths)));
    }
}

if (!function_exists('api_image_size_allowed')) {
    /** 받는 크기인지 — 세로 0 이면 폭 목록, 아니면 게시판 갤러리 크기 목록에 있어야 한다. */
    function api_image_size_allowed(int $width, int $height): bool
    {
        if ($width < 1 || $height < 0) {
            return false;
        }
        if ($height === 0) {
            return in_array($width, api_image_variant_widths(), true);
        }

        return in_array([$width, $height], api_image_board_gallery_sizes(), true);
    }
}

if (!function_exists('api_image_url_with_size')) {
    /** 이 API 가 내는 사진 주소에 크기를 붙인다(세로 0 이면 폭만). 바깥 주소나 받지 않는 크기면 그대로 둔다. */
    function api_image_url_with_size(string $url, int $width, int $height): string
    {
        if ($url === '' || strpos($url, '/api/v1/') === false || !api_image_size_allowed($width, $height)) {
            return $url;
        }

        return $url . (strpos($url, '?') === false ? '?' : '&') . 'w=' . $width . ($height > 0 ? '&h=' . $height : '');
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

if (!function_exists('api_image_remove_work_dir')) {
    /** 사본을 만들던 임시 폴더를 비우고 지운다. */
    function api_image_remove_work_dir(string $work): void
    {
        foreach ((array) @glob($work . '/*') as $leftover) {
            @unlink($leftover);
        }
        @rmdir($work);
    }
}

if (!function_exists('api_image_sweep_work_dirs')) {
    /**
     * 10분 넘게 남은 임시 폴더(.g5thumb-*)를 치운다 — 강제 종료처럼 종료 처리도 못 돈 요청이 남긴 것.
     * 새 사본을 만들 때만 그 폴더 안에서 본다.
     */
    function api_image_sweep_work_dirs(string $dir): void
    {
        $limit = time() - 600;
        foreach ((array) @glob($dir . '/.g5thumb-*', GLOB_ONLYDIR) as $stale) {
            if ((@filemtime($stale) ?: 0) < $limit) {
                api_image_remove_work_dir($stale);
            }
        }
    }
}

if (!function_exists('api_image_thumbnail_is_complete')) {
    /**
     * 코어가 만든 사본이 끝까지 쓰였는지 — 형식 · 크기와 파일 끝 표식(PNG IEND · JPEG FFD9 · GIF ; · WebP RIFF 길이)을 본다.
     * 코어 thumbnail() 은 쓰기 실패를 알려 주지 않아, 디스크가 차거나 도중에 멈추면 덜 쓴 파일이 남는다.
     * 큰 그림을 다시 풀지 않는 가벼운 검사다.
     */
    function api_image_thumbnail_is_complete(string $path, int $type, int $width, int $height): bool
    {
        $size = (int) @filesize($path);
        $info = $size > 0 ? @getimagesize($path) : false;
        if (!$info || (int) $info[2] !== $type || (int) $info[0] < 1 || (int) $info[0] > $width
            || ($height > 0 && (int) $info[1] > $height)) {
            return false;
        }

        $fp = @fopen($path, 'rb');
        if (!$fp) {
            return false;
        }
        $head = (string) fread($fp, 12);
        fseek($fp, max(0, $size - 12));
        $tail = (string) fread($fp, 12);
        fclose($fp);

        switch ($type) {
            case IMAGETYPE_PNG:
                // PNG 는 길이 0 · 'IEND' · CRC 로 된 12바이트 조각으로 끝난다 — 끝 12바이트가 정확히 그것이어야 한다
                // ('IEND' 글자만 보면 마지막 1~4바이트가 빠진 파일도 통과했다).
                return $tail === "\x00\x00\x00\x00IEND\xAE\x42\x60\x82";
            case IMAGETYPE_JPEG:
                return substr($tail, -2) === "\xFF\xD9";
            case IMAGETYPE_GIF:
                return substr($tail, -1) === ';';
            case IMAGETYPE_WEBP:
                return strncmp($head, 'RIFF', 4) === 0 && unpack('V', substr($head, 4, 4))[1] + 8 === $size;
        }

        return false;
    }
}

if (!function_exists('api_image_core_thumbnail')) {
    /**
     * 코어 thumbnail() 로 원본 옆에 사본을 만들고 그 경로를 돌려준다. 만들지 못하면 빈 문자열.
     *
     * 만드는 규칙은 코어와 같다(비율 · 자르기 · 회전). 이름은 thumb-{원본}_{가로}x{세로}.g5api.{형식} —
     * 코어 사본(.g5api 없음)과 이름을 나눈다. 그누보드 게시판 목록이 같은 이름을 최종 경로에 바로 쓰는 중이면
     * 덜 써진 파일을 내줄 수 있었다(측정: 11MB 를 쓰는 중에 0.4MB 를 내줬다). thumb-{원본}* 꼴이라 코어가
     * 원본을 지울 때 함께 지운다.
     * 코어는 최종 경로에 바로 쓰므로 같은 폴더 안의 임시 폴더에 만들게 한 뒤, 끝까지 쓰였는지 보고 이름을 바꿔
     * 옮긴다 — 이름 바꾸기는 한 번에 일어나므로 이 이름의 파일은 늘 다 쓴 파일이다.
     */
    function api_image_core_thumbnail(string $source_path, int $width, int $height, bool $crop): string
    {
        if (!function_exists('imagecreatetruecolor')) {
            return '';
        }
        if (!function_exists('thumbnail')) {
            $lib = G5_LIB_PATH . '/thumbnail.lib.php';
            if (!is_file($lib)) {
                return '';
            }
            require_once $lib;
        }

        $info = @getimagesize($source_path);
        $types = [IMAGETYPE_GIF => 'gif', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
        if (!$info || !isset($types[$info[2]])) {
            return '';
        }

        $dir = dirname($source_path);
        $name = basename($source_path);
        $thumbName = 'thumb-' . preg_replace('/\.[^.]+$/', '', $name) . '_' . $width . 'x' . $height . '.g5api.' . $types[$info[2]];
        $final = $dir . '/' . $thumbName;

        // 원본보다 새로 만든 사본이 있으면 그대로 쓴다. 이 이름은 이름 바꾸기로만 생기므로 있으면 다 쓴 파일이다.
        if (is_file($final) && (@filemtime($final) ?: 0) >= (@filemtime($source_path) ?: 0)) {
            return $final;
        }
        if (!is_writable($dir)) {
            return '';
        }

        api_image_sweep_work_dirs($dir);
        $work = $dir . '/.g5thumb-' . getmypid() . '-' . mt_rand();
        if (!@mkdir($work)) {
            return '';
        }
        // 실행 시간이 다해 도중에 끝나도 임시 폴더를 남기지 않는다(종료 처리는 시간 초과에도 돈다).
        register_shutdown_function(static function () use ($work) {
            if (is_dir($work)) {
                api_image_remove_work_dir($work);
            }
        });

        $made = @thumbnail($name, $dir, $work, $width, $height, true, $crop);
        $madePath = ($made && $made !== $name) ? $work . '/' . $made : '';

        $result = '';
        if ($madePath !== '' && is_file($madePath)
            && api_image_thumbnail_is_complete($madePath, (int) $info[2], $width, $height)) {
            if (@rename($madePath, $final) || is_file($final)) {
                // Windows 는 이미 있는 이름으로 바꾸지 못한다 — 다른 요청이 먼저 옮겨 놓은 것을 쓴다.
                $result = $final;
                if (defined('G5_FILE_PERMISSION')) {
                    @chmod($final, G5_FILE_PERMISSION);
                }
            }
        }
        api_image_remove_work_dir($work);

        return $result;
    }
}

if (!function_exists('api_image_resized_copy')) {
    /**
     * 원본 옆에 폭을 줄인 사본(코어 thumbnail(), 비율 유지). 원본이 이미 그 폭 이하이거나 만들지 못하면 빈 문자열.
     * GD 가 없으면(공유호스팅에 더러 있다) 빈 문자열을 주고 원본을 쓰게 한다.
     */
    function api_image_resized_copy(string $source_path, string $mime, int $width): string
    {
        if ($width < 1 || !api_image_is_still($source_path, $mime)) {
            return '';
        }

        $size = @getimagesize($source_path);
        if (!$size || (int) $size[0] <= $width) {
            return ''; // 원본이 이미 그 폭 이하면 줄일 것이 없다.
        }

        return api_image_core_thumbnail($source_path, $width, 0, false);
    }
}

if (!function_exists('api_image_cropped_copy')) {
    /**
     * 원본 옆에 가로 × 세로로 가운데를 잘라 낸 사본 — 그누보드 목록 썸네일(get_list_thumbnail, 자르기)과 같은
     * 코어 thumbnail() 을 쓴다. 이름도 코어와 같은 thumb-{원본}_{가로}x{세로}. 만들지 못하면 빈 문자열.
     */
    function api_image_cropped_copy(string $source_path, string $mime, int $width, int $height): string
    {
        if ($width < 1 || $height < 1 || !api_image_is_still($source_path, $mime)) {
            return '';
        }

        return api_image_core_thumbnail($source_path, $width, $height, true);
    }
}

if (!function_exists('api_image_is_animated_png')) {
    /**
     * 움직이는 PNG(APNG)인지 — 첫 그림 조각(IDAT) 앞에 애니메이션 조각(acTL)이 있으면 그렇다.
     * GD 로 옮기면 첫 장면만 남으므로 GIF · WebP 처럼 건드리지 않는다.
     */
    function api_image_is_animated_png(string $path): bool
    {
        $fp = @fopen($path, 'rb');
        if (!$fp) {
            return false;
        }
        $animated = false;
        if (fread($fp, 8) === "\x89PNG\r\n\x1a\n") {
            while (!feof($fp)) {
                $head = fread($fp, 8);
                if (strlen($head) < 8) {
                    break;
                }
                $length = unpack('N', substr($head, 0, 4))[1];
                $type = substr($head, 4, 4);
                if ($type === 'acTL') {
                    $animated = true;
                    break;
                }
                if ($type === 'IDAT' || $type === 'IEND' || fseek($fp, $length + 4, SEEK_CUR) !== 0) {
                    break;
                }
            }
        }
        fclose($fp);

        return $animated;
    }
}

if (!function_exists('api_image_is_still')) {
    /** 움직이지 않는 그림인지 — GIF · WebP 는 통째로, PNG 는 APNG 가 아닐 때만. 움직이는 그림은 줄이면 첫 장면만 남는다. */
    function api_image_is_still(string $path, string $mime): bool
    {
        if ($mime === 'image/gif' || $mime === 'image/webp') {
            return false;
        }

        return !($mime === 'image/png' && api_image_is_animated_png($path));
    }
}

if (!function_exists('api_image_jpeg_orientation')) {
    /**
     * JPEG 의 EXIF 방향(1~8). EXIF 가 없으면 1, EXIF 가 있는데 깨져 읽을 수 없으면 0(모름 — 부르는 쪽은 원본을 낸다).
     * exif 확장 없이 파일 머리(APP1)를 직접 읽는다 — exif 확장이 없는 호스트에서도 돌려 놓은 사진을 알아봐야
     * 원본을 그대로 낼지 정할 수 있다. 모든 읽기는 범위를 먼저 본다(API 는 경고도 오류로 바꾼다).
     */
    function api_image_jpeg_orientation(string $path): int
    {
        $fp = @fopen($path, 'rb');
        if (!$fp) {
            return 1;
        }
        $data = fread($fp, 131072);
        fclose($fp);
        if (!is_string($data) || strncmp($data, "\xFF\xD8", 2) !== 0) {
            return 1;
        }
        $len = strlen($data);

        // 범위 안이면 정수, 밖이면 null.
        $read = static function (int $at, int $bytes, string $format) use ($data, $len) {
            if ($at < 0 || $at + $bytes > $len) {
                return null;
            }
            $value = unpack($format, substr($data, $at, $bytes));
            return is_array($value) ? (int) $value[1] : null;
        };

        $pos = 2;
        while ($pos + 4 <= $len && $data[$pos] === "\xFF") {
            $marker = ord($data[$pos + 1]);
            $segment = $read($pos + 2, 2, 'n');
            if ($segment === null || $segment < 2) {
                return 0;
            }
            if ($marker === 0xE1 && $pos + 10 <= $len && substr($data, $pos + 4, 6) === "Exif\0\0") {
                $tiff = $pos + 10;
                $end = min($len, $pos + 2 + $segment); // EXIF 는 이 조각 안에 있어야 한다
                $order = substr($data, $tiff, 2);
                if ($order !== 'II' && $order !== 'MM') {
                    return 0;
                }
                $u16 = $order === 'II' ? 'v' : 'n';
                $u32 = $order === 'II' ? 'V' : 'N';
                $offset = $read($tiff + 4, 4, $u32);
                if ($offset === null || $tiff + $offset + 2 > $end) {
                    return 0;
                }
                $ifd = $tiff + $offset;
                $count = $read($ifd, 2, $u16);
                if ($count === null) {
                    return 0;
                }
                for ($i = 0; $i < $count; $i++) {
                    $entry = $ifd + 2 + $i * 12;
                    if ($entry + 12 > $end) {
                        return 0;
                    }
                    if ($read($entry, 2, $u16) === 0x0112) {
                        $value = $read($entry + 8, 2, $u16);
                        return ($value !== null && $value >= 1 && $value <= 8) ? $value : 0;
                    }
                }
                return 1; // EXIF 는 있는데 방향 항목이 없다 — 정방향.
            }
            if ($marker === 0xDA) {
                break; // 그림 자료가 시작됐다 — 그 뒤에는 EXIF 가 없다.
            }
            $pos += 2 + $segment;
        }

        return 1;
    }
}

if (!function_exists('api_image_decodable')) {
    /**
     * 이 크기의 그림을 GD 로 풀어도 되는지 — 줄이거나 옮기기 전에, 원본 크기로 본다.
     * GD 는 픽셀마다 약 4~5바이트를 잡는다. 픽셀 상한과 남은 메모리 둘 다 본다.
     *
     * 그누보드 코어(lib/thumbnail.lib.php)가 부트스트랩에서 memory_limit 을 -1 로 풀어 두므로 지금 값은
     * 믿을 수 없다. 호스트가 php.ini 에 정한 값(get_cfg_var)을 예산으로 쓴다. 그것도 -1 이면 픽셀 상한만 본다.
     */
    function api_image_decodable(int $width, int $height): bool
    {
        $pixels = $width * $height;
        if ($pixels <= 0 || $pixels > API_IMAGE_MAX_PIXELS) {
            return false;
        }

        $limit = trim((string) ini_get('memory_limit'));
        if ($limit === '' || $limit === '-1') {
            $configured = get_cfg_var('memory_limit');
            $limit = is_string($configured) ? trim($configured) : '';
        }
        if ($limit === '' || $limit === '-1') {
            return true;
        }
        $bytes = (int) $limit;
        $unit = strtolower(substr($limit, -1));
        if ($unit === 'g') {
            $bytes *= 1024 * 1024 * 1024;
        } elseif ($unit === 'm') {
            $bytes *= 1024 * 1024;
        } elseif ($unit === 'k') {
            $bytes *= 1024;
        }

        // 원본 하나 + 사본 하나를 함께 들 수 있어야 한다. 넉넉히 원본의 6배 + 여유 16MB.
        return memory_get_usage(true) + $pixels * 6 + 16 * 1024 * 1024 <= $bytes;
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
    /** 브라우저가 WebP 를 받는다고 했는지 — Accept 에 image/webp 가 있고 q 가 0 이 아닐 때만. */
    function api_image_accepts_webp(): bool
    {
        $accept = isset($_SERVER['HTTP_ACCEPT']) ? (string) $_SERVER['HTTP_ACCEPT'] : '';
        foreach (explode(',', $accept) as $range) {
            $params = array_map('trim', explode(';', $range));
            if (strtolower(array_shift($params)) !== 'image/webp') {
                continue;
            }
            $quality = 1.0;
            foreach ($params as $param) {
                if (preg_match('/^q\s*=\s*([0-9.]+)$/i', $param, $m)) {
                    $quality = (float) $m[1];
                }
            }

            return $quality > 0;
        }

        return false;
    }
}

if (!function_exists('api_image_jpeg_is_upright')) {
    /**
     * 원본 JPEG 를 그대로 옮겨도 되는지 — 사진기가 방향 정보(EXIF Orientation)만 적어 둔 사진은 GD 로 옮기면
     * 그 정보가 빠져 눕거나 뒤집힌다. 방향은 exif 확장 없이 직접 읽는다(api_image_jpeg_orientation).
     */
    function api_image_jpeg_is_upright(string $path): bool
    {
        return api_image_jpeg_orientation($path) === 1;
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
    function api_image_webp_copy(string $base_path, string $original_path, int $width, int $height = 0): string
    {
        $dir = dirname($original_path);
        $base = basename($original_path);
        $name = preg_replace('/\.[^.\/]+$/', '', $base);
        // 원본 확장자를 이름에 남긴다 — 같은 폴더의 photo.png 와 photo.jpg 가 같은 WebP 를 나눠 쓰지 않게.
        // thumb-{원본 이름}* 꼴은 그대로라 코어가 원본을 지울 때 함께 지운다.
        $ext = strtolower((string) pathinfo($base, PATHINFO_EXTENSION));
        $target = $dir . '/thumb-' . $name . '_' . $width . 'x' . $height . ($ext !== '' ? '.' . $ext : '') . '.webp';

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
     * ?w=(&h=) 요청에 내줄 파일. ['path' => 보낼 파일, 'mime' => 그 형식, 'vary' => Vary: Accept 를 붙일지].
     * 세로가 있으면 가운데를 잘라 그 크기로(게시판 갤러리 크기만 받는다), 없으면 폭만 줄인다.
     *
     * 'vary' 는 이 요청이 Accept 에 따라 다른 형식을 받을 수 있었는지다 — 이번에 PNG 를 줬더라도
     * 같은 주소가 다른 브라우저에는 WebP 로 나가므로 캐시에 알려야 한다.
     */
    function api_image_variant(string $path, string $mime, int $width, int $height = 0): array
    {
        $result = ['path' => $path, 'mime' => $mime, 'vary' => false];
        if (!api_image_size_allowed($width, $height)) {
            return $result;
        }

        // 원본을 풀기 전에 본다 — 너무 크거나(메모리), 움직이거나, 방향을 바로 세울 수 없는 그림은 원본 그대로.
        $info = @getimagesize($path);
        if (!$info || !api_image_decodable((int) $info[0], (int) $info[1]) || !api_image_is_still($path, $mime)) {
            return $result;
        }
        if ($info[2] === IMAGETYPE_JPEG) {
            // 코어 thumbnail() 은 회전(3·6·8)만, 그것도 exif 확장이 있을 때만 바로 세운다.
            // 뒤집힌 사진(2·4·5·7)이나 exif 확장이 없는 호스트의 회전 사진은 원본을 낸다.
            $orientation = api_image_jpeg_orientation($path);
            if ($orientation !== 1 && (!in_array($orientation, [3, 6, 8], true) || !function_exists('exif_read_data'))) {
                return $result;
            }
        }

        $resized = $height > 0
            ? api_image_cropped_copy($path, $mime, $width, $height)
            : api_image_resized_copy($path, $mime, $width);
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

        $webp = $resized !== ''
            ? api_image_webp_copy($result['path'], $path, $width, $height)
            : api_image_webp_copy($result['path'], $path, 0);
        // 이미 잘 눌린 사진은 WebP 가 더 클 때도 있다. 작은 쪽을 보낸다.
        if ($webp !== '' && (int) @filesize($webp) < (int) @filesize($result['path'])) {
            $result['path'] = $webp;
            $result['mime'] = 'image/webp';
        }

        return $result;
    }
}
