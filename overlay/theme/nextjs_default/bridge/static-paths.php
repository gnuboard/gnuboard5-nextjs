<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function nextjs_default_static_app_path($path = '')
{
    $base = rtrim(G5_THEME_PATH, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'app';
    $path = ltrim((string) $path, '/\\');

    return $path === '' ? $base : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path);
}

function nextjs_default_static_app_ready()
{
    return is_file(nextjs_default_static_app_path('index.html'));
}

function nextjs_default_static_app_url($path = '')
{
    $path = ltrim((string) $path, '/');

    return nextjs_default_theme_url() . '/app' . ($path !== '' ? '/' . $path : '');
}
