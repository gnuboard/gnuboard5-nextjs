<?php
/**
 * Gnuboard5 REST API - 1:1 Q&A Endpoints
 *
 * Routes handled (prefix: v1/qas):
 *   GET    /v1/qas/config           - Q&A config/category info
 *   GET    /v1/qas                  - my Q&A list, or admin list with ?scope=admin
 *   POST   /v1/qas                  - create a question
 *   GET    /v1/qas/{qa_id}          - question detail with answer
 *   PATCH  /v1/qas/{qa_id}          - update pending question or admin answer
 *   DELETE /v1/qas/{qa_id}          - delete question/answer
 *   POST   /v1/qas/{qa_id}/answer   - create or update admin answer
 */

if (!defined('_GNUBOARD_')) exit;

global $g5, $config;

if (!isset($g5['qa_config_table']) || !isset($g5['qa_content_table'])) {
    Response::error('Q&A tables are not configured.', 501);
}

$qaConfigTable  = DB::table('qa_config_table');
$qaContentTable = DB::table('qa_content_table');

require_once __DIR__ . '/qas_attachments.php';
require_once __DIR__ . '/qas_content.php';
require_once __DIR__ . '/qas_notify.php';
require_once __DIR__ . '/qas_payload.php';

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';
$seg1 = isset($apiSegments[1]) ? $apiSegments[1] : '';

function api_qa_is_admin($member)
{
    return $member && Auth::adminRole($member) === 'super';
}

function api_qa_config()
{
    $table = DB::table('qa_config_table');
    $row = DB::fetch("SELECT * FROM {$table} ORDER BY qa_id ASC LIMIT 1");
    return $row ?: [];
}

function api_qa_categories($qaConfig)
{
    $raw = isset($qaConfig['qa_category']) ? (string) $qaConfig['qa_category'] : '';
    if (trim($raw) === '') {
        return [];
    }

    return array_values(array_filter(array_map('trim', explode('|', $raw)), 'strlen'));
}

function api_qa_clean_text($value, $maxLength = 255)
{
    $value = trim((string) $value);
    if (function_exists('clean_xss_tags')) {
        $value = clean_xss_tags($value, 1, 1);
    } else {
        $value = strip_tags($value);
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maxLength, 'UTF-8');
    }

    return substr($value, 0, $maxLength);
}

function api_qa_normalize_config($qaConfig)
{
    return [
        'qa_title'              => isset($qaConfig['qa_title']) ? (string) $qaConfig['qa_title'] : '1:1 문의',
        'qa_category'           => isset($qaConfig['qa_category']) ? (string) $qaConfig['qa_category'] : '',
        'categories'            => api_qa_categories($qaConfig),
        'qa_use_email'          => (int) ($qaConfig['qa_use_email'] ?? 0),
        'qa_req_email'          => (int) ($qaConfig['qa_req_email'] ?? 0),
        'qa_use_hp'             => (int) ($qaConfig['qa_use_hp'] ?? 0),
        'qa_req_hp'             => (int) ($qaConfig['qa_req_hp'] ?? 0),
        'qa_use_sms'            => (int) ($qaConfig['qa_use_sms'] ?? 0),
        // 그누보드처럼 사이트 에디터(cf_editor)가 있고 이 값이 1 일 때 질문 · 답변을 웹 에디터로 쓴다.
        'qa_use_editor'         => (int) ($qaConfig['qa_use_editor'] ?? 0),
        'qa_subject_len'        => (int) ($qaConfig['qa_subject_len'] ?? 60),
        'qa_page_rows'          => (int) ($qaConfig['qa_page_rows'] ?? 15),
        'qa_mobile_page_rows'   => (int) ($qaConfig['qa_mobile_page_rows'] ?? 15),
        'qa_insert_content'     => isset($qaConfig['qa_insert_content']) ? (string) $qaConfig['qa_insert_content'] : '',
        'qa_content_head'       => isset($qaConfig['qa_content_head']) ? (string) $qaConfig['qa_content_head'] : '',
        'qa_content_tail'       => isset($qaConfig['qa_content_tail']) ? (string) $qaConfig['qa_content_tail'] : '',
        'qa_mobile_content_head'=> isset($qaConfig['qa_mobile_content_head']) ? (string) $qaConfig['qa_mobile_content_head'] : '',
        'qa_mobile_content_tail'=> isset($qaConfig['qa_mobile_content_tail']) ? (string) $qaConfig['qa_mobile_content_tail'] : '',
    ];
}

function api_qa_normalize_row($row, $viewer, $includeAnswer = false, $includeRelated = false)
{
    $isAdmin = api_qa_is_admin($viewer);
    $isOwner = $viewer && isset($viewer['mb_id']) && $row['mb_id'] === $viewer['mb_id'];

    $item = [
        'qa_id'          => (int) $row['qa_id'],
        'qa_num'         => (int) $row['qa_num'],
        'qa_parent'      => (int) $row['qa_parent'],
        'qa_related'     => (int) $row['qa_related'],
        'mb_id'          => isset($row['mb_id']) ? (string) $row['mb_id'] : '',
        'qa_name'        => isset($row['qa_name']) ? (string) $row['qa_name'] : '',
        'qa_email'       => isset($row['qa_email']) ? (string) $row['qa_email'] : '',
        'qa_hp'          => isset($row['qa_hp']) ? (string) $row['qa_hp'] : '',
        'qa_type'        => (int) ($row['qa_type'] ?? 0),
        'qa_category'    => isset($row['qa_category']) ? (string) $row['qa_category'] : '',
        'qa_email_recv'  => (int) ($row['qa_email_recv'] ?? 0),
        'qa_sms_recv'    => (int) ($row['qa_sms_recv'] ?? 0),
        'qa_html'        => (int) ($row['qa_html'] ?? 0),
        'qa_subject'     => isset($row['qa_subject']) ? (string) $row['qa_subject'] : '',
        'qa_content'     => api_qa_content_for_output($row),
        'qa_status'      => (int) ($row['qa_status'] ?? 0),
        'qa_file1'       => isset($row['qa_file1']) ? (string) $row['qa_file1'] : '',
        'qa_source1'     => isset($row['qa_source1']) ? (string) $row['qa_source1'] : '',
        'qa_file2'       => isset($row['qa_file2']) ? (string) $row['qa_file2'] : '',
        'qa_source2'     => isset($row['qa_source2']) ? (string) $row['qa_source2'] : '',
        'qa_file1_url'   => api_qa_file_url($row['qa_file1'] ?? ''),
        'qa_file2_url'   => api_qa_file_url($row['qa_file2'] ?? ''),
        'qa_datetime'    => isset($row['qa_datetime']) ? (string) $row['qa_datetime'] : '',
        'can_edit'       => $isAdmin || ($isOwner && (int) ($row['qa_type'] ?? 0) === 0 && (int) ($row['qa_status'] ?? 0) === 0),
        'can_delete'     => $isAdmin || ($isOwner && (int) ($row['qa_type'] ?? 0) === 0 && (int) ($row['qa_status'] ?? 0) === 0),
        'answer'         => null,
        'related_questions' => [],
    ];

    if ($includeAnswer && (int) ($row['qa_type'] ?? 0) === 0 && (int) ($row['qa_status'] ?? 0) === 1) {
        $table = DB::table('qa_content_table');
        $answer = DB::fetch(
            "SELECT * FROM {$table}
             WHERE qa_type = 1 AND qa_parent = ?
             ORDER BY qa_id DESC
             LIMIT 1",
            [(int) $row['qa_id']]
        );
        if ($answer) {
            $item['answer'] = api_qa_normalize_row($answer, $viewer, false);
        }
    }

    if ($includeRelated && (int) ($row['qa_type'] ?? 0) === 0) {
        $item['related_questions'] = api_qa_related_questions($row, $viewer);
    }

    return $item;
}

/**
 * 질문의 이전글 · 다음글 — 그누보드 bbs/qaview.php 와 같다. 이전글은 qa_num 이 작은 쪽(더 최근 질문),
 * 다음글은 큰 쪽이고, 최고관리자가 아니면 자기 질문 안에서만 찾는다. 답변 글이면 둘 다 null.
 */
function api_qa_neighbors($row, $viewer)
{
    $neighbors = ['prev' => null, 'next' => null];
    if ((int) ($row['qa_type'] ?? 0) !== 0) {
        return $neighbors;
    }

    $table = DB::table('qa_content_table');
    $where = 'qa_type = 0';
    $params = [];
    if (!api_qa_is_admin($viewer)) {
        $where .= ' AND mb_id = ?';
        $params[] = $viewer['mb_id'];
    }
    $num = (int) ($row['qa_num'] ?? 0);

    $queries = [
        'prev' => "SELECT qa_id, qa_subject FROM {$table} WHERE {$where} AND qa_num < ? ORDER BY qa_num DESC LIMIT 1",
        'next' => "SELECT qa_id, qa_subject FROM {$table} WHERE {$where} AND qa_num > ? ORDER BY qa_num ASC LIMIT 1",
    ];
    foreach ($queries as $key => $sql) {
        $found = DB::fetch($sql, array_merge($params, [$num]));
        if ($found) {
            $neighbors[$key] = ['qa_id' => (int) $found['qa_id'], 'qa_subject' => (string) $found['qa_subject']];
        }
    }

    return $neighbors;
}

function api_qa_related_questions($row, $viewer, $limit = 10)
{
    $related = (int) ($row['qa_related'] ?? 0);
    $qaId = (int) ($row['qa_id'] ?? 0);
    if ($related <= 0 || $qaId <= 0) {
        return [];
    }

    $table = DB::table('qa_content_table');
    $params = [$qaId, $related, max(1, (int) $limit)];
    $sql = "SELECT *
            FROM {$table}
            WHERE qa_id <> ?
              AND qa_related = ?
              AND qa_type = 0";

    if (!api_qa_is_admin($viewer)) {
        $sql .= " AND mb_id = ?";
        $params[] = $viewer['mb_id'];
    }

    $sql .= " ORDER BY qa_num ASC, qa_type ASC LIMIT ?";

    if (!api_qa_is_admin($viewer)) {
        $params = [$qaId, $related, $viewer['mb_id'], max(1, (int) $limit)];
    }

    $rows = DB::fetchAll($sql, $params);
    $items = [];
    foreach ($rows as $relatedRow) {
        $items[] = api_qa_normalize_row($relatedRow, $viewer, false, false);
    }

    return $items;
}

function api_qa_find($qaId, $viewer)
{
    $table = DB::table('qa_content_table');
    $params = [(int) $qaId];
    $sql = "SELECT * FROM {$table} WHERE qa_id = ?";

    if (!api_qa_is_admin($viewer)) {
        $sql .= " AND mb_id = ?";
        $params[] = $viewer['mb_id'];
    }

    $sql .= " LIMIT 1";
    return DB::fetch($sql, $params);
}

function api_qa_find_reply_source($qaId, $viewer)
{
    $qaId = (int) $qaId;
    if ($qaId <= 0) {
        return null;
    }

    $table = DB::table('qa_content_table');
    $params = [$qaId];
    $sql = "SELECT * FROM {$table} WHERE qa_id = ?";

    if (!api_qa_is_admin($viewer)) {
        $sql .= " AND mb_id = ?";
        $params[] = $viewer['mb_id'];
    }

    $sql .= " LIMIT 1";
    return DB::fetch($sql, $params);
}

// -------------------------------------------------------------------------
// GET /v1/qas/config
// -------------------------------------------------------------------------
if ($seg0 === 'config' && $apiMethod === 'GET') {
    Auth::requireAuth();
    Response::success(api_qa_normalize_config(api_qa_config()));
}

// -------------------------------------------------------------------------
// GET /v1/qas
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'GET') {
    $me = Auth::requireAuth();
    $isAdminScope = isset($_GET['scope']) && $_GET['scope'] === 'admin' && api_qa_is_admin($me);

    $page    = get_page_param(1);
    $qaConfig = api_qa_config();
    $defaultRows = (int) ($qaConfig['qa_page_rows'] ?? 15);
    $perPage = get_per_page_param($defaultRows > 0 ? $defaultRows : 15, 100);
    $offset  = ($page - 1) * $perPage;

    $conditions = ['qa_type = 0'];
    $params = [];

    if (!$isAdminScope) {
        $conditions[] = 'mb_id = ?';
        $params[] = $me['mb_id'];
    }

    if (isset($_GET['status']) && $_GET['status'] !== '') {
        $status = (int) $_GET['status'];
        if ($status === 0 || $status === 1) {
            $conditions[] = 'qa_status = ?';
            $params[] = $status;
        }
    }

    if (isset($_GET['sca']) && trim((string) $_GET['sca']) !== '') {
        $conditions[] = 'qa_category = ?';
        $params[] = trim((string) $_GET['sca']);
    }

    if (isset($_GET['stx']) && trim((string) $_GET['stx']) !== '') {
        $stx = trim((string) $_GET['stx']);
        $sfl = isset($_GET['sfl']) ? trim((string) $_GET['sfl']) : 'qa_subject';
        $allowed = ['qa_subject', 'qa_content', 'qa_name', 'mb_id'];
        if (!in_array($sfl, $allowed, true)) {
            $sfl = 'qa_subject';
        }
        $conditions[] = "{$sfl} LIKE ?";
        $params[] = '%' . $stx . '%';
    }

    $where = 'WHERE ' . implode(' AND ', $conditions);
    $total = DB::count("SELECT COUNT(*) FROM {$qaContentTable} {$where}", $params);
    $rows = DB::fetchAll(
        "SELECT *
         FROM {$qaContentTable}
         {$where}
         ORDER BY qa_num ASC, qa_id DESC
         LIMIT ? OFFSET ?",
        array_merge($params, [$perPage, $offset])
    );

    $items = [];
    foreach ($rows as $row) {
        $items[] = api_qa_normalize_row($row, $me, false);
    }

    Response::paginated($items, $total, $page, $perPage);
}

// -------------------------------------------------------------------------
// POST /v1/qas
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    $qaConfig = api_qa_config();
    $input = get_request_body();
    $payload = api_qa_question_payload($input, $qaConfig, $me);
    $replySourceId = 0;
    if (isset($input['qa_reply_to'])) {
        $replySourceId = (int) $input['qa_reply_to'];
    } elseif (isset($input['reply_to'])) {
        $replySourceId = (int) $input['reply_to'];
    }
    $replySource = api_qa_find_reply_source($replySourceId, $me);

    if ($replySourceId > 0 && !$replySource) {
        Response::error('Original Q&A item not found.', 404);
    }

    // 새 문의마다 관리자에게 메일 · 문자(유료)가 나간다(qas_notify.php). 그누보드 화면은 폼 토큰만 보지만 API 는 바로
    // 부를 수 있으므로 회원별 1분 3건 · 1시간 20건까지(글쓰기와 같은 수 — 앱의 리뷰 · 쪽지 신고도 이 길로 온다).
    // 문의 표가 아니라 지울 수 없는 기록으로 세어, 대기 중인 문의를 지워 한도를 되돌리지 못한다. 관리자는 빼 준다.
    // 계정을 여러 개 만들어 돌려 쓰지 못하게 IP 로도 센다. 기록 표가 없으면 막는다(문자 비용이 걸려 있다).
    if (!api_qa_is_admin($me)) {
        $qaQuotaMsg = Throttle::checkMemberQuota('qacreate', (string) $me['mb_id'], 3, 20, true, true);
        if ($qaQuotaMsg === null) {
            $qaIp = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
            $qaQuotaMsg = Throttle::checkMemberQuota('qacreateip', 'ip:' . $qaIp, 5, 30, true, true);
        }
        if ($qaQuotaMsg !== null) {
            Response::error($qaQuotaMsg, 429);
        }
    }

    $row = DB::fetch("SELECT COALESCE(MIN(qa_num), 0) - 1 AS next_num FROM {$qaContentTable}");
    $qaNum = $row ? (int) $row['next_num'] : -1;
    $now = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $attachments = api_qa_process_attachments(null, $qaConfig, api_qa_is_admin($me));

    DB::execute(
        "INSERT INTO {$qaContentTable}
            (qa_num, qa_parent, qa_related, mb_id, qa_name, qa_email, qa_hp,
             qa_type, qa_category, qa_email_recv, qa_sms_recv, qa_html,
             qa_subject, qa_content, qa_file1, qa_source1, qa_file2, qa_source2,
             qa_status, qa_ip, qa_datetime)
         VALUES (?, 0, 0, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        [
            $qaNum,
            $me['mb_id'],
            $payload['qa_name'],
            $payload['qa_email'],
            $payload['qa_hp'],
            $payload['qa_category'],
            $payload['qa_email_recv'],
            $payload['qa_sms_recv'],
            $payload['qa_html'],
            $payload['qa_subject'],
            $payload['qa_content'],
            $attachments['qa_file1'],
            $attachments['qa_source1'],
            $attachments['qa_file2'],
            $attachments['qa_source2'],
            $ip,
            $now,
        ]
    );

    $qaId = (int) DB::lastInsertId();
    $qaRelated = $qaId;
    if ($replySource && (int) ($replySource['qa_related'] ?? 0) > 0) {
        $qaRelated = (int) $replySource['qa_related'];
    }

    DB::execute(
        "UPDATE {$qaContentTable}
         SET qa_parent = ?, qa_related = ?
         WHERE qa_id = ?",
        [$qaId, $qaRelated, $qaId]
    );

    $created = api_qa_find($qaId, $me);
    // 그누보드 훅(bbs/qawrite_update.php 와 같은 인자) — 새 글은 $w = '', 답글 문의는 $w = 'r'(원글이 $write)
    api_run_event('qawrite_update', array($qaId, $replySource ?: array(), $replySource ? 'r' : '', $qaConfig, null), $me);
    // 관리자에게 새 문의 메일 · 문자 — 그누보드 qawrite_update.php 와 같은 조건(qas_notify.php)
    $siteConfig = isset($GLOBALS['config']) && is_array($GLOBALS['config']) ? $GLOBALS['config'] : [];
    api_qa_send_notifications(
        api_qa_notification_plan($replySource ? 'r' : '', $created ?: [], $payload['qa_content'], $payload['qa_html'], $qaConfig, $siteConfig),
        $siteConfig
    );
    Response::success(api_qa_normalize_row($created, $me, true), 201);
}

$qaId = ctype_digit((string) $seg0) ? (int) $seg0 : 0;

// -------------------------------------------------------------------------
// GET /v1/qas/{qa_id}
// -------------------------------------------------------------------------
if ($qaId > 0 && !$seg1 && $apiMethod === 'GET') {
    $me = Auth::requireAuth();
    $row = api_qa_find($qaId, $me);
    if (!$row) {
        Response::error('Q&A item not found.', 404);
    }

    Response::success(api_qa_normalize_row($row, $me, true, true) + api_qa_neighbors($row, $me));
}

// -------------------------------------------------------------------------
// PATCH /v1/qas/{qa_id}
// -------------------------------------------------------------------------
$isMultipartPatch = $apiMethod === 'POST'
    && isset($_POST['_method'])
    && strtoupper((string) $_POST['_method']) === 'PATCH';

if ($qaId > 0 && !$seg1 && ($apiMethod === 'PATCH' || $isMultipartPatch)) {
    $me = Auth::requireAuth();
    $row = api_qa_find($qaId, $me);
    if (!$row) {
        Response::error('Q&A item not found.', 404);
    }

    $isAdmin = api_qa_is_admin($me);
    if (!$isAdmin && ((int) $row['qa_type'] !== 0 || (int) $row['qa_status'] !== 0 || $row['mb_id'] !== $me['mb_id'])) {
        Response::error('You cannot edit answered Q&A items.', 403);
    }

    $input = get_request_body();

    if ((int) $row['qa_type'] === 1) {
        if (!$isAdmin) {
            Response::error('Administrator privileges required.', 403);
        }
        $payload = api_qa_answer_payload($input, (int) $row['qa_html']);
        $qaConfig = api_qa_config();
        $attachments = api_qa_process_attachments($row, $qaConfig, $isAdmin);
        DB::execute(
            "UPDATE {$qaContentTable}
             SET qa_subject = ?, qa_content = ?, qa_html = ?,
                 qa_file1 = ?, qa_source1 = ?, qa_file2 = ?, qa_source2 = ?
             WHERE qa_id = ?",
            [
                $payload['qa_subject'],
                $payload['qa_content'],
                $payload['qa_html'],
                $attachments['qa_file1'],
                $attachments['qa_source1'],
                $attachments['qa_file2'],
                $attachments['qa_source2'],
                $qaId,
            ]
        );
    } else {
        $qaConfig = api_qa_config();
        $payload = api_qa_question_payload($input, $qaConfig, $me, (int) $row['qa_html']);
        $attachments = api_qa_process_attachments($row, $qaConfig, $isAdmin);
        DB::execute(
            "UPDATE {$qaContentTable}
             SET qa_email = ?, qa_hp = ?, qa_category = ?, qa_email_recv = ?,
                 qa_sms_recv = ?, qa_html = ?, qa_subject = ?, qa_content = ?,
                 qa_file1 = ?, qa_source1 = ?, qa_file2 = ?, qa_source2 = ?
             WHERE qa_id = ?",
            [
                $payload['qa_email'],
                $payload['qa_hp'],
                $payload['qa_category'],
                $payload['qa_email_recv'],
                $payload['qa_sms_recv'],
                $payload['qa_html'],
                $payload['qa_subject'],
                $payload['qa_content'],
                $attachments['qa_file1'],
                $attachments['qa_source1'],
                $attachments['qa_file2'],
                $attachments['qa_source2'],
                $qaId,
            ]
        );
    }

    $updated = api_qa_find($qaId, $me);
    // 그누보드 훅 — 수정은 $w = 'u', $write 는 고치기 전 글
    api_run_event('qawrite_update', array($qaId, $row, 'u', api_qa_config(), null), $me);
    Response::success(api_qa_normalize_row($updated, $me, true, true));
}

// -------------------------------------------------------------------------
// POST /v1/qas/{qa_id}/answer
// -------------------------------------------------------------------------
if ($qaId > 0 && $seg1 === 'answer' && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    if (!api_qa_is_admin($me)) {
        Response::error('Administrator privileges required.', 403);
    }

    $question = DB::fetch(
        "SELECT * FROM {$qaContentTable}
         WHERE qa_id = ? AND qa_type = 0
         LIMIT 1",
        [$qaId]
    );
    if (!$question) {
        Response::error('Question not found.', 404);
    }

    $input = get_request_body();
    $now = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $adminName = isset($me['mb_nick']) && $me['mb_nick'] !== '' ? $me['mb_nick'] : $me['mb_id'];

    // 같은 질문에 답변이 동시에 두 번 들어오면(두 탭 · 두 번 누름) 둘 다 "답변 없음"을 보고 답변 2개 · 메일 2통이
    // 생긴다. 확인부터 저장까지를 MySQL 이름 잠금으로 한 줄로 세운다 — 표 엔진(MyISAM 포함)과 상관없고,
    // 중간에 응답이 끝나도 DB 연결과 함께 풀린다.
    $answerLock = substr('g5qa:' . $qaContentTable . ':' . $qaId, 0, 64);
    DB::fetch('SELECT GET_LOCK(?, 10) AS locked', [$answerLock]);

    $answer = DB::fetch(
        "SELECT * FROM {$qaContentTable}
         WHERE qa_type = 1 AND qa_parent = ?
         ORDER BY qa_id DESC
         LIMIT 1",
        [$qaId]
    );
    // 답변을 고칠 때 qa_html 을 보내지 않으면 원래 형식을 지킨다(api_qa_html_flag).
    $payload = api_qa_answer_payload($input, $answer ? (int) $answer['qa_html'] : 0);
    $answerId = 0;
    $qaConfig = api_qa_config();

    if ($answer) {
        $answerId = (int) $answer['qa_id'];
        $attachments = api_qa_process_attachments($answer, $qaConfig, true);
        DB::execute(
            "UPDATE {$qaContentTable}
             SET qa_name = ?, qa_subject = ?, qa_content = ?, qa_html = ?,
                 qa_file1 = ?, qa_source1 = ?, qa_file2 = ?, qa_source2 = ?
             WHERE qa_id = ?",
            [
                $adminName,
                $payload['qa_subject'],
                $payload['qa_content'],
                $payload['qa_html'],
                $attachments['qa_file1'],
                $attachments['qa_source1'],
                $attachments['qa_file2'],
                $attachments['qa_source2'],
                (int) $answer['qa_id'],
            ]
        );
    } else {
        $attachments = api_qa_process_attachments(null, $qaConfig, true);
        DB::execute(
            "INSERT INTO {$qaContentTable}
                (qa_num, qa_parent, qa_related, mb_id, qa_name, qa_email, qa_hp,
                 qa_type, qa_category, qa_email_recv, qa_sms_recv, qa_html,
                 qa_subject, qa_content, qa_file1, qa_source1, qa_file2, qa_source2,
                 qa_status, qa_ip, qa_datetime)
             VALUES (?, ?, ?, ?, ?, '', '', 1, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            [
                (int) $question['qa_num'],
                $qaId,
                (int) $question['qa_related'],
                $me['mb_id'],
                $adminName,
                $question['qa_category'],
                $payload['qa_html'],
                $payload['qa_subject'],
                $payload['qa_content'],
                $attachments['qa_file1'],
                $attachments['qa_source1'],
                $attachments['qa_file2'],
                $attachments['qa_source2'],
                $ip,
                $now,
            ]
        );
        $answerId = (int) DB::lastInsertId();
    }

    DB::execute(
        "UPDATE {$qaContentTable}
         SET qa_status = 1
         WHERE qa_id = ?",
        [$qaId]
    );
    DB::fetch('SELECT RELEASE_LOCK(?) AS released', [$answerLock]);

    // 그누보드 훅 — 답변은 $w = 'a', $write 는 질문, 마지막 인자가 답변 글 번호
    api_run_event('qawrite_update', array($qaId, $question, 'a', api_qa_config(), $answerId), $me);
    // 질문자에게 알림(앱 푸시 · 메일 · 문자) — 새 답변일 때만. 답변을 고칠 때마다 "답변이 등록되었어요"가
    // 다시 가지 않게(그누보드도 답변 수정은 알리지 않는다).
    if (!$answer) {
        api_qa_push_answer_notification($question, $payload, $answerId);
        $siteConfig = isset($GLOBALS['config']) && is_array($GLOBALS['config']) ? $GLOBALS['config'] : [];
        api_qa_send_notifications(
            api_qa_notification_plan('a', $question, $payload['qa_content'], $payload['qa_html'], $qaConfig, $siteConfig),
            $siteConfig
        );
    }

    $updated = DB::fetch(
        "SELECT * FROM {$qaContentTable}
         WHERE qa_id = ?
         LIMIT 1",
        [$qaId]
    );
    Response::success(api_qa_normalize_row($updated, $me, true, true));
}

// -------------------------------------------------------------------------
// DELETE /v1/qas/{qa_id}
// -------------------------------------------------------------------------
if ($qaId > 0 && !$seg1 && $apiMethod === 'DELETE') {
    $me = Auth::requireAuth();
    $row = api_qa_find($qaId, $me);
    if (!$row) {
        Response::error('Q&A item not found.', 404);
    }

    $isAdmin = api_qa_is_admin($me);
    $isOwnerPendingQuestion = $row['mb_id'] === $me['mb_id']
        && (int) $row['qa_type'] === 0
        && (int) $row['qa_status'] === 0;

    if (!$isAdmin && !$isOwnerPendingQuestion) {
        Response::error('You do not have permission to delete this Q&A item.', 403);
    }

    if ((int) $row['qa_type'] === 0) {
        api_qa_delete_files($row);
        $answers = DB::fetchAll(
            "SELECT *
             FROM {$qaContentTable}
             WHERE qa_type = 1 AND qa_parent = ?",
            [$qaId]
        );
        $deleted = array();
        foreach ($answers as $answerRow) {
            api_qa_delete_files($answerRow);
            $deleted[] = (int) $answerRow['qa_id'];
        }
        $deleted[] = $qaId;
        DB::execute(
            "DELETE FROM {$qaContentTable}
             WHERE qa_type = 1 AND qa_parent = ?",
            [$qaId]
        );
        DB::execute(
            "DELETE FROM {$qaContentTable}
             WHERE qa_id = ?",
            [$qaId]
        );
    } else {
        api_qa_delete_files($row);
        $deleted = array($qaId);
        DB::execute(
            "DELETE FROM {$qaContentTable}
             WHERE qa_id = ?",
            [$qaId]
        );
        DB::execute(
            "UPDATE {$qaContentTable}
             SET qa_status = 0
             WHERE qa_id = ?",
            [(int) $row['qa_parent']]
        );
    }

    // 그누보드 훅(bbs/qadelete.php) — 요청한 번호 목록과, 답변까지 실제로 지운 번호 목록
    api_run_event('qa_delete', array(array($qaId), $deleted), $me);
    Response::success(['message' => 'Q&A item deleted.']);
}

Response::error('Method not allowed.', 405);
