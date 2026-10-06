<?php
/**
 * 사진을 GD 로 풀기 전 픽셀 · 메모리 한도 — 사진 파생본(image-variants.php)과 회원 사진 · 에디터 업로드가
 * 같은 예산을 쓴다. image-variants.php 가 읽는다(API_IMAGE_MAX_PIXELS 도 거기서 정한다).
 */

if (!defined('_GNUBOARD_')) {
    exit;
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

        return api_image_memory_fits($pixels);
    }
}

if (!function_exists('api_image_memory_fits')) {
    /**
     * 이 화소 수의 그림을 GD 로 풀 메모리가 남았는지(픽셀 상한은 보지 않는다 — 부르는 쪽이 정한다).
     * 에디터 업로드처럼 큰 사진을 받아 줄이는 경로도 같은 예산을 쓴다.
     */
    function api_image_memory_fits(int $pixels): bool
    {
        if ($pixels <= 0) {
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
