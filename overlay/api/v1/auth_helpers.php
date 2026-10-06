<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('api_auth_cookie_secure')) {
    function api_auth_cookie_secure()
    {
        $configured = api_auth_env_value('G5_AUTH_COOKIE_SECURE');
        if ($configured !== '') {
            return in_array(strtolower($configured), array('1', 'true', 'yes', 'on'), true);
        }

        $forwarded_scheme = function_exists('g5_nextjs_runtime_forwarded_proto')
            ? g5_nextjs_runtime_forwarded_proto()
            : '';

        return (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || $forwarded_scheme === 'https';
    }
}

if (!function_exists('api_auth_env_value')) {
    function api_auth_env_value($key)
    {
        $key = (string) $key;
        if ($key === '') {
            return '';
        }

        if (defined($key)) {
            return trim((string) constant($key));
        }

        global $G5_API_ENV;
        if (isset($G5_API_ENV) && is_array($G5_API_ENV) && isset($G5_API_ENV[$key])) {
            return trim((string) $G5_API_ENV[$key]);
        }

        $value = getenv($key);
        return is_string($value) ? trim($value) : '';
    }
}

if (!function_exists('api_auth_password_policy_errors')) {
    function api_auth_password_policy_errors($password, $mbId = '')
    {
        $password = (string) $password;
        $mbId = (string) $mbId;
        $errors = array();

        if (strlen($password) < 8) {
            $errors['mb_password'] = 'mb_password must be at least 8 characters.';
            return $errors;
        }

        if (strlen($password) > 64) {
            $errors['mb_password'] = 'mb_password must be at most 64 characters.';
            return $errors;
        }

        if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
            $errors['mb_password'] = 'Password must include both letters and numbers.';
            return $errors;
        }

        $weak = array('password', '12345678', 'qwerty12', 'asdf1234', '1234abcd', 'abcd1234', 'admin123');
        if (in_array(strtolower($password), $weak, true)) {
            $errors['mb_password'] = 'Password is too weak.';
            return $errors;
        }

        if ($mbId !== '' && stripos($password, $mbId) !== false) {
            $errors['mb_password'] = 'Password must not include the member ID.';
        }

        return $errors;
    }
}

if (!function_exists('api_auth_cookie_samesite')) {
    function api_auth_cookie_samesite()
    {
        $configured = strtolower(api_auth_env_value('G5_AUTH_COOKIE_SAMESITE'));
        if ($configured === 'none') {
            return api_auth_cookie_secure() ? 'None' : 'Lax';
        }
        if ($configured === 'strict') {
            return 'Strict';
        }

        return 'Lax';
    }
}

if (!function_exists('api_auth_set_cookie')) {
    function api_auth_set_cookie($name, $value, $maxAge = null, $httpOnly = true)
    {
        $options = array(
            'path'     => '/',
            'secure'   => api_auth_cookie_secure(),
            'httponly' => (bool) $httpOnly,
            'samesite' => api_auth_cookie_samesite(),
        );

        if ($maxAge !== null) {
            $maxAge = max(0, (int) $maxAge);
            $options['expires'] = time() + $maxAge;
        }

        setcookie($name, (string) $value, $options);
        $_COOKIE[$name] = (string) $value;
    }
}

if (!function_exists('api_auth_clear_cookie')) {
    function api_auth_clear_cookie($name, $httpOnly = true)
    {
        setcookie($name, '', array(
            'expires'  => time() - 3600,
            'path'     => '/',
            'secure'   => api_auth_cookie_secure(),
            'httponly' => (bool) $httpOnly,
            'samesite' => api_auth_cookie_samesite(),
        ));
        unset($_COOKIE[$name]);
    }
}

if (!function_exists('api_auth_open_php_session')) {
    /**
     * API 로그인 성공 시 그누보드 PHP 세션도 함께 연다 — bbs/login_check.php 가 하는 것과 같은 세 줄.
     *
     * 없으면 Next 화면에서 로그인한 관리자가 /adm 에 가서 "로그인 하십시오" 를 만난다(JWT 는 PHP 가 모른다).
     * common.php 가 이미 세션을 시작해 두었으므로 같은 origin 이면 세션 쿠키가 그대로 따라간다;
     * 다른 origin(Vercel 프론트, 앱)에서는 쿠키가 안 붙을 뿐 해는 없다.
     * 그누보드 밖에서(단위 테스트 등) 불리면 조용히 넘어간다.
     *
     * $sessionId(로그인 세션 번호)를 함께 적어 두면, 그 로그인이 세션 목록에서 끊길 때 이 그누보드 세션도
     * 다음 요청에서 닫힌다(plugin/webapp/bridge/api_session.php).
     */
    function api_auth_open_php_session(array $member, $sessionId = null)
    {
        if (!function_exists('set_session') || empty($member['mb_id'])) {
            return;
        }
        if (session_status() !== PHP_SESSION_ACTIVE || headers_sent()) {
            return;
        }
        @session_regenerate_id(false);
        set_session('ss_mb_id', (string) $member['mb_id']);
        set_session('ss_api_sid', (int) $sessionId > 0 ? (string) (int) $sessionId : '');
        set_session('ss_api_sid_mb', (int) $sessionId > 0 ? (string) $member['mb_id'] : '');
        if (function_exists('generate_mb_key')) {
            generate_mb_key($member);
        }
        if (function_exists('update_auth_session_token') && isset($member['mb_datetime'])) {
            update_auth_session_token($member['mb_datetime']);
        }
    }
}

if (!function_exists('api_auth_merge_guest_cart')) {
    /**
     * SC-02 로그인 병합(login/register/social exchange/link-existing): 요청에 `X-Cart-Id` 가 있으면 그 카트를 회원의
     * 현재 카트로 삼는다(웹에서 쿠키가 하던 역할). 다른 회원 소유 카트면 shop_api_cart_id() 가 버리고 새 id 를 준다.
     * 헤더가 없거나 쇼핑몰 테이블이 없는 설치본이면 null — 로그인 자체는 절대 막지 않는다.
     */
    function api_auth_merge_guest_cart(array $member): ?string
    {
        $header = trim((string) ($_SERVER['HTTP_X_CART_ID'] ?? ''));
        if (preg_match('/^[0-9]{16,20}$/', $header) !== 1 || empty($member['mb_id'])) {
            return null;
        }
        $shopCommon = __DIR__ . '/shop/common.php';
        if (!is_file($shopCommon)) {
            return null;
        }
        try {
            require_once $shopCommon;
            return function_exists('shop_api_cart_id') ? (string) shop_api_cart_id($member) : null;
        } catch (\Throwable $e) {
            error_log('[api_auth_merge_guest_cart] ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('api_auth_with_merged_cart')) {
    /** 병합한 카트 id 가 있을 때만 응답 data 에 `cart_id` 를 얹는다. */
    function api_auth_with_merged_cart(array $data, array $member): array
    {
        $cartId = api_auth_merge_guest_cart($member);
        if ($cartId !== null && $cartId !== '') {
            $data['cart_id'] = $cartId;
        }
        return $data;
    }
}

if (!function_exists('api_auth_close_php_session')) {
    /** API 로그아웃: 그누보드 세션도 닫는다(bbs/logout.php 와 같이). */
    function api_auth_close_php_session()
    {
        if (!function_exists('set_session') || session_status() !== PHP_SESSION_ACTIVE) {
            return;
        }
        set_session('ss_mb_id', '');
        set_session('ss_mb_key', '');
        @session_unset();
    }
}

if (!function_exists('api_client_platform')) {
    /**
     * SC-04: 요청 헤더 X-Client-Platform 을 읽는다 — 'ios' | 'android' 만 네이티브로 인정하고 그 외는 '' (웹).
     * 헤더는 위조 가능하지만 얻는 것은 "인증 쿠키를 받지 않는 것" 뿐이라 보안을 낮추지 않는다.
     */
    function api_client_platform()
    {
        $raw = isset($_SERVER['HTTP_X_CLIENT_PLATFORM']) ? strtolower(trim((string) $_SERVER['HTTP_X_CLIENT_PLATFORM'])) : '';
        return ($raw === 'ios' || $raw === 'android') ? $raw : '';
    }
}

if (!function_exists('api_client_is_native')) {
    function api_client_is_native()
    {
        return api_client_platform() !== '';
    }
}

if (!function_exists('api_auth_set_session_cookies')) {
    function api_auth_set_session_cookies($token, $refresh, $autoLogin = false)
    {
        // SC-04: 네이티브 앱은 토큰을 JSON 으로만 받는다. 앱 쿠키 저장소에 g5_refresh 가 남으면 /auth/me 가 그것을
        // 회전시켜, 앱이 가진 refresh_token 이 "재사용"으로 판정되고 회원의 모든 세션이 폐기된다.
        if (api_client_is_native()) {
            return;
        }

        $accessMaxAge = defined('JWT_EXPIRE_SECONDS') ? (int) JWT_EXPIRE_SECONDS : 1800;
        api_auth_set_cookie('g5_token', $token, $accessMaxAge, true);

        if ($autoLogin) {
            api_auth_set_cookie('g5_refresh', $refresh, 30 * 24 * 60 * 60, true);
            api_auth_set_cookie('g5_auto_login', '1', 30 * 24 * 60 * 60, true);
            api_auth_set_cookie('g5_auth_hint', '1', 30 * 24 * 60 * 60, false);
        } else {
            api_auth_set_cookie('g5_refresh', $refresh, null, true);
            api_auth_clear_cookie('g5_auto_login', true);
            api_auth_set_cookie('g5_auth_hint', '1', null, false);
        }
    }
}

if (!function_exists('api_auth_clear_session_cookies')) {
    function api_auth_clear_session_cookies()
    {
        api_auth_clear_cookie('g5_token', true);
        api_auth_clear_cookie('g5_refresh', true);
        api_auth_clear_cookie('g5_auto_login', true);
        api_auth_clear_cookie('g5_auth_hint', false);
        api_auth_clear_cookie('ck_guest_cart_id', true);
        if (function_exists('set_session')) {
            set_session('ss_cart_id', '');
            set_session('ss_cart_direct', '');
        }
    }
}

if (!function_exists('api_auth_has_bearer_header')) {
    function api_auth_has_bearer_header()
    {
        $header = null;
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $header = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            foreach ($headers as $key => $value) {
                if (strtolower($key) === 'authorization') {
                    $header = $value;
                    break;
                }
            }
        }

        return is_string($header) && preg_match('/^Bearer\s+.+$/i', $header);
    }
}

if (!function_exists('api_auth_member_from_refresh_cookie')) {
    function api_auth_member_from_refresh_cookie()
    {
        // SC-04: 네이티브 앱의 /auth/me 는 Bearer 만 평가한다 — 쿠키측 refresh 회전을 하지 않는다(위 주석 참조).
        if (api_client_is_native()) {
            return null;
        }

        if (empty($_COOKIE['g5_refresh'])) {
            return null;
        }

        $rawRefresh = trim((string) $_COOKIE['g5_refresh']);
        if ($rawRefresh === '') {
            return null;
        }

        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null;
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : null;
        $result = RefreshToken::exchange($rawRefresh, $ua, $ip);
        if (!$result) {
            api_auth_clear_session_cookies();
            return null;
        }

        $member = DB::fetch(
            "SELECT * FROM " . DB::table('member_table') . " WHERE mb_id = ? LIMIT 1",
            [$result['mb_id']]
        );
        if (!$member || !$member['mb_id'] || $member['mb_leave_date'] || $member['mb_intercept_date']) {
            api_auth_clear_session_cookies();
            return null;
        }

        $token = Auth::generateToken($member, RefreshToken::sessionOf($result['new_refresh']));
        $autoLoginCookie = !empty($_COOKIE['g5_auto_login']) && (string) $_COOKIE['g5_auto_login'] === '1';
        api_auth_set_session_cookies($token, $result['new_refresh'], $autoLoginCookie);

        return $member;
    }
}

// 소셜 가입 도우미(api_social_*)는 따로 둔다.
require_once __DIR__ . '/auth_social_signup_helpers.php';

if (!function_exists('api_member_nick_is_valid')) {
    /** 닉네임 글자 — 원본 valid_mb_nick() 과 같이 공백 없이 한글 · 영문 · 숫자만. 원본 관리자 목록 일부가 그대로 출력한다. */
    function api_member_nick_is_valid(string $nick): bool
    {
        if ($nick === '') {
            return false;
        }
        if (function_exists('check_string') && defined('G5_HANGUL') && defined('G5_ALPHABETIC') && defined('G5_NUMERIC')) {
            return (bool) check_string($nick, G5_HANGUL + G5_ALPHABETIC + G5_NUMERIC);
        }

        return (bool) preg_match('/^[가-힣A-Za-z0-9]+$/u', $nick);
    }
}

if (!function_exists('api_member_clean_field')) {
    /**
     * 회원 입력 정리 — 원본 bbs/register_form_update.php 와 같이 이름 · 전화 · 주소는 태그를 지우고, 휴대폰은 숫자 · '-',
     * 우편번호는 숫자만. 원본 화면 일부가 이 정리를 믿고 값을 그대로 출력한다. 그 밖의 필드는 앞뒤 공백만 지운다.
     */
    function api_member_clean_field(string $field, $value): string
    {
        if (is_array($value)) {
            return '';
        }
        $value = trim((string) $value);
        switch ($field) {
            case 'mb_name':
            case 'mb_tel':
            case 'mb_addr1':
            case 'mb_addr2':
            case 'mb_addr3':
                return function_exists('clean_xss_tags') ? clean_xss_tags($value, 1, 1) : strip_tags($value);
            case 'mb_hp':
                return (string) preg_replace('/[^0-9\-]/', '', $value);
            case 'mb_zip1':
            case 'mb_zip2':
                return (string) preg_replace('/[^0-9]/', '', $value);
            default:
                return $value;
        }
    }
}

if (!function_exists('api_social_signup_public_profile')) {
    function api_social_signup_public_profile(array $row)
    {
        $profile = api_social_signup_profile_from_row($row);
        $provider = isset($row['provider']) ? (string) $row['provider'] : (string) ($profile['provider'] ?? '');

        return array(
            'ticket'          => (string) $row['ticket'],
            'provider'        => $provider,
            'provider_label'  => nextjs25_social_provider_label($provider),
            'suggested_mb_id' => api_social_suggest_member_id($profile),
            'suggested_nick'  => api_social_suggest_nick($profile),
            'name'            => (string) ($profile['username'] ?? $profile['displayName'] ?? ''),
            'email'           => (string) ($profile['email'] ?? ''),
            'phone'           => (string) ($profile['phone'] ?? ''),
            'photo_url'       => (string) ($profile['photoURL'] ?? ''),
        );
    }
}

if (!function_exists('api_social_generate_member_password')) {
    function api_social_generate_member_password()
    {
        if (function_exists('get_random_token_string')) {
            return get_random_token_string(16);
        }

        return 'So' . bin2hex(random_bytes(12)) . '9';
    }
}

if (!function_exists('api_social_profile_to_object')) {
    function api_social_profile_to_object(array $profile)
    {
        return (object) $profile;
    }
}

if (!function_exists('api_social_claim_signup_ticket')) {
    /**
     * 가입 ticket 을 일회성으로 잡는다. 로그인 ticket 과 같은 원자적 갱신 —
     * 아직 안 쓰였고 만료 전인 행만 used_at 을 찍고, 정확히 한 행이 바뀌었을 때만
     * 성공이다. 같은 ticket 으로 동시에 들어온 두 요청 중 하나만 통과한다.
     * 회원을 만들거나 계정을 연결하기 *전에* 불러야 한다 — 뒤에 부르면 두 요청이
     * 모두 회원을 만든 뒤에야 한쪽이 실패한다.
     */
    function api_social_claim_signup_ticket(array $row)
    {
        $ticketTable = nextjs25_social_signup_ticket_table();
        $claimed = DB::execute(
            "UPDATE {$ticketTable}
                SET used_at = NOW()
              WHERE ticket_id = ?
                AND used_at IS NULL
                AND expires_at >= NOW()",
            [(int) $row['ticket_id']]
        );
        if ($claimed !== 1) {
            Response::error('소셜 가입 ticket 이 이미 사용되었거나 만료되었습니다. 다시 시도해주세요.', 410);
        }
        // 만료된 ticket 청소 (lazy GC).
        DB::execute(
            "DELETE FROM {$ticketTable} WHERE expires_at < (NOW() - INTERVAL 1 HOUR)"
        );
    }
}

if (!function_exists('api_social_validate_signup_ticket')) {
    function api_social_validate_signup_ticket($ticket, $codeVerifier = '')
    {
        global $g5;

        $g5Config = api_get_config();
        if (empty($g5Config['cf_social_login_use'])) {
            Response::error('소셜 로그인이 비활성화되어 있습니다.', 403);
        }
        if (!function_exists('social_user_profile_replace')) {
            Response::error('소셜 로그인 플러그인을 찾을 수 없습니다.', 500);
        }

        $row = api_social_signup_ticket_row($ticket);
        if (!$row) {
            Response::error('소셜 가입 ticket 을 찾을 수 없습니다.', 404);
        }
        if (!empty($row['used_at'])) {
            Response::error('이미 사용된 소셜 가입 ticket 입니다.', 410);
        }
        if (strtotime((string) $row['expires_at']) < time()) {
            Response::error('소셜 가입 ticket 이 만료되었습니다. 다시 시도해주세요.', 410);
        }
        // PKCE 로 묶인 가입 ticket 은 verifier 가 맞아야 가입/연결에 쓸 수 있다
        // (api/social/_bridge_common.php 의 설명 참고). 묶이지 않은 ticket 은 종전과 같다.
        if (!nextjs25_social_ticket_verifier_ok(
            isset($row['code_challenge']) ? $row['code_challenge'] : '',
            $codeVerifier
        )) {
            Response::error('소셜 가입 ticket 검증에 실패했습니다. 다시 시도해주세요.', 403);
        }

        $profile = api_social_signup_profile_from_row($row);
        if (empty($profile['identifier'])) {
            Response::error('소셜 프로필 정보가 올바르지 않습니다. 다시 시도해주세요.', 422);
        }

        $serviceList = isset($g5Config['cf_social_servicelist'])
            ? array_values(array_filter(array_map('strtolower', array_map('trim', explode(',', (string) $g5Config['cf_social_servicelist'])))))
            : array();
        if ($serviceList && !in_array((string) $row['provider'], $serviceList, true)) {
            Response::error('현재 활성화되지 않은 소셜 로그인 제공자입니다.', 403);
        }

        $socialProfileTable = isset($g5['social_profile_table'])
            ? $g5['social_profile_table']
            : G5_TABLE_PREFIX . 'member_social_profiles';
        $linked = DB::fetch(
            "SELECT mb_id FROM {$socialProfileTable}
             WHERE provider = ? AND identifier = ? AND mb_id <> ''
             LIMIT 1",
            [(string) $row['provider'], (string) $row['identifier']]
        );
        if ($linked && !empty($linked['mb_id'])) {
            Response::error('이미 가입된 소셜 계정입니다. 로그인으로 이용해주세요.', 409);
        }

        return array($row, $profile);
    }
}

// -------------------------------------------------------------------------
// 메일 인증 토큰 — 그누보드 5.6.41 부터 원본이 토큰에 발급 시각을 붙여("무작위.시각") 유효시간
// (cf_email_certify_minutes, 기본 60분)을 따지고, 기한을 넘긴 미인증 회원은 원본 정리 작업
// (bbs/db_table.optimize.php)이 탈퇴 처리한다. 발급 시각이 없는 토큰은 가입 시각을 기준으로 보므로,
// API 도 원본과 같은 모양으로 만들어야 이메일을 바꾼 기존 회원이 바로 기한 넘김으로 잡히지 않는다.
// 그 함수가 없는 이전 버전(5.6.30 등)에서는 예전처럼 무작위 값만 쓰고 기한도 따지지 않는다.
// -------------------------------------------------------------------------
if (!function_exists('api_email_certify_new_token')) {
    function api_email_certify_new_token(): string
    {
        if (function_exists('get_email_certify_token')) {
            return (string) get_email_certify_token();
        }
        return bin2hex(random_bytes(16));
    }
}

if (!function_exists('api_email_certify_minutes')) {
    /** 인증 링크 유효시간(분). 0 이면 기한 없음. 기한을 따지지 않는 이전 버전 코어에서는 늘 0. */
    function api_email_certify_minutes(): int
    {
        if (!function_exists('is_valid_email_certify_token')) {
            return 0;
        }
        $config = api_get_config();
        return isset($config['cf_email_certify_minutes']) ? max(0, (int) $config['cf_email_certify_minutes']) : 60;
    }
}

if (!function_exists('api_email_certify_check')) {
    /**
     * 받은 토큰을 저장된 토큰과 견준다. 'ok' | 'invalid' | 'expired'.
     * 일치 비교를 먼저 하므로 토큰을 모르는 사람은 'expired' 로 회원 상태를 떠볼 수 없다.
     */
    function api_email_certify_check(string $token, string $stored, string $mbDatetime): string
    {
        if ($token === '' || $stored === '' || !hash_equals($stored, $token)) {
            return 'invalid';
        }
        $minutes = api_email_certify_minutes();
        if ($minutes < 1) {
            return 'ok';
        }
        return is_valid_email_certify_token($token, $stored, $mbDatetime, $minutes) ? 'ok' : 'expired';
    }
}

if (!function_exists('api_email_certify_validity_note')) {
    /** 인증 메일 본문 끝에 붙일 유효시간 안내. 기한이 없으면 ''. */
    function api_email_certify_validity_note(): string
    {
        $minutes = api_email_certify_minutes();
        return $minutes > 0 ? "\n\n인증 링크는 발송 후 {$minutes}분 동안 유효합니다." : '';
    }
}

if (!function_exists('api_auth_email_verify_page_url')) {
    /**
     * 메일 인증 링크를 브라우저로 연 뒤 결과를 보여 줄 웹 로그인 화면 주소(?email_verify=ok|already|expired|invalid).
     * 웹 화면(Next.js 테마나 따로 둔 앱 주소)이 없는 설치본이면 '' — 그때는 예전처럼 JSON 으로 답한다.
     */
    function api_auth_email_verify_page_url(string $status): string
    {
        $hasWebFront = defined('G5_WEBAPP_APP_URL') || defined('G5_NEXTJS25_APP_URL');
        if (!$hasWebFront && function_exists('g5_nextjs_runtime_active_theme') && function_exists('g5_nextjs_runtime_theme_path')) {
            $themePath = g5_nextjs_runtime_theme_path(g5_nextjs_runtime_active_theme());
            $hasWebFront = $themePath !== '' && is_file($themePath . '/route.php');
        }
        if (!$hasWebFront || !function_exists('api_auth_public_app_url')) {
            return '';
        }
        return api_auth_public_app_url('/login?email_verify=' . rawurlencode($status));
    }
}

if (!function_exists('api_auth_mask_email')) {
    /** "abcd@example.com" → "ab**@example.com". 어느 메일로 보냈는지만 알린다. */
    function api_auth_mask_email(string $email): string
    {
        $at = strrpos($email, '@');
        if ($at === false || $at < 1) {
            return '';
        }
        $local = substr($email, 0, $at);
        $keep = strlen($local) <= 2 ? 1 : 2;
        return substr($local, 0, $keep) . str_repeat('*', max(1, strlen($local) - $keep)) . substr($email, $at);
    }
}

if (!function_exists('api_email_certify_is_done')) {
    /** 메일 인증을 마쳤는지 — 원본과 같이 mb_email_certify 에 0 아닌 숫자가 있으면(인증 시각) 마친 것. */
    function api_email_certify_is_done(string $mbEmailCertify): bool
    {
        return (bool) preg_match('/[1-9]/', $mbEmailCertify);
    }
}

if (!function_exists('api_auth_resend_verification_quietly')) {
    /**
     * 앱 계약(SC-17)의 "인증 메일 다시 보내기" { mb_id, mb_email } — 아이디와 메일 주소가 맞는 미인증 회원에게만
     * 새 링크를 보내고 결과는 알려 주지 않는다(부른 쪽은 늘 같은 200 을 낸다 — 가입 여부를 떠볼 수 없게).
     * 메일은 회원 정보에 있는 주소로만 가고, 회원별 한도는 비밀번호로 부르는 다시 보내기와 같은 칸을 쓴다.
     * members_helpers.php(api_member_send_email_verification_mail)를 읽은 뒤에 부른다.
     */
    function api_auth_resend_verification_quietly(string $mbId, string $mbEmail, array $config): void
    {
        if (empty($config['cf_use_email_certify']) || empty($config['cf_email_use'])) {
            return;
        }
        $member = DB::fetch(
            "SELECT mb_id, mb_email, mb_email_certify, mb_email_certify2, mb_leave_date, mb_intercept_date
               FROM " . DB::table('member_table') . " WHERE mb_id = ? LIMIT 1",
            [$mbId]
        );
        if (!$member || empty($member['mb_id'])) {
            return;
        }
        $email = trim((string) $member['mb_email']);
        if ($email === '' || strcasecmp($email, $mbEmail) !== 0
            || !empty($member['mb_leave_date']) || !empty($member['mb_intercept_date'])
            || api_email_certify_is_done((string) $member['mb_email_certify'])) {
            return;
        }
        if (!api_require_mailer() || api_mail_link_base() === '') {
            error_log('[api/auth] resend-verification skipped — mailer or site URL (G5_DOMAIN) unavailable mb_id=' . $mbId);
            return;
        }
        if (Throttle::checkMemberQuota('verifymail', (string) $member['mb_id'], 1, 5, true, true) !== null) {
            return;
        }
        $token = api_email_certify_new_token();
        DB::execute(
            "UPDATE " . DB::table('member_table') . " SET mb_email_certify2 = ? WHERE mb_id = ?",
            [$token, (string) $member['mb_id']]
        );
        if (!api_member_send_email_verification_mail((string) $member['mb_id'], $email, $token, false)) {
            // 발송에 실패하면 먼저 받아 둔 링크가 계속 쓰이도록 토큰을 되돌린다(그 사이 바뀌지 않았을 때만).
            DB::execute(
                "UPDATE " . DB::table('member_table') . " SET mb_email_certify2 = ? WHERE mb_id = ? AND mb_email_certify2 = ?",
                [(string) $member['mb_email_certify2'], (string) $member['mb_id'], $token]
            );
        }
    }
}

// -------------------------------------------------------------------------
// GET /v1/auth/check-id?mb_id=xxx - Check mb_id availability for registration
// -------------------------------------------------------------------------
