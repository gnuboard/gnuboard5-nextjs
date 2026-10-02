<?php
/**
 * Sign in with Apple 서버 측 자격증명 사용 (앱 SERVER-CHANGES SC-11) — ES256 client_secret, authorization_code 교환,
 * refresh_token 저장(암호화)·탈퇴 시 revoke.
 *
 * 자격증명은 서버 전용 — api/.env(또는 서버 환경변수)의 APPLE_CLIENT_ID(콤마 목록, 첫 값이 client_id), APPLE_TEAM_ID,
 * APPLE_KEY_ID, APPLE_PRIVATE_KEY_B64(.p8 내용 base64) 또는 APPLE_PRIVATE_KEY_PATH(웹 루트 밖 경로). 앱 번들·앱 저장소·DB
 * 컬럼에 두지 않는다(Q-4). 비어 있으면 configured()=false — 로그인 검증(공개키)은 되지만 토큰 교환·revoke 는 건너뛴다.
 *
 * refresh_token 은 Apple sub 의 SHA-256 을 키로 g5_social_apple_token 에 AES-256-GCM 으로 저장한다 — 가입 전(회원 id 가
 * 없을 때)에 받은 코드도 저장할 수 있고, 탈퇴 때는 회원의 apple 소셜 연결(identifier=sub)로 찾는다.
 * HTTP 는 테스트에서 주입할 수 있다(setHttp).
 */
declare(strict_types=1);

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('AppleClient')) {

class AppleClient
{
    const TOKEN_URL = 'https://appleid.apple.com/auth/token';
    const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

    /** @var callable|null fn(string $url, array $form): array{code:int, body:string} */
    private static $http = null;

    public static function setHttp(?callable $http): void
    {
        self::$http = $http;
    }

    private static function env(string $key): string
    {
        return function_exists('g5_api_config_value') ? trim((string) g5_api_config_value($key)) : trim((string) getenv($key));
    }

    /** @return string[] identity token 의 aud 로 받을 client id 목록 */
    public static function audiences(): array
    {
        return array_values(array_filter(array_map('trim', explode(',', self::env('APPLE_CLIENT_ID'))), 'strlen'));
    }

    private static function privateKey(): string
    {
        $b64 = self::env('APPLE_PRIVATE_KEY_B64');
        if ($b64 !== '') {
            $decoded = base64_decode($b64, true);
            return $decoded === false ? '' : $decoded;
        }
        $path = self::env('APPLE_PRIVATE_KEY_PATH');
        return $path !== '' && is_file($path) ? (string) file_get_contents($path) : '';
    }

    /**
     * api/.env 의 APPLE_LOGIN_ENABLED=on 으로 Apple 로그인을 켰는지. 그누보드 원본 관리자 화면(소셜 서비스 목록)에는
     * Apple 칸이 없어 cf_social_servicelist 에 apple 을 넣을 길이 없다 — 원본을 고치지 않고 켜는 자리다.
     */
    public static function enabledByEnv(): bool
    {
        return in_array(strtolower(self::env('APPLE_LOGIN_ENABLED')), array('1', 'on', 'true', 'yes'), true);
    }

    /** 토큰 교환·revoke 에 필요한 값이 모두 있는지. */
    public static function configured(): bool
    {
        return self::audiences() && self::env('APPLE_TEAM_ID') !== '' && self::env('APPLE_KEY_ID') !== '' && self::privateKey() !== '';
    }

    /** ES256 client_secret(5분). */
    public static function clientSecret(?int $now = null): string
    {
        $now = $now ?? time();
        $enc = static fn(string $v): string => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $header = $enc((string) json_encode(['alg' => 'ES256', 'kid' => self::env('APPLE_KEY_ID')]));
        $payload = $enc((string) json_encode([
            'iss' => self::env('APPLE_TEAM_ID'),
            'iat' => $now,
            'exp' => $now + 300,
            'aud' => 'https://appleid.apple.com',
            'sub' => self::audiences()[0] ?? '',
        ]));
        $key = openssl_pkey_get_private(self::privateKey());
        if ($key === false || !openssl_sign($header . '.' . $payload, $der, $key, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('apple client secret signing failed');
        }
        return $header . '.' . $payload . '.' . $enc(self::derToRawSignature($der));
    }

    /** openssl 의 DER ECDSA 서명 → JWS 의 r||s(각 32바이트). */
    public static function derToRawSignature(string $der): string
    {
        $offset = 2;
        if (ord($der[1]) & 0x80) {
            $offset += ord($der[1]) & 0x7f;
        }
        $read = static function (string $der, int &$pos): string {
            $len = ord($der[$pos + 1]);
            $value = substr($der, $pos + 2, $len);
            $pos += 2 + $len;
            return str_pad(ltrim($value, "\0"), 32, "\0", STR_PAD_LEFT);
        };
        $r = $read($der, $offset);
        $s = $read($der, $offset);
        return $r . $s;
    }

    private static function post(string $url, array $form): array
    {
        if (self::$http !== null) {
            return (self::$http)($url, $form);
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($form),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT => 8,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);
        return ['code' => $code, 'body' => is_string($body) ? $body : ''];
    }

    /** authorization_code → Apple refresh_token 을 받아 sub 기준으로 저장. 실패해도 로그인은 막지 않는다(로그만). */
    public static function exchangeAndStore(string $sub, string $code): bool
    {
        if ($code === '' || !self::configured()) {
            return false;
        }
        try {
            $res = self::post(self::TOKEN_URL, [
                'client_id' => self::audiences()[0],
                'client_secret' => self::clientSecret(),
                'code' => $code,
                'grant_type' => 'authorization_code',
            ]);
            $json = json_decode($res['body'], true);
            $refresh = is_array($json) ? (string) ($json['refresh_token'] ?? '') : '';
            if ($res['code'] !== 200 || $refresh === '') {
                error_log('[apple] code exchange failed: http ' . $res['code']);
                return false;
            }
            self::storeToken($sub, $refresh);
            return true;
        } catch (\Throwable $e) {
            error_log('[apple] code exchange error: ' . $e->getMessage());
            return false;
        }
    }

    private static function table(): string
    {
        return DB::table('social_apple_token_table');
    }

    public static function storeToken(string $sub, string $refresh): void
    {
        DB::execute(
            'REPLACE INTO ' . self::table() . ' (sub_hash, refresh_token_enc, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
            [hash('sha256', $sub), self::encrypt($refresh)]
        );
    }

    /**
     * 탈퇴 — 회원의 apple 연결(identifier=sub)마다 저장된 refresh_token 을 revoke 하고 행을 지운다.
     * 실패해도 탈퇴는 계속한다(로그만). @return bool 하나라도 revoke 성공
     */
    public static function revokeForMember(string $mbId): bool
    {
        global $g5;
        $profiles = isset($g5['social_profile_table']) ? $g5['social_profile_table'] : G5_TABLE_PREFIX . 'member_social_profiles';
        $revoked = false;
        try {
            $rows = DB::fetchAll("SELECT identifier FROM {$profiles} WHERE mb_id = ? AND provider = 'apple'", [$mbId]);
            foreach ($rows as $row) {
                $hash = hash('sha256', (string) $row['identifier']);
                $tokenRow = DB::fetch('SELECT refresh_token_enc FROM ' . self::table() . ' WHERE sub_hash = ? LIMIT 1', [$hash]);
                $refresh = $tokenRow ? self::decrypt((string) $tokenRow['refresh_token_enc']) : '';
                if ($refresh !== '' && self::configured()) {
                    $res = self::post(self::REVOKE_URL, [
                        'client_id' => self::audiences()[0],
                        'client_secret' => self::clientSecret(),
                        'token' => $refresh,
                        'token_type_hint' => 'refresh_token',
                    ]);
                    $revoked = $revoked || $res['code'] === 200;
                    if ($res['code'] !== 200) {
                        error_log('[apple] revoke failed for ' . $mbId . ': http ' . $res['code']);
                    }
                }
                DB::execute('DELETE FROM ' . self::table() . ' WHERE sub_hash = ?', [$hash]);
            }
        } catch (\Throwable $e) {
            error_log('[apple] revoke error for ' . $mbId . ': ' . $e->getMessage());
        }
        return $revoked;
    }

    private static function key(): string
    {
        $secret = defined('G5_TOKEN_ENCRYPTION_KEY') && (string) G5_TOKEN_ENCRYPTION_KEY !== ''
            ? (string) G5_TOKEN_ENCRYPTION_KEY
            : (defined('JWT_SECRET') ? (string) JWT_SECRET : '');
        if ($secret === '') {
            throw new \RuntimeException('no token encryption key');
        }
        return hash('sha256', 'apple-refresh|' . $secret, true);
    }

    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new \RuntimeException('encrypt failed');
        }
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(string $stored): string
    {
        $raw = base64_decode($stored, true);
        if ($raw === false || strlen($raw) < 29) {
            return '';
        }
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? '' : $plain;
    }
}

} // class_exists guard
