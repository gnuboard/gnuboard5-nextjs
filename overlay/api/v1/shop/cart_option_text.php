<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_cart_option_text')) {
    /**
     * 장바구니 줄 이름(ct_option) — 영카트 cartupdate.php 가 담는 io_value 와 같은 글자.
     * 선택옵션 "색상:실버 / 높이:1단", 추가옵션 "항목:값", 옵션 없는 본품은 상품명.
     * 관리자 주문서 · 주문 조회 · 주문 메일 · 주문 인쇄(코어)가 이 글자를 그대로 보여 준다. 예전에는 io_id 원문
     * ("실버␞1단")을 넣어 구분 문자가 보이지 않게 붙어 나왔다. 손님이 보낸 글자가 아니라 상품 정보로 만든다.
     *
     * @param array $item it_name · it_option_subject 를 쓴다(없으면 상품 표에서 읽는다).
     */
    function shop_api_cart_option_text(array $item, string $ioId, int $ioType): string
    {
        if ($ioId === '') {
            return strip_tags((string) ($item['it_name'] ?? ''));
        }

        $values = explode(chr(30), $ioId);
        if ($ioType === 1) {
            $text = $values[0] . (isset($values[1]) && $values[1] !== '' ? ':' . $values[1] : '');
            return strip_tags($text);
        }

        $subjects = explode(',', (string) ($item['it_option_subject'] ?? ''));
        $parts = [];
        foreach ($values as $index => $value) {
            $subject = (string) ($subjects[$index] ?? '');
            $parts[] = $subject !== '' ? $subject . ':' . $value : $value;
        }
        return strip_tags(implode(' / ', $parts));
    }
}

if (!function_exists('shop_api_cart_option_text_for')) {
    /** 상품 행에 it_option_subject 가 없으면 읽어서 shop_api_cart_option_text() 를 부른다. */
    function shop_api_cart_option_text_for(array $item, string $itId, string $ioId, int $ioType): string
    {
        if ($ioId !== '' && $ioType === 0 && !array_key_exists('it_option_subject', $item)) {
            $row = DB::fetch(
                "SELECT it_name, it_option_subject FROM " . DB::table('g5_shop_item_table') . " WHERE it_id = ? LIMIT 1",
                [$itId]
            );
            $item = array_merge($item, $row ?: []);
        }
        return shop_api_cart_option_text($item, $ioId, $ioType);
    }
}
