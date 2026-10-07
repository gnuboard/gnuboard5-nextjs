<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 희망배송일 — 영카트 orderform.sub.php · orderformupdate.php 와 같다.
 *   관리자 "희망배송일사용"(de_hope_date_use)이 켜져 있을 때만 받고, 그때는 반드시 고른다.
 *   고를 수 있는 날은 "희망배송일지정"(de_hope_date_after)일 뒤부터 7일(원본 datepicker 의 minDate · maxDate).
 */

if (!function_exists('shop_api_hope_date_range')) {
    /** @return array{use: bool, after: int, min: string, max: string} 날짜는 서버 시각(Y-m-d) 기준 */
    function shop_api_hope_date_range(array $cfg, ?int $now = null): array
    {
        $now = $now ?? time();
        $after = max(0, (int) ($cfg['de_hope_date_after'] ?? 0));
        return [
            'use' => (int) ($cfg['de_hope_date_use'] ?? 0) === 1,
            'after' => $after,
            'min' => date('Y-m-d', $now + 86400 * $after),
            'max' => date('Y-m-d', $now + 86400 * ($after + 6)),
        ];
    }
}

if (!function_exists('shop_api_order_hope_date_problem')) {
    /** 받은 값이 규칙에 맞지 않으면 안내 문구, 맞으면 null. 쓰지 않는 쇼핑몰은 언제나 null(받은 값은 버린다). */
    function shop_api_order_hope_date_problem(array $range, string $value): ?string
    {
        if (!$range['use']) {
            return null;
        }
        if ($value === '') {
            return '희망배송일을 선택하여 주십시오.';
        }
        $parts = explode('-', $value);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) || !checkdate((int) $parts[1], (int) $parts[2], (int) $parts[0])) {
            return '희망배송일이 올바르지 않습니다.';
        }
        if ($value < $range['min'] || $value > $range['max']) {
            return '희망배송일은 ' . $range['min'] . ' 부터 ' . $range['max'] . ' 사이에서 선택해 주십시오.';
        }
        return null;
    }
}

if (!function_exists('shop_api_order_hope_date')) {
    /**
     * 주문에 넣을 희망배송일. 규칙에 맞지 않으면 400(HOPE_DATE)으로 멈춘다.
     * 쓰지 않는 쇼핑몰은 예전처럼 오늘 날짜를 넣는다(엄격 모드 MySQL 의 0 날짜를 피한다) — 원본 관리자 화면은
     * 희망배송일을 쓰지 않으면 이 값을 보여 주지 않는다.
     */
    function shop_api_order_hope_date(array $input, ?array $cfg = null): string
    {
        $range = shop_api_hope_date_range($cfg ?? shop_api_shop_default_config());
        $value = trim((string) ($input['od_hope_date'] ?? ''));
        $problem = shop_api_order_hope_date_problem($range, $value);
        if ($problem !== null) {
            Response::error($problem, 400, ['code' => 'HOPE_DATE']);
        }
        return $range['use'] ? $value : date('Y-m-d');
    }
}
