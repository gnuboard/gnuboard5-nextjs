<?php
/**
 * Gnuboard5 REST API - Comment Endpoints
 *
 * Routes handled (prefix: v1/comments):
 *   POST   /v1/comments/{bo_table}/{wr_id}       - Add comment to post
 *   PATCH  /v1/comments/{bo_table}/{comment_id}   - Edit comment
 *   DELETE /v1/comments/{bo_table}/{comment_id}   - Delete comment
 */

if (!defined('_GNUBOARD_')) exit;

$bo_table   = isset($apiSegments[0]) ? api_sanitize_bo_table($apiSegments[0]) : '';
$target_id  = isset($apiSegments[1]) ? (int) $apiSegments[1] : 0;

if (!$bo_table || !$target_id) {
    Response::error('Not found. Expected /v1/comments/{bo_table}/{id}', 404);
}

$board = api_get_board($bo_table);
if (!$board) {
    Response::error('Board not found.', 404);
}

$write_table = DB::writeTable($bo_table);

// -------------------------------------------------------------------------
// POST /v1/comments/{bo_table}/{wr_id} - Add comment to a post
// -------------------------------------------------------------------------
if ($apiMethod === 'POST') {

    $member = Auth::requireAuth();

    // Check comment permission (member level)
    if ((int) $member['mb_level'] < (int) $board['bo_comment_level']) {
        Response::error('You do not have permission to comment in this board.', 403);
    }

    // Anti-spam — 어드민 우회
    $adminRole = Auth::adminRole($member, $bo_table);
    if ($adminRole === '') {
        $throttleMsg = Throttle::checkCommentCreate($write_table, (string) $member['mb_id']);
        if ($throttleMsg !== null) {
            Response::error($throttleMsg, 429);
        }
    }

    $commentPoint = (int) ($board['bo_comment_point'] ?? 0);
    $memberPoint = (int) ($member['mb_point'] ?? 0);
    $availablePoint = $memberPoint > 0 ? $memberPoint : 0;
    if ($adminRole === '' && $availablePoint + $commentPoint < 0) {
        Response::error('Not enough points to comment in this board.', 403);
    }

    // Verify the parent post exists
    $wr_id = $target_id;
    $parentPost = DB::fetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0
         LIMIT 1",
        [$wr_id]
    );

    if (!$parentPost || !$parentPost['wr_id']) {
        Response::error('Parent post not found.', 404);
    }

    if ((string) ($parentPost['wr_10'] ?? '') === 'report_hidden'
        && !Auth::canManagePost($member, $bo_table, $parentPost)) {
        Response::error('Parent post not found.', 404);
    }

    if (!api_can_read_board_post($member, $bo_table, $board, $parentPost)) {
        Response::error('You do not have permission to comment on this post.', 403);
    }

    if (api_is_blocked_author(
        $member,
        (string) ($parentPost['mb_id'] ?? ''),
        (string) ($parentPost['wr_name'] ?? '')
    ) && !Auth::canManagePost($member, $bo_table, $parentPost)) {
        Response::error('Parent post not found.', 404);
    }

    $input = get_request_body();

    // Validate
    $errors = Validator::validate([
        'wr_content' => 'required',
    ], $input);

    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $wr_content = $input['wr_content'];

    // ─── 동시성 락 ───
    // 같은 글에 두 사용자가 동시에 댓글을 달면 SELECT MAX + 1 패턴은
    // 둘 다 같은 wr_comment 번호를 받아 정렬 깨짐.
    // 부모 글 row 를 FOR UPDATE 잡고 BEGIN TRANSACTION 안에서
    // 번호 발급 + INSERT 까지 atomic 하게 처리.
    DB::beginTransaction();

    // 부모 글 락 (행 단위 lock — 같은 글에 동시 댓글 시 두 번째는 첫 commit 까지 대기)
    DB::fetch(
        "SELECT wr_id FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0
         FOR UPDATE",
        [$wr_id]
    );

    // Determine comment number (wr_comment) - sequential within this parent
    $row = DB::fetch(
        "SELECT MAX(wr_comment) AS max_comment FROM {$write_table}
         WHERE wr_parent = ? AND wr_is_comment = 1",
        [$wr_id]
    );
    $wr_comment = (int) ($row['max_comment'] ?? 0) + 1;

    // Support reply to existing comment (wr_comment_reply)
    $wr_comment_reply = '';
    if (isset($input['wr_comment_reply'])) {
        $wr_comment_reply = $input['wr_comment_reply'];
    }

    // If replying to a specific comment (legacy UI sends comment_id).
    $replyTo = 0;
    if (isset($input['wr_reply_to']) && (int) $input['wr_reply_to'] > 0) {
        $replyTo = (int) $input['wr_reply_to'];
    } elseif (isset($input['comment_id']) && (int) $input['comment_id'] > 0) {
        $replyTo = (int) $input['comment_id'];
    }
    if ($replyTo > 0) {
        // Get the comment we're replying to
        $replyRow = DB::fetch(
            "SELECT wr_comment, wr_comment_reply FROM {$write_table}
             WHERE wr_id = ? AND wr_is_comment = 1 AND wr_parent = ?
             LIMIT 1",
            [$replyTo, $wr_id]
        );
        if ($replyRow && $replyRow['wr_comment']) {
            $wr_comment = (int) $replyRow['wr_comment'];

            // Calculate the next reply character
            $replyPrefix = $replyRow['wr_comment_reply'];
            $replyLen    = strlen($replyPrefix) + 1;

            $baseRow = DB::fetch(
                "SELECT MAX(wr_comment_reply) AS max_reply FROM {$write_table}
                 WHERE wr_parent = ?
                   AND wr_is_comment = 1
                   AND wr_comment = ?
                   AND wr_comment_reply LIKE ?
                   AND LENGTH(wr_comment_reply) = ?",
                [$wr_id, $wr_comment, $replyPrefix . '%', $replyLen]
            );

            if ($baseRow['max_reply']) {
                $lastChar = substr($baseRow['max_reply'], -1);
                $nextChar = chr(ord($lastChar) + 1);
            } else {
                $nextChar = 'A';
            }
            $wr_comment_reply = $replyRow['wr_comment_reply'] . $nextChar;
        }
    }

    // 비밀 댓글 — 그누보드 write_comment_update.php 처럼 폼 필드 wr_secret(=secret)으로 받는다(secret · 예전 wr_option 도).
    $wr_option = (string) api_comment_secret_option($input);

    $now = date('Y-m-d H:i:s');
    $ip  = $_SERVER['REMOTE_ADDR'];

    DB::execute(
        "INSERT INTO {$write_table} SET
            wr_num           = ?,
            wr_reply         = '',
            ca_name          = '',
            wr_parent        = ?,
            wr_is_comment    = 1,
            wr_comment       = ?,
            wr_comment_reply = ?,
            wr_subject       = '',
            wr_content       = ?,
            wr_link1         = '',
            wr_link2         = '',
            wr_option        = ?,
            mb_id            = ?,
            wr_name          = ?,
            wr_password      = '',
            wr_email         = ?,
            wr_homepage      = '',
            wr_datetime      = ?,
            wr_last          = ?,
            wr_ip            = ?,
            wr_facebook_user = '',
            wr_twitter_user  = '',
            wr_1 = '', wr_2 = '', wr_3 = '', wr_4 = '', wr_5 = '',
            wr_6 = '', wr_7 = '', wr_8 = '', wr_9 = '', wr_10 = ''",
        [
            // 코어 write_comment_update.php 처럼 댓글도 부모 글의 wr_num 을 받는다. 0 으로 두면
            // 코어의 글 복사 · 이동(move_update.php)처럼 wr_num 으로 한 글타래를 모으는 곳에서 빠진다.
            (int) $parentPost['wr_num'],
            $wr_id,
            $wr_comment,
            $wr_comment_reply,
            $wr_content,
            $wr_option,
            $member['mb_id'],
            $member['mb_nick'],
            $member['mb_email'],
            $now,
            $now,
            $ip,
        ]
    );

    // Get the inserted comment ID
    $commentId = (int) DB::lastInsertId();

    DB::execute(
        "INSERT INTO " . DB::table('board_new_table') . "
            (bo_table, wr_id, wr_parent, bn_datetime, mb_id)
         VALUES (?, ?, ?, ?, ?)",
        [$bo_table, $commentId, $wr_id, $now, $member['mb_id']]
    );

    // Update parent post comment count
    $commentCount = DB::count(
        "SELECT COUNT(*) FROM {$write_table}
         WHERE wr_parent = ? AND wr_is_comment = 1",
        [$wr_id]
    );

    DB::execute(
        "UPDATE {$write_table}
         SET wr_comment = ?, wr_last = ?
         WHERE wr_id = ?",
        [$commentCount, $now, $wr_id]
    );

    // Update board comment count
    $board_table = DB::table('board_table');
    DB::execute(
        "UPDATE {$board_table}
         SET bo_count_comment = bo_count_comment + 1
         WHERE bo_table = ?",
        [$bo_table]
    );

    // 모든 카운트 갱신까지 끝났으면 transaction commit — FOR UPDATE 락 해제.
    DB::commit();

    // 포인트는 댓글이 실제로 저장된 뒤에 준다. insert_point 는 그누보드 연결(mysqli)로 따로 써서
    // 위 트랜잭션이 되돌려져도 함께 되돌려지지 않는다 — 커밋 전에 주면 댓글 없이 포인트만 남을 수 있다.
    if (function_exists('insert_point')) {
        $commentLabel = json_decode('"\uB313\uAE00\uC4F0\uAE30"');
        $commentAction = json_decode('"\uB313\uAE00"');
        insert_point(
            $member['mb_id'],
            $commentPoint,
            $board['bo_subject'] . ' ' . $wr_id . '-' . $commentId . ' ' . $commentLabel,
            $bo_table,
            $commentId,
            $commentAction
        );
    }

    // 원글 작성자에게 푸시 알림 (본인 댓글 / 익명 글은 skip)
    $parentAuthor = DB::fetch(
        "SELECT mb_id, wr_subject FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 0 LIMIT 1",
        [$wr_id]
    );
    // SC-12: comment_id 를 실어 앱이 그 댓글로 바로 스크롤한다.
    $notifyData = [
        'bo_table'   => $bo_table,
        'wr_id'      => (int) $wr_id,
        'comment_id' => (int) $commentId,
        'link'       => "/{$bo_table}/{$wr_id}",
        'commenter'  => $member['mb_nick'],
    ];
    $postAuthorId = $parentAuthor ? (string) $parentAuthor['mb_id'] : '';
    if ($postAuthorId !== '' && $postAuthorId !== $member['mb_id']) {
        // 알림은 한 문(Notify::emit)으로 — 알림함 + 모든 기기 푸시 + 즉시 발송/재시도.
        Notify::emit(
            'comment.created',
            $postAuthorId,
            "[$bo_table] 새 댓글",
            mb_substr(strip_tags($wr_content), 0, 80, 'UTF-8'),
            $notifyData
        );
    }
    // 답글이면 부모 댓글 작성자에게도 1건(본인·글쓴이와 같으면 생략 — 글쓴이는 위에서 이미 받았다).
    if ($replyTo > 0) {
        // 같은 글의 댓글만 — 다른 글 댓글 번호를 넣어 엉뚱한 회원에게 알림을 보내지 못하게(번호 매기기 조회와 같은 범위).
        $replyAuthor = DB::fetch(
            "SELECT mb_id FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = 1 AND wr_parent = ? LIMIT 1",
            [$replyTo, $wr_id]
        );
        $replyAuthorId = $replyAuthor ? (string) $replyAuthor['mb_id'] : '';
        if ($replyAuthorId !== '' && $replyAuthorId !== $member['mb_id'] && $replyAuthorId !== $postAuthorId) {
            Notify::emit(
                'reply.created',
                $replyAuthorId,
                "[$bo_table] 내 댓글에 답글",
                mb_substr(strip_tags($wr_content), 0, 80, 'UTF-8'),
                $notifyData
            );
        }
    }

    // 그누보드 훅(bbs/write_comment_update.php 와 같은 인자) — 새 댓글은 $w = 'c', $wr_id 는 원글,
    // 마지막은 대댓글이면 부모 댓글 행(아니면 빈 배열). $qstr · 이동 주소는 API 에 없으므로 빈 값.
    // 알림은 위에서 이미 보냈다 — plugin/webapp/notify/events.php 는 API 요청에서 건너뛴다.
    $replyArray = $replyTo > 0
        ? (DB::fetch("SELECT * FROM {$write_table} WHERE wr_id = ? LIMIT 1", [$replyTo]) ?: array())
        : array();
    // 알림 메일(그누보드 write_comment_update.php 의 "메일발송 사용") — cf_email_use · bo_use_email 이 켜졌을 때만.
    api_send_board_write_mail(
        $board,
        'c',
        $wr_id,
        $parentPost,
        array('name' => (string) $member['mb_nick'], 'email' => (string) $member['mb_email']),
        array(
            'subject'    => '',
            'content'    => (string) $wr_content,
            'comment_id' => $commentId,
            'secret'     => api_is_secret_option($wr_option),
        ),
        $member
    );

    // 그누보드 latest() 위젯 캐시를 비운다(원본과 같이 훅 앞에서). 안의 delete_cache_latest 훅도 보호해서 부른다.
    api_call_core('delete_cache_latest', array($bo_table), $member);
    api_run_event('comment_update_after', array($board, $wr_id, 'c', '', '', $commentId, $replyArray), $member);

    // Fetch and return the created comment
    $comment = DB::fetch(
        "SELECT wr_id, wr_parent, wr_comment, wr_comment_reply,
                wr_content, wr_name, mb_id, wr_datetime, wr_option
         FROM {$write_table}
         WHERE wr_id = ? LIMIT 1",
        [$commentId]
    );

    Response::success($comment, 201);
}

// -------------------------------------------------------------------------
// PATCH /v1/comments/{bo_table}/{comment_id} - Edit comment
// -------------------------------------------------------------------------
if ($apiMethod === 'PATCH') {

    $member = Auth::requireAuth();

    $commentId = $target_id;

    // Fetch the comment
    $comment = DB::fetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 1
         LIMIT 1",
        [$commentId]
    );

    if (!$comment || !$comment['wr_id']) {
        Response::error('Comment not found.', 404);
    }

    // 그누보드 표준 권한: 본인 OR cf_admin / gr_admin / bo_admin 중 하나
    if (!Auth::canManagePost($member, $bo_table, $comment)) {
        Response::error('You do not have permission to edit this comment.', 403);
    }

    // 그누보드 bbs/write_comment_update.php 의 수정 제한(관리자 레벨 · 답변 댓글).
    $blocked = api_comment_change_blocked($member, $bo_table, $comment, $write_table, 'modify');
    if ($blocked !== null) {
        Response::error($blocked[0], $blocked[1]);
    }

    $input = get_request_body();

    if (!isset($input['wr_content']) || trim($input['wr_content']) === '') {
        Response::error('Validation failed.', 422, [
            'wr_content' => 'wr_content is required.',
        ]);
    }

    $wr_content = $input['wr_content'];
    $now = date('Y-m-d H:i:s');

    // Option update — 요청에 비밀 여부(wr_secret · secret · wr_option)가 있을 때만 바꾼다.
    $secretOption = api_comment_secret_option($input);
    if ($secretOption !== null) {
        $wr_option = $secretOption;
        DB::execute(
            "UPDATE {$write_table}
             SET wr_content = ?, wr_last = ?, wr_option = ?
             WHERE wr_id = ?",
            [$wr_content, $now, $wr_option, $commentId]
        );
    } else {
        DB::execute(
            "UPDATE {$write_table}
             SET wr_content = ?, wr_last = ?
             WHERE wr_id = ?",
            [$wr_content, $now, $commentId]
        );
    }

    // 그누보드 훅 — 댓글 수정은 $w = 'cu', $wr_id 는 원글, 부모 댓글 정보는 원본처럼 빈 배열
    // 그누보드 latest() 위젯 캐시를 비운다(원본과 같이 훅 앞에서). 안의 delete_cache_latest 훅도 보호해서 부른다.
    api_call_core('delete_cache_latest', array($bo_table), $member);
    api_run_event('comment_update_after', array($board, (int) $comment['wr_parent'], 'cu', '', '', $commentId, array()), $member);

    // Return updated comment
    $updated = DB::fetch(
        "SELECT wr_id, wr_parent, wr_comment, wr_comment_reply,
                wr_content, wr_name, mb_id, wr_datetime, wr_option
         FROM {$write_table}
         WHERE wr_id = ? LIMIT 1",
        [$commentId]
    );

    Response::success($updated);
}

// -------------------------------------------------------------------------
// DELETE /v1/comments/{bo_table}/{comment_id} - Delete comment
// -------------------------------------------------------------------------
if ($apiMethod === 'DELETE') {

    $member = Auth::requireAuth();

    $commentId = $target_id;

    // Fetch the comment
    $comment = DB::fetch(
        "SELECT * FROM {$write_table}
         WHERE wr_id = ? AND wr_is_comment = 1
         LIMIT 1",
        [$commentId]
    );

    if (!$comment || !$comment['wr_id']) {
        Response::error('Comment not found.', 404);
    }

    // 그누보드 표준 권한: 본인 OR cf_admin / gr_admin / bo_admin 중 하나
    if (!Auth::canManagePost($member, $bo_table, $comment)) {
        Response::error('You do not have permission to delete this comment.', 403);
    }

    // 그누보드 bbs/delete_comment.php 의 삭제 제한 — 포인트를 거두기 전에 본다.
    $blocked = api_comment_change_blocked($member, $bo_table, $comment, $write_table, 'delete');
    if ($blocked !== null) {
        Response::error($blocked[0], $blocked[1]);
    }

    $parentId = (int) $comment['wr_parent'];

    // 댓글로 받은 포인트를 거둔다(bbs/delete_comment.php 와 같은 내역 · 문구).
    api_revoke_board_point($comment['mb_id'], $bo_table, $commentId, '댓글', (int) ($board['bo_comment_point'] ?? 0),
        ($board['bo_subject'] ?? '') . " {$parentId}-{$commentId} 댓글삭제");

    // Delete the comment
    DB::execute(
        "DELETE FROM {$write_table} WHERE wr_id = ?",
        [$commentId]
    );

    // 최근 게시물(board_new)의 그 댓글 줄도 지운다 — 그누보드 bbs/delete_comment.php 와 같다.
    DB::execute(
        "DELETE FROM " . DB::table('board_new_table') . " WHERE bo_table = ? AND wr_id = ?",
        [$bo_table, $commentId]
    );

    // Recalculate parent post comment count
    $commentCount = DB::count(
        "SELECT COUNT(*) FROM {$write_table}
         WHERE wr_parent = ? AND wr_is_comment = 1",
        [$parentId]
    );

    $now = date('Y-m-d H:i:s');
    DB::execute(
        "UPDATE {$write_table}
         SET wr_comment = ?, wr_last = ?
         WHERE wr_id = ?",
        [$commentCount, $now, $parentId]
    );

    // Update board comment count
    $board_table = DB::table('board_table');
    DB::execute(
        "UPDATE {$board_table}
         SET bo_count_comment = GREATEST(bo_count_comment - 1, 0)
         WHERE bo_table = ?",
        [$bo_table]
    );

    // 그누보드 훅(bbs/delete_comment.php) — 지운 댓글 번호와 게시판
    // 그누보드 latest() 위젯 캐시를 비운다(원본과 같이 훅 앞에서). 안의 delete_cache_latest 훅도 보호해서 부른다.
    api_call_core('delete_cache_latest', array($bo_table), $member);
    api_run_event('bbs_delete_comment', array($commentId, $board), $member);

    Response::noContent();
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Not found.', 404);
