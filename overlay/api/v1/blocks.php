<?php
/**
 * Gnuboard5 REST API - Member block list
 *
 * Routes (prefix: v1/blocks):
 *   GET    /v1/blocks          - List current member's blocked authors
 *   POST   /v1/blocks          - Add/update a blocked author
 *   DELETE /v1/blocks/{key}    - Remove a blocked author
 */

if (!defined('_GNUBOARD_')) exit;

/** @var string $apiMethod */
/** @var array<int,string> $apiSegments */

$member = Auth::requireAuth();
$mbId = (string) $member['mb_id'];
$action = isset($apiSegments[0]) ? rawurldecode((string) $apiSegments[0]) : '';
$table = DB::table('member_block_table');

function api_normalize_block_key(string $key): string
{
    $key = trim(mb_substr($key, 0, 128));
    if (!preg_match('/^(member|name):.{1,120}$/u', $key)) {
        Response::error('Invalid blocked_key.', 422);
    }
    return $key;
}

if ($apiMethod === 'GET' && $action === '') {
    $rows = DB::readFetchAll(
        "SELECT block_id, blocked_key, blocked_label, created_at
           FROM {$table}
          WHERE mb_id = ?
          ORDER BY created_at DESC, block_id DESC",
        [$mbId]
    );
    Response::success($rows);
}

if ($apiMethod === 'POST' && $action === '') {
    $input = get_request_body();
    $key = api_normalize_block_key((string) ($input['blocked_key'] ?? ''));
    $label = trim(mb_substr((string) ($input['blocked_label'] ?? ''), 0, 100));
    if ($label === '') $label = $key;

    DB::execute(
        "INSERT INTO {$table} (mb_id, blocked_key, blocked_label, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            blocked_label = VALUES(blocked_label),
            created_at = VALUES(created_at)",
        [$mbId, $key, $label]
    );

    Response::success([
        'blocked_key' => $key,
        'blocked_label' => $label,
    ], 201);
}

if ($apiMethod === 'DELETE' && $action !== '') {
    $key = api_normalize_block_key($action);
    DB::execute(
        "DELETE FROM {$table} WHERE mb_id = ? AND blocked_key = ?",
        [$mbId, $key]
    );
    Response::success(['blocked_key' => $key]);
}

Response::error('Not found.', 404);
