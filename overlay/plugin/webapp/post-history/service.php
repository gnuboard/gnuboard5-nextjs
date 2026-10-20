<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * 매뉴얼 게시글 변경 이력 저장·조회 공용 함수.
 * 원본 게시글 표는 MyISAM일 수 있어 이력은 별도 InnoDB 표에 저장한다.
 */
if (!function_exists('webapp_post_history_table')) {
    function webapp_post_history_table(): string
    {
        global $g5;
        return isset($g5['post_revision_table']) && $g5['post_revision_table'] !== ''
            ? $g5['post_revision_table']
            : (defined('G5_TABLE_PREFIX') ? G5_TABLE_PREFIX : 'g5_') . 'post_revision';
    }
}

if (!function_exists('webapp_post_history_group_id')) {
    function webapp_post_history_group_id(): string
    {
        if (defined('G5_POST_HISTORY_GROUP_ID')) {
            return trim((string) G5_POST_HISTORY_GROUP_ID);
        }
        $configured = getenv('G5_POST_HISTORY_GROUP_ID');
        return is_string($configured) && trim($configured) !== '' ? trim($configured) : 'manual';
    }
}

if (!function_exists('webapp_post_history_is_tracked_board')) {
    function webapp_post_history_is_tracked_board($board): bool
    {
        return is_array($board)
            && webapp_post_history_group_id() !== ''
            && isset($board['gr_id'])
            && (string) $board['gr_id'] === webapp_post_history_group_id();
    }
}

if (!function_exists('webapp_post_history_table_ready')) {
    function webapp_post_history_table_ready(): bool
    {
        static $ready = null;
        if ($ready !== null) {
            return $ready;
        }
        if (!function_exists('sql_fetch')) {
            return $ready = false;
        }
        $table = webapp_post_history_table();
        $row = sql_fetch("SELECT 1 AS ready FROM INFORMATION_SCHEMA.TABLES
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = '" . addslashes($table) . "'
                          LIMIT 1", false);
        if (empty($row['ready'])) {
            return $ready = false;
        }
        $columns = sql_fetch("SELECT COUNT(*) AS ready_columns FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = '" . addslashes($table) . "'
                                AND COLUMN_NAME IN ('history_uuid', 'archived_at', 'archive_reason', 'archive_target_bo_table')", false);
        $index = sql_fetch("SELECT 1 AS ready_index FROM INFORMATION_SCHEMA.STATISTICS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = '" . addslashes($table) . "'
                              AND INDEX_NAME = 'uniq_post_history_revision_no'
                            LIMIT 1", false);
        $historyIndex = sql_fetch("SELECT 1 AS ready_index FROM INFORMATION_SCHEMA.STATISTICS
                                   WHERE TABLE_SCHEMA = DATABASE()
                                     AND TABLE_NAME = '" . addslashes($table) . "'
                                     AND INDEX_NAME = 'idx_post_revision_history'
                                   LIMIT 1", false);
        return $ready = (int) ($columns['ready_columns'] ?? 0) === 4
            && !empty($index['ready_index']) && !empty($historyIndex['ready_index']);
    }
}

if (!function_exists('webapp_post_history_write_table')) {
    function webapp_post_history_write_table(string $boTable): string
    {
        global $g5;
        if (!preg_match('/^[a-zA-Z0-9_]{1,20}$/', $boTable) || empty($g5['write_prefix'])) {
            return '';
        }
        return $g5['write_prefix'] . $boTable;
    }
}

if (!function_exists('webapp_post_history_snapshot')) {
    /** DB에 저장된 원문만 읽는다. 글 보기용 URL·썸네일 변환 결과는 포함하지 않는다. */
    function webapp_post_history_snapshot(string $boTable, int $wrId): ?array
    {
        if ($wrId <= 0) {
            return null;
        }
        $writeTable = webapp_post_history_write_table($boTable);
        if ($writeTable === '') {
            return null;
        }
        $row = sql_fetch("SELECT wr_subject, wr_seo_title, ca_name, wr_option,
                                 wr_link1, wr_link2, wr_content
                          FROM `{$writeTable}`
                          WHERE wr_id = {$wrId} AND wr_is_comment = 0
                          LIMIT 1", false);
        if (!$row || !array_key_exists('wr_content', $row)) {
            return null;
        }
        $snapshot = array(
            'wr_subject' => (string) ($row['wr_subject'] ?? ''),
            'wr_seo_title' => (string) ($row['wr_seo_title'] ?? ''),
            'ca_name' => (string) ($row['ca_name'] ?? ''),
            'wr_option' => (string) ($row['wr_option'] ?? ''),
            'wr_link1' => (string) ($row['wr_link1'] ?? ''),
            'wr_link2' => (string) ($row['wr_link2'] ?? ''),
            'wr_content' => (string) ($row['wr_content'] ?? ''),
        );
        $snapshot['content_hash'] = webapp_post_history_hash($snapshot);
        return $snapshot;
    }
}

if (!function_exists('webapp_post_history_hash')) {
    function webapp_post_history_hash(array $snapshot): string
    {
        $canonical = array(
            'wr_subject' => (string) ($snapshot['wr_subject'] ?? ''),
            'wr_seo_title' => (string) ($snapshot['wr_seo_title'] ?? ''),
            'ca_name' => (string) ($snapshot['ca_name'] ?? ''),
            'wr_option' => (string) ($snapshot['wr_option'] ?? ''),
            'wr_link1' => (string) ($snapshot['wr_link1'] ?? ''),
            'wr_link2' => (string) ($snapshot['wr_link2'] ?? ''),
            'wr_content' => (string) ($snapshot['wr_content'] ?? ''),
        );
        $json = json_encode($canonical, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        return hash('sha256', $json === false ? serialize($canonical) : $json);
    }
}

if (!function_exists('webapp_post_history_lock_key')) {
    function webapp_post_history_lock_key(string $boTable, int $wrId): string
    {
        return 'g5_ph_' . substr(hash('sha256', $boTable . ':' . $wrId), 0, 48);
    }
}

if (!function_exists('webapp_post_history_register_shutdown')) {
    function webapp_post_history_register_shutdown(): void
    {
        if (!empty($GLOBALS['webapp_post_history_shutdown_registered'])) {
            return;
        }
        $GLOBALS['webapp_post_history_shutdown_registered'] = true;
        register_shutdown_function('webapp_post_history_release_all_locks');
    }
}

if (!function_exists('webapp_post_history_acquire')) {
    function webapp_post_history_acquire(string $boTable, int $wrId): bool
    {
        if (!webapp_post_history_table_ready() || $wrId <= 0) {
            return false;
        }
        $key = $boTable . ':' . $wrId;
        if (!empty($GLOBALS['webapp_post_history_locks'][$key])) {
            return true;
        }
        $lockName = webapp_post_history_lock_key($boTable, $wrId);
        $row = sql_fetch("SELECT GET_LOCK('{$lockName}', 5) AS acquired", false);
        if (!isset($row['acquired']) || (int) $row['acquired'] !== 1) {
            return false;
        }
        if (!isset($GLOBALS['webapp_post_history_locks']) || !is_array($GLOBALS['webapp_post_history_locks'])) {
            $GLOBALS['webapp_post_history_locks'] = array();
        }
        $GLOBALS['webapp_post_history_locks'][$key] = $lockName;
        webapp_post_history_register_shutdown();
        return true;
    }
}

if (!function_exists('webapp_post_history_release')) {
    function webapp_post_history_release(string $boTable, int $wrId): void
    {
        $key = $boTable . ':' . $wrId;
        $lockName = $GLOBALS['webapp_post_history_locks'][$key] ?? '';
        if ($lockName === '') {
            return;
        }
        unset($GLOBALS['webapp_post_history_locks'][$key]);
        sql_fetch("SELECT RELEASE_LOCK('" . addslashes($lockName) . "') AS released", false);
    }
}

if (!function_exists('webapp_post_history_release_all_locks')) {
    function webapp_post_history_release_all_locks(): void
    {
        foreach (array_keys($GLOBALS['webapp_post_history_locks'] ?? array()) as $key) {
            $parts = explode(':', (string) $key, 2);
            if (count($parts) === 2) {
                webapp_post_history_release($parts[0], (int) $parts[1]);
            }
        }
    }
}

if (!function_exists('webapp_post_history_latest')) {
    function webapp_post_history_latest(string $boTable, int $wrId): ?array
    {
        $table = webapp_post_history_table();
        $bo = sql_real_escape_string($boTable);
        $row = sql_fetch("SELECT rev_id, rev_no, history_uuid, content_hash
                          FROM `{$table}`
                          WHERE bo_table = '{$bo}' AND wr_id = {$wrId} AND archived_at IS NULL AND capture_status = 'finalized'
                          ORDER BY rev_no DESC LIMIT 1", false);
        return $row ?: null;
    }
}

if (!function_exists('webapp_post_history_actor')) {
    /** 명시된 작업자 또는 현재 로그인 회원을 감사 주체로 만든다. */
    function webapp_post_history_actor($actor, $board): array
    {
        global $config, $g5;
        if (!is_array($actor)) {
            $actor = isset($GLOBALS['member']) && is_array($GLOBALS['member']) ? $GLOBALS['member'] : array();
        }
        $mbId = trim((string) ($actor['mb_id'] ?? ''));
        $name = trim((string) ($actor['mb_nick'] ?? $actor['mb_name'] ?? ''));
        $role = 'member';
        if ($mbId === '') {
            return array('mb_id' => '', 'name' => '가져오기 도구', 'role' => 'system');
        }
        if (!empty($config['cf_admin'])) {
            $admins = preg_split('/[\s,|]+/', (string) $config['cf_admin'], -1, PREG_SPLIT_NO_EMPTY);
            if (in_array($mbId, $admins, true)) {
                $role = 'super';
            }
        }
        if ($role !== 'super' && is_array($board)) {
            $groupTable = $g5['group_table'] ?? '';
            $grId = trim((string) ($board['gr_id'] ?? ''));
            if ($groupTable !== '' && $grId !== '') {
                $gr = sql_real_escape_string($grId);
                $group = sql_fetch("SELECT gr_admin FROM `{$groupTable}` WHERE gr_id = '{$gr}' LIMIT 1", false);
                if (!empty($group['gr_admin']) && (string) $group['gr_admin'] === $mbId) {
                    $role = 'group';
                }
            }
            if ($role === 'member' && !empty($board['bo_admin']) && (string) $board['bo_admin'] === $mbId) {
                $role = 'board';
            }
        }
        return array(
            'mb_id' => $mbId,
            'name' => $name !== '' ? $name : $mbId,
            'role' => $role,
        );
    }
}

if (!function_exists('webapp_post_history_append')) {
    function webapp_post_history_append(
        string $boTable,
        int $wrId,
        array $snapshot,
        string $event,
        string $source,
        array $actor,
        string $note = ''
    ): bool {
        $table = webapp_post_history_table();
        $latest = webapp_post_history_latest($boTable, $wrId);
        $revisionNo = (int) ($latest['rev_no'] ?? 0) + 1;
        $historyUuid = (string) ($latest['history_uuid'] ?? '');
        if ($historyUuid === '') {
            $uuidRow = sql_fetch("SELECT UUID() AS history_uuid", false);
            $historyUuid = (string) ($uuidRow['history_uuid'] ?? '');
        }
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $historyUuid)) {
            return false;
        }
        $values = array(
            'bo_table' => $boTable,
            'history_uuid' => $historyUuid,
            'event' => $event,
            'source' => $source,
            'actor_mb_id' => (string) ($actor['mb_id'] ?? ''),
            'actor_name' => (string) ($actor['name'] ?? ''),
            'actor_role' => (string) ($actor['role'] ?? 'system'),
            'note' => $note,
            'wr_subject' => (string) ($snapshot['wr_subject'] ?? ''),
            'wr_seo_title' => (string) ($snapshot['wr_seo_title'] ?? ''),
            'ca_name' => (string) ($snapshot['ca_name'] ?? ''),
            'wr_option' => (string) ($snapshot['wr_option'] ?? ''),
            'wr_link1' => (string) ($snapshot['wr_link1'] ?? ''),
            'wr_link2' => (string) ($snapshot['wr_link2'] ?? ''),
            'wr_content' => (string) ($snapshot['wr_content'] ?? ''),
            'content_hash' => (string) ($snapshot['content_hash'] ?? webapp_post_history_hash($snapshot)),
        );
        if (function_exists('mb_substr')) {
            $values['note'] = mb_substr($values['note'], 0, 500, 'UTF-8');
            $values['actor_name'] = mb_substr($values['actor_name'], 0, 255, 'UTF-8');
        } else {
            $values['note'] = substr($values['note'], 0, 500);
            $values['actor_name'] = substr($values['actor_name'], 0, 255);
        }
        $escaped = array();
        foreach ($values as $key => $value) {
            $escaped[$key] = "'" . sql_real_escape_string($value) . "'";
        }
        $escaped['wr_id'] = (string) $wrId;
        $escaped['rev_no'] = (string) $revisionNo;
        $escaped['created_at'] = "'" . date('Y-m-d H:i:s') . "'";
        $sql = "INSERT INTO `{$table}` SET
                    bo_table = {$escaped['bo_table']}, wr_id = {$escaped['wr_id']}, history_uuid = {$escaped['history_uuid']}, rev_no = {$escaped['rev_no']},
                    archived_at = NULL, archive_reason = '', archive_target_bo_table = '',
                    event = {$escaped['event']}, capture_status = 'finalized', source = {$escaped['source']},
                    actor_mb_id = {$escaped['actor_mb_id']}, actor_name = {$escaped['actor_name']}, actor_role = {$escaped['actor_role']},
                    note = {$escaped['note']}, wr_subject = {$escaped['wr_subject']}, wr_seo_title = {$escaped['wr_seo_title']},
                    ca_name = {$escaped['ca_name']}, wr_option = {$escaped['wr_option']}, wr_link1 = {$escaped['wr_link1']},
                    wr_link2 = {$escaped['wr_link2']}, wr_content = {$escaped['wr_content']}, content_hash = {$escaped['content_hash']},
                    created_at = {$escaped['created_at']}";
        return sql_query($sql, false) !== false;
    }
}

if (!function_exists('webapp_post_history_pending')) {
    function webapp_post_history_pending(string $boTable, int $wrId): ?array
    {
        $table = webapp_post_history_table();
        $bo = sql_real_escape_string($boTable);
        $row = sql_fetch("SELECT rev_id, content_hash
                          FROM `{$table}`
                          WHERE bo_table = '{$bo}' AND wr_id = {$wrId} AND archived_at IS NULL AND capture_status = 'pending'
                          ORDER BY rev_id DESC LIMIT 1", false);
        return $row ?: null;
    }
}

if (!function_exists('webapp_post_history_reconcile_pending')) {
    /** 중간에 요청이 끝난 저장을 다음 이력 조회/저장 때 마무리한다. */
    function webapp_post_history_reconcile_pending(string $boTable, int $wrId, array $snapshot): bool
    {
        $pending = webapp_post_history_pending($boTable, $wrId);
        if (!$pending) {
            return true;
        }
        $table = webapp_post_history_table();
        $revId = (int) $pending['rev_id'];
        if (hash_equals((string) $pending['content_hash'], (string) $snapshot['content_hash'])) {
            return sql_query("DELETE FROM `{$table}` WHERE rev_id = {$revId} AND capture_status = 'pending'", false) !== false;
        }
        $values = array(
            'wr_subject' => (string) ($snapshot['wr_subject'] ?? ''),
            'wr_seo_title' => (string) ($snapshot['wr_seo_title'] ?? ''),
            'ca_name' => (string) ($snapshot['ca_name'] ?? ''),
            'wr_option' => (string) ($snapshot['wr_option'] ?? ''),
            'wr_link1' => (string) ($snapshot['wr_link1'] ?? ''),
            'wr_link2' => (string) ($snapshot['wr_link2'] ?? ''),
            'wr_content' => (string) ($snapshot['wr_content'] ?? ''),
            'content_hash' => (string) $snapshot['content_hash'],
        );
        $set = array();
        foreach ($values as $key => $value) {
            $set[] = "`{$key}` = '" . sql_real_escape_string($value) . "'";
        }
        $set[] = "`event` = 'updated'";
        $set[] = "`capture_status` = 'finalized'";
        return sql_query("UPDATE `{$table}` SET " . implode(', ', $set)
            . " WHERE rev_id = {$revId} AND capture_status = 'pending'", false) !== false;
    }
}

if (!function_exists('webapp_post_history_begin')) {
    /** 수정 전 기준점을 만들고 같은 게시글의 다른 저장 요청을 직렬화한다. */
    function webapp_post_history_begin(string $boTable, int $wrId, $board, $actor = null, string $source = 'web', string $note = ''): bool
    {
        if (!webapp_post_history_is_tracked_board($board) || !webapp_post_history_table_ready()) {
            return false;
        }
        if (!webapp_post_history_acquire($boTable, $wrId)) {
            return false;
        }
        $snapshot = webapp_post_history_snapshot($boTable, $wrId);
        if (!$snapshot) {
            webapp_post_history_release($boTable, $wrId);
            return false;
        }
        if (!webapp_post_history_reconcile_pending($boTable, $wrId, $snapshot)) {
            webapp_post_history_release($boTable, $wrId);
            return false;
        }
        $latest = webapp_post_history_latest($boTable, $wrId);
        if (!$latest) {
            $ok = webapp_post_history_append(
                $boTable,
                $wrId,
                $snapshot,
                'baseline',
                'system',
                array('mb_id' => '', 'name' => '', 'role' => 'system'),
                '이력 추적 시작 시점의 기준 내용'
            );
        } elseif (!hash_equals((string) $latest['content_hash'], $snapshot['content_hash'])) {
            $ok = webapp_post_history_append(
                $boTable,
                $wrId,
                $snapshot,
                'unknown_change',
                'system',
                array('mb_id' => '', 'name' => '', 'role' => 'system'),
                '기록되지 않은 경로에서 달라진 내용'
            );
        } else {
            $ok = true;
        }
        if ($ok) {
            $pendingActor = webapp_post_history_actor($actor, $board);
            $table = webapp_post_history_table();
            $pendingLatest = webapp_post_history_latest($boTable, $wrId);
            $revisionNo = (int) ($pendingLatest['rev_no'] ?? 0) + 1;
            $historyUuid = (string) ($pendingLatest['history_uuid'] ?? '');
            if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $historyUuid)) {
                $ok = false;
            }
            $values = array(
                'bo_table' => $boTable,
                'history_uuid' => $historyUuid,
                'source' => $source,
                'actor_mb_id' => (string) $pendingActor['mb_id'],
                'actor_name' => (string) $pendingActor['name'],
                'actor_role' => (string) $pendingActor['role'],
                'note' => $note,
                'wr_subject' => (string) $snapshot['wr_subject'],
                'wr_seo_title' => (string) $snapshot['wr_seo_title'],
                'ca_name' => (string) $snapshot['ca_name'],
                'wr_option' => (string) $snapshot['wr_option'],
                'wr_link1' => (string) $snapshot['wr_link1'],
                'wr_link2' => (string) $snapshot['wr_link2'],
                'wr_content' => (string) $snapshot['wr_content'],
                'content_hash' => (string) $snapshot['content_hash'],
            );
            $escaped = array();
            foreach ($values as $key => $value) {
                if (function_exists('mb_substr') && $key === 'actor_name') {
                    $value = mb_substr($value, 0, 255, 'UTF-8');
                }
                if (function_exists('mb_substr') && $key === 'note') {
                    $value = mb_substr($value, 0, 500, 'UTF-8');
                }
                $escaped[$key] = "'" . sql_real_escape_string($value) . "'";
            }
            $inserted = $ok ? sql_query("INSERT INTO `{$table}` SET
                bo_table = {$escaped['bo_table']}, wr_id = {$wrId}, history_uuid = {$escaped['history_uuid']}, rev_no = {$revisionNo},
                archived_at = NULL, archive_reason = '', archive_target_bo_table = '', event = 'pending',
                capture_status = 'pending', source = {$escaped['source']}, actor_mb_id = {$escaped['actor_mb_id']},
                actor_name = {$escaped['actor_name']}, actor_role = {$escaped['actor_role']}, note = {$escaped['note']},
                wr_subject = {$escaped['wr_subject']}, wr_seo_title = {$escaped['wr_seo_title']},
                ca_name = {$escaped['ca_name']}, wr_option = {$escaped['wr_option']},
                wr_link1 = {$escaped['wr_link1']}, wr_link2 = {$escaped['wr_link2']}, wr_content = {$escaped['wr_content']},
                content_hash = {$escaped['content_hash']}, created_at = '" . date('Y-m-d H:i:s') . "'", false) : false;
            $pendingId = $inserted !== false && function_exists('sql_insert_id') ? (int) sql_insert_id() : 0;
            if ($pendingId > 0) {
                $key = $boTable . ':' . $wrId;
                $GLOBALS['webapp_post_history_pending_ids'][$key] = $pendingId;
            } else {
                $ok = false;
            }
        }
        if (!$ok) {
            webapp_post_history_release($boTable, $wrId);
        }
        return $ok;
    }
}

if (!function_exists('webapp_post_history_reconcile_for_read')) {
    /** 이력 목록을 보여 주기 전에 중단된 저장과 기록 밖의 변경을 확인한다. */
    function webapp_post_history_reconcile_for_read(string $boTable, int $wrId, $board): bool
    {
        if (!webapp_post_history_is_tracked_board($board) || !webapp_post_history_acquire($boTable, $wrId)) {
            return false;
        }
        try {
            $snapshot = webapp_post_history_snapshot($boTable, $wrId);
            if (!$snapshot || !webapp_post_history_reconcile_pending($boTable, $wrId, $snapshot)) {
                return false;
            }

            $latest = webapp_post_history_latest($boTable, $wrId);
            if (!$latest) {
                return webapp_post_history_append(
                    $boTable,
                    $wrId,
                    $snapshot,
                    'baseline',
                    'system',
                    array('mb_id' => '', 'name' => '', 'role' => 'system'),
                    '이력 최초 조회 시점의 기준 내용'
                );
            }
            if (!hash_equals((string) $latest['content_hash'], (string) $snapshot['content_hash'])) {
                return webapp_post_history_append(
                    $boTable,
                    $wrId,
                    $snapshot,
                    'unknown_change',
                    'system',
                    array('mb_id' => '', 'name' => '', 'role' => 'system'),
                    '기록되지 않은 경로에서 달라진 내용을 조회 시 확인'
                );
            }
            return true;
        } finally {
            webapp_post_history_release($boTable, $wrId);
        }
    }
}

if (!function_exists('webapp_post_history_finish')) {
    /** 저장 후 원문이 달라졌을 때만 새 버전을 넣고 잠금을 푼다. */
    function webapp_post_history_finish(
        string $boTable,
        int $wrId,
        $board,
        string $event = 'updated',
        string $source = 'web',
        $actor = null,
        string $note = ''
    ): bool {
        if (!webapp_post_history_is_tracked_board($board) || !webapp_post_history_table_ready()) {
            return false;
        }
        $key = $boTable . ':' . $wrId;
        $alreadyLocked = !empty($GLOBALS['webapp_post_history_locks'][$key]);
        if (!$alreadyLocked && !webapp_post_history_acquire($boTable, $wrId)) {
            error_log('[post-history] could not acquire lock for ' . $boTable . '/' . $wrId);
            return false;
        }
        try {
            $snapshot = webapp_post_history_snapshot($boTable, $wrId);
            if (!$snapshot) {
                return false;
            }
            $pendingId = (int) ($GLOBALS['webapp_post_history_pending_ids'][$key] ?? 0);
            if ($pendingId > 0) {
                $table = webapp_post_history_table();
                $pending = sql_fetch("SELECT content_hash FROM `{$table}`
                                     WHERE rev_id = {$pendingId} AND capture_status = 'pending' LIMIT 1", false);
                unset($GLOBALS['webapp_post_history_pending_ids'][$key]);
                if ($pending && hash_equals((string) $pending['content_hash'], (string) $snapshot['content_hash'])) {
                    return sql_query("DELETE FROM `{$table}` WHERE rev_id = {$pendingId} AND capture_status = 'pending'", false) !== false;
                }
                if ($pending) {
                    $values = array(
                        'wr_subject' => (string) $snapshot['wr_subject'],
                        'wr_seo_title' => (string) $snapshot['wr_seo_title'],
                        'ca_name' => (string) $snapshot['ca_name'],
                        'wr_option' => (string) $snapshot['wr_option'],
                        'wr_link1' => (string) $snapshot['wr_link1'],
                        'wr_link2' => (string) $snapshot['wr_link2'],
                        'wr_content' => (string) $snapshot['wr_content'],
                        'content_hash' => (string) $snapshot['content_hash'],
                    );
                    $set = array();
                    foreach ($values as $keyName => $value) {
                        $set[] = "`{$keyName}` = '" . sql_real_escape_string($value) . "'";
                    }
                    $set[] = "`event` = '" . sql_real_escape_string($event) . "'";
                    $set[] = "`capture_status` = 'finalized'";
                    return sql_query("UPDATE `{$table}` SET " . implode(', ', $set)
                        . " WHERE rev_id = {$pendingId} AND capture_status = 'pending'", false) !== false;
                }
            }
            $latest = webapp_post_history_latest($boTable, $wrId);
            if ($event === 'created') {
                // 삭제 훅을 거치지 않은 고아 이력도 새 게시글의 첫 버전에 섞지 않는다.
                $table = webapp_post_history_table();
                $bo = sql_real_escape_string($boTable);
                $archived = sql_query("UPDATE `{$table}`
                                       SET archived_at = NOW(), archive_reason = 'reused', archive_target_bo_table = ''
                                       WHERE bo_table = '{$bo}' AND wr_id = {$wrId} AND archived_at IS NULL", false);
                if ($archived === false) return false;
                $latest = null;
            }
            if ($latest && hash_equals((string) $latest['content_hash'], $snapshot['content_hash'])) {
                return true;
            }
            if (!$latest && $event === 'updated') {
                $note = trim($note . ' 저장 전 기준 버전을 확인할 수 없음');
            }
            $normalizedActor = webapp_post_history_actor($actor, $board);
            return webapp_post_history_append($boTable, $wrId, $snapshot, $event, $source, $normalizedActor, $note);
        } finally {
            webapp_post_history_release($boTable, $wrId);
        }
    }
}

if (!function_exists('webapp_post_history_source')) {
    function webapp_post_history_source(): string
    {
        return defined('G5_API_REQUEST') && G5_API_REQUEST ? 'api' : 'web';
    }
}

if (!function_exists('webapp_post_history_block_save')) {
    function webapp_post_history_block_save(): void
    {
        $message = '매뉴얼 이력을 준비하지 못했습니다. 잠시 후 다시 저장해 주세요.';
        if (function_exists('alert')) {
            alert($message);
        }
        error_log('[post-history] ' . $message);
    }
}

if (!function_exists('webapp_post_history_on_write_before')) {
    function webapp_post_history_on_write_before($board, $wrId, $w = '', $qstr = ''): void
    {
        if ((string) $w !== 'u' || (int) $wrId <= 0 || !webapp_post_history_is_tracked_board($board)) {
            return;
        }
        if (!webapp_post_history_table_ready()) {
            return;
        }
        if (!webapp_post_history_begin((string) $board['bo_table'], (int) $wrId, $board, null, webapp_post_history_source())) {
            webapp_post_history_block_save();
        }
    }
}

if (!function_exists('webapp_post_history_on_write_after')) {
    function webapp_post_history_on_write_after($board, $wrId, $w = '', $qstr = '', $redirectUrl = ''): void
    {
        if ((int) $wrId <= 0 || !webapp_post_history_is_tracked_board($board) || !webapp_post_history_table_ready()) {
            return;
        }
        $event = (string) $w === 'u' ? 'updated' : 'created';
        $ok = webapp_post_history_finish(
            (string) $board['bo_table'],
            (int) $wrId,
            $board,
            $event,
            webapp_post_history_source()
        );
        if (!$ok) {
            error_log('[post-history] could not record ' . $event . ' for ' . $board['bo_table'] . '/' . $wrId);
        }
    }
}

if (!function_exists('webapp_post_history_archive')) {
    function webapp_post_history_archive(string $boTable, int $wrId, string $reason, string $targetBoTable = ''): bool
    {
        if ($wrId <= 0 || !in_array($reason, array('deleted', 'moved', 'reused'), true)
            || !webapp_post_history_acquire($boTable, $wrId)) {
            return false;
        }
        try {
            $table = webapp_post_history_table();
            $bo = sql_real_escape_string($boTable);
            $target = preg_match('/^[a-zA-Z0-9_]{1,20}$/', $targetBoTable)
                ? "'" . sql_real_escape_string($targetBoTable) . "'"
                : "''";
            return sql_query("UPDATE `{$table}`
                             SET archived_at = NOW(), archive_reason = '" . sql_real_escape_string($reason) . "',
                                 archive_target_bo_table = {$target}
                             WHERE bo_table = '{$bo}' AND wr_id = {$wrId} AND archived_at IS NULL", false) !== false;
        } finally {
            webapp_post_history_release($boTable, $wrId);
        }
    }
}

if (!function_exists('webapp_post_history_delete')) {
    /** 호환용 이름 — 삭제된 글의 이력은 제거하지 않고 보관함으로 보낸다. */
    function webapp_post_history_delete(string $boTable, int $wrId): void
    {
        if (!webapp_post_history_archive($boTable, $wrId, 'deleted')) {
            error_log('[post-history] could not archive deleted post ' . $boTable . '/' . $wrId);
        }
    }
}

if (!function_exists('webapp_post_history_archive_board_sql')) {
    function webapp_post_history_archive_board_sql(array $boardTables): string
    {
        $values = array();
        foreach ($boardTables as $boTable) {
            $boTable = (string) $boTable;
            if (preg_match('/^[a-zA-Z0-9_]{1,20}$/', $boTable)) {
                $values[$boTable] = "'" . sql_real_escape_string($boTable) . "'";
            }
        }
        return $values ? implode(',', array_values($values)) : '';
    }
}

if (!function_exists('webapp_post_history_archives_count')) {
    function webapp_post_history_archives_count(array $boardTables): int
    {
        $in = webapp_post_history_archive_board_sql($boardTables);
        if ($in === '') return 0;
        $table = webapp_post_history_table();
        $row = sql_fetch("SELECT COUNT(DISTINCT history_uuid) AS total
                          FROM `{$table}` WHERE archived_at IS NOT NULL AND bo_table IN ({$in})", false);
        return (int) ($row['total'] ?? 0);
    }
}

if (!function_exists('webapp_post_history_archives_list')) {
    function webapp_post_history_archives_list(array $boardTables, int $offset = 0, int $limit = 30): array
    {
        $in = webapp_post_history_archive_board_sql($boardTables);
        if ($in === '') return array();
        $table = webapp_post_history_table();
        $offset = max(0, $offset);
        $limit = max(1, min(100, $limit));
        $result = sql_query("SELECT h.history_uuid, h.bo_table, h.wr_id, h.archived_at,
                                    h.archive_reason, h.archive_target_bo_table, h.rev_no,
                                    h.event, h.actor_name, h.wr_subject,
                                    (SELECT COUNT(*) FROM `{$table}` v
                                     WHERE v.history_uuid = h.history_uuid AND v.archived_at IS NOT NULL) AS version_count
                             FROM `{$table}` h
                             WHERE h.archived_at IS NOT NULL AND h.bo_table IN ({$in})
                               AND h.rev_no = (SELECT MAX(v.rev_no) FROM `{$table}` v
                                               WHERE v.history_uuid = h.history_uuid AND v.archived_at IS NOT NULL)
                             ORDER BY h.archived_at DESC, h.rev_id DESC LIMIT {$offset}, {$limit}", false);
        $items = array();
        while ($result && ($row = sql_fetch_array($result))) {
            $row['wr_id'] = (int) $row['wr_id'];
            $row['rev_no'] = (int) $row['rev_no'];
            $row['version_count'] = (int) $row['version_count'];
            $items[] = $row;
        }
        return $items;
    }
}

if (!function_exists('webapp_post_history_archived_revisions')) {
    function webapp_post_history_archived_revisions(string $historyUuid, array $boardTables): array
    {
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $historyUuid)) {
            return array();
        }
        $in = webapp_post_history_archive_board_sql($boardTables);
        if ($in === '') return array();
        $uuid = sql_real_escape_string($historyUuid);
        $table = webapp_post_history_table();
        $result = sql_query("SELECT rev_id, rev_no, event, capture_status, source, actor_mb_id, actor_name,
                                    actor_role, note, wr_subject, wr_seo_title, ca_name, wr_option,
                                    wr_link1, wr_link2, wr_content, content_hash, created_at,
                                    archived_at, archive_reason, archive_target_bo_table, bo_table, wr_id
                             FROM `{$table}`
                             WHERE history_uuid = '{$uuid}' AND archived_at IS NOT NULL AND bo_table IN ({$in})
                             ORDER BY rev_no ASC", false);
        $items = array();
        while ($result && ($row = sql_fetch_array($result))) {
            $row['rev_id'] = (int) $row['rev_id'];
            $row['rev_no'] = (int) $row['rev_no'];
            $row['wr_id'] = (int) $row['wr_id'];
            $items[] = $row;
        }
        return $items;
    }
}

if (!function_exists('webapp_post_history_on_delete')) {
    function webapp_post_history_on_delete($write, $board): void
    {
        if (!is_array($write) || !is_array($board) || !webapp_post_history_is_tracked_board($board)) {
            return;
        }
        webapp_post_history_delete((string) $board['bo_table'], (int) ($write['wr_id'] ?? 0));
    }
}

if (!function_exists('webapp_post_history_board')) {
    function webapp_post_history_board(string $boTable): ?array
    {
        global $g5;
        if (!preg_match('/^[a-zA-Z0-9_]{1,20}$/', $boTable) || empty($g5['board_table'])) {
            return null;
        }
        $escaped = sql_real_escape_string($boTable);
        $board = sql_fetch("SELECT bo_table, gr_id, bo_admin FROM `{$g5['board_table']}` WHERE bo_table = '{$escaped}' LIMIT 1", false);
        return $board ?: null;
    }
}

if (!function_exists('webapp_post_history_transfer_source')) {
    function webapp_post_history_transfer_source(string $fallback = ''): string
    {
        $source = (string) ($GLOBALS['webapp_post_history_transfer_source'] ?? '');
        if ($source === '') {
            $source = (string) ($GLOBALS['bo_table'] ?? $fallback);
        }
        return preg_match('/^[a-zA-Z0-9_]{1,20}$/', $source) ? $source : '';
    }
}

if (!function_exists('webapp_post_history_on_move_copy')) {
    /** 게시판 이동·복사로 새로 생긴 매뉴얼 글은 대상 게시판에서 새 이력을 시작한다. */
    function webapp_post_history_on_move_copy($sourceRow, $dstBoTable, $insertId, $nextWrNum, $mode): void
    {
        if (!is_array($sourceRow) || !empty($sourceRow['wr_is_comment'])) {
            return;
        }

        $sourceBoTable = webapp_post_history_transfer_source();
        $sourceBoard = $sourceBoTable !== '' ? webapp_post_history_board($sourceBoTable) : null;
        $sourceTracked = webapp_post_history_is_tracked_board($sourceBoard);
        $dstBoTable = (string) $dstBoTable;
        $insertId = (int) $insertId;

        if ((string) $mode === 'move' && $sourceTracked && (int) ($sourceRow['wr_id'] ?? 0) > 0) {
            $key = $sourceBoTable . ':' . (int) $sourceRow['wr_id'];
            $GLOBALS['webapp_post_history_moved_posts'][$key] = array(
                'bo_table' => $sourceBoTable,
                'wr_id' => (int) $sourceRow['wr_id'],
                'target_bo_table' => $dstBoTable,
            );
        }

        $dstBoard = webapp_post_history_board($dstBoTable);
        if ($insertId <= 0 || !webapp_post_history_is_tracked_board($dstBoard) || !webapp_post_history_table_ready()) {
            return;
        }
        if (!webapp_post_history_acquire($dstBoTable, $insertId)) {
            error_log('[post-history] could not acquire destination lock for transferred post ' . $dstBoTable . '/' . $insertId);
            return;
        }
        try {
            if (webapp_post_history_latest($dstBoTable, $insertId)) {
                return;
            }
            $snapshot = webapp_post_history_snapshot($dstBoTable, $insertId);
            if (!$snapshot) {
                return;
            }
            $action = (string) $mode === 'move' ? '이동' : '복사';
            $note = ($sourceBoTable !== '' ? $sourceBoTable : '알 수 없는 게시판') . '에서 게시글을 ' . $action . '해 이력 추적을 시작';
            $actor = webapp_post_history_actor($GLOBALS['member'] ?? null, $dstBoard);
            if (!webapp_post_history_append($dstBoTable, $insertId, $snapshot, 'created', webapp_post_history_source(), $actor, $note)) {
                error_log('[post-history] could not record transferred post ' . $dstBoTable . '/' . $insertId);
            }
        } finally {
            webapp_post_history_release($dstBoTable, $insertId);
        }
    }
}

if (!function_exists('webapp_post_history_on_move_update')) {
    /** 원본 글이 실제로 사라진 이동 건만 기존 게시판의 이력을 지운다. */
    function webapp_post_history_on_move_update($boTable, $targetBoards, $wrIdList, $openerHref = ''): void
    {
        $sourceBoTable = webapp_post_history_transfer_source((string) $boTable);
        if ($sourceBoTable === '' || !webapp_post_history_is_tracked_board(webapp_post_history_board($sourceBoTable))) {
            return;
        }

        $movedPosts = $GLOBALS['webapp_post_history_moved_posts'] ?? array();
        foreach ($movedPosts as $post) {
            if (($post['bo_table'] ?? '') !== $sourceBoTable) {
                continue;
            }
            $wrId = (int) ($post['wr_id'] ?? 0);
            if ($wrId > 0 && webapp_post_history_snapshot($sourceBoTable, $wrId) === null) {
                $targetBoTable = (string) ($post['target_bo_table'] ?? '');
                if (!webapp_post_history_archive($sourceBoTable, $wrId, 'moved', $targetBoTable)) {
                    error_log('[post-history] could not archive moved post ' . $sourceBoTable . '/' . $wrId);
                }
            }
        }
        unset($GLOBALS['webapp_post_history_moved_posts']);
        if (isset($GLOBALS['webapp_post_history_transfer_source'])) {
            unset($GLOBALS['webapp_post_history_transfer_source']);
        }
    }
}

if (!function_exists('webapp_post_history_can_view')) {
    function webapp_post_history_can_view($member, $boTable, $board): bool
    {
        if (!is_array($member) || empty($member['mb_id']) || !webapp_post_history_is_tracked_board($board)
            || !webapp_post_history_table_ready()) {
            return false;
        }
        if (class_exists('Auth')) {
            return Auth::adminRole($member, (string) $boTable) !== '';
        }
        return webapp_post_history_actor($member, $board)['role'] !== 'member';
    }
}

if (!function_exists('webapp_post_history_list')) {
    function webapp_post_history_list(string $boTable, int $wrId, int $beforeId = 0, int $limit = 20): array
    {
        $table = webapp_post_history_table();
        $bo = sql_real_escape_string($boTable);
        $before = $beforeId > 0 ? " AND rev_id < {$beforeId}" : '';
        $limit = max(1, min(51, $limit));
        $result = sql_query("SELECT rev_id, rev_no, event, source, actor_mb_id, actor_name, actor_role, note, content_hash, created_at
                             FROM `{$table}`
                             WHERE bo_table = '{$bo}' AND wr_id = {$wrId} AND archived_at IS NULL AND capture_status = 'finalized'{$before}
                             ORDER BY rev_id DESC LIMIT {$limit}", false);
        $items = array();
        while ($result && ($row = sql_fetch_array($result))) {
            $row['rev_id'] = (int) $row['rev_id'];
            $row['rev_no'] = (int) $row['rev_no'];
            $items[] = $row;
        }
        return $items;
    }
}

if (!function_exists('webapp_post_history_get')) {
    function webapp_post_history_get(string $boTable, int $wrId, int $revId): ?array
    {
        $table = webapp_post_history_table();
        $bo = sql_real_escape_string($boTable);
        $row = sql_fetch("SELECT rev_id, rev_no, event, source, actor_mb_id, actor_name, actor_role, note, content_hash,
                                 wr_subject, wr_seo_title, ca_name, wr_option, wr_link1, wr_link2, wr_content, created_at
                          FROM `{$table}`
                          WHERE bo_table = '{$bo}' AND wr_id = {$wrId} AND rev_id = {$revId}
                            AND archived_at IS NULL AND capture_status = 'finalized'
                          LIMIT 1", false);
        if (!$row) {
            return null;
        }
        $row['rev_id'] = (int) $row['rev_id'];
        $row['rev_no'] = (int) $row['rev_no'];
        return $row;
    }
}

if (function_exists('add_event')) {
    add_event('write_update_before', 'webapp_post_history_on_write_before', 5, 4);
    add_event('write_update_after', 'webapp_post_history_on_write_after', 5, 5);
    add_event('bbs_delete', 'webapp_post_history_on_delete', 5, 2);
    add_event('bbs_move_copy', 'webapp_post_history_on_move_copy', 5, 5);
    add_event('bbs_move_update', 'webapp_post_history_on_move_update', 5, 4);
}
