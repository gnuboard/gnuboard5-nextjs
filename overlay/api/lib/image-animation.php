<?php
/**
 * 움직이는 그림(GIF · WebP · APNG)을 움직이는 채로 받기 — api/v1/upload.php 가 쓴다.
 *
 * 업로드는 모든 그림을 GD 로 다시 그려 메타데이터 · 덧붙은 자료를 없애는데, GD 는 GIF · APNG 의 첫 장면만 읽고 움직이는
 * WebP 는 아예 읽지 못한다. 그누보드 원본 에디터(SmartEditor2)는 다시 그리지 않고 원본을 두므로 움직이는 그림이 그대로
 * 올라간다. 여기서는 그 사이 — 파일을 조각(블록) 단위로 읽어 장면 · 장면 제어 · 반복 설정 · 색 정보만 다시 엮고, 주석 ·
 * 글자 · EXIF · XMP · ICC 같은 메타데이터와 모르는 조각, 파일 끝 뒤에 덧붙은 자료는 버린다.
 * 장면이 둘 이상이고 구조가 온전하며 스크립트 표식이 없을 때만 쓰고, 아니면 null — 부르는 쪽은 예전처럼 GD 로 다시
 * 그린다(첫 장면, 움직이는 WebP 는 거절).
 */

if (!defined('_GNUBOARD_')) exit;

if (!defined('API_ANIMATION_MAX_FRAMES')) {
    define('API_ANIMATION_MAX_FRAMES', 500);         // 장면 수 상한
    define('API_ANIMATION_MAX_PIXELS', 300000000);   // 모든 장면의 화소 합 상한(보는 브라우저가 풀며 쓰는 양)
}

if (!function_exists('api_image_clean_animation')) {
    /** 움직이는 그림일 수 있는지 — 파일 머리만 본다(움직이지 않는 PNG · WebP 를 통째로 읽지 않게). */
    function api_image_animation_candidate(string $path, string $mime): bool
    {
        if ($mime === 'image/gif') {
            return true;
        }
        if ($mime === 'image/png') {
            return !function_exists('api_image_is_animated_png') || api_image_is_animated_png($path);
        }
        if ($mime === 'image/webp') {
            // RIFF 머리 12바이트 뒤 첫 조각이 VP8X 이고 그 깃발에 애니메이션(0x02)이 있어야 한다.
            $head = (string) @file_get_contents($path, false, null, 0, 21);
            return strlen($head) === 21 && substr($head, 0, 4) === 'RIFF' && substr($head, 8, 8) === 'WEBPVP8X'
                && (ord($head[20]) & 0x02) !== 0;
        }
        return false;
    }

    /**
     * @param int $maxWidth  getimagesize 로 이미 확인한 그림 가로(장면이 이 밖으로 나가면 받지 않는다)
     * @param int $maxHeight 그림 세로
     * @return string|null 다시 엮은 그림, 움직이지 않거나 · 구조가 이상하거나 · 스크립트 표식이 있으면 null
     */
    function api_image_clean_animation(string $mime, string $bytes, int $maxWidth, int $maxHeight): ?string
    {
        switch ($mime) {
            case 'image/gif':  $out = api_gif_clean_animation($bytes, $maxWidth, $maxHeight); break;
            case 'image/webp': $out = api_webp_clean_animation($bytes, $maxWidth, $maxHeight); break;
            case 'image/png':  $out = api_png_clean_animation($bytes, $maxWidth, $maxHeight); break;
            default:           return null;
        }
        return $out !== null && !api_animation_has_script($out) ? $out : null;
    }

    /**
     * 장면 하나를 센다 — 그림 밖으로 나가거나 장면 수 · 화소 합이 상한을 넘으면 false.
     *
     * @param array{frames:int,pixels:int} $tally
     */
    function api_animation_add_frame(array &$tally, int $x, int $y, int $width, int $height, int $maxWidth, int $maxHeight): bool
    {
        $tally['frames']++;
        $tally['pixels'] += $width * $height;
        return $width > 0 && $height > 0 && $x + $width <= $maxWidth && $y + $height <= $maxHeight
            && $tally['frames'] <= API_ANIMATION_MAX_FRAMES && $tally['pixels'] <= API_ANIMATION_MAX_PIXELS;
    }

    /**
     * 그림 자료 안에 PHP · HTML · SVG 표식이 있는지 — 있으면 원본을 두지 않고 GD 로 다시 그린다. 덧붙인 방어다(파일은
     * 원래 확장자 · 이미지 형식으로만 나간다). "<?=" 처럼 짧은 표식은 큰 그림의 압축 자료에 우연히 생겨 멀쩡한 그림을
     * 멈추게 하므로 넣지 않는다.
     */
    function api_animation_has_script(string $bytes): bool
    {
        foreach (['<?php', '<script', '<svg', '<html'] as $marker) {
            if (stripos($bytes, $marker) !== false) {
                return true;
            }
        }
        return false;
    }

    // ── GIF: 머리 · 화면 정보 · 전체 색상표 → 확장 블록(0x21) · 그림 블록(0x2C) … → 끝(0x3B) ─────────────────

    /** 장면 제어(지연 · 투명)와 반복 설정(NETSCAPE2.0 · ANIMEXTS1.0), 그림 블록만 남긴다. */
    function api_gif_clean_animation(string $bytes, int $maxWidth, int $maxHeight): ?string
    {
        $length = strlen($bytes);
        if ($length < 13 || !in_array(substr($bytes, 0, 6), ['GIF87a', 'GIF89a'], true)) {
            return null;
        }
        $packed = ord($bytes[10]);
        $pos = 13 + (($packed & 0x80) ? 3 * (2 << ($packed & 0x07)) : 0);
        if ($pos > $length) {
            return null;
        }
        $out = substr($bytes, 0, $pos);
        $tally = ['frames' => 0, 'pixels' => 0];

        while ($pos < $length) {
            $marker = ord($bytes[$pos]);
            if ($marker === 0x3B) { // 끝 표시 — 뒤에 덧붙은 것은 버린다
                return $tally['frames'] >= 2 ? $out . ';' : null;
            }
            if ($marker === 0x21) { // 확장 블록: 표지 + 하위 블록들
                if ($pos + 2 > $length) {
                    return null;
                }
                $label = ord($bytes[$pos + 1]);
                $end = api_gif_skip_sub_blocks($bytes, $pos + 2);
                if ($end === null) {
                    return null;
                }
                $keep = $label === 0xF9;
                if ($label === 0xFF && $pos + 14 <= $length && ord($bytes[$pos + 2]) === 11) {
                    $keep = in_array(substr($bytes, $pos + 3, 11), ['NETSCAPE2.0', 'ANIMEXTS1.0'], true);
                }
                if ($keep) {
                    $out .= substr($bytes, $pos, $end - $pos);
                }
                $pos = $end;
                continue;
            }
            if ($marker === 0x2C) { // 그림 블록: 설명 9바이트 + 색상표 + LZW 최소 부호 길이 + 하위 블록들
                if ($pos + 11 > $length) {
                    return null;
                }
                $left = ord($bytes[$pos + 1]) | (ord($bytes[$pos + 2]) << 8);
                $top = ord($bytes[$pos + 3]) | (ord($bytes[$pos + 4]) << 8);
                $width = ord($bytes[$pos + 5]) | (ord($bytes[$pos + 6]) << 8);
                $height = ord($bytes[$pos + 7]) | (ord($bytes[$pos + 8]) << 8);
                if (!api_animation_add_frame($tally, $left, $top, $width, $height, $maxWidth, $maxHeight)) {
                    return null;
                }
                $local = ord($bytes[$pos + 9]);
                $dataStart = $pos + 10 + (($local & 0x80) ? 3 * (2 << ($local & 0x07)) : 0) + 1;
                $end = $dataStart <= $length ? api_gif_skip_sub_blocks($bytes, $dataStart) : null;
                if ($end === null) {
                    return null;
                }
                $out .= substr($bytes, $pos, $end - $pos);
                $pos = $end;
                continue;
            }
            return null; // 모르는 블록 — GIF 가 아니거나 망가졌다
        }
        return null; // 끝 표시 없이 끝났다
    }

    /** 하위 블록들(길이 1바이트 + 자료, 길이 0 으로 끝)을 건너뛴 위치. 파일이 먼저 끝나면 null. */
    function api_gif_skip_sub_blocks(string $bytes, int $pos): ?int
    {
        $length = strlen($bytes);
        while ($pos < $length) {
            $size = ord($bytes[$pos]);
            $pos += 1 + $size;
            if ($size === 0) {
                return $pos;
            }
        }
        return null;
    }

    // ── WebP: RIFF 머리 → VP8X(깃발 · 그림 크기) · ANIM(배경 · 반복) · ANMF(장면: 위치 · 크기 · 지연 + ALPH · VP8 · VP8L) ──

    /** VP8X(ICC · EXIF · XMP 깃발을 내림) · ANIM · ANMF 만 남긴다. ICCP · EXIF · XMP · 모르는 조각은 버린다. */
    function api_webp_clean_animation(string $bytes, int $maxWidth, int $maxHeight): ?string
    {
        $length = strlen($bytes);
        if ($length < 30 || substr($bytes, 0, 4) !== 'RIFF' || substr($bytes, 8, 4) !== 'WEBP') {
            return null;
        }
        $chunks = api_webp_chunks($bytes, 12, min($length, 8 + unpack('V', substr($bytes, 4, 4))[1]));
        if ($chunks === null || $chunks === [] || $chunks[0][0] !== 'VP8X' || strlen($chunks[0][1]) !== 10) {
            return null;
        }
        $vp8x = $chunks[0][1];
        if ((ord($vp8x[0]) & 0x02) === 0) {
            return null; // 움직이지 않는 WebP
        }
        $canvasWidth = api_le24($vp8x, 4) + 1;
        $canvasHeight = api_le24($vp8x, 7) + 1;
        if ($canvasWidth > $maxWidth || $canvasHeight > $maxHeight) {
            return null;
        }
        $vp8x[0] = chr(ord($vp8x[0]) & ~(0x20 | 0x08 | 0x04)); // ICC · EXIF · XMP 를 버리므로 깃발도 내린다
        $out = api_webp_chunk('VP8X', $vp8x);
        $tally = ['frames' => 0, 'pixels' => 0];
        $hasAnim = false;

        foreach (array_slice($chunks, 1) as [$type, $data]) {
            if ($type === 'ANIM' && !$hasAnim && strlen($data) === 6) {
                $out .= api_webp_chunk('ANIM', $data);
                $hasAnim = true;
                continue;
            }
            if ($type !== 'ANMF') {
                continue;
            }
            if (!$hasAnim || strlen($data) < 16) {
                return null;
            }
            $x = api_le24($data, 0) * 2;
            $y = api_le24($data, 3) * 2;
            if (!api_animation_add_frame($tally, $x, $y, api_le24($data, 6) + 1, api_le24($data, 9) + 1, $canvasWidth, $canvasHeight)) {
                return null;
            }
            $parts = api_webp_chunks($data, 16, strlen($data));
            if ($parts === null) {
                return null;
            }
            $frame = substr($data, 0, 16);
            $hasBitstream = false;
            foreach ($parts as [$partType, $partData]) {
                if (in_array($partType, ['ALPH', 'VP8 ', 'VP8L'], true)) {
                    $frame .= api_webp_chunk($partType, $partData);
                    $hasBitstream = $hasBitstream || $partType !== 'ALPH';
                }
            }
            if (!$hasBitstream) {
                return null;
            }
            $out .= api_webp_chunk('ANMF', $frame);
        }
        if ($tally['frames'] < 2) {
            return null;
        }
        return 'RIFF' . pack('V', 4 + strlen($out)) . 'WEBP' . $out;
    }

    /**
     * RIFF 조각 목록 [[종류, 자료], …] — $from 부터 $to 까지. 조각 크기가 범위를 넘으면 null.
     *
     * @return array<int,array{0:string,1:string}>|null
     */
    function api_webp_chunks(string $bytes, int $from, int $to): ?array
    {
        $chunks = [];
        while ($from + 8 <= $to) {
            $size = unpack('V', substr($bytes, $from + 4, 4))[1];
            if ($size > $to - $from - 8) {
                return null;
            }
            $chunks[] = [substr($bytes, $from, 4), substr($bytes, $from + 8, $size)];
            $from += 8 + $size + ($size & 1); // 홀수 크기 조각 뒤에는 채움 1바이트
        }
        return $chunks;
    }

    function api_webp_chunk(string $type, string $data): string
    {
        return $type . pack('V', strlen($data)) . $data . ((strlen($data) & 1) ? "\x00" : '');
    }

    /** 3바이트 little-endian 정수. */
    function api_le24(string $bytes, int $offset): int
    {
        return ord($bytes[$offset]) | (ord($bytes[$offset + 1]) << 8) | (ord($bytes[$offset + 2]) << 16);
    }

    // ── APNG: PNG 서명 → IHDR · acTL(장면 수 · 반복) · fcTL(장면 위치 · 크기 · 지연) · IDAT · fdAT … → IEND ─────────

    /** 그림 · 색 · 애니메이션 조각만 남긴다. tEXt · zTXt · iTXt · eXIf · iCCP · 모르는 조각, IEND 뒤 자료는 버린다. */
    function api_png_clean_animation(string $bytes, int $maxWidth, int $maxHeight): ?string
    {
        $length = strlen($bytes);
        if ($length < 8 || substr($bytes, 0, 8) !== "\x89PNG\r\n\x1a\n") {
            return null;
        }
        $keep = ['IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'acTL', 'fcTL', 'IDAT', 'fdAT', 'IEND'];
        $out = substr($bytes, 0, 8);
        $pos = 8;
        $width = 0;
        $height = 0;
        $animated = false;
        $tally = ['frames' => 0, 'pixels' => 0];

        while ($pos + 12 <= $length) {
            $size = unpack('N', substr($bytes, $pos, 4))[1];
            if ($size > $length - $pos - 12) {
                return null;
            }
            $type = substr($bytes, $pos + 4, 4);
            $data = substr($bytes, $pos + 8, $size);
            if (unpack('N', substr($bytes, $pos + 8 + $size, 4))[1] !== crc32($type . $data)) {
                return null; // 조각이 망가졌다
            }
            $chunk = substr($bytes, $pos, 12 + $size);
            $pos += 12 + $size;

            if ($type === 'IHDR') {
                if ($size !== 13 || $width > 0) {
                    return null;
                }
                $width = unpack('N', substr($data, 0, 4))[1];
                $height = unpack('N', substr($data, 4, 4))[1];
                if ($width < 1 || $height < 1 || $width > $maxWidth || $height > $maxHeight) {
                    return null;
                }
            } elseif ($width === 0) {
                return null; // IHDR 가 맨 앞이 아니다
            } elseif ($type === 'acTL') {
                $animated = true;
            } elseif ($type === 'IDAT' && !$animated) {
                return null; // 움직이지 않는 PNG — acTL 은 첫 IDAT 앞에 와야 한다
            } elseif ($type === 'fcTL') {
                if ($size !== 26) {
                    return null;
                }
                $frame = unpack('Nseq/Nwidth/Nheight/Nx/Ny', substr($data, 0, 20));
                if (!api_animation_add_frame($tally, $frame['x'], $frame['y'], $frame['width'], $frame['height'], $width, $height)) {
                    return null;
                }
            }
            if ($type === 'IEND') {
                return $tally['frames'] >= 2 ? $out . $chunk : null;
            }
            if (in_array($type, $keep, true)) {
                $out .= $chunk;
            }
        }
        return null; // IEND 없이 끝났다
    }
}
