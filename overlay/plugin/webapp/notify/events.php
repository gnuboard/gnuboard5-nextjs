<?php
/**
 * 그누보드 원래 화면(basic 테마 등, bbs/*.php)에서 일어나는 일을 알림으로 잇는다.
 *
 * Next.js 화면과 앱은 API 를 거치므로 API 핸들러가 직접 Notify::emit 을 부른다.
 * 여기는 그 밖의 길 — 그누보드 PHP 화면에서 댓글을 달거나 답글을 쓰거나 쪽지를
 * 보낼 때 그누보드가 원래 쏘는 이벤트에 귀를 대고 같은 Notify::emit 을 부른다.
 * 어느 화면에서 해도 같은 알림이 같은 알림함·같은 기기에 간다.
 *
 * 훅 이름과 인자는 그누보드 5.6 의 bbs/write_comment_update.php, bbs/write_update.php,
 * bbs/memo_form_update.php 에 있는 run_event() 그대로다. API 도 같은 동작에서 이 훅을 부르지만
 * (api/lib/hooks.php — 다른 플러그인이 새 화면 · 앱에서도 돌게), 알림은 API 핸들러가 이미 보냈으므로
 * API 요청(G5_API_REQUEST)에서는 여기서 건너뛴다 — 두 번 가지 않게.
 */
if (!defined('_GNUBOARD_')) exit;

require_once __DIR__ . '/Notify.php';

if (!function_exists('g5_webapp_notify_is_api_request')) {
    /** API 요청이면 true — 그 알림은 API 핸들러가 직접 보낸다. */
    function g5_webapp_notify_is_api_request()
    {
        return defined('G5_API_REQUEST') && G5_API_REQUEST;
    }
}

if (!function_exists('g5_webapp_notify_on_comment')) {
    /** bbs/write_comment_update.php: run_event('comment_update_after', $board, $wr_id, $w, $qstr, $redirect_url, $comment_id, $reply_array) */
    function g5_webapp_notify_on_comment($board, $wr_id, $w, $qstr, $redirect_url, $comment_id, $reply_array)
    {
        global $g5, $member;

        if (g5_webapp_notify_is_api_request()) {
            return;
        }
        if ($w !== '' && $w !== 'c') {
            return; // 수정(cu)·삭제는 알림 없음. 새 댓글은 'c'(댓글의 답글도 'c' — 그때는 $reply_array 에 부모 댓글이 실린다).
        }
        $bo_table = isset($board['bo_table']) ? (string) $board['bo_table'] : '';
        if ($bo_table === '') {
            return;
        }
        $write_table = $g5['write_prefix'] . $bo_table;
        $parent = sql_fetch("select mb_id, wr_subject from `{$write_table}` where wr_id = '" . (int) $wr_id . "' and wr_is_comment = 0");
        $comment = sql_fetch("select wr_content, wr_name, wr_option, mb_id from `{$write_table}` where wr_id = '" . (int) $comment_id . "'");
        if (!$parent || !$comment) {
            return;
        }

        // 문구는 API(api/v1/comments.php)와 같다 — 어느 화면에서 달아도 같은 알림이 간다.
        //   내 글:   [자유게시판] "글 제목…"의 새 댓글        /  닉네임: 댓글 내용
        //   내 댓글: [자유게시판] 내 댓글 "내 댓글…"의 답글   /  닉네임: 답글 내용(비밀 답글이면 가림)
        $boardName = Notify::snippet(isset($board['bo_subject']) ? $board['bo_subject'] : '', 20);
        if ($boardName === '') {
            $boardName = $bo_table;
        }
        $commenterName = Notify::snippet(!empty($member['mb_nick']) ? $member['mb_nick'] : $comment['wr_name'], 20);
        $commentText = Notify::snippet($comment['wr_content'], 80);
        if ($commentText === '') {
            $commentText = '(내용 없음)';
        }
        $notifyBody = $commenterName !== '' ? $commenterName . ': ' . $commentText : $commentText;
        $commenterId = (string) $comment['mb_id'];
        $postAuthorId = (string) $parent['mb_id'];
        $notifyData = array(
            'bo_table'   => $bo_table,
            'wr_id'      => (int) $wr_id,
            'comment_id' => (int) $comment_id,
            'link'       => '/' . $bo_table . '/' . (int) $wr_id,
            'commenter'  => (string) $comment['wr_name'],
        );

        if ($postAuthorId !== '' && $postAuthorId !== $commenterId) {
            $postTitle = Notify::snippet($parent['wr_subject'], 15);
            Notify::emit(
                'comment.created',
                $postAuthorId,
                $postTitle !== '' ? '[' . $boardName . '] "' . $postTitle . '"의 새 댓글' : '[' . $boardName . '] 내 글의 새 댓글',
                $notifyBody,
                $notifyData
            );
        }

        // 댓글의 답글이면 그 댓글 작성자에게도 1건(본인 · 글쓴이와 같으면 생략 — 글쓴이는 위에서 이미 받았다).
        // write_comment_update.php 는 답글일 때 $reply_array 에 부모 댓글 행을 싣는다.
        $replyAuthorId = is_array($reply_array) && !empty($reply_array['wr_id']) && isset($reply_array['mb_id'])
            ? (string) $reply_array['mb_id'] : '';
        if ($replyAuthorId !== '' && $replyAuthorId !== $commenterId && $replyAuthorId !== $postAuthorId) {
            $myComment = Notify::snippet(isset($reply_array['wr_content']) ? $reply_array['wr_content'] : '', 15);
            // 비밀 댓글은 관리자 · 글쓴이 · 그 댓글 작성자만 본다(bbs/view_comment.php) — 원댓글 작성자는 아니므로 가린다.
            $replyBody = strpos((string) $comment['wr_option'], 'secret') !== false
                ? ($commenterName !== '' ? $commenterName . ': 비밀 답글입니다.' : '비밀 답글입니다.')
                : $notifyBody;
            Notify::emit(
                'reply.created',
                $replyAuthorId,
                $myComment !== '' ? '[' . $boardName . '] 내 댓글 "' . $myComment . '"의 답글' : '[' . $boardName . '] 내 댓글의 답글',
                $replyBody,
                $notifyData
            );
        }
    }
}

if (!function_exists('g5_webapp_notify_on_write')) {
    /** bbs/write_update.php: run_event('write_update_after', $board, $wr_id, $w, $qstr, $redirect_url) — 답글(w=r)만 본다. */
    function g5_webapp_notify_on_write($board, $wr_id, $w, $qstr, $redirect_url)
    {
        global $g5, $member;

        if (g5_webapp_notify_is_api_request() || $w !== 'r') {
            return;
        }
        // write_update.php 는 답글을 달기 전에 원글을 $wr 에 실어 둔다.
        $original = isset($GLOBALS['wr']) && is_array($GLOBALS['wr']) ? $GLOBALS['wr'] : null;
        $bo_table = isset($board['bo_table']) ? (string) $board['bo_table'] : '';
        if (!$original || $bo_table === '' || empty($original['mb_id'])) {
            return;
        }
        if ($original['mb_id'] === (string) (isset($member['mb_id']) ? $member['mb_id'] : '')) {
            return;
        }
        $write_table = $g5['write_prefix'] . $bo_table;
        $reply = sql_fetch("select wr_subject, wr_name from `{$write_table}` where wr_id = '" . (int) $wr_id . "'");
        Notify::emit(
            'reply.created',
            $original['mb_id'],
            '[' . $bo_table . '] 내 글에 답글',
            mb_substr(strip_tags((string) ($reply ? $reply['wr_subject'] : '')), 0, 80, 'UTF-8'),
            array(
                'bo_table' => $bo_table,
                'wr_id'    => (int) $wr_id,
                'link'     => '/' . $bo_table . '/' . (int) $wr_id,
                'author'   => $reply ? (string) $reply['wr_name'] : '',
            )
        );
    }
}

if (!function_exists('g5_webapp_notify_on_memo')) {
    /** bbs/memo_form_update.php: run_event('memo_form_update_after', $member_list, $str_nick_list, $redirect_url, $me_memo) */
    function g5_webapp_notify_on_memo($member_list, $str_nick_list, $redirect_url, $me_memo)
    {
        global $member;

        if (g5_webapp_notify_is_api_request()) {
            return;
        }
        if (empty($member_list['id']) || !is_array($member_list['id'])) {
            return;
        }
        $sender = isset($member['mb_nick']) && $member['mb_nick'] !== '' ? $member['mb_nick'] : (isset($member['mb_id']) ? $member['mb_id'] : '');
        Notify::emitMany(
            'memo.received',
            $member_list['id'],
            $sender . '님의 쪽지',
            mb_substr(strip_tags((string) $me_memo), 0, 80, 'UTF-8'),
            array('sender' => isset($member['mb_id']) ? $member['mb_id'] : '', 'link' => '/mypage/memos'),
            isset($member['mb_id']) ? (string) $member['mb_id'] : ''
        );
    }
}

if (function_exists('add_event')) {
    add_event('comment_update_after', 'g5_webapp_notify_on_comment', 10, 7);
    add_event('write_update_after', 'g5_webapp_notify_on_write', 10, 5);
    add_event('memo_form_update_after', 'g5_webapp_notify_on_memo', 10, 4);
}
