<?php
/**
 * Gnuboard5 REST API - Poll Endpoints
 *
 * Routes handled (prefix: v1/polls):
 *   GET    /v1/polls                         - poll list
 *   GET    /v1/polls/current                 - latest active poll
 *   GET    /v1/polls/{po_id}                 - poll detail/result
 *   POST   /v1/polls/{po_id}/vote            - vote for an option
 *   POST   /v1/polls/{po_id}/comments        - add poll opinion
 *   DELETE /v1/polls/{po_id}/comments/{pc_id}- delete poll opinion
 */

if (!defined('_GNUBOARD_')) exit;

global $g5, $config;

if (!isset($g5['poll_table']) || !isset($g5['poll_etc_table'])) {
    Response::error('Poll tables are not configured.', 501);
}

$pollTable    = DB::table('poll_table');
$pollEtcTable = DB::table('poll_etc_table');

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';
$seg1 = isset($apiSegments[1]) ? $apiSegments[1] : '';
$seg2 = isset($apiSegments[2]) ? $apiSegments[2] : '';

function api_poll_viewer()
{
    return Auth::getUser();
}

function api_poll_viewer_level($viewer)
{
    return $viewer && isset($viewer['mb_level']) ? (int) $viewer['mb_level'] : 1;
}

function api_poll_current_ip()
{
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
}

function api_poll_csv_contains($csv, $needle)
{
    $needle = (string) $needle;
    if ($needle === '') {
        return false;
    }

    $values = array_filter(array_map('trim', explode(',', (string) $csv)), 'strlen');
    return in_array($needle, $values, true);
}

function api_poll_can_access($poll, $viewer)
{
    return api_poll_viewer_level($viewer) >= (int) $poll['po_level'];
}

function api_poll_has_voted($poll, $viewer)
{
    if ($viewer && !empty($viewer['mb_id'])) {
        return api_poll_csv_contains(isset($poll['mb_ids']) ? $poll['mb_ids'] : '', $viewer['mb_id']);
    }

    return api_poll_csv_contains(isset($poll['po_ips']) ? $poll['po_ips'] : '', api_poll_current_ip());
}

function api_poll_clean_text($value, $maxLength = 255)
{
    $value = trim((string) $value);

    if (function_exists('clean_xss_tags')) {
        $value = clean_xss_tags($value, 1, 1);
    } else {
        $value = strip_tags($value);
    }

    if (function_exists('cut_str')) {
        return cut_str($value, $maxLength, '');
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maxLength, 'UTF-8');
    }

    return substr($value, 0, $maxLength);
}

function api_poll_summary($poll)
{
    return [
        'po_id'      => (int) $poll['po_id'],
        'po_subject' => isset($poll['po_subject']) ? (string) $poll['po_subject'] : '',
        'po_date'    => isset($poll['po_date']) ? (string) $poll['po_date'] : '',
        'po_use'     => isset($poll['po_use']) ? (int) $poll['po_use'] : 0,
    ];
}

function api_poll_options($poll, $includeCounts = true)
{
    $total = 0;
    $max   = 1;

    for ($i = 1; $i <= 9; $i++) {
        $content = isset($poll['po_poll' . $i]) ? (string) $poll['po_poll' . $i] : '';
        if ($content === '') {
            break;
        }

        $count = (int) (isset($poll['po_cnt' . $i]) ? $poll['po_cnt' . $i] : 0);
        $total += $count;
        if ($count > $max) {
            $max = $count;
        }
    }

    $options = [];
    for ($i = 1; $i <= 9; $i++) {
        $content = isset($poll['po_poll' . $i]) ? (string) $poll['po_poll' . $i] : '';
        if ($content === '') {
            break;
        }

        $count = $includeCounts ? (int) (isset($poll['po_cnt' . $i]) ? $poll['po_cnt' . $i] : 0) : 0;
        $rate  = ($includeCounts && $total > 0) ? round(($count / $total) * 100, 2) : 0;
        $bar   = ($includeCounts && $max > 0) ? (int) round(($count / $max) * 100) : 0;

        $options[] = [
            'num'     => $i,
            'content' => $content,
            'count'   => $count,
            'rate'    => $rate,
            'bar'     => $bar,
        ];
    }

    return [
        'options'     => $options,
        'total_count' => $includeCounts ? $total : 0,
    ];
}

function api_poll_comments($poId, $viewer)
{
    $pollEtcTable = DB::table('poll_etc_table');

    $rows = DB::fetchAll(
        "SELECT pc_id, po_id, mb_id, pc_name, pc_idea, pc_datetime
         FROM {$pollEtcTable}
         WHERE po_id = ?
         ORDER BY pc_id DESC",
        [(int) $poId]
    );

    $isSuperAdmin = $viewer && Auth::adminRole($viewer) === 'super';
    $viewerId = $viewer && !empty($viewer['mb_id']) ? $viewer['mb_id'] : '';

    $items = [];
    foreach ($rows as $row) {
        $owner = $viewerId !== '' && !empty($row['mb_id']) && $row['mb_id'] === $viewerId;
        $items[] = [
            'pc_id'       => (int) $row['pc_id'],
            'po_id'       => (int) $row['po_id'],
            'mb_id'       => isset($row['mb_id']) ? (string) $row['mb_id'] : '',
            'pc_name'     => isset($row['pc_name']) ? (string) $row['pc_name'] : '',
            'pc_idea'     => isset($row['pc_idea']) ? (string) $row['pc_idea'] : '',
            'pc_datetime' => isset($row['pc_datetime']) ? (string) $row['pc_datetime'] : '',
            'can_delete'  => $isSuperAdmin || $owner,
        ];
    }

    return $items;
}

function api_poll_other_polls($currentPoId)
{
    $pollTable = DB::table('poll_table');
    $rows = DB::fetchAll(
        "SELECT po_id, po_subject, po_date, po_use
         FROM {$pollTable}
         ORDER BY po_id DESC
         LIMIT 30"
    );

    $items = [];
    foreach ($rows as $row) {
        $summary = api_poll_summary($row);
        $summary['is_current'] = (int) $row['po_id'] === (int) $currentPoId;
        $items[] = $summary;
    }

    return $items;
}

function api_poll_normalize($poll, $viewer = null, $includeRelated = true)
{
    $canAccess = api_poll_can_access($poll, $viewer);
    $hasVoted  = api_poll_has_voted($poll, $viewer);
    $isActive  = (int) $poll['po_use'] === 1;

    $counts = api_poll_options($poll, $canAccess);

    return [
        'po_id'           => (int) $poll['po_id'],
        'po_subject'      => isset($poll['po_subject']) ? (string) $poll['po_subject'] : '',
        'po_etc'          => isset($poll['po_etc']) ? (string) $poll['po_etc'] : '',
        'po_level'        => (int) (isset($poll['po_level']) ? $poll['po_level'] : 0),
        'po_point'        => (int) (isset($poll['po_point']) ? $poll['po_point'] : 0),
        'po_date'         => isset($poll['po_date']) ? (string) $poll['po_date'] : '',
        'po_use'          => (int) (isset($poll['po_use']) ? $poll['po_use'] : 0),
        'is_active'       => $isActive,
        'options'         => $counts['options'],
        'total_count'     => $counts['total_count'],
        'has_voted'       => $hasVoted,
        'can_vote'        => $isActive && $canAccess && !$hasVoted,
        'can_view_result' => $canAccess,
        'can_comment'     => $canAccess && (string) (isset($poll['po_etc']) ? $poll['po_etc'] : '') !== '',
        'etc_comments'    => ($includeRelated && $canAccess) ? api_poll_comments($poll['po_id'], $viewer) : [],
        'other_polls'     => $includeRelated ? api_poll_other_polls($poll['po_id']) : [],
    ];
}

function api_poll_find($poId)
{
    $pollTable = DB::table('poll_table');
    return DB::fetch(
        "SELECT *
         FROM {$pollTable}
         WHERE po_id = ?
         LIMIT 1",
        [(int) $poId]
    );
}

function api_poll_latest_active()
{
    $pollTable = DB::table('poll_table');
    return DB::fetch(
        "SELECT *
         FROM {$pollTable}
         WHERE po_use = 1
         ORDER BY po_id DESC
         LIMIT 1"
    );
}

function api_poll_reload_response($poId, $viewer, $status = 200)
{
    $poll = api_poll_find($poId);
    if (!$poll) {
        Response::error('Poll not found.', 404);
    }

    Response::success(api_poll_normalize($poll, $viewer), $status);
}

// -------------------------------------------------------------------------
// GET /v1/polls/current - latest active poll
// -------------------------------------------------------------------------
if ($seg0 === 'current' && !$seg1 && $apiMethod === 'GET') {
    $viewer = api_poll_viewer();
    $poll = api_poll_latest_active();

    if (!$poll) {
        Response::error('Active poll not found.', 404);
    }

    Response::success(api_poll_normalize($poll, $viewer));
}

// -------------------------------------------------------------------------
// GET /v1/polls - poll list
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'GET') {
    $page    = get_page_param(1);
    $perPage = get_per_page_param(20, 100);
    $offset  = ($page - 1) * $perPage;
    $activeOnly = isset($_GET['active']) && (string) $_GET['active'] === '1';

    $where = $activeOnly ? 'WHERE po_use = 1' : '';
    $total = DB::count("SELECT COUNT(*) FROM {$pollTable} {$where}");
    $rows = DB::fetchAll(
        "SELECT po_id, po_subject, po_date, po_use
         FROM {$pollTable}
         {$where}
         ORDER BY po_id DESC
         LIMIT ? OFFSET ?",
        [$perPage, $offset]
    );

    $items = [];
    foreach ($rows as $row) {
        $items[] = api_poll_summary($row);
    }

    Response::paginated($items, $total, $page, $perPage);
}

$poId = ctype_digit((string) $seg0) ? (int) $seg0 : 0;

// -------------------------------------------------------------------------
// GET /v1/polls/{po_id} - poll detail/result
// -------------------------------------------------------------------------
if ($poId > 0 && !$seg1 && $apiMethod === 'GET') {
    $viewer = api_poll_viewer();
    $poll = api_poll_find($poId);

    if (!$poll) {
        Response::error('Poll not found.', 404);
    }

    Response::success(api_poll_normalize($poll, $viewer));
}

// -------------------------------------------------------------------------
// POST /v1/polls/{po_id}/vote - vote for an option
// -------------------------------------------------------------------------
if ($poId > 0 && $seg1 === 'vote' && !$seg2 && $apiMethod === 'POST') {
    $viewer = api_poll_viewer();
    $poll = api_poll_find($poId);

    if (!$poll) {
        Response::error('Poll not found.', 404);
    }

    if ((int) $poll['po_use'] !== 1) {
        Response::error('This poll is closed.', 403);
    }

    if (!api_poll_can_access($poll, $viewer)) {
        Response::error('You do not have permission to vote in this poll.', 403);
    }

    $input = get_request_body();
    $option = isset($input['option']) ? (int) $input['option'] : 0;

    if ($option < 1 || $option > 9) {
        Response::error('Please select a poll option.', 422);
    }

    $optionText = isset($poll['po_poll' . $option]) ? (string) $poll['po_poll' . $option] : '';
    if ($optionText === '') {
        Response::error('Invalid poll option.', 422);
    }

    if ($viewer && !empty($viewer['mb_id'])) {
        $marker = $viewer['mb_id'];
        $affected = DB::execute(
            "UPDATE {$pollTable}
             SET po_cnt{$option} = po_cnt{$option} + 1,
                 mb_ids = CONCAT(IFNULL(mb_ids, ''), ?)
             WHERE po_id = ?
               AND FIND_IN_SET(?, IFNULL(mb_ids, '')) = 0",
            [$marker . ',', $poId, $marker]
        );
    } else {
        $marker = api_poll_current_ip();
        $affected = DB::execute(
            "UPDATE {$pollTable}
             SET po_cnt{$option} = po_cnt{$option} + 1,
                 po_ips = CONCAT(IFNULL(po_ips, ''), ?)
             WHERE po_id = ?
               AND FIND_IN_SET(?, IFNULL(po_ips, '')) = 0",
            [$marker . ',', $poId, $marker]
        );
    }

    if ($affected <= 0) {
        Response::error('You have already voted in this poll.', 409);
    }

    if ($viewer && !empty($viewer['mb_id']) && (int) $poll['po_point'] !== 0 && function_exists('insert_point')) {
        $subject = function_exists('cut_str') ? cut_str($poll['po_subject'], 20) : $poll['po_subject'];
        insert_point(
            $viewer['mb_id'],
            (int) $poll['po_point'],
            $poll['po_id'] . '. ' . $subject . ' 투표 참여 ',
            '@poll',
            $poll['po_id'],
            '투표'
        );
    }

    api_poll_reload_response($poId, $viewer);
}

// -------------------------------------------------------------------------
// POST /v1/polls/{po_id}/comments - add poll opinion
// -------------------------------------------------------------------------
if ($poId > 0 && $seg1 === 'comments' && !$seg2 && $apiMethod === 'POST') {
    $viewer = api_poll_viewer();
    $poll = api_poll_find($poId);

    if (!$poll) {
        Response::error('Poll not found.', 404);
    }

    if (!api_poll_can_access($poll, $viewer)) {
        Response::error('You do not have permission to comment on this poll.', 403);
    }

    if ((string) $poll['po_etc'] === '') {
        Response::error('Poll opinions are disabled.', 403);
    }

    $input = get_request_body();
    $pcIdea = api_poll_clean_text(isset($input['pc_idea']) ? $input['pc_idea'] : '', 255);
    if ($pcIdea === '') {
        Response::error('Please enter an opinion.', 422);
    }

    if ($viewer && !empty($viewer['mb_id'])) {
        $pcName = isset($viewer['mb_nick']) && $viewer['mb_nick'] !== ''
            ? $viewer['mb_nick']
            : (isset($viewer['mb_name']) ? $viewer['mb_name'] : $viewer['mb_id']);
        $mbId = $viewer['mb_id'];
    } else {
        $pcName = api_poll_clean_text(isset($input['pc_name']) ? $input['pc_name'] : '', 255);
        $mbId = '';
        if ($pcName === '') {
            Response::error('Please enter your name.', 422);
        }
    }

    $row = DB::fetch("SELECT COALESCE(MAX(pc_id), 0) + 1 AS next_id FROM {$pollEtcTable}");
    $pcId = $row ? (int) $row['next_id'] : 1;
    $now = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');

    DB::execute(
        "INSERT INTO {$pollEtcTable}
            (pc_id, po_id, mb_id, pc_name, pc_idea, pc_datetime)
         VALUES (?, ?, ?, ?, ?, ?)",
        [$pcId, $poId, $mbId, $pcName, $pcIdea, $now]
    );

    api_poll_reload_response($poId, $viewer, 201);
}

// -------------------------------------------------------------------------
// DELETE /v1/polls/{po_id}/comments/{pc_id} - delete poll opinion
// -------------------------------------------------------------------------
if ($poId > 0 && $seg1 === 'comments' && ctype_digit((string) $seg2) && $apiMethod === 'DELETE') {
    $viewer = Auth::requireAuth();
    $pcId = (int) $seg2;

    $comment = DB::fetch(
        "SELECT *
         FROM {$pollEtcTable}
         WHERE pc_id = ? AND po_id = ?
         LIMIT 1",
        [$pcId, $poId]
    );

    if (!$comment) {
        Response::error('Poll opinion not found.', 404);
    }

    $isSuperAdmin = Auth::adminRole($viewer) === 'super';
    $isOwner = !empty($comment['mb_id']) && $comment['mb_id'] === $viewer['mb_id'];

    if (!$isSuperAdmin && !$isOwner) {
        Response::error('You do not have permission to delete this opinion.', 403);
    }

    DB::execute(
        "DELETE FROM {$pollEtcTable}
         WHERE pc_id = ? AND po_id = ?",
        [$pcId, $poId]
    );

    api_poll_reload_response($poId, $viewer);
}

Response::error('Method not allowed.', 405);
