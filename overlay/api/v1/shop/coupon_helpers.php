<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_coupon_download_release_lock')) {
    function shop_api_coupon_download_release_lock($lockKey)
    {
        if ($lockKey === '') {
            return;
        }

        try {
            DB::fetch('SELECT RELEASE_LOCK(?) AS released', [$lockKey]);
        } catch (Throwable $e) {
            // User-level lock cleanup must not hide the original API response.
        }
    }
}

if (!function_exists('shop_api_coupon_download_generate_id')) {
    function shop_api_coupon_download_generate_id($mb_id, $cz_id)
    {
        for ($j = 0; $j <= 20; $j++) {
            if (function_exists('get_coupon_id')) {
                $cp_id = get_coupon_id();
            } else {
                $cp_id = 'CZ' . (int) $cz_id . '_' . substr(md5($mb_id . microtime(true) . mt_rand()), 0, 8);
            }

            $exists = DB::count(
                "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_table') . "
                 WHERE cp_id = ?",
                [$cp_id]
            );
            if ($exists <= 0) {
                return $cp_id;
            }
        }

        return '';
    }
}

if (!function_exists('shop_api_coupon_today')) {
    function shop_api_coupon_today(): string
    {
        return defined('G5_TIME_YMD') ? G5_TIME_YMD : date('Y-m-d');
    }
}

if (!function_exists('shop_api_coupon_now')) {
    function shop_api_coupon_now(): string
    {
        return defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s');
    }
}

if (!function_exists('shop_api_coupon_zone_image_url')) {
    function shop_api_coupon_zone_image_url($file): string
    {
        $file = trim(str_replace('\\', '/', (string) $file), '/');
        if ($file === '' || strpos($file, '..') !== false) {
            return '';
        }

        $path = G5_DATA_PATH . '/coupon/' . $file;
        if (!is_file($path)) {
            return '';
        }

        $stamp = filemtime($path) ?: 0;
        return shop_api_image_url('coupon', $file) . ($stamp ? '?' . $stamp : '');
    }
}

if (!function_exists('shop_api_coupon_legacy_input')) {
    function shop_api_coupon_legacy_input(): array
    {
        $json = json_decode(file_get_contents('php://input'), true);
        if (is_array($json)) {
            return array_merge($_REQUEST, $json);
        }

        return $_REQUEST;
    }
}

if (!function_exists('shop_api_coupon_digits')) {
    function shop_api_coupon_digits($value): int
    {
        return (int) preg_replace('/[^0-9]/', '', (string) $value);
    }
}

if (!function_exists('shop_api_coupon_legacy_discount')) {
    function shop_api_coupon_legacy_discount(array $coupon, int $baseAmount, ?int $capAmount = null): int
    {
        $baseAmount = max(0, $baseAmount);
        $capAmount = $capAmount === null ? $baseAmount : max(0, $capAmount);
        if ($baseAmount <= 0 || $capAmount <= 0) {
            return 0;
        }

        if ((int) ($coupon['cp_type'] ?? 0) > 0) {
            $trunc = max(1, (int) ($coupon['cp_trunc'] ?? 1));
            $discount = (int) (floor(($baseAmount * ((int) ($coupon['cp_price'] ?? 0) / 100)) / $trunc) * $trunc);
        } else {
            $discount = (int) ($coupon['cp_price'] ?? 0);
        }

        $maximum = (int) ($coupon['cp_maximum'] ?? 0);
        if ($maximum > 0 && $discount > $maximum) {
            $discount = $maximum;
        }
        if ($discount > $capAmount) {
            $discount = $capAmount;
        }

        return max(0, $discount);
    }
}

if (!function_exists('shop_api_coupon_legacy_is_used')) {
    function shop_api_coupon_legacy_is_used(string $mbId, string $couponId): bool
    {
        if ($mbId === '' || $couponId === '') {
            return true;
        }

        $used = DB::count(
            "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_log_table') . "
             WHERE mb_id = ? AND cp_id = ?",
            [$mbId, $couponId]
        );

        return $used > 0;
    }
}

if (!function_exists('shop_api_coupon_legacy_row')) {
    function shop_api_coupon_legacy_row(array $coupon, int $discount): array
    {
        return [
            'cp_id' => (string) ($coupon['cp_id'] ?? ''),
            'cp_subject' => (string) ($coupon['cp_subject'] ?? ''),
            'discount' => max(0, $discount),
            'cp_method' => (int) ($coupon['cp_method'] ?? 0),
            'cp_type' => (int) ($coupon['cp_type'] ?? 0),
            'cp_price' => (int) ($coupon['cp_price'] ?? 0),
            'cp_minimum' => (int) ($coupon['cp_minimum'] ?? 0),
            'cp_maximum' => (int) ($coupon['cp_maximum'] ?? 0),
            'cp_trunc' => (int) ($coupon['cp_trunc'] ?? 0),
        ];
    }
}

if (!function_exists('shop_api_coupon_legacy_candidates')) {
    function shop_api_coupon_legacy_candidates(string $mbId, array $methods, int $minimumAmount): array
    {
        $methods = array_values(array_filter(array_map('intval', $methods), static fn($method) => $method >= 0));
        if (empty($methods)) {
            return [];
        }

        $publicOwner = shop_api_coupon_public_owner();
        $methodSql = implode(',', array_fill(0, count($methods), '?'));
        $params = array_merge($methods, [$mbId, '', $publicOwner, $minimumAmount]);

        return DB::fetchAll(
            "SELECT *
             FROM " . DB::table('g5_shop_coupon_table') . "
             WHERE cp_method IN ({$methodSql})
               AND (mb_id = ? OR mb_id = ? OR mb_id = ?)
               AND (YEAR(cp_start) = 0 OR cp_start <= CURDATE())
               AND (YEAR(cp_end) = 0 OR cp_end >= CURDATE())
               AND cp_minimum <= ?
             ORDER BY cp_datetime DESC",
            $params
        );
    }
}

if (!function_exists('shop_api_coupon_zone_target_summary')) {
    function shop_api_coupon_zone_target_summary(array $zone): array
    {
        $method = (int) ($zone['cp_method'] ?? 0);
        $target = (string) ($zone['cp_target'] ?? '');

        if ($method === 0) {
            $row = DB::fetch(
                "SELECT it_id, it_name FROM " . DB::table('g5_shop_item_table') . "
                 WHERE it_id = ? LIMIT 1",
                [$target]
            );
            $itemId = (string) ($row['it_id'] ?? $target);
            return [
                'target_label' => '개별상품할인',
                'target_name' => (string) ($row['it_name'] ?? $target),
                'target_href' => function_exists('shop_item_url') && $itemId !== '' ? shop_item_url($itemId) : '',
            ];
        }

        if ($method === 1) {
            $row = DB::fetch(
                "SELECT ca_id, ca_name FROM " . DB::table('g5_shop_category_table') . "
                 WHERE ca_id = ? LIMIT 1",
                [$target]
            );
            $categoryId = (string) ($row['ca_id'] ?? $target);
            return [
                'target_label' => '카테고리할인',
                'target_name' => (string) ($row['ca_name'] ?? $target),
                'target_href' => function_exists('shop_category_url') && $categoryId !== '' ? shop_category_url($categoryId) : '',
            ];
        }

        if ($method === 3) {
            return [
                'target_label' => '배송비할인',
                'target_name' => '배송비할인',
                'target_href' => '',
            ];
        }

        return [
            'target_label' => '주문금액할인',
            'target_name' => '주문금액할인',
            'target_href' => '',
        ];
    }
}
