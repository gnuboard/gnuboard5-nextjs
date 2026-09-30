<?php
/**
 * Gnuboard5 REST API - JWT Token Handler
 *
 * Pure-PHP HS256 JSON Web Token implementation.
 * No external libraries required.
 */

/**
 * JWT_SECRET 결정 우선순위:
 *   1) 명시적 define (운영 환경 override)
 *   2) data/jwt_secret.php 파일 (256-bit hex, 첫 실행 시 자동 생성)
 *   3) (legacy fallback) DB 자격증명 기반 해시 — 경고
 *
 * 왜 .php 로 감싸는가: 예전 이름 data/.jwt_secret 은 점 파일이라 웹서버 설정에 따라 그대로
 * 읽혔다(공유 호스팅에서 200 으로 노출된 것을 확인). 그누보드는 data/ 안의 PHP 실행을
 * .htaccess 로 막고, 설령 실행되더라도 첫 줄에서 exit 하므로 비밀이 새지 않는다. 옛 파일이
 * 있으면 값을 옮기고 지운다 — 발급된 토큰은 그대로 유효하다.
 *
 * (3) 은 예측 가능 (DB creds 가 새면 JWT 위조 가능) → 새 설치/배포는 (2) 가 적용됨.
 */
if (!defined('JWT_SECRET')) {
    $__jwt_data_dir = defined('G5_DATA_PATH') ? G5_DATA_PATH : __DIR__ . '/../../data';
    $__jwt_secret_file = $__jwt_data_dir . '/jwt_secret.php';
    $__jwt_legacy_file = $__jwt_data_dir . '/.jwt_secret';
    $__jwt_secret = null;

    if (is_readable($__jwt_secret_file)) {
        // 파일 꼴: "<?php exit; // <64 hex>"
        if (preg_match('/\/\/\s*([0-9a-f]{64})\s*$/', (string) file_get_contents($__jwt_secret_file), $__m)) {
            $__jwt_secret = $__m[1];
        }
    }

    if ($__jwt_secret === null && is_readable($__jwt_legacy_file)) {
        $__raw = trim((string) file_get_contents($__jwt_legacy_file));
        if (strlen($__raw) >= 32) {
            $__jwt_secret = $__raw;
            if (@file_put_contents($__jwt_secret_file, "<?php exit; // {$__jwt_secret}\n", LOCK_EX) !== false) {
                @chmod($__jwt_secret_file, 0600);
                @unlink($__jwt_legacy_file);
            }
        }
    }

    if ($__jwt_secret === null) {
        // 첫 실행: 64-hex (256-bit) 발급. PHP 파일로 감싸 0600 권한으로 저장.
        try {
            $__jwt_secret = bin2hex(random_bytes(32));
            @file_put_contents($__jwt_secret_file, "<?php exit; // {$__jwt_secret}\n", LOCK_EX);
            @chmod($__jwt_secret_file, 0600);
        } catch (\Throwable $__e) {
            // random_bytes 실패는 극히 드물지만 보호적 폴백
            $__jwt_secret = hash('sha256',
                (defined('G5_MYSQL_USER') ? G5_MYSQL_USER : '') .
                (defined('G5_MYSQL_PASSWORD') ? G5_MYSQL_PASSWORD : '') .
                (defined('G5_MYSQL_DB') ? G5_MYSQL_DB : '') .
                (string) microtime(true)
            );
        }
    }

    define('JWT_SECRET', $__jwt_secret);
    unset($__jwt_data_dir, $__jwt_secret_file, $__jwt_legacy_file, $__jwt_secret, $__raw, $__m);
}

// Default ACCESS token lifetime: 30 minutes (refresh 흐름과 함께 짧게)
if (!defined('JWT_EXPIRE_SECONDS')) {
    define('JWT_EXPIRE_SECONDS', 30 * 60);
}

// Refresh token 수명: 30 일 (DB 에서 revocation 관리)
if (!defined('JWT_REFRESH_EXPIRE_SECONDS')) {
    define('JWT_REFRESH_EXPIRE_SECONDS', 30 * 24 * 60 * 60);
}

class JWT
{
    /**
     * Create a signed JWT string.
     *
     * @param  array       $payload  Associative array of claims
     * @param  string|null $secret   HMAC secret (defaults to JWT_SECRET)
     * @param  int|null    $expire   Lifetime in seconds (defaults to JWT_EXPIRE_SECONDS)
     * @return string      Encoded JWT
     */
    public static function encode(array $payload, $secret = null, $expire = null)
    {
        if ($secret === null) {
            $secret = JWT_SECRET;
        }
        if ($expire === null) {
            $expire = JWT_EXPIRE_SECONDS;
        }

        $header = [
            'alg' => 'HS256',
            'typ' => 'JWT',
        ];

        // Standard time claims
        $payload['iat'] = time();
        $payload['exp'] = time() + $expire;

        $headerEncoded  = self::base64UrlEncode(json_encode($header));
        $payloadEncoded = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, $secret, true);
        $signatureEncoded = self::base64UrlEncode($signature);

        return $headerEncoded . '.' . $payloadEncoded . '.' . $signatureEncoded;
    }

    /**
     * Decode and verify a JWT string.
     *
     * @param  string      $token
     * @param  string|null $secret  HMAC secret (defaults to JWT_SECRET)
     * @return array|false          Decoded payload or false on failure
     */
    public static function decode($token, $secret = null)
    {
        if ($secret === null) {
            $secret = JWT_SECRET;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return false;
        }

        list($headerEncoded, $payloadEncoded, $signatureEncoded) = $parts;

        // Verify signature
        $expectedSignature = hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, $secret, true);
        $signature = self::base64UrlDecode($signatureEncoded);

        if (!hash_equals($expectedSignature, $signature)) {
            return false;
        }

        // Decode payload
        $payload = json_decode(self::base64UrlDecode($payloadEncoded), true);
        if (!$payload) {
            return false;
        }

        // Check expiration
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return false;
        }

        return $payload;
    }

    /**
     * Base64 URL-safe encode.
     *
     * @param  string $data
     * @return string
     */
    public static function base64UrlEncode($data)
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64 URL-safe decode.
     *
     * @param  string $data
     * @return string
     */
    public static function base64UrlDecode($data)
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
