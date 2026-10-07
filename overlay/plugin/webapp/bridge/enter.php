<?php
/**
 * 앱 → 레거시 웹 페이지 입장 (앱 T-P2-09). 앱 안 시크릿 브라우저 창이 POST t=<입장권> 으로 부른다.
 *
 * 입장권(POST /v1/auth/web-ticket 발급)을 한 번만 쓰도록 표시하고, 그 창에 **그 주문 하나의 조회 권한**만 준 뒤
 * target 으로 보낸다 — ss_orderview_uid(주문조회 uid). 레거시 is_shop_order_owner 는 회원 주문도 이 값으로 인정하므로
 * 회원 로그인 세션은 만들지 않는다(최소 권한 — 이 창에서 다른 회원 기능은 쓸 수 없다).
 * 입장권은 URL 이 아니라 POST 본문으로만 받는다(접속 로그·Referer 에 남지 않게). 실패는 사유를 가리지 않고 같은 안내.
 */
include_once dirname(__DIR__, 3) . '/common.php';
require_once G5_PATH . '/api/lib/DB.php';

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

function webapp_enter_fail(): void
{
    http_response_code(410);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<p style="font-family:sans-serif;padding:24px;line-height:1.6">링크가 만료되었거나 이미 사용되었어요.<br>앱에서 다시 시도해 주세요.</p>';
    exit;
}

$raw = isset($_POST['t']) ? (string) $_POST['t'] : '';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !preg_match('/^[0-9a-f]{64}$/', $raw) || empty($g5['web_ticket_table'])) {
    webapp_enter_fail();
}

$table = $g5['web_ticket_table'];
$hash = hash('sha256', $raw);
$claimed = DB::execute(
    "UPDATE `{$table}` SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()",
    [$hash]
);
$ticket = $claimed === 1 ? DB::fetch("SELECT * FROM `{$table}` WHERE token_hash = ? LIMIT 1", [$hash]) : null;
$target = $ticket ? (string) $ticket['target'] : '';
if (!$ticket || !preg_match('#^/shop/taxsave\.php\?od_id=([0-9]{10,20})$#', $target, $m) || $m[1] !== (string) $ticket['od_id']) {
    webapp_enter_fail();
}

// 발급 뒤 주문 주인이 바뀌지 않았는지 다시 본다(회원 입장권은 그 회원 주문, 비회원 입장권은 비회원 주문).
$od = DB::fetch(
    'SELECT od_id, mb_id, od_time, od_ip FROM ' . $g5['g5_shop_order_table'] . ' WHERE od_id = ? LIMIT 1',
    [(string) $ticket['od_id']]
);
if (!$od || (string) $od['mb_id'] !== (string) $ticket['mb_id'] || !function_exists('get_shop_uid')) {
    webapp_enter_fail();
}
// 이 창에 이미 다른 회원이 로그인해 있으면 주지 않는다 — 남이 자기 입장권을 다른 사이트에서 자동 POST 로 밀어 넣어
// 로그인한 사람의 세션에 남의 주문 권한을 섞지 못하게(비회원 주문 입장권도 로그인한 세션에는 주지 않는다).
// 앱은 시크릿 창으로 열어 로그인이 없으므로 영향이 없다.
if (!empty($member['mb_id']) && (string) $member['mb_id'] !== (string) $od['mb_id']) {
    webapp_enter_fail();
}
session_regenerate_id(true);
set_session('ss_orderview_uid', get_shop_uid('order', $od['od_id'], $od['od_time'], $od['od_ip']));

goto_url(G5_URL . $target);
