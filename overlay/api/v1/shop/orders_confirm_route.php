<?php
/**
 * POST /v1/shop/orders/{od_id}/confirm — 구매확정 (앱 SERVER-CHANGES SC-09, gnuboard5_2 이식).
 *
 * 고객이 '배송' 주문을 '완료'로 바꾸고 구매 적립 포인트를 즉시 받는다(de_point_days 무시 — "구매확정 시 즉시
 * 적립, 취소 시 환수"). 포인트 키는 취소 환수 코드(orders.php PATCH 4단계)와 같게: @shop_buy / od_id / ct_id.
 *
 * 순서: 주문 락 → 소유·상태 확인 → 포인트 적립(insert_point 는 같은 키를 두 번 넣지 않는다 — 재시도 안전)
 *       → 카트·주문 상태 전환(트랜잭션) → 락 해제 → 응답. 적립 뒤 상태 전환 전에 끊겨도 다시 부르면 이중 적립 없이
 *       마무리된다. 이후 관리자 페이지의 save_order_point 는 ct_point_use=1 이라 이 주문을 건너뛴다.
 *
 * 들어오는 변수(orders.php): $member, $mb_id, $od_id.
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('shop_orders_confirm_purchase')) {
    /**
     * @return array{0:int,1:string,2:array} [HTTP 상태, 오류 메시지, 성공 data 또는 오류 errors]
     */
    function shop_orders_confirm_purchase(string $odId, ?array $member, string $mbId, string $guestUid): array
    {
        $orderTable = DB::table('g5_shop_order_table');
        $cartTable = DB::table('g5_shop_cart_table');
        $order = $member
            ? DB::fetch("SELECT * FROM {$orderTable} WHERE od_id = ? AND mb_id = ? LIMIT 1", [$odId, $mbId])
            : DB::fetch("SELECT * FROM {$orderTable} WHERE od_id = ? AND mb_id = '' LIMIT 1", [$odId]);
        if (!$order || (!$member && !shop_api_can_view_guest_order($order, $guestUid))) {
            return [404, 'Order not found.', []];
        }

        $status = (string) $order['od_status'];
        if ($status === '완료') {
            return [200, '', ['order' => $order, 'confirmed_point' => 0, 'already_confirmed' => true]];
        }
        $rows = DB::fetchAll(
            "SELECT ct_id, ct_status, ct_point, ct_qty, ct_point_use FROM {$cartTable} WHERE od_id = ? ORDER BY ct_id",
            [$odId]
        );
        $notShipped = array_filter($rows, static fn($r) => (string) $r['ct_status'] !== '배송');
        if ($status !== '배송' || !$rows || $notShipped) {
            return [409, '현재 상태(' . $status . ')에서는 구매확정할 수 없습니다.', ['od_status' => $status]];
        }

        // 1) 포인트 — 회원만. insert_point 는 (rel_table, rel_id, rel_action) 이 같으면 넣지 않는다.
        $orderMbId = (string) $order['mb_id'];
        $earned = 0;
        if ($orderMbId !== '' && function_exists('insert_point')) {
            foreach ($rows as $r) {
                $earn = (int) $r['ct_point'] * (int) $r['ct_qty'];
                if ((int) $r['ct_point_use'] === 0 && $earn > 0) {
                    insert_point(
                        $orderMbId, $earn,
                        '주문번호 ' . $odId . ' (' . $r['ct_id'] . ') 구매확정 적립',
                        '@shop_buy', $odId, (string) $r['ct_id']
                    );
                    $earned += $earn;
                }
            }
        }

        // 2) 상태 전환.
        $at = defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
        $history = '[' . $at . '] 구매확정 / 적립 ' . number_format($earned) . '점';
        DB::beginTransaction();
        try {
            DB::execute("UPDATE {$cartTable} SET ct_status = '완료', ct_point_use = 1 WHERE od_id = ?", [$odId]);
            DB::execute(
                "UPDATE {$orderTable}
                    SET od_status = '완료',
                        od_mod_history = CASE WHEN od_mod_history = '' THEN ? ELSE CONCAT(od_mod_history, '\n', ?) END
                  WHERE od_id = ? AND od_status = '배송'",
                [$history, $history, $odId]
            );
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $updated = DB::fetch("SELECT * FROM {$orderTable} WHERE od_id = ? LIMIT 1", [$odId]) ?: $order;
        return [200, '', ['order' => $updated, 'confirmed_point' => $earned, 'already_confirmed' => false]];
    }
}

$confirmInput = json_decode((string) file_get_contents('php://input'), true);
$confirmInput = is_array($confirmInput) ? $confirmInput : [];
$confirmUid = trim((string) ($confirmInput['uid'] ?? ($_GET['uid'] ?? '')));

// 이중 클릭·동시 요청에 이중 적립이 없도록 주문 단위 락. 응답(exit) 전에 반드시 푼다.
$confirmLock = 'shop_order_' . $od_id;
$lock = DB::fetch('SELECT GET_LOCK(?, 3) AS l', [$confirmLock]);
if ((int) ($lock['l'] ?? 0) !== 1) {
    Response::error('Order is busy. Please retry shortly.', 409, ['code' => 'lock_busy']);
}
try {
    [$httpStatus, $message, $payload] = shop_orders_confirm_purchase((string) $od_id, $member ?: null, (string) $mb_id, $confirmUid);
} finally {
    DB::fetch('SELECT RELEASE_LOCK(?) AS l', [$confirmLock]);
}

if ($httpStatus !== 200) {
    Response::error($message, $httpStatus, $payload);
}
$payload['order']['od_id'] = (string) $payload['order']['od_id'];
Response::success($payload);
