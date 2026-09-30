<?php
/**
 * /app/* — 앱 열기 랜딩.
 *
 * 카카오톡·문자·웹에 붙는 링크는 https 주소여야 한다(커스텀 스킴은 못 붙는 곳이 많다).
 * 그 주소를 받아 기기에 맞게 앱으로 넘긴다:
 *   Android : intent://<path>#Intent;scheme=dday-app;package=…;S.browser_fallback_url=<플레이스토어>;end
 *             (카카오톡 웹뷰도 intent:// 는 처리. 앱이 없으면 스토어)
 *   iOS     : dday-app://<path> 를 시도하고 안 열리면 App Store(정해져 있으면) 아니면 웹 글
 *   그 외    : 해당 웹 페이지로 302
 *
 * 경로 규칙은 앱 linkingConfig 와 같다:
 *   /app/post/<board>/<wr_id>   /app/dday/<id>   /app/board/<board>
 *
 * 매 요청 extend 단계(common.php)에서 g5_webapp_app_link_maybe_serve() 가 본다. nginx 의
 * try_files → /index.php 든 Apache 의 .htaccess → route.php 든 PHP 에 닿기만 하면 된다.
 * 사이트별 값은 extend/ 아무 파일에서 define 으로 바꾼다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!defined('G5_APP_LINK_SCHEME'))          define('G5_APP_LINK_SCHEME', 'dday-app');
if (!defined('G5_APP_LINK_ANDROID_PACKAGE')) define('G5_APP_LINK_ANDROID_PACKAGE', '');
if (!defined('G5_APP_LINK_ANDROID_STORE'))   define('G5_APP_LINK_ANDROID_STORE', 'https://play.google.com/store/apps/details?id=' . G5_APP_LINK_ANDROID_PACKAGE);
if (!defined('G5_APP_LINK_IOS_STORE'))       define('G5_APP_LINK_IOS_STORE', ''); // 출시 후 App Store 주소
if (!defined('G5_APP_LINK_APP_NAME'))        define('G5_APP_LINK_APP_NAME', '디데이');

if (!function_exists('g5_webapp_app_link_parse')) {
    /**
     * 요청 경로에서 앱 경로를 뽑는다. 아니면 null.
     * @return array{kind:string, path:string, board:string, id:int}|null
     */
    function g5_webapp_app_link_parse($requestPath)
    {
        $path = (string) parse_url((string) $requestPath, PHP_URL_PATH);
        $base = defined('G5_URL') ? rtrim((string) parse_url(G5_URL, PHP_URL_PATH), '/') : '';
        if ($base !== '' && strpos($path, $base . '/') === 0) {
            $path = substr($path, strlen($base));
        }
        if (preg_match('#^/app/post/([a-z0-9_]{1,20})/([0-9]{1,10})/?$#i', $path, $m)) {
            return array('kind' => 'post', 'path' => 'post/' . strtolower($m[1]) . '/' . (int) $m[2], 'board' => strtolower($m[1]), 'id' => (int) $m[2]);
        }
        if (preg_match('#^/app/dday/([0-9]{1,10})/?$#', $path, $m)) {
            return array('kind' => 'dday', 'path' => 'dday/' . (int) $m[1], 'board' => '', 'id' => (int) $m[1]);
        }
        if (preg_match('#^/app/board/([a-z0-9_]{1,20})/?$#i', $path, $m)) {
            return array('kind' => 'board', 'path' => 'board/' . strtolower($m[1]), 'board' => strtolower($m[1]), 'id' => 0);
        }
        return null;
    }
}

if (!function_exists('g5_webapp_app_link_web_url')) {
    /** 앱이 없을 때 보여 줄 웹 주소. Next.js 테마면 짧은 주소, 아니면 그누보드 bbs 주소. */
    function g5_webapp_app_link_web_url(array $link)
    {
        $short = function_exists('g5_nextjs_rewrite_enabled') && g5_nextjs_rewrite_enabled();
        switch ($link['kind']) {
            case 'post':
                return $short
                    ? G5_URL . '/' . $link['board'] . '/' . $link['id']
                    : G5_BBS_URL . '/board.php?bo_table=' . $link['board'] . '&wr_id=' . $link['id'];
            case 'board':
                return $short ? G5_URL . '/' . $link['board'] : G5_BBS_URL . '/board.php?bo_table=' . $link['board'];
            default:
                return G5_URL . '/'; // 디데이는 웹 화면이 없다
        }
    }
}

if (!function_exists('g5_webapp_app_link_device')) {
    /** @return string android|ios|other */
    function g5_webapp_app_link_device()
    {
        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
        if (stripos($ua, 'android') !== false) return 'android';
        if (preg_match('/iPhone|iPad|iPod/i', $ua)) return 'ios';
        return 'other';
    }
}

if (!function_exists('g5_webapp_app_link_intent_url')) {
    function g5_webapp_app_link_intent_url($appPath)
    {
        return 'intent://' . $appPath . '#Intent;scheme=' . G5_APP_LINK_SCHEME
            . ';package=' . G5_APP_LINK_ANDROID_PACKAGE
            . ';S.browser_fallback_url=' . rawurlencode(G5_APP_LINK_ANDROID_STORE) . ';end';
    }
}

if (!function_exists('g5_webapp_app_link_maybe_serve')) {
    /** /app/* 요청이면 랜딩을 내고 요청을 끝낸다. 아니면 아무 것도 하지 않는다. */
    function g5_webapp_app_link_maybe_serve()
    {
        if (!isset($_SERVER['REQUEST_URI']) || strpos((string) $_SERVER['REQUEST_URI'], '/app/') === false) {
            return;
        }
        $link = g5_webapp_app_link_parse($_SERVER['REQUEST_URI']);
        if ($link === null) {
            // /app/post/… 꼴이긴 한데 값이 틀린 것은 여기서 404 로 끝낸다 (테마 화면으로 새지 않게).
            if (preg_match('#/app/(post|dday|board)/#', (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
                http_response_code(404);
                header('Content-Type: text/plain; charset=utf-8');
                exit('Not found.');
            }
            return;
        }

        $webUrl = g5_webapp_app_link_web_url($link);
        $device = g5_webapp_app_link_device();
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex');

        if ($device === 'other' || G5_APP_LINK_ANDROID_PACKAGE === '') { // 앱을 설정하지 않은 설치본은 웹으로
            header('Location: ' . $webUrl, true, 302);
            exit;
        }

        $schemeUrl = G5_APP_LINK_SCHEME . '://' . $link['path'];
        $intentUrl = g5_webapp_app_link_intent_url($link['path']);
        $iosFallback = G5_APP_LINK_IOS_STORE !== '' ? G5_APP_LINK_IOS_STORE : $webUrl;
        $primary = $device === 'android' ? $intentUrl : $schemeUrl;
        $fallback = $device === 'android' ? G5_APP_LINK_ANDROID_STORE : $iosFallback;
        $h = static function ($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); };
        $j = static function ($v) { return json_encode((string) $v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); };

        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<meta name="robots" content="noindex"><title>' . $h(G5_APP_LINK_APP_NAME) . ' 앱에서 열기</title>'
            . '<style>body{margin:0;font:16px/1.5 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1f2937;background:#f8fafc}'
            . 'main{max-width:420px;margin:18vh auto 0;padding:0 24px;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#6b7280;margin:0 0 1.5rem}'
            . 'a.b{display:block;margin:.5rem 0;padding:.9rem 1rem;border-radius:12px;text-decoration:none;font-weight:600}'
            . 'a.p{background:#3b82f6;color:#fff}a.s{background:#fff;color:#374151;border:1px solid #d1d5db}</style></head><body><main>'
            . '<h1>' . $h(G5_APP_LINK_APP_NAME) . ' 앱에서 여는 중…</h1>'
            . '<p>앱이 열리지 않으면 아래 버튼을 눌러 주세요.</p>'
            . '<a class="b p" href="' . $h($primary) . '">앱에서 열기</a>'
            . ($device === 'ios' && G5_APP_LINK_IOS_STORE !== '' ? '<a class="b s" href="' . $h(G5_APP_LINK_IOS_STORE) . '">App Store 에서 받기</a>' : '')
            . ($device === 'android' ? '<a class="b s" href="' . $h(G5_APP_LINK_ANDROID_STORE) . '">Play 스토어에서 받기</a>' : '')
            . '<a class="b s" href="' . $h($webUrl) . '">웹에서 보기</a>'
            . '</main><script>(function(){var p=' . $j($primary) . ',f=' . $j($fallback) . ',t=Date.now();'
            // 앱이 열리면 페이지가 숨겨지므로 타이머가 돌아온 뒤 여전히 보이는 경우에만 fallback 으로 간다.
            . 'try{location.replace(p)}catch(e){}'
            . 'setTimeout(function(){if(document.visibilityState!=="hidden"&&Date.now()-t<2600){location.replace(f)}},1800);})();</script>'
            . '</body></html>';
        exit;
    }
}
