<?php
/**
 * Gnuboard5 REST API - Board access helper functions.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * Add a per-viewer blocked-author filter to write-table queries.
 *
 * blocked_key values are stored as "member:{mb_id}" or "name:{wr_name}".
 * The NOT EXISTS form keeps pagination/counts correct without loading the
 * block list into PHP for every board query.
 */
function api_add_blocked_author_condition(array &$conditions, array &$params, ?array $viewer, string $alias = ''): void
{
    if (!$viewer || empty($viewer['mb_id'])) {
        return;
    }

    $alias = preg_replace('/[^a-zA-Z0-9_]/', '', $alias);
    $prefix = $alias !== '' ? "{$alias}." : '';
    $blockTable = DB::table('member_block_table');

    $conditions[] = "NOT EXISTS (
        SELECT 1
          FROM {$blockTable} ab
         WHERE ab.mb_id = ?
           AND ab.blocked_key IN (
               CONCAT('member:', COALESCE({$prefix}mb_id, '')),
               CONCAT('name:', COALESCE({$prefix}wr_name, ''))
           )
    )";
    $params[] = (string) $viewer['mb_id'];
}

/**
 * Return true if the viewer has blocked the supplied author identity.
 */
function api_is_blocked_author(?array $viewer, string $authorMbId = '', string $authorName = ''): bool
{
    if (!$viewer || empty($viewer['mb_id'])) {
        return false;
    }

    $keys = [];
    if ($authorMbId !== '') $keys[] = 'member:' . $authorMbId;
    if ($authorName !== '') $keys[] = 'name:' . $authorName;
    if (!$keys) return false;

    $blockTable = DB::table('member_block_table');
    $ph = implode(',', array_fill(0, count($keys), '?'));
    $row = DB::readFetch(
        "SELECT block_id
           FROM {$blockTable}
          WHERE mb_id = ?
            AND blocked_key IN ({$ph})
          LIMIT 1",
        array_merge([(string) $viewer['mb_id']], $keys)
    );

    return (bool) $row;
}

function api_board_group_access_allowed(?array $viewer, string $bo_table, array $board, bool $allowBoardAdmin = false): bool
{
    $grId = isset($board['gr_id']) ? (string) $board['gr_id'] : '';
    if ($grId === '') {
        return true;
    }

    $group = DB::readFetch(
        "SELECT gr_use_access, gr_admin FROM " . DB::table('group_table') . "
         WHERE gr_id = ? LIMIT 1",
        [$grId]
    );

    if (!$group || empty($group['gr_use_access'])) {
        return true;
    }

    if (!$viewer || empty($viewer['mb_id'])) {
        return false;
    }

    $adminRole = Auth::adminRole($viewer, $bo_table);
    if ($adminRole === 'super' || $adminRole === 'group' || ($allowBoardAdmin && $adminRole === 'board')) {
        return true;
    }

    $row = DB::readFetch(
        "SELECT gr_id FROM " . DB::table('group_member_table') . "
         WHERE gr_id = ? AND mb_id = ?
         LIMIT 1",
        [$grId, (string) $viewer['mb_id']]
    );

    return (bool) $row;
}

function api_board_cert_restriction(?array $viewer, string $bo_table, array $board): ?array
{
    $certMode = isset($board['bo_use_cert']) ? (string) $board['bo_use_cert'] : '';
    if ($certMode === '') {
        return null;
    }

    $config = api_get_config();
    if (empty($config['cf_cert_use'])) {
        return null;
    }

    if ($viewer && Auth::adminRole($viewer, $bo_table) !== '') {
        return null;
    }

    $isMember = $viewer && !empty($viewer['mb_id']);
    if (!$isMember) {
        return [
            'type' => $certMode === 'adult' ? 'adult' : 'cert',
            'refresh_required' => false,
        ];
    }

    $isCertified = !empty($viewer['mb_certify']);
    $isAdult = (int) ($viewer['mb_adult'] ?? 0) === 1;
    $needsRefresh = $isCertified && strlen((string) ($viewer['mb_dupinfo'] ?? '')) === 64;

    if ($needsRefresh) {
        return [
            'type' => 'cert_refresh',
            'refresh_required' => true,
        ];
    }

    if ($certMode === 'cert' && !$isCertified) {
        return [
            'type' => 'cert',
            'refresh_required' => false,
        ];
    }

    if ($certMode === 'adult' && !$isAdult) {
        return [
            'type' => 'adult',
            'refresh_required' => false,
        ];
    }

    return null;
}

function api_can_access_board_list(?array $viewer, string $bo_table, array $board): bool
{
    $viewerLevel = $viewer && isset($viewer['mb_level']) ? (int) $viewer['mb_level'] : 1;
    if ($viewerLevel < (int) ($board['bo_list_level'] ?? 1)) {
        return false;
    }

    return api_board_cert_restriction($viewer, $bo_table, $board) === null;
}

function api_can_write_board_post(?array $viewer, string $bo_table, array $board): bool
{
    if (!$viewer || empty($viewer['mb_id'])) {
        return false;
    }

    if ((int) ($viewer['mb_level'] ?? 1) < (int) ($board['bo_write_level'] ?? 1)) {
        return false;
    }

    if (!api_board_group_access_allowed($viewer, $bo_table, $board, true)) {
        return false;
    }

    return api_board_cert_restriction($viewer, $bo_table, $board) === null;
}

/**
 * 이 게시판의 글 본문을 읽을 수 있는가 — 그룹 · 본인인증 · 읽기 레벨(글 하나와 상관없는 게시판 단위 판정).
 * api_can_read_board_post() 의 앞부분이고, 목록 카드의 본문 발췌(wr_excerpt)도 이것으로 가린다
 * (목록 보기 권한만 있는 사람에게 본문이 보이면 안 된다).
 */
function api_can_read_board(?array $viewer, string $bo_table, array $board): bool
{
    if (!api_board_group_access_allowed($viewer, $bo_table, $board, false)) {
        return false;
    }

    if (api_board_cert_restriction($viewer, $bo_table, $board) !== null) {
        return false;
    }

    $viewerLevel = $viewer && isset($viewer['mb_level']) ? (int) $viewer['mb_level'] : 1;
    return $viewerLevel >= (int) ($board['bo_read_level'] ?? 1);
}

/**
 * Return true when the viewer may read a board post body and attachment list.
 *
 * This mirrors bbs/board.php: group/cert/read-level checks run before the
 * secret-post owner/admin bypass.
 */
function api_can_read_board_post(?array $viewer, string $bo_table, array $board, array $post): bool
{
    if (!api_can_read_board($viewer, $bo_table, $board)) {
        return false;
    }

    if ($viewer && Auth::canManagePost($viewer, $bo_table, $post)) {
        return true;
    }

    return !api_is_secret_option($post['wr_option'] ?? '');
}

function api_is_board_read_point_exempt(?array $viewer, array $board, array $post): bool
{
    if ($viewer
        && !empty($viewer['mb_id'])
        && !empty($post['mb_id'])
        && (string) $post['mb_id'] === (string) $viewer['mb_id']) {
        return true;
    }

    $remoteAddr = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    return !$viewer
        && (int) ($board['bo_read_level'] ?? 1) === 1
        && $remoteAddr !== ''
        && (string) ($post['wr_ip'] ?? '') === $remoteAddr;
}

/**
 * 회원이 작성한 글/댓글을 모든 게시판에서 수집해 반환 (GDPR export 용).
 *
 * @param string $mb_id
 * @param bool   $is_comment  false = 게시글, true = 댓글
 * @param int    $limit       최대 행 수 (성능 보호)
 * @return array
 */
function api_export_user_writes(string $mb_id, bool $is_comment, int $limit = 200): array
{
    $boards = DB::fetchAll("SELECT bo_table FROM " . DB::table('board_table'));
    $rows = [];
    foreach ($boards as $b) {
        $bt = $b['bo_table'];
        $writeTable = DB::writeTable($bt);
        try {
            $items = DB::fetchAll(
                "SELECT wr_id, wr_subject, wr_content, wr_datetime, wr_parent
                 FROM {$writeTable}
                 WHERE mb_id = ? AND wr_is_comment = ?
                 ORDER BY wr_datetime DESC
                 LIMIT ?",
                [$mb_id, $is_comment ? 1 : 0, $limit]
            );
            foreach ($items as $it) {
                $it['bo_table'] = $bt;
                $rows[] = $it;
            }
        } catch (\Exception $e) {
            // 일부 보드 스키마 차이 — skip
            continue;
        }
        if (count($rows) >= $limit) break;
    }
    return array_slice($rows, 0, $limit);
}
