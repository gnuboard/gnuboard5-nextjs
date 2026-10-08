<?php
/**
 * POST /v1/auth/web-ticket — 앱에서 레거시 웹 페이지를 로그인한 채로 열기 위한 1회용 입장권 (앱 T-P2-09).
 *
 * 레거시 쇼핑 페이지(현금영수증 발급 요청 shop/taxsave.php 등)는 PHP 세션만 알아보고 앱의 JWT 는 모른다. 앱이 이
 * 엔드포인트로 입장권을 받아 앱 안 시크릿 브라우저 창에서 plugin/webapp/bridge/enter.php 로 POST(t=입장권)하면,
 * 그 창에 **그 주문 하나의 조회 권한**(ss_orderview_uid — 레거시 is_shop_order_owner 가 회원 주문에도 인정)만 주고
 * target 으로 보낸다. 회원 로그인 세션은 만들지 않는다(최소 권한). 기존 서명 링크(shop/receipts cash-issue, 24시간)와
 * 같은 권한이지만 60초·1회용·POST 라 링크가 새어도 다시 쓸 수 없다.
 *
 *   본문 {to: '/shop/taxsave.php?od_id=…'}  — 열 수 있는 경로는 아래 목록뿐(그 밖은 422).
 *   회원: Bearer, 주문이 본인 것이어야. 비회원: `?uid=`(주문조회 uid) 가 맞아야. 맞지 않으면 404(존재 노출 안 함).
 *   200 {url, ticket, expires_in:60} — 입장권 원문은 이 응답에만 있고 표에는 SHA-256 만 남는다. 60초·1회용.
 */
if (!defined('_GNUBOARD_')) exit;

const API_WEB_TICKET_TTL = 60;

if (!function_exists('api_web_ticket_target')) {
    /** 열 수 있는 레거시 경로 → ['path' => 그대로, 'od_id' => 주문번호]. 목록 밖이면 null. */
    function api_web_ticket_target(string $to): ?array
    {
        if (preg_match('#^/shop/taxsave\.php\?od_id=([0-9]{10,20})$#', $to, $m) === 1) {
            return ['path' => $to, 'od_id' => $m[1]];
        }
        return null;
    }
}

if (!function_exists('api_web_ticket_guest_ok')) {
    /** 비회원 주문조회 uid — 레거시 세션(ss_orderview_uid)과 같은 값(get_shop_uid)이어야 한다. */
    function api_web_ticket_guest_ok(array $order, string $uid): bool
    {
        if ($uid === '' || (string) $order['mb_id'] !== '') {
            return false;
        }
        if (!function_exists('shop_api_order_uid')) {
            require_once __DIR__ . '/shop/common_session_helpers.php';
        }
        $expected = shop_api_order_uid($order['od_id'], $order['od_time'], $order['od_ip']);
        return hash_equals((string) $expected, $uid);
    }
}

if ($action === 'web-ticket' && $apiMethod === 'POST') {
    $input = json_decode((string) file_get_contents('php://input'), true);
    $input = is_array($input) ? $input : [];
    $target = api_web_ticket_target(trim((string) ($input['to'] ?? '')));
    if ($target === null) {
        Response::error('Unsupported target.', 422, ['to' => 'unsupported']);
    }

    $order = DB::fetch(
        'SELECT od_id, mb_id, od_time, od_ip FROM ' . DB::table('g5_shop_order_table') . ' WHERE od_id = ? LIMIT 1',
        [$target['od_id']]
    );
    $member = Auth::getUser();
    $guestUid = trim((string) ($_GET['uid'] ?? ''));
    $allowed = $order && ($member
        ? (string) $order['mb_id'] !== '' && (string) $order['mb_id'] === (string) $member['mb_id']
        : api_web_ticket_guest_ok($order, $guestUid));
    if (!$allowed) {
        Response::error('Order not found.', 404);
    }

    $table = DB::table('web_ticket_table');
    // 같은 회원(비회원은 같은 주문)이 1분에 10장까지 — 발급 폭주·DB 부하 방지.
    $recent = DB::fetch(
        "SELECT COUNT(*) AS n FROM {$table} WHERE created_at > NOW() - INTERVAL 60 SECOND AND "
            . ($member ? 'mb_id = ?' : "mb_id = '' AND od_id = ?"),
        [$member ? (string) $member['mb_id'] : (string) $order['od_id']]
    );
    if ((int) ($recent['n'] ?? 0) >= 10) {
        Response::error('Too many requests. Please try again shortly.', 429);
    }
    DB::execute("DELETE FROM {$table} WHERE expires_at < NOW() - INTERVAL 1 DAY");
    $raw = bin2hex(random_bytes(32));
    DB::execute(
        "INSERT INTO {$table} (token_hash, mb_id, od_id, target, expires_at)
         VALUES (?, ?, ?, ?, NOW() + INTERVAL " . API_WEB_TICKET_TTL . " SECOND)",
        [hash('sha256', $raw), $member ? (string) $member['mb_id'] : '', (string) $order['od_id'], $target['path']]
    );

    Response::success([
        'url' => G5_URL . '/plugin/webapp/bridge/enter.php',
        'ticket' => $raw,
        'expires_in' => API_WEB_TICKET_TTL,
    ]);
}
