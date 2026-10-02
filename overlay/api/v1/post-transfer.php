<?php
/**
 * Gnuboard5 REST API - 게시글 복사 · 이동 (관리자)
 *
 *   POST /v1/post-transfer/{bo_table}
 *     body: { "mode": "copy" | "move", "wr_ids": [int, ...], "targets": ["bo_table", ...] }
 *
 * 그누보드 bbs/move_update.php 를 API 로 옮긴 것이다. 원글과 그 댓글 · 첨부파일을 대상 게시판에
 * 새로 만들고, 이동이면 스크랩 · 최신글 · 추천 기록을 옮긴 뒤 원본을 지우고 공지 목록 · 글 수를 정리한다.
 *
 * 권한: 원본 게시판의 관리자(최고 · 그룹 · 게시판) 이상. 대상 게시판마다 다시 확인한다
 *       (KVE-2026-0795 — 원본 게시판 권한만으로 남의 게시판에 넣지 못하게).
 */

if (!defined('_GNUBOARD_')) exit;

const API_POST_TRANSFER_MAX_POSTS = 200;
const API_POST_TRANSFER_MAX_TARGETS = 20;
const API_POST_TRANSFER_ADMIN_ROLES = ['super', 'group', 'board'];

$bo_table = isset($apiSegments[0]) ? api_sanitize_bo_table($apiSegments[0]) : '';
if (!$bo_table || $apiMethod !== 'POST') {
    Response::error('Not found. Expected POST /v1/post-transfer/{bo_table}', 404);
}

$board = api_get_board($bo_table);
if (!$board) {
    Response::error('Board not found.', 404);
}

$member = Auth::requireAuth();
if (!in_array(Auth::adminRole($member, $bo_table), API_POST_TRANSFER_ADMIN_ROLES, true)) {
    Response::error('게시판 관리자 이상만 복사 · 이동할 수 있습니다.', 403);
}

$input = get_request_body();
$mode = isset($input['mode']) ? (string) $input['mode'] : '';
if ($mode !== 'copy' && $mode !== 'move') {
    Response::error('Validation failed.', 422, ['mode' => 'mode must be copy or move.']);
}

$wrIds = array_values(array_unique(array_filter(array_map('intval', (array) ($input['wr_ids'] ?? [])))));
if (!$wrIds || count($wrIds) > API_POST_TRANSFER_MAX_POSTS) {
    Response::error('Validation failed.', 422, ['wr_ids' => 'Select 1-' . API_POST_TRANSFER_MAX_POSTS . ' posts.']);
}

$targets = api_post_transfer_targets($member, $bo_table, $mode, (array) ($input['targets'] ?? []));
if (!$targets) {
    Response::error('복사 · 이동할 수 있는 대상 게시판이 없습니다.', 422);
}

$write_table = DB::writeTable($bo_table);
$placeholders = implode(',', array_fill(0, count($wrIds), '?'));
$threads = DB::fetchAll(
    "SELECT DISTINCT wr_num FROM {$write_table} WHERE wr_id IN ({$placeholders}) AND wr_is_comment = 0 ORDER BY wr_id",
    $wrIds
);
if (!$threads) {
    Response::error('선택한 게시글을 찾을 수 없습니다.', 404);
}

$result = api_post_transfer_run($member, $board, $mode, $threads, $targets);

api_call_core('delete_cache_latest', array($bo_table), $member);
api_run_event('bbs_move_update', array($bo_table, array_column($targets, 'bo_table'), implode(',', $wrIds), ''), $member);

Response::success([
    'mode' => $mode,
    'posts' => $result['posts'],
    'comments' => $result['comments'],
    'targets' => array_column($targets, 'bo_table'),
]);

/**
 * 대상 게시판을 거른다: 있는 게시판이고, 이 회원이 그 게시판의 관리자여야 한다.
 * 이동은 같은 게시판으로 할 수 없다(원본이 지워진다).
 */
function api_post_transfer_targets(array $member, string $bo_table, string $mode, array $raw): array
{
    $targets = [];
    foreach (array_slice($raw, 0, API_POST_TRANSFER_MAX_TARGETS) as $name) {
        $name = api_sanitize_bo_table((string) $name);
        if (!$name || isset($targets[$name])) continue;
        if ($mode === 'move' && $name === $bo_table) continue;

        $target = api_get_board($name);
        if (!$target) continue;
        if (!in_array(Auth::adminRole($member, $name), API_POST_TRANSFER_ADMIN_ROLES, true)) continue;

        $targets[$name] = $target;
    }
    return array_values($targets);
}

/** 원글(스레드)마다, 대상 게시판마다 복사하고, 이동이면 원본을 정리한다. 돌려주는 수는 원글 · 댓글 한 벌 기준. */
function api_post_transfer_run(array $member, array $board, string $mode, array $threads, array $targets): array
{
    $write_table = DB::writeTable($board['bo_table']);
    $moved = [];
    $posts = 0;
    $comments = 0;

    foreach ($threads as $thread) {
        $rows = api_post_transfer_thread_rows($write_table, (int) $thread['wr_num']);
        if (!$rows) continue;

        foreach ($targets as $index => $target) {
            $counts = api_post_transfer_copy_thread($member, $board, $target, $mode, $rows, $index === 0);
            if ($index === 0) {
                $posts += $counts['posts'];
                $comments += $counts['comments'];
            }
        }

        if ($mode === 'move') {
            $moved[] = $rows;
        }
    }

    if ($mode === 'move') {
        api_post_transfer_remove_sources($board['bo_table'], $moved, $member);
    }

    return ['posts' => $posts, 'comments' => $comments];
}

/**
 * 한 스레드의 행: 원글 · 답글은 wr_num 으로, 댓글은 wr_parent(원글 번호)로 모은다.
 * 그누보드 원본은 댓글도 wr_num 으로 찾지만, 앱 API 로 단 댓글은 wr_num 이 0 이라 그렇게 하면 빠진다.
 * 정렬은 원본과 같다 — 원글 다음에 그 댓글이 온다(복사할 때 wr_parent 를 새 원글 번호로 잇는 데 쓴다).
 */
function api_post_transfer_thread_rows(string $write_table, int $wr_num): array
{
    $posts = DB::fetchAll(
        "SELECT * FROM {$write_table} WHERE wr_num = ? AND wr_is_comment = 0",
        [$wr_num]
    );
    if (!$posts) return [];

    $postIds = array_map('intval', array_column($posts, 'wr_id'));
    $placeholders = implode(',', array_fill(0, count($postIds), '?'));
    $comments = DB::fetchAll(
        "SELECT * FROM {$write_table} WHERE wr_is_comment = 1 AND wr_parent IN ({$placeholders})",
        $postIds
    );

    $rows = array_merge($posts, $comments);
    usort($rows, static function (array $a, array $b): int {
        return [(int) $a['wr_parent'], (int) $a['wr_is_comment'], -(int) $a['wr_comment'], (int) $a['wr_id']]
            <=> [(int) $b['wr_parent'], (int) $b['wr_is_comment'], -(int) $b['wr_comment'], (int) $b['wr_id']];
    });
    return $rows;
}

/** 한 스레드(원글 + 댓글)를 대상 게시판 하나에 새로 만든다. */
function api_post_transfer_copy_thread(array $member, array $board, array $target, string $mode, array $rows, bool $isFirstTarget): array
{
    $config = api_get_config();
    $src_table = $board['bo_table'];
    $dst_table = $target['bo_table'];
    $dst_write = DB::writeTable($dst_table);
    $next_wr_num = 0;
    $save_parent = 0;
    $posts = 0;
    $comments = 0;

    foreach ($rows as $row) {
        $content = (string) $row['wr_content'];
        if (!$row['wr_is_comment'] && !empty($config['cf_use_copy_log'])) {
            $nick = cut_str((string) ($member['mb_nick'] ?? ''), (int) ($config['cf_cut_name'] ?? 0));
            $isHtml = strpos((string) $row['wr_option'], 'html') !== false;
            $open = $isHtml ? '<div class="content_' . $mode . '">' : "\n";
            $close = $isHtml ? '</div>' : '';
            $content .= "\n" . $open . '[이 게시물은 ' . $nick . '님에 의해 ' . G5_TIME_YMDHIS . ' ' . $board['bo_subject']
                . '에서 ' . ($mode === 'copy' ? '복사' : '이동') . ' 됨]' . $close;
        }

        // 추천 · 비추천은 이동할 때 첫 대상에만 넘긴다(그누보드와 같음).
        $keepVotes = $mode === 'move' && $isFirstTarget;
        $numSql = $next_wr_num ? '?' : "(SELECT IFNULL(MIN(wr_num) - 1, -1) FROM {$dst_write} AS sq)";
        $params = $next_wr_num ? [$next_wr_num] : [];

        $columns = [
            'wr_reply', 'wr_is_comment', 'wr_comment', 'wr_comment_reply', 'ca_name', 'wr_option', 'wr_subject',
            'wr_link1', 'wr_link2', 'wr_link1_hit', 'wr_link2_hit', 'wr_hit', 'mb_id', 'wr_password', 'wr_name',
            'wr_email', 'wr_homepage', 'wr_datetime', 'wr_file', 'wr_last', 'wr_ip',
            'wr_1', 'wr_2', 'wr_3', 'wr_4', 'wr_5', 'wr_6', 'wr_7', 'wr_8', 'wr_9', 'wr_10',
        ];
        $sets = ["wr_num = {$numSql}", 'wr_content = ?', 'wr_good = ?', 'wr_nogood = ?'];
        $params[] = $content;
        $params[] = $keepVotes ? (int) $row['wr_good'] : 0;
        $params[] = $keepVotes ? (int) $row['wr_nogood'] : 0;
        foreach ($columns as $column) {
            $sets[] = "{$column} = ?";
            $params[] = $row[$column] ?? '';
        }

        DB::execute("INSERT INTO {$dst_write} SET " . implode(', ', $sets), $params);
        $insert_id = (int) DB::lastInsertId();

        if ($next_wr_num === 0) {
            $inserted = DB::fetch("SELECT wr_num FROM {$dst_write} WHERE wr_id = ?", [$insert_id]);
            $next_wr_num = (int) ($inserted['wr_num'] ?? 0);
        }

        if (!$row['wr_is_comment']) {
            $save_parent = $insert_id;
            api_post_transfer_copy_files($src_table, $dst_table, (int) $row['wr_id'], $insert_id, $member);
            $posts++;

            if ($mode === 'move' && $isFirstTarget) {
                foreach (['scrap_table', 'board_good_table'] as $key) {
                    DB::execute(
                        'UPDATE ' . DB::table($key) . ' SET bo_table = ?, wr_id = ? WHERE bo_table = ? AND wr_id = ?',
                        [$dst_table, $save_parent, $src_table, $row['wr_id']]
                    );
                }
                DB::execute(
                    'UPDATE ' . DB::table('board_new_table') . ' SET bo_table = ?, wr_id = ?, wr_parent = ? WHERE bo_table = ? AND wr_id = ?',
                    [$dst_table, $save_parent, $save_parent, $src_table, $row['wr_id']]
                );
            }
        } else {
            $comments++;
            if ($mode === 'move') {
                DB::execute(
                    'UPDATE ' . DB::table('board_new_table') . ' SET bo_table = ?, wr_id = ?, wr_parent = ? WHERE bo_table = ? AND wr_id = ?',
                    [$dst_table, $insert_id, $save_parent, $src_table, $row['wr_id']]
                );
            }
        }

        DB::execute("UPDATE {$dst_write} SET wr_parent = ? WHERE wr_id = ?", [$save_parent, $insert_id]);
        api_run_event('bbs_move_copy', array($row, $dst_table, $insert_id, $next_wr_num, $mode), $member);
    }

    DB::execute(
        'UPDATE ' . DB::table('board_table') . ' SET bo_count_write = bo_count_write + ?, bo_count_comment = bo_count_comment + ? WHERE bo_table = ?',
        [$posts, $comments, $dst_table]
    );
    api_call_core('delete_cache_latest', array($dst_table), $member);

    return ['posts' => $posts, 'comments' => $comments];
}

/** 첨부파일 행과 실제 파일을 대상 게시판으로 복사한다(같은 게시판이면 파일 이름을 바꾼다). */
function api_post_transfer_copy_files(string $src_table, string $dst_table, int $src_wr_id, int $insert_id, array $member): void
{
    $fileTable = DB::table('board_file_table');
    $src_dir = G5_DATA_PATH . '/file/' . $src_table;
    $dst_dir = G5_DATA_PATH . '/file/' . $dst_table;

    $files = DB::fetchAll("SELECT * FROM {$fileTable} WHERE bo_table = ? AND wr_id = ? ORDER BY bf_no", [$src_table, $src_wr_id]);
    foreach ($files as $file) {
        $copy_name = '';
        if ($file['bf_file']) {
            $copy_name = $file['bf_file'];
            if ($src_table === $dst_table) {
                if (preg_match('/_copy(\d+)?_(\d+)_/', $copy_name, $match)) {
                    $number = isset($match[1]) ? (int) $match[1] : 0;
                    $copy_name = preg_replace('/_copy(\d+)?_(\d+)_/', '_copy' . ($number + 1) . '_' . $insert_id . '_', $copy_name);
                } else {
                    $copy_name = $src_wr_id . '_copy_' . $insert_id . '_' . $file['bf_file'];
                }
            }

            if (is_file($src_dir . '/' . $file['bf_file'])) {
                if (!is_dir($dst_dir)) {
                    @mkdir($dst_dir, G5_DIR_PERMISSION, true);
                }
                @copy($src_dir . '/' . $file['bf_file'], $dst_dir . '/' . $copy_name);
                @chmod($dst_dir . '/' . $copy_name, G5_FILE_PERMISSION);
            }
            $file = api_run_replace('bbs_move_update_file', $file, array($copy_name, $src_table, $dst_table, $insert_id), $member);
        }

        DB::execute(
            "INSERT INTO {$fileTable} SET bo_table = ?, wr_id = ?, bf_no = ?, bf_source = ?, bf_file = ?, bf_download = ?,
                bf_content = ?, bf_fileurl = ?, bf_thumburl = ?, bf_storage = ?, bf_filesize = ?, bf_width = ?, bf_height = ?,
                bf_type = ?, bf_datetime = ?",
            [
                $dst_table, $insert_id, $file['bf_no'], $file['bf_source'], $copy_name, $file['bf_download'],
                $file['bf_content'], $file['bf_fileurl'] ?? '', $file['bf_thumburl'] ?? '', $file['bf_storage'] ?? '',
                $file['bf_filesize'], $file['bf_width'], $file['bf_height'], $file['bf_type'], $file['bf_datetime'],
            ]
        );
    }
}

/** 이동: 원본 글 · 댓글 · 첨부 · 최신글을 지우고, 공지 목록과 글 수를 정리한다. */
function api_post_transfer_remove_sources(string $src_table, array $threads, array $member): void
{
    $write_table = DB::writeTable($src_table);
    $fileTable = DB::table('board_file_table');
    $newTable = DB::table('board_new_table');
    $boardTable = DB::table('board_table');
    $src_dir = G5_DATA_PATH . '/file/' . $src_table;
    $removedPosts = 0;
    $removedComments = 0;

    foreach ($threads as $rows) {
        foreach ($rows as $row) {
            api_call_core('delete_editor_thumbnail', array((string) $row['wr_content']), $member);
            if ($row['wr_is_comment']) {
                $removedComments++;
                continue;
            }
            $removedPosts++;
            $files = DB::fetchAll("SELECT bf_file FROM {$fileTable} WHERE bo_table = ? AND wr_id = ?", [$src_table, $row['wr_id']]);
            foreach ($files as $file) {
                if (!$file['bf_file']) continue;
                $path = api_run_replace('delete_file_path', clean_relative_paths($src_dir . '/' . $file['bf_file']), array($row), $member);
                if (is_file($path)) {
                    @unlink($path);
                }
                delete_board_thumbnail($src_table, basename($file['bf_file']));
            }
            DB::execute("DELETE FROM {$write_table} WHERE wr_parent = ?", [$row['wr_id']]);
            DB::execute("DELETE FROM {$newTable} WHERE bo_table = ? AND wr_id = ?", [$src_table, $row['wr_id']]);
            DB::execute("DELETE FROM {$fileTable} WHERE bo_table = ? AND wr_id = ?", [$src_table, $row['wr_id']]);
        }
    }

    // 옮겨 간 글은 원본 게시판의 공지 목록에서 뺀다.
    $current = DB::fetch("SELECT bo_notice FROM {$boardTable} WHERE bo_table = ?", [$src_table]);
    $kept = [];
    foreach (array_filter(explode(',', (string) ($current['bo_notice'] ?? ''))) as $id) {
        $id = (int) $id;
        if ($id && DB::fetch("SELECT wr_id FROM {$write_table} WHERE wr_id = ?", [$id])) {
            $kept[] = $id;
        }
    }

    DB::execute(
        "UPDATE {$boardTable} SET bo_notice = ?, bo_count_write = GREATEST(bo_count_write - ?, 0),
            bo_count_comment = GREATEST(bo_count_comment - ?, 0) WHERE bo_table = ?",
        [implode(',', $kept), $removedPosts, $removedComments, $src_table]
    );
}
