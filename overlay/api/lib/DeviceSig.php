<?php
/**
 * Device ID HMAC 서명 — 비회원 식별의 무결성 보장.
 *
 * 위협 모델
 *   - 누군가 다른 사용자의 device_id 를 알아내도 sig 없이는 그 사람 데이터를 흡수 못함.
 *   - sig 는 서버 secret 기반이라 클라이언트가 위조 불가.
 *
 * 사용
 *   $sig = DeviceSig::sign($device_id);                   // 발급
 *   if (!DeviceSig::verify($device_id, $sig)) abort();    // 검증
 *
 * Secret 우선순위
 *   1) 환경변수 G5_DEVICE_SIG_SECRET (권장 — secret rotation 쉬움)
 *   2) data/dbconfig.php 의 G5_TOKEN_ENCRYPTION_KEY (폴백)
 *
 * 운영 권장
 *   /etc/apache2/envvars 또는 nginx fastcgi_param 에:
 *     SetEnv G5_DEVICE_SIG_SECRET "랜덤_64자_이상_secret"
 */

if (!defined('_GNUBOARD_')) exit;

class DeviceSig
{
    private static function secret(): string
    {
        $env = getenv('G5_DEVICE_SIG_SECRET');
        if (is_string($env) && strlen($env) >= 32) return $env;
        if (defined('G5_TOKEN_ENCRYPTION_KEY') && strlen((string) G5_TOKEN_ENCRYPTION_KEY) >= 32) {
            return G5_TOKEN_ENCRYPTION_KEY;
        }

        throw new \RuntimeException('G5_DEVICE_SIG_SECRET is not configured.');
    }

    /**
     * device_id 에 대한 영구 서명 발급. base64url 인코딩.
     */
    public static function sign(string $device_id): string
    {
        $raw = hash_hmac('sha256', $device_id, self::secret(), true);
        return self::base64UrlEncode($raw);
    }

    /**
     * Timing-safe 비교로 서명 검증. 빈 sig 는 항상 false.
     */
    public static function verify(string $device_id, string $sig): bool
    {
        if ($device_id === '' || $sig === '') return false;
        // device_id 형식 화이트리스트
        if (!preg_match('/^[a-zA-Z0-9\-]{8,64}$/', $device_id)) return false;
        try {
            $expected = self::sign($device_id);
        } catch (\RuntimeException $e) {
            return false;
        }
        return hash_equals($expected, $sig);
    }

    private static function base64UrlEncode(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }
}
