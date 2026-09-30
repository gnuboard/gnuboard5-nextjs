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
 * bbs/memo_form_update.php 에 있는 run_event() 그대로다. API 요청에서는 이 이벤트가
 * 발생하지 않으므로 두 번 가는 일은 없다.
 */
if (!defined('_GNUBOARD_')) exit;

require_once __DIR__ . '/Notify.php';

if (!function_exists('g5_webapp_notify_on_comment')) {
    /** bbs/write_comment_update.php: run_event('comment_update_after', $board, $wr_id, $w, $qstr, $redirect_url, $comment_id, $reply_array) */
    function g5_webapp_notify_on_comment($board, $wr_id, $w, $qstr, $redirect_url, $comment_id, $reply_array)
    {
        global $g5, $member;

        if ($w !== '' && $w !== 'c') {
            return; // 수정(cu)·삭제는 알림 없음. '' 은 새 댓글, 'c' 는 댓글의 댓글.
        }
        $bo_table = isset($board['bo_table']) ? (string) $board['bo_table'] : '';
        if ($bo_table === '') {
            return;
        }
        $write_table = $g5['write_prefix'] . $bo_table;
        $parent = sql_fetch("select mb_id, wr_subject from `{$write_table}` where wr_id = '" . (int) $wr_id . "' and wr_is_comment = 0");
        $comment = sql_fetch("select wr_content, wr_name, mb_id from `{$write_table}` where wr_id = '" . (int) $comment_id . "'");
        if (!$parent || !$comment || empty($parent['mb_id'])) {
            return;
        }
        if ($parent['mb_id'] === (string) $comment['mb_id']) {
            return; // 자기 글에 자기 댓글
        }
        Notify::emit(
            'comment.created',
            $parent['mb_id'],
            '[' . $bo_table . '] 새 댓글',
            mb_substr(strip_tags((string) $comment['wr_content']), 0, 80, 'UTF-8'),
            array(
                'bo_table'  => $bo_table,
                'wr_id'     => (int) $wr_id,
                'link'      => '/' . $bo_table . '/' . (int) $wr_id,
                'commenter' => (string) $comment['wr_name'],
            )
        );
    }
}

if (!function_exists('g5_webapp_notify_on_write')) {
    /** bbs/write_update.php: run_event('write_update_after', $board, $wr_id, $w, $qstr, $redirect_url) — 답글(w=r)만 본다. */
    function g5_webapp_notify_on_write($board, $wr_id, $w, $qstr, $redirect_url)
    {
        global $g5, $member;

        if ($w !== 'r') {
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
