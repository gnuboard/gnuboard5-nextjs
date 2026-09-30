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
