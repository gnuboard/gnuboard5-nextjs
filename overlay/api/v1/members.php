<?php
/**
 * Gnuboard5 REST API - Member Endpoints
 *
 * Routes handled (prefix: v1/members):
 *   GET    /v1/members/me       - Get current member profile (auth required)
 *   PATCH  /v1/members/me       - Update profile (auth required)
 *   DELETE /v1/members/me       - Withdraw current member account
 *   GET    /v1/members/{mb_id}/profile - Get Gnuboard profile popup payload
 *   GET    /v1/members/{mb_id}  - Get public member profile
 */

if (!defined('_GNUBOARD_')) exit;

require_once __DIR__ . '/auth_helpers.php';
require_once __DIR__ . '/members_helpers.php';
// 탈퇴 재인증의 소셜 ticket PKCE 검증 함수(nextjs25_social_*). auth.php 와 같은 방식.
require_once __DIR__ . '/../social/_bridge_common.php';

/**
 * api/index.php 가 핸들러 require 직전에 정의하는 라우팅 컨텍스트 변수들.
 * @var string   $apiMethod   HTTP method (GET/POST/PATCH/DELETE)
 * @var string[] $apiSegments URL path segments (resource 이후)
 * @var string   $apiRoute    Full route string
 */

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';

// -------------------------------------------------------------------------
// GET /v1/members/me/points - Get current member point history (paginated)
// -------------------------------------------------------------------------
if ($seg0 === 'me' && isset($apiSegments[1]) && $apiSegments[1] === 'points' && $apiMethod === 'GET') {

    $member = Auth::requireAuth();

    $page    = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = min(50, max(1, (int) ($_GET['per_page'] ?? 20)));
    $offset  = ($page - 1) * $perPage;

    $pointTable = DB::table('point_table');

    $total = DB::count(
        "SELECT COUNT(*) FROM {$pointTable} WHERE mb_id = ?",
        [$member['mb_id']]
    );

    $items = DB::fetchAll(
        "SELECT po_id, po_content, po_point, po_use_point, po_mb_point,
                po_datetime, po_rel_table, po_rel_action
         FROM {$pointTable}
         WHERE mb_id = ?
         ORDER BY po_id DESC
         LIMIT ? OFFSET ?",
        [$member['mb_id'], $perPage, $offset]
    );

    // Cast numeric fields
    $items = array_map(function ($row) {
        return [
            'po_id'         => (int) $row['po_id'],
            'po_content'    => $row['po_content'],
            'po_point'      => (int) $row['po_point'],
            'po_use_point'  => (int) $row['po_use_point'],
            'po_mb_point'   => (int) $row['po_mb_point'],
            'po_datetime'   => $row['po_datetime'],
            'po_rel_table'  => $row['po_rel_table'],
            'po_rel_action' => $row['po_rel_action'],
        ];
    }, $items);

    Response::paginated($items, $total, $page, $perPage);
}

// -------------------------------------------------------------------------
// GET /v1/members/me/posts|comments - Get current member board activity
// -------------------------------------------------------------------------
if (
    $seg0 === 'me'
    && isset($apiSegments[1])
    && in_array($apiSegments[1], ['posts', 'comments'], true)
    && $apiMethod === 'GET'
) {
    $member = Auth::requireAuth();
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = min(50, max(1, (int) ($_GET['per_page'] ?? 20)));
    $isComment = $apiSegments[1] === 'comments';

    [$items, $total] = api_member_my_writes((string) $member['mb_id'], $isComment, $page, $perPage);
    Response::paginated($items, $total, $page, $perPage);
}

// -------------------------------------------------------------------------
// GET /v1/members/me - Get current member full profile
// -------------------------------------------------------------------------
if ($seg0 === 'me' && $apiMethod === 'GET') {

    $member = Auth::requireAuth();

    // Return full member info minus sensitive fields
    $safeData = api_member_safe($member);
    $safeData['mb_icon_path'] = get_member_icon_url($member['mb_id']);

    Response::success([
        'member' => $safeData,
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/members/me/legal-consent — 약관·개인정보처리방침 동의 기록
//   body: {terms_version, privacy_version, accepted_at(ISO 8601, 생략 시 지금)}
//   버전이 바뀔 때마다 새 행이 쌓이고, /auth/me 의 legal_consent 가 최신 행을 돌려준다.
// -------------------------------------------------------------------------
if ($seg0 === 'me' && isset($apiSegments[1]) && $apiSegments[1] === 'legal-consent' && $apiMethod === 'POST') {

    $member = Auth::requireAuth();
    $input  = get_request_body();
    if (!is_array($input)) {
        Response::error('Validation failed.', 422, ['body' => 'JSON 객체여야 합니다.']);
    }

    $errors = [];
    $versions = [];
    foreach (['terms_version', 'privacy_version'] as $key) {
        $v = isset($input[$key]) && is_string($input[$key]) ? trim($input[$key]) : '';
        if ($v === '' || !preg_match('/^[A-Za-z0-9._-]{1,32}$/', $v)) {
            $errors[$key] = '버전 문자열(영문·숫자·._-, 32자 이내)이어야 합니다.';
        }
        $versions[$key] = $v;
    }
    $acceptedTs = time();
    if (isset($input['accepted_at']) && $input['accepted_at'] !== '') {
        $ts = is_string($input['accepted_at']) ? strtotime($input['accepted_at']) : false;
        if ($ts === false) {
            $errors['accepted_at'] = 'ISO 8601 날짜여야 합니다.';
        } else {
            // 기기 시계가 앞서 있어도 서버 시각을 넘기지 않게, 너무 옛날도 막는다.
            $acceptedTs = max(min($ts, time()), time() - 365 * 86400);
        }
    }
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr((string) $_SERVER['HTTP_USER_AGENT'], 0, 255) : '';
    DB::execute(
        "INSERT INTO " . DB::table('member_legal_consent_table') . "
            (mb_id, terms_version, privacy_version, accepted_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)",
        [
            (string) $member['mb_id'],
            $versions['terms_version'],
            $versions['privacy_version'],
            date('Y-m-d H:i:s', $acceptedTs),
            isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '',
            $ua,
        ]
    );

    Response::success(['legal_consent' => api_member_legal_consent((string) $member['mb_id'])], 201);
}

// -------------------------------------------------------------------------
// POST /v1/members/me/export - GDPR 본인 데이터 일괄 export (JSON)
//   비밀번호 재확인 — 토큰 탈취만으로는 모든 데이터 유출 불가능하도록 step-up auth.
//   소셜 로그인 회원은 비밀번호가 없으므로 보유 mb_email 인증 토큰을 password 대신 사용
//   (현재 기본 구현 — 향후 OTP 등으로 확장 가능).
// -------------------------------------------------------------------------
if ($seg0 === 'me' && isset($apiSegments[1]) && $apiSegments[1] === 'export' && $apiMethod === 'POST') {

    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];

    $input = get_request_body();
    $password = isset($input['password']) ? (string) $input['password'] : '';

    if ($password === '') {
        Response::error('Password required for data export.', 422, ['password' => 'Required for security.']);
    }

    // 비밀번호 검증 — DB 의 hash 와 비교
    $hash = isset($member['mb_password']) ? (string) $member['mb_password'] : '';
    if ($hash === '' || !Auth::verifyPassword($password, $hash)) {
        Response::error('Invalid password.', 401);
    }

    $payload = [
        'exported_at' => date('c'),
        'member'      => api_member_safe($member),
        'ddays'       => api_member_export_dday_data($mb_id),
        'baby_data'   => api_member_export_baby_data($mb_id),
        'push_tokens' => DB::fetchAll(
            "SELECT push_token, platform, last_used_at
             FROM " . DB::table('push_token_table') . " WHERE mb_id = ?",
            [$mb_id]
        ),
        'notifications' => DB::fetchAll(
            "SELECT nt_id, nt_type, nt_event, nt_title, nt_body, nt_data, nt_sent_at, nt_read_at
             FROM " . DB::table('notification_log_table') . " WHERE mb_id = ?
             ORDER BY nt_sent_at DESC LIMIT 1000",
            [$mb_id]
        ),
        // 게시판 글/댓글 — 전체 게시판 순회 (성능 위해 최근 200건만)
        'posts_recent' => api_export_user_writes($mb_id, false, 200),
        'comments_recent' => api_export_user_writes($mb_id, true, 200),
    ];

    Response::success($payload);
}

// -------------------------------------------------------------------------
// PATCH /v1/members/me - Update current member profile
// -------------------------------------------------------------------------
if ($seg0 === 'me' && $apiMethod === 'PATCH') {

    $member = Auth::requireAuth();

    $input = get_request_body();

    // Updateable fields
    $allowedFields = [
        'mb_nick', 'mb_name', 'mb_email', 'mb_hp', 'mb_tel',
        'mb_zip1', 'mb_zip2', 'mb_addr1', 'mb_addr2', 'mb_addr3',
        'mb_signature', 'mb_profile',
    ];

    $setClauses = [];
    $params = [];
    $emailChanged = false;
    $emailVerifyToken = '';
    $changedEmail = '';

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $value = $input[$field];

            // Extra validation for specific fields
            if ($field === 'mb_email') {
                if (!Validator::email($value)) {
                    Response::error('Validation failed.', 422, [
                        'mb_email' => 'mb_email must be a valid email address.',
                    ]);
                }
                $emailChanged = strtolower(trim((string) $value)) !== strtolower(trim((string) ($member['mb_email'] ?? '')));
                if ($emailChanged) {
                    api_member_require_current_password($input, $member);
                    $emailVerifyToken = bin2hex(random_bytes(16));
                    $changedEmail = trim((string) $value);
                }
                // Check duplicate email (excluding current member)
                $sql = "SELECT mb_id FROM " . DB::table('member_table') . "
                        WHERE mb_email = ?
                          AND mb_id != ?
                        LIMIT 1";
                $dup = DB::fetch($sql, [$value, $member['mb_id']]);
                if ($dup && $dup['mb_id']) {
                    Response::error('This email is already registered by another member.', 409, [
                        'mb_email' => 'mb_email already exists.',
                    ]);
                }
            }

            if ($field === 'mb_nick') {
                if (!Validator::minLength($value, 2) || !Validator::maxLength($value, 20)) {
                    Response::error('Validation failed.', 422, [
                        'mb_nick' => 'mb_nick must be between 2 and 20 characters.',
                    ]);
                }
                // Check duplicate nick (excluding current member)
                $sql = "SELECT mb_id FROM " . DB::table('member_table') . "
                        WHERE mb_nick = ?
                          AND mb_id != ?
                        LIMIT 1";
                $dup = DB::fetch($sql, [$value, $member['mb_id']]);
                if ($dup && $dup['mb_id']) {
                    Response::error('This nickname is already taken by another member.', 409, [
                        'mb_nick' => 'mb_nick already exists.',
                    ]);
                }
            }

            $setClauses[] = "{$field} = ?";
            $params[] = $value;

            if ($field === 'mb_email' && $emailChanged) {
                $setClauses[] = "mb_email_certify = ?";
                $params[] = '0000-00-00 00:00:00';
                $setClauses[] = "mb_email_certify2 = ?";
                $params[] = $emailVerifyToken;
            }
        }
    }

    $passwordChanged = false;

    // Password change
    if (isset($input['mb_password']) && $input['mb_password'] !== '') {
        api_member_require_current_password($input, $member);

        if (!isset($input['mb_password_re']) || $input['mb_password'] !== $input['mb_password_re']) {
            Response::error('Passwords do not match.', 422, [
                'mb_password_re' => 'mb_password_re must match mb_password.',
            ]);
        }

        $passwordErrors = api_auth_password_policy_errors((string) $input['mb_password'], (string) $member['mb_id']);
        if ($passwordErrors) {
            Response::error('Validation failed.', 422, $passwordErrors);
        }

        $hashedPassword = Auth::hashPassword($input['mb_password']);
        $setClauses[] = "mb_password = ?";
        $params[] = $hashedPassword;
        $passwordChanged = true;
    }

    if (empty($setClauses)) {
        Response::error('No valid fields provided for update.', 422);
    }

    $now = date('Y-m-d H:i:s');
    $setClauses[] = "mb_nick_date = ?";
    $params[] = $now;

    // Add the WHERE param
    $params[] = $member['mb_id'];

    $setStr = implode(', ', $setClauses);
    DB::execute("UPDATE " . DB::table('member_table') . "
               SET {$setStr}
               WHERE mb_id = ?", $params);

    if ($passwordChanged) {
        try {
            RefreshToken::revokeAllFor($member['mb_id']);
        } catch (\Throwable $e) {
            error_log('[api/members] Failed to revoke refresh tokens after password change: ' . $e->getMessage());
        }
    }

    if ($emailChanged && $emailVerifyToken !== '' && $changedEmail !== '') {
        api_member_send_email_verification_mail((string) $member['mb_id'], $changedEmail, $emailVerifyToken);
    }

    // Fetch updated member
    $updated = DB::fetch("SELECT * FROM " . DB::table('member_table') . "
            WHERE mb_id = ? LIMIT 1", [$member['mb_id']]);

    $safeData = api_member_safe($updated);
    $safeData['mb_icon_path'] = get_member_icon_url($member['mb_id']);

    Response::success([
        'member' => $safeData,
    ]);
}

// -------------------------------------------------------------------------
// DELETE /v1/members/me - Withdraw current member account
// -------------------------------------------------------------------------
if ($seg0 === 'me' && $apiMethod === 'DELETE') {

    $member = Auth::requireAuth();
    $mb_id = (string) $member['mb_id'];

    /**
     * 즉시 영구 삭제 (개인정보 보호법 제21조 — 지체 없는 파기).
     *
     * 예전엔 mb_leave_date 만 채우고 30일 복구 기간을 뒀지만, 그 기간에 소셜 연결이
     * 남아 같은 소셜 계정으로 재가입이 막히고, 30일 뒤 삭제 cron 도 등록돼 있지 않아
     * 고지와 다르게 무기한 보관되는 상태였다. 지금은 요청 즉시:
     *   - 회원 개인정보 필드 비식별화 (mb_id 는 게시판 외래키라 남김)
     *   - 게시글·댓글 작성자 비식별화, 그 외 회원 소유 행 삭제, 파일 삭제
     *   - 모든 refresh token 폐기 → 다른 기기 세션도 끊김
     * 자세한 범위는 member_purge.php 참고. 복구는 불가능하다.
     */
    require_once __DIR__ . '/member_purge.php';

    /**
     * 본인 확인(step-up). 삭제가 되돌릴 수 없어졌으므로 세션 토큰만으로는 부족하다 —
     * 탈취된 토큰 하나로 계정이 영구히 사라지면 안 된다. 둘 중 하나를 요구한다:
     *   - mb_password   : 비밀번호 계정. 로그인과 같은 시도 제한을 건다.
     *   - social_ticket : 소셜 가입 계정. 앱이 소셜 로그인을 한 번 더 돌려 받은 1회용
     *                     로그인 ticket(api/social 브리지 발급)을 JWT 로 바꾸지 않고 여기에 낸다.
     *                     ticket 의 mb_id 가 현재 회원과 같아야 하고, 여기서 소비된다.
     */
    $input = get_request_body();
    $password = isset($input['mb_password']) ? (string) $input['mb_password'] : '';
    $socialTicket = isset($input['social_ticket']) ? trim((string) $input['social_ticket']) : '';
    $socialCodeVerifier = isset($input['social_code_verifier'])
        ? trim((string) $input['social_code_verifier'])
        : '';
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

    if ($password !== '') {
        $lockedMsg = Throttle::checkLoginAttempt($mb_id, $ip);
        if ($lockedMsg !== null) {
            Response::error($lockedMsg, 429);
        }
        $hash = isset($member['mb_password']) ? (string) $member['mb_password'] : '';
        if ($hash === '' || !Auth::verifyPassword($password, $hash)) {
            Throttle::recordLoginFailure($mb_id, $ip);
            Response::error('Current password is incorrect.', 401, [
                'mb_password' => 'Current password is incorrect.',
            ]);
        }
        Throttle::resetLoginAttempts($mb_id, $ip);
    } elseif ($socialTicket !== '') {
        if (!preg_match('/^[a-f0-9]{32,128}$/i', $socialTicket)) {
            Response::error('Social re-authentication does not match this account.', 403);
        }
        $ticketTable = G5_TABLE_PREFIX . 'social_mobile_ticket';
        nextjs25_social_ensure_mobile_ticket_table();
        $row = DB::fetch(
            "SELECT ticket_id, mb_id, code_challenge, expires_at, used_at
               FROM `{$ticketTable}` WHERE ticket = ? LIMIT 1",
            [$socialTicket]
        );
        // PKCE: 로그인 ticket 과 같은 규칙 — challenge 가 묶인 ticket 은 verifier 가 맞아야 한다.
        // 콜백을 가로챈 앱이 탈퇴 재인증 ticket 으로 계정을 지우는 것을 막는다.
        $valid = $row
            && empty($row['used_at'])
            && strtotime((string) $row['expires_at']) >= time()
            && (string) $row['mb_id'] === $mb_id
            && nextjs25_social_ticket_verifier_ok($row['code_challenge'], $socialCodeVerifier);
        if (!$valid) {
            Response::error('Social re-authentication does not match this account.', 403);
        }
        // 1회용 — 여기서 소비한다. 경합 시 한쪽만 통과.
        $claimed = DB::execute(
            "UPDATE `{$ticketTable}` SET used_at = NOW()
              WHERE ticket_id = ? AND used_at IS NULL AND expires_at >= NOW()",
            [$row['ticket_id']]
        );
        if ($claimed !== 1) {
            Response::error('Social re-authentication does not match this account.', 403);
        }
    } else {
        Response::error('Re-authentication is required to delete the account.', 403, [
            'reauth' => 'required',
        ]);
    }

    // 세션부터 끊는다. 아래 삭제가 실패해도 다른 기기에서 계속 쓰이면 안 된다.
    try { RefreshToken::revokeAllFor($mb_id); }
    catch (\Throwable $e) { /* 테이블 없는 설치본 무시 */ }

    // Apple 연동 회원은 Apple 쪽 토큰도 끊는다(SC-11, App Store 5.1.1(v)). 연결 행을 purge 가 지우므로 그 전에 부른다.
    // 실패해도 탈퇴는 계속한다.
    require_once __DIR__ . '/../lib/AppleClient.php';
    $appleRevoked = AppleClient::revokeForMember($mb_id);

    try {
        $result = api_member_purge_now($mb_id);
    } catch (\Throwable $e) {
        error_log('[members] purge failed for ' . $mb_id . ': ' . $e->getMessage());
        Response::error('회원 탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 500);
    }

    api_auth_clear_session_cookies();

    Response::success([
        'message' => '회원 탈퇴가 완료되었습니다. 계정과 개인정보는 즉시 삭제되어 복구할 수 없습니다.',
        'deleted_files' => (int) $result['deleted_files'],
        'anonymized_writes' => (int) $result['anonymized_writes'],
        'apple_revoked' => $appleRevoked,
    ]);
}

// -------------------------------------------------------------------------
// POST /v1/members/me/icon - Upload member icon/avatar
// -------------------------------------------------------------------------
if ($seg0 === 'me' && isset($apiSegments[1]) && $apiSegments[1] === 'icon' && $apiMethod === 'POST') {

    $member = Auth::requireAuth();
    $mb_id = $member['mb_id'];

    if (!isset($_FILES['mb_icon']) || $_FILES['mb_icon']['error'] !== UPLOAD_ERR_OK) {
        Response::error('파일 업로드에 실패했습니다.', 400);
    }

    $file = $_FILES['mb_icon'];
    $allowedTypes = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'];

    if ($file['size'] > 5 * 1024 * 1024) {
        Response::error('파일 크기는 5MB 이하여야 합니다.', 422);
    }

    if (!is_uploaded_file($file['tmp_name'])) {
        Response::error('Invalid upload.', 400);
    }

    if (!function_exists('finfo_open')) {
        Response::error('Image validation is not available on this server.', 500);
    }

    $finfo = @finfo_open(FILEINFO_MIME_TYPE);
    $detectedMime = $finfo ? @finfo_file($finfo, $file['tmp_name']) : '';
    if ($finfo) {
        @finfo_close($finfo);
    }
    $detectedMime = is_string($detectedMime) ? strtolower(trim($detectedMime)) : '';

    if (!in_array($detectedMime, $allowedTypes, true)) {
        Response::error('허용되지 않는 파일 형식입니다. (gif, jpg, png, webp)', 422);
    }

    $imageInfo = @getimagesize($file['tmp_name']);
    if (!$imageInfo || empty($imageInfo[0]) || empty($imageInfo[1])) {
        Response::error('Invalid image file.', 422);
    }

    if (!function_exists('imagegif')) {
        Response::error('Image processing is not available on this server.', 500);
    }

    $srcImg = null;
    switch ($detectedMime) {
        case 'image/jpeg':
            $srcImg = function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($file['tmp_name']) : null;
            break;
        case 'image/png':
            $srcImg = function_exists('imagecreatefrompng') ? @imagecreatefrompng($file['tmp_name']) : null;
            break;
        case 'image/webp':
            $srcImg = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file['tmp_name']) : null;
            break;
        case 'image/gif':
            $srcImg = function_exists('imagecreatefromgif') ? @imagecreatefromgif($file['tmp_name']) : null;
            break;
    }

    if (!$srcImg) {
        Response::error('Image decode failed.', 422);
    }

    // Gnuboard5 stores member icons in data/member/{first2chars}/
    $iconDir = G5_DATA_PATH . '/member/' . substr($mb_id, 0, 2);
    if (!is_dir($iconDir)) {
        @mkdir($iconDir, 0755, true);
    }

    // Gnuboard5 uses gif extension for icon files regardless of actual format
    $iconFile = $iconDir . '/' . $mb_id . '.gif';

    // Delete old icon
    if (file_exists($iconFile)) {
        @unlink($iconFile);
    }

    $srcW = imagesx($srcImg);
    $srcH = imagesy($srcImg);
    $maxW = 512;
    $maxH = 512;
    $ratio = min(1.0, $maxW / max(1, $srcW), $maxH / max(1, $srcH));
    $dstW = max(1, (int) round($srcW * $ratio));
    $dstH = max(1, (int) round($srcH * $ratio));

    $dstImg = imagecreatetruecolor($dstW, $dstH);
    $white = imagecolorallocate($dstImg, 255, 255, 255);
    imagefilledrectangle($dstImg, 0, 0, $dstW, $dstH, $white);
    imagecopyresampled($dstImg, $srcImg, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);

    if (!imagegif($dstImg, $iconFile)) {
        unset($srcImg, $dstImg);
        Response::error('파일 저장에 실패했습니다.', 500);
    }
    unset($srcImg, $dstImg);

    @chmod($iconFile, 0644);

    $iconUrl = get_member_icon_url($mb_id) . '?t=' . time();

    Response::success([
        'mb_icon_path' => $iconUrl,
        'message' => '프로필 이미지가 변경되었습니다.',
    ]);
}

// -------------------------------------------------------------------------
// GET /v1/members/{mb_id}/profile - Gnuboard profile popup parity
// -------------------------------------------------------------------------
if ($seg0 && isset($apiSegments[1]) && $apiSegments[1] === 'profile' && $apiMethod === 'GET') {

    if (!preg_match('/^[a-z0-9_]+$/i', $seg0)) {
        Response::error('Invalid member ID format.', 400);
    }

    $viewer = Auth::requireAuth();
    $isSuperAdmin = Auth::adminRole($viewer) === 'super';
    $isSelf = isset($viewer['mb_id']) && $viewer['mb_id'] === $seg0;

    if ((int) ($viewer['mb_open'] ?? 0) !== 1 && !$isSuperAdmin && !$isSelf) {
        Response::error('You must make your own profile public before viewing other member profiles.', 403);
    }

    $memberTable = DB::table('member_table');
    $target = DB::fetch(
        "SELECT mb_id, mb_nick, mb_level, mb_point, mb_open, mb_datetime,
                mb_homepage, mb_profile, mb_leave_date, mb_intercept_date
           FROM {$memberTable}
          WHERE mb_id = ?
            AND mb_leave_date = ''
            AND mb_intercept_date = ''
          LIMIT 1",
        [$seg0]
    );

    if (!$target || empty($target['mb_id'])) {
        Response::error('Member not found.', 404);
    }

    $isSelf = isset($viewer['mb_id']) && $viewer['mb_id'] === $target['mb_id'];
    if ((int) ($target['mb_open'] ?? 0) !== 1 && !$isSuperAdmin && !$isSelf) {
        Response::error('This member profile is not public.', 403);
    }

    Response::success([
        'member' => api_member_profile_payload($target),
    ]);
}

// -------------------------------------------------------------------------
// PATCH /v1/members/{mb_id}/sanction - Ban/unban a member (super admin)
// -------------------------------------------------------------------------
if ($seg0 && isset($apiSegments[1]) && $apiSegments[1] === 'sanction' && $apiMethod === 'PATCH') {

    $admin = Auth::requireAdmin();

    if (!preg_match('/^[a-z0-9_]+$/i', $seg0)) {
        Response::error('Invalid member ID format.', 400);
    }

    $input = get_request_body();
    $action = isset($input['action']) ? (string) $input['action'] : '';
    if (!in_array($action, ['ban', 'unban'], true)) {
        Response::error('Invalid sanction action.', 422);
    }

    $memberTable = DB::table('member_table');
    $target = DB::fetch(
        "SELECT mb_id, mb_nick, mb_level, mb_intercept_date, mb_leave_date
           FROM {$memberTable}
          WHERE mb_id = ?
          LIMIT 1",
        [$seg0]
    );
    if (!$target || !$target['mb_id']) {
        Response::error('Member not found.', 404);
    }

    if ($target['mb_id'] === $admin['mb_id']) {
        Response::error('You cannot sanction your own account.', 422);
    }

    if (Auth::adminRole($target) === 'super') {
        Response::error('Super admin accounts cannot be sanctioned from the app.', 403);
    }

    if ($action === 'ban') {
        DB::execute(
            "UPDATE {$memberTable}
                SET mb_intercept_date = ?
              WHERE mb_id = ?",
            [date('Ymd'), $target['mb_id']]
        );
        try { RefreshToken::revokeAllFor($target['mb_id']); }
        catch (\Throwable $e) { /* best-effort */ }
        $target['mb_intercept_date'] = date('Ymd');
    } else {
        DB::execute(
            "UPDATE {$memberTable}
                SET mb_intercept_date = ''
              WHERE mb_id = ?",
            [$target['mb_id']]
        );
        $target['mb_intercept_date'] = '';
    }

    Response::success([
        'mb_id' => $target['mb_id'],
        'mb_nick' => $target['mb_nick'],
        'is_banned' => $target['mb_intercept_date'] !== '',
        'mb_intercept_date' => $target['mb_intercept_date'],
    ]);
}

// -------------------------------------------------------------------------
// GET /v1/members/{mb_id} - Get public member profile
// -------------------------------------------------------------------------
if ($seg0 && $seg0 !== 'me' && $apiMethod === 'GET') {

    // Validate mb_id format
    if (!preg_match('/^[a-z0-9_]+$/i', $seg0)) {
        Response::error('Invalid member ID format.', 400);
    }

    $member = DB::fetch("SELECT * FROM " . DB::table('member_table') . "
            WHERE mb_id = ?
              AND mb_leave_date = ''
              AND mb_intercept_date = ''
            LIMIT 1", [$seg0]);

    if (!$member || !$member['mb_id']) {
        Response::error('Member not found.', 404);
    }

    // Return public-only profile
    $publicData = [
        'mb_id'        => $member['mb_id'],
        'mb_nick'      => $member['mb_nick'],
        'mb_level'     => (int) $member['mb_level'],
        'mb_point'     => (int) $member['mb_point'],
        'mb_datetime'  => $member['mb_datetime'],
        'mb_icon_path' => get_member_icon_url($member['mb_id']),
    ];

    Response::success([
        'member' => $publicData,
    ]);
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Not found.', 404);
