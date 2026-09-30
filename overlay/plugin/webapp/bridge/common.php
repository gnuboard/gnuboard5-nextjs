<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('g5_nextjs_runtime_active_theme')) {
    function g5_nextjs_runtime_active_theme()
    {
        $theme = isset($GLOBALS['config']['cf_theme']) ? trim((string) $GLOBALS['config']['cf_theme']) : '';
        if ($theme === '' && defined('G5_THEME_PATH')) {
            $theme = basename(G5_THEME_PATH);
        }

        // 밑줄도 받는다(theme/nextjs_default). 그누보드 테마 폴더 이름으로 흔하고, 경로 · 상수 접두어로 써도 안전하다.
        return preg_match('/^[a-z][a-z0-9_-]{1,31}$/', $theme) ? $theme : '';
    }
}

if (!function_exists('g5_nextjs_redirect_legacy_admin_request')) {
    function g5_nextjs_redirect_legacy_admin_request()
    {
        $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
        if ($method !== 'GET' && $method !== 'HEAD') {
            return false;
        }

        $request_uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
        $path = parse_url($request_uri, PHP_URL_PATH);
        $path = '/' . trim((string) $path, '/');
        if ($path !== '/admin' && strpos($path, '/admin/') !== 0) {
            return false;
        }

        $g5_url = defined('G5_URL') ? rtrim((string) G5_URL, '/') : '';
        $target = ($g5_url !== '' ? $g5_url : '') . '/adm';
        header('Location: ' . $target, true, 302);
        exit;
    }
}

if (!function_exists('g5_nextjs_runtime_theme_path')) {
    function g5_nextjs_runtime_theme_path($theme)
    {
        if ($theme === '') {
            return '';
        }

        $path = dirname(__DIR__, 3) . '/theme/' . $theme;
        return is_dir($path) ? $path : '';
    }
}

if (!function_exists('g5_nextjs_runtime_theme_prefix')) {
    function g5_nextjs_runtime_theme_prefix($theme)
    {
        return 'G5_' . strtoupper(preg_replace('/[^A-Za-z0-9]+/', '_', $theme));
    }
}

if (!function_exists('g5_nextjs_theme_route_path')) {
    function g5_nextjs_theme_route_path($theme)
    {
        $theme_path = g5_nextjs_runtime_theme_path($theme);
        if ($theme_path === '') {
            return '';
        }

        $route = $theme_path . '/route.php';
        return is_file($route) ? $route : '';
    }
}

if (!function_exists('g5_nextjs_runtime_normalize_ip')) {
    function g5_nextjs_runtime_normalize_ip($ip)
    {
        $ip = trim((string) $ip);
        if ($ip === '') {
            return '';
        }

        if ($ip[0] === '[' && substr($ip, -1) === ']') {
            return trim($ip, '[]');
        }

        return $ip;
    }
}

if (!function_exists('g5_nextjs_runtime_trusted_proxy_values')) {
    function g5_nextjs_runtime_trusted_proxy_values()
    {
        $values = array('127.0.0.1', '::1');
        $configured = '';

        if (defined('G5_TRUSTED_PROXY_REMOTE_ADDRS')) {
            $configured = (string) G5_TRUSTED_PROXY_REMOTE_ADDRS;
        } else {
            $env = getenv('G5_TRUSTED_PROXY_REMOTE_ADDRS');
            if (is_string($env)) {
                $configured = $env;
            }
        }

        foreach (explode(',', $configured) as $value) {
            $value = g5_nextjs_runtime_normalize_ip($value);
            if ($value !== '') {
                $values[] = $value;
            }
        }

        return array_values(array_unique($values));
    }
}

if (!function_exists('g5_nextjs_runtime_is_trusted_proxy_request')) {
    function g5_nextjs_runtime_is_trusted_proxy_request()
    {
        $remote_addr = isset($_SERVER['REMOTE_ADDR'])
            ? g5_nextjs_runtime_normalize_ip($_SERVER['REMOTE_ADDR'])
            : '';

        if ($remote_addr === '') {
            return false;
        }

        return in_array($remote_addr, g5_nextjs_runtime_trusted_proxy_values(), true);
    }
}

if (!function_exists('g5_nextjs_runtime_forwarded_proto')) {
    function g5_nextjs_runtime_forwarded_proto()
    {
        if (!g5_nextjs_runtime_is_trusted_proxy_request()) {
            return '';
        }

        $value = isset($_SERVER['HTTP_X_FORWARDED_PROTO'])
            ? strtolower(trim((string) $_SERVER['HTTP_X_FORWARDED_PROTO']))
            : '';
        $value = trim(explode(',', $value)[0]);

        return $value === 'https' || $value === 'http' ? $value : '';
    }
}

if (!function_exists('g5_nextjs_relocate_portable_build')) {
    /**
     * 휴대용 정적 빌드의 자리표시자.
     *
     * 테마 앱은 설치 폴더를 모르는 채로 한 번만 빌드된다. Next 가 basePath 로 이 값을 박아
     * 두면 링크·라우터·청크 경로가 모두 같은 접두사를 갖고, 응답을 내보내기 직전에 여기서
     * 실제 설치 경로로 바꾼다. nextjs/next.config.ts 와 nextjs/scripts/build-next.mjs 의
     * 문자열과 같아야 한다.
     */
    function g5_nextjs_portable_base_placeholder()
    {
        return '/__g5base__';
    }

    function g5_nextjs_portable_site_placeholder()
    {
        return 'https://__g5host__/__g5base__';
    }

    /** 자리표시자 빌드로 만들어진 글인가. 예전 빌드는 예전 치환 방식을 그대로 탄다. */
    function g5_nextjs_is_portable_build_text($text)
    {
        return is_string($text) && strpos($text, '__g5base__') !== false;
    }

    /**
     * 자리표시자를 이 설치본의 주소로 바꾼다.
     *
     * @param string $text     HTML, RSC 페이로드, JS, CSS 같은 글 응답
     * @param string $site_url 이 설치본의 주소. G5_URL 과 같은 꼴 (https://host/gnu5512)
     * @return string
     */
    /**
     * flight(RSC) 텍스트를 치환한다. `id:T<hex 바이트수>,` 로 시작하는 T 행은 길이가 박힌
     * 긴 문자열(글 본문 등)이라 한 글자라도 바꾸면 이어지는 스트림 전체가 어긋나
     * 브라우저가 "Connection closed" 로 멈춘다. 그 안은 내용이므로 그대로 두고, 행 밖의
     * 경로·주소만 바꾼다.
     */
    function g5_nextjs_relocate_flight_text($text, $replace)
    {
        $out = '';
        $pos = 0;
        $len = strlen($text);
        while ($pos < $len && preg_match('/(?:^|\n)([0-9a-f]+):T([0-9a-f]+),/', $text, $m, PREG_OFFSET_CAPTURE, $pos)) {
            $head_start = $m[0][1];
            $head_end = $head_start + strlen($m[0][0]);
            $bytes = hexdec($m[2][0]);
            $out .= $replace(substr($text, $pos, $head_start - $pos)) . $m[0][0] . substr($text, $head_end, $bytes);
            $pos = $head_end + $bytes;
        }

        return $out . $replace(substr($text, $pos));
    }

    /**
     * 자리표시자를 이 설치본의 주소로 바꾼다.
     *
     * @param string $text     HTML, RSC 페이로드, JS, CSS 같은 글 응답
     * @param string $site_url 이 설치본의 주소. G5_URL 과 같은 꼴 (https://host/gnu5512)
     * @return string
     */
    function g5_nextjs_relocate_portable_build($text, $site_url)
    {
        if (!g5_nextjs_is_portable_build_text($text)) {
            return $text;
        }

        $site_url = rtrim((string) $site_url, '/');
        $base = $site_url !== '' ? (string) parse_url($site_url, PHP_URL_PATH) : '';
        $base = ($base !== '' && $base !== '/') ? '/' . trim($base, '/') : '';
        $origin = $site_url !== '' ? substr($site_url, 0, strlen($site_url) - strlen($base)) : '';

        // 긴 것부터: 사이트 주소 전체 → 호스트만 → 경로만. 루트 설치는 경로가 빈 문자열이 되어
        // "/__g5base__/free" 는 "/free", 라우터의 basePath "/__g5base__" 는 "" 가 된다.
        $replace = function ($chunk) use ($site_url, $origin, $base) {
            $chunk = str_replace(g5_nextjs_portable_site_placeholder(), $site_url, $chunk);
            $chunk = str_replace('https://__g5host__', $origin, $chunk);
            $chunk = str_replace('%2F__g5base__', str_replace('/', '%2F', $base), $chunk);
            // 홈 링크는 HTML 에 href="/__g5base__" 로 박힌다(basePath 뒤 "/" 를 Next 가 뗀다). 루트 설치에서
            // 그대로 비우면 href="" 가 되어 "지금 페이지" 링크가 된다 — 속성값 전체가 자리표시자인 것만 "/" 로.
            // 라우터 설정("basePath":"/__g5base__")은 = 로 시작하지 않으므로 아래에서 "" 가 된다.
            if ($base === '') {
                $chunk = str_replace('="' . g5_nextjs_portable_base_placeholder() . '"', '="/"', $chunk);
            }

            return str_replace(g5_nextjs_portable_base_placeholder(), $base, $chunk);
        };

        // .txt 페이로드는 문서 전체가 flight 텍스트다.
        if (strpos($text, '<script') === false && preg_match('/^[0-9a-f]+:/', $text)) {
            return g5_nextjs_relocate_flight_text($text, $replace);
        }

        // Next 는 인라인 RSC 스트림을 여러 <script>self.__next_f.push([1,"…"]) 조각으로 임의
        // 위치에서 끊는다. 자리표시자가 두 조각에 걸치면(예: "/__g5ba" + "se__/_next/…") 어떤
        // 문자열 치환도 찾지 못하고, 브라우저가 조각을 이어 붙이는 순간 되살아난다. 인접한
        // 조각의 경계를 지우면 하나의 push 가 되고, 이는 브라우저에 같은 스트림이다.
        $text = str_replace('"])</script><script>self.__next_f.push([1,"', '', $text);

        // 인라인 push 의 JS 문자열은 JSON 으로 풀어 T 행을 피해 치환한 뒤 다시 감싼다.
        // 정규식은 쓰지 않는다: 100KB 가 넘는 문자열에 걸면 웹 PHP 의 backtrack 한도를 넘겨
        // NULL 이 돌아오고 화면이 통째로 비어 버린다. 문자열 안에는 raw '<' 가 없으므로
        // (Next 가 < 로 이스케이프) '])</script>' 가 곧 끝이다.
        $open = '<script>self.__next_f.push([1,';
        $close = '])</script>';
        $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP;
        $out = '';
        $pos = 0;
        while (($start = strpos($text, $open, $pos)) !== false) {
            $json_start = $start + strlen($open);
            $end = strpos($text, $close, $json_start);
            if ($end === false) {
                break;
            }
            $whole = substr($text, $start, $end + strlen($close) - $start);
            $decoded = json_decode(substr($text, $json_start, $end - $json_start), true);
            $encoded = is_string($decoded)
                ? json_encode(g5_nextjs_relocate_flight_text($decoded, $replace), $flags)
                : false;

            $out .= $replace(substr($text, $pos, $start - $pos));
            $out .= is_string($encoded) ? $open . $encoded . $close : $whole;
            $pos = $end + strlen($close);
        }

        return $out . $replace(substr($text, $pos));
    }
}

/* ----------------------------------------------------------------------------
 * 관리자 「짧은 주소 설정」의 Apache/Nginx 설정 코드.
 *
 * lib/uri.lib.php 의 get_mod_rewrite_rules() / get_nginx_conf_rules() 는
 * add_mod_rewrite_(pre_)rules · add_nginx_conf_(pre_)rules 훅으로 줄을 보탤 수
 * 있다. Next.js 테마가 켜져 있으면(plugin/webapp/bridge/runtime.php) 여기 규칙이
 * 그 훅에 걸려, 관리자가 보는 코드와 update_rewrite_rules() 가 .htaccess 에 써 주는
 * 코드에 테마 브리지 규칙이 함께 들어간다. theme/<이름>/apache-rewrite.example.conf
 * 와 같은 내용이되, 대상은 plugin/webapp/bridge/route.php 다 — 그 파일이
 * cf_theme 을 읽어 theme/<활성>/route.php 로 넘기므로 테마를 바꿔도 이 규칙은
 * 그대로다.
 *
 * "pre" 는 그누보드가 "실제 파일·폴더면 그대로 둔다"(-f/-d, !-e) 조건을 넣기
 * 전에 와야 하는 것들이다. /mobile, /shop 은 실제 폴더이고 shop/list.php 같은
 * 것은 실제 파일이라, 그 조건 뒤에 두면 브리지가 손댈 기회가 없다.
 * -------------------------------------------------------------------------- */

if (!function_exists('g5_nextjs_rewrite_front_controller')) {
    function g5_nextjs_rewrite_front_controller()
    {
        return 'plugin/webapp/bridge/route.php';
    }
}

if (!function_exists('g5_nextjs_rewrite_theme_has_bridge')) {
    /** 그 테마가 Next.js 브리지(theme/<이름>/route.php)를 갖고 있나. */
    function g5_nextjs_rewrite_theme_has_bridge($theme)
    {
        $theme = trim((string) $theme);
        if ($theme === '' || !preg_match('/^[0-9A-Za-z_\-]+$/', $theme)) {
            return false;
        }
        $base = defined('G5_PATH') ? G5_PATH : dirname(__DIR__, 3);

        return is_file($base . '/theme/' . $theme . '/route.php');
    }
}

if (!function_exists('g5_nextjs_rewrite_target_theme')) {
    /**
     * 규칙을 만들 기준 테마. 보통은 활성 테마(cf_theme)지만, 테마를 바꾸는 순간에는
     * 아직 DB 만 바뀌고 $config 는 옛 값이라 새 테마를 따로 알려 준다.
     */
    function g5_nextjs_rewrite_target_theme()
    {
        if (isset($GLOBALS['g5_nextjs_rewrite_theme_override'])) {
            return (string) $GLOBALS['g5_nextjs_rewrite_theme_override'];
        }
        if (isset($GLOBALS['config']['cf_theme'])) {
            return (string) $GLOBALS['config']['cf_theme'];
        }

        return '';
    }
}

if (!function_exists('g5_nextjs_rewrite_enabled')) {
    /** 기준 테마가 Next.js 테마일 때만 규칙을 보탠다. 아니면 그누보드 원래 코드 그대로다. */
    function g5_nextjs_rewrite_enabled()
    {
        return g5_nextjs_rewrite_theme_has_bridge(g5_nextjs_rewrite_target_theme());
    }
}

if (!function_exists('g5_nextjs_rewrite_pre_patterns')) {
    /** 파일·폴더 통과 조건보다 앞에 서야 하는 경로 패턴(앞의 ^ 와 뒤의 $ 제외). */
    function g5_nextjs_rewrite_pre_patterns()
    {
        return array(
            'mobile/?',
            'mobile/index\.php',
            'mobile/(content|group)\.php',
            'bbs/(login|register|register_form|register_result|password_lost|poll_result|qalist|qaview|qawrite|memo|memo_form|memo_view|profile|point|scrap|board|write|content|group|faq|new|search)\.php',
            'mobile/shop/?',
            'mobile/shop/(index|cart|wishlist|category|coupon|event|item|iteminfo|itemqa|itemqaform|itemrecommend|itemstocksms|itemuse|itemuseform|largeimage|list|listtype|mypage|orderaddress|orderform|orderinquiry|orderinquiryview|personalpay|personalpayform|personalpayresult|search)\.php',
            'shop/?',
            'shop/(index|cart|wishlist|couponzone|search|largeimage|mypage|orderinquiry|personalpay|category|event|item|iteminfo|list|listtype|orderform|orderinquirycancel|orderinquiryview|personalpayform|personalpayresult)\.php',
        );
    }
}

if (!function_exists('g5_nextjs_rewrite_patterns')) {
    /** 파일·폴더 통과 조건 뒤, 그누보드 기본 짧은 주소 규칙 앞에 서는 경로 패턴. */
    function g5_nextjs_rewrite_patterns()
    {
        return array(
            // 사이트 루트에 있어야 하는 공개 메타 파일. 브리지가 활성 테마 것을 낸다.
            '(robots\.txt|sitemap(?:-posts)?\.xml|manifest\.webmanifest|manifest\.json|sw\.js|favicon\.ico|icon-[0-9]+\.png|og-default\.png|kcp-bridge\.html)',
            // 클라이언트 이동 뒤 /_next/* 로 오는 청크와 글꼴.
            '_next/(.*)',
            // 정적 내보내기의 RSC 페이로드(/free.txt?_rsc=…).
            '(.+)\.txt',
            // RSS 는 PHP 가 만들지만 브리지를 거쳐 같은 검사를 받는다.
            'boards/([0-9a-zA-Z_]+)/rss',
            // 앱 열기 랜딩(plugin/webapp/bridge/app-link.php). nginx 는 try_files 로 PHP 에 닿지만 Apache 는 이 줄이 필요하다.
            'app/(post|dday|board)/(.*)',
            // PHP 진입 파일이 없는 Next 경로.
            '(admin|boards|content|members|mypage)(/.*)?',
            '(faq|forgot-password|login|offline|polls|recent|register|search)',
            'register(/.*)?',
            'login/social-callback',
            'shop/(cart|categories|compare|content|couponzone|events|largeimage|login|order|orders|payment|personalpay|products|qas|register|reviews|search|wishlist)(/.*)?',
            // 그누보드·영카트 짧은 주소도 앱 셸로 바로 들어간다.
            'shop/list-([0-9a-z]+)',
            'shop/type-([0-9a-z]+)',
            'shop/([0-9a-zA-Z_\-]+)',
            'shop/([^/]+)/',
            '([0-9a-zA-Z_]+)',
            '([0-9a-zA-Z_]+)/([^/]+)/',
            '([0-9a-zA-Z_]+)/write',
            '([0-9a-zA-Z_]+)/([0-9]+)',
            // 제목 주소(cf_bbs_rewrite=2)는 링크에 끝 슬래시가 없다. 슬래시 있는 형태만
            // 받으면 글을 눌렀을 때 404 다. 브리지는 두 형태를 모두 푼다.
            '(?!admin/|adm/|api/|bbs/|content/|css/|data/|img/|install/|js/|lib/|members/|mobile/|plugin/|rss/|shop/|theme/)([0-9a-zA-Z_]+)/([^/]+)',
        );
    }
}

if (!function_exists('g5_nextjs_add_mod_rewrite_pre_rules')) {
    /** add_mod_rewrite_pre_rules 훅. 우리 줄을 앞에 붙여 돌려준다. */
    function g5_nextjs_add_mod_rewrite_pre_rules($rules, $get_path_url, $base_path, $return_string = false)
    {
        if (!g5_nextjs_rewrite_enabled()) {
            return $rules;
        }
        $front = g5_nextjs_rewrite_front_controller();
        $lines = array();
        $lines[] = '# Next.js theme bridge (active theme: theme/<cf_theme>/route.php via ' . $front . ')';
        $lines[] = 'RewriteRule (^|/)\.env(\..*)?$ - [F,L]';
        $lines[] = '# /mobile, /shop are real directories and the PHP entry files exist, so these';
        $lines[] = '# must run before the file/directory passthrough below.';
        foreach (g5_nextjs_rewrite_pre_patterns() as $pattern) {
            $lines[] = 'RewriteRule ^' . $pattern . '$ ' . $front . ' [QSA,L]';
        }

        return implode("\n", $lines) . "\n" . (string) $rules;
    }
}

if (!function_exists('g5_nextjs_add_mod_rewrite_rules')) {
    /** add_mod_rewrite_rules 훅. 영카트(shop.extend)보다 뒤(priority 20)에 돌아 그 줄들 앞에 선다. */
    function g5_nextjs_add_mod_rewrite_rules($rules, $get_path_url, $base_path, $return_string = false)
    {
        if (!g5_nextjs_rewrite_enabled()) {
            return $rules;
        }
        $front = g5_nextjs_rewrite_front_controller();
        $lines = array();
        $lines[] = '# Next.js theme bridge routes. They must come before the Gnuboard/YoungCart';
        $lines[] = '# short-url rules below, which stay as a fallback for other themes.';
        foreach (g5_nextjs_rewrite_patterns() as $pattern) {
            $lines[] = 'RewriteRule ^' . $pattern . '$ ' . $front . ' [QSA,L]';
        }

        return implode("\n", $lines) . "\n" . (string) $rules;
    }
}

if (!function_exists('g5_nextjs_add_nginx_conf_pre_rules')) {
    /** add_nginx_conf_pre_rules 훅 — if (!-e $request_filename) 바깥. */
    function g5_nextjs_add_nginx_conf_pre_rules($rules, $get_path_url, $base_path, $return_string = false)
    {
        if (!g5_nextjs_rewrite_enabled()) {
            return $rules;
        }
        $front = $base_path . g5_nextjs_rewrite_front_controller();
        $lines = array();
        $lines[] = '# Next.js theme bridge (active theme: theme/<cf_theme>/route.php via ' . $front . ')';
        $lines[] = 'location ~ (^|/)\.env(\..*)?$ { return 403; }';
        $lines[] = '# /mobile, /shop are real directories and the PHP entry files exist, so these';
        $lines[] = '# must run outside the !-e block below.';
        foreach (g5_nextjs_rewrite_pre_patterns() as $pattern) {
            $lines[] = 'rewrite ^' . $base_path . $pattern . '$ ' . $front . ' last;';
        }

        return implode("\n", $lines) . "\n" . (string) $rules;
    }
}

if (!function_exists('g5_nextjs_add_nginx_conf_rules')) {
    /** add_nginx_conf_rules 훅 — if (!-e $request_filename) 안. */
    function g5_nextjs_add_nginx_conf_rules($rules, $get_path_url, $base_path, $return_string = false)
    {
        if (!g5_nextjs_rewrite_enabled()) {
            return $rules;
        }
        $front = $base_path . g5_nextjs_rewrite_front_controller();
        $lines = array();
        $lines[] = '# Next.js theme bridge routes. Keep them before the Gnuboard/YoungCart rules.';
        foreach (g5_nextjs_rewrite_patterns() as $pattern) {
            $lines[] = 'rewrite ^' . $base_path . $pattern . '$ ' . $front . ' last;';
        }

        return implode("\n", $lines) . "\n" . (string) $rules;
    }
}

if (!function_exists('g5_nextjs_server_reads_htaccess')) {
    /** Apache 와 LiteSpeed 만 .htaccess 를 읽는다. Nginx 는 관리자 화면의 코드를 손으로 옮긴다. */
    function g5_nextjs_server_reads_htaccess()
    {
        $software = isset($_SERVER['SERVER_SOFTWARE']) ? (string) $_SERVER['SERVER_SOFTWARE'] : '';

        return stripos($software, 'apache') !== false || stripos($software, 'litespeed') !== false;
    }
}

if (!function_exists('g5_nextjs_sync_htaccess_rewrite_block')) {
    /**
     * .htaccess 의 그누보드 rewrite 블록(#### … rewrite BEGIN/END #####)을 $theme 기준으로
     * 다시 쓴다. 블록이 있으면 그 자리를 갈아 끼우고, 없으면 그누보드 update_rewrite_rules()
     * 처럼 끝에 붙인다. 블록 밖의 내용(보안 헤더, 사용자가 손으로 넣은 줄)은 건드리지 않는다.
     *
     * Next.js 테마로 바꾸면 브리지 규칙이 들어가고, 다른 테마로 바꾸면 브리지 규칙이
     * 빠진 그누보드 원래 블록으로 돌아간다 — 그래야 basic 테마에서 /free 가 board.php 로 간다.
     *
     * @return bool 파일을 썼으면 true. 서버가 .htaccess 를 안 읽거나 쓸 수 없으면 false.
     */
    function g5_nextjs_sync_htaccess_rewrite_block($theme)
    {
        if (!g5_nextjs_server_reads_htaccess() || !function_exists('get_mod_rewrite_rules')) {
            return false;
        }

        $path = (defined('G5_PATH') ? G5_PATH : dirname(__DIR__, 3)) . '/.htaccess';
        $exists = file_exists($path);
        if (($exists && !is_writable($path)) || (!$exists && !is_writable(dirname($path)))) {
            return false;
        }

        $GLOBALS['g5_nextjs_rewrite_theme_override'] = (string) $theme;
        $rules = get_mod_rewrite_rules();
        unset($GLOBALS['g5_nextjs_rewrite_theme_override']);

        $block = implode("\n", $rules);
        $bof = $rules[0];
        $eof = end($rules);

        $code = $exists ? (string) file_get_contents($path) : '';
        $start = strpos($code, $bof);
        $stop = $start === false ? false : strpos($code, $eof, $start);

        if ($start !== false && $stop !== false) {
            $next = substr($code, 0, $start) . $block . substr($code, $stop + strlen($eof));
        } else {
            $next = rtrim($code, "\r\n") . ($code === '' ? '' : "\n\n") . $block . "\n";
        }

        if ($next !== $code && !g5_nextjs_write_file_locked($path, $next)) {
            return false;
        }

        // /shop 은 실제 폴더라 mod_dir 이 rewrite 보다 먼저 /shop/ 로 301 을 보낸다. 앱의 정식
        // 주소는 슬래시 없는 /shop 이므로 그 폴더에서 DirectorySlash 를 끈다. 다른 테마로
        // 돌아가면 우리가 넣은 블록만 걷어 낸다.
        return g5_nextjs_sync_shop_directoryslash(g5_nextjs_rewrite_theme_has_bridge($theme));
    }
}

if (!function_exists('g5_nextjs_write_file_locked')) {
    function g5_nextjs_write_file_locked($path, $content)
    {
        $fp = fopen($path, 'cb');
        if (!$fp) {
            return false;
        }
        flock($fp, LOCK_EX);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $content);
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        return true;
    }
}

if (!function_exists('g5_nextjs_sync_shop_directoryslash')) {
    /**
     * shop/.htaccess 의 DirectorySlash 블록. $enable 이면 넣고, 아니면 우리 블록만 지운다.
     * 영카트가 없으면(shop 폴더 없음) 할 일이 없다.
     */
    function g5_nextjs_sync_shop_directoryslash($enable)
    {
        $dir = (defined('G5_PATH') ? G5_PATH : dirname(__DIR__, 3)) . '/shop';
        if (!is_dir($dir)) {
            return true;
        }
        $path = $dir . '/.htaccess';
        $bof = '#### Next.js theme DirectorySlash BEGIN ####';
        $eof = '#### Next.js theme DirectorySlash END ####';
        $block = $bof . "
"
            . "# /shop 을 슬래시 없이 열 때 Apache 가 /shop/ 로 보내지 않게 한다. 루트 .htaccess 의
"
            . "# 테마 브리지 규칙이 /shop 을 직접 받는다. 테마를 바꾸면 그누보드가 이 블록을 지운다.
"
            . "<IfModule mod_dir.c>
"
            . "DirectorySlash Off
"
            . "</IfModule>
"
            . $eof;

        $exists = file_exists($path);
        $code = $exists ? (string) file_get_contents($path) : '';
        $start = strpos($code, $bof);
        $stop = $start === false ? false : strpos($code, $eof, $start);
        $has = $start !== false && $stop !== false;

        if ($enable) {
            if ($has) {
                $next = substr($code, 0, $start) . $block . substr($code, $stop + strlen($eof));
            } else {
                $next = rtrim($code, "
") . ($code === '' ? '' : "

") . $block . "
";
            }
        } else {
            if (!$has) {
                return true;
            }
            $next = trim(substr($code, 0, $start) . substr($code, $stop + strlen($eof)));
            $next = $next === '' ? '' : $next . "
";
        }

        if ($next === $code) {
            return true;
        }
        if (!$enable && $next === '') {
            return !$exists || !is_writable($path) ? false : @unlink($path);
        }
        if (($exists && !is_writable($path)) || (!$exists && !is_writable($dir))) {
            return false;
        }

        return g5_nextjs_write_file_locked($path, $next);
    }
}

if (!function_exists('g5_nextjs_shop_skin_fallback')) {
    /**
     * 쇼핑몰 기본 스킨 한 칸을 검사해서, 고쳐야 하면 새 값을 돌려준다(아니면 빈 문자열).
     *
     * 값이 "theme/<스킨>" 이면 그누보드는 그것을 **현재 테마 안의** skin/shop/<스킨> 으로 읽는다
     * (shop.config.php 51행). Next.js 테마는 PHP 상점 스킨을 갖지 않으므로 그 폴더가 없고,
     * 관리자 분류 목록·분류 등록·쇼핑몰 설정 화면이 opendir() 실패로 죽는다
     * (lib/shop.lib.php 의 get_list_skin_options 가 readdir(false) 를 만난다).
     * 그럴 때 같은 이름의 루트 스킨(skin/shop/<스킨>, 모바일은 mobile/skin/shop/<스킨>)으로 되돌린다.
     *
     * @param string $value  DB 에 든 값
     * @param string $theme  지금 적용된 테마 이름
     * @param bool   $mobile 모바일 칸이면 true
     * @return string 고칠 값. 손댈 필요가 없으면 ''.
     */
    function g5_nextjs_shop_skin_fallback($value, $theme, $mobile = false)
    {
        $value = trim((string) $value);
        if (!preg_match('#^theme/(.+)$#', $value, $match)) {
            return ''; // 이미 루트 스킨을 가리킨다
        }

        $skin = trim($match[1]);
        // 폴더 이름으로 쓸 수 있는 글자만. 아니면 건드리지 않는다.
        if (!preg_match('#^[A-Za-z0-9._-]+$#', $skin) || !preg_match('#^[A-Za-z0-9._-]+$#', (string) $theme)) {
            return '';
        }

        $theme_root = G5_PATH . '/' . G5_THEME_DIR . '/' . $theme;
        $theme_skin = $mobile
            ? $theme_root . '/' . G5_MOBILE_DIR . '/' . G5_SKIN_DIR . '/shop/' . $skin
            : $theme_root . '/' . G5_SKIN_DIR . '/shop/' . $skin;
        if (is_dir($theme_skin)) {
            return ''; // 테마가 그 스킨을 정말 갖고 있다 — 그대로 둔다
        }

        // 루트 스킨. 같은 이름이 있으면 그것, 없으면 basic.
        $root_base = $mobile ? G5_MOBILE_PATH . '/' . G5_SKIN_DIR . '/shop' : G5_PATH . '/' . G5_SKIN_DIR . '/shop';
        if (is_dir($root_base . '/' . $skin)) {
            return $skin;
        }

        return is_dir($root_base . '/basic') ? 'basic' : '';
    }
}

if (!function_exists('g5_nextjs_sync_shop_skin_defaults')) {
    /**
     * g5_shop_default 의 de_shop_skin / de_shop_mobile_skin 두 칸만 손본다.
     * 분류(g5_shop_category)나 다른 설정은 절대 건드리지 않는다.
     * 영카트가 없는 설치본, 표가 없는 설치본에서는 조용히 넘어간다(관리자 화면에 아무것도 출력하지 않는다).
     *
     * @return bool 실제로 고쳤으면 true
     */
    function g5_nextjs_sync_shop_skin_defaults($theme)
    {
        global $g5;

        if (empty($g5['g5_shop_default_table']) || !function_exists('sql_fetch') || !function_exists('sql_query')) {
            return false;
        }

        $table = $g5['g5_shop_default_table'];
        $row = sql_fetch("SELECT de_shop_skin, de_shop_mobile_skin FROM `{$table}` LIMIT 1", false);
        if (!is_array($row) || !isset($row['de_shop_skin'])) {
            return false;
        }

        $updates = array();
        $pc = g5_nextjs_shop_skin_fallback($row['de_shop_skin'], $theme, false);
        if ($pc !== '') {
            $updates[] = "de_shop_skin = '" . addslashes($pc) . "'";
        }
        $mobile = g5_nextjs_shop_skin_fallback($row['de_shop_mobile_skin'], $theme, true);
        if ($mobile !== '') {
            $updates[] = "de_shop_mobile_skin = '" . addslashes($mobile) . "'";
        }

        if (!$updates) {
            return false;
        }

        sql_query("UPDATE `{$table}` SET " . implode(', ', $updates), false);

        return true;
    }
}

if (!function_exists('g5_nextjs_on_adm_theme_update')) {
    /**
     * adm/theme_update.php 의 run_event('adm_theme_update', $theme, …) 에 걸린다.
     * 테마는 이미 DB 에 적용된 뒤다. .htaccess 를 못 쓰면 그 사실을 화면에 알린다 —
     * theme_update.php 는 출력이 있으면 관리자 화면이 그것을 경고창으로 띄운다.
     */
    function g5_nextjs_on_adm_theme_update($theme, $set_default_skin = '')
    {
        // 상점 스킨 되돌리기가 먼저다 — 아래 .htaccess 검사에서 되돌아가는 서버(nginx 등)에서도
        // 이 정리는 되어야 관리자 쇼핑몰 화면이 산다.
        g5_nextjs_sync_shop_skin_defaults($theme);

        if (!g5_nextjs_server_reads_htaccess()) {
            return;
        }
        if (!g5_nextjs_sync_htaccess_rewrite_block($theme)) {
            echo '테마는 적용했지만 .htaccess 를 쓸 수 없어 짧은 주소 규칙을 갱신하지 못했습니다. '
                . '기본환경설정 > 짧은 주소 설정의 "Apache 설정 코드"를 .htaccess 에 직접 넣어 주세요.';
        }
    }
}

if (!function_exists('g5_nextjs_root_payload_shim_script')) {
    /**
     * 하위 폴더 설치에서 첫 화면의 RSC 페이로드 요청을 폴더 안으로 되돌리는 브라우저 스크립트.
     *
     * Next 정적 내보내기는 클라이언트 이동 때 `주소 + ".txt"` 를 받아 간다. 루트(/)는
     * basePath 를 붙인 뒤 끝 슬래시가 없어서 `/gnu5512.txt` 가 되는데, 이 주소는 설치 폴더
     * *바깥*이라 우리 .htaccess 도, 브리지도 손댈 수 없다. 상위 폴더에 다른 사이트(또 다른
     * 그누보드)가 있으면 그쪽이 엉뚱한 답을 주고, 없으면 404 다. 어느 쪽이든 홈으로 가는
     * 링크가 깨진다. 브리지는 `/gnu5512/index.txt` 로 같은 페이로드를 낼 수 있으므로,
     * fetch 를 얇게 감싸 그 한 주소만 바꿔 준다. 루트 설치(basePath 없음)에서는 아무 일도
     * 하지 않는다. __G5_APP_CONFIG__ 를 심는 같은 <script> 안에서 부른다.
     */
    function g5_nextjs_root_payload_shim_script($config_key = '__G5_APP_CONFIG__')
    {
        $key = json_encode((string) $config_key);

        return '(function(c){try{if(!c||!c.appBaseUrl)return;'
            . 'var b=new URL(c.appBaseUrl,location.href).pathname.replace(/\/+$/,"");if(!b)return;'
            . 'var f=window.fetch;if(typeof f!=="function")return;var t=b+".txt";'
            . 'window.fetch=function(i,o){try{var s=typeof i==="string"||i instanceof URL;'
            . 'var u=s?String(i):(i&&i.url)||"";'
            . 'var p=new URL(u,location.href);if(p.origin===location.origin&&p.pathname===t){'
            . 'p.pathname=b+"/index.txt";i=s?p.href:new Request(p.href,i);}}catch(e){}'
            . 'return f.call(this,i,o);};}catch(e){}})(window[' . $key . ']);';
    }
}
