<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

/*
 * Generic social bridge loader for Next.js-derived Gnuboard themes.
 *
 * The bridge is shared and theme-neutral. It only loads when the active
 * cf_theme has a Next.js route.php bridge, so new themes do not need their own
 * extend/<theme>-social.extend.php file.
 */

$g5_nextjs_social_theme = g5_nextjs_runtime_active_theme();
$g5_nextjs_social_theme_path = g5_nextjs_runtime_theme_path($g5_nextjs_social_theme);
$g5_nextjs_social_bridge = defined('G5_PATH')
    ? rtrim(G5_PATH, '/\\') . '/api/social/_bridge_common.php'
    : dirname(__DIR__, 3) . '/api/social/_bridge_common.php';

if (
    $g5_nextjs_social_theme_path !== '' &&
    is_file($g5_nextjs_social_theme_path . '/route.php') &&
    is_file($g5_nextjs_social_bridge)
) {
    include_once $g5_nextjs_social_bridge;
}

unset($g5_nextjs_social_theme, $g5_nextjs_social_theme_path, $g5_nextjs_social_bridge);
