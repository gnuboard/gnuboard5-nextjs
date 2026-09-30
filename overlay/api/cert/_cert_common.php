<?php
/**
 * 본인인증(KG 이니시스 간편인증 / KCP 휴대폰) api 어댑터 공통 부트스트랩.
 *
 * 설계 의도:
 *   - plugin/inicert, plugin/kcpcert 의 PHP 페이지는 절대 수정하지 않는다
 *     (그누보드 본체가 보안 패치/버전업으로 유지보수하는 파일이므로).
 *   - 대신 그 플러그인의 라이브러리(libs/, lib/) 만 재사용해서, 헤드리스
 *     Next.js 프런트로 인증 결과를 postMessage 로 전달하는 어댑터를 api/ 에 둔다.
 *   - 인증사(이니시스/KCP)가 돌아올 콜백 URL 을 plugin 이 아니라 이 api 핸들러로
 *     지정해서, plugin 의 opener-DOM 주입 코드를 거치지 않는다.
 *
 * 동작 흐름:
 *   start  -> 인증사 인증창 -> result(api) -> postMessage(opener) -> window.close()
 *
 * 결과 페이로드(스키마는 nextjs IdentityVerificationButton 과 1:1):
 *   { type:'identity-verification-result', status:'success'|'error',
 *     cert_type, mb_name, mb_hp, cert_no, mb_birth, adult, provider, message? }
 */

// 본인인증이 "필수"로 설정된 사이트에서 common.php 가 인증 페이지로 강제 리다이렉트
// 하는 것을 막기 위해, 플러그인과 동일하게 인증 진행중 플래그를 세운다.
if (!defined('G5_CERT_IN_PROG')) {
    define('G5_CERT_IN_PROG', true);
}

require_once __DIR__ . '/../../common.php';

if (!defined('KGINICIS_USE_CERT_SEED')) {
    define('KGINICIS_USE_CERT_SEED', !empty($config['cf_cert_use_seed']));
}

if (!function_exists('cert_normalize_origin')) {
    function cert_normalize_origin($origin)
    {
        $origin = trim((string) $origin);
        if ($origin === '') {
            return '';
        }

        $parts = parse_url($origin);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $scheme = strtolower((string) $parts['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            return '';
        }

        $host = strtolower((string) $parts['host']);
        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';

        return $scheme . '://' . $host . $port;
    }
}

if (!function_exists('cert_read_env_file')) {
    function cert_read_env_file($path)
    {
        $values = array();
        if (!is_readable($path)) {
            return $values;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return $values;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                continue;
            }

            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            if ($key === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) {
                continue;
            }

            $value = trim($value);
            if ($value !== '') {
                $quote = $value[0];
                if (($quote === '"' || $quote === "'") && substr($value, -1) === $quote) {
                    $value = substr($value, 1, -1);
                    if ($quote === '"') {
                        $value = stripcslashes($value);
                    }
                }
            }

            $values[$key] = $value;
        }

        return $values;
    }
}

if (!function_exists('cert_add_allowed_origins')) {
    function cert_add_allowed_origins(&$allowedOrigins, $origins)
    {
        if (!is_string($origins) || trim($origins) === '') {
            return;
        }

        foreach (explode(',', $origins) as $origin) {
            $origin = cert_normalize_origin($origin);
            if ($origin !== '') {
                $allowedOrigins[] = $origin;
            }
        }
    }
}

if (!function_exists('cert_allowed_post_message_origins')) {
    function cert_allowed_post_message_origins()
    {
        $allowedOrigins = array();

        if (defined('G5_URL')) {
            cert_add_allowed_origins($allowedOrigins, G5_URL);
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $forwarded_scheme = function_exists('g5_nextjs_runtime_forwarded_proto')
            ? g5_nextjs_runtime_forwarded_proto()
            : '';
        if ($forwarded_scheme !== '') {
            $scheme = $forwarded_scheme;
        }
        if (!empty($_SERVER['HTTP_HOST'])) {
            cert_add_allowed_origins($allowedOrigins, $scheme . '://' . $_SERVER['HTTP_HOST']);
        }

        if (defined('G5_CORS_ALLOWED_ORIGINS') && G5_CORS_ALLOWED_ORIGINS) {
            cert_add_allowed_origins($allowedOrigins, G5_CORS_ALLOWED_ORIGINS);
        }

        $env = cert_read_env_file(__DIR__ . '/../.env');
        if (isset($env['G5_CORS_ALLOWED_ORIGINS'])) {
            cert_add_allowed_origins($allowedOrigins, $env['G5_CORS_ALLOWED_ORIGINS']);
        }

        $serverAllowedOrigins = getenv('G5_CORS_ALLOWED_ORIGINS');
        if (is_string($serverAllowedOrigins)) {
            cert_add_allowed_origins($allowedOrigins, $serverAllowedOrigins);
        }

        return array_values(array_unique($allowedOrigins));
    }
}

if (!function_exists('cert_capture_return_origin')) {
    function cert_capture_return_origin()
    {
        $returnOrigin = isset($_GET['returnOrigin']) ? $_GET['returnOrigin'] : '';
        $returnOrigin = cert_normalize_origin($returnOrigin);
        if ($returnOrigin === '') {
            return '';
        }

        if (in_array($returnOrigin, cert_allowed_post_message_origins(), true)) {
            set_session('ss_nextjs25_cert_return_origin', $returnOrigin);
            return $returnOrigin;
        }

        return '';
    }
}

if (!function_exists('cert_post_message_origin')) {
    function cert_post_message_origin()
    {
        $returnOrigin = cert_normalize_origin((string) get_session('ss_nextjs25_cert_return_origin'));
        if ($returnOrigin !== '' && in_array($returnOrigin, cert_allowed_post_message_origins(), true)) {
            return $returnOrigin;
        }

        if (defined('G5_URL')) {
            $g5Origin = cert_normalize_origin(G5_URL);
            if ($g5Origin !== '') {
                return $g5Origin;
            }
        }

        return '*';
    }
}

/**
 * 앱 WebView 에서 시작한 인증인지 기록한다 (SC-21). start 페이지가 `client=app` 으로 열리면 결과 페이지가
 * 가입용 서명 토큰(cert_token)을 만들어 WebView 로 넘긴다. 웹(팝업) 시작이면 기록을 지운다.
 */
if (!function_exists('cert_capture_app_client')) {
    function cert_capture_app_client($pageType)
    {
        $isApp = isset($_GET['client']) && $_GET['client'] === 'app';
        set_session('ss_app_cert_page_type', $isApp ? (string) $pageType : '');
    }
}

/**
 * 인증사가 돌아올 결과 페이지의 기준 URL. 세션 쿠키가 이어지려면 시작한 호스트로 돌아와야 한다 — 로컬 개발 호스트
 * (localhost·127.*, 예: 에뮬레이터용 프록시)만 요청 호스트를 따르고, 그 밖에는 항상 G5_URL 이다(Host 헤더 위조 방지).
 */
if (!function_exists('cert_result_base_url')) {
    function cert_result_base_url()
    {
        $base = rtrim((string) G5_URL, '/');
        $host = isset($_SERVER['HTTP_HOST']) ? trim((string) $_SERVER['HTTP_HOST']) : '';
        if ($host === '' || preg_match('/[\/\\\\\s\x00-\x1F\x7F]/', $host)) {
            return $base;
        }
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $origin = cert_normalize_origin($scheme . '://' . $host);
        $hostName = strtolower((string) parse_url($origin, PHP_URL_HOST));
        // 접두사 비교(127.)는 127.0.0.1.attacker.example 같은 호스트를 통과시키므로 IPv4 루프백 전체 형식만 받는다.
        $isLocal = $hostName === 'localhost' || preg_match('/^127(\.\d{1,3}){3}$/', $hostName) === 1;
        if ($origin === '' || !$isLocal || $origin === cert_normalize_origin(G5_URL)) {
            return $base;
        }
        $path = (string) parse_url((string) G5_URL, PHP_URL_PATH);

        return $origin . rtrim($path, '/');
    }
}

/**
 * 앱에서 시작한 인증이 성공했으면 결과 페이지가 방금 세션에 기록한 검증값으로 cert_token 을 붙인다 (SC-21).
 */
if (!function_exists('cert_attach_app_token')) {
    function cert_attach_app_token(array $payload)
    {
        $pageType = (string) get_session('ss_app_cert_page_type');
        if ($pageType === '') {
            return $payload;
        }
        set_session('ss_app_cert_page_type', '');
        if (!isset($payload['status']) || $payload['status'] !== 'success') {
            return $payload;
        }

        require_once __DIR__ . '/../lib/cert_token.php';
        $payload['cert_token'] = api_cert_token_issue(array(
            'page_type' => $pageType,
            'cert_type' => (string) get_session('ss_cert_type'),
            'cert_no'   => (string) get_session('ss_cert_no'),
            'name'      => isset($payload['mb_name']) ? (string) $payload['mb_name'] : '',
            'hp'        => isset($payload['mb_hp']) ? (string) $payload['mb_hp'] : '',
            'birth'     => (string) get_session('ss_cert_birth'),
            'adult'     => (int) get_session('ss_cert_adult'),
            'sex'       => (string) get_session('ss_cert_sex'),
            'dupinfo'   => (string) get_session('ss_cert_dupinfo'),
        ));

        return $payload;
    }
}

/**
 * 인증 결과(또는 오류)를 opener(Next.js)로 postMessage 한 뒤 팝업을 닫는 HTML 응답.
 * 앱 WebView(ReactNativeWebView)에서 열렸으면 같은 결과를 앱으로도 보낸다 — 앱이 사유를 보여주므로 alert 은 생략.
 * api/.env 의 G5_CORS_ALLOWED_ORIGINS 에 허용된 Next.js origin 으로만 전송한다.
 */
if (!function_exists('cert_emit_result_and_close')) {
    function cert_emit_result_and_close(array $payload)
    {
        if (!isset($payload['type'])) {
            $payload['type'] = 'identity-verification-result';
        }
        $payload = cert_attach_app_token($payload);
        // 기본 json_encode: 유니코드는 \uXXXX, 슬래시는 \/ 로 이스케이프 →
        // <script> 안에 박아도 </script> 브레이크아웃이 불가능.
        $json = json_encode($payload);
        if ($json === false) {
            $json = '{"type":"identity-verification-result","status":"error","message":"encode_error"}';
        }
        $targetOrigin = cert_post_message_origin();
        set_session('ss_nextjs25_cert_return_origin', '');
        $targetOriginJson = json_encode($targetOrigin);
        if ($targetOriginJson === false) {
            $targetOriginJson = '"*"';
        }

        if (!headers_sent()) {
            header('Content-Type: text/html; charset=utf-8');
        }
        ?><!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>본인인증</title></head>
<body>
<script>
(function () {
    var payload = <?php echo $json; ?>;
    var targetOrigin = <?php echo $targetOriginJson; ?>;
    function bridgeDebug(message, error) {
        try {
            if (window.console && typeof window.console.debug === "function") {
                window.console.debug("[nextjs25-cert] " + message, error);
            }
        } catch (debugError) {
            void debugError;
        }
    }
    var nativeApp = false;
    try {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
            nativeApp = true;
        }
    } catch (e) {
        bridgeDebug("app postMessage failed", e);
    }
    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, targetOrigin);
        }
    } catch (e) {
        bridgeDebug("opener postMessage failed", e);
    }
    // 실패 시에는 사용자가 사유를 인지하도록 alert (원본 alert_close 동작과 동일). 앱은 자체 화면으로 알린다.
    if (!nativeApp && payload && payload.status === 'error' && payload.message) {
        try { alert(payload.message); } catch (e) { bridgeDebug("error alert failed", e); }
    }
    try { window.close(); } catch (e) { bridgeDebug("window close failed", e); }
})();
</script>
<p style="font-family:sans-serif;color:#555;text-align:center;margin-top:2rem;">
본인인증 처리가 완료되었습니다. 이 창은 자동으로 닫힙니다.
</p>
</body>
</html><?php
        exit;
    }
}

if (!function_exists('cert_emit_error_and_close')) {
    function cert_emit_error_and_close($message)
    {
        cert_emit_result_and_close(array(
            'type'    => 'identity-verification-result',
            'status'  => 'error',
            'message' => (string) $message,
        ));
    }
}
