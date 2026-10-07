<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

// =========================================================================
// Helper: load shop default config
// =========================================================================
function pg_load_config() {
    $shopConfig = DB::fetch("SELECT * FROM " . DB::table('g5_shop_default_table') . " LIMIT 1") ?: [];
    $siteConfig = DB::fetch("SELECT * FROM " . DB::table('config_table') . " LIMIT 1") ?: [];

    return array_merge($shopConfig, $siteConfig);
}

function pg_bank_accounts($cfg) {
    $raw = (string) ($cfg['de_bank_account'] ?? '');
    if ($raw === '') {
        return [];
    }

    $accounts = [];
    foreach (preg_split('/\r\n|\r|\n/', $raw) as $line) {
        $account = trim(html_entity_decode(strip_tags((string) $line), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($account !== '') {
            $accounts[] = $account;
        }
    }

    return array_values(array_unique($accounts));
}

function pg_detect_test_mode($cfg, $pg_service) {
    $override = getenv('SHOP_PG_TEST_MODE');
    if ($override !== false && trim((string) $override) !== '') {
        return !in_array(strtolower(trim((string) $override)), ['0', 'false', 'no', 'off', 'prod', 'production'], true);
    }

    if ($pg_service === 'toss') {
        // 관리자 쇼핑몰 설정 '결제 테스트'(de_card_test)가 정본 — 테스트결제면 테스트, 실결제면 실결제.
        // 키 모양으로 추측하지 않는다(실결제로 설정했는데 테스트 키면 결제를 막는다: pg_toss_client_key/secret_key).
        return (int) ($cfg['de_card_test'] ?? 0) > 0;
    }
    // KCP·이니시스도 관리자 '결제 테스트'를 따른다(키 모양 추측 대신). 테스트면 각 헬퍼가 공개 테스트 상점(T0000·INIpayTest)을,
    // 실결제면 관리자에 등록한 상점 아이디를 쓴다.
    if ($pg_service === 'inicis') {
        return (int) ($cfg['de_card_test'] ?? 0) > 0;
    }
    if ($pg_service === 'kakaopay') {
        return (int) ($cfg['de_card_test'] ?? 0) > 0
            || trim((string) ($cfg['de_kakaopay_mid'] ?? '')) === '';
    }
    if ($pg_service === 'kcp') {
        return (int) ($cfg['de_card_test'] ?? 0) > 0;
    }
    if ($pg_service === 'nicepay') {
        return (int) ($cfg['de_card_test'] ?? 0) > 0;
    }

    return true;
}

require_once __DIR__ . '/payment_toss_helpers.php';

function pg_parse_pg_datetime(?string $value, ?string $time = null): string {
    $raw = preg_replace('/[^0-9]/', '', trim((string) $value) . ($time !== null ? trim((string) $time) : ''));
    if (strlen($raw) === 12) {
        $raw = '20' . $raw;
    }
    if (strlen($raw) >= 14) {
        return substr($raw, 0, 4) . '-' . substr($raw, 4, 2) . '-' . substr($raw, 6, 2)
            . ' ' . substr($raw, 8, 2) . ':' . substr($raw, 10, 2) . ':' . substr($raw, 12, 2);
    }

    $ts = strtotime(trim((string) $value));
    return $ts ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
}

function pg_append_order_history(string $orderId, string $message): void {
    $line = date('Y-m-d H:i:s') . ' - ' . trim($message);
    DB::execute(
        "UPDATE " . DB::table('g5_shop_order_table') . "
         SET od_mod_history = CASE
             WHEN od_mod_history = '' THEN ?
             ELSE CONCAT(od_mod_history, '\n', ?)
         END
         WHERE od_id = ?",
        [$line, $line, $orderId]
    );
}

/**
 * 가상계좌 입금통보 반영 — 결제 확인 · 주문 취소(PATCH /orders/{id}) · 결제 취소와 같은 주문 잠금(pg_payment_confirm_lock_name)
 * 안에서 다시 읽고 바꾼다. 쇼핑 표가 MyISAM 이라 트랜잭션은 막아 주지 않는다 — 잠금 없이 읽고 쓰면 취소가 재고 · 포인트 ·
 * 쿠폰을 되돌린 뒤 이 통보가 '입금'으로 덮어써, 돈은 받았는데 할인은 돌려준 주문이 된다.
 * 잠금 이름은 요청 값이 아니라 DB 의 주문번호로 만든다(od_id 는 숫자 열이라 앞에 0 을 붙인 값도 같은 주문을 찾는다).
 * 잠금을 못 잡으면 실패로 답한다 — PG 가 통보를 다시 보낸다.
 */
function pg_mark_vbank_deposited(string $provider, string $orderId, string $tno, int $amount, string $paidAt, string $depositName = '', string $bankAccount = '', array $cashReceipt = []): array {
    $found = DB::fetch(
        "SELECT od_id FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? LIMIT 1",
        [$orderId]
    );
    if (!$found) {
        return ['ok' => false, 'error' => 'Order not found.'];
    }
    $lock = pg_payment_confirm_acquire_lock((string) $found['od_id'], 5);
    if (empty($lock['ok'])) {
        return ['ok' => false, 'error' => 'Order is busy. Please retry shortly.'];
    }
    try {
        $result = pg_mark_vbank_deposited_locked($provider, $orderId, $tno, $amount, $paidAt, $depositName, $bankAccount, $cashReceipt);
    } finally {
        pg_payment_confirm_release_lock((string) ($lock['lock'] ?? ''));
    }

    // 알림은 잠금을 푼 뒤에 — 메일 발송이 느려도 취소 · 확인을 붙잡지 않게(결제 확인과 같은 순서).
    if (!empty($result['ok']) && empty($result['already'])) {
        shop_api_send_order_mail($orderId, 'paid');
        shop_api_defer_order_push((string) $orderId, 'paid');
    }
    return $result;
}

/** pg_mark_vbank_deposited() 가 주문 잠금을 잡은 뒤에만 부른다. */
function pg_mark_vbank_deposited_locked(string $provider, string $orderId, string $tno, int $amount, string $paidAt, string $depositName = '', string $bankAccount = '', array $cashReceipt = []): array {
    if (trim($paidAt) === '') {
        $paidAt = date('Y-m-d H:i:s');
    }

    $order = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_order_table') . "
         WHERE od_id = ? LIMIT 1",
        [$orderId]
    );
    if (!$order) {
        return ['ok' => false, 'error' => 'Order not found.'];
    }

    if (($order['od_settle_case'] ?? '') !== '가상계좌') {
        return ['ok' => false, 'error' => 'Order is not a virtual-account payment.'];
    }
    // 통보를 보낸 PG 와 이 주문을 받은 PG 가 같아야 한다 — 다른 PG 의 통보로 입금 처리하지 않게(예전 주문처럼
    // od_pg 가 비어 있으면 대조하지 않는다).
    $orderPg = strtolower(trim((string) ($order['od_pg'] ?? '')));
    if ($orderPg !== '' && $orderPg !== strtolower(trim($provider))) {
        return ['ok' => false, 'error' => 'Provider mismatch.'];
    }
    if ($tno !== '' && !empty($order['od_tno']) && (string) $order['od_tno'] !== $tno) {
        return ['ok' => false, 'error' => 'Transaction id mismatch.'];
    }
    $expectedAmount = (int) ($order['od_misu'] ?? 0) > 0
        ? (int) ($order['od_misu'] ?? 0)
        : (int) ($order['od_receipt_price'] ?? 0);
    // 금액이 없는 통보는 금액 대조를 건너뛰는 길이 되므로 받지 않는다.
    if ($amount <= 0) {
        return ['ok' => false, 'error' => 'Amount required.'];
    }
    if ($expectedAmount !== $amount) {
        return ['ok' => false, 'error' => 'Amount mismatch.'];
    }

    if (($order['od_status'] ?? '') === '입금') {
        return ['ok' => true, 'already' => true, 'status' => '입금'];
    }
    if (!in_array((string) ($order['od_status'] ?? ''), ['주문'], true)) {
        pg_append_order_history($orderId, "{$provider} 가상계좌 입금통보 보류: 현재 주문상태 " . (string) ($order['od_status'] ?? ''));
        return ['ok' => false, 'error' => 'Order is not waiting for deposit.'];
    }

    DB::beginTransaction();
    try {
        $memo = strtoupper($provider) . ' 가상계좌 입금확인 - ' . $paidAt;
        $cashSet = '';
        $params = [
            '입금',
            $amount > 0 ? $amount : $expectedAmount,
            0,
            $paidAt,
            $depositName,
            $tno !== '' ? $tno : (string) ($order['od_tno'] ?? ''),
            // 발급 때 저장한 계좌 안내(은행명·계좌·예금주·입금기한)를 지킨다 — 통보의 계좌값은 은행 코드(BK04 등)만
            // 오기도 해서 덮으면 안내가 망가진다. 영카트 settle_*_common.php 도 입금통보에서 od_bank_account 를 건드리지 않는다.
            (string) ($order['od_bank_account'] ?? '') !== '' ? (string) $order['od_bank_account'] : $bankAccount,
        ];

        if (!empty($cashReceipt)) {
            $cashSet = ', od_cash = ?, od_cash_no = ?, od_cash_info = ?';
            $params[] = 1;
            $params[] = (string) ($cashReceipt['no'] ?? '');
            $params[] = serialize($cashReceipt);
        }

        $params[] = $memo;
        $params[] = $memo;
        $params[] = $orderId;

        // 상태 가드 — 잠금을 잡지 않는 쓰기(관리자 화면 등)가 그사이 상태를 바꿨으면 덮어쓰지 않는다.
        $updated = DB::execute(
            "UPDATE " . DB::table('g5_shop_order_table') . "
             SET od_status = ?, od_receipt_price = ?, od_misu = ?, od_receipt_time = ?, od_deposit_name = ?,
                 od_tno = ?, od_bank_account = ?
                 {$cashSet},
                 od_shop_memo = CASE
                     WHEN od_shop_memo = '' THEN ?
                     ELSE CONCAT(od_shop_memo, '\n', ?)
                 END
             WHERE od_id = ? AND od_status = '주문'",
            $params
        );
        if ($updated !== 1) {
            throw new RuntimeException('Order status changed before the deposit was applied.');
        }
        DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET ct_status = ?
             WHERE od_id = ?",
            ['입금', $orderId]
        );
        DB::commit();
    } catch (Throwable $e) {
        DB::rollBack();
        return ['ok' => false, 'error' => $e->getMessage()];
    }

    return ['ok' => true, 'already' => false, 'status' => '입금'];
}

function pg_notify_allowed_ips(string $provider): array {
    $allowed = [
        'nicepay' => ['121.133.126.10', '121.133.126.11', '211.33.136.39'],
        'inicis' => ['203.238.37.15', '39.115.212.9', '183.109.71.153', '118.129.210.25'],
        'kcp' => [
            '203.238.36.58', '203.238.36.160', '203.238.36.161',
            '203.238.36.173', '203.238.36.178',
            '103.215.144.173', '103.215.144.174', '103.215.145.30',
        ],
    ];

    return $allowed[$provider] ?? [];
}

/**
 * 입금통보를 보낸 쪽이 그 PG 의 통보 서버인지 본다.
 *
 * 이니시스·KCP 통보 처리(payment_status_routes.php)는 POST 로 받은 주문번호와 금액을 그대로
 * 믿고 주문을 '입금' 으로 바꾼다 — 재조회도 서명 검증도 없다. 보낸 쪽이 진짜 PG 인지 가리는
 * 것은 이 검사뿐이다.
 *
 * 예전에는 테스트모드면 무조건 통과시켰다. 그런데 PG 의 통보 서버 주소는 테스트와 실결제가
 * 같으므로 느슨하게 둘 이유가 없었고, 오히려 설치 직후(de_card_test=1) 상태의 상점은 아무나
 * 보낸 통보로 주문이 입금 처리될 수 있었다. 이제 두 모드 모두 목록으로 거른다.
 *
 * 목록이 없는 PG 도 거른다(fail closed). 통보를 흉내 내 보는 로컬 시험에서만
 * SHOP_PG_NOTIFY_SKIP_IP_CHECK 로 명시해서 끈다 — 운영에서는 켜지 말 것.
 *
 * 막혔는데 이유를 모르면 손쓸 수 없으니 거른 주소를 남긴다. PG 가 통보 서버를 늘려 목록이
 * 낡으면 이 기록이 단서가 된다(그때는 pg_notify_allowed_ips 를 고쳐야 한다).
 */
function pg_notify_ip_allowed(string $provider): bool {
    if ((getenv('SHOP_PG_NOTIFY_SKIP_IP_CHECK') ?: '') !== '') {
        return true;
    }

    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $allowed = pg_notify_allowed_ips($provider);

    if ($allowed === [] || !in_array($remote, $allowed, true)) {
        return false;
    }

    return true;
}

function pg_text_response(string $text, int $status = 200, string $contentType = 'text/plain; charset=utf-8'): void {
    http_response_code($status);
    header('Content-Type: ' . $contentType);
    echo $text;
    exit;
}

function pg_kcp_site_cd($cfg, bool $isTestMode): string {
    $mid = trim((string) ($cfg['de_kcp_mid'] ?? ''));

    if ($isTestMode) {
        if (preg_match('/^(T\d{4}|S\d{4})$/', $mid) === 1) {
            return $mid;
        }
        return (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? 'T0007' : 'T0000';
    }

    if ($mid === '') {
        return '';
    }
    return strpos($mid, 'SR') === 0 ? $mid : 'SR' . $mid;
}

function pg_kcp_site_key($cfg, string $siteCd): string {
    if ($siteCd === 'T0007') {
        return '4Ho4YsuOZlLXUZUdOxM1Q7X__';
    }
    if ($siteCd === 'T0000') {
        return '3grptw1.zW0GSo4PQdaGvsF__';
    }
    $siteKey = trim((string) ($cfg['de_kcp_site_key'] ?? ''));
    if ($siteKey !== '') {
        return $siteKey;
    }
    return '';
}

require_once __DIR__ . '/payment_inicis_helpers.php';

require_once __DIR__ . '/payment_nicepay_helpers.php';

function pg_kcp_bitmask_from_mobile_method(string $method): string {
    $method = strtoupper(trim($method));
    if ($method === 'CARD') {
        return '100000000000';
    }
    if ($method === 'BANK') {
        return '010000000000';
    }
    if ($method === 'VCNT') {
        return '001000000000';
    }
    if ($method === 'MOBX') {
        return '000010000000';
    }
    return '';
}

function pg_kcp_pay_type(string $settleCase, string $usePayMethod): string {
    if ($usePayMethod === '100000000000' && in_array($settleCase, ['신용카드', '간편결제'], true)) {
        return 'PACA';
    }
    if ($usePayMethod === '010000000000' && $settleCase === '계좌이체') {
        return 'PABK';
    }
    if ($usePayMethod === '001000000000' && $settleCase === '가상계좌') {
        return 'PAVC';
    }
    if ($usePayMethod === '000010000000' && $settleCase === '휴대폰') {
        return 'PAMC';
    }
    return '';
}

function pg_kcp_mobile_payment_method(string $settleCase): string {
    if ($settleCase === '계좌이체') {
        return 'BANK';
    }
    if ($settleCase === '가상계좌') {
        return 'VCNT';
    }
    if ($settleCase === '휴대폰') {
        return 'MOBX';
    }
    if (in_array($settleCase, ['신용카드', '간편결제'], true)) {
        return 'CARD';
    }
    return '';
}

function pg_kcp_message_to_utf8(string $message): string {
    if ($message === '') {
        return '';
    }
    if (preg_match('//u', $message)) {
        return $message;
    }
    $converted = @iconv('euc-kr', 'utf-8//IGNORE', $message);
    return $converted !== false && $converted !== '' ? $converted : $message;
}

function pg_request_origin(): string {
    if (function_exists('api_public_request_origin')) {
        $origin = api_public_request_origin(true);
        if ($origin !== '') {
            return $origin;
        }
    }

    foreach (array('G5_WEBAPP_APP_URL', 'G5_URL') as $constantName) {
        if (!defined($constantName) || !constant($constantName)) {
            continue;
        }
        $origin = function_exists('api_public_origin_from_url')
            ? api_public_origin_from_url(constant($constantName))
            : '';
        if ($origin !== '') {
            return $origin;
        }
    }

    return 'http://127.0.0.1';
}

function pg_api_url(string $path, array $query = []): string {
    $path = '/' . ltrim($path, '/');
    $origin = pg_request_origin();
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '/api/index.php';

    if (isset($_GET['_route']) || strpos($_SERVER['REQUEST_URI'] ?? '', '_route=') !== false) {
        $params = array_merge(['_route' => 'v1' . $path], $query);
        return $origin . $scriptName . '?' . http_build_query($params);
    }

    $marker = '/api/v1/';
    $markerPos = strpos($requestPath, $marker);
    $basePath = $markerPos !== false ? substr($requestPath, 0, $markerPos) . '/api/v1' : '/api/v1';
    $url = $origin . $basePath . $path;
    return $query ? $url . '?' . http_build_query($query) : $url;
}

function pg_value_present($value): bool {
    return trim((string) $value) !== '';
}

function pg_file_status(string $path): array {
    $exists = $path !== '' && is_file($path);
    return [
        'path'     => $path,
        'exists'   => $exists,
        'readable' => $exists && is_readable($path),
    ];
}

function pg_payment_confirm_tables(): array {
    $keys = [
        'g5_shop_order_table',
        'g5_shop_cart_table',
        'g5_shop_item_table',
        'g5_shop_item_option_table',
        'g5_shop_coupon_log_table',
        'point_table',
        'member_table',
    ];

    $tables = [];
    foreach ($keys as $key) {
        try {
            $tables[$key] = DB::table($key);
        } catch (Throwable $e) {
            $tables[$key] = '';
        }
    }

    return array_filter(array_unique($tables), static fn($table) => trim((string) $table) !== '');
}

function pg_payment_confirm_transaction_report(): array {
    static $report = null;
    if ($report !== null) {
        return $report;
    }

    $tables = pg_payment_confirm_tables();
    if (empty($tables)) {
        return $report = [
            'transactional' => false,
            'engines' => [],
            'missing' => ['payment tables'],
            'reason' => 'payment tables not found',
        ];
    }

    try {
        $placeholders = implode(',', array_fill(0, count($tables), '?'));
        $rows = DB::fetchAll(
            "SELECT TABLE_NAME, ENGINE
               FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME IN ({$placeholders})",
            array_values($tables)
        );
    } catch (Throwable $e) {
        return $report = [
            'transactional' => false,
            'engines' => [],
            'missing' => array_values($tables),
            'reason' => $e->getMessage(),
        ];
    }

    $engines = [];
    foreach ($rows as $row) {
        $engines[(string) $row['TABLE_NAME']] = strtoupper((string) ($row['ENGINE'] ?? ''));
    }

    $missing = array_values(array_diff(array_values($tables), array_keys($engines)));
    $transactionalEngines = ['INNODB', 'NDBCLUSTER'];
    $nonTransactional = [];
    foreach ($engines as $table => $engine) {
        if (!in_array($engine, $transactionalEngines, true)) {
            $nonTransactional[$table] = $engine;
        }
    }

    return $report = [
        'transactional' => empty($missing) && empty($nonTransactional),
        'engines' => $engines,
        'missing' => $missing,
        'non_transactional' => $nonTransactional,
        'reason' => empty($missing) && empty($nonTransactional)
            ? 'all payment tables are transactional'
            : 'one or more payment tables do not support transactions',
    ];
}

function pg_payment_confirm_lock_name(string $orderId): string {
    return 'g5pay_' . md5($orderId);
}

function pg_payment_confirm_acquire_lock(string $orderId, int $timeout = 10): array {
    $lockName = pg_payment_confirm_lock_name($orderId);
    try {
        $row = DB::fetch("SELECT GET_LOCK(?, ?) AS got_lock", [$lockName, $timeout]);
    } catch (Throwable $e) {
        return ['ok' => false, 'lock' => $lockName, 'error' => $e->getMessage(), 'code' => 'lock_busy'];
    }

    // GET_LOCK: 1 = 잡음, 0 = 다른 confirm 이 쥐고 있어 시간 초과(진행 중), NULL = 락 자체 오류.
    $got = isset($row['got_lock']) ? (int) $row['got_lock'] : null;
    return [
        'ok' => $got === 1,
        'lock' => $lockName,
        'error' => $got === 1 ? '' : 'Payment confirmation is already running.',
        'code' => $got === 1 ? '' : ($got === 0 ? 'confirm_in_progress' : 'lock_busy'),
    ];
}

function pg_payment_confirm_release_lock(string $lockName): void {
    if ($lockName === '') {
        return;
    }
    try {
        DB::fetch("SELECT RELEASE_LOCK(?) AS released", [$lockName]);
    } catch (Throwable $e) {
        // Named locks are connection-scoped; connection close releases it if this fails.
    }
}

function pg_legacy_transaction_query(string $sql): void {
    if (!function_exists('sql_query')) {
        return;
    }
    $result = sql_query($sql, false);
    if ($result === false || $result === null) {
        throw new RuntimeException('Legacy SQL transaction command failed: ' . $sql);
    }
}

function pg_is_local_origin(string $origin): bool {
    $host = strtolower((string) (parse_url($origin, PHP_URL_HOST) ?: ''));
    if ($host === 'localhost' || $host === '::1' || preg_match('/^127\./', $host) === 1) {
        return true;
    }
    return preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/', $host) === 1;
}

function pg_easy_pay_services(array $cfg): array {
    $raw = (string) ($cfg['de_easy_pay_services'] ?? '');
    if ($raw === '') {
        return [];
    }

    $services = array_map('trim', explode(',', $raw));
    $services = array_filter($services, static fn($service) => $service !== '');

    return array_values(array_unique($services));
}

function pg_primary_easy_pay_service(array $cfg): string {
    $services = pg_easy_pay_services($cfg);
    if (!$services) {
        return '';
    }

    $pgService = (string) ($cfg['de_pg_service'] ?? '');
    $priority = $pgService === 'nicepay'
        ? ['nicepay_naverpay', 'nicepay_kakaopay', 'nicepay_samsungpay', 'nicepay_paycopay', 'nicepay_skpay', 'nicepay_ssgpay', 'nicepay_lpay']
        : ['nhnkcp_naverpay', 'nhnkcp_kakaopay', 'nhnkcp_payco'];

    foreach ($priority as $service) {
        if (in_array($service, $services, true)) {
            return $service;
        }
    }

    return (string) $services[0];
}

function pg_payment_method_flags(array $cfg): array {
    $bankAccounts = pg_bank_accounts($cfg);
    return [
        'card'     => (int) ($cfg['de_card_use'] ?? 0) === 1,
        'vbank'    => (int) ($cfg['de_vbank_use'] ?? 0) === 1,
        'bank'     => (int) ($cfg['de_bank_use'] ?? 0) === 1 && !empty($bankAccounts),
        'iche'     => (int) ($cfg['de_iche_use'] ?? 0) === 1,
        'hp'       => (int) ($cfg['de_hp_use'] ?? 0) === 1,
        'easy_pay' => (int) ($cfg['de_easy_pay_use'] ?? 0) === 1,
        'kakaopay' => pg_kakaopay_enabled($cfg),
    ];
}

require_once __DIR__ . '/payment_diagnostics_helpers.php';

require_once __DIR__ . '/payment_kcp_approval_helpers.php';

require_once __DIR__ . '/payment_bridge_helpers.php';
