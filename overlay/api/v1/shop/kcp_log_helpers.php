<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_kcp_log_dir')) {
    /**
     * KCP 라이브러리(pp_cli)가 거래 로그를 쓰는 폴더. 로그에는 가맹점 코드 · 가상계좌 번호 · 사업자번호가 평문으로 남는다.
     * 기본 위치(data/log/kcp)는 웹 루트 안이고 그누보드의 data/.htaccess 는 .php 같은 실행 파일만 막으므로, 폴더를 쓰기
     * 전에 data/log 에 모든 접근을 막는 .htaccess 를 둔다(이미 있으면 건드리지 않는다). SHOP_KCP_LOG_DIR 로 웹 밖을 줄 수도 있다.
     */
    function shop_api_kcp_log_dir(string $fallback): string
    {
        $configured = getenv('SHOP_KCP_LOG_DIR');
        if (is_string($configured) && $configured !== '') {
            $dir = $configured;
        } elseif (defined('G5_DATA_PATH')) {
            shop_api_deny_web_access(G5_DATA_PATH . '/log');
            $dir = G5_DATA_PATH . '/log/kcp';
        } else {
            $dir = $fallback;
        }
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }
}

if (!function_exists('shop_api_deny_web_access')) {
    /** 웹 루트 안 폴더에 모든 접근을 막는 .htaccess 를 둔다(Apache 2.2 · 2.4 모두). 이미 있으면 그대로 둔다. */
    function shop_api_deny_web_access(string $dir): void
    {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $file = $dir . '/.htaccess';
        if (is_file($file)) {
            return;
        }
        @file_put_contents(
            $file,
            "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n"
        );
    }
}
