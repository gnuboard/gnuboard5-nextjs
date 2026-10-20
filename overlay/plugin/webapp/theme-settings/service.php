<?php
/**
 * 테마 화면 설정 — 고치는 일을 한 곳에. 관리자 화면(admin.php)과 화면 편집 API(api/v1/theme-settings.php)가 같이 쓴다.
 * 권한(최고관리자) · 토큰 검사는 부르는 쪽이 한다. 여기서는 값을 정리해 저장만 한다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('webapp_theme_settings_groups')) {
    /** 게시판 그룹 목록 — 매뉴얼 그룹을 고르는 칸. @return array<int, array{gr_id:string, gr_subject:string}> */
    function webapp_theme_settings_groups(): array
    {
        global $g5;
        $groups = array();
        $result = sql_query("SELECT gr_id, gr_subject FROM `{$g5['group_table']}` ORDER BY gr_order, gr_id", false);
        while ($result && ($row = sql_fetch_array($result))) {
            $groups[] = array('gr_id' => (string) $row['gr_id'], 'gr_subject' => (string) $row['gr_subject']);
        }
        return $groups;
    }
}

/** 변경 번호가 달라 저장하지 않았을 때의 안내 — 편집 창을 연 뒤 다른 곳(관리자 화면 · 다른 창)에서 먼저 저장했다. */
if (!defined('WEBAPP_THEME_SETTINGS_CONFLICT')) define('WEBAPP_THEME_SETTINGS_CONFLICT', '다른 곳에서 먼저 설정을 저장했습니다. 편집 창을 다시 열어 주세요.');
/** 설정 표가 없을 때의 안내. */
if (!defined('WEBAPP_THEME_SETTINGS_SAVE_FAILED')) define('WEBAPP_THEME_SETTINGS_SAVE_FAILED', '저장하지 못했습니다. DB 업그레이드(/adm/dbupgrade.php)를 한 번 열어 표를 만든 뒤 다시 저장해 주세요.');

if (!function_exists('webapp_theme_settings_affected_rows')) {
    /** 바로 앞 쓰기가 바꾼 행 수. 5.6.41 의 get_sql_affected_rows() 가 없는 예전 코어는 mysqli 로 직접 — 모르면 -1. */
    function webapp_theme_settings_affected_rows(): int
    {
        global $g5;
        if (function_exists('get_sql_affected_rows')) {
            return (int) get_sql_affected_rows();
        }
        $link = $g5['connect_db'] ?? null;
        return $link instanceof mysqli ? (int) mysqli_affected_rows($link) : -1;
    }
}

if (!function_exists('webapp_theme_settings_save_expected')) {
    /**
     * 변경 번호가 $expected 일 때만 저장한다. 검사와 저장이 한 SQL 문장이라, 같은 번호를 들고 동시에 온 두 저장 중 하나만
     * 들어간다(다른 하나는 -1). $expected 0 = 한 번도 저장하지 않은 테마 — 행이 없을 때만 넣는다.
     *
     * @return int 새 변경 번호, 0 = 저장 실패(표 없음 등), -1 = 변경 번호가 달라 저장하지 않음.
     */
    function webapp_theme_settings_save_expected(string $theme, $input, string $mbId, int $expected): int
    {
        if (!webapp_theme_settings_valid_theme($theme) || !function_exists('sql_query') || $expected < 0) {
            return 0;
        }
        $json = json_encode(webapp_theme_settings_normalize($input), JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return 0;
        }
        $table = webapp_theme_settings_table();
        $theme_sql = sql_real_escape_string($theme);
        $json_sql = sql_real_escape_string($json);
        $by_sql = sql_real_escape_string(substr($mbId, 0, 20));
        $saved = $expected === 0
            ? sql_query("INSERT IGNORE INTO `{$table}` (ts_theme, ts_value, ts_revision, ts_updated_at, ts_updated_by)
                         VALUES ('{$theme_sql}', '{$json_sql}', 1, '" . G5_TIME_YMDHIS . "', '{$by_sql}')", false)
            : sql_query("UPDATE `{$table}` SET ts_value = '{$json_sql}', ts_revision = ts_revision + 1,
                                ts_updated_at = '" . G5_TIME_YMDHIS . "', ts_updated_by = '{$by_sql}'
                         WHERE ts_theme = '{$theme_sql}' AND ts_revision = " . (int) $expected, false);
        if (!$saved) {
            return 0;
        }
        $affected = webapp_theme_settings_affected_rows();
        if ($affected === 0) {
            return -1;
        }
        if ($affected < 0) {
            return 0;
        }
        // 뒤따른 조회는 다른 저장이 올린 번호를 읽을 수 있다. 이 SQL 문장이 올린 번호만 돌려준다.
        return $expected + 1;
    }
}

if (!function_exists('webapp_theme_settings_update')) {
    /**
     * 설정(docs · sidebar · site)을 저장하고 매뉴얼 게시판의 출력 순서 · 제목을 고친다.
     * 고칠 수 있는 게시판은 저장 전 매뉴얼 그룹(화면에 보였던 목록)의 게시판뿐 — 그룹을 바꾸는 저장에서 새 그룹 게시판을
     * 건드리지 않게. 게시판은 바꾼 칸만 쓴다(webapp_theme_settings_board_updates 의 orig_*). $input 은 값이 이미 stripslashes 된
     * 배열(폼 · JSON 본문).
     *
     * $expected(변경 번호)를 주면 그 번호일 때만 저장한다(화면 편집 창). 주지 않으면 마지막 저장이 이긴다(관리자 화면).
     * 게시판 수정이 실패하면 숨기지 않고 error 로 알린다 — 설정은 이미 저장됐으므로 revision 은 새 번호다.
     *
     * @return array{revision:int, error:string, conflict:bool}
     */
    function webapp_theme_settings_update(string $theme, array $input, array $boards, string $mbId, ?int $expected = null): array
    {
        global $g5;
        $before = webapp_theme_settings_load($theme)['settings']['docs']['group'];
        $allowed = array_map(static function ($row) { return (string) $row['bo_table']; }, webapp_theme_settings_group_boards($before));

        $values = array(
            'docs' => isset($input['docs']) && is_array($input['docs']) ? $input['docs'] : array(),
            'sidebar' => isset($input['sidebar']) && is_array($input['sidebar']) ? $input['sidebar'] : array(),
            'site' => isset($input['site']) && is_array($input['site']) ? $input['site'] : array(),
        );
        $revision = $expected === null
            ? webapp_theme_settings_save($theme, $values, $mbId)
            : webapp_theme_settings_save_expected($theme, $values, $mbId, $expected);
        if ($revision === -1) {
            return array('revision' => 0, 'error' => WEBAPP_THEME_SETTINGS_CONFLICT, 'conflict' => true);
        }
        if ($revision === 0) {
            return array('revision' => 0, 'error' => WEBAPP_THEME_SETTINGS_SAVE_FAILED, 'conflict' => false);
        }

        $failed = array();
        foreach (webapp_theme_settings_board_updates($boards, $allowed) as $table => $update) {
            $set = array();
            if (isset($update['order'])) {
                $set[] = "bo_order = '" . (int) $update['order'] . "'";
            }
            if (isset($update['subject'])) {
                $set[] = "bo_subject = '" . sql_real_escape_string($update['subject']) . "'";
            }
            $sql = "UPDATE `{$g5['board_table']}` SET " . implode(', ', $set) . " WHERE bo_table = '" . sql_real_escape_string($table) . "'";
            if (!sql_query($sql, false)) {
                $failed[] = $table;
            }
        }
        if ($failed !== array()) {
            return array(
                'revision' => $revision,
                'error' => '설정은 저장했지만 게시판(' . implode(', ', $failed) . ')의 순서 · 이름을 고치지 못했습니다. 그 칸은 입력한 값 그대로 두었으니 다시 저장해 보세요.',
                'conflict' => false,
                'failed' => $failed,
            );
        }
        return array('revision' => $revision, 'error' => '', 'conflict' => false, 'failed' => array());
    }
}

if (!function_exists('webapp_theme_settings_update_chapters')) {
    /**
     * 한 매뉴얼의 장 순서를 저장한다(매뉴얼 그룹의 게시판만). $orders 는 wr_id => 순서 번호.
     * 저장하면 설정을 그대로 다시 저장해 변경 번호를 올린다 — 화면의 목차 캐시(열쇠에 변경 번호가 든다)를 버리게.
     *
     * $expected 를 주면(화면 편집 창) 변경 번호부터 확인 · 올린 뒤 장을 옮긴다 — 다른 곳에서 먼저 저장했으면 아무것도
     * 옮기지 않는다. 장 옮기기가 실패해도 번호는 되돌리지 않고 이 요청이 올린 번호를 돌려준다. 주지 않으면(관리자 화면)
     * 옮긴 뒤 저장 직전의 설정을 다시 읽어 번호만 올린다.
     *
     * @return array{revision:int, error:string, conflict:bool}
     */
    function webapp_theme_settings_update_chapters(string $theme, string $bo_table, array $orders, string $mbId, ?int $expected = null): array
    {
        if (!function_exists('webapp_theme_settings_reorder_chapters')) {
            return array('revision' => 0, 'error' => '장 순서 기능을 불러오지 못했습니다.', 'conflict' => false);
        }
        $loaded = webapp_theme_settings_load($theme);
        $board = webapp_theme_settings_chapter_board($bo_table, webapp_theme_settings_group_boards($loaded['settings']['docs']['group']));
        if ($board === null) {
            return array('revision' => 0, 'error' => '매뉴얼 그룹의 게시판이 아닙니다.', 'conflict' => false);
        }

        if ($expected !== null) {
            $revision = webapp_theme_settings_save_expected($theme, $loaded['settings'], $mbId, $expected);
            if ($revision === -1) {
                return array('revision' => 0, 'error' => WEBAPP_THEME_SETTINGS_CONFLICT, 'conflict' => true);
            }
            if ($revision === 0) {
                return array('revision' => 0, 'error' => WEBAPP_THEME_SETTINGS_SAVE_FAILED, 'conflict' => false);
            }
            $error = webapp_theme_settings_reorder_chapters($bo_table, $board['category_list'], $orders);
            if ($error !== '') {
                return array('revision' => $revision, 'error' => $error, 'conflict' => false);
            }
            return array('revision' => $revision, 'error' => '', 'conflict' => false);
        }

        $error = webapp_theme_settings_reorder_chapters($bo_table, $board['category_list'], $orders);
        if ($error !== '') {
            return array('revision' => 0, 'error' => $error, 'conflict' => false);
        }
        // 저장 직전에 다시 읽는다 — 장 순서를 옮기는 사이 다른 곳에서 저장한 설정을 예전 값으로 되돌리지 않게.
        $revision = webapp_theme_settings_save($theme, webapp_theme_settings_load($theme)['settings'], $mbId);
        return $revision === 0
            ? array('revision' => 0, 'error' => '장 순서는 저장했지만 변경 번호를 올리지 못했습니다. 화면을 새로고침해 주세요.', 'conflict' => false)
            : array('revision' => $revision, 'error' => '', 'conflict' => false);
    }
}

if (!function_exists('webapp_theme_settings_editor_state')) {
    /**
     * 화면 편집 창이 여는 값 — 저장된 설정 · 변경 번호, 게시판 그룹 목록, 지금 매뉴얼 그룹의 게시판(순서 · 제목 · 글 수).
     * 안내 문구가 없는 맵은 JSON 객체로 나가게 한다(빈 배열 [] 이 아니라).
     */
    function webapp_theme_settings_editor_state(string $theme): array
    {
        $loaded = webapp_theme_settings_load($theme);
        $settings = $loaded['settings'];
        $boards = array_map(static function ($row) {
            return array(
                'bo_table' => (string) $row['bo_table'],
                'bo_subject' => (string) $row['bo_subject'],
                'bo_order' => (int) $row['bo_order'],
                'bo_count_write' => (int) ($row['bo_count_write'] ?? 0),
            );
        }, webapp_theme_settings_group_boards($settings['docs']['group']));
        if ($settings['docs']['hints'] === array()) {
            $settings['docs']['hints'] = new stdClass();
        }
        return array(
            'theme' => $theme,
            'revision' => $loaded['revision'],
            'settings' => $settings,
            'groups' => webapp_theme_settings_groups(),
            'boards' => $boards,
        );
    }
}

if (!function_exists('webapp_theme_settings_editor_chapters')) {
    /**
     * 장 순서 탭이 여는 값 — 매뉴얼 그룹의 게시판이면 그 게시판과 장 목록(목차 순서, 부 이름 포함), 아니면 null.
     * 장이 너무 많으면 chapters 가 false 다(WEBAPP_CHAPTER_ORDER_MAX).
     */
    function webapp_theme_settings_editor_chapters(string $theme, string $bo_table): ?array
    {
        global $g5;
        if (!function_exists('webapp_theme_settings_chapter_board')) {
            return null;
        }
        $settings = webapp_theme_settings_load($theme)['settings'];
        $board = webapp_theme_settings_chapter_board($bo_table, webapp_theme_settings_group_boards($settings['docs']['group']));
        if ($board === null) {
            return null;
        }
        $rows = webapp_theme_settings_chapter_rows($g5['write_prefix'] . $bo_table);
        $chapters = false;
        if (is_array($rows)) {
            $chapters = array_map(static function ($row) {
                $part = webapp_theme_settings_js_trim($row['ca_name'] ?? '');
                return array(
                    'wr_id' => (int) $row['wr_id'],
                    'wr_subject' => (string) $row['wr_subject'],
                    'part' => $part !== '' ? $part : WEBAPP_CHAPTER_UNGROUPED,
                );
            }, webapp_theme_settings_chapter_toc_order($rows, $board['category_list']));
        }
        return array(
            'table' => $board['table'],
            'subject' => $board['subject'],
            'chapters' => $chapters,
            'max' => (int) WEBAPP_CHAPTER_ORDER_MAX,
        );
    }
}
