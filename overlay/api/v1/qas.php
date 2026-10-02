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

function api_qa_clean_content($value)
{
    $value = trim((string) $value);
    if (substr_count($value, '&#') > 50) {
        Response::error('Invalid content.', 422);
    }

    if (function_exists('clean_xss_tags')) {
        $value = clean_xss_tags($value, 1, 1);
    } else {
        $value = strip_tags($value);
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, 65536, 'UTF-8');
    }

    return substr($value, 0, 65536);
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
        'qa_content'     => isset($row['qa_content']) ? (string) $row['qa_content'] : '',
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

function api_qa_validate_category($category, $qaConfig, $required = true)
{
    $categories = api_qa_categories($qaConfig);

    if (!$categories) {
        return '';
    }

    if ($category === '' && $required) {
        Response::error('Please select a category.', 422);
    }

    if ($category !== '' && !in_array($category, $categories, true)) {
        Response::error('Invalid Q&A category.', 422);
    }

    return $category;
}

function api_qa_question_payload($input, $qaConfig, $member)
{
    $category = api_qa_clean_text(isset($input['qa_category']) ? $input['qa_category'] : '', 255);
    $category = api_qa_validate_category($category, $qaConfig, true);

    $email = '';
    if (!empty($input['qa_email'])) {
        $email = function_exists('get_email_address')
            ? get_email_address(trim((string) $input['qa_email']))
            : trim((string) $input['qa_email']);
    }
    if ((int) ($qaConfig['qa_req_email'] ?? 0) === 1 && $email === '') {
        Response::error('Please enter an email address.', 422);
    }

    $hp = isset($input['qa_hp']) ? preg_replace('/[^0-9\-]/', '', (string) $input['qa_hp']) : '';
    if ((int) ($qaConfig['qa_req_hp'] ?? 0) === 1 && $hp === '') {
        Response::error('Please enter a mobile phone number.', 422);
    }

    $subject = api_qa_clean_text(isset($input['qa_subject']) ? $input['qa_subject'] : '', 255);
    $content = api_qa_clean_content(isset($input['qa_content']) ? $input['qa_content'] : '');

    if ($subject === '') {
        Response::error('Please enter a subject.', 422);
    }
    if ($content === '') {
        Response::error('Please enter content.', 422);
    }

    return [
        'qa_category'   => $category,
        'qa_email'      => $email,
        'qa_hp'         => $hp,
        'qa_subject'    => $subject,
        'qa_content'    => $content,
        'qa_email_recv' => !empty($input['qa_email_recv']) ? 1 : 0,
        'qa_sms_recv'   => !empty($input['qa_sms_recv']) ? 1 : 0,
        'qa_html'       => isset($input['qa_html']) ? (int) $input['qa_html'] : 0,
        'qa_name'       => isset($member['mb_nick']) && $member['mb_nick'] !== ''
            ? $member['mb_nick']
            : (isset($member['mb_name']) ? $member['mb_name'] : $member['mb_id']),
    ];
}

function api_qa_answer_payload($input)
{
    $subject = api_qa_clean_text(isset($input['qa_subject']) ? $input['qa_subject'] : '', 255);
    $content = api_qa_clean_content(isset($input['qa_content']) ? $input['qa_content'] : '');

    if ($subject === '') {
        Response::error('Please enter an answer subject.', 422);
    }
    if ($content === '') {
        Response::error('Please enter answer content.', 422);
    }

    return [
        'qa_subject' => $subject,
        'qa_content' => $content,
        'qa_html'    => isset($input['qa_html']) ? (int) $input['qa_html'] : 0,
    ];
}

function api_qa_push_answer_notification($question, $answerPayload, $answerId = 0)
{
    $mbId = isset($question['mb_id']) ? trim((string) $question['mb_id']) : '';
    if ($mbId === '' || !class_exists('Notify')) {
        return;
    }

    $qaId = (int) ($question['qa_id'] ?? 0);
    $subject = trim((string) ($question['qa_subject'] ?? ''));
    $body = $subject !== ''
        ? $subject
        : trim((string) ($answerPayload['qa_subject'] ?? '고객센터 답변을 확인해 주세요.'));

    try {
        Notify::emit('qa.answered', $mbId, '1:1 문의 답변이 등록되었어요', $body, [
            'qa_id' => (string) $qaId,
            'qa_answer_id' => (string) ((int) $answerId),
            'qa_category' => (string) ($question['qa_category'] ?? ''),
            'link' => '/mypage/qas/' . (int) $qaId,
        ]);
    } catch (\Throwable $e) {
        error_log('[api_qa_push_answer_notification] ' . $e->getMessage());
    }
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

    Response::success(api_qa_normalize_row($row, $me, true, true));
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
        $payload = api_qa_answer_payload($input);
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
        $payload = api_qa_question_payload($input, $qaConfig, $me);
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
    $payload = api_qa_answer_payload($input);
    $now = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $adminName = isset($me['mb_nick']) && $me['mb_nick'] !== '' ? $me['mb_nick'] : $me['mb_id'];

    $answer = DB::fetch(
        "SELECT * FROM {$qaContentTable}
         WHERE qa_type = 1 AND qa_parent = ?
         ORDER BY qa_id DESC
         LIMIT 1",
        [$qaId]
    );
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

    api_qa_push_answer_notification($question, $payload, $answerId);
    // 그누보드 훅 — 답변은 $w = 'a', $write 는 질문, 마지막 인자가 답변 글 번호
    api_run_event('qawrite_update', array($qaId, $question, 'a', api_qa_config(), $answerId), $me);

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
