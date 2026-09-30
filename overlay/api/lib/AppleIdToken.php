<?php
/**
 * Sign in with Apple identity token 검증 (앱 SERVER-CHANGES SC-11).
 *
 * 순서: 헤더 kid 로 Apple 공개키(JWKS, data/cache/apple_jwks.json 1시간 캐시, kid 가 없으면 1회 재조회) 선택 →
 *       RS256 서명(openssl_verify) → iss / aud(허용 client id 목록) / exp / nonce(=sha256(원문 nonce)) 확인.
 * 실패는 AppleIdTokenException 하나로 던지고 이유(code)는 로그용이다 — 응답은 한 가지(401 invalid_token)로 준다.
 * 테스트에서 JWKS 와 현재 시각을 주입할 수 있다(setJwksProvider, now).
 */
declare(strict_types=1);

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('AppleIdTokenException')) {
    class AppleIdTokenException extends \RuntimeException
    {
    }
}

if (!class_exists('AppleIdToken')) {

class AppleIdToken
{
    const ISSUER = 'https://appleid.apple.com';
    const JWKS_URL = 'https://appleid.apple.com/auth/keys';
    const JWKS_TTL = 3600;
    /** exp·iat 비교 허용 오차(초). */
    const LEEWAY = 60;

    /** @var callable|null fn(bool $refresh): array JWKS — 테스트 주입용 */
    private static $jwksProvider = null;

    public static function setJwksProvider(?callable $provider): void
    {
        self::$jwksProvider = $provider;
    }

    /**
     * @param string[] $audiences 허용 client id(번들 id / Services ID)
     * @return array<string,mixed> 검증된 클레임(sub, email?, email_verified?, is_private_email? …)
     */
    public static function verify(string $jwt, array $audiences, string $rawNonce, ?int $now = null): array
    {
        $now = $now ?? time();
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            throw new AppleIdTokenException('malformed');
        }
        [$h64, $p64, $s64] = $parts;
        $header = json_decode(self::b64url($h64), true);
        $claims = json_decode(self::b64url($p64), true);
        $signature = self::b64url($s64);
        if (!is_array($header) || !is_array($claims) || $signature === '') {
            throw new AppleIdTokenException('malformed');
        }
        if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
            throw new AppleIdTokenException('alg');
        }

        $pem = self::publicKeyPem((string) $header['kid']);
        if (openssl_verify($h64 . '.' . $p64, $signature, $pem, OPENSSL_ALGO_SHA256) !== 1) {
            throw new AppleIdTokenException('signature');
        }
        self::checkClaims($claims, $audiences, $rawNonce, $now);
        return $claims;
    }

    private static function checkClaims(array $claims, array $audiences, string $rawNonce, int $now): void
    {
        if (($claims['iss'] ?? '') !== self::ISSUER) {
            throw new AppleIdTokenException('iss');
        }
        $aud = $claims['aud'] ?? '';
        $audList = is_array($aud) ? array_map('strval', $aud) : [(string) $aud];
        $allowed = array_values(array_filter(array_map('trim', $audiences), 'strlen'));
        if (!$allowed || !array_intersect($audList, $allowed)) {
            throw new AppleIdTokenException('aud');
        }
        if (!isset($claims['exp']) || (int) $claims['exp'] + self::LEEWAY < $now) {
            throw new AppleIdTokenException('exp');
        }
        if (isset($claims['iat']) && (int) $claims['iat'] - self::LEEWAY > $now) {
            throw new AppleIdTokenException('iat');
        }
        if ($rawNonce === '' || !hash_equals(hash('sha256', $rawNonce), (string) ($claims['nonce'] ?? ''))) {
            throw new AppleIdTokenException('nonce');
        }
        // sub 는 소셜 플러그인 SQL 에 sprintf 로 들어간다(plugin/social/includes/functions.php) — Apple 형식(영숫자·점)만 받는다.
        if (!isset($claims['sub']) || !is_string($claims['sub']) || !preg_match('/^[A-Za-z0-9._-]{1,255}$/', $claims['sub'])) {
            throw new AppleIdTokenException('sub');
        }
    }

    /** kid 로 공개키 PEM. 캐시에 없으면 한 번 새로 받아 본다(Apple 키 교체 대응). */
    private static function publicKeyPem(string $kid): string
    {
        foreach ([false, true] as $refresh) {
            $jwks = self::jwks($refresh);
            foreach (($jwks['keys'] ?? []) as $key) {
                if (is_array($key) && ($key['kid'] ?? '') === $kid && ($key['kty'] ?? '') === 'RSA'
                    && !empty($key['n']) && !empty($key['e'])) {
                    return self::rsaPem(self::b64url((string) $key['n']), self::b64url((string) $key['e']));
                }
            }
        }
        throw new AppleIdTokenException('kid');
    }

    private static function jwks(bool $refresh): array
    {
        if (self::$jwksProvider !== null) {
            return (array) (self::$jwksProvider)($refresh);
        }
        $cache = defined('G5_DATA_PATH') ? G5_DATA_PATH . '/cache/apple_jwks.json' : '';
        if (!$refresh && $cache !== '' && is_file($cache) && time() - (int) filemtime($cache) < self::JWKS_TTL) {
            $cached = json_decode((string) file_get_contents($cache), true);
            if (is_array($cached)) {
                return $cached;
            }
        }
        $ch = curl_init(self::JWKS_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);
        $jwks = $code === 200 && is_string($body) ? json_decode($body, true) : null;
        if (!is_array($jwks) || empty($jwks['keys'])) {
            throw new AppleIdTokenException('jwks_unavailable');
        }
        if ($cache !== '') {
            @file_put_contents($cache, (string) $body);
        }
        return $jwks;
    }

    /** RSA 모듈러스·지수(원시 바이트) → SubjectPublicKeyInfo PEM. */
    public static function rsaPem(string $n, string $e): string
    {
        $int = static function (string $bytes): string {
            if ($bytes !== '' && ord($bytes[0]) > 0x7f) {
                $bytes = "\0" . $bytes;
            }
            return "\x02" . self::derLength(strlen($bytes)) . $bytes;
        };
        $seq = $int($n) . $int($e);
        $rsaKey = "\x30" . self::derLength(strlen($seq)) . $seq;
        $bitString = "\x03" . self::derLength(strlen($rsaKey) + 1) . "\x00" . $rsaKey;
        $algorithm = hex2bin('300d06092a864886f70d0101010500');
        $spki = $algorithm . $bitString;
        $der = "\x30" . self::derLength(strlen($spki)) . $spki;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function derLength(int $len): string
    {
        if ($len < 0x80) {
            return chr($len);
        }
        $bytes = ltrim(pack('N', $len), "\0");
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    public static function b64url(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
        return $decoded === false ? '' : $decoded;
    }
}

} // class_exists guard
