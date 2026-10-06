<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

// 메일 인증 라우트(인증 링크 확인 · 인증 메일 다시 보내기) — auth.php 가 auth_account_routes.php 다음에 읽는다.

// -------------------------------------------------------------------------
// GET/POST /v1/auth/verify-email - Confirm email certification token
// -------------------------------------------------------------------------
if ($action === 'verify-email' && ($apiMethod === 'GET' || $apiMethod === 'POST')) {

    $src = $apiMethod === 'GET' ? $_GET : get_request_body();
    $mb_id = isset($src['mb_id']) ? trim((string) $src['mb_id']) : '';
    $token = isset($src['token']) ? trim((string) $src['token']) : '';

    // 메일 링크를 브라우저로 연 경우(GET + text/html)는 JSON 대신 웹 로그인 화면으로 보내 결과를 보여 준다.
    // 웹 화면이 없는 설치본(앱 전용 등)이면 빈 문자열이라 예전처럼 JSON 으로 답한다.
    $verifyPageFor = function (string $status) use ($apiMethod): string {
        $accept = isset($_SERVER['HTTP_ACCEPT']) ? (string) $_SERVER['HTTP_ACCEPT'] : '';
        return ($apiMethod === 'GET' && stripos($accept, 'text/html') !== false)
            ? api_auth_email_verify_page_url($status)
            : '';
    };
    $finish = function (string $status, string $message, int $httpStatus, string $code = '') use ($verifyPageFor): void {
        $page = $verifyPageFor($status);
        if ($page !== '') {
            header('Cache-Control: no-store');
            header('Location: ' . $page, true, 302);
            exit;
        }
        if ($httpStatus < 400) {
            Response::success(['message' => $message, 'status' => $status]);
        }
        Response::error($message, $httpStatus, $code !== '' ? ['code' => $code] : null);
    };

    if ($mb_id === '' || $token === '') {
        $finish('invalid', '잘못된 요청입니다.', 400);
    }

    $memberTable = DB::table('member_table');
    $member = DB::fetch(
        "SELECT mb_id, mb_datetime, mb_email_certify, mb_email_certify2, mb_leave_date, mb_intercept_date
           FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
        [$mb_id]
    );

    if (!$member || !$member['mb_id']) {
        $finish('invalid', '회원 정보를 찾을 수 없습니다.', 404);
    }

    // Already verified → idempotent success
    if (!empty($member['mb_email_certify']) && $member['mb_email_certify'] !== '0000-00-00 00:00:00') {
        $finish('already', '이미 인증된 이메일입니다.', 200);
    }

    $stored = (string) $member['mb_email_certify2'];
    $check = api_email_certify_check($token, $stored, (string) $member['mb_datetime']);
    if ($check === 'invalid') {
        $finish('invalid', '유효하지 않은 인증 정보입니다.', 401);
    }

    // 원본 bbs/email_certify.php 처럼 탈퇴 · 차단 회원은 인증하지 않는다(원본 정리 작업이 기한 넘긴 미인증 회원을 탈퇴 처리한다).
    // 토큰을 맞힌 뒤에만 알려 줘야 아무 아이디로나 탈퇴 · 차단 여부를 떠볼 수 없다.
    if (!empty($member['mb_leave_date']) || !empty($member['mb_intercept_date'])) {
        $finish('invalid', '탈퇴 또는 차단된 회원입니다.', 403);
    }

    if ($check === 'expired') {
        // 원본과 같이 기한 넘긴 토큰은 버린다 — 다시 보내기로 새 링크를 받아야 한다.
        DB::execute(
            "UPDATE {$memberTable} SET mb_email_certify2 = '' WHERE mb_id = ? AND mb_email_certify2 = ?",
            [$mb_id, $stored]
        );
        $finish('expired', '인증 링크의 유효시간이 지났습니다. 로그인 화면에서 인증 메일을 다시 받아주세요.', 410, 'EMAIL_VERIFY_EXPIRED');
    }

    // 링크는 한 번만 쓰이도록 토큰이 그대로일 때만 바꾼다(동시에 두 번 열려도 한 번만 처리).
    $updated = DB::execute(
        "UPDATE {$memberTable} SET mb_email_certify = ?, mb_email_certify2 = '' WHERE mb_id = ? AND mb_email_certify2 = ?",
        [date('Y-m-d H:i:s'), $mb_id, $stored]
    );
    if ($updated < 1) {
        $finish('invalid', '이미 처리되었거나 올바르지 않은 인증 요청입니다.', 409);
    }

    $finish('ok', '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.', 200);
}

// -------------------------------------------------------------------------
// POST /v1/auth/resend-verification - 인증 메일 다시 보내기. 두 가지로 부른다.
//   { mb_id, mb_password } — 웹 로그인 화면. 비밀번호가 맞으면 결과(보냄 · 이미 인증 · 한도 등)를 그대로 알린다.
//   { mb_id, mb_email }    — 앱 계약(SC-17). 형식 오류만 422, 나머지는 회원이 있든 없든 같은 200 { sent: true }.
// 로그인에서 EMAIL_NOT_VERIFIED 를 받은 회원이 같은 아이디 · 비밀번호로 부른다. 비밀번호를 확인하므로
// 남의 메일함으로 메일을 쏟아붓거나 가입 여부를 떠볼 수 없고, 틀린 비밀번호는 로그인 실패와 같이 센다.
// -------------------------------------------------------------------------
if ($action === 'resend-verification' && $apiMethod === 'POST') {
    require_once __DIR__ . '/members_helpers.php'; // api_member_send_email_verification_mail()

    $input  = get_request_body();
    $ip     = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $config = api_get_config();

    if (!isset($input['mb_password']) || (string) $input['mb_password'] === '') {
        $mb_id   = isset($input['mb_id']) ? trim((string) $input['mb_id']) : '';
        $mbEmail = isset($input['mb_email']) ? trim((string) $input['mb_email']) : '';
        $errors  = [];
        if ($mb_id === '') {
            $errors['mb_id'] = 'mb_id is required.';
        }
        if (!Validator::email($mbEmail)) {
            $errors['mb_email'] = 'mb_email must be a valid email address.';
        }
        if ($errors) {
            Response::error('Validation failed.', 422, $errors);
        }
        $enumMsg = Throttle::checkEnumProbe($ip);
        if ($enumMsg !== null) {
            Response::error($enumMsg, 429);
        }
        api_auth_resend_verification_quietly($mb_id, $mbEmail, $config);
        Response::success([
            'sent'    => true,
            'message' => '입력하신 정보가 맞으면 인증 메일을 보냈습니다. 메일함을 확인해주세요.',
        ]);
    }

    $errors = Validator::validate([
        'mb_id'       => 'required',
        'mb_password' => 'required',
    ], $input);
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $mb_id    = (string) $input['mb_id'];
    $password = (string) $input['mb_password'];
    if (empty($config['cf_use_email_certify'])) {
        Response::error('이 사이트는 메일 인증을 사용하지 않습니다.', 400);
    }

    $lockedMsg = Throttle::checkLoginAttempt($mb_id, $ip);
    if ($lockedMsg !== null) {
        Response::error($lockedMsg, 429);
    }

    $member = DB::fetch(
        "SELECT mb_id, mb_password, mb_email, mb_email_certify, mb_email_certify2, mb_leave_date, mb_intercept_date
           FROM " . DB::table('member_table') . " WHERE mb_id = ? LIMIT 1",
        [$mb_id]
    );
    if (!$member || !$member['mb_id'] || !Auth::verifyPassword($password, (string) $member['mb_password'])) {
        Throttle::recordLoginFailure($mb_id, $ip);
        Response::error('Invalid member ID or password.', 401);
    }
    if (!empty($member['mb_leave_date'])) {
        Response::error('This account has been withdrawn.', 403);
    }
    if (!empty($member['mb_intercept_date'])) {
        Response::error('This account has been banned.', 403);
    }
    if (api_email_certify_is_done((string) $member['mb_email_certify'])) {
        Response::success(['message' => '이미 인증된 이메일입니다. 로그인해주세요.', 'already_verified' => true]);
    }
    $email = trim((string) $member['mb_email']);
    if ($email === '') {
        Response::error('회원 정보에 이메일 주소가 없습니다. 관리자에게 문의해주세요.', 400);
    }
    // 메일을 못 보내는데 토큰만 바꾸면 받아 둔 링크까지 못 쓰게 되면서 "보냈다"고 답하게 된다 — 바꾸기 전에 막는다.
    // (메일 사용 꺼짐 · mailer 없음 · 믿을 수 있는 사이트 주소(G5_DOMAIN 등) 없음)
    if (empty($config['cf_email_use']) || !api_require_mailer() || api_mail_link_base() === '') {
        Response::error('지금은 인증 메일을 보낼 수 없습니다. 관리자에게 문의해주세요.', 503);
    }

    // 한 회원당 1분 1번 · 1시간 5번. 셀 표가 없는 설치본에서는 메일을 한도 없이 열어 두지 않도록 막는다.
    $quotaMsg = Throttle::checkMemberQuota('verifymail', $mb_id, 1, 5, true, true);
    if ($quotaMsg !== null) {
        Response::error($quotaMsg, 429);
    }

    $token = api_email_certify_new_token();
    DB::execute(
        "UPDATE " . DB::table('member_table') . " SET mb_email_certify2 = ? WHERE mb_id = ?",
        [$token, $mb_id]
    );
    if (!api_member_send_email_verification_mail((string) $member['mb_id'], $email, $token, false)) {
        // 발송에 실패하면 먼저 받아 둔 링크가 계속 쓰이도록 토큰을 되돌린다(그 사이 바뀌지 않았을 때만).
        DB::execute(
            "UPDATE " . DB::table('member_table') . " SET mb_email_certify2 = ? WHERE mb_id = ? AND mb_email_certify2 = ?",
            [(string) $member['mb_email_certify2'], $mb_id, $token]
        );
        Response::error('지금은 인증 메일을 보낼 수 없습니다. 관리자에게 문의해주세요.', 503);
    }

    Response::success([
        'sent'    => true,
        'message' => '인증 메일을 다시 보냈습니다. 메일함을 확인해주세요.',
        'email'   => api_auth_mask_email($email),
    ]);
}
