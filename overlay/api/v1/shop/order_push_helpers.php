<?php
/**
 * 주문 상태 푸시 (앱 SERVER-CHANGES SC-07) — placed / paid / shipped / cancelled.
 *
 * 알림은 Notify::emit 한 곳으로 보낸다(알림함 한 줄 + 기기별 큐 + 즉시 발송). data 는
 * {type:'order', od_id(문자열), status, od_status} — 앱의 탭 라우터와 알림함이 같은 모양을 읽는다.
 * nt_type 은 custom 그대로이고, Expo 채널 'order' 는 PushQueue 가 data.type 으로 고른다.
 *
 * 관리자 화면에서만 바뀌는 두 상태(무통장 입금 확인 → paid, 송장 입력 → shipped)는
 * shop_api_run_order_push_pass() 가 DB 를 훑어 보낸다. 운영(카페24)은 크론이 없어 이 패스를
 *   A) 관리자 주문 저장 직후(extend/g5app.extend.php, shutdown)
 *   B) API 요청 끝에 5분에 한 번(shop_api_order_push_tick, api/index.php shutdown)
 * 두 길로 돌린다. paid/shipped 는 od_push_*_at 을 먼저 찍은 요청 하나만 보내므로 어느 길로
 * 몇 번 돌아도 한 번만 간다.
 *
 * 관리자 화면(extend)에서도 읽히므로 shop/common.php 에 기대지 않는다 — DB·Notify 만 쓴다.
 * 어떤 실패도 밖으로 던지지 않는다(주문·결제 흐름을 알림이 깨면 안 된다).
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('shop_api_order_push_boot')) {
    /** DB·Notify 가 없는 맥락(관리자 화면, CLI)에서 불러온다. Notify 가 없으면 false. */
    function shop_api_order_push_boot(): bool
    {
        $root = dirname(__DIR__, 3);
        if (!class_exists('DB')) {
            require_once $root . '/api/lib/DB.php';
        }
        if (!class_exists('Notify') && is_file($root . '/plugin/webapp/notify/Notify.php')) {
            require_once $root . '/plugin/webapp/notify/Notify.php';
        }
        return class_exists('Notify');
    }
}

if (!function_exists('shop_api_order_push_text')) {
    /**
     * 이벤트별 제목·본문. 본문에 금액·주소는 넣지 않는다(잠금화면 노출 최소화).
     *
     * @param array{od_id:string, od_delivery_company?:string, od_invoice?:string} $order
     * @param list<string> $itemNames 주문 줄 상품명(ct_id 순, 같은 상품 여러 줄 가능)
     * @return array{title:string, body:string}|null 모르는 이벤트면 null
     */
    function shop_api_order_push_text(string $event, array $order, array $itemNames): ?array
    {
        $odId = (string) $order['od_id'];
        $names = array_values(array_unique(array_filter(array_map('strval', $itemNames), 'strlen')));
        $summary = $names ? $names[0] . (count($names) > 1 ? ' 외 ' . (count($names) - 1) . '건' : '') . ' · ' : '';
        switch ($event) {
            case 'placed':
                return ['title' => '[주문] 주문이 접수되었어요', 'body' => $summary . '주문번호 ' . $odId];
            case 'paid':
                return ['title' => '[주문] 결제가 확인되었어요', 'body' => $summary . '주문번호 ' . $odId];
            case 'shipped':
                $invoice = trim(trim((string) ($order['od_delivery_company'] ?? '')) . ' ' . trim((string) ($order['od_invoice'] ?? '')));
                return ['title' => '[배송] 상품이 발송되었어요', 'body' => $invoice !== '' ? $invoice : '주문번호 ' . $odId];
            case 'cancelled':
                return ['title' => '[주문] 주문이 취소되었어요', 'body' => '주문번호 ' . $odId];
        }
        return null;
    }
}

if (!function_exists('shop_api_order_push_claim')) {
    /**
     * paid/shipped 는 od_push_*_at 을 먼저 찍은 쪽만 보낸다. 컬럼이 아직 없으면(설치기 전, SQLSTATE 42S22)
     * 보낸다 — 그때는 패스도 돌 수 없어 중복될 길이 없다. 그 밖의 오류(잠금 대기 초과 등)는 보내지 않는다 —
     * 표식이 안 찍혔으니 다음 패스가 다시 claim 한다(중복 대신 조금 늦게).
     */
    function shop_api_order_push_claim(string $od_id, string $event): bool
    {
        $column = ['paid' => 'od_push_paid_at', 'shipped' => 'od_push_shipped_at'][$event] ?? null;
        if ($column === null) {
            return true;
        }
        try {
            return DB::execute(
                "UPDATE " . DB::table('g5_shop_order_table') . " SET {$column} = NOW() WHERE od_id = ? AND {$column} IS NULL",
                [$od_id]
            ) === 1;
        } catch (\Throwable $e) {
            $missingColumn = (string) $e->getCode() === '42S22' || stripos($e->getMessage(), 'Unknown column') !== false;
            error_log('[order-push] claim ' . ($missingColumn ? 'skipped, column missing' : 'failed') . ' (' . $column . '): ' . $e->getMessage());
            return $missingColumn;
        }
    }
}

if (!function_exists('shop_api_push_order_event')) {
    /** 회원 주문 하나의 이벤트를 알림함·푸시로 보낸다. 게스트 주문(mb_id='')은 보내지 않는다. */
    function shop_api_push_order_event(string $od_id, string $event): void
    {
        try {
            if (!in_array($event, ['placed', 'paid', 'shipped', 'cancelled'], true) || !shop_api_order_push_boot()) {
                return;
            }
            $order = DB::fetch(
                "SELECT od_id, mb_id, od_status, od_delivery_company, od_invoice FROM " . DB::table('g5_shop_order_table') . " WHERE od_id = ? LIMIT 1",
                [$od_id]
            );
            if (!$order || trim((string) $order['mb_id']) === '') {
                return;
            }
            $rows = DB::fetchAll(
                "SELECT it_name FROM " . DB::table('g5_shop_cart_table') . " WHERE od_id = ? ORDER BY ct_id ASC",
                [$od_id]
            );
            $text = shop_api_order_push_text($event, $order, array_column($rows, 'it_name'));
            if ($text === null || !shop_api_order_push_claim($od_id, $event)) {
                return;
            }
            Notify::emit('order.' . $event, (string) $order['mb_id'], $text['title'], $text['body'], [
                'type' => 'order',
                'od_id' => (string) $order['od_id'],
                'status' => $event,
                'od_status' => (string) $order['od_status'],
            ]);
        } catch (\Throwable $e) {
            error_log('[order-push] ' . $event . ' ' . $od_id . ' failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('shop_api_order_admin_ids')) {
    /**
     * 새 주문 알림을 받을 관리자 — 최고관리자(기본환경설정 cf_admin)와, 관리자 권한 설정에서
     * 주문내역(메뉴 400400) 읽기 권한을 받은 부관리자.
     *
     * @return list<string>
     */
    function shop_api_order_admin_ids(): array
    {
        $ids = [];
        try {
            $config = DB::fetch("SELECT cf_admin FROM " . DB::table('config_table') . " LIMIT 1");
            $ids[] = trim((string) ($config['cf_admin'] ?? ''));
            $rows = DB::fetchAll(
                "SELECT mb_id FROM " . DB::table('auth_table') . " WHERE au_menu = '400400' AND au_auth LIKE '%r%'"
            );
            foreach ($rows as $row) {
                $ids[] = trim((string) $row['mb_id']);
            }
        } catch (\Throwable $e) {
            error_log('[order-push] admin list failed: ' . $e->getMessage());
        }
        return array_values(array_unique(array_filter($ids, 'strlen')));
    }
}

if (!function_exists('shop_api_order_admin_text')) {
    /**
     * 관리자용 새 주문 알림 문구. 운영에 필요한 주문 금액·상품·결제수단은 넣고,
     * 구매자 이름·연락처·주소는 넣지 않는다(잠금화면 노출).
     *
     * @param array<string,mixed> $order g5_shop_order 행(od_id, od_settle_case, 금액 칸)
     * @param list<string> $itemNames 주문 줄 상품명
     * @return array{title:string, body:string}
     */
    function shop_api_order_admin_text(array $order, array $itemNames): array
    {
        $names = array_values(array_unique(array_filter(array_map('strval', $itemNames), 'strlen')));
        $summary = $names ? $names[0] . (count($names) > 1 ? ' 외 ' . (count($names) - 1) . '건' : '') . ' · ' : '';
        $num = static function (string $key) use ($order): int {
            return (int) ($order[$key] ?? 0);
        };
        $total = $num('od_cart_price') + $num('od_send_cost') + $num('od_send_cost2')
            - $num('od_cart_coupon') - $num('od_coupon') - $num('od_send_coupon');
        $settle = trim((string) ($order['od_settle_case'] ?? ''));
        return [
            'title' => '[새 주문] ' . number_format(max(0, $total)) . '원',
            'body' => $summary . ($settle !== '' ? $settle . ' · ' : '') . '주문번호 ' . (string) $order['od_id'],
        ];
    }
}

if (!function_exists('shop_api_notify_admins_new_order')) {
    /**
     * 새 주문을 관리자에게 알린다(회원·비회원 주문 모두). 주문 하나에 한 번만 — 같은 주문이 접수(placed)와 결제
     * 확인(paid, 웹훅 포함)으로 여러 번 불려도 이름 잠금 + 알림함 기록으로 걸러 낸다.
     * 알림 data 는 {type:'admin.order.placed', od_id} — 앱은 누르면 그 주문의 관리자 주문서를 브라우저로 연다.
     */
    function shop_api_notify_admins_new_order(string $od_id): void
    {
        try {
            if (!preg_match('/^[0-9]{10,20}$/', $od_id) || !shop_api_order_push_boot()) {
                return;
            }
            $admins = shop_api_order_admin_ids();
            if (!$admins) {
                return;
            }
            $lock = 'g5_admin_new_order_' . $od_id;
            $got = DB::fetch('SELECT GET_LOCK(?, 0) AS got', [$lock]);
            if (empty($got['got'])) {
                return;
            }
            try {
                $seen = DB::fetch(
                    "SELECT nt_id FROM " . DB::table('notification_log_table')
                    . " WHERE mb_id = ? AND nt_event = 'admin.order.placed' AND nt_data LIKE ? LIMIT 1",
                    [$admins[0], '%"od_id":"' . $od_id . '"%']
                );
                if ($seen) {
                    return;
                }
                $order = DB::fetch(
                    "SELECT od_id, od_settle_case, od_cart_price, od_send_cost, od_send_cost2, od_cart_coupon, od_coupon, od_send_coupon FROM "
                    . DB::table('g5_shop_order_table') . " WHERE od_id = ? LIMIT 1",
                    [$od_id]
                );
                if (!$order) {
                    return;
                }
                $rows = DB::fetchAll(
                    "SELECT it_name FROM " . DB::table('g5_shop_cart_table') . " WHERE od_id = ? ORDER BY ct_id ASC",
                    [$od_id]
                );
                $text = shop_api_order_admin_text($order, array_column($rows, 'it_name'));
                Notify::emitMany('admin.order.placed', $admins, $text['title'], $text['body'], [
                    'type' => 'admin.order.placed',
                    'od_id' => (string) $order['od_id'],
                ]);
            } finally {
                DB::fetch('SELECT RELEASE_LOCK(?) AS released', [$lock]);
            }
        } catch (\Throwable $e) {
            error_log('[order-push] admin new order ' . $od_id . ' failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('shop_api_defer_order_push')) {
    /**
     * API 경로(주문 생성·결제 확인·웹훅·취소)용 — 응답을 먼저 내보낸 뒤(shutdown + fastcgi_finish_request)
     * 보낸다. Notify::emit 의 즉시 발송(Expo 호출, 최대 몇 초)이 결제 응답을 늦추지 않게 한다.
     * 접수·결제 확인이면 관리자에게도 새 주문을 알린다(주문 하나에 한 번).
     */
    function shop_api_defer_order_push(string $od_id, string $event): void
    {
        register_shutdown_function(static function () use ($od_id, $event) {
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            }
            shop_api_push_order_event($od_id, $event);
            if ($event === 'placed' || $event === 'paid') {
                shop_api_notify_admins_new_order($od_id);
            }
        });
    }
}

if (!function_exists('shop_api_run_order_push_pass')) {
    /**
     * 관리자 화면에서 바뀐 두 상태를 훑어 보낸다(최근 1일, 아직 안 보낸 회원 주문).
     *  - paid: 무통장(od_pg='') 입금 확인. PG 주문은 API 경로가 이미 보냈다.
     *  - shipped: 송장 입력으로 배송 전환.
     *
     * @return array{paid:int, shipped:int} 살펴본 주문 수(실제 발송은 claim 을 이긴 것만)
     */
    function shop_api_run_order_push_pass(int $limit = 50): array
    {
        $out = ['paid' => 0, 'shipped' => 0];
        if (!shop_api_order_push_boot()) {
            return $out;
        }
        $limit = max(1, min(200, $limit));
        $passes = [
            'paid' => "od_status = '입금' AND od_pg = '' AND od_receipt_time >= NOW() - INTERVAL 1 DAY AND od_push_paid_at IS NULL",
            'shipped' => "od_status = '배송' AND od_invoice_time >= NOW() - INTERVAL 1 DAY AND od_push_shipped_at IS NULL",
        ];
        foreach ($passes as $event => $where) {
            try {
                $rows = DB::fetchAll(
                    "SELECT od_id FROM " . DB::table('g5_shop_order_table') . " WHERE {$where} AND mb_id <> '' ORDER BY od_id ASC LIMIT {$limit}"
                );
            } catch (\Throwable $e) {
                error_log('[order-push] pass ' . $event . ' failed: ' . $e->getMessage());
                continue;
            }
            foreach ($rows as $row) {
                shop_api_push_order_event((string) $row['od_id'], $event);
                $out[$event]++;
            }
        }
        return $out;
    }
}

if (!function_exists('shop_api_order_push_tick')) {
    /**
     * API 요청 끝(shutdown)에 얹는 패스 — 마지막 실행 뒤 5분이 지났고 락을 잡은 요청 하나만 돈다.
     * 락을 못 잡으면 곧바로 끝낸다. 응답은 먼저 내보낸다(fastcgi_finish_request).
     */
    function shop_api_order_push_tick(int $intervalSeconds = 300): void
    {
        global $g5;
        if (empty($g5['g5_shop_order_table'])) {
            return;
        }
        require_once __DIR__ . '/throttled_pass_helpers.php';
        shop_api_run_throttled_pass('order_push_pass', $intervalSeconds, static function () {
            shop_api_run_order_push_pass();
        });
    }
}
