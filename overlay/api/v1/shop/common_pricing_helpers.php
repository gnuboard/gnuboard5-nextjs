<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_shipping_rules')) {
    function shop_api_shipping_rules(?array $cfg = null): array
    {
        $cfg = $cfg ?? shop_api_shop_default_config();
        $limits = explode(';', (string) ($cfg['de_send_cost_limit'] ?? ''));
        $costs = explode(';', (string) ($cfg['de_send_cost_list'] ?? ''));
        $rules = [];

        foreach ($limits as $index => $rawLimit) {
            $limit = (int) preg_replace('/[^0-9]/', '', (string) $rawLimit);
            if ($limit <= 0) {
                continue;
            }
            $cost = (int) preg_replace('/[^0-9]/', '', (string) ($costs[$index] ?? 0));
            $rules[] = [
                'limit' => $limit,
                'cost' => max(0, $cost),
            ];
        }

        usort($rules, static fn($a, $b) => $a['limit'] <=> $b['limit']);
        return $rules;
    }
}

if (!function_exists('shop_api_shipping_base_cost')) {
    function shop_api_shipping_base_cost(int $itemTotal, ?array $cfg = null): int
    {
        $cfg = $cfg ?? shop_api_shop_default_config();
        $case = (string) ($cfg['de_send_cost_case'] ?? '');

        if ($case === '무료') {
            return 0;
        }

        $rules = shop_api_shipping_rules($cfg);
        if ($case === '차등' && $rules) {
            foreach ($rules as $rule) {
                if ($itemTotal < (int) $rule['limit']) {
                    return (int) $rule['cost'];
                }
            }
            return 0;
        }

        return $itemTotal >= 50000 ? 0 : 3000;
    }
}

if (!function_exists('shop_api_shipping_free_threshold')) {
    function shop_api_shipping_free_threshold(?array $cfg = null): int
    {
        $cfg = $cfg ?? shop_api_shop_default_config();
        if (($cfg['de_send_cost_case'] ?? '') === '무료') {
            return 0;
        }

        $rules = shop_api_shipping_rules($cfg);
        if (!$rules) {
            return 50000;
        }

        $max = 0;
        foreach ($rules as $rule) {
            $max = max($max, (int) $rule['limit']);
        }
        return $max;
    }
}

if (!function_exists('shop_api_policy_summary')) {
    function shop_api_policy_summary(?array $cfg = null): array
    {
        global $config;

        $cfg = $cfg ?? shop_api_shop_default_config();
        $threshold = shop_api_shipping_free_threshold($cfg);

        return [
            'delivery_company' => shop_api_plain_text($cfg['de_delivery_company'] ?? ''),
            'send_cost_case' => (string) ($cfg['de_send_cost_case'] ?? ''),
            'send_cost_limit' => (string) ($cfg['de_send_cost_limit'] ?? ''),
            'send_cost_list' => (string) ($cfg['de_send_cost_list'] ?? ''),
            'shipping_rules' => shop_api_shipping_rules($cfg),
            'base_shipping_cost' => shop_api_shipping_base_cost(0, $cfg),
            'free_threshold' => $threshold,
            'delivery_content' => (string) ($cfg['de_baesong_content'] ?? ''),
            'delivery_content_text' => shop_api_plain_text($cfg['de_baesong_content'] ?? ''),
            'exchange_content' => (string) ($cfg['de_change_content'] ?? ''),
            'exchange_content_text' => shop_api_plain_text($cfg['de_change_content'] ?? ''),
            'review_requires_completed_order' => (int) ($cfg['de_item_use_write'] ?? 0) === 1,
            'review_requires_moderation' => (int) ($cfg['de_item_use_use'] ?? 0) === 1,
            'point_use_enabled' => !empty($config['cf_use_point']),
            'settle_min_point' => (int) ($cfg['de_settle_min_point'] ?? 0),
            'settle_max_point' => (int) ($cfg['de_settle_max_point'] ?? 0),
            'settle_point_unit' => (int) ($cfg['de_settle_point_unit'] ?? 1),
        ];
    }
}

if (!function_exists('shop_api_send_order_mail')) {
    /**
     * 주문 단계별 알림 메일 — 구매자 + 운영자 양쪽.
     *
     *   event: 'placed' (주문 접수, 무통장 입금대기 안내 / PG 즉시결제 확인)
     *          'paid'   (PG 매입 승인 완료)
     *          'cancelled' (취소)
     *
     * 그누보드 mailer() 사용. cf_email_use 가 꺼져 있으면 자동 skip.
     * 실패해도 주문 흐름 자체엔 영향 없도록 try/silently fail.
     */
    function shop_api_send_order_mail(string $od_id, string $event): void
    {
        global $config;

        if (!function_exists('mailer') || empty($config['cf_email_use'])) {
            return;
        }

        $order = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . "
             WHERE od_id = ? LIMIT 1",
            [$od_id]
        );
        if (!$order || empty($order['od_email'])) {
            return;
        }

        $items = DB::fetchAll(
            "SELECT it_name, ct_qty, ct_price, ct_option, io_type, io_price FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ?",
            [$od_id]
        );
        $itemLines = [];
        foreach ($items as $it) {
            $opt = str_replace("\x1e", ' / ', (string) $it['ct_option']);
            $itemLines[] = sprintf(
                '- %s%s × %d개  %s원',
                $it['it_name'],
                $opt !== '' ? ' (' . $opt . ')' : '',
                (int) $it['ct_qty'],
                number_format(shop_api_cart_line_total($it))
            );
        }

        $siteName = $config['cf_title'] ?? '쇼핑몰';
        $adminMail = $config['cf_admin_email'] ?? '';
        $total = number_format((int) ($order['od_receipt_price'] ?? 0));

        $subjectByEvent = [
            'placed'    => "[{$siteName}] 주문 접수 — {$od_id}",
            'paid'      => "[{$siteName}] 결제 완료 — {$od_id}",
            'cancelled' => "[{$siteName}] 주문 취소 — {$od_id}",
        ];
        $headByEvent = [
            'placed'    => $order['od_settle_case'] === '무통장' || $order['od_settle_case'] === '가상계좌'
                ? "주문이 접수되었습니다. 입금 확인 후 배송이 시작됩니다.\n"
                : "주문이 접수되었습니다.\n",
            'paid'      => "결제가 완료되었습니다. 배송 준비를 시작합니다.\n",
            'cancelled' => "주문이 취소되었습니다. 사용한 쿠폰/포인트는 자동 환급됐습니다.\n",
        ];
        $subject = $subjectByEvent[$event] ?? "[{$siteName}] 주문 알림 — {$od_id}";
        $head    = $headByEvent[$event]    ?? '';

        $body = $head . "\n"
              . "주문번호: {$od_id}\n"
              . "결제수단: " . ($order['od_settle_case'] ?? '-') . "\n"
              . "결제금액: {$total}원\n\n"
              . "[주문 상품]\n"
              . implode("\n", $itemLines) . "\n\n"
              . "[배송지]\n"
              . ($order['od_b_name'] ?? '') . ' / ' . ($order['od_b_hp'] ?? '') . "\n"
              . '(' . ($order['od_b_zip1'] ?? '') . ($order['od_b_zip2'] ?? '') . ') '
              . ($order['od_b_addr1'] ?? '') . ' ' . ($order['od_b_addr2'] ?? '') . ' '
              . ($order['od_b_addr3'] ?? '') . "\n";

        // 가상계좌 입금 안내가 있으면 본문에 포함.
        if ($event === 'placed' && !empty($order['od_bank_account'])) {
            $body .= "\n[입금 계좌]\n" . $order['od_bank_account'] . "\n";
        }

        // 구매자 메일.
        api_call_core('mailer', array($siteName, $adminMail, $order['od_email'], $subject, $body, 0)); // 안의 mailer · mail_options · mail_send_result 훅도 보호해서
        // 운영자 메일 (BCC 대신 별도 전송).
        if ($adminMail) {
            api_call_core('mailer', array($siteName, $adminMail, $adminMail, $subject . ' [운영자 알림]', $body, 0)); // 안의 mailer · mail_options · mail_send_result 훅도 보호해서
        }
    }
}

if (!function_exists('shop_api_coupon_evaluate')) {
    /**
     * 주문 쿠폰 1건이 주어진 주문 합계에 사용 가능한지 검증하고 실제 할인액을 계산.
     * coupons.php 의 validate 엔드포인트와 prepare/orders POST 의 적용 단계가
     * 동일한 룰을 공유해 시뮬레이션과 실제 적용 결과가 어긋나지 않게 한다.
     *
     * @param array  $coupon       g5_shop_coupon row
     * @param int    $orderAmount  주문 합계 (배송비 제외, 상품 합)
     * @param string $mbId         호출자 회원 ID
     * @return array{ok:bool, discount?:int, reason?:string}
     */
    function shop_api_coupon_evaluate(array $coupon, int $orderAmount, string $mbId): array
    {
        if ((int) $coupon['cp_method'] !== 2) {
            return ['ok' => false, 'reason' => '주문 쿠폰이 아닙니다.'];
        }
        if (!shop_api_coupon_owner_matches($coupon, $mbId)) {
            return ['ok' => false, 'reason' => '발급 대상 회원이 아닙니다.'];
        }
        $today = date('Y-m-d');
        if (!empty($coupon['cp_start']) && $coupon['cp_start'] !== '0000-00-00' && $today < $coupon['cp_start']) {
            return ['ok' => false, 'reason' => '사용 가능 기간 전입니다.'];
        }
        if (!empty($coupon['cp_end']) && $coupon['cp_end'] !== '0000-00-00' && $today > $coupon['cp_end']) {
            return ['ok' => false, 'reason' => '사용 기간이 만료되었습니다.'];
        }
        if ((int) $coupon['cp_minimum'] > 0 && $orderAmount < (int) $coupon['cp_minimum']) {
            return ['ok' => false, 'reason' => '최소 주문금액 미달.'];
        }

        // 이미 사용한 쿠폰은 재사용 불가.
        $used = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
             WHERE cp_id = ? AND mb_id = ?",
            [$coupon['cp_id'], $mbId]
        );
        if ($used > 0) {
            return ['ok' => false, 'reason' => '이미 사용한 쿠폰입니다.'];
        }

        $cpType  = (int) $coupon['cp_type'];   // 0 정액, 1 정률
        $cpPrice = (int) $coupon['cp_price'];
        $cpMax   = (int) $coupon['cp_maximum'];
        $cpTrunc = (int) $coupon['cp_trunc'];

        if ($cpType === 1) {
            $discount = (int) floor($orderAmount * $cpPrice / 100);
            if ($cpTrunc > 0) {
                $discount = (int) (floor($discount / $cpTrunc) * $cpTrunc);
            }
        } else {
            $discount = $cpPrice;
        }
        if ($cpMax > 0 && $discount > $cpMax) {
            $discount = $cpMax;
        }
        if ($discount > $orderAmount) {
            $discount = $orderAmount;
        }
        if ($discount <= 0) {
            return ['ok' => false, 'reason' => '적용 가능한 할인액이 0원입니다.'];
        }

        return ['ok' => true, 'discount' => $discount];
    }
}

if (!function_exists('shop_api_coupon_public_owner')) {
    function shop_api_coupon_public_owner(): string
    {
        return "\xEC\xA0\x84\xEC\xB2\xB4\xED\x9A\x8C\xEC\x9B\x90";
    }
}

if (!function_exists('shop_api_coupon_owner_matches')) {
    function shop_api_coupon_owner_matches(array $coupon, string $mbId): bool
    {
        $owner = trim((string) ($coupon['mb_id'] ?? ''));
        return $owner === ''
            || $owner === $mbId
            || $owner === shop_api_coupon_public_owner();
    }
}

if (!function_exists('shop_api_item_coupon_evaluate')) {
    /**
     * 상품/카테고리 쿠폰 평가 — 카트 행 단위 적용 검증 + 할인액 계산.
     *
     *   - cp_method=0 (상품쿠폰): cp_target == cart.it_id
     *   - cp_method=1 (카테고리쿠폰): cp_target ∈ {ca_id, ca_id2, ca_id3}
     *   - cp_method=2 (주문쿠폰) 은 여기서 거부 — shop_api_coupon_evaluate 사용.
     *
     * rowAmount 는 (ct_price + io_price) * ct_qty 또는 io_type=1 이면 io_price * ct_qty.
     * 일치하지 않거나 적용 불가면 ok=false. 적용 가능하면 ok=true + discount.
     *
     * @param array  $coupon     g5_shop_coupon row
     * @param array  $cartRow    g5_shop_cart row (ct_id, it_id, ct_price, io_type, io_price, ct_qty)
     * @param array  $itemCats   ['ca_id'=>..., 'ca_id2'=>..., 'ca_id3'=>...]
     * @param string $mbId       호출자 회원 ID
     * @return array{ok:bool, discount?:int, reason?:string}
     */
    function shop_api_item_coupon_evaluate(array $coupon, array $cartRow, array $itemCats, string $mbId): array
    {
        $method = (int) $coupon['cp_method'];
        if ($method !== 0 && $method !== 1) {
            return ['ok' => false, 'reason' => '상품/카테고리 쿠폰이 아닙니다.'];
        }
        $target = (string) ($coupon['cp_target'] ?? '');
        if ($method === 0 && $target !== (string) $cartRow['it_id']) {
            return ['ok' => false, 'reason' => '이 상품에 적용 가능한 쿠폰이 아닙니다.'];
        }
        if ($method === 1) {
            $cats = array_filter([
                (string) ($itemCats['ca_id']  ?? ''),
                (string) ($itemCats['ca_id2'] ?? ''),
                (string) ($itemCats['ca_id3'] ?? ''),
            ], fn($v) => $v !== '');
            if (!in_array($target, $cats, true)) {
                return ['ok' => false, 'reason' => '이 카테고리에 적용 가능한 쿠폰이 아닙니다.'];
            }
        }

        if (!shop_api_coupon_owner_matches($coupon, $mbId)) {
            return ['ok' => false, 'reason' => '발급 대상 회원이 아닙니다.'];
        }
        $today = date('Y-m-d');
        if (!empty($coupon['cp_start']) && $coupon['cp_start'] !== '0000-00-00' && $today < $coupon['cp_start']) {
            return ['ok' => false, 'reason' => '사용 가능 기간 전입니다.'];
        }
        if (!empty($coupon['cp_end']) && $coupon['cp_end'] !== '0000-00-00' && $today > $coupon['cp_end']) {
            return ['ok' => false, 'reason' => '사용 기간이 만료되었습니다.'];
        }

        // 이미 사용했는지.
        $used = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
             WHERE cp_id = ? AND mb_id = ?",
            [$coupon['cp_id'], $mbId]
        );
        if ($used > 0) {
            return ['ok' => false, 'reason' => '이미 사용한 쿠폰입니다.'];
        }

        // rowAmount: io_type=1(독립옵션) 이면 io_price 만, 아니면 ct_price + io_price.
        $unit = (int) $cartRow['io_type'] === 1
            ? (int) $cartRow['io_price']
            : ((int) $cartRow['ct_price'] + (int) $cartRow['io_price']);
        $rowAmount = $unit * (int) $cartRow['ct_qty'];

        if ((int) $coupon['cp_minimum'] > 0 && $rowAmount < (int) $coupon['cp_minimum']) {
            return ['ok' => false, 'reason' => '최소 주문금액 미달.'];
        }

        $cpType  = (int) $coupon['cp_type'];
        $cpPrice = (int) $coupon['cp_price'];
        $cpMax   = (int) $coupon['cp_maximum'];
        $cpTrunc = (int) $coupon['cp_trunc'];

        if ($cpType === 1) {
            $discount = (int) floor($rowAmount * $cpPrice / 100);
            if ($cpTrunc > 0) {
                $discount = (int) (floor($discount / $cpTrunc) * $cpTrunc);
            }
        } else {
            $discount = $cpPrice;
        }
        if ($cpMax > 0 && $discount > $cpMax) $discount = $cpMax;
        if ($discount > $rowAmount) $discount = $rowAmount;
        if ($discount <= 0) {
            return ['ok' => false, 'reason' => '적용 가능한 할인액이 0원입니다.'];
        }

        return ['ok' => true, 'discount' => $discount];
    }
}

if (!function_exists('shop_api_reevaluate_line_coupon')) {
    /**
     * 카트 줄 쿠폰(상품/카테고리) 재평가 — 앱 SERVER-CHANGES §7 "카트 줄 쿠폰 cp_price" 수정.
     *
     * apply-to-cart 가 적용 시점의 수량으로 cp_price 를 저장해 두므로, 수량·옵션이 바뀌거나 시간이 지나면
     * (최소 주문금액 미달·만료·이미 사용) 저장값이 틀린다. 수량 변경(PATCH /cart)과 주문 생성·결제 준비가
     * 이 함수로 지금 조건을 다시 적용한다 — 여전히 쓸 수 있으면 할인액을 갱신, 아니면 쿠폰을 떼어 낸다
     * (cp_price=0, ct_history=''). 비회원은 줄 쿠폰을 쓸 수 없으므로 붙어 있으면 뗀다.
     *
     * @return int 이 줄의 현재 할인액(0 이면 쿠폰 없음)
     */
    function shop_api_reevaluate_line_coupon(int $ctId, string $mbId): int
    {
        $cartTable = DB::table('g5_shop_cart_table');
        $row = DB::fetch(
            "SELECT c.ct_id, c.it_id, c.ct_price, c.ct_qty, c.io_type, c.io_price, c.cp_price, c.ct_history,
                    i.ca_id, i.ca_id2, i.ca_id3
               FROM {$cartTable} c
               LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = c.it_id
              WHERE c.ct_id = ? LIMIT 1",
            [$ctId]
        );
        if (!$row || ((int) $row['cp_price'] <= 0 && (string) $row['ct_history'] === '')) {
            return 0;
        }

        $cpId = function_exists('shop_api_coupon_marker_extract') ? shop_api_coupon_marker_extract((string) $row['ct_history']) : '';
        $discount = 0;
        if ($cpId !== '' && $mbId !== '') {
            $coupon = DB::fetch('SELECT * FROM ' . DB::table('g5_shop_coupon_table') . ' WHERE cp_id = ? LIMIT 1', [$cpId]);
            if ($coupon) {
                $res = shop_api_item_coupon_evaluate($coupon, $row, [
                    'ca_id' => $row['ca_id'] ?? '', 'ca_id2' => $row['ca_id2'] ?? '', 'ca_id3' => $row['ca_id3'] ?? '',
                ], $mbId);
                $discount = !empty($res['ok']) ? (int) $res['discount'] : 0;
            }
        }

        if ($discount > 0) {
            if ($discount !== (int) $row['cp_price']) {
                DB::execute("UPDATE {$cartTable} SET cp_price = ? WHERE ct_id = ?", [$discount, $ctId]);
            }
            return $discount;
        }
        DB::execute("UPDATE {$cartTable} SET cp_price = 0, ct_history = '' WHERE ct_id = ?", [$ctId]);
        return 0;
    }
}

if (!function_exists('shop_api_reevaluate_cart_line_coupons')) {
    /**
     * 주문 생성·결제 준비용 — 읽어 온 카트 행 목록의 줄 쿠폰을 재평가해 cp_price/ct_history 를 지금 값으로 바꾼
     * 새 목록을 돌려준다(저장된 값을 그대로 믿지 않는다).
     *
     * @param list<array<string,mixed>> $rows ct_id, cp_price, ct_history 포함
     * @return list<array<string,mixed>>
     */
    function shop_api_reevaluate_cart_line_coupons(array $rows, string $mbId): array
    {
        // 쿠폰 한 장은 한 줄에만 인정한다 — 같은 쿠폰이 여러 줄에 붙어 있으면(예전 카트 · 동시 요청) 먼저 인정된
        // 줄만 남기고 나머지 줄의 할인은 지운다. 주문 합계가 줄마다의 cp_price 를 더하므로 여기서 막아야 N배가 안 된다.
        $usedCoupons = [];
        $out = [];
        foreach ($rows as $row) {
            if ((int) ($row['cp_price'] ?? 0) <= 0 && (string) ($row['ct_history'] ?? '') === '') {
                $out[] = $row;
                continue;
            }
            $cpId = function_exists('shop_api_coupon_marker_extract')
                ? shop_api_coupon_marker_extract((string) ($row['ct_history'] ?? ''))
                : '';
            if ($cpId !== '' && isset($usedCoupons[$cpId])) {
                DB::execute(
                    "UPDATE " . DB::table('g5_shop_cart_table') . " SET cp_price = 0, ct_history = '' WHERE ct_id = ?",
                    [(int) $row['ct_id']]
                );
                $out[] = array_merge($row, ['cp_price' => 0, 'ct_history' => '']);
                continue;
            }
            $discount = shop_api_reevaluate_line_coupon((int) $row['ct_id'], $mbId);
            if ($discount > 0 && $cpId !== '') {
                $usedCoupons[$cpId] = true;
            }
            $out[] = array_merge($row, ['cp_price' => $discount, 'ct_history' => $discount > 0 ? $row['ct_history'] : '']);
        }
        return $out;
    }
}

if (!function_exists('shop_api_member_order_lock_name')) {
    /**
     * 회원의 주문 만들기(무통장)와 결제 확정이 함께 줄을 서는 잠금 이름.
     * 쿠폰 "이미 썼나" 확인은 읽기라, 장바구니를 여러 개 만들어 동시에 주문하면 같은 쿠폰이 여러 주문에 들어갔다.
     */
    function shop_api_member_order_lock_name(string $mbId): string
    {
        return 'g5_shop_member_order_' . md5($mbId);
    }
}

if (!function_exists('shop_api_send_cost')) {
    /**
     * 배송비 계산 — 기본 배송비 + g5_shop_sendcost(우편번호 LIKE) 의 도서산간 추가.
     *
     *   base: 50,000원 이상 무료, 미만이면 cf 의 기본가 (현재 단순 3,000).
     *   extra: 배송지 우편번호 prefix 매칭 행의 sc_price 합 (도서산간 등).
     *
     * @return array{base:int, extra:int, total:int}
     */
    function shop_api_send_cost(int $itemTotal, string $odZip1 = '', string $odZip2 = ''): array
    {
        $base = shop_api_shipping_base_cost($itemTotal);

        $extra = 0;
        $zip = preg_replace('/[^0-9]/', '', $odZip1 . $odZip2);
        if ($zip !== '') {
            // Match Youngcart: compare the full numeric zip and use the first matching row.
            $row = DB::fetch(
                "SELECT sc_id, sc_price FROM " . DB::table('g5_shop_sendcost_table') . "
                 WHERE sc_zip1 <= ? AND sc_zip2 >= ?
                 LIMIT 1",
                [$zip, $zip]
            );
            if (!empty($row['sc_id'])) {
                $extra = (int) $row['sc_price'];
            }
        }

        return ['base' => $base, 'extra' => $extra, 'total' => $base + $extra];
    }
}

if (!function_exists('shop_api_cart_send_cost')) {
    /**
     * Calculate base shipping for cart rows with the same product-level rules
     * as Youngcart get_sendcost(). When $ctIds is null, normal cart rows
     * (ct_direct=0) are considered by default, or direct checkout rows
     * (ct_direct=1) when $direct is true. When $ctIds is provided, only those
     * rows are considered, which is needed for direct checkout links.
     */
    function shop_api_cart_send_cost(string $cartId, ?array $ctIds = null, bool $direct = false): int
    {
        if ($cartId === '') {
            return 0;
        }

        $params = [$cartId];
        $filterSql = ' AND ct_direct = ' . ($direct ? '1' : '0');
        if ($ctIds !== null) {
            $ctIds = array_values(array_filter(array_map('intval', $ctIds), static fn($id) => $id > 0));
            if (empty($ctIds)) {
                return 0;
            }
            $filterSql = ' AND ct_id IN (' . implode(',', array_fill(0, count($ctIds), '?')) . ')';
            $params = array_merge($params, $ctIds);
        }

        $rows = DB::fetchAll(
            "SELECT it_id,
                    SUM(IF(io_type = 1, (io_price * ct_qty), ((ct_price + io_price) * ct_qty))) AS price,
                    SUM(ct_qty) AS qty
             FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ?
               AND ct_send_cost = 0
               {$filterSql}
               AND " . shop_api_cart_active_status_sql() . "
             GROUP BY it_id",
            array_merge($params, shop_api_cart_active_statuses())
        );

        $totalSendCost = 0;
        $defaultRuleTotal = 0;
        $defaultRuleCount = 0;
        foreach ($rows as $row) {
            $price = (int) ($row['price'] ?? 0);
            $qty = (int) ($row['qty'] ?? 0);
            $sendCost = function_exists('get_item_sendcost')
                ? (int) get_item_sendcost((string) $row['it_id'], $price, $qty, $cartId)
                : shop_api_cart_item_send_cost((string) $row['it_id'], $price, $qty, $cartId);

            if ($sendCost > 0) {
                $totalSendCost += $sendCost;
            } elseif ($sendCost < 0) {
                $defaultRuleTotal += $price;
                $defaultRuleCount++;
            }
        }

        if ($defaultRuleCount > 0) {
            $totalSendCost += shop_api_shipping_base_cost($defaultRuleTotal);
        }

        return max(0, (int) $totalSendCost);
    }
}

if (!function_exists('shop_api_cart_item_send_cost')) {
    function shop_api_cart_item_send_cost(string $itId, int $price, int $qty, string $cartId): int
    {
        if ($itId === '' || $cartId === '') {
            return 0;
        }

        $row = DB::fetch(
            "SELECT it_id, it_sc_type, it_sc_price, it_sc_minimum, it_sc_qty
             FROM " . DB::table('g5_shop_cart_table') . "
             WHERE it_id = ?
               AND od_id = ?
             ORDER BY ct_id
             LIMIT 1",
            [$itId, $cartId]
        );
        if (!$row || empty($row['it_id'])) {
            return 0;
        }

        $type = (int) ($row['it_sc_type'] ?? 0);
        if ($type === 1) {
            return 0;
        }
        if ($type === 2) {
            return $price >= (int) ($row['it_sc_minimum'] ?? 0) ? 0 : (int) ($row['it_sc_price'] ?? 0);
        }
        if ($type === 3) {
            return (int) ($row['it_sc_price'] ?? 0);
        }
        if ($type > 3) {
            $scQty = max(1, (int) ($row['it_sc_qty'] ?? 1));
            return (int) ($row['it_sc_price'] ?? 0) * (int) ceil(max(0, $qty) / $scQty);
        }

        return -1;
    }
}

if (!function_exists('shop_api_send_coupon_evaluate')) {
    /**
     * 배송비 쿠폰 (cp_method=3) 평가. 일반 주문 쿠폰과 분리.
     *   - cp_method=3 만 허용. mb_id / 유효기간 / 중복사용 검증은 동일.
     *   - 정액(cp_type=0) / 정률(cp_type=1), 최대 할인, 절사 단위를 YoungCart 방식으로 계산.
     *   - 할인액은 send_cost_total 한도까지만.
     */
    function shop_api_send_coupon_evaluate(array $coupon, int $sendCost, string $mbId, ?int $orderAmountForMinimum = null): array
    {
        if ((int) $coupon['cp_method'] !== 3) {
            return ['ok' => false, 'reason' => '배송비 쿠폰이 아닙니다.'];
        }
        if (!shop_api_coupon_owner_matches($coupon, $mbId)) {
            return ['ok' => false, 'reason' => '발급 대상이 아닙니다.'];
        }
        $today = date('Y-m-d');
        if (!empty($coupon['cp_start']) && $coupon['cp_start'] !== '0000-00-00' && $today < $coupon['cp_start']) {
            return ['ok' => false, 'reason' => '사용 가능 기간 전입니다.'];
        }
        if (!empty($coupon['cp_end']) && $coupon['cp_end'] !== '0000-00-00' && $today > $coupon['cp_end']) {
            return ['ok' => false, 'reason' => '만료된 쿠폰입니다.'];
        }
        $minimumBase = $orderAmountForMinimum === null ? $sendCost : max(0, $orderAmountForMinimum);
        if ((int) $coupon['cp_minimum'] > 0 && $minimumBase < (int) $coupon['cp_minimum']) {
            return ['ok' => false, 'reason' => '최소 주문금액 미달.'];
        }
        $used = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
             WHERE cp_id = ? AND mb_id = ?",
            [$coupon['cp_id'], $mbId]
        );
        if ($used > 0) {
            return ['ok' => false, 'reason' => '이미 사용한 쿠폰입니다.'];
        }
        $cpType = (int) ($coupon['cp_type'] ?? 0);
        $cpPrice = (int) ($coupon['cp_price'] ?? 0);
        $cpMax = (int) ($coupon['cp_maximum'] ?? 0);
        $cpTrunc = (int) ($coupon['cp_trunc'] ?? 0);

        if ($cpType === 1) {
            $discount = (int) floor($sendCost * $cpPrice / 100);
            if ($cpTrunc > 0) {
                $discount = (int) (floor($discount / $cpTrunc) * $cpTrunc);
            }
        } else {
            $discount = $cpPrice;
        }
        if ($cpMax > 0 && $discount > $cpMax) {
            $discount = $cpMax;
        }
        if ($discount > $sendCost) $discount = $sendCost;
        if ($discount <= 0) return ['ok' => false, 'reason' => '적용 가능한 할인액이 0원입니다.'];
        return ['ok' => true, 'discount' => $discount];
    }
}

if (!function_exists('shop_api_point_clamp')) {
    /**
     * 회원이 요청한 사용 포인트가 보유 잔액과 주문 합계를 모두 초과하지 않는 정수로 조정.
     * 음수/문자열/잔액 초과는 0 으로 reduce. 사용 포인트는 상품 합계만 차감 가능 (배송비 제외).
     */
    function shop_api_point_clamp($requested, string $mbId, int $maxFromOrder): int
    {
        global $config;

        $req = (int) $requested;
        if ($req <= 0) return 0;
        if (empty($config['cf_use_point'])) return 0;

        $cfg = shop_api_shop_default_config();
        $balance = function_exists('get_point_sum') ? (int) get_point_sum($mbId) : 0;
        if ($balance < (int) ($cfg['de_settle_min_point'] ?? 0)) {
            return 0;
        }

        $allowed = min(
            (int) ($cfg['de_settle_max_point'] ?? 0),
            $balance,
            max(0, $maxFromOrder)
        );
        $unit = (int) ($cfg['de_settle_point_unit'] ?? 0);
        if ($unit > 0) {
            $allowed = (int) (floor($allowed / $unit) * $unit);
        }

        return max(0, min($req, $allowed));
    }
}

