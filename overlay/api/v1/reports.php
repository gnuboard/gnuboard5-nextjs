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

function api_report_target_parts(string $key): ?array
{
    if (!preg_match('/^([A-Za-z0-9_]+)\/([0-9]+)$/', $key, $m)) {
        return null;
    }

    $bo_table = api_sanitize_bo_table($m[1]);
    if (!$bo_table || $bo_table !== $m[1]) {
        return null;
    }

    return [$bo_table, (int) $m[2]];
}

function api_report_option_with_secret(string $option): string
{
    $parts = array_filter(array_map('trim', explode(',', $option)), static function ($v) {
        return $v !== '';
    });
    if (!in_array('secret', $parts, true)) {
        $parts[] = 'secret';
    }
    return implode(',', array_values(array_unique($parts)));
}

function api_report_auto_hide_target(string $type, string $key): bool
{
    if (!in_array($type, ['post', 'comment'], true)) {
        return false;
    }

    $parts = api_report_target_parts($key);
    if (!$parts) {
        return false;
    }

    [$bo_table, $wr_id] = $parts;
    if (!api_get_board($bo_table)) {
        return false;
    }

    $write_table = DB::writeTable($bo_table);
    $isComment = $type === 'comment' ? 1 : 0;
    $row = DB::fetch(
        "SELECT wr_id, wr_option, wr_10
           FROM {$write_table}
          WHERE wr_id = ? AND wr_is_comment = ?
          LIMIT 1",
        [$wr_id, $isComment]
    );
    if (!$row || !$row['wr_id']) {
        return false;
    }

    if ((string) ($row['wr_10'] ?? '') === 'report_hidden') {
        return true;
    }

    DB::execute(
        "UPDATE {$write_table}
            SET wr_option = ?, wr_10 = 'report_hidden', wr_last = ?
          WHERE wr_id = ? AND wr_is_comment = ?",
        [
            api_report_option_with_secret((string) ($row['wr_option'] ?? '')),
            date('Y-m-d H:i:s'),
            $wr_id,
            $isComment,
        ]
    );

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
    $autoHidden = $authenticatedOpenCount >= 3 ? api_report_auto_hide_target($type, $key) : false;

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
    $page  = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
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
    Response::success(['report_id' => $reportId, 'status' => $status]);
}

Response::error('Not found.', 404);
