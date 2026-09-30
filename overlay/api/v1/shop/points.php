<?php
/**
 * Gnuboard5 REST API - Shop Points
 *
 *   GET /v1/shop/points/summary — 보유 포인트 잔액 + 최근 적립/사용 내역 일부
 *
 * 그누보드5 표준 함수 사용:
 *   - get_point_sum($mb_id)   잔액
 *   - insert_point()          적립/사용 기록 (양수=적립, 음수=차감)
 *   - g5_point_table          내역 테이블
 *
 * Phase 1 한정 — 적립 흐름(주문 완료 시 자동 적립)은 confirm 단계에서 별도로
 * 처리하고, 이 파일은 read-only 조회만 제공.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$action = isset($shopSegments[0]) ? $shopSegments[0] : '';

if ($apiMethod === 'GET' && $action === 'summary') {
    $member = Auth::requireAuth();
    $mb_id  = $member['mb_id'];

    // 보유 포인트 — get_point_sum 이 만료/사용 반영된 정확한 잔액 계산.
    $balance = function_exists('get_point_sum')
        ? (int) get_point_sum($mb_id)
        : (int) ($member['mb_point'] ?? 0);

    // 최근 내역 20건 — 적립/사용 표시.
    $rows = DB::fetchAll(
        "SELECT po_datetime, po_content, po_point, po_use_point, po_expired
         FROM " . DB::table('point_table') . "
         WHERE mb_id = ?
         ORDER BY po_id DESC
         LIMIT 20",
        [$mb_id]
    );

    $history = [];
    foreach ($rows as $r) {
        $history[] = [
            'datetime' => $r['po_datetime'],
            'content'  => $r['po_content'],
            'point'    => (int) $r['po_point'],
            'used'     => (int) $r['po_use_point'],
            'expired'  => (int) $r['po_expired'],
        ];
    }

    Response::success([
        'balance' => $balance,
        'history' => $history,
    ]);
}

Response::error('Method not allowed.', 405);
