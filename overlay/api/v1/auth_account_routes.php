<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if ($action === 'check-id' && $apiMethod === 'GET') {

    // Enum-위험 — IP 당 quota 적용. 초과 시 429.
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $enumMsg = Throttle::checkEnumProbe($ip);
    if ($enumMsg !== null) {
        Response::error($enumMsg, 429);
    }

    $mb_id = isset($_GET['mb_id']) ? trim((string) $_GET['mb_id']) : '';

    if ($mb_id === '') {
        Response::success([
            'available' => false,
            'message'   => '아이디를 입력해주세요.',
        ]);
    }

    if (strlen($mb_id) < 3) {
        Response::success([
            'available' => false,
            'message'   => '아이디는 3자 이상 입력해주세요.',
        ]);
    }

    if (strlen($mb_id) > 20) {
        Response::success([
            'available' => false,
            'message'   => '아이디는 20자 이하여야 합니다.',
        ]);
    }

    if (!preg_match('/^[a-z0-9_]+$/i', $mb_id)) {
        Response::success([
            'available' => false,
            'message'   => '아이디는 영문, 숫자, _ 만 사용할 수 있습니다.',
        ]);
    }

    // Reserved word check (uses gnuboard5 config.cf_prohibit_id)
    $config = api_get_config();
    $prohibit = isset($config['cf_prohibit_id']) ? (string) $config['cf_prohibit_id'] : '';
    if ($prohibit !== '' && preg_match('/[\,]?' . preg_quote($mb_id, '/') . '/i', $prohibit)) {
        Response::success([
            'available' => false,
            'message'   => '사용할 수 없는 아이디입니다.',
        ]);
    }

    $memberTable = DB::table('member_table');
    $exists = DB::fetch(
        "SELECT mb_id FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
        [$mb_id]
    );

    if ($exists && $exists['mb_id']) {
        Response::success([
            'available' => false,
            'message'   => '이미 사용 중인 아이디입니다.',
        ]);
    }

    Response::success([
        'available' => true,
        'message'   => '사용 가능한 아이디입니다.',
    ]);
}

// -------------------------------------------------------------------------
// GET /v1/auth/check-email?mb_email=xxx - Check mb_email availability
// -------------------------------------------------------------------------
if ($action === 'check-email' && $apiMethod === 'GET') {

    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $enumMsg = Throttle::checkEnumProbe($ip);
    if ($enumMsg !== null) {
        Response::error($enumMsg, 429);
    }

    $mb_email = isset($_GET['mb_email']) ? trim((string) $_GET['mb_email']) : '';

    if ($mb_email === '') {
        Response::success([
            'available' => false,
            'message'   => '이메일을 입력해주세요.',
        ]);
    }

    if (!Validator::email($mb_email)) {
        Response::success([
            'available' => false,
            'message'   => '올바른 이메일 주소를 입력해주세요.',
        ]);
    }

    // Prohibited email domain check (uses gnuboard5 config.cf_prohibit_email)
    $config = api_get_config();
    $prohibit = isset($config['cf_prohibit_email']) ? (string) $config['cf_prohibit_email'] : '';
    if ($prohibit !== '') {
        $domain = substr(strrchr($mb_email, '@'), 1);
        $blocked = preg_split('/[\s,]+/', $prohibit, -1, PREG_SPLIT_NO_EMPTY);
        if ($domain && $blocked && in_array(strtolower($domain), array_map('strtolower', $blocked), true)) {
            Response::success([
                'available' => false,
                'message'   => '사용할 수 없는 이메일 도메인입니다.',
            ]);
        }
    }

    $memberTable = DB::table('member_table');
    $exists = DB::fetch(
        "SELECT mb_id FROM {$memberTable} WHERE mb_email = ? LIMIT 1",
        [$mb_email]
    );

    if ($exists && $exists['mb_id']) {
        Response::success([
            'available' => false,
            'message'   => '이미 사용 중인 이메일입니다.',
        ]);
    }

    Response::success([
        'available' => true,
        'message'   => '사용 가능한 이메일입니다.',
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/auth/login
// -------------------------------------------------------------------------
if ($action === 'login' && $apiMethod === 'POST') {

    $input = get_request_body();

    // Validate required fields
    $errors = Validator::validate([
        'mb_id'       => 'required',
        'mb_password' => 'required',
    ], $input);

    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $mb_id     = (string) $input['mb_id'];
    $password  = (string) $input['mb_password'];
    $autoLogin = !empty($input['auto_login']) || !empty($input['remember']) || !empty($input['remember_me']);
    $ip        = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

    // Brute-force 차단 — 같은 (mb_id, ip) 가 5회 실패하면 15분 lock-out.
    // 아직 카운트 row 가 없는 첫 시도라면 즉시 통과.
    $lockedMsg = Throttle::checkLoginAttempt($mb_id, $ip);
    if ($lockedMsg !== null) {
        Response::error($lockedMsg, 429);
    }

    // Find member
    $sql = "SELECT * FROM " . DB::table('member_table') . "
            WHERE mb_id = ?
            LIMIT 1";
    $member = DB::fetch($sql, [$mb_id]);

    if (!$member || !$member['mb_id']) {
        Throttle::recordLoginFailure($mb_id, $ip);
        Response::error('Invalid member ID or password.', 401);
    }

    // Check password
    if (!Auth::verifyPassword($password, $member['mb_password'])) {
        Throttle::recordLoginFailure($mb_id, $ip);
        Response::error('Invalid member ID or password.', 401);
    }

    // 성공 — 카운터 초기화
    Throttle::resetLoginAttempts($mb_id, $ip);

    // 탈퇴한 회원은 복구하지 않는다. 탈퇴 시 개인정보가 즉시 삭제되므로(members.php DELETE /me)
    // 이 행에는 비밀번호도 없어 여기까지 오지 않지만, 명시적으로 막아 둔다.
    if (!empty($member['mb_leave_date'])) {
        Response::error('This account has been withdrawn.', 403);
    }

    // Check banned member
    if ($member['mb_intercept_date']) {
        Response::error('This account has been banned.', 403);
    }

    // Email verification gate (respects gnuboard5's cf_use_email_certify).
    $config = api_get_config();
    if (!empty($config['cf_use_email_certify'])) {
        $emailCertify = isset($member['mb_email_certify']) ? (string) $member['mb_email_certify'] : '';
        if ($emailCertify === '' || $emailCertify === '0000-00-00 00:00:00') {
            Response::error('이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해주세요.', 403, [
                'code'  => 'EMAIL_NOT_VERIFIED',
                'mb_id' => $member['mb_id'],
            ]);
        }
    }

    // Update login info
    $now = date('Y-m-d H:i:s');
    $ip  = $_SERVER['REMOTE_ADDR'];
    DB::execute("UPDATE " . DB::table('member_table') . "
                 SET mb_today_login = ?,
                     mb_login_ip    = ?
                 WHERE mb_id = ?", [$now, $ip, $mb_id]);

    // Generate access + refresh token
    $token = Auth::generateToken($member);
    $refresh = RefreshToken::issue(
        $member['mb_id'],
        isset($input['device_label']) ? (string) $input['device_label'] : null,
        isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null,
        $ip
    );

    // Build safe member data
    $memberData = api_auth_member_payload($member);
    api_auth_set_session_cookies($token, $refresh, $autoLogin);
    api_auth_open_php_session($member);

    Response::success(api_auth_with_merged_cart([
        'token'         => $token,
        'refresh_token' => $refresh,
        'expires_in'    => JWT_EXPIRE_SECONDS,
        'auto_login'    => $autoLogin ? 1 : 0,
        'member'        => $memberData,
    ], $member));
}

// -------------------------------------------------------------------------
// GET /v1/auth/register-result
// -------------------------------------------------------------------------
if ($action === 'register-result' && $apiMethod === 'GET') {
    $mbId = '';
    if (function_exists('get_session')) {
        $mbId = (string) get_session('ss_mb_reg');
    } elseif (isset($_SESSION['ss_mb_reg'])) {
        $mbId = (string) $_SESSION['ss_mb_reg'];
    }

    $mbId = trim($mbId);
    if ($mbId === '') {
        Response::error('Registration result session was not found.', 404);
    }

    $member = DB::fetch(
        "SELECT mb_id, mb_name, mb_nick, mb_email, mb_datetime
           FROM " . DB::table('member_table') . "
          WHERE mb_id = ?
          LIMIT 1",
        [$mbId]
    );

    if (!$member || empty($member['mb_id'])) {
        Response::error('Registered member was not found.', 404);
    }

    $config = api_get_config();
    $usesEmailCertify = function_exists('is_use_email_certify')
        ? (bool) is_use_email_certify()
        : !empty($config['cf_use_email_certify']);

    Response::success([
        'mb_id'                       => (string) $member['mb_id'],
        'mb_name'                     => (string) $member['mb_name'],
        'mb_nick'                     => (string) $member['mb_nick'],
        'mb_email'                    => (string) $member['mb_email'],
        'mb_datetime'                 => (string) $member['mb_datetime'],
        'requires_email_verification' => $usesEmailCertify,
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/auth/register
// -------------------------------------------------------------------------
if ($action === 'register' && $apiMethod === 'POST') {

    $input = get_request_body();
    $socialSignupTicket = isset($input['social_signup_ticket'])
        ? trim((string) $input['social_signup_ticket'])
        : '';
    $socialCodeVerifier = isset($input['social_code_verifier'])
        ? trim((string) $input['social_code_verifier'])
        : '';
    $isSocialSignup = $socialSignupTicket !== '';
    $socialSignupRow = null;
    $socialSignupProfile = null;

    if ($isSocialSignup) {
        list($socialSignupRow, $socialSignupProfile) = api_social_validate_signup_ticket(
            $socialSignupTicket,
            $socialCodeVerifier
        );

        $input['mb_id'] = api_social_suggest_member_id($socialSignupProfile);
        $input['mb_password'] = api_social_generate_member_password();
        $input['mb_password_re'] = $input['mb_password'];

        if (empty($input['mb_nick'])) {
            $input['mb_nick'] = api_social_suggest_nick($socialSignupProfile);
        }
        if (empty($input['mb_name'])) {
            $input['mb_name'] = (string) (
                $socialSignupProfile['username']
                ?? $socialSignupProfile['displayName']
                ?? $input['mb_nick']
            );
        }
        if (empty($input['mb_email']) && !empty($socialSignupProfile['email'])) {
            $input['mb_email'] = (string) $socialSignupProfile['email'];
        }
    }

    // Validate required fields
    $rules = [
        'mb_nick'        => 'required|min:2|max:20',
        'mb_name'        => 'required|min:2|max:20',
        'mb_email'       => 'required|email',
    ];
    if (!$isSocialSignup) {
        $rules = array_merge([
            'mb_id'          => 'required|min:3|max:20',
            'mb_password'    => 'required|min:8|max:64',
            'mb_password_re' => 'required',
        ], $rules);
    }

    $errors = Validator::validate($rules, $input);

    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    // 비밀번호 강도: 최소 8자 + 영문/숫자 조합 + (선택)특수문자.
    // 너무 빡빡하면 사용자 거부감 — 영문+숫자만 필수, 특수문자는 가산점.
    $pw = (string) $input['mb_password'];
    if (!$isSocialSignup) {
        $passwordErrors = api_auth_password_policy_errors($pw, (string) $input['mb_id']);
        if ($passwordErrors) {
            Response::error('Validation failed.', 422, $passwordErrors);
        }

        $hasLetter = preg_match('/[A-Za-z]/', $pw);
        $hasDigit  = preg_match('/\d/', $pw);
        if (!$hasLetter || !$hasDigit) {
            Response::error('Validation failed.', 422, [
                'mb_password' => '비밀번호는 영문과 숫자를 모두 포함해야 합니다.',
            ]);
        }
        // 흔한 약한 비번 거부 (간단 블랙리스트)
        $WEAK = ['password', '12345678', 'qwerty12', 'asdf1234', '1234abcd', 'abcd1234', 'admin123'];
        if (in_array(strtolower($pw), $WEAK, true)) {
            Response::error('Validation failed.', 422, [
                'mb_password' => '너무 흔한 비밀번호입니다. 다른 비밀번호를 입력해주세요.',
            ]);
        }
        // mb_id 와 동일하거나 포함된 비번도 거부
        if (stripos($pw, (string) $input['mb_id']) !== false) {
            Response::error('Validation failed.', 422, [
                'mb_password' => '비밀번호에 아이디를 포함하지 마세요.',
            ]);
        }
    }

    // 약관/개인정보 동의 필수.
    // 이용약관과 개인정보처리방침을 명시적으로 동의해야 가입 가능.
    $agreeTerms   = !empty($input['agree_terms']);
    $agreePrivacy = !empty($input['agree_privacy']);
    if (!$agreeTerms || !$agreePrivacy) {
        Response::error('Validation failed.', 422, [
            'agree_terms'   => $agreeTerms ? '' : '이용약관에 동의해주세요.',
            'agree_privacy' => $agreePrivacy ? '' : '개인정보처리방침에 동의해주세요.',
        ]);
    }

    // Public password registration must pass captcha. Social signup already has
    // a verified OAuth profile ticket and follows gnuboard's captcha-free flow.
    if (!$isSocialSignup) {
        $captchaInput = isset($input['captcha_key']) ? trim((string) $input['captcha_key']) : '';
        if ($captchaInput === '') {
            Response::error('Validation failed.', 422, [
                'captcha_key' => '자동등록방지 문자를 입력해주세요.',
            ]);
        }

        $captchaCount = (int) get_session('ss_captcha_count');
        if ($captchaCount > 5) {
            Response::error('자동등록방지 시도 횟수를 초과했습니다. 새로고침해 주세요.', 429, [
                'captcha_key' => '자동등록방지 새로고침이 필요합니다.',
            ]);
        }

        $encryptedInput = $captchaInput;
        if (function_exists('get_string_encrypt')) {
            $ip = md5(sha1($_SERVER['REMOTE_ADDR']));
            $encryptedInput = get_string_encrypt($ip . $captchaInput);
        }

        if ($encryptedInput !== get_session('ss_captcha_key')) {
            $_SESSION['ss_captcha_count'] = $captchaCount + 1;
            Response::error('자동등록방지 문자가 일치하지 않습니다.', 422, [
                'captcha_key' => '자동등록방지 문자를 다시 확인해주세요.',
            ]);
        }

        // Invalidate captcha after successful use to prevent reuse
        set_session('ss_captcha_key', '');
        set_session('ss_captcha_count', 0);
    }

    // Check password match
    if ($input['mb_password'] !== $input['mb_password_re']) {
        Response::error('Passwords do not match.', 422, [
            'mb_password_re' => 'mb_password_re must match mb_password.',
        ]);
    }

    // Validate mb_id format (alphanumeric + underscore)
    if (!preg_match('/^[a-z0-9_]+$/i', $input['mb_id'])) {
        Response::error('Validation failed.', 422, [
            'mb_id' => 'mb_id may only contain letters, numbers, and underscores.',
        ]);
    }

    $mb_id    = $input['mb_id'];
    $mb_nick  = $input['mb_nick'];
    $mb_name  = $input['mb_name'];
    $mb_email = $input['mb_email'];

    // 본인인증 (옵션) — 앱은 cert_token, 웹 프런트는 cert_no(같은 세션). 검증·중복 가입 차단은 auth_cert_helpers.php.
    // 인증했으면 이름·휴대폰은 인증값으로 저장하고, 생년월일·성인 여부는 입력값을 받지 않는다.
    $cert        = api_auth_register_cert($input);
    $mbCertified = $cert['certified'];
    $mbHp        = $cert['hp'] ?? (isset($input['mb_hp']) ? trim((string) $input['mb_hp']) : '');
    $mbBirth     = $cert['birth'];
    $mbAdult     = $cert['adult'];
    $mbSex       = $cert['sex'];
    $mbDupinfo   = $cert['dupinfo'];
    if ($cert['name'] !== null) {
        $mb_name = $cert['name'];
    }

    $memberTable = DB::table('member_table');

    // Check duplicate mb_id
    $exists = DB::fetch(
        "SELECT mb_id FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
        [$mb_id]
    );
    if ($exists && $exists['mb_id']) {
        Response::error('This member ID is already taken.', 409, [
            'mb_id' => 'mb_id already exists.',
        ]);
    }

    // Check duplicate mb_nick
    $exists = DB::fetch(
        "SELECT mb_id FROM {$memberTable} WHERE mb_nick = ? LIMIT 1",
        [$mb_nick]
    );
    if ($exists && $exists['mb_id']) {
        Response::error('This nickname is already taken.', 409, [
            'mb_nick' => 'mb_nick already exists.',
        ]);
    }

    // Check duplicate mb_email
    $exists = DB::fetch(
        "SELECT mb_id FROM {$memberTable} WHERE mb_email = ? LIMIT 1",
        [$mb_email]
    );
    if ($exists && $exists['mb_id']) {
        Response::error('This email is already registered.', 409, [
            'mb_email' => 'mb_email already exists.',
        ]);
    }

    // Get default member level from config
    $config = api_get_config();
    $defaultLevel = isset($config['cf_register_level']) ? (int) $config['cf_register_level'] : 2;
    $defaultLevel = max(1, min(9, $defaultLevel));
    $useEmailCertify = !empty($config['cf_use_email_certify']);

    if (!empty($config['cf_cert_use']) && !empty($config['cf_cert_req']) && $mbCertified === '') {
        Response::error('본인확인을 완료해 주세요.', 422, [
            'cert_no' => '본인확인이 필수입니다.',
        ]);
    }

    // Hash password
    $hashedPassword = Auth::hashPassword($input['mb_password']);

    $today   = date('Y-m-d');
    $nowDate = date('Y-m-d H:i:s');
    $ip      = $_SERVER['REMOTE_ADDR'];

    // Email-verification token: required when cf_use_email_certify is on. Stored
    // in mb_email_certify2; mb_email_certify stays at zero-date until confirmed.
    $emailCertify2 = $useEmailCertify ? bin2hex(random_bytes(16)) : '';
    $emailCertify  = $useEmailCertify ? '0000-00-00 00:00:00' : $nowDate;

    // mb_open flag (profile visibility) — accept from input, default closed.
    $mbOpen = !empty($input['mb_open']) ? 1 : 0;
    $mbOpenDate = $today;

    // 추천인 — 비어있으면 무시. 존재 검증 후 mb_recommend 에 저장.
    $mbRecommend = '';
    if (!empty($input['mb_recommend'])) {
        $candidate = trim((string) $input['mb_recommend']);
        if ($candidate !== '' && $candidate !== $mb_id) {
            $rec = DB::fetch(
                "SELECT mb_id FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
                [$candidate]
            );
            if ($rec) {
                $mbRecommend = $rec['mb_id'];
            }
        }
    }

    // 소셜 가입 ticket 은 회원을 만들기 전에 잡는다. 같은 ticket 으로 동시에 두 번
    // 가입하면 두 번째는 여기서 410 으로 끝나고 회원은 하나만 생긴다.
    if ($socialSignupRow && $socialSignupProfile) {
        api_social_claim_signup_ticket($socialSignupRow);
    }

    // Match Gnuboard's normal registration flow and avoid zero-date inserts
    // because strict MySQL modes reject 0000-00-00 values.
    DB::execute(
        "INSERT INTO {$memberTable}
            (mb_id, mb_password, mb_nick, mb_nick_date, mb_name, mb_email,
             mb_level, mb_point, mb_datetime, mb_today_login,
             mb_open, mb_open_date,
             mb_signature, mb_memo, mb_lost_certify, mb_profile, mb_agree_log,
             mb_email_certify, mb_email_certify2,
             mb_recommend,
             mb_hp, mb_birth, mb_certify, mb_adult, mb_sex, mb_dupinfo,
             mb_login_ip, mb_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $mb_id, $hashedPassword, $mb_nick, $today, $mb_name, $mb_email,
            $defaultLevel, 0, $nowDate, $nowDate,
            $mbOpen, $mbOpenDate,
            '', '', '', '', '',
            $emailCertify, $emailCertify2,
            $mbRecommend,
            $mbHp, $mbBirth, $mbCertified, $mbAdult, $mbSex, $mbDupinfo,
            '', $ip,
        ]
    );

    // Gnuboard's register-point: mb_point is derived from g5_point via
    // insert_point(), which is the single source of truth. Never write
    // mb_point directly — it would desync from the point ledger.
    $registerPoint = isset($config['cf_register_point']) ? (int) $config['cf_register_point'] : 0;
    if ($registerPoint !== 0 && function_exists('insert_point')) {
        insert_point($mb_id, $registerPoint, '회원가입 축하', '@member', $mb_id, '회원가입');
    }

    // 추천인 적립 — cf_recommend_point 만큼 추천인에게 지급. rel_action 에 가입자
    // mb_id 를 넣어 idempotent (동일 추천 1회만 적립). 그누보드 표준과 동일.
    if ($mbRecommend !== '' && function_exists('insert_point')) {
        $recommendPoint = isset($config['cf_recommend_point']) ? (int) $config['cf_recommend_point'] : 0;
        if ($recommendPoint > 0) {
            insert_point(
                $mbRecommend, $recommendPoint,
                $mb_id . '님의 추천인',
                '@member', $mb_id, $mb_id . ' 추천'
            );
        }
    }

    // Fetch the newly created member
    $member = DB::fetch(
        "SELECT * FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
        [$mb_id]
    );

    if (!$member || !$member['mb_id']) {
        Response::error('Failed to create member account.', 500);
    }

    if (function_exists('set_session')) {
        set_session('ss_mb_reg', $mb_id);
    } else {
        $_SESSION['ss_mb_reg'] = $mb_id;
    }

    if ($socialSignupRow && $socialSignupProfile) {
        $profileObject = api_social_profile_to_object($socialSignupProfile);
        social_user_profile_replace($mb_id, (string) $socialSignupRow['provider'], $profileObject);
    }

    // When email verification is required, send the certify mail and defer
    // JWT issuance until the user confirms via /v1/auth/verify-email.
    if ($useEmailCertify) {
        if (function_exists('mailer')) {
            $siteName = isset($config['cf_title']) ? $config['cf_title'] : '';
            $fromMail = isset($config['cf_admin_email']) ? $config['cf_admin_email'] : '';
            $verifyUrl = defined('G5_URL')
                ? G5_URL . '/api/v1/auth/verify-email?mb_id=' . urlencode($mb_id) . '&token=' . urlencode($emailCertify2)
                : '';
            $subject = '[' . $siteName . '] 회원가입 이메일 인증';
            $body = '아래 링크를 클릭해 이메일 인증을 완료해주세요.' . "\n\n" . $verifyUrl;
            @mailer($siteName, $fromMail, $mb_email, $subject, $body, 0);
        }

        Response::success([
            'requires_email_verification' => true,
            'mb_id'                       => $mb_id,
            'registration_result_url'     => '/register/result',
            'message'                     => '가입이 접수되었습니다. 이메일 인증 후 로그인할 수 있습니다.',
        ], 201);
    }

    // Generate access + refresh token
    $token = Auth::generateToken($member);
    $refresh = RefreshToken::issue(
        $member['mb_id'],
        'register',
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
        'registration_result_url' => '/register/result',
    ], $member), 201);
}

// -------------------------------------------------------------------------
// GET/POST /v1/auth/verify-email - Confirm email certification token
// -------------------------------------------------------------------------
if ($action === 'verify-email' && ($apiMethod === 'GET' || $apiMethod === 'POST')) {

    $src = $apiMethod === 'GET' ? $_GET : get_request_body();
    $mb_id = isset($src['mb_id']) ? trim((string) $src['mb_id']) : '';
    $token = isset($src['token']) ? trim((string) $src['token']) : '';

    if ($mb_id === '' || $token === '') {
        Response::error('잘못된 요청입니다.', 400);
    }

    $memberTable = DB::table('member_table');
    $member = DB::fetch(
        "SELECT mb_id, mb_email_certify, mb_email_certify2 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
        [$mb_id]
    );

    if (!$member || !$member['mb_id']) {
        Response::error('회원 정보를 찾을 수 없습니다.', 404);
    }

    // Already verified → idempotent success
    if (!empty($member['mb_email_certify']) && $member['mb_email_certify'] !== '0000-00-00 00:00:00') {
        Response::success(['message' => '이미 인증된 이메일입니다.']);
    }

    $stored = (string) $member['mb_email_certify2'];
    if ($stored === '' || !hash_equals($stored, $token)) {
        Response::error('유효하지 않은 인증 정보입니다.', 401);
    }

    DB::execute(
        "UPDATE {$memberTable} SET mb_email_certify = ?, mb_email_certify2 = '' WHERE mb_id = ?",
        [date('Y-m-d H:i:s'), $mb_id]
    );

    Response::success(['message' => '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.']);
}

// -------------------------------------------------------------------------
// GET /v1/auth/me
// -------------------------------------------------------------------------
