<?php
/**
 * 1:1 문의 찾기 — 질문 한 건 · 답할 원래 질문 · 관련 질문 · 이전글/다음글. 최고관리자가 아니면 자기 질문 안에서만 찾는다.
 * api/v1/qas.php 가 불러 쓴다(api_qa_is_admin · api_qa_normalize_row 는 qas.php).
 */

if (!defined('_GNUBOARD_')) exit;

/**
 * 질문의 이전글 · 다음글 — 그누보드 bbs/qaview.php 와 같다. 이전글은 qa_num 이 작은 쪽(더 최근 질문),
 * 다음글은 큰 쪽이고, 최고관리자가 아니면 자기 질문 안에서만 찾는다. 답변 글이면 둘 다 null.
 */
function api_qa_neighbors($row, $viewer)
{
    $neighbors = ['prev' => null, 'next' => null];
    if ((int) ($row['qa_type'] ?? 0) !== 0) {
        return $neighbors;
    }

    $table = DB::table('qa_content_table');
    $where = 'qa_type = 0';
    $params = [];
    if (!api_qa_is_admin($viewer)) {
        $where .= ' AND mb_id = ?';
        $params[] = $viewer['mb_id'];
    }
    $num = (int) ($row['qa_num'] ?? 0);

    $queries = [
        'prev' => "SELECT qa_id, qa_subject FROM {$table} WHERE {$where} AND qa_num < ? ORDER BY qa_num DESC LIMIT 1",
        'next' => "SELECT qa_id, qa_subject FROM {$table} WHERE {$where} AND qa_num > ? ORDER BY qa_num ASC LIMIT 1",
    ];
    foreach ($queries as $key => $sql) {
        $found = DB::fetch($sql, array_merge($params, [$num]));
        if ($found) {
            $neighbors[$key] = ['qa_id' => (int) $found['qa_id'], 'qa_subject' => (string) $found['qa_subject']];
        }
    }

    return $neighbors;
}

function api_qa_related_questions($row, $viewer, $limit = 10)
{
    $related = (int) ($row['qa_related'] ?? 0);
    $qaId = (int) ($row['qa_id'] ?? 0);
    if ($related <= 0 || $qaId <= 0) {
        return [];
    }

    $table = DB::table('qa_content_table');
    $params = [$qaId, $related, max(1, (int) $limit)];
    $sql = "SELECT *
            FROM {$table}
            WHERE qa_id <> ?
              AND qa_related = ?
              AND qa_type = 0";

    if (!api_qa_is_admin($viewer)) {
        $sql .= " AND mb_id = ?";
        $params[] = $viewer['mb_id'];
    }

    $sql .= " ORDER BY qa_num ASC, qa_type ASC LIMIT ?";

    if (!api_qa_is_admin($viewer)) {
        $params = [$qaId, $related, $viewer['mb_id'], max(1, (int) $limit)];
    }

    $rows = DB::fetchAll($sql, $params);
    $items = [];
    foreach ($rows as $relatedRow) {
        $items[] = api_qa_normalize_row($relatedRow, $viewer, false, false);
    }

    return $items;
}

function api_qa_find($qaId, $viewer)
{
    $table = DB::table('qa_content_table');
    $params = [(int) $qaId];
    $sql = "SELECT * FROM {$table} WHERE qa_id = ?";

    if (!api_qa_is_admin($viewer)) {
        $sql .= " AND mb_id = ?";
        $params[] = $viewer['mb_id'];
    }

    $sql .= " LIMIT 1";
    return DB::fetch($sql, $params);
}

function api_qa_find_reply_source($qaId, $viewer)
{
    $qaId = (int) $qaId;
    if ($qaId <= 0) {
        return null;
    }

    $table = DB::table('qa_content_table');
    $params = [$qaId];
    $sql = "SELECT * FROM {$table} WHERE qa_id = ?";

    if (!api_qa_is_admin($viewer)) {
        $sql .= " AND mb_id = ?";
        $params[] = $viewer['mb_id'];
    }

    $sql .= " LIMIT 1";
    return DB::fetch($sql, $params);
}
