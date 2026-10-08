<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if ($action === 'cert' && isset($apiSegments[1]) && $apiSegments[1] === 'config'
    && $apiMethod === 'GET') {

    $g5Config = api_get_config();

    $simple = isset($g5Config['cf_cert_simple']) ? (string) $g5Config['cf_cert_simple'] : '';
    $hp     = isset($g5Config['cf_cert_hp']) ? (string) $g5Config['cf_cert_hp'] : '';
    $ipin   = isset($g5Config['cf_cert_ipin']) ? (string) $g5Config['cf_cert_ipin'] : '';

    $certUse = isset($g5Config['cf_cert_use']) ? (int) $g5Config['cf_cert_use'] : 0;

    Response::success([
        'enabled'      => $certUse > 0,
        'mode'         => $certUse, // 0: disabled, 1: test, 2: production
        'required'     => !empty($g5Config['cf_cert_req']),
        'find_enabled' => !empty($g5Config['cf_cert_find']),
        'simple'       => $simple,   // '' | 'inicis' | 'kcb'
        'hp'           => $hp,       // '' | 'kcb' | 'kcp' | 'kcp_v2' | 'lg'
        'ipin'         => $ipin,     // '' | 'kcb' | 'kcp'
        'use_hp'       => !empty($g5Config['cf_use_hp']),
        'require_hp'   => !empty($g5Config['cf_req_hp']),
    ]);
}

// -------------------------------------------------------------------------
// GET /v1/auth/social/providers - 활성화된 소셜 로그인 공급자 목록
//
// 그누보드5 admin 의 cf_social_login_use / cf_social_servicelist 와
// 각 provider 의 키 설정 여부를 함께 반환. Next.js 테마가 로그인 화면
// 버튼 노출 여부를 결정할 때 사용.
// -------------------------------------------------------------------------
if ($action === 'social' && isset($apiSegments[1]) && $apiSegments[1] === 'providers'
    && $apiMethod === 'GET') {

    $g5Config = api_get_config();

    $enabled = !empty($g5Config['cf_social_login_use']);
    $listRaw = isset($g5Config['cf_social_servicelist']) ? (string) $g5Config['cf_social_servicelist'] : '';
    $list    = $listRaw === '' ? [] : array_values(array_filter(array_map('trim', explode(',', $listRaw))));

    // 화면에 표시할 한글 이름 + provider 키 보유 여부.
    $meta = [
        'naver'    => ['label' => '네이버',   'key' => 'cf_naver_clientid'],
        'kakao'    => ['label' => '카카오',   'key' => 'cf_kakao_rest_key'],
        'facebook' => ['label' => '페이스북', 'key' => 'cf_facebook_appid'],
        'google'   => ['label' => '구글',     'key' => 'cf_google_clientid'],
        'twitter'  => ['label' => '트위터',   'key' => 'cf_twitter_apikey'],
        'payco'    => ['label' => '페이코',   'key' => 'cf_payco_clientid'],
    ];

    $providers = [];
    foreach ($list as $provider) {
        $key = strtolower($provider);
        if (!isset($meta[$key])) {
            continue;
        }
        $providers[] = [
            'name'         => $key,
            'label'        => $meta[$key]['label'],
            'has_api_key'  => !empty(trim((string) ($g5Config[$meta[$key]['key']] ?? ''))),
        ];
    }
    // Apple(SC-11)은 네이티브 앱 전용 — 웹 bridge(start.php)는 거절하므로 native_only 로 표시한다.
    // 자격증명은 cf_* 컬럼이 아니라 서버 env(api/.env APPLE_*)에 있다.
    if (!class_exists('AppleClient') && is_file(__DIR__ . '/../lib/AppleClient.php')) {
        require_once __DIR__ . '/../lib/AppleClient.php';
    }
    // 관리자 소셜 목록에 apple 이 있거나 api/.env 의 APPLE_LOGIN_ENABLED=on (원본 관리자 화면에는 Apple 칸이 없다)
    if (class_exists('AppleClient') && (in_array('apple', array_map('strtolower', $list), true) || AppleClient::enabledByEnv())) {
        $providers[] = [
            'name'        => 'apple',
            'label'       => 'Apple',
            'has_api_key' => AppleClient::configured(),
            'native_only' => true,
        ];
    }

    Response::success([
        'enabled'   => $enabled,
        'providers' => $providers,
    ]);
}

// -------------------------------------------------------------------------
// GET /v1/auth/social/signup-profile?ticket=...
//
// OAuth 는 gnuboard social 플러그인이 처리하고, 미가입 소셜 프로필만
// api/social/signup.php 가 10분짜리 signup ticket 으로 넘긴다. Next.js
// /register 는 이 endpoint 로 프로필을 읽어 가입 폼을 자동 채움한다.
// -------------------------------------------------------------------------
// 웹 테마는 GET 쿼리로, 모바일 앱은 POST body 로 낸다 — PKCE verifier 를 GET 쿼리에
// 실으면 access log 한 줄에 ticket 과 verifier 가 같이 남기 때문이다.
if ($action === 'social' && isset($apiSegments[1]) && $apiSegments[1] === 'signup-profile'
    && ($apiMethod === 'GET' || $apiMethod === 'POST')) {

    $params = $apiMethod === 'POST' ? get_request_body() : $_GET;
    $ticket = isset($params['ticket']) ? trim((string) $params['ticket']) : '';
    $codeVerifier = isset($params['code_verifier']) ? trim((string) $params['code_verifier']) : '';
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
    // 프로필(이름·이메일)도 PKCE 로 묶인 ticket 이면 verifier 없이 읽을 수 없다.
    if (!nextjs25_social_ticket_verifier_ok($row['code_challenge'], $codeVerifier)) {
        Response::error('소셜 가입 ticket 검증에 실패했습니다. 다시 시도해주세요.', 403);
    }

    $profile = api_social_signup_profile_from_row($row);
    if (empty($profile['identifier'])) {
        Response::error('소셜 프로필 정보가 올바르지 않습니다. 다시 시도해주세요.', 422);
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

    Response::success(api_social_signup_public_profile($row));
}

// -------------------------------------------------------------------------
// POST /v1/auth/social/link-existing
//
// 소셜 가입 화면의 "기존 계정에 연결하기" 흐름.
// social signup ticket 과 기존 회원 아이디/비밀번호를 확인한 뒤 해당 회원에
// 소셜 프로필을 연결하고 즉시 Next.js 로그인 token 을 발급한다.
// -------------------------------------------------------------------------
if ($action === 'social' && isset($apiSegments[1]) && $apiSegments[1] === 'link-existing'
    && $apiMethod === 'POST') {

    $input = get_request_body();
    $ticket = isset($input['social_signup_ticket'])
        ? trim((string) $input['social_signup_ticket'])
        : '';
    $mbId = isset($input['mb_id']) ? trim((string) $input['mb_id']) : '';
    $password = isset($input['mb_password']) ? (string) $input['mb_password'] : '';
    $codeVerifier = isset($input['social_code_verifier']) ? trim((string) $input['social_code_verifier']) : '';

    $errors = Validator::validate([
        'social_signup_ticket' => 'required',
        'mb_id'                => 'required',
        'mb_password'          => 'required',
    ], [
        'social_signup_ticket' => $ticket,
        'mb_id'                => $mbId,
        'mb_password'          => $password,
    ]);
    if ($errors) {
        Response::error('입력 정보를 확인해주세요.', 422, $errors);
    }

    list($socialSignupRow, $socialSignupProfile) = api_social_validate_signup_ticket($ticket, $codeVerifier);

    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $lockedMsg = Throttle::checkLoginAttempt($mbId, $ip);
    if ($lockedMsg !== null) {
        Response::error($lockedMsg, 429);
    }

    $memberTable = DB::table('member_table');
    $member = DB::fetch(
        "SELECT * FROM {$memberTable}
         WHERE mb_id = ?
         LIMIT 1",
        [$mbId]
    );

    if (!$member || empty($member['mb_id']) || !Auth::verifyPassword($password, $member['mb_password'])) {
        Throttle::recordLoginFailure($mbId, $ip);
        Response::error('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
    }

    Throttle::resetLoginAttempts($mbId, $ip);

    if (!empty($member['mb_leave_date'])) {
        Response::error('탈퇴 처리된 회원입니다.', 403);
    }
    if (!empty($member['mb_intercept_date'])) {
        Response::error('차단된 회원입니다.', 403);
    }

    $provider = (string) $socialSignupRow['provider'];
    $socialProfileTable = isset($g5['social_profile_table'])
        ? $g5['social_profile_table']
        : G5_TABLE_PREFIX . 'member_social_profiles';

    $alreadyProvider = DB::fetch(
        "SELECT mp_no FROM {$socialProfileTable}
         WHERE provider = ? AND mb_id = ?
         LIMIT 1",
        [$provider, (string) $member['mb_id']]
    );
    if ($alreadyProvider) {
        Response::error(
            '해당 계정에 이미 ' . nextjs25_social_provider_label($provider) . ' 계정이 연결되어 있습니다.',
            409
        );
    }

    // 그누보드 훅 — 소셜 로그인도 원본 login_check.php 처럼 $is_social_login = true 로. 플러그인이 막으면
    // ticket 을 쓰기 전에 멈춘다(사용자가 다시 시도할 수 있게).
    api_run_before_event('login_session_before', array($member, true), $member);

    // 연결하기 전에 ticket 을 잡는다 — 같은 ticket 으로 두 계정에 연결되지 않게.
    api_social_claim_signup_ticket($socialSignupRow);
    social_user_profile_replace(
        (string) $member['mb_id'],
        $provider,
        api_social_profile_to_object($socialSignupProfile)
    );

    $refresh = RefreshToken::issue(
        (string) $member['mb_id'],
        'social-link:' . $provider,
        isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null,
        $ip
    );
    $sessionId = RefreshToken::sessionOf($refresh);
    $token = Auth::generateToken($member, $sessionId);
    api_auth_set_session_cookies($token, $refresh, false);
    api_auth_open_php_session($member, $sessionId);
    api_run_event('member_login_check', array($member, '', true), $member);

    Response::success(api_auth_with_merged_cart([
        'token'         => $token,
        'refresh_token' => $refresh,
        'expires_in'    => JWT_EXPIRE_SECONDS,
        'member'        => api_auth_member_payload($member),
    ], $member));
}

// -------------------------------------------------------------------------
// POST /v1/auth/social/exchange  - 모바일 소셜 로그인 ticket → JWT 교환
//
// 흐름:
//   1) 앱이 WebBrowser 로 /api/social/start.php?provider=naver&code_challenge=… 열기
//   2) start.php → /api/social/popup.php 가 그누보드 social 어댑터로 OAuth 를 마치고
//   3) popup.php 가 ticket(+code_challenge) 발급 + dday-app://...?ticket=XXX 로 deep-link
//   4) 앱이 ticket 과 code_verifier 를 이 엔드포인트로 보내 JWT 와 교환
//
// 웹(Next.js 테마)도 같은 ticket 교환 엔드포인트를 재사용하되 challenge 를 보내지
// 않으므로 verifier 없이 통과한다. (finish.php 는 popup.php 가 직접 되돌리는 지금
// 구조에서는 도달하지 않는 옛 경로다.)
// -------------------------------------------------------------------------
if ($action === 'social' && isset($apiSegments[1]) && $apiSegments[1] === 'exchange'
    && $apiMethod === 'POST') {

    $input  = get_request_body();
    $ticket = isset($input['ticket']) ? trim((string) $input['ticket']) : '';
    $codeVerifier = isset($input['code_verifier']) ? trim((string) $input['code_verifier']) : '';

    if ($ticket === '' || !preg_match('/^[a-f0-9]{32,128}$/i', $ticket)) {
        Response::error('Invalid ticket.', 422, ['ticket' => '잘못된 인증 ticket 입니다.']);
    }

    $ticketTable = G5_TABLE_PREFIX . 'social_mobile_ticket';
    nextjs25_social_ensure_mobile_ticket_table();
    $row = DB::fetch(
        "SELECT ticket_id, mb_id, provider, code_challenge, expires_at, used_at
         FROM {$ticketTable}
         WHERE ticket = ? LIMIT 1",
        [$ticket]
    );

    // 없음 · 사용됨 · 만료를 같은 응답으로 — 어느 쪽인지로 티켓을 더듬지 못하게(교환 단계의 410 과 같은 문구).
    if (!$row || !empty($row['used_at']) || strtotime($row['expires_at']) < time()) {
        Response::error('Ticket already used or expired.', 410);
    }
    // PKCE: 앱이 start.php 에 challenge 를 보냈던 ticket 은 짝이 되는 verifier 가 있어야
    // 쓸 수 있다. 콜백 URL 을 가로챈 다른 앱은 ticket 은 있어도 verifier 가 없다.
    // 실패해도 ticket 은 소비하지 않는다 — 정상 앱이 곧 verifier 와 함께 올 수 있다.
    if (!nextjs25_social_ticket_verifier_ok($row['code_challenge'], $codeVerifier)) {
        Response::error('Ticket verification failed.', 403);
    }

    $memberTable = DB::table('member_table');
    $member = DB::fetch(
        "SELECT * FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
        [$row['mb_id']]
    );
    if (!$member || !$member['mb_id']) {
        Response::error('Member not found.', 404);
    }
    // 비밀번호 로그인·link-existing 과 같은 기준. 여기만 빠져 있어서
    // 탈퇴·차단된 회원에게도 JWT 가 발급되던 것을 막는다.
    if (!empty($member['mb_leave_date'])) {
        Response::error('탈퇴 처리된 회원입니다.', 403);
    }
    if (!empty($member['mb_intercept_date'])) {
        Response::error('차단된 회원입니다.', 403);
    }

    // 그누보드 훅 — 소셜 로그인도 원본 login_check.php 처럼 $is_social_login = true 로. 플러그인이 막으면
    // ticket 을 쓰기 전에 멈춘다(사용자가 다시 시도할 수 있게).
    api_run_before_event('login_session_before', array($member, true), $member);

    // Ticket 일회성 — 즉시 used_at 마킹.
    $claimed = DB::execute(
        "UPDATE {$ticketTable}
            SET used_at = NOW()
          WHERE ticket_id = ?
            AND used_at IS NULL
            AND expires_at >= NOW()",
        [$row['ticket_id']]
    );
    if ($claimed !== 1) {
        Response::error('Ticket already used or expired.', 410);
    }

    // 만료된 ticket 청소 (lazy GC — 이번 요청에서 한 번씩 오래된 것 정리).
    DB::execute(
        "DELETE FROM {$ticketTable} WHERE expires_at < (NOW() - INTERVAL 1 HOUR)"
    );

    $refresh = RefreshToken::issue(
        $member['mb_id'],
        !empty($row['provider']) ? 'social:' . (string) $row['provider'] : 'social',
        isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null,
        isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : null
    );
    $sessionId = RefreshToken::sessionOf($refresh);
    $token = Auth::generateToken($member, $sessionId);
    api_auth_set_session_cookies($token, $refresh, false);
    api_auth_open_php_session($member, $sessionId);
    api_run_event('member_login_check', array($member, '', true), $member);
    Response::success(api_auth_with_merged_cart([
        'token'         => $token,
        'refresh_token' => $refresh,
        'expires_in'    => JWT_EXPIRE_SECONDS,
        'member'        => api_auth_member_payload($member),
    ], $member));
}

// -------------------------------------------------------------------------
// POST /v1/auth/password-reset
// Secure handler: never returns reset tokens from the unauthenticated
// email request path.
// -------------------------------------------------------------------------
if ($action === 'password-reset' && $apiMethod === 'POST') {
    $input = get_request_body();
    $step = isset($input['step']) ? (string) $input['step'] : 'request';
    $memberTable = DB::table('member_table');

    if ($step === 'request') {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
        $enumMsg = Throttle::checkEnumProbe($ip);
        if ($enumMsg !== null) {
            Response::error($enumMsg, 429);
        }

        $mbId = isset($input['mb_id']) ? trim((string) $input['mb_id']) : '';
        $mbEmail = isset($input['mb_email']) ? trim((string) $input['mb_email']) : '';
        if ($mbId !== '' && Validator::email($mbEmail)) {
            $member = DB::fetch(
                "SELECT mb_id, mb_email FROM {$memberTable}
                 WHERE mb_id = ? AND mb_email = ? AND mb_leave_date = '' AND mb_intercept_date = ''
                 LIMIT 1",
                [$mbId, $mbEmail]
            );

            if ($member && !empty($member['mb_id'])) {
                $nonce = bin2hex(random_bytes(16));
                $nonceHash = hash('sha256', $nonce);
                DB::execute(
                    "UPDATE {$memberTable} SET mb_lost_certify = ? WHERE mb_id = ?",
                    [$nonceHash, $member['mb_id']]
                );

                $resetToken = JWT::encode([
                    'mb_id' => $member['mb_id'],
                    'purpose' => 'password_reset',
                    'nonce' => $nonce,
                ], null, 600);
                api_auth_send_password_reset_mail($member, $resetToken);
                // 그누보드 훅(bbs/password_lost2.php) — 회원, 확인 값(nonce), 저장한 값(mb_lost_certify)
                api_run_event('password_lost2_after', array($member, $nonce, $nonceHash));
            }
        }

        api_auth_password_reset_generic_response();
    }

    if ($step === 'cert_request') {
        $g5Config = api_get_config();
        if (empty($g5Config['cf_cert_use']) || empty($g5Config['cf_cert_find'])) {
            Response::error('Identity verification password reset is disabled.', 403);
        }

        $certNo = isset($input['cert_no']) ? trim((string) $input['cert_no']) : '';
        $certType = isset($input['cert_type']) ? trim((string) $input['cert_type']) : '';
        $sessionCertNo = (string) get_session('ss_cert_no');
        $sessionCertType = (string) get_session('ss_cert_type');
        $sessionDupinfo = (string) get_session('ss_cert_dupinfo');

        if ($certNo === '' || $certType === '' || $sessionCertNo === '' || $sessionCertNo !== $certNo) {
            Response::error('Invalid or expired verification session.', 422);
        }
        if ($sessionCertType !== '' && $sessionCertType !== $certType) {
            Response::error('Verification type does not match.', 422);
        }
        if ($sessionDupinfo === '') {
            Response::error('Verification session is missing identity data.', 422);
        }

        $member = DB::fetch(
            "SELECT mb_id FROM {$memberTable}
             WHERE mb_dupinfo = ? AND mb_leave_date = '' AND mb_intercept_date = ''
             LIMIT 1",
            [$sessionDupinfo]
        );
        if (!$member || empty($member['mb_id'])) {
            Response::error('No matching member was found for this verification.', 404);
        }

        $nonce = bin2hex(random_bytes(16));
        $nonceHash = hash('sha256', $nonce);
        DB::execute(
            "UPDATE {$memberTable} SET mb_lost_certify = ? WHERE mb_id = ?",
            [$nonceHash, $member['mb_id']]
        );
        $resetToken = JWT::encode([
            'mb_id' => $member['mb_id'],
            'purpose' => 'password_reset',
            'nonce' => $nonce,
        ], null, 600);

        Response::success([
            'reset_token' => $resetToken,
            'message' => 'Identity verification is complete. Please set a new password.',
        ]);
    }

    if ($step === 'reset') {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
        $enumMsg = Throttle::checkEnumProbe($ip);
        if ($enumMsg !== null) {
            Response::error($enumMsg, 429);
        }

        // 그누보드 훅(bbs/password_lost_certify.php) — 새 비밀번호 확정 전
        api_run_before_event('password_lost_certify_before');

        $resetToken = isset($input['reset_token']) ? (string) $input['reset_token'] : '';
        $password = isset($input['mb_password']) ? (string) $input['mb_password'] : '';
        $passwordRe = isset($input['mb_password_re']) ? (string) $input['mb_password_re'] : '';
        if ($resetToken === '' || $password === '' || $passwordRe === '') {
            Response::error('Validation failed.', 422);
        }
        if ($password !== $passwordRe) {
            Response::error('Passwords do not match.', 422);
        }

        $payload = JWT::decode($resetToken);
        if (!$payload || empty($payload['mb_id']) || empty($payload['nonce']) || ($payload['purpose'] ?? '') !== 'password_reset') {
            Response::error('Invalid or expired reset token.', 401);
        }

        $mbId = (string) $payload['mb_id'];
        $passwordErrors = api_auth_password_policy_errors($password, $mbId);
        if ($passwordErrors) {
            Response::error('Validation failed.', 422, $passwordErrors);
        }

        $stored = DB::fetch(
            "SELECT mb_lost_certify FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
            [$mbId]
        );
        $storedNonce = (string) ($stored['mb_lost_certify'] ?? '');
        $expectedHash = hash('sha256', (string) $payload['nonce']);
        if ($storedNonce === '' || !hash_equals($storedNonce, $expectedHash)) {
            Response::error('Invalid or already used reset token.', 401);
        }

        DB::execute(
            "UPDATE {$memberTable} SET mb_password = ?, mb_lost_certify = '' WHERE mb_id = ?",
            [Auth::hashPassword($password), $mbId]
        );
        try {
            RefreshToken::revokeAllFor($mbId);
        } catch (\Throwable $e) {
            error_log('[api/auth] Failed to revoke refresh tokens after password reset: ' . $e->getMessage());
        }

        // 그누보드 훅 — 비밀번호를 바꾼 회원과 확인 값(nonce)
        $resetMember = DB::fetch("SELECT * FROM {$memberTable} WHERE mb_id = ? LIMIT 1", [$mbId]);
        if ($resetMember) {
            api_run_event('password_lost_certify_after', array($resetMember, (string) $payload['nonce']));
        }

        Response::success([
            'message' => 'Password has been changed.',
        ]);
    }

    Response::error('Invalid step parameter.', 400);
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Not found.', 404);
