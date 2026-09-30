<?php
/**
 * POST /v1/auth/social/apple — Sign in with Apple (앱 SERVER-CHANGES SC-11). 네이티브 앱 전용(웹 bridge 는 apple 을 계속 거절).
 *
 * 앱이 expo-apple-authentication 으로 받은 identity token 을 검증(api/lib/AppleIdToken.php)해 기존 소셜 계정 체계에 잇는다.
 *   purpose=login  (기본) 연결된 회원 → /auth/social/exchange 와 같은 로그인 응답
 *                        미연결        → 소셜 가입 ticket(기존 signup-profile / register / link-existing 이 그대로 받음)
 *   purpose=reauth (Bearer 필수) 탈퇴 재인증 — 토큰의 sub 가 현재 회원의 apple 연결과 같으면 5분짜리 social_ticket 만 준다
 *                        (DELETE /members/me {social_ticket}). 세션은 발급하지 않는다.
 * authorization_code 는 login 모드에서만 Apple refresh_token 으로 바꿔 저장한다(탈퇴 revoke 용, 실패해도 로그인은 진행).
 * code_challenge(선택)를 보내면 발급하는 ticket 에 PKCE 로 묶는다 — 다른 소셜 ticket 과 같은 규칙.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/../lib/AppleIdToken.php';
require_once __DIR__ . '/../lib/AppleClient.php';

if (!function_exists('api_apple_provider_enabled')) {
    function api_apple_provider_enabled(): bool
    {
        $g5Config = api_get_config();
        if (empty($g5Config['cf_social_login_use'])) {
            return false;
        }
        $list = array_map('strtolower', array_map('trim', explode(',', (string) ($g5Config['cf_social_servicelist'] ?? ''))));
        return in_array('apple', $list, true);
    }

    /** 검증된 클레임. 실패는 이유를 로그에만 남기고 한 가지 401 로 답한다. */
    function api_apple_verified_claims(array $input): array
    {
        try {
            return AppleIdToken::verify((string) $input['identity_token'], AppleClient::audiences(), (string) $input['nonce']);
        } catch (AppleIdTokenException $e) {
            error_log('[apple] identity token rejected: ' . $e->getMessage());
        } catch (\Throwable $e) {
            error_log('[apple] identity token error: ' . $e->getMessage());
        }
        Response::error('Invalid Apple identity token.', 401, ['code' => 'invalid_token']);
        return [];
    }

    function api_apple_linked_mb_id(string $sub, string $mbId = ''): string
    {
        global $g5;
        $table = isset($g5['social_profile_table']) ? $g5['social_profile_table'] : G5_TABLE_PREFIX . 'member_social_profiles';
        $sql = "SELECT mb_id FROM {$table} WHERE provider = 'apple' AND identifier = ? AND mb_id <> ''";
        $params = [$sub];
        if ($mbId !== '') {
            $sql .= ' AND mb_id = ?';
            $params[] = $mbId;
        }
        $row = DB::fetch($sql . ' LIMIT 1', $params);
        return $row ? (string) $row['mb_id'] : '';
    }

    /** 가입 ticket 에 담을 프로필 — Apple 은 이름·이메일을 첫 로그인 때 한 번만 준다. 토큰의 email 클레임이 우선. */
    function api_apple_signup_profile(array $claims, array $input): array
    {
        $email = (string) ($claims['email'] ?? '');
        if ($email === '' && isset($input['email']) && is_string($input['email'])) {
            $email = trim($input['email']);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = '';
        }
        $name = '';
        if (isset($input['full_name']) && is_array($input['full_name'])) {
            $family = trim((string) ($input['full_name']['familyName'] ?? ''));
            $given = trim((string) ($input['full_name']['givenName'] ?? ''));
            $name = mb_substr(trim(strip_tags($family . $given)), 0, 40, 'UTF-8');
        }
        return [
            'provider'    => 'apple',
            'identifier'  => (string) $claims['sub'],
            'sid'         => '',
            'displayName' => $name,
            'username'    => $name,
            'email'       => $email,
            'phone'       => '',
            'gender'      => '',
            'photoURL'    => '',
            'profileURL'  => '',
            'description' => '',
        ];
    }

    function api_apple_issue_signup_ticket(array $profile, string $codeChallenge): string
    {
        nextjs25_social_ensure_signup_ticket_table();
        $ticket = bin2hex(random_bytes(32));
        DB::execute(
            'INSERT INTO ' . nextjs25_social_signup_ticket_table() . '
                (ticket, provider, code_challenge, identifier, profile_json, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                $ticket,
                'apple',
                nextjs25_social_normalize_code_challenge($codeChallenge),
                (string) $profile['identifier'],
                (string) json_encode($profile, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                date('Y-m-d H:i:s', time() + 600),
            ]
        );
        return $ticket;
    }

    function api_apple_login_member(string $mbId, array $input): void
    {
        $member = DB::fetch('SELECT * FROM ' . DB::table('member_table') . ' WHERE mb_id = ? LIMIT 1', [$mbId]);
        if (!$member || empty($member['mb_id'])) {
            Response::error('Member not found.', 404);
        }
        if (!empty($member['mb_leave_date'])) {
            Response::error('탈퇴 처리된 회원입니다.', 403);
        }
        if (!empty($member['mb_intercept_date'])) {
            Response::error('차단된 회원입니다.', 403);
        }
        $label = 'social:apple';
        if (isset($input['device_label']) && is_string($input['device_label']) && trim($input['device_label']) !== '') {
            $label .= ' ' . mb_substr(trim(strip_tags($input['device_label'])), 0, 64, 'UTF-8');
        }
        $token = Auth::generateToken($member);
        $refresh = RefreshToken::issue(
            (string) $member['mb_id'],
            $label,
            isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null,
            isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : null
        );
        api_auth_set_session_cookies($token, $refresh, false);
        api_auth_open_php_session($member);
        Response::success(api_auth_with_merged_cart([
            'token'         => $token,
            'refresh_token' => $refresh,
            'expires_in'    => JWT_EXPIRE_SECONDS,
            'member'        => api_auth_member_payload($member),
        ], $member));
    }

    function api_apple_reauth(array $input): void
    {
        $member = Auth::requireAuth();
        $claims = api_apple_verified_claims($input);
        if (api_apple_linked_mb_id((string) $claims['sub'], (string) $member['mb_id']) === '') {
            Response::error('This Apple account is not linked to the signed-in member.', 403, ['code' => 'social_mismatch']);
        }
        $ticket = nextjs25_social_issue_mobile_ticket(
            (string) $member['mb_id'],
            'apple',
            isset($input['code_challenge']) ? (string) $input['code_challenge'] : ''
        );
        Response::success(['social_ticket' => $ticket, 'expires_in' => 300]);
    }

    function api_apple_login(array $input): void
    {
        if (!api_apple_provider_enabled()) {
            Response::error('Apple login is disabled.', 403, ['code' => 'provider_disabled']);
        }
        $claims = api_apple_verified_claims($input);
        $sub = (string) $claims['sub'];
        $code = isset($input['authorization_code']) && is_string($input['authorization_code']) ? trim($input['authorization_code']) : '';
        AppleClient::exchangeAndStore($sub, $code);

        $mbId = api_apple_linked_mb_id($sub);
        if ($mbId !== '') {
            api_apple_login_member($mbId, $input);
        }
        $profile = api_apple_signup_profile($claims, $input);
        $ticket = api_apple_issue_signup_ticket($profile, isset($input['code_challenge']) ? (string) $input['code_challenge'] : '');
        Response::success([
            'social_signup_ticket' => $ticket,
            'provider'             => 'apple',
            'suggested_mb_id'      => api_social_suggest_member_id($profile),
            'suggested_nick'       => api_social_suggest_nick($profile),
            'email'                => (string) $profile['email'],
        ]);
    }
}

if ($action === 'social' && isset($apiSegments[1]) && $apiSegments[1] === 'apple' && $apiMethod === 'POST') {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $limited = Throttle::checkEnumProbe($ip);
    if ($limited !== null) {
        Response::error($limited, 429);
    }

    $input = get_request_body();
    $errors = [];
    foreach (['identity_token', 'nonce'] as $field) {
        if (!isset($input[$field]) || !is_string($input[$field]) || trim($input[$field]) === '') {
            $errors[$field] = 'required';
        }
    }
    if ($errors) {
        Response::error('입력 정보를 확인해주세요.', 422, $errors);
    }

    $purpose = isset($input['purpose']) ? (string) $input['purpose'] : 'login';
    if ($purpose === 'reauth') {
        api_apple_reauth($input);
    }
    if ($purpose !== 'login') {
        Response::error('입력 정보를 확인해주세요.', 422, ['purpose' => 'invalid']);
    }
    api_apple_login($input);
}
