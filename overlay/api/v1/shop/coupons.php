<?php
/**
 * Gnuboard5 REST API - Shop Coupons
 *
 *   GET  /v1/shop/coupons/mine                    — 주문/배송 쿠폰 목록
 *   GET  /v1/shop/coupons/applicable              — 장바구니 행별 상품/카테고리 쿠폰 목록
 *   POST /v1/shop/coupons/apply-to-cart           — 장바구니 행별 상품/카테고리 쿠폰 적용
 *   POST /v1/shop/coupons/validate {cp_id,amount} — 주문 쿠폰 단건 검증
 *
 * /mine은 주문서 드롭다운용이라 주문/배송 쿠폰만 반환한다. 상품/카테고리 쿠폰은
 * cp_price가 cart 행 단위로 계산되므로 /applicable, /apply-to-cart 경로에서 처리한다.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/coupon_markers.php';
require_once __DIR__ . '/coupon_helpers.php';

$action = isset($shopSegments[0]) ? $shopSegments[0] : '';

// =========================================================================
// GET /v1/shop/coupons  — /mypage/coupons 가 사용. 만료/사용완료 포함 전체 목록.
//   couponSchema 와 호환: cp_id / cp_subject / cp_method (문자열) / cp_price /
//   cp_start / cp_end / cp_minimum / cp_used (사용 시 datetime, 미사용 시 빈문자열).
// =========================================================================
if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'legacy-order') {
    $member = Auth::requireAuth();
    $mb_id = $member['mb_id'];
    $input = shop_api_coupon_legacy_input();
    $price = shop_api_coupon_digits($input['price'] ?? 0);

    if ($price <= 0) {
        Response::success([
            'base_amount' => $price,
            'coupons' => [],
            'message' => 'Product amount is zero, so coupons cannot be used.',
        ]);
    }

    $coupons = [];
    foreach (shop_api_coupon_legacy_candidates($mb_id, [2], $price) as $coupon) {
        $couponId = (string) ($coupon['cp_id'] ?? '');
        if (shop_api_coupon_legacy_is_used($mb_id, $couponId)) {
            continue;
        }

        $discount = shop_api_coupon_legacy_discount($coupon, $price);
        if ($discount <= 0) {
            continue;
        }

        $coupons[] = shop_api_coupon_legacy_row($coupon, $discount);
    }

    Response::success([
        'base_amount' => $price,
        'coupons' => $coupons,
        'message' => empty($coupons) ? 'No available coupons.' : '',
    ]);
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'legacy-sendcost') {
    $member = Auth::requireAuth();
    $mb_id = $member['mb_id'];
    $input = shop_api_coupon_legacy_input();
    $price = shop_api_coupon_digits($input['price'] ?? 0);
    $sendCost = shop_api_coupon_digits($input['send_cost'] ?? $input['sendCost'] ?? 0);

    $coupons = [];
    if ($price > 0 && $sendCost > 0) {
        foreach (shop_api_coupon_legacy_candidates($mb_id, [3], $price) as $coupon) {
            $couponId = (string) ($coupon['cp_id'] ?? '');
            if (shop_api_coupon_legacy_is_used($mb_id, $couponId)) {
                continue;
            }

            $discount = shop_api_coupon_legacy_discount($coupon, $sendCost, $sendCost);
            if ($discount <= 0) {
                continue;
            }

            $coupons[] = shop_api_coupon_legacy_row($coupon, $discount);
        }
    }

    Response::success([
        'base_amount' => $price,
        'send_cost' => $sendCost,
        'coupons' => $coupons,
        'message' => empty($coupons) ? 'No available coupons.' : '',
    ]);
}

if (($apiMethod === 'GET' || $apiMethod === 'POST') && $action === 'legacy-item') {
    $member = Auth::requireAuth();
    $mb_id = $member['mb_id'];
    $input = shop_api_coupon_legacy_input();
    $it_id = preg_replace('#[/\'"%=*\#()\|+&!$~{}\[\]`;:\?\^,]#', '', (string) ($input['it_id'] ?? ''));
    $direct = shop_api_truthy($input['sw_direct'] ?? $input['direct'] ?? null);

    if ($it_id === '') {
        Response::success([
            'it_id' => '',
            'base_amount' => 0,
            'coupons' => [],
            'message' => 'Product ID is required.',
        ]);
    }

    $item = DB::fetch(
        "SELECT it_id, ca_id, ca_id2, ca_id3
         FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ?
         LIMIT 1",
        [$it_id]
    );
    if (!$item) {
        Response::success([
            'it_id' => $it_id,
            'base_amount' => 0,
            'coupons' => [],
            'message' => 'Product not found.',
        ]);
    }

    $cart_id = shop_api_cart_id($member);
    $cart = DB::fetch(
        "SELECT IFNULL(SUM(IF(io_type = 1, io_price * ct_qty, (ct_price + io_price) * ct_qty)), 0) AS sum_price
         FROM " . DB::table('g5_shop_cart_table') . "
         WHERE od_id = ?
           AND it_id = ?
           AND ct_direct = ?
           AND " . shop_api_cart_active_status_sql(),
        array_merge([$cart_id, $it_id, $direct ? 1 : 0], shop_api_cart_active_statuses())
    );
    $itemPrice = (int) ($cart['sum_price'] ?? 0);

    $coupons = [];
    if ($itemPrice > 0) {
        foreach (shop_api_coupon_legacy_candidates($mb_id, [0, 1], $itemPrice) as $coupon) {
            $method = (int) ($coupon['cp_method'] ?? -1);
            $target = (string) ($coupon['cp_target'] ?? '');
            $matches = $method === 0
                ? $target === (string) $item['it_id']
                : in_array($target, array_filter([
                    (string) ($item['ca_id'] ?? ''),
                    (string) ($item['ca_id2'] ?? ''),
                    (string) ($item['ca_id3'] ?? ''),
                ]), true);

            if (!$matches) {
                continue;
            }

            $couponId = (string) ($coupon['cp_id'] ?? '');
            if (shop_api_coupon_legacy_is_used($mb_id, $couponId)) {
                continue;
            }

            $discount = shop_api_coupon_legacy_discount($coupon, $itemPrice);
            if ($discount <= 0) {
                continue;
            }

            $coupons[] = shop_api_coupon_legacy_row($coupon, $discount);
        }
    }

    Response::success([
        'it_id' => $it_id,
        'direct' => $direct,
        'base_amount' => $itemPrice,
        'coupons' => $coupons,
        'message' => empty($coupons) ? 'No available coupons.' : '',
    ]);
}

if ($apiMethod === 'GET' && $action === '') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];
    $publicOwner = shop_api_coupon_public_owner();

    $rows = DB::fetchAll(
        "SELECT cp_id, cp_subject, cp_method, cp_price, cp_type,
                cp_start, cp_end, cp_minimum, cp_maximum, cp_trunc, cp_datetime
         FROM " . DB::table('g5_shop_coupon_table') . "
         WHERE (mb_id = ? OR mb_id = '' OR mb_id = ?)
         ORDER BY cp_datetime DESC
         LIMIT 200",
        [$mb_id, $publicOwner]
    );

    // 사용 시점 — coupon_log 와 LEFT JOIN 안 하고 별도 조회해 PHP 에서 매핑
    // (mb_id='' 인 전체 공개 쿠폰도 본인 사용여부만 표시).
    $usedRows = DB::fetchAll(
        "SELECT cp_id, cl_datetime FROM " . DB::table('g5_shop_coupon_log_table') . "
         WHERE mb_id = ?",
        [$mb_id]
    );
    $usedMap = [];
    foreach ($usedRows as $u) {
        $usedMap[$u['cp_id']] = $u['cl_datetime'];
    }

    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'cp_id'      => (string) $r['cp_id'],
            'cp_subject' => $r['cp_subject'],
            'cp_method'  => (string) $r['cp_method'], // 스키마는 string 기대
            'cp_price'   => (int) $r['cp_price'],
            'cp_start'   => $r['cp_start'],
            'cp_end'     => $r['cp_end'],
            'cp_minimum' => (int) $r['cp_minimum'],
            'cp_used'    => $usedMap[$r['cp_id']] ?? '',
        ];
    }

    Response::success($out);
}

// =========================================================================
// GET /v1/shop/coupons/mine
// =========================================================================
if ($apiMethod === 'GET' && $action === 'mine') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];
    $publicOwner = shop_api_coupon_public_owner();

    // 본인에게 발급된 쿠폰 또는 전체 공개 쿠폰(mb_id='') 중 주문/배송비 쿠폰.
    // cp_start/cp_end='0000-00-00' (무기한) 또는 오늘 사용 가능.
    // MySQL strict 모드에서 '0000-00-00'
    // 리터럴을 비교에 쓰면 거부되므로 YEAR()=0 으로 검사.
    $rows = DB::fetchAll(
        "SELECT cp_id, cp_subject, cp_method, cp_target, mb_id,
                cp_start, cp_end, cp_price, cp_type, cp_trunc,
                cp_minimum, cp_maximum, cp_datetime
         FROM " . DB::table('g5_shop_coupon_table') . "
         WHERE cp_method IN (2, 3)
           AND (mb_id = ? OR mb_id = '' OR mb_id = ?)
           AND (YEAR(cp_start) = 0 OR cp_start <= CURDATE())
           AND (YEAR(cp_end) = 0 OR cp_end >= CURDATE())
         ORDER BY cp_datetime DESC
         LIMIT 100",
        [$mb_id, $publicOwner]
    );

    // 이미 사용한 쿠폰 ID 집합.
    $usedRows = DB::fetchAll(
        "SELECT cp_id FROM " . DB::table('g5_shop_coupon_log_table') . "
         WHERE mb_id = ?",
        [$mb_id]
    );
    $usedSet = [];
    foreach ($usedRows as $u) {
        $usedSet[$u['cp_id']] = true;
    }

    $coupons = [];
    foreach ($rows as $r) {
        if (isset($usedSet[$r['cp_id']])) {
            continue; // 사용 완료 쿠폰은 보유 목록에서 제외.
        }
        $coupons[] = [
            'cp_id'      => (string) $r['cp_id'],
            'cp_subject' => $r['cp_subject'],
            'cp_method'  => (int) $r['cp_method'],
            'cp_type'    => (int) $r['cp_type'],
            'cp_price'   => (int) $r['cp_price'],
            'cp_minimum' => (int) $r['cp_minimum'],
            'cp_maximum' => (int) $r['cp_maximum'],
            'cp_trunc'   => (int) $r['cp_trunc'],
            'cp_start'   => $r['cp_start'],
            'cp_end'     => $r['cp_end'],
        ];
    }

    Response::success($coupons);
}

// =========================================================================
// POST /v1/shop/coupons/validate  { cp_id, amount }
//   주문 합계가 주어졌을 때 단건 쿠폰 적용 가능 여부 + 할인액 계산.
//   주문 흐름의 '쿠폰 적용 미리보기' 용 — 실 사용 기록은 confirm 시점에.
// =========================================================================
if ($apiMethod === 'POST' && $action === 'validate') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];

    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $cp_id  = isset($input['cp_id']) ? trim((string) $input['cp_id']) : '';
    $amount = (int) ($input['amount'] ?? 0);
    if ($cp_id === '' || $amount <= 0) {
        Response::error('cp_id, amount required.', 422);
    }

    $coupon = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_coupon_table') . "
         WHERE cp_id = ? LIMIT 1",
        [$cp_id]
    );
    if (!$coupon) {
        Response::error('쿠폰을 찾을 수 없습니다.', 404);
    }

    $res = shop_api_coupon_evaluate($coupon, $amount, $mb_id);
    if (!$res['ok']) {
        Response::error($res['reason'] ?? '사용 불가 쿠폰', 400);
    }

    Response::success([
        'cp_id'    => $cp_id,
        'discount' => $res['discount'],
    ]);
}

// =========================================================================
// GET /v1/shop/coupons/zone — 다운로드 가능한 쿠폰존 목록.
//   cz_start ~ cz_end 사이 + cz_type=0(쿠폰존 노출) 만. 이미 받은 cz_id 는
//   downloaded=true 로 표시. 로그인 안 해도 목록 자체는 볼 수 있게.
// =========================================================================
if ($apiMethod === 'GET' && $action === 'zone') {
    $member = Auth::getUser();
    $mb_id  = $member ? $member['mb_id'] : '';
    $today = shop_api_coupon_today();

    $zones = DB::fetchAll(
        "SELECT cz_id, cz_type, cz_point, cz_subject, cz_start, cz_end, cz_file, cz_period,
                cp_method, cp_target, cp_price, cp_type, cp_trunc,
                cp_minimum, cp_maximum, cz_download, cz_datetime
         FROM " . DB::table('g5_shop_coupon_zone_table') . "
         WHERE cz_start <= ?
           AND cz_end >= ?
         ORDER BY cz_id DESC
         LIMIT 100",
        [$today, $today]
    );

    $downloadedSet = [];
    if ($mb_id !== '') {
        $dl = DB::fetchAll(
            "SELECT cz_id FROM " . DB::table('g5_shop_coupon_table') . "
             WHERE mb_id = ? AND cz_id > 0",
            [$mb_id]
        );
        foreach ($dl as $r) {
            $downloadedSet[(int) $r['cz_id']] = true;
        }
    }

    $out = [];
    foreach ($zones as $z) {
        $imageUrl = shop_api_coupon_zone_image_url($z['cz_file'] ?? '');
        $target = shop_api_coupon_zone_target_summary($z);
        $out[] = [
            'cz_id'      => (int) $z['cz_id'],
            'cz_type'    => (int) $z['cz_type'],
            'cz_point'   => (int) $z['cz_point'],
            'cz_subject' => $z['cz_subject'],
            'cz_start'   => $z['cz_start'],
            'cz_end'     => $z['cz_end'],
            'cz_file'    => $z['cz_file'] ?? '',
            'cz_period'  => (int) $z['cz_period'],
            'cz_download' => (int) ($z['cz_download'] ?? 0),
            'cp_method'  => (int) $z['cp_method'],
            'cp_target'  => $z['cp_target'] ?? '',
            'cp_type'    => (int) $z['cp_type'],
            'cp_price'   => (int) $z['cp_price'],
            'cp_minimum' => (int) $z['cp_minimum'],
            'cp_maximum' => (int) $z['cp_maximum'],
            'cp_trunc'   => (int) $z['cp_trunc'],
            'image_url'  => $imageUrl,
            'target_label' => $target['target_label'],
            'target_name' => $target['target_name'],
            'target_href' => $target['target_href'],
            'downloaded' => !empty($downloadedSet[(int) $z['cz_id']]),
        ];
    }

    Response::success($out);
}

// =========================================================================
// POST /v1/shop/coupons/download  { cz_id }
//   쿠폰존 1건을 본인 명의로 발급 (g5_shop_coupon 에 INSERT).
//   유효기간: cz_period 일 (없으면 cz_end). 동일 cz_id 중복 다운로드 금지.
// =========================================================================
if ($apiMethod === 'POST' && $action === 'download') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];

    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $cz_id = (int) ($input['cz_id'] ?? 0);
    if ($cz_id <= 0) {
        Response::error('cz_id required.', 422);
    }

    $zone = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_coupon_zone_table') . "
         WHERE cz_id = ? LIMIT 1",
        [$cz_id]
    );
    if (!$zone) {
        Response::error('쿠폰존을 찾을 수 없습니다.', 404);
    }

    $today = shop_api_coupon_today();
    if (!empty($zone['cz_end']) && $zone['cz_end'] !== '0000-00-00' && $today > $zone['cz_end']) {
        Response::error('다운로드 기간이 만료되었습니다.', 400);
    }
    if (!empty($zone['cz_start']) && $zone['cz_start'] !== '0000-00-00' && $today < $zone['cz_start']) {
        Response::error('다운로드 시작 전입니다.', 400);
    }

    // 영카트 원본 ajax.coupondownload.php 처럼 동시 다운로드를 MySQL lock으로 막는다.
    $lockKey = 'g5_coupon_dl_' . $cz_id . '_' . $mb_id;
    $lockRow = DB::fetch('SELECT GET_LOCK(?, 5) AS lk', [$lockKey]);
    if (empty($lockRow['lk'])) {
        Response::error('잠시 후 다시 시도해 주십시오.', 409);
    }

    // 중복 다운로드 방지. Lock 이후 다시 확인해야 동시 요청에 안전하다.
    $exists = DB::count(
        "SELECT COUNT(*) FROM " . DB::table('g5_shop_coupon_table') . "
         WHERE mb_id = ? AND cz_id = ?",
        [$mb_id, $cz_id]
    );
    if ($exists > 0) {
        shop_api_coupon_download_release_lock($lockKey);
        Response::error('이미 다운로드하신 쿠폰입니다.', 400);
    }

    $pointCost = !empty($zone['cz_type']) ? (int) $zone['cz_point'] : 0;
    if ($pointCost > 0) {
        $pointRow = DB::fetch(
            "SELECT mb_point FROM " . DB::table('member_table') . "
             WHERE mb_id = ? LIMIT 1",
            [$mb_id]
        );
        $memberPoint = $pointRow ? (int) $pointRow['mb_point'] : (int) ($member['mb_point'] ?? 0);
        if (($memberPoint - $pointCost) < 0) {
            shop_api_coupon_download_release_lock($lockKey);
            Response::error('보유하신 포인트가 부족하여 쿠폰을 다운로드할 수 없습니다.', 400);
        }

        if (!function_exists('insert_point')) {
            shop_api_coupon_download_release_lock($lockKey);
            Response::error('포인트 처리 함수를 찾을 수 없습니다.', 500);
        }
    }

    $cp_id = shop_api_coupon_download_generate_id($mb_id, $cz_id);
    if ($cp_id === '') {
        shop_api_coupon_download_release_lock($lockKey);
        Response::error('Coupon ID Error', 500);
    }

    // 영카트 원본처럼 받은 날부터 cz_period 일 동안 유효하게 계산한다.
    $cp_start = $today;
    $period = (int) $zone['cz_period'] - 1;
    if ($period < 0) {
        $period = 0;
    }
    $serverTime = defined('G5_SERVER_TIME') ? (int) G5_SERVER_TIME : time();
    $cp_end = date('Y-m-d', strtotime('+' . $period . ' days', $serverTime));

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_coupon_table') . "
         SET cp_id = ?, cp_subject = ?, cp_method = ?, cp_target = ?, mb_id = ?,
             cz_id = ?, cp_start = ?, cp_end = ?, cp_price = ?, cp_type = ?,
             cp_trunc = ?, cp_minimum = ?, cp_maximum = ?, od_id = 0, cp_datetime = ?",
        [
            $cp_id, $zone['cz_subject'], (int) $zone['cp_method'], $zone['cp_target'], $mb_id,
            $cz_id, $cp_start, $cp_end, (int) $zone['cp_price'], (int) $zone['cp_type'],
            (int) $zone['cp_trunc'], (int) $zone['cp_minimum'], (int) $zone['cp_maximum'],
            shop_api_coupon_now(),
        ]
    );

    if ($pointCost > 0) {
        insert_point($mb_id, (-1) * $pointCost, "쿠폰 $cp_id 발급");
    }

    // 다운로드 카운트 증가 — 운영 통계용.
    DB::execute(
        "UPDATE " . DB::table('g5_shop_coupon_zone_table') . "
         SET cz_download = cz_download + 1
         WHERE cz_id = ?",
        [$cz_id]
    );

    shop_api_coupon_download_release_lock($lockKey);

    Response::success([
        'cp_id'      => $cp_id,
        'cz_id'      => $cz_id,
        'cp_end'     => $cp_end,
        'cz_type'    => (int) $zone['cz_type'],
        'cz_point'   => (int) $zone['cz_point'],
        'point_cost' => $pointCost,
        'subject'    => $zone['cz_subject'],
    ], 201);
}

// =========================================================================
// GET /v1/shop/coupons/applicable?ct_id=N
//   특정 카트 행에 적용 가능한 상품/카테고리 쿠폰 목록 + 각각의 할인 시뮬레이션.
//   /shop/cart UI 에서 행별로 쿠폰 드롭다운 채우는 용도.
// =========================================================================
if ($apiMethod === 'GET' && $action === 'applicable') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];
    $publicOwner = shop_api_coupon_public_owner();

    $ct_id = (int) ($_GET['ct_id'] ?? 0);
    if ($ct_id <= 0) Response::error('ct_id required.', 422);

    // 카트 행 + 카테고리 — 행이 본인 활성 카트 소속인지 확인.
    $cart_id = shop_api_cart_id($member);
    $cart = DB::fetch(
        "SELECT c.ct_id, c.it_id, c.ct_price, c.ct_qty, c.io_type, c.io_price,
                i.ca_id, i.ca_id2, i.ca_id3
         FROM " . DB::table('g5_shop_cart_table') . " c
         JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = c.it_id
         WHERE c.ct_id = ? AND c.od_id = ?
         LIMIT 1",
        [$ct_id, $cart_id]
    );
    if (!$cart) Response::error('카트 행을 찾을 수 없습니다.', 404);

    $itemCats = [
        'ca_id'  => $cart['ca_id'],
        'ca_id2' => $cart['ca_id2'],
        'ca_id3' => $cart['ca_id3'],
    ];

    // 본인 + 공개 쿠폰 중 상품/카테고리 쿠폰 후보.
    $candidates = DB::fetchAll(
        "SELECT * FROM " . DB::table('g5_shop_coupon_table') . "
         WHERE cp_method IN (0, 1)
           AND (mb_id = ? OR mb_id = '' OR mb_id = ?)
           AND (YEAR(cp_start) = 0 OR cp_start <= CURDATE())
           AND (YEAR(cp_end) = 0 OR cp_end >= CURDATE())
         ORDER BY cp_datetime DESC
         LIMIT 200",
        [$mb_id, $publicOwner]
    );

    $out = [];
    foreach ($candidates as $cp) {
        $res = shop_api_item_coupon_evaluate($cp, $cart, $itemCats, $mb_id);
        if (!$res['ok']) continue;
        $out[] = [
            'cp_id'      => (string) $cp['cp_id'],
            'cp_subject' => $cp['cp_subject'],
            'cp_method'  => (int) $cp['cp_method'],
            'cp_type'    => (int) $cp['cp_type'],
            'cp_price'   => (int) $cp['cp_price'],
            'cp_minimum' => (int) $cp['cp_minimum'],
            'cp_maximum' => (int) $cp['cp_maximum'],
            'cp_trunc'   => (int) $cp['cp_trunc'],
            'cp_end'     => $cp['cp_end'],
            'discount'   => (int) $res['discount'],
        ];
    }

    Response::success($out);
}

// =========================================================================
// POST /v1/shop/coupons/apply-to-cart  { ct_id, cp_id }
//   카트 행에 상품/카테고리 쿠폰 적용 — cart.cp_price 에 할인액 기록.
//   cp_id 가 빈 문자열이면 해제.
// =========================================================================
if ($apiMethod === 'POST' && $action === 'apply-to-cart') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];

    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $ct_id = (int) ($input['ct_id'] ?? 0);
    $cp_id = isset($input['cp_id']) ? (string) $input['cp_id'] : '';
    if ($ct_id <= 0) Response::error('ct_id required.', 422);

    $cart_id = shop_api_cart_id($member);
    $cart = DB::fetch(
        "SELECT c.ct_id, c.it_id, c.ct_price, c.ct_qty, c.io_type, c.io_price, c.ct_history,
                i.ca_id, i.ca_id2, i.ca_id3
         FROM " . DB::table('g5_shop_cart_table') . " c
         JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = c.it_id
         WHERE c.ct_id = ? AND c.od_id = ?
         LIMIT 1",
        [$ct_id, $cart_id]
    );
    if (!$cart) Response::error('카트 행을 찾을 수 없습니다.', 404);

    // 빈 cp_id → 해제.
    if ($cp_id === '') {
        DB::execute(
            "UPDATE " . DB::table('g5_shop_cart_table') . "
             SET cp_price = 0, ct_history = ''
             WHERE ct_id = ?",
            [$ct_id]
        );
        Response::success(['ct_id' => $ct_id, 'cleared' => true, 'cart_id' => (string) $cart_id]);
    }

    $coupon = DB::fetch(
        "SELECT * FROM " . DB::table('g5_shop_coupon_table') . "
         WHERE cp_id = ? LIMIT 1",
        [$cp_id]
    );
    if (!$coupon) Response::error('쿠폰을 찾을 수 없습니다.', 404);

    $itemCats = [
        'ca_id'  => $cart['ca_id'],
        'ca_id2' => $cart['ca_id2'],
        'ca_id3' => $cart['ca_id3'],
    ];
    $res = shop_api_item_coupon_evaluate($coupon, $cart, $itemCats, $mb_id);
    if (!$res['ok']) Response::error($res['reason'] ?? '사용 불가 쿠폰', 400);

    // 동일 카트 행에 이미 다른 쿠폰이 묶여있으면 덮어쓰기. ct_history 에 쿠폰 마커 저장.
    DB::execute(
        "UPDATE " . DB::table('g5_shop_cart_table') . "
         SET cp_price = ?, ct_history = ?
         WHERE ct_id = ?",
        [(int) $res['discount'], shop_api_coupon_marker_value($cp_id), $ct_id]
    );

    Response::success([
        'ct_id'    => $ct_id,
        'cp_id'    => $cp_id,
        'discount' => (int) $res['discount'],
        'cart_id'  => (string) $cart_id,
    ]);
}

Response::error('Method not allowed.', 405);
