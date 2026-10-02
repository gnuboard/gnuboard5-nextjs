<?php

if (!defined('_GNUBOARD_')) exit;

function api_editor_image_path($ym, $filename)
{
    $ym = preg_replace('/[^0-9A-Za-z_]/', '', (string) $ym);
    $filename = basename(str_replace('\\', '/', (string) $filename));

    if ($ym === '' || $filename === '' || !preg_match('/\.(gif|jpe?g|png|webp|bmp)$/i', $filename)) {
        return '';
    }

    $base_dir = realpath(G5_DATA_PATH . '/editor/' . $ym);
    if ($base_dir === false) {
        return '';
    }

    $path = realpath($base_dir . '/' . $filename);
    if ($path === false || !is_file($path)) {
        return '';
    }

    $base_dir = rtrim(str_replace('\\', '/', $base_dir), '/');
    $normalized_path = str_replace('\\', '/', $path);
    if ($normalized_path !== $base_dir && strpos($normalized_path, $base_dir . '/') !== 0) {
        return '';
    }

    return $path;
}

function api_editor_image_url($ym, $filename)
{
    $path = api_editor_image_path($ym, $filename);
    if ($path === '') {
        return '';
    }

    $base = api_public_app_base_url();
    $stamp = filemtime($path) ?: 0;

    return ($base !== '' ? $base : '')
        . '/api/v1/editor-images/'
        . rawurlencode((string) $ym)
        . '/'
        . rawurlencode((string) basename(str_replace('\\', '/', (string) $filename)))
        . ($stamp ? '?v=' . $stamp : '');
}

/**
 * 사진 주소에서 에디터 사진의 [년월 폴더, 파일 이름]. 원래 주소(…/data/editor/2609/a.png)와 이 API 가
 * 바꿔 낸 주소(/api/v1/editor-images/2609/a.png) 둘 다 알아본다. 에디터 사진이 아니면 null.
 */
function api_editor_image_ref($src)
{
    $parts = parse_url(html_entity_decode((string) $src, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $path = is_array($parts) && isset($parts['path']) ? (string) $parts['path'] : '';
    if ($path === '') {
        return null;
    }

    if (preg_match('~(?:^|/)data/editor/([0-9A-Za-z_]+)/([^/?#]+\.(?:gif|jpe?g|png|webp|bmp))$~i', $path, $m)
        || preg_match('~/api/v1/editor-images/([0-9A-Za-z_]+)/([^/?#]+\.(?:gif|jpe?g|png|webp|bmp))$~i', $path, $m)) {
        return array($m[1], rawurldecode($m[2]));
    }

    return null;
}

/**
 * 본문의 첫 에디터 사진의 썸네일 주소($width 폭, $height 가 있으면 그 크기로 자르기). 없으면 빈 문자열.
 *
 * 그누보드 get_list_thumbnail · get_itemuselist_thumbnail 이 첨부 사진이 없을 때 하는 것과 같다 —
 * 본문의 사진을 앞에서부터 보고, 실제 사진 파일이 있는 첫 장을 쓴다.
 */
function api_editor_first_image_url($html, $width, $height = 0)
{
    $html = (string) $html;
    if ($html === '' || !preg_match_all('/<img\b[^>]*?\bsrc\s*=\s*("|\')([^"\']+)\1/i', $html, $matches)) {
        return '';
    }

    foreach ($matches[2] as $src) {
        $ref = api_editor_image_ref($src);
        if ($ref === null) {
            continue;
        }
        $path = api_editor_image_path($ref[0], $ref[1]);
        if ($path === '' || !@getimagesize($path)) {
            continue;
        }

        return api_image_url_with_size(api_editor_image_url($ref[0], $ref[1]), (int) $width, (int) $height);
    }

    return '';
}

/**
 * 글 보기 본문의 에디터 사진 중 $thumb_width(게시판의 bo_image_width)보다 넓은 것을 그 폭의 썸네일로 바꾸고
 * 원본 보기 링크로 감싼다 — 그누보드 get_view_thumbnail 과 같은 일이다. 좁은 사진 · 움직이는 GIF 는 그대로.
 * api_rewrite_editor_image_urls 보다 먼저 부른다(바꾼 주소는 그 함수가 다시 건드리지 않는다).
 */
function api_view_thumbnail_html($html, $thumb_width)
{
    $html = (string) $html;
    $thumb_width = (int) $thumb_width;
    // 수정 화면을 거친 글은 사진 주소가 이 API 주소(/api/v1/editor-images/…)로 저장돼 있다 — 둘 다 본다.
    if ($html === '' || $thumb_width < 1
        || (stripos($html, 'data/editor/') === false && stripos($html, '/api/v1/editor-images/') === false)) {
        return $html;
    }

    return preg_replace_callback(
        '/<img\b[^>]*>/i',
        function ($match) use ($html, $thumb_width) {
            $tag = $match[0][0];
            $offset = $match[0][1];
            if (!preg_match('/\bsrc\s*=\s*("|\')([^"\']+)\1/i', $tag, $srcMatch)) {
                return $tag;
            }
            $ref = api_editor_image_ref($srcMatch[2]);
            if ($ref === null) {
                return $tag;
            }
            $path = api_editor_image_path($ref[0], $ref[1]);
            $size = $path !== '' ? @getimagesize($path) : false;
            if (!$size || ($size[2] === IMAGETYPE_GIF && function_exists('is_animated_gif') && is_animated_gif($path))) {
                return $tag;
            }

            // 사진기가 회전 정보만 적어 둔 세로 사진은 가로 · 세로를 바꿔 잰다(코어와 같다).
            $width = (int) $size[0];
            if ($size[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
                $exif = @exif_read_data($path);
                if (is_array($exif) && in_array((int) ($exif['Orientation'] ?? 1), array(5, 6, 7, 8), true)) {
                    $width = (int) $size[1];
                }
            }
            if ($width <= $thumb_width) {
                return $tag;
            }

            $original = api_editor_image_url($ref[0], $ref[1]);
            $thumb = api_image_url_with_width($original, $thumb_width);
            if ($thumb === $original) {
                return $tag; // 받지 않는 폭 — 원본 그대로 둔다.
            }

            $newTag = preg_replace(
                '/\bsrc\s*=\s*("|\')[^"\']+\1/i',
                'src="' . htmlspecialchars($thumb, ENT_QUOTES, 'UTF-8') . '"',
                $tag,
                1
            );
            // srcset 이 남으면 브라우저가 src 대신 원본을 고른다.
            $newTag = preg_replace('/\s+srcset\s*=\s*("|\')[^"\']*\1/i', '', $newTag);

            // 이미 링크 안의 사진이면 링크를 겹치지 않는다.
            $before = substr($html, 0, $offset);
            $openA = strripos($before, '<a ');
            $openB = strripos($before, '<a>');
            $open = max($openA === false ? -1 : $openA, $openB === false ? -1 : $openB);
            $close = strripos($before, '</a>');
            if ($open >= 0 && ($close === false || $open > $close)) {
                return $newTag;
            }

            return '<a href="' . htmlspecialchars($original, ENT_QUOTES, 'UTF-8') . '" target="_blank" rel="noopener" class="view_image">'
                . $newTag . '</a>';
        },
        $html,
        -1,
        $count,
        PREG_OFFSET_CAPTURE
    );
}

function api_rewrite_editor_image_urls($html)
{
    $html = (string) $html;
    if ($html === '' || stripos($html, 'data/editor/') === false) {
        return $html;
    }

    return preg_replace_callback(
        '/\b(src|srcset)\s*=\s*("|\')([^"\']+)\2/i',
        function ($matches) {
            $attribute = $matches[1];
            $quote = $matches[2];
            $value = $matches[3];

            $rewrite_single = function ($candidate) {
                $candidate = trim((string) $candidate);
                if ($candidate === '') {
                    return $candidate;
                }

                $parts = parse_url(html_entity_decode($candidate, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if (!is_array($parts)) {
                    return $candidate;
                }

                $path = isset($parts['path']) ? (string) $parts['path'] : '';
                if (!preg_match('~(?:^|/)data/editor/([0-9A-Za-z_]+)/([^/?#]+\.(?:gif|jpe?g|png|webp|bmp))$~i', $path, $path_matches)) {
                    return $candidate;
                }

                $url = api_editor_image_url($path_matches[1], rawurldecode($path_matches[2]));
                return $url !== '' ? $url : $candidate;
            };

            if (strtolower($attribute) === 'srcset') {
                $items = array_map('trim', explode(',', $value));
                $rewritten = array();
                foreach ($items as $item) {
                    if ($item === '') {
                        continue;
                    }
                    $parts = preg_split('/\s+/', $item, 2);
                    $url = $rewrite_single($parts[0]);
                    $rewritten[] = $url . (isset($parts[1]) ? ' ' . $parts[1] : '');
                }
                return $attribute . '=' . $quote . implode(', ', $rewritten) . $quote;
            }

            return $attribute . '=' . $quote . $rewrite_single($value) . $quote;
        },
        $html
    );
}
