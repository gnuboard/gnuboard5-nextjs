<?php
/**
 * Gnuboard5 REST API - 신고 엔드포인트
 *
 * Routes (prefix: v1/reports):
 *   POST /v1/reports                      - 새 신고 (post/comment/image)
 *   GET  /v1/reports?status=open          - (admin) 목록
 *   PATCH /v1/reports/{id}                - (admin) status 변경 (closed/dismissed)
 *
 * 인증:
 *   - POST 는 회원/비회원 모두 가능 (비회원은 X-Device-Id sig 검증된 device_id 로 식별).
 *   - GET/PATCH 는 super admin 만.
 *
 * 중복 신고 방지: UNIQUE (target_type, target_key, reporter_mb, reporter_dev).
 *   같은 사용자/기기가 같은 컨텐츠를 두 번 신고하면 first-only.
 */

if (!defined('_GNUBOARD_')) exit;

/** @var string $apiMethod */
/** @var array<int,string> $apiSegments */

$action = isset($apiSegments[0]) ? $apiSegments[0] : '';

require_once __DIR__ . '/../lib/report_hide.php'; // 자동 가림 · 기각 뒤 되돌리기(관리자 신고 화면과 같이 쓴다)

/**
 * 이미지 신고 키 — "게시판/글번호|이미지 경로"(앱 2026-10-06 판부터). 경로는 이 사이트 주소의 경로 부분만(호스트·쿼리
 * 없이) — 관리자가 원래 글을 열고 사진을 볼 수 있게 한다. 옛 앱은 이미지 주소 전체만 보낸다(원래 글은 모른다).
 *
 * @return array{0:string,1:int,2:string}|null [bo_table, wr_id, path]
 */
function api_report_image_parts(string $key): ?array
{
    if (!preg_match('#^([A-Za-z0-9_]{1,20})/([0-9]{1,10})\|(/[A-Za-z0-9._~%/+=-]+)$#', $key, $m)) {
        return null;
    }
    // %2e%2e 처럼 인코딩해 숨긴 상위 폴더·이중 슬래시·역슬래시·제어문자도 막는다 — 한 번 풀어서 본다.
    $decoded = rawurldecode($m[3]);
    if (strpos($decoded, '..') !== false || strpos($decoded, '//') !== false || preg_match('/[\\\\\x00-\x1f\x7f]/', $decoded)) {
        return null;
    }
    return [$m[1], (int) $m[2], $m[3]];
}

/**
 * 신고한 사진이 정말 그 글의 사진인지 — 본문에 그 파일 이름이 있어야 한다(에디터 사진은 본문에 주소가 들어 있다).
 * 아무 글 번호에 아무 사이트 사진을 붙여 신고하지 못하게 한다.
 */
function api_report_image_in_post(string $bo_table, int $wr_id, string $path): bool
{
    $name = basename(rawurldecode($path));
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:jpe?g|png|gif|webp)$/i', $name) || !api_get_board($bo_table)) {
        return false;
    }
    $row = DB::fetch(
        "SELECT wr_content FROM " . DB::writeTable($bo_table) . " WHERE wr_id = ? AND wr_is_comment = 0 LIMIT 1",
        [$wr_id]
    );
    $content = (string) ($row['wr_content'] ?? '');
    // 주소 속 파일 이름으로 찾는다 — "/이름" 꼴이라 photo.jpg 가 myphoto.jpg 에 걸리지 않는다.
    return $content !== '' && (strpos($content, '/' . $name) !== false || strpos($content, '/' . rawurlencode($name)) !== false);
}

/** 관리자 화면에 띄울 신고 이미지 주소 — 이 사이트의 이미지만(바깥 이미지는 추적 우려로 띄우지 않는다). */
function api_report_image_url(string $key): ?string
{
    $origin = rtrim((string) api_current_origin(), '/');
    if ($origin === '') {
        return null;
    }
    $parts = api_report_image_parts($key);
    if ($parts) {
        return $origin . $parts[2];
    }
    $legacyPath = api_report_legacy_image_path($key);
    return $legacyPath !== null ? $origin . $legacyPath : null;
}

/**
 * 옛 앱(2026-10-06 이전)의 사진 신고 키 — 사진 주소만 보낸다. 옛 앱도 에디터 사진에만 이 키를 만들었으므로 이 사이트의
 * /data/editor/{연월}/{파일}.{사진 확장자} 꼴만 받는다(앱 editorImages.ts 와 같은 모양). 아니면 null.
 */
function api_report_legacy_image_path(string $key): ?string
{
    $origin = rtrim((string) api_current_origin(), '/');
    if ($origin === '' || strpos($key, $origin . '/') !== 0) {
        return null;
    }
    $path = substr($key, strlen($origin));
    return preg_match('#^/(?:data/)?editor/[0-9]{4}/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:jpe?g|png|gif|webp)$#i', $path) ? $path : null;
}

/**
 * 새 신고를 최고관리자에게 푸시로 알린다 — 같은 대상의 첫 신고와 자동 가림 때만(신고가 몰려도 알림이 쏟아지지 않게).
 * 신고 내용·작성자는 싣지 않는다(잠금화면). data {type:'admin.report.created'} — 앱은 누르면 신고 관리를 연다.
 * 응답을 먼저 내보낸 뒤 보낸다(Expo 호출이 신고 응답을 늦추지 않게).
 */
function api_report_notify_admin(string $type, string $reason, int $openCount, bool $autoHidden, ?string $reporterMb): void
{
    if ($openCount !== 1 && !$autoHidden) {
        return;
    }
    // 서로 다른 대상을 잔뜩 신고해 관리자 잠금화면을 알림으로 덮지 못하게 — 첫 신고 알림은 사이트 전체에서 1분 10건 ·
    // 1시간 30건까지(신고는 그대로 받고 신고 관리에서 보인다). 자동 가림 알림은 줄이지 않는다.
    if (!$autoHidden && Throttle::checkMemberQuota('reportpush', 'admin', 10, 30) !== null) {
        return;
    }
    register_shutdown_function(static function () use ($type, $reason, $autoHidden, $reporterMb) {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        try {
            if (!class_exists('Notify') && is_file(G5_PATH . '/plugin/webapp/notify/Notify.php')) {
                require_once G5_PATH . '/plugin/webapp/notify/Notify.php';
            }
            $config = DB::fetch("SELECT cf_admin FROM " . DB::table('config_table') . " LIMIT 1");
            $admin = trim((string) ($config['cf_admin'] ?? ''));
            if (!class_exists('Notify') || $admin === '' || $admin === (string) $reporterMb) {
                return;
            }
            $subject = ['post' => '글이', 'comment' => '댓글이', 'image' => '이미지가'][$type] ?? '콘텐츠가';
            $reasons = ['spam' => '스팸/광고', 'abuse' => '욕설/비방', 'adult' => '음란/성인', 'illegal' => '불법 정보'];
            $title = $autoHidden ? "[신고] {$subject} 자동으로 가려졌어요" : "[신고] {$subject} 신고되었어요";
            $body = '사유: ' . ($reasons[$reason] ?? '기타') . ' · 신고 관리에서 확인하세요';
            Notify::emit('admin.report.created', $admin, $title, $body, ['type' => 'admin.report.created', 'target_type' => $type]);
        } catch (\Throwable $e) {
            error_log('[reports] admin notify failed: ' . $e->getMessage());
        }
    });
}

/**
 * 신고할 글 · 댓글이 있고 신고하는 사람이 그 글을 읽을 수 있는지 — 읽지 못하는 글(권한 밖 게시판 · 남의 비밀글)은
 * 신고도, 자동 가림 집계도 하지 못한다. 댓글은 원글을 읽을 수 있어야 한다.
 */
function api_report_target_readable(?array $viewer, string $type, string $key): bool
{
    $parts = api_report_target_parts($key);
    if (!$parts) {
        return false;
    }

    [$bo_table, $wr_id] = $parts;
    $board = api_get_board($bo_table);
    if (!$board) {
        return false;
    }

    $write_table = DB::writeTable($bo_table);
    $isComment = $type === 'comment';
    $post = DB::fetch(
        "SELECT * FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = ? LIMIT 1",
        [$wr_id, $isComment ? 1 : 0]
    );
    $comment = null;
    if ($post && $isComment) {
        $comment = $post;
        $post = DB::fetch(
            "SELECT * FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = 0 LIMIT 1",
            [(int) $post['wr_parent']]
        );
    }
    if (!$post || !api_can_read_board_post($viewer, $bo_table, $board, $post)) {
        return false;
    }

    // 비밀댓글은 볼 수 있는 사람(원글 · 댓글 작성자, 관리자)만 신고한다 — 댓글 목록(api_post_present_comment)과 같은 기준.
    if ($comment && api_is_secret_option($comment['wr_option'] ?? '')) {
        $viewerId = $viewer && !empty($viewer['mb_id']) ? (string) $viewer['mb_id'] : '';
        return $viewerId !== ''
            && ((string) ($post['mb_id'] ?? '') === $viewerId
                || (string) ($comment['mb_id'] ?? '') === $viewerId
                || Auth::adminRole($viewer, $bo_table) !== '');
    }

    return true;
}

function api_report_target_summary(string $type, string $key): array
{
    $summary = [
        'target_available' => false,
        'target_parent_id' => null,
        'target_subject' => null,
        'target_excerpt' => null,
        'target_author_id' => null,
        'target_author_name' => null,
        'target_author_nick' => null,
        'target_author_banned' => false,
        'target_hidden' => false,
    ];

    if ($type === 'image') {
        // 새 키는 원래 글의 요약(제목·작성자·가림 여부)을 같이 준다. 옛 키(주소만)는 사진 주소만.
        $imageParts = api_report_image_parts($key);
        $base = $imageParts ? api_report_target_summary('post', $imageParts[0] . '/' . $imageParts[1]) : $summary;
        return array_merge($base, ['target_image_url' => api_report_image_url($key)]);
    }
    if (!in_array($type, ['post', 'comment'], true)) {
        return $summary;
    }

    $parts = api_report_target_parts($key);
    if (!$parts) {
        return $summary;
    }

    [$bo_table, $wr_id] = $parts;
    if (!api_get_board($bo_table)) {
        return $summary;
    }

    $write_table = DB::writeTable($bo_table);
    $isComment = $type === 'comment' ? 1 : 0;
    $row = DB::readFetch(
        "SELECT wr_id, wr_parent, wr_subject, wr_content, wr_name, mb_id, wr_datetime, wr_10
           FROM {$write_table}
          WHERE wr_id = ? AND wr_is_comment = ?
          LIMIT 1",
        [$wr_id, $isComment]
    );
    if (!$row || !$row['wr_id']) {
        return $summary;
    }

    $subject = (string) ($row['wr_subject'] ?? '');
    if ($subject === '' && $isComment) {
        $parent = DB::readFetch(
            "SELECT wr_subject
               FROM {$write_table}
              WHERE wr_id = ? AND wr_is_comment = 0
              LIMIT 1",
            [(int) $row['wr_parent']]
        );
        $subject = $parent && isset($parent['wr_subject'])
            ? (string) $parent['wr_subject']
            : 'Comment';
    }

    $summary['target_available'] = true;
    $summary['target_parent_id'] = $isComment ? (int) $row['wr_parent'] : (int) $row['wr_id'];
    $summary['target_subject'] = $subject;
    $summary['target_excerpt'] = trim(mb_substr(strip_tags((string) ($row['wr_content'] ?? '')), 0, 120));
    $summary['target_author_id'] = $row['mb_id'] ? (string) $row['mb_id'] : null;
    $summary['target_author_name'] = $row['wr_name'] ? (string) $row['wr_name'] : null;
    $summary['target_hidden'] = (string) ($row['wr_10'] ?? '') === 'report_hidden';

    if ($row['mb_id']) {
        $member = DB::readFetch(
            "SELECT mb_nick, mb_intercept_date
               FROM " . DB::table('member_table') . "
              WHERE mb_id = ?
              LIMIT 1",
            [$row['mb_id']]
        );
        if ($member) {
            $summary['target_author_nick'] = isset($member['mb_nick']) ? (string) $member['mb_nick'] : null;
            $summary['target_author_banned'] = !empty($member['mb_intercept_date']);
        }
    }

    return $summary;
}

// -------------------------------------------------------------------------
// POST /v1/reports
// -------------------------------------------------------------------------
if ($apiMethod === 'POST' && $action === '') {
    $input = get_request_body();
    $errors = Validator::validate([
        'target_type' => 'required',
        'target_key'  => 'required|max:128',
    ], $input);
    if ($errors) Response::error('Validation failed.', 422, $errors);

    $type = (string) $input['target_type'];
    if (!in_array($type, ['post', 'comment', 'image'], true)) {
        Response::error('Invalid target_type.', 422);
    }
    $key    = mb_substr((string) $input['target_key'], 0, 128);
    $reason = isset($input['reason']) ? mb_substr((string) $input['reason'], 0, 40) : 'other';
    $detail = isset($input['detail']) ? mb_substr((string) $input['detail'], 0, 500) : null;

    $viewer = Auth::getUser();
    $reporterMb  = $viewer ? (string) $viewer['mb_id'] : null;
    // 비회원은 device_id sig 검증된 X-Device-Id 사용
    $reporterDev = null;
    if (!$reporterMb && !empty($_SERVER['HTTP_X_DEVICE_ID']) && !empty($_SERVER['HTTP_X_DEVICE_SIG'])) {
        $devId  = (string) $_SERVER['HTTP_X_DEVICE_ID'];
        $devSig = (string) $_SERVER['HTTP_X_DEVICE_SIG'];
        if (class_exists('DeviceSig') && DeviceSig::verify($devId, $devSig)) {
            $reporterDev = $devId;
        }
    }

    if (!$reporterMb && !$reporterDev) {
        Response::error('Reporter identity required (login or signed device).', 401);
    }
    // 글 · 댓글은 있고 읽을 수 있는 것만 — 없는 글 · 권한 밖 글은 같은 404(있는지 드러내지 않게).
    if (($type === 'post' || $type === 'comment') && !api_report_target_readable($viewer ?: null, $type, $key)) {
        Response::error('Report target not found.', 404);
    }
    // 이미지 신고의 원래 글도 같은 기준 — 읽을 수 없는 글의 사진은 신고하지 못한다(옛 키는 원래 글을 모르니 그대로).
    if ($type === 'image') {
        $imageParts = api_report_image_parts($key);
        // 옛 키(주소만)는 이 사이트의 에디터 사진 주소일 때만 받는다 — 아무 주소나 관리자 화면에 심지 못하게.
        if (!$imageParts && api_report_legacy_image_path($key) === null) {
            Response::error('Report target not found.', 404);
        }
        if ($imageParts && (
            !api_report_target_readable($viewer ?: null, 'post', $imageParts[0] . '/' . $imageParts[1])
            || !api_report_image_in_post($imageParts[0], $imageParts[1], $imageParts[2])
        )) {
            Response::error('Report target not found.', 404);
        }
    }

    $table = DB::table('content_report_table');
    if ($reporterMb) {
        $recentReports = DB::count(
            "SELECT COUNT(*) FROM `{$table}`
             WHERE reporter_mb = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            [$reporterMb]
        );
    } else {
        $recentReports = DB::count(
            "SELECT COUNT(*) FROM `{$table}`
             WHERE reporter_dev = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            [$reporterDev]
        );
    }
    if ($recentReports >= 10) {
        Response::error('Too many reports. Please try again later.', 429);
    }
    // 비회원은 기기 id 를 바꿔 가며(devices/sign 은 IP 당 시간 20개) 한도를 늘릴 수 있으니 발신 IP 로도 총량을 묶는다.
    if (!$reporterMb) {
        api_require_write_quota('guestreport', null, 5, 20);
    }

    try {
        DB::execute(
            "INSERT INTO `{$table}`
                (target_type, target_key, reporter_mb, reporter_dev, reason, detail, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'open', NOW())",
            [$type, $key, $reporterMb, $reporterDev, $reason, $detail]
        );
        $reportId = (int) DB::lastInsertId();
    } catch (\PDOException $e) {
        // UNIQUE 위반 — 같은 사람/기기가 같은 컨텐츠 재신고
        if (strpos($e->getMessage(), 'Duplicate') !== false || (int) $e->getCode() === 23000) {
            Response::success(['message' => '이미 신고하셨습니다.', 'duplicate' => true]);
        }
        throw $e;
    }

    // 같은 컨텐츠에 open 신고 3건 이상이면 자동 가림 (응답에 hint).
    $openCount = DB::count(
        "SELECT COUNT(*) FROM `{$table}` WHERE target_type = ? AND target_key = ? AND status = 'open'",
        [$type, $key]
    );
    $authenticatedOpenCount = DB::count(
        "SELECT COUNT(*) FROM `{$table}`
         WHERE target_type = ? AND target_key = ? AND status = 'open' AND reporter_mb IS NOT NULL AND reporter_mb <> ''",
        [$type, $key]
    );
    $autoHidden = $authenticatedOpenCount >= API_REPORT_AUTO_HIDE_THRESHOLD
        ? api_report_auto_hide_target($type, $key, $reportId)
        : false;
    api_report_notify_admin($type, $reason, $openCount, (bool) $autoHidden, $reporterMb);

    Response::success([
        'report_id'  => $reportId,
        'open_count' => $openCount,
        'authenticated_open_count' => $authenticatedOpenCount,
        'auto_hidden' => $autoHidden,
    ]);
}

// -------------------------------------------------------------------------
// GET /v1/reports?status=open  (admin)
// -------------------------------------------------------------------------
if ($apiMethod === 'GET' && $action === '') {
    $member = Auth::requireAuth();
    if (Auth::adminRole($member) !== 'super') {
        Response::error('Forbidden.', 403);
    }
    $status = isset($_GET['status']) ? (string) $_GET['status'] : 'open';
    if (!in_array($status, ['open', 'closed', 'dismissed'], true)) $status = 'open';
    $limit = isset($_GET['per_page']) ? min(100, max(1, (int) $_GET['per_page'])) : 20;
    $page  = api_page_number();
    $offset = ($page - 1) * $limit;

    $table = DB::table('content_report_table');
    $rows = DB::fetchAll(
        "SELECT * FROM `{$table}` WHERE status = ? ORDER BY report_id DESC LIMIT ?, ?",
        [$status, $offset, $limit]
    );
    foreach ($rows as &$row) {
        $row = array_merge(
            $row,
            api_report_target_summary((string) $row['target_type'], (string) $row['target_key'])
        );
    }
    unset($row);
    $total = DB::count("SELECT COUNT(*) FROM `{$table}` WHERE status = ?", [$status]);
    Response::paginated($rows, $total, $page, $limit);
}

// -------------------------------------------------------------------------
// PATCH /v1/reports/{id}  (admin)
// -------------------------------------------------------------------------
if ($apiMethod === 'PATCH' && $action !== '') {
    $member = Auth::requireAuth();
    if (Auth::adminRole($member) !== 'super') {
        Response::error('Forbidden.', 403);
    }
    $reportId = (int) $action;
    if ($reportId <= 0) Response::error('Invalid report id.', 422);

    $input = get_request_body();
    $status = isset($input['status']) ? (string) $input['status'] : '';
    if (!in_array($status, ['open', 'closed', 'dismissed'], true)) {
        Response::error('Invalid status.', 422);
    }

    $table = DB::table('content_report_table');
    DB::execute(
        "UPDATE `{$table}`
            SET status = ?, closed_by = ?, closed_at = (CASE WHEN ? IN ('closed','dismissed') THEN NOW() ELSE NULL END)
          WHERE report_id = ?",
        [$status, (string) $member['mb_id'], $status, $reportId]
    );
    // 기각하면 — 남은 회원 신고가 기준보다 적을 때 자동으로 가린 글을 원래대로 돌려놓는다.
    $restored = false;
    if ($status === 'dismissed') {
        $report = DB::fetch("SELECT target_type, target_key FROM `{$table}` WHERE report_id = ? LIMIT 1", [$reportId]);
        if ($report) {
            $restored = api_report_restore_after_dismiss((string) $report['target_type'], (string) $report['target_key']);
        }
    }
    Response::success(['report_id' => $reportId, 'status' => $status, 'restored' => $restored]);
}

Response::error('Not found.', 404);
