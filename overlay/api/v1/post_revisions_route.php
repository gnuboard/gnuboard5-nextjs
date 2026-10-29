<?php
/**
 * GET /v1/posts/{bo_table}/{wr_id}/revisions[/{rev_id|compare}] — 매뉴얼 게시글 수정 이력(plugin/webapp/post-history).
 * api/v1/posts.php 가 이 경로일 때만 불러 쓴다($bo_table · $wr_id · $board · $write_table · $revisionSubAction 은 거기서 정한다).
 * 이력 목록 · 한 건 · 두 판 비교를 돌려주고, 끝에서 늘 응답을 보낸다.
 */

if (!defined('_GNUBOARD_')) exit;

$viewer = Auth::requireAuth();
$post = DB::fetch(
    "SELECT wr_id FROM {$write_table}
     WHERE wr_id = ? AND wr_is_comment = 0
     LIMIT 1",
    [$wr_id]
);
if (!$post || !webapp_post_history_is_tracked_board($board)) {
    Response::error('Post not found.', 404);
}
if (!webapp_post_history_can_view($viewer, $bo_table, $board)) {
    Response::error('You do not have permission to view this post history.', 403);
}
if (!webapp_post_history_table_ready()) {
    Response::error('Post history is not installed. Run the administrator database upgrade first.', 503);
}
if (!webapp_post_history_reconcile_for_read($bo_table, $wr_id, $board)) {
    Response::error('Post history could not be reconciled. Please retry.', 503);
}
header('Cache-Control: private, no-store');

if ($revisionSubAction === 'compare') {
    $fromId = isset($_GET['from']) ? (int) $_GET['from'] : 0;
    $toId = isset($_GET['to']) ? (int) $_GET['to'] : 0;
    if ($fromId <= 0 || $toId <= 0 || $fromId === $toId) {
        Response::error('Two different revision IDs are required.', 422);
    }
    $from = webapp_post_history_get($bo_table, $wr_id, $fromId);
    $to = webapp_post_history_get($bo_table, $wr_id, $toId);
    if (!$from || !$to) {
        Response::error('Revision not found.', 404);
    }
    Response::success(array('from' => $from, 'to' => $to));
}

if ($revisionSubAction !== '') {
    if (!ctype_digit($revisionSubAction) || (int) $revisionSubAction <= 0) {
        Response::error('Revision not found.', 404);
    }
    $revision = webapp_post_history_get($bo_table, $wr_id, (int) $revisionSubAction);
    if (!$revision) {
        Response::error('Revision not found.', 404);
    }
    Response::success($revision);
}

$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;
if ($limit < 1 || $limit > 50) {
    Response::error('Limit must be between 1 and 50.', 422);
}
$beforeId = isset($_GET['before']) ? max(0, (int) $_GET['before']) : 0;
$revisions = webapp_post_history_list($bo_table, $wr_id, $beforeId, $limit + 1);
$hasMore = count($revisions) > $limit;
if ($hasMore) {
    array_pop($revisions);
}
$nextBefore = null;
if ($hasMore && $revisions) {
    $lastRevision = end($revisions);
    $nextBefore = (int) $lastRevision['rev_id'];
}
Response::success(array(
    'revisions' => $revisions,
    'next_before' => $nextBefore,
    'has_more' => $hasMore,
));
