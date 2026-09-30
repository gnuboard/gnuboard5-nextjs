<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/members_helpers.php'; // api_member_legal_consent()

if ($action === 'me' && $apiMethod === 'GET') {

    $member = Auth::getUser();
    if (!$member) {
        $member = api_auth_member_from_refresh_cookie();
    }
    if (!$member) {
        if (api_auth_has_bearer_header()) {
            Response::error('Unauthorized. Please provide a valid access token.', 401);
        }

        Response::success([
            'member' => null,
            'authenticated' => false,
            'is_super_admin' => false,
        ]);
    }

    Response::success([
        'member' => api_auth_member_payload($member),
        'authenticated' => true,
        // 'super' | '' — 게시판 컨텍스트가 없는 자리(헤더 등)에서 즉시 판단 가능.
        // group/board admin은 board 컨텍스트가 있어야 하므로 단건 글 응답에 포함.
        'is_super_admin' => Auth::adminRole($member) === 'super',
        // 앱이 약관 동의 화면을 띄울지 판단하는 데 쓴다 (버전이 다르면 다시 받음).
        'legal_consent' => api_member_legal_consent((string) $member['mb_id']),
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/auth/refresh
// -------------------------------------------------------------------------
if ($action === 'refresh' && $apiMethod === 'POST') {

    // 두 가지 흐름 지원:
    //  (a) body 에 refresh_token 이 있으면 그걸로 rotation (권장)
    //  (b) refresh_token 없으면 Authorization access token 만으로 갱신 (legacy 호환)
    $input = get_request_body();
    $rawRefresh = isset($input['refresh_token']) ? trim((string) $input['refresh_token']) : '';
    if ($rawRefresh === '' && !empty($_COOKIE['g5_refresh'])) {
        $rawRefresh = trim((string) $_COOKIE['g5_refresh']);
    }
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null;
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : null;

    if ($rawRefresh !== '') {
        $result = RefreshToken::exchange($rawRefresh, $ua, $ip);
        if (!$result) {
            api_auth_clear_session_cookies();
            Response::error('Invalid or expired refresh token.', 401);
        }

        $member = DB::fetch(
            "SELECT * FROM " . DB::table('member_table') . " WHERE mb_id = ? LIMIT 1",
            [$result['mb_id']]
        );
        if (!$member || !$member['mb_id']) {
            api_auth_clear_session_cookies();
            Response::error('Member not found.', 401);
        }
        if ($member['mb_leave_date'] || $member['mb_intercept_date']) {
            // 탈퇴/차단 회원의 refresh 거부 + revoke all
            RefreshToken::revokeAllFor($member['mb_id']);
            api_auth_clear_session_cookies();
            Response::error('Account is not active.', 403);
        }

        $token = Auth::generateToken($member);
        $autoLoginCookie = !empty($_COOKIE['g5_auto_login']) && (string) $_COOKIE['g5_auto_login'] === '1';
        api_auth_set_session_cookies($token, $result['new_refresh'], $autoLoginCookie);
        Response::success([
            'token'         => $token,
            'refresh_token' => $result['new_refresh'],
            'expires_in'    => JWT_EXPIRE_SECONDS,
            'member'        => api_auth_member_payload($member),
        ]);
    }

    // Legacy fallback — Authorization header 만 있을 때
    $member = Auth::requireAuth();
    $token = Auth::generateToken($member);
    if (!empty($_COOKIE['g5_refresh'])) {
        api_auth_set_cookie(
            'g5_token',
            $token,
            defined('JWT_EXPIRE_SECONDS') ? (int) JWT_EXPIRE_SECONDS : 1800,
            true
        );
    }
    Response::success([
        'token'      => $token,
        'expires_in' => JWT_EXPIRE_SECONDS,
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/auth/logout
// -------------------------------------------------------------------------
if ($action === 'logout' && $apiMethod === 'POST') {

    // body 에 refresh_token 이 있으면 단건 revoke.
    // all=true 이면 해당 회원의 모든 refresh token revoke (전체 기기 로그아웃).
    $input = get_request_body();
    $raw   = isset($input['refresh_token']) ? trim((string) $input['refresh_token']) : '';
    if ($raw === '' && !empty($_COOKIE['g5_refresh'])) {
        $raw = trim((string) $_COOKIE['g5_refresh']);
    }
    $all   = !empty($input['all']);

    $revoked = 0;
    if ($all) {
        $member = Auth::getUser();
        if ($member && !empty($member['mb_id'])) {
            $revoked = RefreshToken::revokeAllFor((string) $member['mb_id']);
        }
    } elseif ($raw !== '') {
        $revoked = RefreshToken::revoke($raw) ? 1 : 0;
    }
    api_auth_clear_session_cookies();
    api_auth_close_php_session();

    Response::success([
        'message' => 'Logged out.',
        'revoked' => $revoked,
    ]);
}

// -------------------------------------------------------------------------
// GET  /v1/auth/preferences — 회원 환경설정 조회 (locale, tz, notify_* 여섯 개)
// PATCH /v1/auth/preferences — 부분 갱신: 보낸 키만 바꾸고 전체 설정을 돌려준다
//
// 앱은 언어를 바꿀 때 {locale, tz} 만, 알림 스위치를 누를 때 {notify_comment: false} 처럼
// 키 하나만 보낸다. 행이 없는 회원도 GET 은 기본값(전부 true)을 채워서 준다.
// 플래그의 뜻: 푸시(Expo)만 막는다. 알림함(notification_log)에는 그대로 남는다.
// 값 검증은 plugin/webapp/notify/Prefs.php 한 곳에서 한다.
// -------------------------------------------------------------------------
if ($action === 'preferences') {
    $member = Auth::requireAuth();
    $mb_id  = (string) $member['mb_id'];
    if (!class_exists('NotifyPrefs')) {
        Response::error('Notification preferences are unavailable on this install (plugin/webapp/notify/Prefs.php missing).', 501);
    }

    if ($apiMethod === 'GET') {
        Response::success(NotifyPrefs::get($mb_id));
    }

    if ($apiMethod === 'PATCH' || $apiMethod === 'POST') {
        $input = get_request_body();
        if (!is_array($input)) {
            Response::error('Validation failed.', 422, ['body' => 'JSON 객체여야 합니다.']);
        }
        $result = NotifyPrefs::update($mb_id, $input);
        if ($result['errors']) {
            Response::error('Validation failed.', 422, $result['errors']);
        }
        Response::success($result['prefs']);
    }

    Response::error('Method not allowed.', 405);
}

// -------------------------------------------------------------------------
// GET  /v1/auth/sessions         - List active refresh-token sessions
// POST /v1/auth/sessions/revoke  - Revoke one session by token_id
// -------------------------------------------------------------------------
if ($action === 'sessions') {
    $member = Auth::requireAuth();
    $mb_id = (string) $member['mb_id'];
    $subAction = isset($apiSegments[1]) ? (string) $apiSegments[1] : '';

    if ($apiMethod === 'GET' && $subAction === '') {
        $sessions = array_map(static function ($row) {
            return [
                'token_id'     => (int) ($row['token_id'] ?? 0),
                'device_label' => (string) ($row['device_label'] ?? ''),
                'user_agent'   => (string) ($row['user_agent'] ?? ''),
                'ip'           => (string) ($row['ip'] ?? ''),
                'created_at'   => (string) ($row['created_at'] ?? ''),
                'expires_at'   => (string) ($row['expires_at'] ?? ''),
                'last_used_at' => (string) ($row['last_used_at'] ?? ''),
            ];
        }, RefreshToken::activeSessionsFor($mb_id));

        Response::success([
            'sessions' => $sessions,
        ]);
    }

    if ($apiMethod === 'POST' && $subAction === 'revoke') {
        $input = get_request_body();
        $tokenId = isset($input['token_id']) ? (int) $input['token_id'] : 0;
        if ($tokenId <= 0) {
            Response::error('Invalid session id.', 422, ['token_id' => 'token_id is required.']);
        }

        Response::success([
            'revoked' => RefreshToken::revokeForMemberById($mb_id, $tokenId),
        ]);
    }

    Response::error('Not Found', 404);
}

// -------------------------------------------------------------------------
// GET /v1/auth/cert/config - 본인인증(통합인증) 설정 노출
//
// 그누보드5 admin cf_cert_* 설정에서 어떤 본인인증 방식이 활성화돼 있는지
// 반환. Next.js register/find 화면이 본인인증 버튼을 노출할지 결정할 때 사용.
// -------------------------------------------------------------------------
