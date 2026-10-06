<?php
/**
 * 보안 메일(비밀번호 재설정 · 메일 인증)을 보내기 위한 도움 함수 — 다른 API 파일에 기대지 않는다.
 * API(helpers.php)와 설치 점검 페이지(nextjs-install/check.php)가 같은 판단을 쓰도록 따로 둔다.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('api_require_mailer')) {
    /**
     * 그누보드 mailer() 를 쓸 수 있게 한다. 원본은 lib/mailer.lib.php 를 메일 보내는 화면에서만 따로 읽으므로
     * API 도 보내기 직전에 읽어야 한다(읽지 않으면 mailer() 가 없어 메일이 조용히 안 나간다).
     */
    function api_require_mailer(): bool
    {
        if (!function_exists('mailer') && defined('G5_LIB_PATH') && is_file(G5_LIB_PATH . '/mailer.lib.php')) {
            include_once G5_LIB_PATH . '/mailer.lib.php';
        }
        return function_exists('mailer');
    }
}

if (!function_exists('api_mail_link_base')) {
    /**
     * 보안 메일(비밀번호 재설정 · 메일 인증) 링크의 기준 주소. 없으면 '' — 그때는 메일을 보내지 않는다.
     * G5_DOMAIN 이 비면 그누보드는 G5_URL 을 요청의 Host 헤더로 만들므로, 그 주소를 쓰면 누가 Host 를 바꿔
     * 요청해 진짜 사이트 메일에 자기 서버 링크(토큰 포함)를 실어 보낼 수 있다. 원본 5.6.41 도 같은 이유로
     * G5_DOMAIN 없이는 이런 메일을 보내지 않는다(g5_security_mail_base_url).
     *   1) 설정으로 정한 웹 화면 주소(G5_WEBAPP_APP_URL 등 — env · extend 에서만 온다)
     *   2) 검증된 G5_DOMAIN (5.6.41+ 는 원본 함수로, 이전 버전은 같은 규칙으로)
     */
    function api_mail_link_base(): string
    {
        foreach (array('G5_WEBAPP_APP_URL', 'G5_WEBAPP_G5_URL', 'G5_NEXTJS25_APP_URL', 'G5_NEXTJS25_G5_URL') as $name) {
            $url = defined($name) ? trim((string) constant($name)) : '';
            if ($url !== '' && preg_match('#^https?://[^/\s?\#@]+#i', $url)) {
                return rtrim($url, '/');
            }
        }
        if (function_exists('g5_security_mail_base_url')) {
            $base = g5_security_mail_base_url();
            return $base === false ? '' : rtrim((string) $base, '/');
        }
        $domain = defined('G5_DOMAIN') ? trim((string) G5_DOMAIN) : '';
        $parts = $domain !== '' ? @parse_url($domain) : false;
        if (!$parts || empty($parts['host']) || !in_array(strtolower((string) ($parts['scheme'] ?? '')), array('http', 'https'), true)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\<>"\']/', $domain)) {
            return '';
        }
        return rtrim($domain, '/');
    }
}
