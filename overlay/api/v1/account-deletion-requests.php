<?php
/**
 * Gnuboard5 REST API - Account deletion request moderation
 *
 * Routes (prefix: v1/account-deletion-requests):
 *   GET   /v1/account-deletion-requests?status=open
 *   PATCH /v1/account-deletion-requests/{id}
 */

if (!defined('_GNUBOARD_')) exit;

/** @var string $apiMethod */
/** @var array<int,string> $apiSegments */

$admin = Auth::requireAdmin();
$action = isset($apiSegments[0]) ? (string) $apiSegments[0] : '';
$table = DB::table('account_deletion_request_table');

if ($apiMethod === 'GET' && $action === '') {
    $status = isset($_GET['status']) ? (string) $_GET['status'] : 'open';
    if (!in_array($status, ['open', 'closed', 'all'], true)) {
        $status = 'open';
    }

    $limit = isset($_GET['per_page']) ? min(100, max(1, (int) $_GET['per_page'])) : 20;
    $page = api_page_number();
    $offset = ($page - 1) * $limit;

    $where = '';
    $params = [];
    if ($status !== 'all') {
        $where = 'WHERE status = ?';
        $params[] = $status;
    }

    $rows = DB::readFetchAll(
        "SELECT request_id, identifier, contact_email, detail, request_ip,
                user_agent, status, created_at, closed_at, closed_by, admin_note
           FROM {$table}
           {$where}
          ORDER BY request_id DESC
          LIMIT ?, ?",
        array_merge($params, [$offset, $limit])
    );
    $total = DB::readCount("SELECT COUNT(*) FROM {$table} {$where}", $params);

    Response::paginated($rows, $total, $page, $limit);
}

if ($apiMethod === 'PATCH' && $action !== '') {
    $requestId = (int) $action;
    if ($requestId <= 0) {
        Response::error('Invalid request id.', 422);
    }

    $input = get_request_body();
    $status = isset($input['status']) ? (string) $input['status'] : '';
    if (!in_array($status, ['open', 'closed'], true)) {
        Response::error('Invalid status.', 422);
    }

    $note = isset($input['admin_note'])
        ? trim(mb_substr((string) $input['admin_note'], 0, 500))
        : null;
    $closedAtSql = $status === 'closed' ? 'NOW()' : 'NULL';
    $closedBy = $status === 'closed' ? (string) $admin['mb_id'] : null;

    $affected = DB::execute(
        "UPDATE {$table}
            SET status = ?,
                closed_at = {$closedAtSql},
                closed_by = ?,
                admin_note = ?
          WHERE request_id = ?",
        [$status, $closedBy, $note, $requestId]
    );

    if ($affected === 0) {
        $exists = DB::readFetch("SELECT request_id FROM {$table} WHERE request_id = ? LIMIT 1", [$requestId]);
        if (!$exists) {
            Response::error('Request not found.', 404);
        }
    }

    Response::success([
        'request_id' => $requestId,
        'status' => $status,
    ]);
}

Response::error('Not found.', 404);
