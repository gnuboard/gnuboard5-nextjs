<?php
/**
 * Shared helpers for shop API handlers.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/cart_status_helpers.php';

if (!function_exists('shop_api_clean_id')) {
    function shop_api_clean_id($value)
    {
        return preg_replace('/[^0-9a-z_\-]/i', '', (string) $value);
    }
}

if (!function_exists('shop_api_url_base')) {
    function shop_api_url_base(): string
    {
        // 앱 공용 기준 주소(api/lib/helpers.php)를 쓴다 — 요청 origin 만 쓰면 하위 폴더 설치(/gnuboard5_3)에서
        // 경로가 빠져 후기 · 이벤트 · 배너 · 쿠폰 이미지 주소가 틀어졌다. 루트 설치에서는 결과가 같다.
        if (function_exists('api_public_app_base_url')) {
            return rtrim((string) api_public_app_base_url(), '/');
        }

        if (defined('G5_WEBAPP_APP_URL') && G5_WEBAPP_APP_URL) {
            return rtrim((string) G5_WEBAPP_APP_URL, '/');
        }

        $origin = function_exists('api_public_request_origin')
            ? api_public_request_origin(false)
            : '';
        if ($origin !== '') {
            return rtrim($origin, '/');
        }

        return defined('G5_URL') && G5_URL ? rtrim((string) G5_URL, '/') : '';
    }
}

if (!function_exists('shop_api_image_url')) {
    function shop_api_image_url(string $scope, string $relativePath): string
    {
        $scope = trim($scope, '/');
        $relativePath = trim(str_replace('\\', '/', $relativePath), '/');

        if ($scope === '' || $relativePath === '' || strpos($relativePath, '..') !== false) {
            return '';
        }

        $segments = array_map('rawurlencode', explode('/', $relativePath));
        $base = shop_api_url_base();

        return ($base ? $base : '') . '/api/v1/shop/images/' . rawurlencode($scope) . '/' . implode('/', $segments);
    }
}

if (!function_exists('shop_api_data_image_path')) {
    function shop_api_data_image_path(string $scope, string $relativePath): string
    {
        $scope = trim($scope, '/');
        $relativePath = trim(str_replace('\\', '/', $relativePath), '/');

        if ($scope === '' || $relativePath === '' || strpos($relativePath, '..') !== false) {
            return '';
        }

        $allowedScopes = array(
            'item' => G5_DATA_PATH . '/item',
            'event' => G5_DATA_PATH . '/event',
            'coupon' => G5_DATA_PATH . '/coupon',
            'banner' => G5_DATA_PATH . '/banner',
        );

        if (!isset($allowedScopes[$scope])) {
            return '';
        }

        $baseDir = realpath($allowedScopes[$scope]);
        if ($baseDir === false) {
            return '';
        }

        $path = realpath($baseDir . '/' . $relativePath);
        if ($path === false || !is_file($path)) {
            return '';
        }

        $baseDir = rtrim(str_replace('\\', '/', $baseDir), '/');
        $normalizedPath = str_replace('\\', '/', $path);

        if ($normalizedPath !== $baseDir && strpos($normalizedPath, $baseDir . '/') !== 0) {
            return '';
        }

        return $path;
    }
}

if (!function_exists('shop_api_item_image_url')) {
    /** 상품 이미지 주소 — 정본 api_shop_item_image_url()(api/lib/helpers.php)과 같은 값. 예전 이름을 쓰는 곳을 위해 둔다. */
    function shop_api_item_image_url($it_id, $imageField)
    {
        return api_shop_item_image_url($it_id, trim((string) $imageField));
    }
}

if (!function_exists('shop_api_plain_text')) {
    function shop_api_plain_text($value): string
    {
        return trim(html_entity_decode(strip_tags((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
}

if (!function_exists('shop_api_text_limit')) {
    function shop_api_text_limit($value, int $limit): string
    {
        $text = shop_api_plain_text($value);
        if ($limit <= 0) {
            return $text;
        }

        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $limit, 'UTF-8');
        }

        return substr($text, 0, $limit);
    }
}

if (!function_exists('shop_api_save_order_address_from_input')) {
    function shop_api_save_order_address_from_input(?array $member, array $input): ?array
    {
        $mbId = (string) ($member['mb_id'] ?? '');
        if ($mbId === '') {
            return null;
        }

        $address = [
            'ad_name'   => shop_api_text_limit($input['od_b_name'] ?? '', 50),
            'ad_tel'    => shop_api_text_limit($input['od_b_tel'] ?? '', 30),
            'ad_hp'     => shop_api_text_limit($input['od_b_hp'] ?? '', 30),
            'ad_zip1'   => shop_api_text_limit($input['od_b_zip1'] ?? '', 3),
            'ad_zip2'   => shop_api_text_limit($input['od_b_zip2'] ?? '', 3),
            'ad_addr1'  => shop_api_text_limit($input['od_b_addr1'] ?? '', 255),
            'ad_addr2'  => shop_api_text_limit($input['od_b_addr2'] ?? '', 255),
            'ad_addr3'  => shop_api_text_limit($input['od_b_addr3'] ?? '', 255),
            'ad_jibeon' => shop_api_text_limit($input['od_b_addr_jibeon'] ?? $input['ad_jibeon'] ?? '', 255),
        ];

        if ($address['ad_name'] === '' || $address['ad_hp'] === '' || $address['ad_zip1'] === '' || $address['ad_addr1'] === '') {
            return null;
        }

        $hasSubject = array_key_exists('ad_subject', $input);
        $subject = $hasSubject ? shop_api_text_limit($input['ad_subject'], 20) : null;
        $hasDefault = array_key_exists('ad_default', $input);
        $isDefault = $hasDefault && !empty($input['ad_default']) ? 1 : 0;

        $existing = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_address_table') . "
             WHERE mb_id = ?
               AND ad_name = ?
               AND ad_tel = ?
               AND ad_hp = ?
               AND ad_zip1 = ?
               AND ad_zip2 = ?
               AND ad_addr1 = ?
               AND ad_addr2 = ?
               AND ad_addr3 = ?
             LIMIT 1",
            [
                $mbId,
                $address['ad_name'],
                $address['ad_tel'],
                $address['ad_hp'],
                $address['ad_zip1'],
                $address['ad_zip2'],
                $address['ad_addr1'],
                $address['ad_addr2'],
                $address['ad_addr3'],
            ]
        );

        if ($hasDefault && $isDefault) {
            DB::execute(
                "UPDATE " . DB::table('g5_shop_order_address_table') . "
                 SET ad_default = 0
                 WHERE mb_id = ?",
                [$mbId]
            );
        }

        if ($existing) {
            $sets = ['ad_jibeon = ?'];
            $params = [$address['ad_jibeon']];
            if ($hasSubject) {
                $sets[] = 'ad_subject = ?';
                $params[] = $subject;
            }
            if ($hasDefault) {
                $sets[] = 'ad_default = ?';
                $params[] = $isDefault;
            }
            $params[] = $mbId;
            $params[] = (int) $existing['ad_id'];

            DB::execute(
                "UPDATE " . DB::table('g5_shop_order_address_table') . "
                 SET " . implode(', ', $sets) . "
                 WHERE mb_id = ? AND ad_id = ?",
                $params
            );
            $addressId = (int) $existing['ad_id'];
        } else {
            DB::execute(
                "INSERT INTO " . DB::table('g5_shop_order_address_table') . " SET
                    mb_id      = ?,
                    ad_subject = ?,
                    ad_default = ?,
                    ad_name    = ?,
                    ad_tel     = ?,
                    ad_hp      = ?,
                    ad_zip1    = ?,
                    ad_zip2    = ?,
                    ad_addr1   = ?,
                    ad_addr2   = ?,
                    ad_addr3   = ?,
                    ad_jibeon  = ?",
                [
                    $mbId,
                    $subject ?? '',
                    $hasDefault ? $isDefault : 0,
                    $address['ad_name'],
                    $address['ad_tel'],
                    $address['ad_hp'],
                    $address['ad_zip1'],
                    $address['ad_zip2'],
                    $address['ad_addr1'],
                    $address['ad_addr2'],
                    $address['ad_addr3'],
                    $address['ad_jibeon'],
                ]
            );
            $addressId = (int) DB::lastInsertId();
        }

        return DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_address_table') . "
             WHERE mb_id = ? AND ad_id = ? LIMIT 1",
            [$mbId, $addressId]
        ) ?: null;
    }
}

if (!function_exists('shop_api_cart_line_total')) {
    function shop_api_cart_line_total(array $row): int
    {
        $qty = max(0, (int) ($row['ct_qty'] ?? 0));
        $ioType = (int) ($row['io_type'] ?? 0);
        $ioPrice = (int) ($row['io_price'] ?? 0);
        $ctPrice = (int) ($row['ct_price'] ?? 0);

        if ($ioType === 1) {
            return max(0, $ioPrice) * $qty;
        }

        return max(0, $ctPrice + $ioPrice) * $qty;
    }
}

if (!function_exists('shop_api_cart_unit_price')) {
    function shop_api_cart_unit_price(array $row): int
    {
        $qty = max(1, (int) ($row['ct_qty'] ?? 1));
        return (int) floor(shop_api_cart_line_total($row) / $qty);
    }
}

if (!function_exists('shop_api_order_tax_amounts')) {
    function shop_api_order_tax_amounts(
        array $cartItems,
        int $sendCost,
        int $sendCost2,
        int $orderCoupon,
        int $sendCoupon,
        int $receiptPoint,
        int $receiptPrice,
        ?array $cfg = null
    ): array {
        $cfg = $cfg ?? shop_api_shop_default_config();
        $receiptPrice = max(0, $receiptPrice);

        if (empty($cfg['de_tax_flag_use'])) {
            $taxMny = (int) round($receiptPrice / 1.1);
            return [
                'od_tax_flag' => 0,
                'od_tax_mny' => $taxMny,
                'od_vat_mny' => $receiptPrice - $taxMny,
                'od_free_mny' => 0,
            ];
        }

        $taxableTotal = 0;
        $freeTotal = 0;
        foreach ($cartItems as $row) {
            $lineTotal = max(0, shop_api_cart_line_total($row) - (int) ($row['cp_price'] ?? 0));
            if ((int) ($row['ct_notax'] ?? 0) === 1) {
                $freeTotal += $lineTotal;
            } else {
                $taxableTotal += $lineTotal;
            }
        }

        $taxableTotal += $sendCost + $sendCost2 - $orderCoupon - $sendCoupon - $receiptPoint;
        if ($taxableTotal < 0) {
            $freeTotal += $taxableTotal;
            $taxableTotal = 0;
        }

        $taxMny = (int) round($taxableTotal / 1.1);
        return [
            'od_tax_flag' => 1,
            'od_tax_mny' => $taxMny,
            'od_vat_mny' => $taxableTotal - $taxMny,
            'od_free_mny' => $freeTotal,
        ];
    }
}

if (!function_exists('shop_api_debit_member_point')) {
    function shop_api_debit_member_point(
        string $mbId,
        int $point,
        string $content,
        string $relTable = '',
        string $relId = '',
        string $relAction = ''
    ): void {
        if ($point <= 0 || $mbId === '' || !function_exists('insert_point')) {
            return;
        }

        if ($relTable === '' && $relId === '' && $relAction === '' && preg_match('/\b(\d{12,})\b/', $content, $m)) {
            $relTable = '@order';
            $relId = (string) $m[1];
            $relAction = 'order_point';
        }

        $lockName = 'g5_shop_point_member_' . md5($mbId);
        $lock = DB::fetch('SELECT GET_LOCK(?, 5) AS got_lock', [$lockName]);
        if ((int) ($lock['got_lock'] ?? 0) !== 1) {
            throw new RuntimeException('포인트 처리 중입니다. 잠시 후 다시 시도해 주세요.');
        }

        try {
            $member = DB::fetch(
                "SELECT mb_point FROM " . DB::table('member_table') . "
                 WHERE mb_id = ? LIMIT 1",
                [$mbId]
            );
            if (!$member) {
                throw new RuntimeException('회원 정보를 찾을 수 없습니다.');
            }
            if ((int) ($member['mb_point'] ?? 0) < $point) {
                throw new RuntimeException('보유 포인트가 부족합니다.');
            }

            if ($relTable !== '' || $relId !== '' || $relAction !== '') {
                $exists = DB::count(
                    "SELECT COUNT(*) FROM " . DB::table('point_table') . "
                     WHERE mb_id = ?
                       AND po_rel_table = ?
                       AND po_rel_id = ?
                       AND po_rel_action = ?",
                    [$mbId, $relTable, $relId, $relAction]
                );
                if ($exists > 0) {
                    return;
                }
            }

            insert_point($mbId, -$point, $content, $relTable, $relId, $relAction);
        } finally {
            DB::fetch('SELECT RELEASE_LOCK(?) AS released', [$lockName]);
        }
    }
}

if (!function_exists('shop_api_shop_default_config')) {
    function shop_api_shop_default_config(): array
    {
        static $cfg = null;
        if ($cfg !== null) {
            return $cfg;
        }

        $row = DB::fetch("SELECT * FROM " . DB::table('g5_shop_default_table') . " LIMIT 1");
        $cfg = $row ?: [];
        return $cfg;
    }
}

if (!function_exists('shop_api_product_order_by')) {
    function shop_api_product_order_by($sort = null, $sortodr = null, string $prefix = ''): string
    {
        $prefix = preg_replace('/[^A-Za-z0-9_.]/', '', $prefix);
        $column = static function (string $name) use ($prefix): string {
            return $prefix . $name;
        };
        $defaultOrder = $column('it_order') . ' ASC, ' . $column('it_id') . ' DESC';

        $sort = strtolower(trim((string) $sort));
        $sortodr = strtolower(trim((string) $sortodr));
        $direction = in_array($sortodr, ['asc', 'desc'], true) ? strtoupper($sortodr) : '';

        $aliases = [
            ''           => ['', ''],
            'default'    => ['', ''],
            'latest'     => ['it_update_time', 'desc'],
            'recent'     => ['it_update_time', 'desc'],
            'popular'    => ['it_sum_qty', 'desc'],
            'sales'      => ['it_sum_qty', 'desc'],
            'price_asc'  => ['it_price', 'asc'],
            'price_desc' => ['it_price', 'desc'],
            'name'       => ['it_name', 'asc'],
            'rating'     => ['it_use_avg', 'desc'],
            'reviews'    => ['it_use_cnt', 'desc'],
        ];

        $legacyDefaults = [
            'it_name'        => 'asc',
            'it_sum_qty'     => 'desc',
            'it_price'       => 'asc',
            'it_use_avg'     => 'desc',
            'it_use_cnt'     => 'desc',
            'it_update_time' => 'desc',
        ];

        if (array_key_exists($sort, $aliases)) {
            [$field, $defaultDirection] = $aliases[$sort];
            if ($field === '') {
                return $defaultOrder;
            }

            $direction = $direction ?: strtoupper($defaultDirection);
            return $column($field) . ' ' . $direction . ', ' . $defaultOrder;
        }

        if (array_key_exists($sort, $legacyDefaults)) {
            $direction = $direction ?: strtoupper($legacyDefaults[$sort]);
            return $column($sort) . ' ' . $direction . ', ' . $defaultOrder;
        }

        return $defaultOrder;
    }
}

if (!function_exists('shop_api_member_is_shop_admin')) {
    function shop_api_member_is_shop_admin(?array $member): bool
    {
        return $member && !empty($member['mb_id']) && class_exists('Auth') && Auth::adminRole($member) === 'super';
    }
}

if (!function_exists('shop_api_category_cert_restriction')) {
    function shop_api_category_cert_restriction(string $caId, ?array $member): ?array
    {
        if ($caId === '' || shop_api_member_is_shop_admin($member)) {
            return null;
        }

        $category = DB::fetch(
            "SELECT ca_cert_use, ca_adult_use FROM " . DB::table('g5_shop_category_table') . "
             WHERE ca_id = ? LIMIT 1",
            [$caId]
        );
        if (!$category) {
            return null;
        }

        $isMember = $member && !empty($member['mb_id']);
        $isCertified = $isMember && !empty($member['mb_certify']);
        $isAdult = $isMember && (int) ($member['mb_adult'] ?? 0) === 1;
        $needsRefresh = $isCertified && strlen((string) ($member['mb_dupinfo'] ?? '')) === 64;

        if ((int) ($category['ca_cert_use'] ?? 0) === 1 && !$isCertified) {
            return [
                'type' => 'cert',
                'refresh_required' => $needsRefresh,
                'message' => $isMember
                    ? '회원정보 수정에서 본인확인 후 이용해 주십시오.'
                    : '본인확인된 로그인 회원만 이용할 수 있습니다.',
            ];
        }

        if ((int) ($category['ca_adult_use'] ?? 0) === 1 && !$isAdult) {
            return [
                'type' => 'adult',
                'refresh_required' => $needsRefresh,
                'message' => $isMember
                    ? '본인확인으로 성인인증된 회원만 이용할 수 있습니다. 회원정보 수정에서 본인확인을 해주십시오.'
                    : '본인확인으로 성인인증된 회원만 이용할 수 있습니다.',
            ];
        }

        return null;
    }
}

if (!function_exists('shop_api_cert_restriction')) {
    function shop_api_cert_restriction(string $id, string $type, ?array $member = null): ?array
    {
        if ($type === 'list') {
            return shop_api_category_cert_restriction($id, $member);
        }

        if ($type !== 'item') {
            return null;
        }

        $item = DB::fetch(
            "SELECT ca_id, ca_id2, ca_id3 FROM " . DB::table('g5_shop_item_table') . "
             WHERE it_id = ? LIMIT 1",
            [$id]
        );
        if (!$item) {
            return null;
        }

        foreach (['ca_id', 'ca_id2', 'ca_id3'] as $field) {
            $restriction = shop_api_category_cert_restriction((string) ($item[$field] ?? ''), $member);
            if ($restriction) {
                return $restriction;
            }
        }

        return null;
    }
}

if (!function_exists('shop_api_enforce_cert_access')) {
    function shop_api_enforce_cert_access(string $id, string $type, ?array $member = null): void
    {
        $restriction = shop_api_cert_restriction($id, $type, $member);
        if (!$restriction) {
            return;
        }

        Response::error($restriction['message'], 403, [
            'code' => 'shop_cert_required',
            'type' => $restriction['type'],
            'refresh_required' => !empty($restriction['refresh_required']),
        ]);
    }
}

require_once __DIR__ . '/common_product_list_helpers.php';
require_once __DIR__ . '/common_stock_helpers.php';
require_once __DIR__ . '/common_pricing_helpers.php';
require_once __DIR__ . '/common_session_helpers.php';
require_once __DIR__ . '/order_push_helpers.php'; // SC-07 주문 상태 푸시
require_once __DIR__ . '/stale_draft_helpers.php'; // SC-15 결제 초안 24시간 자동 취소
// SC-15: 크론이 없어 /shop/* 요청 끝에 얹어 10분에 한 번 돈다(락을 잡은 요청 하나만, 응답 뒤).
register_shutdown_function(static function () {
    shop_api_stale_draft_tick();
});
