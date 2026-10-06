<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_cookie_secure')) {
    function shop_api_cookie_secure()
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }

        return function_exists('g5_nextjs_runtime_forwarded_proto')
            && g5_nextjs_runtime_forwarded_proto() === 'https';
    }
}

if (!function_exists('shop_api_normalize_origin')) {
    function shop_api_normalize_origin($origin)
    {
        $origin = rtrim(trim((string) $origin), '/');
        if ($origin === '') {
            return '';
        }

        $parts = parse_url($origin);
        if (empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $scheme = strtolower((string) $parts['scheme']);
        if (!in_array($scheme, ['http', 'https'], true)) {
            return '';
        }

        $host = strtolower((string) $parts['host']);
        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';

        return $scheme . '://' . $host . $port;
    }
}

if (!function_exists('shop_api_add_allowed_cookie_origins')) {
    function shop_api_add_allowed_cookie_origins(&$origins, $value)
    {
        if (!is_string($value) || trim($value) === '') {
            return;
        }

        foreach (explode(',', $value) as $origin) {
            $normalized = shop_api_normalize_origin($origin);
            if ($normalized !== '') {
                $origins[] = $normalized;
            }
        }
    }
}

if (!function_exists('shop_api_cookie_allowed_origins')) {
    function shop_api_cookie_allowed_origins()
    {
        global $DEFAULT_ALLOWED_ORIGINS, $G5_API_ENV;

        $origins = [];

        if (isset($DEFAULT_ALLOWED_ORIGINS) && is_array($DEFAULT_ALLOWED_ORIGINS)) {
            foreach ($DEFAULT_ALLOWED_ORIGINS as $origin) {
                $normalized = shop_api_normalize_origin($origin);
                if ($normalized !== '') {
                    $origins[] = $normalized;
                }
            }
        }
        if (defined('G5_CORS_ALLOWED_ORIGINS') && G5_CORS_ALLOWED_ORIGINS) {
            shop_api_add_allowed_cookie_origins($origins, G5_CORS_ALLOWED_ORIGINS);
        }
        if (isset($G5_API_ENV['G5_CORS_ALLOWED_ORIGINS'])) {
            shop_api_add_allowed_cookie_origins($origins, $G5_API_ENV['G5_CORS_ALLOWED_ORIGINS']);
        }

        $serverOrigins = getenv('G5_CORS_ALLOWED_ORIGINS');
        if (is_string($serverOrigins)) {
            shop_api_add_allowed_cookie_origins($origins, $serverOrigins);
        }

        return array_values(array_unique(array_filter($origins)));
    }
}

if (!function_exists('shop_api_current_origin')) {
    function shop_api_current_origin()
    {
        if (function_exists('api_public_request_origin')) {
            return api_public_request_origin(false);
        }

        return '';
    }
}

if (!function_exists('shop_api_url_with_query')) {
    function shop_api_url_with_query(string $base, array $params): string
    {
        return $base . (strpos($base, '?') === false ? '?' : '&') . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }
}

if (!function_exists('shop_api_base_url')) {
    function shop_api_base_url(): string
    {
        if (defined('G5_URL') && G5_URL) {
            return rtrim((string) G5_URL, '/') . '/api/v1/shop';
        }

        $origin = shop_api_current_origin();
        return $origin !== '' ? rtrim($origin, '/') . '/api/v1/shop' : '/api/v1/shop';
    }
}

if (!function_exists('shop_api_lg_receipt_signature')) {
    function shop_api_lg_receipt_signature(string $kind, array $params, string $mertKey): string
    {
        unset($params['sig']);
        ksort($params);
        return hash_hmac('sha256', $kind . '|' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), $mertKey);
    }
}

if (!function_exists('shop_api_lg_receipt_url')) {
    function shop_api_lg_receipt_url(string $kind, array $params, string $mertKey): string
    {
        $mertKey = trim($mertKey);
        if ($kind === '' || $mertKey === '') {
            return '';
        }

        foreach ($params as $value) {
            if (trim((string) $value) === '') {
                return '';
            }
        }

        $params['sig'] = shop_api_lg_receipt_signature($kind, $params, $mertKey);
        return shop_api_url_with_query(shop_api_base_url() . '/receipts/' . rawurlencode($kind), $params);
    }
}

if (!function_exists('shop_api_cash_receipt_issue_secret')) {
    function shop_api_cash_receipt_issue_secret(): string
    {
        if (defined('JWT_SECRET') && JWT_SECRET) {
            return (string) JWT_SECRET;
        }

        return hash('sha256',
            (defined('G5_MYSQL_USER') ? G5_MYSQL_USER : '') . '|' .
            (defined('G5_MYSQL_PASSWORD') ? G5_MYSQL_PASSWORD : '') . '|' .
            (defined('G5_MYSQL_DB') ? G5_MYSQL_DB : '')
        );
    }
}

if (!function_exists('shop_api_cash_receipt_issue_id')) {
    function shop_api_cash_receipt_issue_id(string $type, array $row): string
    {
        if ($type === 'personalpay') {
            return trim((string) ($row['pp_id'] ?? ''));
        }

        return trim((string) ($row['od_id'] ?? ''));
    }
}

if (!function_exists('shop_api_cash_receipt_issue_signature_payload')) {
    function shop_api_cash_receipt_issue_signature_payload(string $type, array $row, int $expires): array
    {
        $type = $type === 'personalpay' ? 'personalpay' : 'order';
        $id = shop_api_cash_receipt_issue_id($type, $row);

        if ($type === 'personalpay') {
            return [
                'type' => 'personalpay',
                'id' => $id,
                'time' => (string) ($row['pp_time'] ?? ''),
                'owner' => (string) ($row['mb_id'] ?? ''),
                'amount' => (string) ((int) ($row['pp_receipt_price'] ?? 0)),
                'cash' => (string) ((int) ($row['pp_cash'] ?? 0)),
                'expires' => (string) $expires,
            ];
        }

        return [
            'type' => 'order',
            'id' => $id,
            'time' => (string) ($row['od_time'] ?? ''),
            'ip' => (string) ($row['od_ip'] ?? ''),
            'owner' => (string) ($row['mb_id'] ?? ''),
            'amount' => (string) ((int) ($row['od_receipt_price'] ?? 0)),
            'cash' => (string) ((int) ($row['od_cash'] ?? 0)),
            'expires' => (string) $expires,
        ];
    }
}

if (!function_exists('shop_api_cash_receipt_issue_signature')) {
    function shop_api_cash_receipt_issue_signature(string $type, array $row, int $expires): string
    {
        $payload = shop_api_cash_receipt_issue_signature_payload($type, $row, $expires);
        ksort($payload);

        return hash_hmac(
            'sha256',
            http_build_query($payload, '', '&', PHP_QUERY_RFC3986),
            shop_api_cash_receipt_issue_secret()
        );
    }
}

if (!function_exists('shop_api_cash_receipt_issue_url')) {
    function shop_api_cash_receipt_issue_url(string $type, array $row, int $ttl = 86400): string
    {
        $type = $type === 'personalpay' ? 'personalpay' : 'order';
        $id = shop_api_cash_receipt_issue_id($type, $row);
        if ($id === '') {
            return '';
        }

        $expires = time() + max(300, $ttl);
        return shop_api_url_with_query(shop_api_base_url() . '/receipts/cash-issue', [
            'type' => $type,
            'id' => $id,
            'expires' => $expires,
            'sig' => shop_api_cash_receipt_issue_signature($type, $row, $expires),
        ]);
    }
}

if (!function_exists('shop_api_lg_payment_receipt_url')) {
    function shop_api_lg_payment_receipt_url(string $mid, string $tid, string $mertKey): string
    {
        return shop_api_lg_receipt_url('lg-payment', [
            'mid' => $mid,
            'tid' => $tid,
        ], $mertKey);
    }
}

if (!function_exists('shop_api_lg_platform')) {
    function shop_api_lg_platform(array $cfg): string
    {
        return (int) ($cfg['de_card_test'] ?? 0) > 0 ? 'test' : 'service';
    }
}

if (!function_exists('shop_api_lg_mid')) {
    function shop_api_lg_mid(array $cfg): string
    {
        $mid = trim((string) ($cfg['cf_lg_mid'] ?? ''));
        if ($mid === '') {
            return '';
        }

        $merchantId = strpos($mid, 'si_') === 0 ? $mid : 'si_' . $mid;
        return shop_api_lg_platform($cfg) === 'test' ? 't' . $merchantId : $merchantId;
    }
}

if (!function_exists('shop_api_lg_cash_trade_type')) {
    function shop_api_lg_cash_trade_type(string $settleCase): string
    {
        if ($settleCase === '계좌이체') {
            return 'BANK';
        }
        if ($settleCase === '가상계좌') {
            return 'CAS';
        }
        return 'CR';
    }
}

if (!function_exists('shop_api_lg_cash_receipt_url')) {
    function shop_api_lg_cash_receipt_url(string $mid, string $oid, string $casseqno, string $tradeType, string $platform, string $mertKey): string
    {
        return shop_api_lg_receipt_url('lg-cash', [
            'mid' => $mid,
            'oid' => $oid,
            'casseqno' => $casseqno,
            'trade' => $tradeType,
            'platform' => $platform,
        ], $mertKey);
    }
}

if (!function_exists('shop_api_cookie_same_site')) {
    function shop_api_cookie_same_site()
    {
        $origin = shop_api_normalize_origin($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin === '') {
            return 'Lax';
        }

        $scheme = parse_url($origin, PHP_URL_SCHEME);
        if ($scheme !== 'https' || !shop_api_cookie_secure()) {
            return 'Lax';
        }

        if (!in_array($origin, shop_api_cookie_allowed_origins(), true)) {
            return 'Lax';
        }

        $currentOrigin = shop_api_current_origin();
        if ($currentOrigin !== '' && $origin === $currentOrigin) {
            return 'Lax';
        }

        return 'None';
    }
}

if (!function_exists('shop_api_set_cookie')) {
    function shop_api_set_cookie($name, $value, $expires)
    {
        if (!headers_sent()) {
            $sameSite = shop_api_cookie_same_site();
            setcookie($name, $value, [
                'expires' => $expires,
                'path' => '/',
                'secure' => $sameSite === 'None' || shop_api_cookie_secure(),
                'httponly' => true,
                'samesite' => $sameSite,
            ]);
        }

        $_COOKIE[$name] = $value;
    }
}

if (!function_exists('shop_api_cart_cookie_lifetime')) {
    function shop_api_cart_cookie_lifetime()
    {
        global $default;

        $days = isset($default['de_cart_keep_term']) ? (int) $default['de_cart_keep_term'] : 7;
        if ($days < 1) {
            $days = 7;
        }

        return $days * 86400;
    }
}

if (!function_exists('shop_api_new_cart_id')) {
    function shop_api_new_cart_id()
    {
        if (function_exists('get_uniqid')) {
            return get_uniqid();
        }

        return date('YmdHis') . sprintf('%04d', mt_rand(0, 9999));
    }
}

if (!function_exists('shop_api_new_guest_cart_id')) {
    /**
     * 새 장바구니 id — 16자리 무작위 숫자(1000000000000000 ~ 8999999999999999).
     * 앱은 이 id 를 X-Cart-Id 로 들고 다니고 서버는 그 id 를 그대로 믿는다. 예전 get_uniqid()(날짜시각 + 1/100초)는
     * 1초에 후보가 100개뿐이라 만든 시각을 짐작하면 남의 비회원 장바구니를 읽거나 비울 수 있었다.
     * 길이 · 범위는 예전과 같은 16자리라 JS 숫자로 읽혀도 값이 틀어지지 않는다(Number.MAX_SAFE_INTEGER ≈ 9.007e15).
     */
    function shop_api_new_guest_cart_id(): string
    {
        $table = DB::table('g5_shop_cart_table');
        // 겹치면 다시 뽑는다 — 시각 기반 id 로 돌아가면 짐작할 수 있는 id 가 다시 생긴다(겹칠 확률은 사실상 0).
        $id = '';
        for ($i = 0; $i < 20; $i++) {
            $id = (string) random_int(1000000000000000, 8999999999999999);
            if (!DB::fetch("SELECT ct_id FROM {$table} WHERE od_id = ? LIMIT 1", [$id])) {
                return $id;
            }
        }
        return $id;
    }
}

if (!function_exists('shop_api_forget_cart_id')) {
    function shop_api_forget_cart_id(): void
    {
        if (function_exists('set_session')) {
            set_session('ss_cart_id', '');
            set_session('ss_cart_direct', '');
        }
        shop_api_set_cookie('ck_guest_cart_id', '', time() - 3600);
    }
}

if (!function_exists('shop_api_cart_has_foreign_owner')) {
    function shop_api_cart_has_foreign_owner(string $cartId, string $mbId): bool
    {
        if ($cartId === '') {
            return false;
        }

        $params = [$cartId];
        $ownerWhere = "mb_id <> ''";
        if ($mbId !== '') {
            $ownerWhere .= " AND mb_id <> ?";
            $params[] = $mbId;
        }

        $row = DB::fetch(
            "SELECT ct_id
             FROM " . DB::table('g5_shop_cart_table') . "
             WHERE od_id = ?
               AND {$ownerWhere}
               AND " . shop_api_cart_active_status_sql() . "
             LIMIT 1",
            array_merge($params, shop_api_cart_active_statuses())
        );

        return !empty($row);
    }
}

if (!function_exists('shop_api_valid_client_cart_id')) {
    /** SC-02: 앱이 보내는 카트 id 형식(get_uniqid 16자리 ~ 20자리 숫자). 형식이 틀리면 빈 문자열(4xx 아님). */
    function shop_api_valid_client_cart_id($value): string
    {
        $value = is_scalar($value) ? trim((string) $value) : '';
        return preg_match('/^[0-9]{16,20}$/', $value) === 1 ? $value : '';
    }
}

if (!function_exists('shop_api_client_cart_ids')) {
    /**
     * SC-02: 앱이 보낸 카트 id 후보를 우선순위대로 — 1 요청 헤더 `X-Cart-Id`, 2 JSON 본문 `cart_id`(POST/PATCH).
     * 쿠키·세션보다 먼저 보고, 후보마다 소유 검사를 따로 한다(헤더가 버려지면 본문 후보로 내려간다).
     * 웹(Next.js)은 둘 다 보내지 않으므로 빈 목록 → 기존 쿠키·세션 경로가 그대로 실행된다.
     */
    function shop_api_client_cart_ids(): array
    {
        $ids = [];
        $header = shop_api_valid_client_cart_id($_SERVER['HTTP_X_CART_ID'] ?? '');
        if ($header !== '') {
            $ids[] = $header;
        }

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method === 'POST' || $method === 'PATCH') {
            static $bodyCartId = null;
            if ($bodyCartId === null) {
                // php://input 은 요청 안에서 여러 번 읽을 수 있다 — 라우트가 먼저 읽었어도 같은 본문이다.
                $body = json_decode((string) file_get_contents('php://input'), true);
                $bodyCartId = is_array($body) ? shop_api_valid_client_cart_id($body['cart_id'] ?? '') : '';
            }
            if ($bodyCartId !== '' && $bodyCartId !== $header) {
                $ids[] = $bodyCartId;
            }
        }

        return $ids;
    }
}

if (!function_exists('shop_api_emit_cart_id')) {
    /** SC-02: 카트를 해석한 모든 응답(204 포함)에 `X-Cart-Id` 응답 헤더를 싣고, 마지막 해석 결과를 기억한다. */
    function shop_api_emit_cart_id(string $cartId): void
    {
        $GLOBALS['shop_api_last_cart_id'] = $cartId;
        if ($cartId !== '' && !headers_sent()) {
            header('X-Cart-Id: ' . $cartId);
        }
    }
}

if (!function_exists('shop_api_last_cart_id')) {
    function shop_api_last_cart_id(): string
    {
        return (string) ($GLOBALS['shop_api_last_cart_id'] ?? '');
    }
}

if (!function_exists('shop_api_with_cart_id')) {
    /** SC-02: 응답 data 에 `cart_id`(문자열)를 얹는다 — 앱은 이 값으로 로컬 카트 id 를 갱신한다. */
    function shop_api_with_cart_id($data, string $cartId): array
    {
        $data = is_array($data) ? $data : [];
        $data['cart_id'] = $cartId;
        return $data;
    }
}

if (!function_exists('shop_api_cart_id')) {
    function shop_api_cart_id($member = null)
    {
        $cartId = '';
        $mbId = !empty($member['mb_id']) ? $member['mb_id'] : '';

        // SC-02 해석 순서: 1 헤더 → 2 본문 cart_id → 3 쿠키 → 4 세션 → 5 회원 활성 카트 → 6 신규.
        // 다른 회원 소유 카트면 그 후보만 버리고 다음 순위로 간다(쿠키·세션 후보는 기존처럼 지운다).
        $fromClient = false;
        foreach (shop_api_client_cart_ids() as $candidate) {
            if (!shop_api_cart_has_foreign_owner($candidate, $mbId)) {
                $cartId = $candidate;
                $fromClient = true;
                break;
            }
        }

        if (!$cartId && !empty($_COOKIE['ck_guest_cart_id'])) {
            $cartId = shop_api_clean_id($_COOKIE['ck_guest_cart_id']);
        }

        if (!$cartId && function_exists('get_session')) {
            $cartId = shop_api_clean_id(get_session('ss_cart_id'));
        }

        if ($cartId && !$fromClient && shop_api_cart_has_foreign_owner($cartId, $mbId)) {
            shop_api_forget_cart_id();
            $cartId = '';
        }

        if (!$cartId && $mbId !== '') {
            $activeCart = DB::fetch(
                "SELECT c.od_id
                  FROM " . DB::table('g5_shop_cart_table') . " c
                  LEFT JOIN " . DB::table('g5_shop_order_table') . " o ON o.od_id = c.od_id
                  WHERE c.mb_id = ?
                    AND " . shop_api_cart_active_status_sql('c.ct_status') . "
                    AND c.od_id <> ''
                    AND c.od_id <> '0'
                    AND o.od_id IS NULL
                  ORDER BY c.ct_id DESC
                  LIMIT 1",
                array_merge([$mbId], shop_api_cart_active_statuses())
            );
            if ($activeCart && !empty($activeCart['od_id'])) {
                $cartId = shop_api_clean_id($activeCart['od_id']);
            }
        }

        if (!$cartId) {
            $cartId = shop_api_new_guest_cart_id();
        }

        if (function_exists('set_session')) {
            set_session('ss_cart_id', $cartId);
        }

        shop_api_set_cookie('ck_guest_cart_id', $cartId, time() + shop_api_cart_cookie_lifetime());

        if ($mbId !== '') {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_cart_table') . "
                 SET od_id = ?
                 WHERE mb_id = ?
                   AND (od_id = 0 OR od_id = '')
                   AND " . shop_api_cart_active_status_sql(),
                array_merge([$cartId, $mbId], shop_api_cart_active_statuses())
            );
        }

        shop_api_emit_cart_id((string) $cartId);

        return $cartId;
    }
}

if (!function_exists('shop_api_cart_ct_ids_from')) {
    function shop_api_cart_ct_ids_from($source)
    {
        if ($source === null || $source === '') {
            return [];
        }

        $raw = is_array($source) ? $source : preg_split('/[,\s]+/', (string) $source);
        $ids = [];
        foreach ($raw as $value) {
            $id = trim((string) $value);
            if ($id === '' || !ctype_digit($id)) {
                continue;
            }
            $id = (int) $id;
            if ($id > 0) {
                $ids[$id] = $id;
            }
        }

        return array_slice(array_values($ids), 0, 100);
    }
}

if (!function_exists('shop_api_truthy')) {
    function shop_api_truthy($value): bool
    {
        if (is_array($value)) {
            $value = reset($value);
        }

        $normalized = strtolower(trim((string) $value));
        return $normalized !== ''
            && $normalized !== '0'
            && $normalized !== 'false'
            && $normalized !== 'no'
            && $normalized !== 'off';
    }
}

if (!function_exists('shop_api_clean_order_input')) {
    /**
     * 주문서 입력 정리 — 원본 shop/orderformupdate.php(584-601줄)와 같은 정리. 원본 관리자 주문 화면은 이 정리를 믿고
     * 일부 값(od_email 등)을 그대로 출력하므로, API 로 들어온 주문도 같은 모양으로 저장해야 한다.
     */
    function shop_api_clean_order_input($input): array
    {
        $input = is_array($input) ? $input : [];
        $clean = static function ($value, ...$args): string {
            $value = trim((string) $value);
            return function_exists('clean_xss_tags') ? clean_xss_tags($value, ...$args) : strip_tags($value);
        };

        if (array_key_exists('od_email', $input)) {
            $email = trim((string) $input['od_email']);
            $input['od_email'] = function_exists('get_email_address')
                ? get_email_address($email)
                : (preg_match('/[0-9a-z._-]+@[a-z0-9._-]{4,}/i', $email, $m) ? $m[0] : '');
        }
        foreach (['od_name', 'od_tel', 'od_hp', 'od_addr1', 'od_addr2', 'od_addr3',
                  'od_b_name', 'od_b_tel', 'od_b_hp', 'od_b_addr1', 'od_b_addr2', 'od_b_addr3', 'od_deposit_name'] as $field) {
            if (array_key_exists($field, $input) && !is_array($input[$field])) {
                $input[$field] = $clean($input[$field]);
            }
        }
        if (array_key_exists('od_memo', $input) && !is_array($input['od_memo'])) {
            $input['od_memo'] = $clean($input['od_memo'], 1, 1, 0, 0);
        }
        foreach (['od_zip', 'od_zip1', 'od_zip2', 'od_b_zip', 'od_b_zip1', 'od_b_zip2'] as $field) {
            if (array_key_exists($field, $input) && !is_array($input[$field])) {
                $input[$field] = preg_replace('/[^0-9]/', '', (string) $input[$field]);
            }
        }
        foreach (['od_addr_jibeon', 'od_b_addr_jibeon'] as $field) {
            if (array_key_exists($field, $input)) {
                $input[$field] = preg_match('/^(N|R|J)$/', (string) $input[$field]) ? (string) $input[$field] : '';
            }
        }

        return $input;
    }
}

if (!function_exists('shop_api_guest_order_password')) {
    function shop_api_guest_order_password(array $input)
    {
        return trim((string) ($input['od_pwd'] ?? $input['password'] ?? ''));
    }
}

if (!function_exists('shop_api_guest_order_password_valid')) {
    function shop_api_guest_order_password_valid($password)
    {
        $password = (string) $password;
        return strlen($password) >= 3 && preg_match('/^[A-Za-z0-9]+$/', $password) === 1;
    }
}

if (!function_exists('shop_api_order_password_hash')) {
    function shop_api_order_password_hash($plainPassword)
    {
        $plainPassword = (string) $plainPassword;
        if (function_exists('get_encrypt_string')) {
            return get_encrypt_string($plainPassword);
        }

        return password_hash($plainPassword, PASSWORD_DEFAULT);
    }
}

if (!function_exists('shop_api_guest_order_password_matches')) {
    function shop_api_guest_order_password_matches($plainPassword, $storedPassword)
    {
        $plainPassword = (string) $plainPassword;
        $storedPassword = (string) $storedPassword;
        if ($plainPassword === '' || $storedPassword === '') {
            return false;
        }

        if (function_exists('check_password') && check_password($plainPassword, $storedPassword)) {
            return true;
        }

        $hashed = shop_api_order_password_hash($plainPassword);
        return $hashed !== '' && hash_equals($storedPassword, $hashed);
    }
}

if (!function_exists('shop_api_order_uid')) {
    function shop_api_order_uid($odId, $odTime, $odIp)
    {
        if (function_exists('get_shop_uid')) {
            return get_shop_uid('order', $odId, $odTime, $odIp);
        }

        return md5($odId . $odTime . $odIp);
    }
}

if (!function_exists('shop_api_guest_order_cookie_name')) {
    function shop_api_guest_order_cookie_name($odId)
    {
        return 'ck_guest_order_uid_' . shop_api_clean_id($odId);
    }
}

if (!function_exists('shop_api_set_guest_order_cookie')) {
    function shop_api_set_guest_order_cookie($order)
    {
        $uid = shop_api_order_uid($order['od_id'], $order['od_time'], $order['od_ip']);
        shop_api_set_cookie(
            shop_api_guest_order_cookie_name($order['od_id']),
            $uid,
            time() + (30 * 86400)
        );

        if (function_exists('set_session')) {
            set_session('ss_orderview_uid', $uid);
        }

        return $uid;
    }
}

if (!function_exists('shop_api_can_view_guest_order')) {
    function shop_api_can_view_guest_order($order, $uid = null)
    {
        if (!empty($order['mb_id'])) {
            return false;
        }

        $expected = shop_api_order_uid($order['od_id'], $order['od_time'], $order['od_ip']);
        $cookieName = shop_api_guest_order_cookie_name($order['od_id']);
        $actual = '';

        if (is_string($uid) && trim($uid) !== '') {
            $actual = trim($uid);
        } elseif (!empty($_GET['uid'])) {
            $actual = (string) $_GET['uid'];
        } elseif (!empty($_COOKIE[$cookieName])) {
            $actual = (string) $_COOKIE[$cookieName];
        } elseif (function_exists('get_session')) {
            $actual = (string) get_session('ss_orderview_uid');
        }

        return $actual !== '' && hash_equals($expected, $actual);
    }
}

if (!function_exists('shop_api_restore_pending_order_cart')) {
    /**
     * $targetCartId: 이 카트 id 로 되돌린다(SC-15 — 요청 문맥이 없는 자동 취소는 prepare 가 남긴 [cart_id:] 표식을 준다).
     * 생략하면 기존처럼 이 요청의 카트(shop_api_cart_id)로 되돌린다.
     */
    function shop_api_restore_pending_order_cart($order, $member = null, $reason = '결제 취소', $targetCartId = null)
    {
        if (empty($order['od_id']) || ($order['od_status'] ?? '') !== '준비') {
            return 0;
        }

        $cartId = $targetCartId !== null && (string) $targetCartId !== '' ? (string) $targetCartId : shop_api_cart_id($member);
        $orderId = (string) $order['od_id'];
        $restored = DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET od_id = ?, ct_status = ?
             WHERE od_id = ?
               AND " . shop_api_cart_active_or_pending_status_sql(),
            array_merge([$cartId, shop_api_cart_status_shopping(), $orderId], shop_api_cart_active_or_pending_statuses())
        );

        $history = trim((string) $reason);
        if ($history === '') {
            $history = '결제 취소';
        }
        DB::execute(
            "UPDATE " . DB::table('g5_shop_order_table') . "
             SET od_status = '취소',
                 od_send_cost = 0,
                 od_send_cost2 = 0,
                 od_receipt_price = 0,
                 od_receipt_point = 0,
                 od_misu = 0,
                 od_cancel_price = od_cart_price,
                 od_cart_coupon = 0,
                 od_coupon = 0,
                 od_send_coupon = 0,
                 od_mod_history = CASE
                     WHEN od_mod_history = '' THEN ?
                     ELSE CONCAT(od_mod_history, '\n', ?)
                 END
             WHERE od_id = ?
               AND od_status = '준비'",
            [$history, $history, $orderId]
        );

        return $restored;
    }
}

if (!function_exists('shop_api_restore_pending_cart_rows_by_ct_ids')) {
    function shop_api_restore_pending_cart_rows_by_ct_ids($member, array $ctIds, $reason = '결제 취소')
    {
        if (empty($ctIds)) {
            return 0;
        }

        $mbId = !empty($member['mb_id']) ? (string) $member['mb_id'] : '';
        $placeholders = implode(',', array_fill(0, count($ctIds), '?'));
        $params = $ctIds;
        if ($mbId !== '') {
            $ownerSql = ' AND c.mb_id = ? AND o.mb_id = ?';
            $params[] = $mbId;
            $params[] = $mbId;
        } else {
            $ownerSql = " AND c.mb_id = '' AND o.mb_id = ''";
        }

        $orders = DB::fetchAll(
            "SELECT DISTINCT o.*
             FROM " . DB::table('g5_shop_cart_table') . " c
             INNER JOIN " . DB::table('g5_shop_order_table') . " o ON o.od_id = c.od_id
             WHERE c.ct_id IN ({$placeholders})
               AND o.od_status = '준비'
               {$ownerSql}
               AND " . shop_api_cart_active_or_pending_status_sql('c.ct_status'),
            array_merge($params, shop_api_cart_active_or_pending_statuses())
        );

        $restored = 0;
        foreach ($orders as $order) {
            if ($mbId === '' && !shop_api_can_view_guest_order($order)) {
                continue;
            }
            $restored += shop_api_restore_pending_order_cart_locked($order, $member, $reason);
        }

        return $restored;
    }
}
