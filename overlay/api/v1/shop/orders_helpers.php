<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_orders_legacy_input')) {
    function shop_orders_legacy_input(): array
    {
        $input = $_POST;
        if (empty($input)) {
            $json = json_decode(file_get_contents('php://input'), true);
            if (is_array($json)) {
                $input = $json;
            } else {
                $raw = file_get_contents('php://input');
                if (is_string($raw) && $raw !== '') {
                    $parsed = [];
                    parse_str($raw, $parsed);
                    if (is_array($parsed)) {
                        $input = $parsed;
                    }
                }
            }
        }

        foreach ($_GET as $key => $value) {
            if (!array_key_exists($key, $input)) {
                $input[$key] = $value;
            }
        }

        return is_array($input) ? $input : [];
    }
}

if (!function_exists('shop_orders_legacy_order_id')) {
    function shop_orders_legacy_order_id($value): string
    {
        return preg_replace('/[^0-9]/', '', (string) $value);
    }
}

if (!function_exists('shop_orders_client_uid')) {
    function shop_orders_client_uid($value): string
    {
        $uid = trim((string) $value);
        if ($uid === '') {
            return '';
        }

        $uid = preg_replace('/[^A-Za-z0-9._:-]/', '', $uid);
        return substr((string) $uid, 0, 80);
    }
}

if (!function_exists('shop_orders_client_uid_marker')) {
    function shop_orders_client_uid_marker(string $clientUid): string
    {
        return $clientUid === '' ? '' : '[client_uid:' . hash('sha256', $clientUid) . ']';
    }
}

if (!function_exists('shop_orders_create_lock_name')) {
    function shop_orders_create_lock_name(string $cartId, string $clientUid, string $mbId = ''): string
    {
        // 회원은 회원 단위로 — 장바구니를 여러 개 만들어 같은 쿠폰 · 포인트를 동시에 쓰지 못하게(결제 확정과 같은 잠금).
        if ($mbId !== '' && function_exists('shop_api_member_order_lock_name')) {
            return shop_api_member_order_lock_name($mbId);
        }
        // 장바구니로 잠근다 — 재시도 키(client_uid)는 클라이언트가 고르므로, 키마다 잠그면 같은 장바구니를 다른 키로
        // 동시에 주문할 수 있다. 같은 키의 재시도는 같은 장바구니로 오므로 이것으로 함께 줄을 선다.
        $source = $cartId !== '' ? 'cart:' . $cartId : 'uid:' . $clientUid;
        return 'g5_order_create_' . md5($source);
    }
}

if (!function_exists('shop_orders_acquire_create_lock')) {
    function shop_orders_acquire_create_lock(string $cartId, string $clientUid, int $timeout = 10, string $mbId = ''): string
    {
        $lockName = shop_orders_create_lock_name($cartId, $clientUid, $mbId);
        $row = DB::fetch('SELECT GET_LOCK(?, ?) AS got_lock', [$lockName, $timeout]);
        if ((int) ($row['got_lock'] ?? 0) !== 1) {
            throw new RuntimeException('Order submission is already in progress. Please try again shortly.');
        }
        return $lockName;
    }
}

if (!function_exists('shop_orders_release_create_lock')) {
    function shop_orders_release_create_lock(string $lockName): void
    {
        if ($lockName === '') {
            return;
        }
        try {
            DB::fetch('SELECT RELEASE_LOCK(?) AS released', [$lockName]);
        } catch (Throwable $e) {
            // Named locks are connection-scoped; connection close releases it if this fails.
        }
    }
}

if (!function_exists('shop_orders_find_by_client_uid')) {
    function shop_orders_find_by_client_uid(string $clientUid, string $mbId): ?array
    {
        $marker = shop_orders_client_uid_marker($clientUid);
        if ($marker === '') {
            return null;
        }

        // 요청한 사람의 주문 안에서만 찾는다 — 비회원은 비회원 주문(mb_id = '')만. 범위를 열어 두면
        // 재시도 키(client_uid)만 아는 비회원이 회원 주문 행을 받아 간다.
        $sql = "SELECT * FROM " . DB::table('g5_shop_order_table') . "
                WHERE od_shop_memo LIKE ? AND mb_id = ?";
        $params = ['%' . $marker . '%', $mbId];
        $sql .= " ORDER BY od_id DESC LIMIT 1";

        return DB::fetch($sql, $params) ?: null;
    }
}

if (!function_exists('shop_orders_client_row')) {
    /**
     * 주문 생성 응답에 실을 주문 행 — 비밀번호 해시(od_pwd, 회원 주문은 회원 로그인 비밀번호 해시),
     * 접속 IP, 관리자 메모 · 변경 이력(재시도 키 표식 포함)은 빼고 보낸다.
     */
    function shop_orders_client_row(array $order): array
    {
        unset($order['od_pwd'], $order['od_ip'], $order['od_shop_memo'], $order['od_mod_history']);
        return $order;
    }
}

if (!function_exists('shop_orders_payment_config')) {
    function shop_orders_payment_config(): array
    {
        $shopConfig = DB::fetch("SELECT * FROM " . DB::table('g5_shop_default_table') . " LIMIT 1") ?: [];
        $siteConfig = DB::fetch("SELECT * FROM " . DB::table('config_table') . " LIMIT 1") ?: [];
        return array_merge($shopConfig, $siteConfig);
    }
}

if (!function_exists('shop_orders_customer_cancel_state')) {
    function shop_orders_customer_cancel_state(array $order, array $cartRows, bool $isMemberOrder): array
    {
        $orderStatus = (string) ($order['od_status'] ?? '');
        $cancelPrice = (int) ($order['od_cancel_price'] ?? 0);

        if (!$isMemberOrder) {
            return [
                'can_cancel' => false,
                'cancel_block_reason' => '회원 주문만 직접 취소할 수 있습니다.',
            ];
        }

        if ($cancelPrice > 0) {
            return [
                'can_cancel' => false,
                'cancel_block_reason' => '이미 취소, 반품 또는 품절 처리된 내역이 있습니다.',
            ];
        }

        // Next.js PG prepare 단계의 임시 주문. 원본 YoungCart에는 거의 보이지 않지만
        // prepare 실패/중단 시 사용자가 장바구니로 복구할 수 있어야 한다.
        if ($orderStatus === '준비') {
            return [
                'can_cancel' => true,
                'cancel_block_reason' => '',
            ];
        }

        if ($orderStatus !== '주문') {
            return [
                'can_cancel' => false,
                'cancel_block_reason' => '현재 주문 상태에서는 직접 취소할 수 없습니다.',
            ];
        }

        $totalCount = count($cartRows);
        $orderCount = 0;
        foreach ($cartRows as $row) {
            if ((string) ($row['ct_status'] ?? '') === '주문') {
                $orderCount++;
            }
        }

        if ($totalCount <= 0 || $totalCount !== $orderCount) {
            return [
                'can_cancel' => false,
                'cancel_block_reason' => '주문 상품의 상태가 모두 주문인 경우에만 직접 취소할 수 있습니다.',
            ];
        }

        return [
            'can_cancel' => true,
            'cancel_block_reason' => '',
        ];
    }
}

if (!function_exists('shop_orders_int')) {
    function shop_orders_int(array $row, string $key): int
    {
        return (int) ($row[$key] ?? 0);
    }
}

if (!function_exists('shop_orders_total_price')) {
    function shop_orders_total_price(array $order): int
    {
        $total = shop_orders_int($order, 'od_cart_price')
            + shop_orders_int($order, 'od_send_cost')
            + shop_orders_int($order, 'od_send_cost2')
            - shop_orders_int($order, 'od_cart_coupon')
            - shop_orders_int($order, 'od_coupon')
            - shop_orders_int($order, 'od_send_coupon')
            - shop_orders_int($order, 'od_cancel_price');

        return max(0, $total);
    }
}

if (!function_exists('shop_orders_list_price')) {
    function shop_orders_list_price(array $order): int
    {
        return max(
            0,
            shop_orders_int($order, 'od_cart_price')
            + shop_orders_int($order, 'od_send_cost')
            + shop_orders_int($order, 'od_send_cost2')
        );
    }
}

if (!function_exists('shop_orders_receipt_total')) {
    function shop_orders_receipt_total(array $order): int
    {
        return shop_orders_int($order, 'od_receipt_price')
            + shop_orders_int($order, 'od_receipt_point');
    }
}

if (!function_exists('shop_orders_misu_price')) {
    function shop_orders_misu_price(array $order): int
    {
        return max(0, shop_orders_total_price($order) - shop_orders_receipt_total($order));
    }
}

if (!function_exists('shop_orders_is_fully_paid')) {
    function shop_orders_is_fully_paid(array $order): bool
    {
        return shop_orders_misu_price($order) === 0
            && shop_orders_int($order, 'od_cart_price') > shop_orders_int($order, 'od_cancel_price');
    }
}

if (!function_exists('shop_orders_url_with_query')) {
    function shop_orders_url_with_query(string $base, array $params): string
    {
        return $base . (strpos($base, '?') === false ? '?' : '&') . http_build_query($params);
    }
}

if (!function_exists('shop_orders_maybe_unserialize')) {
    function shop_orders_maybe_unserialize($value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = @unserialize($value, ['allowed_classes' => false]);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('shop_orders_payment_app_info')) {
    function shop_orders_payment_app_info(array $order): array
    {
        $settleCase = (string) ($order['od_settle_case'] ?? '');

        if ($settleCase === '신용카드' || $settleCase === 'KAKAOPAY' || (function_exists('is_inicis_order_pay') && is_inicis_order_pay($settleCase))) {
            return [
                'label' => '승인번호',
                'value' => trim((string) ($order['od_app_no'] ?? '')),
                'display_bank' => false,
            ];
        }

        if ($settleCase === '간편결제') {
            return [
                'label' => '승인번호',
                'value' => trim((string) ($order['od_app_no'] ?? '')),
                'display_bank' => false,
            ];
        }

        if ($settleCase === '휴대폰') {
            return [
                'label' => '휴대폰번호',
                'value' => trim((string) ($order['od_bank_account'] ?? '')),
                'display_bank' => false,
            ];
        }

        if ($settleCase === '가상계좌' || $settleCase === '계좌이체') {
            return [
                'label' => '거래번호',
                'value' => trim((string) ($order['od_tno'] ?? '')),
                'display_bank' => true,
            ];
        }

        return [
            'label' => '',
            'value' => '',
            'display_bank' => true,
        ];
    }
}

if (!function_exists('shop_orders_payment_receipt_url')) {
    function shop_orders_payment_receipt_url(array $order): string
    {
        $pg = strtolower(trim((string) ($order['od_pg'] ?? '')));
        $settleCase = (string) ($order['od_settle_case'] ?? '');
        $tno = trim((string) ($order['od_tno'] ?? ''));
        $receiptPrice = shop_orders_int($order, 'od_receipt_price');

        if ($tno === '' || $receiptPrice <= 0) {
            return '';
        }

        if ($pg === 'lg') {
            $cfg = shop_orders_payment_config();
            return shop_api_lg_payment_receipt_url(
                shop_api_lg_mid($cfg),
                $tno,
                (string) ($cfg['cf_lg_mert_key'] ?? '')
            );
        }

        if ($settleCase === '휴대폰') {
            if ($pg === 'toss') {
                return shop_orders_url_with_query('https://dashboard.tosspayments.com/receipt/phone', [
                    'transactionId' => $tno,
                    'ref' => 'PX',
                ]);
            }
            if ($pg === 'inicis') {
                return shop_orders_url_with_query('https://iniweb.inicis.com/DefaultWebApp/mall/cr/cm/mCmReceipt_head.jsp', [
                    'noTid' => $tno,
                    'noMethod' => '1',
                ]);
            }
            if ($pg === 'nicepay') {
                return shop_orders_url_with_query('https://npg.nicepay.co.kr/issue/IssueLoader.do', [
                    'type' => '0',
                    'TID' => $tno,
                    'noMethod' => '1',
                ]);
            }
            if (defined('G5_BILL_RECEIPT_URL')) {
                return G5_BILL_RECEIPT_URL . 'mcash_bill&tno=' . rawurlencode($tno)
                    . '&order_no=' . rawurlencode((string) ($order['od_id'] ?? ''))
                    . '&trade_mony=' . rawurlencode((string) $receiptPrice);
            }
            return '';
        }

        $isCardLike = $settleCase === '신용카드'
            || $settleCase === '간편결제'
            || $settleCase === 'KAKAOPAY'
            || (function_exists('is_inicis_order_pay') && is_inicis_order_pay($settleCase))
            || (($settleCase === '계좌이체' || $settleCase === '가상계좌') && shop_orders_misu_price($order) === 0);

        if (!$isCardLike) {
            return '';
        }

        if ($pg === 'toss') {
            return shop_orders_url_with_query('https://dashboard.tosspayments.com/receipt/redirection', [
                'transactionId' => $tno,
                'ref' => 'PX',
            ]);
        }
        if ($pg === 'inicis' || $settleCase === 'KAKAOPAY') {
            return shop_orders_url_with_query('https://iniweb.inicis.com/DefaultWebApp/mall/cr/cm/mCmReceipt_head.jsp', [
                'noTid' => $tno,
                'noMethod' => '1',
            ]);
        }
        if ($pg === 'nicepay') {
            return shop_orders_url_with_query('https://npg.nicepay.co.kr/issue/IssueLoader.do', [
                'type' => '0',
                'TID' => $tno,
                'noMethod' => '1',
            ]);
        }
        if (defined('G5_BILL_RECEIPT_URL')) {
            return G5_BILL_RECEIPT_URL . 'card_bill&tno=' . rawurlencode($tno)
                . '&order_no=' . rawurlencode((string) ($order['od_id'] ?? ''))
                . '&trade_mony=' . rawurlencode((string) $receiptPrice);
        }

        return '';
    }
}

if (!function_exists('shop_orders_cash_receipt_url')) {
    function shop_orders_cash_receipt_url(array $order): string
    {
        $settleCase = (string) ($order['od_settle_case'] ?? '');
        $cashSettleCases = ['무통장', '계좌이체', '가상계좌'];
        if (
            shop_orders_int($order, 'od_cash') <= 0
            || trim((string) ($order['od_cash_no'] ?? '')) === ''
            || trim((string) ($order['od_cash_info'] ?? '')) === ''
            || shop_orders_int($order, 'od_receipt_price') <= 0
            || !in_array($settleCase, $cashSettleCases, true)
        ) {
            return '';
        }

        $pg = strtolower(trim((string) ($order['od_pg'] ?? '')));
        $tno = trim((string) ($order['od_tno'] ?? ''));
        $cash = shop_orders_maybe_unserialize($order['od_cash_info'] ?? '');
        $receiptUrl = trim((string) ($cash['receiptUrl'] ?? ''));
        if ($receiptUrl !== '' && preg_match('#^https?://#i', $receiptUrl)) {
            return $receiptUrl;
        }

        if ($pg === 'lg') {
            $cfg = shop_orders_payment_config();
            return shop_api_lg_cash_receipt_url(
                shop_api_lg_mid($cfg),
                (string) ($order['od_id'] ?? ''),
                (string) ($order['od_casseqno'] ?? ''),
                shop_api_lg_cash_trade_type($settleCase),
                shop_api_lg_platform($cfg),
                (string) ($cfg['cf_lg_mert_key'] ?? '')
            );
        }

        if ($pg === 'inicis') {
            $cashTid = trim((string) ($cash['TID'] ?? ''));
            if ($cashTid !== '') {
                return shop_orders_url_with_query('https://iniweb.inicis.com/DefaultWebApp/mall/cr/cm/Cash_mCmReceipt.jsp', [
                    'noTid' => $cashTid,
                    'clpaymethod' => '22',
                ]);
            }
        }

        if ($pg === 'nicepay' && $tno !== '') {
            return shop_orders_url_with_query('https://npg.nicepay.co.kr/issue/IssueLoader.do', [
                'type' => '1',
                'TID' => $tno,
                'noMethod' => '1',
            ]);
        }

        if ($pg === 'toss') {
            $cfg = shop_orders_payment_config();
            $mid = trim((string) ($cfg['cf_lg_mid'] ?? $cfg['de_toss_mid'] ?? $cfg['de_pg_mid'] ?? ''));
            if ($mid !== '') {
                return 'https://dashboard.tosspayments.com/receipt/mids/si_'
                    . rawurlencode($mid)
                    . '/orders/'
                    . rawurlencode((string) ($order['od_id'] ?? ''))
                    . '/cash-receipt?ref=dashboard';
            }
        }

        if (defined('G5_CASH_RECEIPT_URL')) {
            $cfg = shop_orders_payment_config();
            $kcpMid = trim((string) ($cfg['de_kcp_mid'] ?? ''));
            $receiptNo = trim((string) ($cash['receipt_no'] ?? ''));
            if ($kcpMid !== '' && $receiptNo !== '') {
                return G5_CASH_RECEIPT_URL . rawurlencode($kcpMid)
                    . '&orderid=' . rawurlencode((string) ($order['od_id'] ?? ''))
                    . '&bill_yn=Y&authno=' . rawurlencode($receiptNo);
            }
        }

        return '';
    }
}

if (!function_exists('shop_orders_has_issued_cash_receipt')) {
    function shop_orders_has_issued_cash_receipt(array $order): bool
    {
        if (function_exists('is_order_cashreceipt')) {
            return (bool) is_order_cashreceipt($order);
        }

        $settleCase = (string) ($order['od_settle_case'] ?? '');
        return shop_orders_int($order, 'od_cash') > 0
            && trim((string) ($order['od_cash_no'] ?? '')) !== ''
            && trim((string) ($order['od_cash_info'] ?? '')) !== ''
            && shop_orders_int($order, 'od_receipt_price') > 0
            && in_array($settleCase, ['무통장', '계좌이체', '가상계좌'], true);
    }
}

if (!function_exists('shop_orders_taxsave_url')) {
    function shop_orders_taxsave_url(array $order): string
    {
        if (!defined('G5_SHOP_URL') || !function_exists('shop_is_taxsave')) {
            return '';
        }
        if (shop_orders_has_issued_cash_receipt($order)) {
            return '';
        }
        if (shop_orders_misu_price($order) !== 0 || !shop_is_taxsave($order)) {
            return '';
        }

        if (function_exists('shop_api_cash_receipt_issue_url')) {
            return shop_api_cash_receipt_issue_url('order', $order);
        }

        return G5_SHOP_URL . '/taxsave.php?od_id=' . rawurlencode((string) ($order['od_id'] ?? ''));
    }
}

if (!function_exists('shop_orders_delivery_inquiry_url')) {
    function shop_orders_delivery_inquiry_url(array $order): string
    {
        $company = trim((string) ($order['od_delivery_company'] ?? ''));
        $invoice = trim((string) ($order['od_invoice'] ?? ''));
        if ($company === '' || $company === '0' || $invoice === '') {
            return '';
        }

        if (function_exists('get_delivery_inquiry')) {
            $html = (string) get_delivery_inquiry($company, $invoice, 'dvr_link');
            if (preg_match('/href=["\']([^"\']+)/i', $html, $matches)) {
                return html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        if (defined('G5_DELIVERY_COMPANY')) {
            $companies = explode(')', str_replace('(', '', G5_DELIVERY_COMPANY));
            foreach ($companies as $row) {
                if (strpos($row, $company) === false) {
                    continue;
                }
                $parts = explode('^', $row);
                $url = trim((string) ($parts[1] ?? ''));
                if ($url !== '') {
                    return $url . rawurlencode($invoice);
                }
            }
        }

        return 'https://tracker.delivery/#/'
            . rawurlencode($company)
            . '/'
            . rawurlencode($invoice);
    }
}

if (!function_exists('shop_orders_list_filter')) {
    /**
     * SC-08 주문 목록 필터 — status(앱 탭 키 또는 od_status 원문)와 q(≤50자)를 WHERE 조각으로.
     * 지원하지 않는 status 는 null(호출자가 422). 반환: ['sql' => ' AND …', 'params' => [...]].
     * 결제 초안('준비' + PG 있음 + 승인번호 없음)은 입금 대기/준비 탭에서 제외한다.
     * 조각의 컬럼은 주문 테이블 기준(바깥 쿼리는 별칭 없이 g5_shop_order_table).
     */
    function shop_orders_list_filter(string $status, string $q): ?array
    {
        // API prepare 초안만 — [cart_id:] 표식(SC-02)으로 가린다. 레거시 '준비'(상품 준비 중)는 결제된 주문이다(SC-15 와 같은 기준).
        $draft = "(od_status = '준비' AND od_tno = '' AND od_shop_memo LIKE '%[cart_id:%')";
        $map = [
            'paying' => "(od_status = '주문' AND od_misu > 0)",
            'preparing' => "(od_status = '입금' OR (od_status = '준비' AND NOT {$draft}))",
            'shipping' => "od_status = '배송'",
            'done' => "od_status = '완료'",
            'cancel' => "(od_status IN ('취소', '반품', '교환') OR od_status LIKE '%요청')",
            'pending_payment' => $draft,
        ];
        $raw = ['주문', '입금', '준비', '배송', '완료', '취소'];

        $sql = '';
        $params = [];
        if ($status !== '') {
            if (isset($map[$status])) {
                $sql .= ' AND ' . $map[$status];
            } elseif (in_array($status, $raw, true)) {
                $sql .= ' AND od_status = ?';
                $params[] = $status;
            } else {
                return null;
            }
        }

        $q = function_exists('mb_substr') ? mb_substr(trim($q), 0, 50, 'UTF-8') : substr(trim($q), 0, 50);
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $orderTable = DB::table('g5_shop_order_table');
            $cartTable = DB::table('g5_shop_cart_table');
            $sql .= " AND (od_id LIKE ? OR od_name LIKE ? OR od_b_name LIKE ? OR od_hp LIKE ? OR od_invoice LIKE ?"
                . " OR EXISTS (SELECT 1 FROM {$cartTable} qc WHERE qc.od_id = {$orderTable}.od_id AND qc.it_name LIKE ?))";
            array_push($params, $like, $like, $like, $like, $like, $like);
        }

        return ['sql' => $sql, 'params' => $params];
    }
}

if (!function_exists('shop_api_order_bank_account')) {
    /**
     * 무통장 주문의 입금 계좌 — 상점 설정(de_bank_account)의 한 줄과 같을 때만 그 줄을 돌려준다. 빈 값은 ''(전액 포인트 등),
     * 목록에 없는 값은 null. 관리자 주문서가 이 값을 그대로 출력하므로 클라이언트가 고른 문자열을 그대로 저장하지 않는다.
     * 줄 나누기 · 정리는 앱이 받는 목록(payment_helpers.php pg_bank_accounts)과 같다.
     */
    function shop_api_order_bank_account($value): ?string
    {
        $value = is_scalar($value) ? trim((string) $value) : '';
        if ($value === '') {
            return '';
        }
        $row = DB::fetch("SELECT de_bank_account FROM " . DB::table('g5_shop_default_table') . " LIMIT 1");
        foreach (preg_split('/\r\n|\r|\n/', (string) ($row['de_bank_account'] ?? '')) as $line) {
            $account = trim(html_entity_decode(strip_tags((string) $line), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($account !== '' && $account === $value) {
                return $account;
            }
        }
        return null;
    }
}

require_once __DIR__ . '/orders_payment_cancel_helpers.php';
require_once __DIR__ . '/orders_create_undo.php';
