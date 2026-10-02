<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 예전 쇼핑 처리 주소의 위조 요청(CSRF) 막기 — 그누보드 원본을 고치지 않고 extend 단계에서 거른다.
 *
 *   shop/cartupdate.php  장바구니 담기 · 바꾸기 · 지우기는 POST 로만. 원본 어디에서도 GET 으로 부르지 않는데,
 *                        GET 을 받아 두면 다른 사이트의 링크 · 이미지 한 장으로 방문자의 장바구니를 바꿀 수 있다.
 *   shop/wishupdate.php  찜 삭제(w=d)는 원본이 GET 링크로 만든다 — 그래서 방법이 아니라 출처를 본다.
 *                        요청의 Origin(없으면 Referer) 호스트가 이 사이트일 때만 받는다.
 *
 * 예전에는 원본 파일(shop/cartupdate.php · wishupdate.php …)을 직접 고쳐 막았다. 원본을 그대로 두면서
 * 같은 보호를 유지하려고 여기로 옮겼다(2026-10-02, 그누보드 5.6.41 업데이트). 5.6.30 · 5.6.41 모두 같은 주소다.
 */

if (!function_exists('g5_webapp_legacy_shop_guard')) {
    function g5_webapp_legacy_shop_guard(): void
    {
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        if (!preg_match('~/shop/(cartupdate|wishupdate)\.php$~', $script, $match)) {
            return;
        }
        $back = defined('G5_SHOP_URL') ? G5_SHOP_URL : (defined('G5_URL') ? G5_URL : '/');

        if ($match[1] === 'cartupdate') {
            if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
                alert('올바른 방법으로 이용해 주십시오.', $back . '/cart.php');
            }
            return;
        }

        $source = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($source === '' || $source === 'null') {
            $source = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
        }
        $sourceHost = strtolower((string) parse_url($source, PHP_URL_HOST));
        $selfHost = strtolower((string) parse_url('http://' . (string) ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
        if ($sourceHost === '' || $selfHost === '' || $sourceHost !== $selfHost) {
            alert('올바른 경로로 접근해 주십시오.', $back);
        }
    }
}

g5_webapp_legacy_shop_guard();
