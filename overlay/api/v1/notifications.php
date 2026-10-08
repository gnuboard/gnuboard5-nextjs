<?php
/**
 * Gnuboard5 REST API - Notification Log Endpoints
 *
 * 회원/비회원 통합 알림 이력. 식별 우선순위:
 *   1) JWT 토큰 → mb_id
 *   2) X-Device-Id 헤더 → device_id (UUID v4)
 *   3) 둘 다 없으면 401
 *
 * Routes (prefix: v1/notifications):
 *   GET    /v1/notifications                  - 알림 이력 목록 (페이지네이션)
 *                                              ?unread_only=1 미읽음만
 *                                              ?event=comment.created 이벤트별 (nt_event)
 *   POST   /v1/notifications                  - 새 이력 기록
 *   POST   /v1/notifications/read-all         - 전체 읽음 처리
 *   POST   /v1/notifications/claim-device     - device_id 항목을 현재 mb_id 로 흡수 (로그인 직후)
 *   GET    /v1/notifications/unread-count     - 미읽음 개수 (UI 뱃지)
 *   GET    /v1/notifications/events           - 이 회원 알림함에 있는 이벤트별 건수 (필터 칩용)
 *   PATCH  /v1/notifications/{id}/read        - 단건 읽음 처리
 *   DELETE /v1/notifications/{id}             - 단건 삭제
 *   DELETE /v1/notifications                  - 전체 삭제
 */

if (!defined('_GNUBOARD_')) exit;

/**
 * api/index.php 가 핸들러 require 직전에 정의하는 라우팅 컨텍스트 변수들.
 * @var string   $apiMethod   HTTP method (GET/POST/PATCH/DELETE)
 * @var string[] $apiSegments URL path segments (resource 이후)
 * @var string   $apiRoute    Full route string
 */

$logTable = DB::table('notification_log_table');

/**
 * 현재 요청자를 식별. JWT > X-Device-Id.
 * @return array{kind:'member'|'device', mb_id?:string, device_id?:string, scope_sql:string, scope_params:array}
 */
function api_notif_resolve_actor(): array
{
    $me = Auth::getUser();
    if ($me && !empty($me['mb_id'])) {
        return [
            'kind'   => 'member',
            'mb_id'  => $me['mb_id'],
            // 같은 사람의 device_id 시절 데이터도 함께 보이도록 합집합 가능 — 단순화를 위해
            // 일단 mb_id 만 본다. device_id 시절 → mb_id 흡수는 claim-device 엔드포인트에서 처리.
            'scope_sql'    => 'mb_id = ?',
            'scope_params' => [$me['mb_id']],
        ];
    }

    $deviceId  = isset($_SERVER['HTTP_X_DEVICE_ID']) ? trim((string) $_SERVER['HTTP_X_DEVICE_ID']) : '';
    $deviceSig = isset($_SERVER['HTTP_X_DEVICE_SIG']) ? trim((string) $_SERVER['HTTP_X_DEVICE_SIG']) : '';

    // device_id + HMAC sig 가 모두 유효해야 device 모드 활성. sig 누락/위조 시 401.
    if ($deviceId !== '' && DeviceSig::verify($deviceId, $deviceSig)) {
        // 활동 기록 갱신 (best-effort)
        try {
            DB::execute(
                "UPDATE " . DB::table('device_table') . "
                 SET last_seen_at = NOW(), last_ip = ?
                 WHERE device_id = ?",
                [$_SERVER['REMOTE_ADDR'] ?? '', $deviceId]
            );
        } catch (\Throwable $e) { /* silent */ }

        return [
            'kind'      => 'device',
            'device_id' => $deviceId,
            // 회원에게 넘어간 행(mb_id 가 있는 것)은 기기 서명만으로 닿지 않게 한다 — 기기 모드는 비회원 행만.
            'scope_sql'    => 'mb_id IS NULL AND device_id = ?',
            'scope_params' => [$deviceId],
        ];
    }

    Response::error('Identification required (JWT or valid X-Device-Id + X-Device-Sig).', 401);
    // unreachable — Response::error 가 exit. 정적 분석기 만족용.
    return ['kind' => 'device', 'device_id' => '', 'scope_sql' => '1=0', 'scope_params' => []];
}

function api_notification_normalize(array $row): array
{
    $data = !empty($row['nt_data']) ? json_decode($row['nt_data'], true) : null;
    // dday_id 는 더 이상 컬럼이 아니라 nt_data 안의 값. 앱 계약(dday_id 필드)은 그대로 지킨다.
    $ddayId = is_array($data) && isset($data['dday_id']) && $data['dday_id'] !== '' ? (string) $data['dday_id'] : null;
    return [
        'nt_id'      => (int) $row['nt_id'],
        'nt_type'    => $row['nt_type'],
        'nt_event'   => isset($row['nt_event']) ? (string) $row['nt_event'] : '',
        'nt_title'   => $row['nt_title'],
        'nt_body'    => $row['nt_body'],
        'nt_data'    => $data,
        'dday_id'    => $ddayId,
        'nt_sent_at' => $row['nt_sent_at'],
        'nt_read_at' => $row['nt_read_at'],
        'is_read'    => !empty($row['nt_read_at']),
    ];
}

/** 이벤트 이름 정리 — 'comment.created' 꼴만 통과. */
function api_notification_event(string $value): string
{
    return substr(preg_replace('/[^a-z0-9_.\-]/', '', strtolower(trim($value))), 0, 40);
}

function api_notification_dedup_key(array $actor, string $clientUid): string
{
    $scope = $actor['kind'] === 'member'
        ? 'member:' . (string) ($actor['mb_id'] ?? '')
        : 'device:' . (string) ($actor['device_id'] ?? '');

    return hash('sha256', $scope . '|' . $clientUid);
}

$seg0 = isset($apiSegments[0]) ? $apiSegments[0] : '';
$seg1 = isset($apiSegments[1]) ? $apiSegments[1] : '';

// -------------------------------------------------------------------------
// POST /v1/notifications/claim-device — device_id 항목을 mb_id 로 흡수
//   클라이언트가 로그인 직후 1회 호출. JWT + X-Device-Id + X-Device-Sig 모두 필요.
//
// 다층 방어:
//   1) X-Device-Sig HMAC 검증 — 클라이언트가 sig 위조 불가
//   2) device_id 마지막 활동이 30일 이내 — 오래 안 쓰인 device 흡수 차단
//   3) 같은 device_id 가 이미 다른 mb_id 로 claim 됐는지 확인
// -------------------------------------------------------------------------
if ($seg0 === 'claim-device' && $apiMethod === 'POST') {
    $me = Auth::requireAuth();
    $deviceId  = isset($_SERVER['HTTP_X_DEVICE_ID']) ? trim((string) $_SERVER['HTTP_X_DEVICE_ID']) : '';
    $deviceSig = isset($_SERVER['HTTP_X_DEVICE_SIG']) ? trim((string) $_SERVER['HTTP_X_DEVICE_SIG']) : '';

    if (!DeviceSig::verify($deviceId, $deviceSig)) {
        Response::error('Invalid device signature.', 401);
    }

    // 활동 기간 검증 — 30일 이내 활동한 device 만 claim 가능
    $deviceTable = DB::table('device_table');
    $deviceRow = DB::fetch(
        "SELECT last_seen_at, claimed_by_mb_id FROM {$deviceTable} WHERE device_id = ?",
        [$deviceId]
    );

    if (!$deviceRow) {
        Response::error('Device not registered. Call /v1/devices/sign first.', 404);
    }

    if ($deviceRow['claimed_by_mb_id'] && $deviceRow['claimed_by_mb_id'] !== $me['mb_id']) {
        Response::error('Device already claimed by another account.', 409);
    }

    $lastSeenTs = strtotime((string) $deviceRow['last_seen_at']);
    if ($lastSeenTs === false || $lastSeenTs < strtotime('-30 days')) {
        Response::error('Device inactive for too long. Re-register required.', 410);
    }

    // device_id 항목 중 아직 mb_id 매핑이 없는 것들을 현재 mb_id 로 attach.
    $affected = DB::execute(
        "UPDATE {$logTable}
            SET mb_id = ?, device_id = NULL
          WHERE device_id = ? AND mb_id IS NULL",
        [$me['mb_id'], $deviceId]
    );

    // device 행에 claim 표시 (재흡수 방지)
    DB::execute(
        "UPDATE {$deviceTable}
            SET claimed_by_mb_id = ?, claimed_at = NOW()
          WHERE device_id = ?",
        [$me['mb_id'], $deviceId]
    );

    Response::success(['claimed' => (int) $affected]);
}

// 그 외 — actor 식별 후 동작
$actor = api_notif_resolve_actor();

// -------------------------------------------------------------------------
// GET /v1/notifications/unread-count
// -------------------------------------------------------------------------
if ($seg0 === 'unread-count' && $apiMethod === 'GET') {
    $count = DB::count(
        "SELECT COUNT(*) FROM {$logTable} WHERE {$actor['scope_sql']} AND nt_read_at IS NULL",
        $actor['scope_params']
    );
    Response::success(['unread_count' => $count]);
}

// -------------------------------------------------------------------------
// GET /v1/notifications/events — 알림함에 실제로 있는 이벤트만, 건수·미읽음과 함께.
// 앱·웹이 필터 칩을 그릴 때 빈 칩을 안 만들도록. 라벨은 클라이언트 i18n 몫.
// -------------------------------------------------------------------------
if ($seg0 === 'events' && $apiMethod === 'GET') {
    $rows = DB::fetchAll(
        "SELECT nt_event, COUNT(*) AS total, SUM(nt_read_at IS NULL) AS unread
           FROM {$logTable}
          WHERE {$actor['scope_sql']}
          GROUP BY nt_event
          ORDER BY MAX(nt_sent_at) DESC",
        $actor['scope_params']
    );
    $events = [];
    foreach ($rows as $r) {
        $events[] = [
            'event'  => (string) $r['nt_event'],
            'total'  => (int) $r['total'],
            'unread' => (int) $r['unread'],
        ];
    }
    Response::success($events);
}

// -------------------------------------------------------------------------
// POST /v1/notifications/read-all
// -------------------------------------------------------------------------
if ($seg0 === 'read-all' && $apiMethod === 'POST') {
    DB::execute(
        "UPDATE {$logTable}
            SET nt_read_at = NOW()
          WHERE {$actor['scope_sql']} AND nt_read_at IS NULL",
        $actor['scope_params']
    );
    Response::success(['message' => 'all marked as read']);
}

// -------------------------------------------------------------------------
// GET /v1/notifications — 목록 페이지네이션
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'GET') {

    $page    = get_page_param(1);
    $perPage = get_per_page_param(30, 100);
    $offset  = ($page - 1) * $perPage;

    $whereExtra = '';
    $extraParams = [];
    if (isset($_GET['unread_only']) && $_GET['unread_only']) {
        $whereExtra .= " AND nt_read_at IS NULL";
    }
    $event = isset($_GET['event']) && is_string($_GET['event']) ? api_notification_event($_GET['event']) : '';
    if ($event !== '') {
        $whereExtra .= " AND nt_event = ?";
        $extraParams[] = $event;
    }

    $total = DB::count(
        "SELECT COUNT(*) FROM {$logTable} WHERE {$actor['scope_sql']}{$whereExtra}",
        array_merge($actor['scope_params'], $extraParams)
    );

    $params = array_merge($actor['scope_params'], $extraParams, [$offset, $perPage]);
    $rows = DB::fetchAll(
        "SELECT nt_id, nt_type, nt_event, nt_title, nt_body, nt_data,
                nt_sent_at, nt_read_at
           FROM {$logTable}
          WHERE {$actor['scope_sql']}{$whereExtra}
          ORDER BY nt_sent_at DESC, nt_id DESC
          LIMIT ?, ?",
        $params
    );

    $items = array_map('api_notification_normalize', $rows);
    Response::paginated($items, $total, $page, $perPage);
}

// -------------------------------------------------------------------------
// POST /v1/notifications — 새 이력 기록
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'POST') {
    // 기기 모드는 발신 IP 로 센다.
    api_require_write_quota('notifcreate', $actor['kind'] === 'member' ? ['mb_id' => $actor['mb_id']] : null, 60, 600);

    $input = get_request_body();

    $errors = Validator::validate([
        'nt_title' => 'required|max:255',
        'nt_body'  => 'required',
    ], $input);
    if ($errors) Response::error('Validation failed.', 422, $errors);

    $type = (isset($input['nt_type']) && in_array($input['nt_type'], ['dday', 'system', 'custom'], true))
        ? $input['nt_type']
        : 'dday';

    // nt_data 는 JSON 객체로 정규화한다. 앱이 따로 보내는 dday_id 는 그 안으로 들어간다.
    $data = [];
    if (isset($input['nt_data'])) {
        $decoded = is_string($input['nt_data']) ? json_decode($input['nt_data'], true) : $input['nt_data'];
        if (is_array($decoded)) {
            $data = $decoded;
        }
    }
    if (isset($input['dday_id']) && is_string($input['dday_id'])) {
        $ddayId = substr(preg_replace('/[^a-zA-Z0-9_\-]/', '', $input['dday_id']), 0, 36);
        if ($ddayId !== '') {
            $data['dday_id'] = $ddayId;
        }
    }
    $event = isset($input['nt_event']) && is_string($input['nt_event']) ? api_notification_event($input['nt_event']) : '';
    if ($event === '' && isset($data['type']) && is_string($data['type'])) {
        $event = api_notification_event($data['type']);
    }
    if ($event === '') {
        $event = $type;
    }
    $dataJson = $data ? json_encode($data, JSON_UNESCAPED_UNICODE) : '';

    $clientUid = isset($input['client_uid']) && is_string($input['client_uid'])
        ? substr(preg_replace('/[^a-zA-Z0-9:_\-]/', '', $input['client_uid']), 0, 96)
        : '';
    $hasDedupKey = function_exists('webapp_column_exists') && webapp_column_exists($logTable, 'nt_dedup_key');
    $dedupKey = ($hasDedupKey && $clientUid !== '') ? api_notification_dedup_key($actor, $clientUid) : null;

    if ($dedupKey !== null) {
        $existing = DB::fetch(
            "SELECT nt_id, nt_type, nt_event, nt_title, nt_body, nt_data, nt_sent_at, nt_read_at
               FROM {$logTable}
              WHERE nt_dedup_key = ?
              LIMIT 1",
            [$dedupKey]
        );
        if ($existing) {
            Response::success(api_notification_normalize($existing), 200);
        }
    }

    // 보낸 시각은 앱이 오프라인 동안 받은 알림을 나중에 올릴 때를 위해 받되, 미래(5분 넘게)나 30일보다 오래된 값은
    // 버리고 서버 시각을 쓴다 — 임의 시각으로 알림함 정렬을 흐트러뜨리지 못하게.
    $sentAt = date('Y-m-d H:i:s');
    if (isset($input['nt_sent_at']) && is_string($input['nt_sent_at'])) {
        $ts = strtotime($input['nt_sent_at']);
        if ($ts !== false && $ts <= time() + 300 && $ts >= time() - 30 * 86400) {
            $sentAt = date('Y-m-d H:i:s', $ts);
        }
    }

    $mb_id     = $actor['kind'] === 'member' ? $actor['mb_id']     : null;
    $device_id = $actor['kind'] === 'device' ? $actor['device_id'] : null;

    DB::execute(
        "INSERT INTO {$logTable}
            (mb_id, device_id, nt_type, nt_event, nt_title, nt_body, nt_data, nt_dedup_key, nt_sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $mb_id,
            $device_id,
            $type,
            $event,
            $input['nt_title'],
            $input['nt_body'],
            $dataJson,
            $dedupKey,
            $sentAt,
        ]
    );

    $id = (int) DB::lastInsertId();
    $row = DB::fetch(
        "SELECT nt_id, nt_type, nt_event, nt_title, nt_body, nt_data, nt_sent_at, nt_read_at
           FROM {$logTable} WHERE nt_id = ?",
        [$id]
    );
    Response::success($row ? api_notification_normalize($row) : null, 201);
}

// -------------------------------------------------------------------------
// DELETE /v1/notifications — 전체 삭제
// -------------------------------------------------------------------------
if (!$seg0 && $apiMethod === 'DELETE') {
    DB::execute(
        "DELETE FROM {$logTable} WHERE {$actor['scope_sql']}",
        $actor['scope_params']
    );
    Response::noContent();
}

// -------------------------------------------------------------------------
// /v1/notifications/{id}/... — 단건 작업
// -------------------------------------------------------------------------
$id = (int) $seg0;
if ($id <= 0) Response::error('Invalid notification id.', 404);

// 본인 소유 검증 — actor scope 안에서만 접근 가능
$ownerParams = array_merge([$id], $actor['scope_params']);
$owned = DB::fetch(
    "SELECT nt_id FROM {$logTable} WHERE nt_id = ? AND {$actor['scope_sql']}",
    $ownerParams
);
if (!$owned) Response::error('Notification not found.', 404);

// PATCH /v1/notifications/{id}/read
if ($seg1 === 'read' && $apiMethod === 'PATCH') {
    DB::execute(
        "UPDATE {$logTable} SET nt_read_at = NOW() WHERE nt_id = ? AND nt_read_at IS NULL",
        [$id]
    );
    Response::success(['nt_id' => $id, 'is_read' => true]);
}

// DELETE /v1/notifications/{id}
if (!$seg1 && $apiMethod === 'DELETE') {
    DB::execute("DELETE FROM {$logTable} WHERE nt_id = ?", [$id]);
    Response::noContent();
}

Response::error('Not found.', 404);
