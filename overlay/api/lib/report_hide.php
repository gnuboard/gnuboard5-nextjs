<?php
/**
 * 신고 자동 가림 · 되돌리기 — api/v1/reports.php(신고 · 관리자 처리 API)와 adm/dday_reports.php(관리자 신고 화면)가
 * 같이 쓴다.
 *
 * 같은 글 · 댓글에 처리 대기 중인 회원 신고가 API_REPORT_AUTO_HIDE_THRESHOLD 건 쌓이면 가린다
 * (wr_10 = 'report_hidden' + 비밀글 표시). 가릴 때 원래 wr_option · wr_10 을 가림을 일으킨 신고 행에 적어 두고,
 * 관리자가 신고를 기각해 남은 회원 신고가 기준보다 적어지면 원래대로 돌려놓는다.
 * 공지와 관리자(최고 · 그룹 · 게시판) 글은 자동으로 가리지 않는다 — 신고는 받고 관리자가 판단한다.
 */

if (!defined('_GNUBOARD_')) exit;

if (!defined('API_REPORT_AUTO_HIDE_THRESHOLD')) {
    define('API_REPORT_AUTO_HIDE_THRESHOLD', 3);
}

/** "bo_table/wr_id" → [bo_table, wr_id]. 모양이 다르면 null. */
function api_report_target_parts(string $key): ?array
{
    if (!preg_match('/^([A-Za-z0-9_]+)\/([0-9]+)$/', $key, $m)) {
        return null;
    }

    return [$m[1], (int) $m[2]];
}

function api_report_option_with_secret(string $option): string
{
    $parts = array_filter(array_map('trim', explode(',', $option)), static function ($v) {
        return $v !== '';
    });
    if (!in_array('secret', $parts, true)) {
        $parts[] = 'secret';
    }
    return implode(',', array_values(array_unique($parts)));
}

/** 신고 테이블에 가리기 전 값을 적어 둘 칸이 있는지(설치기가 더한다). */
function api_report_hide_columns_ready(): bool
{
    static $ready = null;
    if ($ready === null) {
        $ready = DB::count(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                AND COLUMN_NAME IN ('hide_prev_option', 'hide_prev_wr10')",
            [DB::table('content_report_table')]
        ) === 2;
    }
    return $ready;
}

/** 처리 대기 중인 회원 신고 수 — 비회원(기기) 신고는 자동 가림에 세지 않는다. */
function api_report_authenticated_open_count(string $type, string $key): int
{
    return (int) DB::count(
        "SELECT COUNT(*) FROM `" . DB::table('content_report_table') . "`
          WHERE target_type = ? AND target_key = ? AND status = 'open'
            AND reporter_mb IS NOT NULL AND reporter_mb <> ''",
        [$type, $key]
    );
}

/** 자동으로 가리지 않는 글 — 공지, 관리자(최고 · 그룹 · 게시판)가 쓴 글 · 댓글. */
function api_report_auto_hide_exempt(string $bo_table, array $board, array $row, bool $isComment): bool
{
    if (!$isComment) {
        $notices = array_filter(array_map('trim', explode(',', (string) ($board['bo_notice'] ?? ''))));
        if (in_array((string) (int) $row['wr_id'], $notices, true)) {
            return true;
        }
    }

    $authorId = (string) ($row['mb_id'] ?? '');
    return $authorId !== '' && Auth::adminRole(['mb_id' => $authorId], $bo_table) !== '';
}

/**
 * 신고가 기준만큼 쌓인 글 · 댓글을 가린다. 원래 값은 가림을 일으킨 신고($reportId) 행에 적는다.
 * 원래 값을 적을 칸이 없으면(설치기가 아직 돌지 않았으면) 가리지 않는다 — 되돌릴 수 없게 덮어쓰지 않도록.
 *
 * @return bool 지금 가려져 있으면 true
 */
function api_report_auto_hide_target(string $type, string $key, int $reportId): bool
{
    if (!in_array($type, ['post', 'comment'], true)) {
        return false;
    }

    $parts = api_report_target_parts($key);
    if (!$parts) {
        return false;
    }

    [$bo_table, $wr_id] = $parts;
    $board = api_get_board($bo_table);
    if (!$board) {
        return false;
    }

    $write_table = DB::writeTable($bo_table);
    $isComment = $type === 'comment' ? 1 : 0;
    $row = DB::fetch(
        "SELECT wr_id, mb_id, wr_option, wr_10
           FROM {$write_table}
          WHERE wr_id = ? AND wr_is_comment = ?
          LIMIT 1",
        [$wr_id, $isComment]
    );
    if (!$row || !$row['wr_id']) {
        return false;
    }

    if ((string) ($row['wr_10'] ?? '') === 'report_hidden') {
        return true;
    }
    if (api_report_auto_hide_exempt($bo_table, $board, $row, (bool) $isComment) || !api_report_hide_columns_ready()) {
        return false;
    }

    $prevOption = (string) ($row['wr_option'] ?? '');
    $prevWr10 = (string) ($row['wr_10'] ?? '');
    // 읽은 값 그대로일 때만 바꾼다 — 그사이 작성자 수정 · 다른 신고가 바꿨으면 덮어쓰지 않는다.
    $hidden = DB::execute(
        "UPDATE {$write_table}
            SET wr_option = ?, wr_10 = 'report_hidden', wr_last = ?
          WHERE wr_id = ? AND wr_is_comment = ? AND wr_option = ? AND wr_10 = ?",
        [api_report_option_with_secret($prevOption), date('Y-m-d H:i:s'), $wr_id, $isComment, $prevOption, $prevWr10]
    );
    if ($hidden !== 1) {
        $now = DB::fetch("SELECT wr_10 FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = ? LIMIT 1", [$wr_id, $isComment]);
        return $now && (string) ($now['wr_10'] ?? '') === 'report_hidden';
    }

    DB::execute(
        "UPDATE `" . DB::table('content_report_table') . "`
            SET hide_prev_option = ?, hide_prev_wr10 = ?
          WHERE report_id = ?",
        [$prevOption, $prevWr10, $reportId]
    );

    return true;
}

/**
 * 관리자가 신고를 기각한 뒤 — 남은 회원 신고가 기준보다 적으면 자동으로 가린 글 · 댓글을 원래대로 돌려놓는다.
 * 이 기능 전에 가려진 글은 원래 값이 없으므로 가림 표시만 지우고 비밀글 표시는 남긴다(작성자 · 관리자가 풀 수 있다).
 *
 * @return bool 돌려놓았으면 true
 */
function api_report_restore_after_dismiss(string $type, string $key): bool
{
    if (!in_array($type, ['post', 'comment'], true)) {
        return false;
    }
    if (api_report_authenticated_open_count($type, $key) >= API_REPORT_AUTO_HIDE_THRESHOLD) {
        return false;
    }

    $parts = api_report_target_parts($key);
    if (!$parts) {
        return false;
    }

    [$bo_table, $wr_id] = $parts;
    $boardExists = DB::count(
        "SELECT COUNT(*) FROM `" . DB::table('board_table') . "` WHERE bo_table = ?",
        [$bo_table]
    ) > 0;
    if (!$boardExists) {
        return false;
    }

    $write_table = DB::writeTable($bo_table);
    $isComment = $type === 'comment' ? 1 : 0;
    $row = DB::fetch(
        "SELECT wr_option, wr_10 FROM {$write_table} WHERE wr_id = ? AND wr_is_comment = ? LIMIT 1",
        [$wr_id, $isComment]
    );
    if (!$row || (string) ($row['wr_10'] ?? '') !== 'report_hidden') {
        return false;
    }

    $reportTable = DB::table('content_report_table');
    $saved = api_report_hide_columns_ready()
        ? DB::fetch(
            "SELECT report_id, hide_prev_option, hide_prev_wr10
               FROM `{$reportTable}`
              WHERE target_type = ? AND target_key = ? AND hide_prev_option IS NOT NULL
              ORDER BY report_id DESC
              LIMIT 1",
            [$type, $key]
        )
        : null;

    $option = $saved ? (string) $saved['hide_prev_option'] : (string) ($row['wr_option'] ?? '');
    $wr10 = $saved ? (string) ($saved['hide_prev_wr10'] ?? '') : '';
    $restored = DB::execute(
        "UPDATE {$write_table}
            SET wr_option = ?, wr_10 = ?
          WHERE wr_id = ? AND wr_is_comment = ? AND wr_10 = 'report_hidden'",
        [$option, $wr10, $wr_id, $isComment]
    );
    if ($saved) {
        DB::execute(
            "UPDATE `{$reportTable}` SET hide_prev_option = NULL, hide_prev_wr10 = NULL WHERE report_id = ?",
            [(int) $saved['report_id']]
        );
    }

    return $restored > 0;
}
