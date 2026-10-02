<?php
/**
 * Gnuboard5 REST API - Personal Pay.
 *
 *   GET  /v1/shop/personalpay                 - Unpaid personal pay list.
 *   GET  /v1/shop/personalpay/{pp_id}         - Personal pay detail.
 *   POST /v1/shop/personalpay/{pp_id}/start   - Validate and prepare legacy payment handoff.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

$pp_id = isset($shopSegments[0]) ? trim((string) $shopSegments[0]) : '';
$pp_action = isset($shopSegments[1]) ? trim((string) $shopSegments[1]) : '';
$member = Auth::requireAuth();
$isSuperAdmin = Auth::adminRole($member) === 'super';

if (!function_exists('shop_personalpay_int')) {
    function shop_personalpay_int(array $row, string $key): int
    {
        return (int) ($row[$key] ?? 0);
    }
}

if (!function_exists('shop_personalpay_can_access')) {
    function shop_personalpay_can_access(array $row, array $member, bool $isSuperAdmin): bool
    {
        if ($isSuperAdmin) {
            return true;
        }

        $memberId = (string) ($member['mb_id'] ?? '');
        if ($memberId === '') {
            return false;
        }

        $ownerId = (string) ($row['mb_id'] ?? '');
        $orderOwnerId = (string) ($row['order_mb_id'] ?? '');

        return ($ownerId !== '' && $ownerId === $memberId)
            || ($orderOwnerId !== '' && $orderOwnerId === $memberId);
    }
}

if (!function_exists('shop_personalpay_fetch')) {
    function shop_personalpay_fetch($ppId): ?array
    {
        $payTable = DB::table('g5_shop_personalpay_table');
        $orderTable = DB::table('g5_shop_order_table');

        return DB::fetch(
            "SELECT p.*, o.mb_id AS order_mb_id
               FROM {$payTable} p
               LEFT JOIN {$orderTable} o ON o.od_id = p.od_id
              WHERE p.pp_id = ? LIMIT 1",
            [$ppId]
        );
    }
}

if (!function_exists('shop_personalpay_require_access')) {
    function shop_personalpay_require_access(?array $row, array $member, bool $isSuperAdmin): array
    {
        if (!$row) {
            Response::error('개인결제 정보를 찾을 수 없습니다.', 404);
        }

        if (!shop_personalpay_can_access($row, $member, $isSuperAdmin)) {
            Response::error('Forbidden.', 403);
        }

        return $row;
    }
}

if (!function_exists('shop_personalpay_payment_config')) {
    function shop_personalpay_payment_config(): array
    {
        $shopConfig = DB::fetch("SELECT * FROM " . DB::table('g5_shop_default_table') . " LIMIT 1") ?: [];
        $siteConfig = DB::fetch("SELECT * FROM " . DB::table('config_table') . " LIMIT 1") ?: [];
        return array_merge($shopConfig, $siteConfig);
    }
}

if (!function_exists('shop_personalpay_url_with_query')) {
    function shop_personalpay_url_with_query(string $base, array $params): string
    {
        return $base . (strpos($base, '?') === false ? '?' : '&') . http_build_query($params);
    }
}

if (!function_exists('shop_personalpay_payment_form_params')) {
    function shop_personalpay_payment_form_params($ppId, bool $passthrough = false): array
    {
        $params = [
            'pp_id' => (string) $ppId,
        ];

        if ($passthrough) {
            $params['g5_nextjs25_passthrough'] = '1';
        }

        return $params;
    }
}

if (!function_exists('shop_personalpay_payment_form_url')) {
    function shop_personalpay_payment_form_url($ppId, bool $passthrough = false): string
    {
        $shopUrl = defined('G5_SHOP_URL')
            ? rtrim((string) G5_SHOP_URL, '/')
            : rtrim((string) G5_URL, '/') . '/shop';

        return shop_personalpay_url_with_query(
            $shopUrl . '/personalpayform.php',
            shop_personalpay_payment_form_params($ppId, $passthrough)
        );
    }
}

if (!function_exists('shop_personalpay_payment_form_path')) {
    function shop_personalpay_payment_form_path($ppId, bool $passthrough = false): string
    {
        return shop_personalpay_url_with_query(
            '/shop/personalpayform.php',
            shop_personalpay_payment_form_params($ppId, $passthrough)
        );
    }
}

if (!function_exists('shop_personalpay_maybe_unserialize')) {
    function shop_personalpay_maybe_unserialize($value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = @unserialize($value, ['allowed_classes' => false]);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('shop_personalpay_is_valid_receipt_time')) {
    function shop_personalpay_is_valid_receipt_time($value): bool
    {
        $time = trim((string) $value);
        return $time !== '' && $time !== '0000-00-00 00:00:00' && $time !== '1000-01-01 00:00:00';
    }
}

if (!function_exists('shop_personalpay_misu_price')) {
    function shop_personalpay_misu_price(array $row): int
    {
        return max(0, shop_personalpay_int($row, 'pp_price') - shop_personalpay_int($row, 'pp_receipt_price'));
    }
}

if (!function_exists('shop_personalpay_is_paid')) {
    function shop_personalpay_is_paid(array $row): bool
    {
        return shop_personalpay_int($row, 'pp_receipt_price') > 0
            && shop_personalpay_is_valid_receipt_time($row['pp_receipt_time'] ?? '');
    }
}

if (!function_exists('shop_personalpay_has_transaction')) {
    function shop_personalpay_has_transaction(array $row): bool
    {
        return trim((string) ($row['pp_tno'] ?? '')) !== '';
    }
}

if (!function_exists('shop_personalpay_payment_state')) {
    function shop_personalpay_payment_state(array $row): string
    {
        if ((int) ($row['pp_use'] ?? 0) !== 1) {
            return 'disabled';
        }

        if (shop_personalpay_int($row, 'pp_price') <= 0) {
            return 'invalid';
        }

        if (shop_personalpay_is_paid($row)) {
            return 'paid';
        }

        if (shop_personalpay_has_transaction($row)) {
            return 'processing';
        }

        return 'ready';
    }
}

if (!function_exists('shop_personalpay_payment_state_label')) {
    function shop_personalpay_payment_state_label(string $state): string
    {
        switch ($state) {
            case 'ready':
                return '결제 대기';
            case 'processing':
                return '결제 처리 중';
            case 'paid':
                return '결제 완료';
            case 'disabled':
                return '비활성화';
            case 'invalid':
                return '결제 불가';
            default:
                return '확인 필요';
        }
    }
}

if (!function_exists('shop_personalpay_payment_block_reason')) {
    function shop_personalpay_payment_block_reason(array $row): string
    {
        switch (shop_personalpay_payment_state($row)) {
            case 'disabled':
                return '비활성화된 개인결제입니다.';
            case 'invalid':
                return '결제 금액이 올바르지 않습니다.';
            case 'processing':
            case 'paid':
                return '이미 결제하신 개인결제 내역입니다.';
        }

        return '';
    }
}

if (!function_exists('shop_personalpay_prepare_legacy_session')) {
    function shop_personalpay_prepare_legacy_session(array $row): void
    {
        if (!function_exists('set_session')) {
            return;
        }

        set_session('ss_personalpay_id', (string) ($row['pp_id'] ?? ''));
        set_session(
            'ss_personalpay_hash',
            md5((string) ($row['pp_id'] ?? '') . (string) ($row['pp_price'] ?? '') . (string) ($row['pp_time'] ?? ''))
        );
    }
}

if (!function_exists('shop_personalpay_payment_start_payload')) {
    function shop_personalpay_payment_start_payload(array $row): array
    {
        $paymentUrl = shop_personalpay_payment_form_url($row['pp_id'] ?? '', true);
        $paymentPath = shop_personalpay_payment_form_path($row['pp_id'] ?? '', true);

        return [
            'pp_id' => (string) ($row['pp_id'] ?? ''),
            'payment_path' => $paymentPath,
            'payment_url' => $paymentUrl,
            'legacy_payment_url' => $paymentUrl,
            'can_pay' => true,
            'payment_block_reason' => '',
            'payment_state' => 'ready',
            'payment_state_label' => shop_personalpay_payment_state_label('ready'),
        ];
    }
}

if (!function_exists('shop_personalpay_payment_app_info')) {
    function shop_personalpay_payment_app_info(array $row): array
    {
        $settleCase = (string) ($row['pp_settle_case'] ?? '');

        if ($settleCase === '신용카드' || $settleCase === 'KAKAOPAY' || (function_exists('is_inicis_order_pay') && is_inicis_order_pay($settleCase))) {
            return [
                'label' => '승인번호',
                'value' => trim((string) ($row['pp_app_no'] ?? '')),
                'display_bank' => false,
            ];
        }

        if ($settleCase === '간편결제') {
            return [
                'label' => '승인번호',
                'value' => trim((string) ($row['pp_app_no'] ?? '')),
                'display_bank' => false,
            ];
        }

        if ($settleCase === '휴대폰') {
            return [
                'label' => '휴대폰번호',
                'value' => trim((string) ($row['pp_bank_account'] ?? '')),
                'display_bank' => false,
            ];
        }

        if ($settleCase === '가상계좌' || $settleCase === '계좌이체') {
            return [
                'label' => '거래번호',
                'value' => trim((string) ($row['pp_tno'] ?? '')),
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

if (!function_exists('shop_personalpay_receipt_url')) {
    function shop_personalpay_receipt_url(array $row): string
    {
        $pg = strtolower(trim((string) ($row['pp_pg'] ?? '')));
        $settleCase = (string) ($row['pp_settle_case'] ?? '');
        $tno = trim((string) ($row['pp_tno'] ?? ''));
        $receiptPrice = shop_personalpay_int($row, 'pp_receipt_price');

        if ($tno === '' || $receiptPrice <= 0) {
            return '';
        }

        if ($pg === 'lg') {
            $cfg = shop_personalpay_payment_config();
            return shop_api_lg_payment_receipt_url(
                shop_api_lg_mid($cfg),
                $tno,
                (string) ($cfg['cf_lg_mert_key'] ?? '')
            );
        }

        if ($settleCase === '휴대폰') {
            if ($pg === 'toss') {
                return shop_personalpay_url_with_query('https://dashboard.tosspayments.com/receipt/phone', [
                    'transactionId' => $tno,
                    'ref' => 'PX',
                ]);
            }
            if ($pg === 'inicis') {
                return shop_personalpay_url_with_query('https://iniweb.inicis.com/DefaultWebApp/mall/cr/cm/mCmReceipt_head.jsp', [
                    'noTid' => $tno,
                    'noMethod' => '1',
                ]);
            }
            if ($pg === 'nicepay') {
                return shop_personalpay_url_with_query('https://npg.nicepay.co.kr/issue/IssueLoader.do', [
                    'type' => '0',
                    'TID' => $tno,
                    'noMethod' => '1',
                ]);
            }
            if (defined('G5_BILL_RECEIPT_URL')) {
                return G5_BILL_RECEIPT_URL . 'mcash_bill&tno=' . rawurlencode($tno)
                    . '&order_no=' . rawurlencode((string) ($row['pp_id'] ?? ''))
                    . '&trade_mony=' . rawurlencode((string) $receiptPrice);
            }
            return '';
        }

        $isCardLike = $settleCase === '신용카드'
            || $settleCase === '간편결제'
            || $settleCase === 'KAKAOPAY'
            || (function_exists('is_inicis_order_pay') && is_inicis_order_pay($settleCase));

        if (!$isCardLike) {
            return '';
        }

        if ($pg === 'toss') {
            return shop_personalpay_url_with_query('https://dashboard.tosspayments.com/receipt/redirection', [
                'transactionId' => $tno,
                'ref' => 'PX',
            ]);
        }
        if ($pg === 'inicis' || $settleCase === 'KAKAOPAY') {
            return shop_personalpay_url_with_query('https://iniweb.inicis.com/DefaultWebApp/mall/cr/cm/mCmReceipt_head.jsp', [
                'noTid' => $tno,
                'noMethod' => '1',
            ]);
        }
        if ($pg === 'nicepay') {
            return shop_personalpay_url_with_query('https://npg.nicepay.co.kr/issue/IssueLoader.do', [
                'type' => '0',
                'TID' => $tno,
                'noMethod' => '1',
            ]);
        }
        if (defined('G5_BILL_RECEIPT_URL')) {
            return G5_BILL_RECEIPT_URL . 'card_bill&tno=' . rawurlencode($tno)
                . '&order_no=' . rawurlencode((string) ($row['pp_id'] ?? ''))
                . '&trade_mony=' . rawurlencode((string) $receiptPrice);
        }

        return '';
    }
}

if (!function_exists('shop_personalpay_cash_receipt_url')) {
    function shop_personalpay_cash_receipt_url(array $row): string
    {
        $settleCase = (string) ($row['pp_settle_case'] ?? '');
        if (
            shop_personalpay_int($row, 'pp_cash') <= 0
            || trim((string) ($row['pp_cash_no'] ?? '')) === ''
            || trim((string) ($row['pp_cash_info'] ?? '')) === ''
            || shop_personalpay_int($row, 'pp_receipt_price') <= 0
            || !in_array($settleCase, ['계좌이체', '가상계좌'], true)
        ) {
            return '';
        }

        $pg = strtolower(trim((string) ($row['pp_pg'] ?? '')));
        $tno = trim((string) ($row['pp_tno'] ?? ''));
        $cash = shop_personalpay_maybe_unserialize($row['pp_cash_info'] ?? '');
        $receiptUrl = trim((string) ($cash['receiptUrl'] ?? ''));
        if ($receiptUrl !== '' && preg_match('#^https?://#i', $receiptUrl)) {
            return $receiptUrl;
        }

        if ($pg === 'lg') {
            $cfg = shop_personalpay_payment_config();
            return shop_api_lg_cash_receipt_url(
                shop_api_lg_mid($cfg),
                (string) ($row['pp_id'] ?? ''),
                (string) ($row['pp_casseqno'] ?? ''),
                shop_api_lg_cash_trade_type($settleCase),
                shop_api_lg_platform($cfg),
                (string) ($cfg['cf_lg_mert_key'] ?? '')
            );
        }

        if ($pg === 'inicis') {
            $cashTid = trim((string) ($cash['TID'] ?? ''));
            if ($cashTid !== '') {
                return shop_personalpay_url_with_query('https://iniweb.inicis.com/DefaultWebApp/mall/cr/cm/Cash_mCmReceipt.jsp', [
                    'noTid' => $cashTid,
                    'clpaymethod' => '22',
                ]);
            }
        }

        if ($pg === 'nicepay' && $tno !== '') {
            return shop_personalpay_url_with_query('https://npg.nicepay.co.kr/issue/IssueLoader.do', [
                'type' => '1',
                'TID' => $tno,
                'noMethod' => '1',
            ]);
        }

        if ($pg === 'toss') {
            $cfg = shop_personalpay_payment_config();
            $mid = trim((string) ($cfg['cf_lg_mid'] ?? $cfg['de_toss_mid'] ?? $cfg['de_pg_mid'] ?? ''));
            if ($mid !== '') {
                return 'https://dashboard.tosspayments.com/receipt/mids/si_'
                    . rawurlencode($mid)
                    . '/orders/'
                    . rawurlencode((string) ($row['pp_id'] ?? ''))
                    . '/cash-receipt?ref=dashboard';
            }
        }

        if (defined('G5_CASH_RECEIPT_URL')) {
            $cfg = shop_personalpay_payment_config();
            $kcpMid = trim((string) ($cfg['de_kcp_mid'] ?? ''));
            $receiptNo = trim((string) ($cash['receipt_no'] ?? ''));
            if ($kcpMid !== '' && $receiptNo !== '') {
                return G5_CASH_RECEIPT_URL . rawurlencode($kcpMid)
                    . '&orderid=' . rawurlencode((string) ($row['pp_id'] ?? ''))
                    . '&bill_yn=Y&authno=' . rawurlencode($receiptNo);
            }
        }

        return '';
    }
}

if (!function_exists('shop_personalpay_has_linked_order')) {
    function shop_personalpay_has_linked_order(array $row): bool
    {
        $odId = trim((string) ($row['od_id'] ?? ''));
        if ($odId === '' || $odId === '0') {
            return false;
        }

        return DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_order_table') . " WHERE od_id = ?",
            [$odId]
        ) > 0;
    }
}

if (!function_exists('shop_personalpay_cash_receipt_issue_url')) {
    function shop_personalpay_cash_receipt_issue_url(array $row, string $cashReceiptUrl): string
    {
        if (!defined('G5_SHOP_URL') || $cashReceiptUrl !== '') {
            return '';
        }

        $cfg = shop_personalpay_payment_config();
        if (empty($cfg['de_taxsave_use'])) {
            return '';
        }

        if (
            shop_personalpay_has_linked_order($row)
            || shop_personalpay_misu_price($row) !== 0
            || shop_personalpay_int($row, 'pp_receipt_price') <= 0
            || !in_array((string) ($row['pp_settle_case'] ?? ''), ['계좌이체', '가상계좌'], true)
        ) {
            return '';
        }

        if (function_exists('shop_api_cash_receipt_issue_url')) {
            return shop_api_cash_receipt_issue_url('personalpay', $row);
        }

        return G5_SHOP_URL . '/taxsave.php?tx=personalpay&od_id=' . rawurlencode((string) ($row['pp_id'] ?? ''));
    }
}

if (!function_exists('shop_personalpay_payload')) {
    function shop_personalpay_payload(array $row): array
    {
        $alreadyPaid = shop_personalpay_is_paid($row);
        $hasTransaction = shop_personalpay_has_transaction($row);
        $paymentState = shop_personalpay_payment_state($row);
        $receiptTime = (string) ($row['pp_receipt_time'] ?? '');
        $paymentAppInfo = shop_personalpay_payment_app_info($row);
        $receiptUrl = shop_personalpay_receipt_url($row);
        $cashReceiptUrl = shop_personalpay_cash_receipt_url($row);
        $cashReceiptIssueUrl = shop_personalpay_cash_receipt_issue_url($row, $cashReceiptUrl);
        $paymentBlockReason = shop_personalpay_payment_block_reason($row);
        $paymentUrl = shop_personalpay_payment_form_url($row['pp_id'] ?? '');
        $paymentPath = shop_personalpay_payment_form_path($row['pp_id'] ?? '');

        return [
            'pp_id'           => (string) $row['pp_id'],
            'od_id'           => (string) ($row['od_id'] ?? ''),
            'pp_name'         => $row['pp_name'],
            'pp_email'        => $row['pp_email'],
            'pp_hp'           => $row['pp_hp'],
            'pp_content'      => $row['pp_content'],
            'pp_price'        => shop_personalpay_int($row, 'pp_price'),
            'pp_pg'           => $row['pp_pg'],
            'pp_tno'          => $row['pp_tno'] ?? '',
            'pp_app_no'       => $row['pp_app_no'] ?? '',
            'pp_casseqno'     => $row['pp_casseqno'] ?? '',
            'pp_settle_case'  => $row['pp_settle_case'],
            'pp_bank_account' => $row['pp_bank_account'],
            'pp_deposit_name' => $row['pp_deposit_name'],
            'pp_receipt_price' => shop_personalpay_int($row, 'pp_receipt_price'),
            'pp_misu_price'   => shop_personalpay_misu_price($row),
            'already_paid'    => $alreadyPaid,
            'has_payment_transaction' => $hasTransaction,
            'payment_in_progress' => $paymentState === 'processing',
            'payment_state'    => $paymentState,
            'payment_state_label' => shop_personalpay_payment_state_label($paymentState),
            'pp_receipt_time' => $alreadyPaid ? $receiptTime : null,
            'pp_time'         => $row['pp_time'] ?? '',
            'pp_cash'         => shop_personalpay_int($row, 'pp_cash'),
            'pp_cash_no'      => $row['pp_cash_no'] ?? '',
            'pp_cash_info'    => $row['pp_cash_info'] ?? '',
            'pp_payment_app_label' => $paymentAppInfo['label'],
            'pp_payment_app_value' => $paymentAppInfo['value'],
            'pp_payment_display_bank' => $paymentAppInfo['display_bank'],
            'pp_payment_receipt_url' => $receiptUrl,
            'receipt_url'     => $receiptUrl,
            'pp_cash_receipt_url' => $cashReceiptUrl,
            'cash_receipt_url' => $cashReceiptUrl,
            'pp_cash_receipt_issue_url' => $cashReceiptIssueUrl,
            'cash_receipt_issue_url' => $cashReceiptIssueUrl,
            'can_pay'         => $paymentBlockReason === '',
            'payment_block_reason' => $paymentBlockReason,
            'payment_path'    => $paymentPath,
            'payment_url'     => $paymentUrl,
            'legacy_payment_url' => $paymentUrl,
        ];
    }
}

if ($apiMethod === 'GET' && $pp_id === '') {
    [$page, $perPage, $offset] = api_page_params(25, 50);
    $payTable = DB::table('g5_shop_personalpay_table');
    $orderTable = DB::table('g5_shop_order_table');

    $where = "p.pp_use = '1' AND p.pp_tno = ''";
    $params = [];
    if (!$isSuperAdmin) {
        $where .= ' AND o.mb_id = ?';
        $params[] = (string) $member['mb_id'];
    }

    $total = DB::count(
        "SELECT COUNT(*)
           FROM {$payTable} p
           LEFT JOIN {$orderTable} o ON o.od_id = p.od_id
          WHERE {$where}",
        $params
    );
    $rows = DB::fetchAll(
        "SELECT p.*, o.mb_id AS order_mb_id
           FROM {$payTable} p
           LEFT JOIN {$orderTable} o ON o.od_id = p.od_id
          WHERE {$where}
          ORDER BY p.pp_id DESC
          LIMIT ?, ?",
        array_merge($params, [$offset, $perPage])
    );

    $items = [];
    foreach ($rows as $row) {
        $items[] = shop_personalpay_payload($row);
    }

    Response::paginated($items, $total, $page, $perPage);
}

if ($pp_id === '') {
    Response::error('pp_id required.', 422);
}

if ($apiMethod === 'POST' && $pp_action === 'start') {
    $row = shop_personalpay_require_access(
        shop_personalpay_fetch($pp_id),
        $member,
        $isSuperAdmin
    );

    $blockReason = shop_personalpay_payment_block_reason($row);
    if ($blockReason !== '') {
        Response::error($blockReason, 409);
    }

    shop_personalpay_prepare_legacy_session($row);
    Response::success(shop_personalpay_payment_start_payload($row));
}

if ($pp_action !== '') {
    Response::error('Method not allowed.', 405);
}

if ($apiMethod === 'GET') {
    $row = shop_personalpay_require_access(
        shop_personalpay_fetch($pp_id),
        $member,
        $isSuperAdmin
    );
    if ((int) $row['pp_use'] !== 1) {
        Response::error('비활성화된 결제 링크입니다.', 410);
    }

    Response::success(shop_personalpay_payload($row));
}

Response::error('Method not allowed.', 405);
