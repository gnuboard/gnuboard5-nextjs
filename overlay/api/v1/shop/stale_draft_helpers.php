<?php
/**
 * 결제 초안 24시간 자동 취소 + 카트 복원 (앱 SERVER-CHANGES SC-15).
 *
 * POST /shop/payment/prepare 는 카트 행을 '준비' 초안 주문에 묶는다. 앱이 pending 세션을 잃으면(재설치 등)
 * 그 행들이 영영 카트에서 사라지므로, 24시간 지난 초안을 서버가 취소하고 카트를 원래 id 로 되돌린다
 * (앱 usePaymentRecovery 의 24h 규칙과 같은 기준).
 *
 * 대상은 API prepare 가 만든 초안뿐이다 — od_shop_memo 의 [cart_id:…] 표식으로 가린다(SC-02 부터 기록).
 * 레거시 영카트에서 '준비'는 결제 뒤 "상품 준비 중"이라 od_status/od_pg/od_tno 만으로 거르면 실주문까지
 * 취소된다(dev 에서 2014년 무통장 입금 주문이 같은 조건에 걸렸다). 표식이 없으면 절대 건드리지 않는다.
 * 복원할 카트 id 도 이 표식에서 읽는다 — 요청 문맥(헤더·쿠키)으로 해석하면 남의 카트로 갈 수 있다.
 *
 * 크론이 없어 /shop/* 요청 끝에 10분에 한 번 돈다(shop_api_stale_draft_tick, shop/common.php).
 */
if (!defined('_GNUBOARD_')) exit;

if (!defined('SHOP_API_STALE_DRAFT_HOURS')) {
    define('SHOP_API_STALE_DRAFT_HOURS', 24);
    define('SHOP_API_STALE_DRAFT_REASON', '결제 미완료 24시간 경과 자동 취소');
}

if (!function_exists('shop_api_stale_draft_cart_id')) {
    /** od_shop_memo 의 [cart_id:…] 표식 → 카트 id(16~20자리 숫자). 없거나 형식이 틀리면 ''. */
    function shop_api_stale_draft_cart_id(string $shopMemo): string
    {
        return preg_match('/\[cart_id:([0-9]{16,20})\]/', $shopMemo, $m) === 1 ? $m[1] : '';
    }
}

if (!function_exists('shop_api_stale_draft_lock_name')) {
    /** 결제 확인(pg_payment_confirm_lock_name)과 같은 이름 — 확인과 자동 취소가 한 주문을 동시에 만지지 않는다. */
    function shop_api_stale_draft_lock_name(string $odId): string
    {
        return 'g5pay_' . md5($odId);
    }
}

if (!function_exists('shop_api_order_lock_name')) {
    /**
     * 주문 하나를 바꾸는 쪽(결제 확인 · 입금통보 · 주문 취소 · 결제 취소 · 구매확정 · 자동 취소)이 함께 쓰는 잠금 이름 —
     * 위 이름과 같다. 이름이 다르면 서로를 보지 못한다(예전 주문 취소 · 구매확정은 shop_order_{id} 를 따로 썼다).
     * 요청 값이 아니라 DB 의 주문번호로 만든다 — od_id 는 숫자 열이라 앞에 0 을 붙인 값도 같은 주문을 찾는데 이름은 달라진다.
     */
    function shop_api_order_lock_name(string $odId): string
    {
        $row = DB::fetch('SELECT od_id FROM ' . DB::table('g5_shop_order_table') . ' WHERE od_id = ? LIMIT 1', [$odId]);
        return shop_api_stale_draft_lock_name($row ? (string) $row['od_id'] : $odId);
    }
}

if (!function_exists('shop_api_is_stale_draft')) {
    /** 락을 잡은 뒤 다시 읽은 행으로 판정 — 그 사이 결제가 끝났으면(상태·tno 변경) 건드리지 않는다. */
    function shop_api_is_stale_draft(array $order, int $now): bool
    {
        $time = strtotime((string) ($order['od_time'] ?? ''));
        return ($order['od_status'] ?? '') === '준비'
            && (string) ($order['od_pg'] ?? '') !== ''
            && (string) ($order['od_tno'] ?? '') === ''
            && shop_api_stale_draft_cart_id((string) ($order['od_shop_memo'] ?? '')) !== ''
            && $time !== false
            && $time < $now - SHOP_API_STALE_DRAFT_HOURS * 3600;
    }
}

if (!function_exists('shop_api_cancel_one_stale_draft')) {
    function shop_api_cancel_one_stale_draft(string $odId): bool
    {
        $lockName = shop_api_stale_draft_lock_name($odId);
        try {
            // 기다리지 않는다 — 결제 확인이 쥐고 있으면 곧바로 다음 패스로(요청 뒤 워커를 붙잡지 않게).
            $lock = DB::fetch('SELECT GET_LOCK(?, 0) AS l', [$lockName]);
            if ((int) ($lock['l'] ?? 0) !== 1) {
                return false;
            }
        } catch (\Throwable $e) {
            error_log('[stale-draft] lock failed ' . $odId . ': ' . $e->getMessage());
            return false;
        }
        try {
            $order = DB::fetch('SELECT * FROM ' . DB::table('g5_shop_order_table') . ' WHERE od_id = ? LIMIT 1', [$odId]);
            if (!$order || !shop_api_is_stale_draft($order, time())) {
                return false;
            }
            $cartId = shop_api_stale_draft_cart_id((string) $order['od_shop_memo']);
            $member = trim((string) $order['mb_id']) !== '' ? ['mb_id' => (string) $order['mb_id']] : null;
            $restored = shop_api_restore_pending_order_cart($order, $member, SHOP_API_STALE_DRAFT_REASON, $cartId);
            error_log('[stale-draft] cancelled ' . $odId . ' restored_rows=' . (int) $restored);
            return true;
        } catch (\Throwable $e) {
            error_log('[stale-draft] cancel failed ' . $odId . ': ' . $e->getMessage());
            return false;
        } finally {
            try {
                DB::fetch('SELECT RELEASE_LOCK(?) AS l', [$lockName]);
            } catch (\Throwable $e) {
                // 이름 락은 연결 단위 — 연결이 닫히면 풀린다.
            }
        }
    }
}

if (!function_exists('shop_api_restore_pending_order_cart_locked')) {
    /**
     * 결제 확인과 같은 잠금을 잡고 임시 주문(준비)을 장바구니로 되돌린다 — 결제 재시도 · 무통장으로 바꾼 주문 · 주문서
     * 다시 열기(shop_api_restore_pending_cart_rows_by_ct_ids)가 쓴다. 결제 확인이 이 주문을 쥐고 있으면 건드리지 않는다
     * — 확인이 '준비'를 본 바로 뒤에 취소하면 결제는 되고 상품 줄은 없는 주문이 된다. 잠근 뒤 다시 읽어 그사이 결제가
     * 끝났으면(준비가 아니면) 그대로 둔다.
     *
     * @return int 되돌린 줄 수
     */
    function shop_api_restore_pending_order_cart_locked(array $order, $member, string $reason): int
    {
        $odId = (string) ($order['od_id'] ?? '');
        if ($odId === '') {
            return 0;
        }
        $lockName = shop_api_stale_draft_lock_name($odId);
        try {
            $lock = DB::fetch('SELECT GET_LOCK(?, 0) AS l', [$lockName]);
        } catch (\Throwable $e) {
            error_log('[restore-draft] lock failed ' . $odId . ': ' . $e->getMessage());
            return 0;
        }
        if ((int) ($lock['l'] ?? 0) !== 1) {
            return 0;
        }
        try {
            $fresh = DB::fetch('SELECT * FROM ' . DB::table('g5_shop_order_table') . ' WHERE od_id = ? LIMIT 1', [$odId]);
            return $fresh ? shop_api_restore_pending_order_cart($fresh, $member, $reason) : 0;
        } finally {
            try {
                DB::fetch('SELECT RELEASE_LOCK(?) AS l', [$lockName]);
            } catch (\Throwable $e) {
                // 이름 락은 연결 단위 — 연결이 닫히면 풀린다.
            }
        }
    }
}

if (!function_exists('shop_api_cancel_stale_payment_drafts')) {
    /** @return int 취소한 초안 수 */
    function shop_api_cancel_stale_payment_drafts(int $limit = 20): int
    {
        $limit = max(1, min(200, $limit));
        try {
            $rows = DB::fetchAll(
                "SELECT od_id FROM " . DB::table('g5_shop_order_table') . "
                  WHERE od_status = '준비' AND od_pg <> '' AND od_tno = ''
                    AND od_shop_memo LIKE '%[cart_id:%'
                    AND od_time < NOW() - INTERVAL " . SHOP_API_STALE_DRAFT_HOURS . " HOUR
                  ORDER BY od_time ASC LIMIT {$limit}"
            );
        } catch (\Throwable $e) {
            error_log('[stale-draft] select failed: ' . $e->getMessage());
            return 0;
        }

        $cancelled = 0;
        foreach ($rows as $row) {
            if (shop_api_cancel_one_stale_draft((string) $row['od_id'])) {
                $cancelled++;
            }
        }
        return $cancelled;
    }
}

if (!function_exists('shop_api_stale_draft_tick')) {
    /** /shop/* 요청 끝(shutdown)에 10분에 한 번. 24시간 기준이라 몇 시간 늦어도 영향이 없다. */
    function shop_api_stale_draft_tick(int $intervalSeconds = 600): void
    {
        global $g5;
        if (empty($g5['g5_shop_order_table'])) {
            return;
        }
        require_once __DIR__ . '/throttled_pass_helpers.php';
        shop_api_run_throttled_pass('stale_draft_pass', $intervalSeconds, static function () {
            shop_api_cancel_stale_payment_drafts();
        });
    }
}
