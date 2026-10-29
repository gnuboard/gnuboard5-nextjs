<?php
/**
 * 움직이는 그림 판별 — GIF · WebP · APNG 가 여러 장면인지. 움직이는 그림은 줄이면 첫 장면만 남으므로 사본 · 썸네일을
 * 만들지 않고 원본을 낸다(image-variants.php 의 사본 만들기 · editor-images.php 의 본문 썸네일이 쓴다).
 */

if (!defined('_GNUBOARD_')) {
    exit;
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

if (!function_exists('api_image_is_animated_webp')) {
    /**
     * 움직이는 WebP 인지 — RIFF 머리 뒤 첫 조각이 VP8X 이고 그 깃발에 애니메이션(0x02)이 있으면. VP8 · VP8L 로
     * 시작하면 한 장짜리다. 머리를 못 읽으면 움직이는 것으로 본다(줄이지 않고 원본을 낸다).
     * 코어 is_animated_webp 는 파일 어디든 "ANMF" 글자를 찾아 압축 자료의 우연한 글자에도 걸린다.
     */
    function api_image_is_animated_webp(string $path): bool
    {
        $head = (string) @file_get_contents($path, false, null, 0, 21);
        if (strlen($head) < 16 || substr($head, 0, 4) !== 'RIFF' || substr($head, 8, 4) !== 'WEBP') {
            return true;
        }
        $first = substr($head, 12, 4);
        if ($first === 'VP8 ' || $first === 'VP8L') {
            return false;
        }

        return $first !== 'VP8X' || strlen($head) < 21 || (ord($head[20]) & 0x02) !== 0;
    }
}

if (!function_exists('api_image_is_animated_gif')) {
    /**
     * 움직이는 GIF 인지 — 블록을 차례로 따라가며 그림 묘사(0x2C)를 센다. 둘 이상이면 움직인다. 구조가 이상하면
     * 움직이는 것으로 본다(줄이지 않고 원본을 낸다). 코어 is_animated_gif 는 100KB 씩 끊어 읽으며 장면 머리를
     * 정규식으로 찾아, 머리가 끊긴 자리에 걸리면 움직이는 GIF 를 놓치고 첫 장면만 남길 수 있다.
     */
    function api_image_is_animated_gif(string $path): bool
    {
        $bytes = (string) @file_get_contents($path);
        $len = strlen($bytes);
        if ($len < 13 || strncmp($bytes, 'GIF8', 4) !== 0) {
            return true;
        }
        $pos = 13;
        $flags = ord($bytes[10]);
        if ($flags & 0x80) {
            $pos += 3 * (1 << (($flags & 0x07) + 1)); // 전역 색표
        }
        $frames = 0;
        while ($pos < $len) {
            $block = ord($bytes[$pos]);
            if ($block === 0x3B) { // 끝
                return $frames > 1;
            }
            if ($block === 0x21) { // 확장: 표지 다음 자료 묶음들
                $pos += 2;
            } elseif ($block === 0x2C) { // 그림 묘사 10바이트(+지역 색표) · LZW 최소 부호 길이 다음 자료 묶음들
                if (++$frames > 1) {
                    return true;
                }
                if ($pos + 10 > $len) {
                    return true;
                }
                $local = ord($bytes[$pos + 9]);
                $pos += 10 + (($local & 0x80) ? 3 * (1 << (($local & 0x07) + 1)) : 0) + 1;
            } else {
                return true;
            }
            // 자료 묶음: 길이 바이트 · 그만큼의 자료, 길이 0 이 끝.
            while ($pos < $len && ($size = ord($bytes[$pos])) !== 0) {
                $pos += $size + 1;
            }
            $pos++;
        }

        return true; // 끝 표지 없이 끝났다
    }
}

if (!function_exists('api_image_is_still')) {
    /**
     * 움직이지 않는 그림인지 — GIF · WebP 는 한 장짜리일 때만(api_image_is_animated_*), PNG 는 APNG 가 아닐 때만.
     * 움직이는 그림은 줄이면 첫 장면만 남으므로 원본을 낸다.
     */
    function api_image_is_still(string $path, string $mime): bool
    {
        if ($mime === 'image/gif') {
            return !api_image_is_animated_gif($path);
        }
        if ($mime === 'image/webp') {
            return !api_image_is_animated_webp($path);
        }

        return !($mime === 'image/png' && api_image_is_animated_png($path));
    }
}
