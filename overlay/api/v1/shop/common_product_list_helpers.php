<?php
/**
 * 상품 목록 카드의 부가 정보(분류 이름 · 후기 · 선택옵션 유무 · 품절)를 한 페이지 분량으로 한꺼번에 센다.
 * api/v1/shop/common.php 가 불러 쓴다.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_product_list_extras')) {
    /**
     * 목록 카드가 쓰는 부가 정보를 한 페이지 분량으로 한꺼번에 가져온다: 분류 이름, 후기 건수·평균,
     * 필수 옵션(선택옵션) 유무. 상품마다 따로 묻지 않으려고(N+1) 페이지의 it_id·ca_id 묶음으로 세 번만 묻는다.
     * 필수 옵션 유무는 카드의 "담기" 단추가 바로 담을지(옵션 없음) 옵션 고르기 창을 열지 정하는 데 쓴다.
     * 상세(products/{it_id})가 내는 ca_name · review_count · review_avg 와 같은 뜻의 값이다 —
     * 테마 카드(브랜드 줄, "리뷰 N", 별점)가 목록과 상세에서 같은 필드를 읽게 하려는 것.
     *
     * @param array<int, array<string, mixed>> $rows it_id, ca_id 가 든 상품 행들
     * @return array{categories: array<string, string>, reviews: array<string, array{cnt: int, avg: float}>, options: array<string, bool>}
     */
    function shop_api_product_list_extras(array $rows)
    {
        $extras = array('categories' => array(), 'reviews' => array(), 'options' => array(), 'soldout' => array());
        if (!$rows) {
            return $extras;
        }

        $itemIds = array();
        $caIds   = array();
        foreach ($rows as $row) {
            if (!empty($row['it_id'])) {
                $itemIds[(string) $row['it_id']] = true;
            }
            if (!empty($row['ca_id'])) {
                $caIds[(string) $row['ca_id']] = true;
            }
        }

        if ($caIds) {
            $ids = array_keys($caIds);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            foreach (DB::fetchAll(
                "SELECT ca_id, ca_name FROM " . DB::table('g5_shop_category_table') . " WHERE ca_id IN ({$marks})",
                $ids
            ) as $cat) {
                $extras['categories'][(string) $cat['ca_id']] = (string) $cat['ca_name'];
            }
        }

        if ($itemIds) {
            $ids = array_keys($itemIds);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            foreach (DB::fetchAll(
                "SELECT it_id, COUNT(*) AS cnt, IFNULL(AVG(is_score), 0) AS avg_score
                   FROM " . DB::table('g5_shop_item_use_table') . "
                  WHERE it_id IN ({$marks})
                  GROUP BY it_id",
                $ids
            ) as $stat) {
                $extras['reviews'][(string) $stat['it_id']] = array(
                    'cnt' => (int) $stat['cnt'],
                    'avg' => round((float) $stat['avg_score'], 1),
                );
            }

            // 쓰는 중인 선택옵션(io_type 0)이 하나라도 있으면 옵션 없이는 담을 수 없다(장바구니 API 가 거부한다).
            // 추가옵션(io_type 1)만 있는 상품은 본품만 담을 수 있으므로 셈하지 않는다.
            // $baseOptions 는 선택옵션 줄이 하나라도 있는 상품마다 만든다 — 쓰는 줄이 없어도(모두 io_use 0) 원본 is_soldout() 은 품절로 본다.
            $baseOptions = array();
            foreach (DB::fetchAll(
                "SELECT it_id, io_id, io_stock_qty, io_use FROM " . DB::table('g5_shop_item_option_table') . "
                  WHERE it_id IN ({$marks}) AND io_type = 0",
                $ids
            ) as $opt) {
                $optItId = (string) $opt['it_id'];
                $baseOptions[$optItId] = $baseOptions[$optItId] ?? array();
                if ((int) $opt['io_use'] !== 1) {
                    continue;
                }
                $extras['options'][$optItId] = true;
                $baseOptions[$optItId][(string) $opt['io_id']] = (int) $opt['io_stock_qty'];
            }

            // 품절 — 그누보드 원본 is_soldout() 과 같은 규칙을 한 페이지 분량으로 한꺼번에 센다
            // (상품마다 is_soldout() 을 부르면 옵션 수만큼 쿼리가 늘어 목록 한 쪽에 수백 번이 된다).
            //   선택옵션 상품: 쓰는 중인 선택옵션이 모두 (옵션 재고 - 주문 대기) <= 0 이면 품절(쓰는 선택옵션이 없어도 품절)
            //   옵션 없는 상품: (상품 재고 - 주문 대기) <= 0 이면 품절
            // 주문 대기 = 재고에서 아직 빼지 않은 주문 · 입금 · 준비 줄(get_it_stock_qty · get_option_stock_qty 와 같다).
            $pending = array();
            foreach (DB::fetchAll(
                "SELECT it_id, io_id, io_type, SUM(ct_qty) AS qty FROM " . DB::table('g5_shop_cart_table') . "
                  WHERE it_id IN ({$marks}) AND ct_stock_use = 0 AND ct_status IN ('주문', '입금', '준비')
                  GROUP BY it_id, io_id, io_type",
                $ids
            ) as $row) {
                $pending[(string) $row['it_id']][(string) $row['io_id'] . '|' . (int) $row['io_type']] = (int) $row['qty'];
                if ((string) $row['io_id'] === '') {
                    // 옵션 없는 본품 줄 — get_it_stock_qty() 는 io_type 을 가리지 않고 io_id = '' 줄을 센다
                    $pending[(string) $row['it_id']]['item'] = ($pending[(string) $row['it_id']]['item'] ?? 0) + (int) $row['qty'];
                }
            }
            foreach ($rows as $row) {
                $itId = (string) ($row['it_id'] ?? '');
                if ($itId === '') {
                    continue;
                }
                if ((int) ($row['it_soldout'] ?? 0) === 1) {
                    $extras['soldout'][$itId] = true;
                    continue;
                }
                if (isset($baseOptions[$itId])) {
                    $anyInStock = false;
                    foreach ($baseOptions[$itId] as $ioId => $stock) {
                        if ($stock - ($pending[$itId][$ioId . '|0'] ?? 0) > 0) {
                            $anyInStock = true;
                            break;
                        }
                    }
                    $extras['soldout'][$itId] = !$anyInStock;
                } else {
                    $extras['soldout'][$itId] = (int) ($row['it_stock_qty'] ?? 0) - ($pending[$itId]['item'] ?? 0) <= 0;
                }
            }
        }

        return $extras;
    }
}
