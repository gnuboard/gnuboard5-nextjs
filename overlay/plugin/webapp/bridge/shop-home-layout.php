<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('g5_webapp_shop_home_layout')) {
    /**
     * 쇼핑 홈 첫 화면에 배너 줄 · 분류 줄이 생기는지 — array('banner' => bool, 'cats' => bool).
     * 쇼핑몰이 없거나 물어볼 수 없으면 null(화면은 지금처럼 브라우저 기억으로 고른다).
     *
     * 테마 브리지가 HTML 의 <html> 에 data-shop-banner · data-shop-cats 로 적어 둔다. 쇼핑 홈은 배너 · 분류 응답이
     * 오기 전에 그 자리를 잡아 두는데, 배너가 없는 사이트의 첫 방문에서는 잡아 둔 자리가 접히며 진열이 올라갔다
     * (CLS 0.34). 서버가 미리 알려 주면 첫 방문부터 맞는 자리로 그린다. 클라이언트 이동으로 쇼핑 홈에 들어와도
     * <html> 의 값은 남아 있으므로 모든 화면에 적는다.
     *
     * 조건은 API 와 같아야 한다 — 배너: api/v1/shop/banners.php 의 GET(위치 '메인', 기기 전체, 기간 안, 이미지 파일 있음),
     * 분류: api/v1/shop/categories.php 의 목록(사용하는 1단계 분류). 한쪽을 고치면 다른 쪽도 고친다.
     * 그누보드의 DB 연결(sql_query)을 쓴다 — 화면 요청마다 PDO 연결을 하나 더 열지 않으려고.
     */
    function g5_webapp_shop_home_layout()
    {
        static $layout = false;
        if ($layout === false) {
            $layout = g5_webapp_shop_home_layout_query();
        }

        return $layout;
    }

    /** g5_webapp_shop_home_layout 의 실제 조회(요청마다 한 번만 부르도록 위 함수가 기억한다). */
    function g5_webapp_shop_home_layout_query()
    {
        $layout = null;

        $banner_table = isset($GLOBALS['g5']['g5_shop_banner_table']) ? (string) $GLOBALS['g5']['g5_shop_banner_table'] : '';
        $category_table = isset($GLOBALS['g5']['g5_shop_category_table']) ? (string) $GLOBALS['g5']['g5_shop_category_table'] : '';
        if ($banner_table === '' || $category_table === '' || !function_exists('sql_query') || !defined('G5_DATA_PATH')) {
            return $layout;
        }

        try {
            $result = sql_query(
                " SELECT bn_id FROM {$banner_table}
                   WHERE bn_position = '메인'
                     AND bn_device IN ('pc', 'mobile', 'both', '')
                     AND NOW() BETWEEN bn_begin_time AND bn_end_time
                   ORDER BY bn_order ASC, bn_id DESC
                   LIMIT 20 ",
                false
            );
            if (!$result) {
                return $layout;
            }
            $has_banner = false;
            while ($row = sql_fetch_array($result)) {
                if (is_file(G5_DATA_PATH . '/banner/' . (int) $row['bn_id'])) {
                    $has_banner = true;
                    break;
                }
            }

            $category = sql_fetch(" SELECT ca_id FROM {$category_table} WHERE ca_use = '1' AND LENGTH(ca_id) <= 2 LIMIT 1 ", false);
            if ($category === false) {
                return $layout;
            }

            $layout = array('banner' => $has_banner, 'cats' => !empty($category['ca_id']));
        } catch (Throwable $e) {
            $layout = null;
        }

        return $layout;
    }
}

if (!function_exists('g5_webapp_inject_shop_home_layout')) {
    /**
     * HTML 의 <html> 에 쇼핑 홈 배치(data-shop-banner · data-shop-cats)를 적는다. 모르면 그대로 둔다.
     * 첫 페인트 전 스크립트(테마의 shop-layout-hint)는 이 값이 있으면 브라우저 기억보다 이것을 쓴다.
     * $layout 을 주지 않으면 g5_webapp_shop_home_layout() 으로 묻는다(시험에서는 직접 준다).
     */
    function g5_webapp_inject_shop_home_layout($html, $layout = false)
    {
        $html = (string) $html;
        if (!preg_match('/<html\b[^>]*>/i', $html, $tag) || stripos($tag[0], 'data-shop-banner') !== false) {
            return $html;
        }
        if ($layout === false) {
            $layout = g5_webapp_shop_home_layout();
        }
        if (!is_array($layout)) {
            return $html;
        }

        $attributes = ' data-shop-banner="' . ($layout['banner'] ? '1' : '0') . '"'
            . ' data-shop-cats="' . ($layout['cats'] ? '1' : '0') . '"';

        return (string) preg_replace('/<html\b/i', '<html' . $attributes, $html, 1);
    }
}
