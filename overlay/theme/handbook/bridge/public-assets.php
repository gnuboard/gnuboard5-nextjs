<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function handbook_bridge_public_base_path()
{
    $base_path = parse_url(handbook_g5_url(), PHP_URL_PATH);

    return $base_path && $base_path !== '/' ? '/' . trim($base_path, '/') : '';
}

function handbook_bridge_public_scope_path()
{
    $base_path = handbook_bridge_public_base_path();

    return $base_path !== '' ? $base_path . '/' : '/';
}

function handbook_bridge_public_asset_path($path)
{
    $path = (string) $path;
    if ($path === '' || preg_match('#^https?://#i', $path) || strpos($path, 'data:') === 0) {
        return $path;
    }

    if ($path[0] !== '/') {
        return $path;
    }

    $base_path = handbook_bridge_public_base_path();
    if ($base_path !== '' && ($path === $base_path || strpos($path, $base_path . '/') === 0)) {
        return $path;
    }

    return $base_path . $path;
}

function handbook_bridge_public_robots_path($path)
{
    $path = trim((string) $path);
    if ($path === '') {
        return $path;
    }

    $base_path = handbook_bridge_public_base_path();
    if ($base_path === '' || $path[0] !== '/') {
        return $path;
    }

    if ($path === $base_path || strpos($path, $base_path . '/') === 0) {
        return $path;
    }

    return $base_path . $path;
}

function handbook_bridge_public_route_path($path)
{
    $path = (string) $path;
    if ($path === '') {
        return '/';
    }

    if ($path[0] !== '/') {
        return '/' . ltrim($path, '/');
    }

    $base_path = handbook_bridge_public_base_path();
    if ($base_path !== '' && ($path === $base_path || strpos($path, $base_path . '/') === 0)) {
        $path = substr($path, strlen($base_path));

        return $path !== '' ? $path : '/';
    }

    return $path;
}

function handbook_bridge_rewrite_manifest_image_entries($items)
{
    if (!is_array($items)) {
        return $items;
    }

    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }

        if (isset($item['src']) && is_string($item['src'])) {
            $item['src'] = handbook_bridge_public_asset_path($item['src']);
        }

        $items[$index] = $item;
    }

    return $items;
}

function handbook_bridge_rewrite_manifest_asset($body)
{
    $manifest = json_decode($body, true);
    if (!is_array($manifest) || json_last_error() !== JSON_ERROR_NONE) {
        return $body;
    }

    $manifest['start_url'] = handbook_bridge_public_scope_path();
    $manifest['scope'] = handbook_bridge_public_scope_path();
    if (function_exists('handbook_apply_site_name_to_manifest')) {
        $manifest = handbook_apply_site_name_to_manifest($manifest);
    }

    if (isset($manifest['icons'])) {
        $manifest['icons'] = handbook_bridge_rewrite_manifest_image_entries($manifest['icons']);
    }

    if (isset($manifest['screenshots'])) {
        $manifest['screenshots'] = handbook_bridge_rewrite_manifest_image_entries($manifest['screenshots']);
    }

    if (isset($manifest['shortcuts']) && is_array($manifest['shortcuts'])) {
        foreach ($manifest['shortcuts'] as $index => $shortcut) {
            if (!is_array($shortcut)) {
                continue;
            }

            if (isset($shortcut['url']) && is_string($shortcut['url'])) {
                $shortcut['url'] = handbook_bridge_public_asset_path($shortcut['url']);
            }
            if (isset($shortcut['icons'])) {
                $shortcut['icons'] = handbook_bridge_rewrite_manifest_image_entries($shortcut['icons']);
            }

            $manifest['shortcuts'][$index] = $shortcut;
        }
    }

    $json = json_encode(
        $manifest,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );

    return is_string($json) ? $json . "\n" : $body;
}

function handbook_bridge_rewrite_robots_asset($body, $base)
{
    $body = preg_replace('/^User-Agent:/mi', 'User-agent:', $body);
    $body = preg_replace_callback(
        '/^(Allow|Disallow):\s*(\S*)\s*$/mi',
        function ($match) {
            return $match[1] . ': ' . handbook_bridge_public_robots_path($match[2]);
        },
        $body
    );

    if (preg_match('/^Host:\s*\S+\s*$/mi', $body)) {
        $body = preg_replace('/^Host:\s*\S+\s*$/mi', 'Host: ' . $base, $body);
    } else {
        $body = rtrim($body) . "\nHost: " . $base . "\n";
    }

    if (preg_match('/^Sitemap:\s*\S+\s*$/mi', $body)) {
        $body = preg_replace_callback(
            '/^Sitemap:\s*(\S+)\s*$/mi',
            function ($match) use ($base) {
                $path = parse_url($match[1], PHP_URL_PATH);
                $path = $path ? handbook_bridge_public_route_path($path) : '/sitemap.xml';

                return 'Sitemap: ' . $base . $path;
            },
            $body
        );
    } else {
        $body = rtrim($body) . "\nSitemap: " . $base . "/sitemap.xml\n";
        $body = rtrim($body) . "\nSitemap: " . $base . "/sitemap-posts.xml\n";
    }

    return $body;
}

function handbook_bridge_rewrite_public_metadata_asset($asset, $body)
{
    $base = handbook_g5_url();
    if ($base === '') {
        return $body;
    }

    if ($asset === 'manifest.webmanifest' || $asset === 'manifest.json') {
        return handbook_bridge_rewrite_manifest_asset($body);
    }

    if ($asset === 'robots.txt') {
        return handbook_bridge_rewrite_robots_asset($body, $base);
    }

    if ($asset === 'sitemap.xml' || $asset === 'sitemap-posts.xml') {
        return preg_replace_callback(
            '#<loc>https?://[^/<>\s]+([^<]*)</loc>#i',
            function ($match) use ($base) {
                $path = handbook_bridge_public_route_path($match[1] !== '' ? $match[1] : '/');

                return '<loc>' . $base . $path . '</loc>';
            },
            $body
        );
    }

    return $body;
}
