<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

// 공용 브리지 함수는 plugin/webapp/bridge/ 에 있다. 옛 배치(plugin/nextjs, 루트 파일)만
// 남은 설치본도 한동안 살려 둔다.
if (is_file(dirname(__DIR__, 3) . '/plugin/webapp/bridge/common.php')) {
    require_once dirname(__DIR__, 3) . '/plugin/webapp/bridge/common.php';
} else {
    // 옛 배치(루트 nextjs-theme-common.php)만 남은 설치본도 한동안 살려 둔다.
    require_once dirname(__DIR__, 3) . '/nextjs-theme-common.php';
}

if (!function_exists('nextjs_default_trim_url')) {
    function nextjs_default_trim_url($url)
    {
        return rtrim((string) $url, '/');
    }
}

if (!function_exists('nextjs_default_bridge_host_allowed')) {
    function nextjs_default_bridge_host_allowed($url)
    {
        // 허용 목록을 두지 않은 설치본은 그누보드 자신의 G5_URL 을 믿는다. 예전에는 무조건
        // 거부해서 사이트 주소가 빈 문자열이 되고, 하위 폴더 설치에서 청크·API 주소의 폴더가
        // 빠졌다. 목록을 정의하면 그때부터 목록에 있는 호스트만 허용한다.
        if (!defined('G5_NEXTJS_DEFAULT_ALLOWED_HOSTS')) {
            return true;
        }

        $host = preg_match('#^https?://#i', (string) $url)
            ? parse_url((string) $url, PHP_URL_HOST)
            : (string) $url;
        $host = strtolower(trim((string) $host));
        $host = preg_replace('/:\d+$/', '', $host);
        $host = trim($host, '[]');
        if ($host === '') {
            return false;
        }

        foreach (explode(',', (string) G5_NEXTJS_DEFAULT_ALLOWED_HOSTS) as $allowed) {
            $allowed = strtolower(trim($allowed));
            $allowed = preg_match('#^https?://#i', $allowed) ? parse_url($allowed, PHP_URL_HOST) : $allowed;
            $allowed = strtolower(trim((string) $allowed));
            $allowed = preg_replace('/:\d+$/', '', $allowed);
            $allowed = trim($allowed, '[]');
            if ($allowed !== '' && $host === $allowed) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('nextjs_default_g5_url')) {
    function nextjs_default_g5_url()
    {
        if (defined('G5_NEXTJS_DEFAULT_G5_URL') && G5_NEXTJS_DEFAULT_G5_URL) {
            return nextjs_default_trim_url(G5_NEXTJS_DEFAULT_G5_URL);
        }

        if (defined('G5_URL') && G5_URL && nextjs_default_bridge_host_allowed(G5_URL)) {
            return nextjs_default_trim_url(G5_URL);
        }

        return '';
    }
}

if (!function_exists('nextjs_default_theme_url')) {
    function nextjs_default_theme_url()
    {
        if (defined('G5_NEXTJS_DEFAULT_THEME_URL') && G5_NEXTJS_DEFAULT_THEME_URL) {
            return nextjs_default_trim_url(G5_NEXTJS_DEFAULT_THEME_URL);
        }

        return defined('G5_THEME_URL') ? nextjs_default_trim_url(G5_THEME_URL) : '';
    }
}

if (!function_exists('nextjs_default_api_url')) {
    function nextjs_default_api_url()
    {
        if (defined('G5_NEXTJS_DEFAULT_API_URL') && G5_NEXTJS_DEFAULT_API_URL) {
            return nextjs_default_trim_url(G5_NEXTJS_DEFAULT_API_URL);
        }

        return nextjs_default_g5_url() . '/api/v1';
    }
}

if (!function_exists('nextjs_default_current_path')) {
    function nextjs_default_current_path()
    {
        $request_uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '/';
        $path = parse_url($request_uri, PHP_URL_PATH);
        if (!$path) {
            return '/';
        }

        $base_path = parse_url(nextjs_default_g5_url(), PHP_URL_PATH);
        if ($base_path && $base_path !== '/') {
            $base_path = '/' . trim($base_path, '/');
            if ($path === $base_path) {
                return '/';
            }
            if (strpos($path, $base_path . '/') === 0) {
                $path = substr($path, strlen($base_path));
            }
        }

        return $path !== '' ? $path : '/';
    }
}
