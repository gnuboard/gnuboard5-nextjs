<?php
/**
 * Gnuboard5 REST API - Memos (쪽지) Endpoints
 *
 * Routes handled (prefix: v1/memos):
 *   GET    /v1/memos          - 내 쪽지 목록 (?type=recv|send, page, limit)
 *   GET    /v1/memos/{id}     - 단건 조회 (조회 시 me_read_datetime 자동 stamp)
 *   POST   /v1/memos          - 쪽지 발송
 *   DELETE /v1/memos/{id}     - 본인 쪽지 삭제
 *
 * NOTE: PUT은 정의하지 않음 — 발송된 쪽지의 본문 수정은 일반 도메인 규칙상 부적절.
 */

if (!defined('_GNUBOARD_')) exit;

$memoTable   = DB::table('memo_table');
$memberTable = DB::table('member_table');

$id = isset($apiSegments[0]) && ctype_digit((string) $apiSegments[0])
    ? (int) $apiSegments[0]
    : 0;

function api_memo_not_read_count($mbId)
{
    $memoTable = DB::table('memo_table');
    return (int) DB::count(
        "SELECT COUNT(*) FROM {$memoTable}
         WHERE me_recv_mb_id = ?
           AND me_type = 'recv'
           AND CAST(me_read_datetime AS CHAR) IN ('0000-00-00 00:00:00', '1000-01-01 00:00:00')",
        [$mbId]
    );
}

function api_memo_unread_datetime()
{
    return '1000-01-01 00:00:00';
}

function api_memo_is_unread($value)
{
    $value = (string) $value;
    return $value === ''
        || $value === '0000-00-00 00:00:00'
        || $value === api_memo_unread_datetime();
}

// -------------------------------------------------------------------------
// GET /v1/memos - 내 쪽지 목록
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'GET') {

    $me = Auth::requireAuth();

    $type  = isset($_GET['type']) && in_array($_GET['type'], ['send', 'recv'], true)
        ? $_GET['type']
        : 'recv';
    [$page, $limit, $offset] = api_page_params(20, 100, 'limit');

    // type=recv → 내가 받는 사람, type=send → 내가 보낸 사람
    $mbCol = $type === 'send' ? 'me_send_mb_id' : 'me_recv_mb_id';

    $total = (int) DB::count(
        "SELECT COUNT(*) FROM {$memoTable} WHERE {$mbCol} = ? AND me_type = ?",
        [$me['mb_id'], $type]
    );

    $rows = DB::fetchAll(
        "SELECT * FROM {$memoTable}
         WHERE {$mbCol} = ? AND me_type = ?
         ORDER BY me_send_datetime DESC
         LIMIT {$limit} OFFSET {$offset}",
        [$me['mb_id'], $type]
    );

    Response::paginated($rows, $total, $page, $limit);
}

// -------------------------------------------------------------------------
// GET /v1/memos/{id} - 단건 조회 (자동 읽음 처리)
// -------------------------------------------------------------------------
if ($id && $apiMethod === 'GET') {

    $me = Auth::requireAuth();

    $memo = DB::fetch(
        "SELECT * FROM {$memoTable} WHERE me_id = ? LIMIT 1",
        [$id]
    );

    if (!$memo) {
        Response::error('Memo not found.', 404);
    }

    // 본인 쪽지만 조회 가능 (받은 사람 또는 보낸 사람)
    if ($memo['me_recv_mb_id'] !== $me['mb_id'] && $memo['me_send_mb_id'] !== $me['mb_id']) {
        Response::error('Forbidden.', 403);
    }

    // 받은 쪽지를 처음 열 때 받는 row와 발신자 보관 row를 함께 읽음 처리한다.
    if (
        $memo['me_type'] === 'recv'
        && $memo['me_recv_mb_id'] === $me['mb_id']
        && api_memo_is_unread($memo['me_read_datetime'])
    ) {
        $now = date('Y-m-d H:i:s');
        DB::execute(
            "UPDATE {$memoTable} SET me_read_datetime = ? WHERE me_id = ?",
            [$now, $id]
        );
        DB::execute(
            "UPDATE {$memoTable}
             SET me_read_datetime = ?
             WHERE me_send_id = ? AND me_type = 'send'",
            [$now, $id]
        );
        DB::execute(
            "UPDATE {$memberTable} SET mb_memo_cnt = ? WHERE mb_id = ?",
            [api_memo_not_read_count($me['mb_id']), $me['mb_id']]
        );
        $memo['me_read_datetime'] = $now;
    }

    Response::success($memo);
}

// -------------------------------------------------------------------------
// POST /v1/memos - 쪽지 발송
// -------------------------------------------------------------------------
if (!$id && $apiMethod === 'POST') {

    $me    = Auth::requireAuth();
    $input = get_request_body();

    $errors = Validator::validate([
        'me_recv_mb_id' => 'required|max:20',
        'me_memo'       => 'required|min:1',
    ], $input);
    if ($errors) {
        Response::error('Validation failed.', 422, $errors);
    }

    $recvMbId = trim((string) $input['me_recv_mb_id']);
    $memoText = (string) $input['me_memo'];

    if ($recvMbId === $me['mb_id']) {
        Response::error('자기 자신에게는 쪽지를 보낼 수 없습니다.', 422);
    }

    $isAdmin = Auth::adminRole($me) === 'super';

    // 그누보드 훅(bbs/memo_form_update.php 와 같은 인자) — 받는 사람 목록. API 는 한 명씩 보낸다.
    api_run_before_event('memo_form_update_before', array(array($recvMbId)), $me);

    // 받는 회원 존재 + 활성 상태 확인
    $recv = DB::fetch(
        "SELECT mb_id, mb_nick, mb_open, mb_leave_date, mb_intercept_date FROM {$memberTable}
         WHERE mb_id = ? AND mb_leave_date = '' AND mb_intercept_date = ''
         LIMIT 1",
        [$recvMbId]
    );
    // 받을 수 있는 사람이 없으면 원본처럼 memo_form_update_failed(빈 회원 목록, 이동 주소, 본문)
    $memoFailed = static function () use ($memoText, $me) {
        api_run_event('memo_form_update_failed', array(array('id' => array(), 'nick' => array()), '', $memoText), $me);
    };
    if (!$recv) {
        $memoFailed();
        Response::error('받는 회원을 찾을 수 없습니다.', 404);
    }
    if (!$isAdmin && isset($recv['mb_open']) && (int) $recv['mb_open'] !== 1) {
        $memoFailed();
        Response::error('정보공개하지 않은 회원에게는 쪽지를 보낼 수 없습니다.', 403);
    }

    global $config;
    $memoSendPoint = isset($config['cf_memo_send_point']) ? (int) $config['cf_memo_send_point'] : 0;
    if (!$isAdmin && $memoSendPoint > 0 && ((int) $me['mb_point'] - $memoSendPoint) < 0) {
        Response::error('보유 포인트가 부족하여 쪽지를 보낼 수 없습니다.', 422);
    }

    $now = date('Y-m-d H:i:s');
    $ip  = $_SERVER['REMOTE_ADDR'];
    $unreadDatetime = api_memo_unread_datetime();

    DB::beginTransaction();
    try {
        DB::execute(
            "INSERT INTO {$memoTable}
                (me_recv_mb_id, me_send_mb_id, me_send_datetime, me_memo, me_read_datetime, me_type, me_send_ip)
             VALUES (?, ?, ?, ?, ?, 'recv', ?)",
            [$recvMbId, $me['mb_id'], $now, $memoText, $unreadDatetime, $ip]
        );

        $recvMemoId = (int) DB::lastInsertId();

        DB::execute(
            "INSERT INTO {$memoTable}
                (me_recv_mb_id, me_send_mb_id, me_send_datetime, me_memo, me_read_datetime, me_send_id, me_type, me_send_ip)
             VALUES (?, ?, ?, ?, ?, ?, 'send', ?)",
            [$recvMbId, $me['mb_id'], $now, $memoText, $unreadDatetime, $recvMemoId, $ip]
        );

        $sendMemoId = (int) DB::lastInsertId();

        DB::execute(
            "UPDATE {$memberTable}
             SET mb_memo_call = ?, mb_memo_cnt = ?
             WHERE mb_id = ?",
            [$me['mb_id'], api_memo_not_read_count($recvMbId), $recvMbId]
        );

        DB::commit();
    } catch (Exception $e) {
        DB::rollBack();
        throw $e;
    }

    // 받는 사람에게 알림 — 웹 알림함과 앱 푸시가 같은 한 건이다.
    Notify::emit(
        'memo.received',
        $recvMbId,
        ($me['mb_nick'] ?: $me['mb_id']) . '님의 쪽지',
        mb_substr(strip_tags((string) $memoText), 0, 80, 'UTF-8'),
        ['me_id' => $recvMemoId, 'sender' => $me['mb_id'], 'link' => '/mypage/memos/' . $recvMemoId]
    );

    if (!$isAdmin && $memoSendPoint > 0 && function_exists('insert_point')) {
        $recvNick = isset($recv['mb_nick']) ? $recv['mb_nick'] : $recvMbId;
        insert_point(
            $me['mb_id'],
            $memoSendPoint * -1,
            $recvNick . '(' . $recvMbId . ')님께 쪽지 발송',
            '@memo',
            $recvMbId,
            $recvMemoId
        );
    }

    // 그누보드 훅 — 보낸 회원 목록(id · nick), 닉네임 문자열, 이동 주소(API 는 빈 값), 본문.
    // 알림은 위에서 이미 보냈다 — plugin/webapp/notify/events.php 는 API 요청에서 건너뛴다.
    $recvNickName = isset($recv['mb_nick']) && $recv['mb_nick'] !== '' ? (string) $recv['mb_nick'] : $recvMbId;
    api_run_event('memo_form_update_after', array(
        array('id' => array($recvMbId), 'nick' => array($recvNickName)),
        $recvNickName,
        '',
        $memoText,
    ), $me);

    Response::success([
        'me_id' => $recvMemoId,
        'send_me_id' => $sendMemoId,
        'message' => '쪽지를 보냈습니다.',
    ], 201);
}

// -------------------------------------------------------------------------
// DELETE /v1/memos/{id} - 본인 쪽지 삭제
// -------------------------------------------------------------------------
if ($id && $apiMethod === 'DELETE') {

    $me = Auth::requireAuth();

    $memo = DB::fetch(
        "SELECT * FROM {$memoTable} WHERE me_id = ? LIMIT 1",
        [$id]
    );

    if (!$memo) {
        Response::error('Memo not found.', 404);
    }

    if ($memo['me_recv_mb_id'] !== $me['mb_id'] && $memo['me_send_mb_id'] !== $me['mb_id']) {
        Response::error('Forbidden.', 403);
    }

    DB::execute("DELETE FROM {$memoTable} WHERE me_id = ?", [$id]);

    if ($memo['me_recv_mb_id'] === $me['mb_id']) {
        DB::execute(
            "UPDATE {$memberTable}
             SET mb_memo_cnt = ?, mb_memo_call = ''
             WHERE mb_id = ?",
            [api_memo_not_read_count($me['mb_id']), $me['mb_id']]
        );
    }

    // 그누보드 훅(bbs/memo_delete.php) — 지운 쪽지 번호와 그 행
    api_run_event('memo_delete', array($id, $memo), $me);

    Response::success(['message' => '쪽지를 삭제했습니다.']);
}

// -------------------------------------------------------------------------
// Fallback
// -------------------------------------------------------------------------
Response::error('Method not allowed.', 405);
