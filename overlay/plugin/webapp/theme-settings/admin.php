<?php
/**
 * 관리자 → 환경설정 → 테마 화면 설정(왼쪽 메뉴 · 사이트 문구).
 *
 * 코어를 고치지 않고 그누보드 관리자 훅으로만 붙인다(notify/admin.php 와 같은 방식).
 *   - add_replace('admin_menu', …)                       메뉴 등록 — 이 설정을 읽는 테마를 쓸 때만
 *   - add_event('admin_request_handler_theme_settings')  저장(POST) · 조회 (head 전)
 *   - add_event('admin_get_page_theme_settings')         화면 출력 (head~tail 사이)
 *
 * 진입: /adm/view.php?call=theme_settings   권한: 최고관리자만.
 * 저장: 설정은 g5_theme_setting(settings.php), 매뉴얼 순서 · 제목은 게시판(g5_board)의 bo_order · bo_subject —
 * 기준을 하나로 둔다(게시판관리 화면에서 고쳐도 같은 값이다). 고치는 게시판은 저장 전 매뉴얼 그룹(화면에 보였던 것)의 게시판뿐.
 */
if (!defined('_GNUBOARD_')) exit;

// 이 설정을 읽는 테마(쉼표로 여럿). 다른 테마를 쓰는 사이트에는 메뉴를 보이지 않는다.
if (!defined('WEBAPP_THEME_SETTINGS_THEMES')) define('WEBAPP_THEME_SETTINGS_THEMES', 'handbook');

if (!function_exists('webapp_theme_settings_admin_available')) {
    function webapp_theme_settings_admin_available(string $theme): bool
    {
        $themes = array_filter(array_map('trim', explode(',', (string) WEBAPP_THEME_SETTINGS_THEMES)));
        return $theme !== '' && in_array($theme, $themes, true);
    }
}

if (!function_exists('webapp_theme_settings_admin_menu')) {
    add_replace('admin_menu', 'webapp_theme_settings_admin_menu', 1, 1);
    add_event('admin_request_handler_theme_settings', 'webapp_theme_settings_request_handler', 1, 2);
    add_event('admin_get_page_theme_settings', 'webapp_theme_settings_get_page', 1, 2);

    /** 환경설정(menu100) 아래 — 100960 은 admin.menu100.php 와 우리 플러그인에서 쓰지 않는 번호. */
    function webapp_theme_settings_admin_menu($admin_menu)
    {
        if (webapp_theme_settings_admin_available(webapp_theme_settings_active_theme())) {
            $admin_menu['menu100'][] = array(
                '100960',
                '테마 화면 설정',
                G5_ADMIN_URL . '/view.php?call=theme_settings',
                'theme_settings',
            );
        }
        return $admin_menu;
    }
}

if (!function_exists('webapp_theme_settings_admin_state')) {
    /** 핸들러가 담은 조회 결과를 렌더러로 넘기는 상자. 전역을 더럽히지 않는다. */
    function webapp_theme_settings_admin_state($set = null): array
    {
        static $state = array();
        if (is_array($set)) {
            $state = $set;
        }
        return $state;
    }
}

if (!function_exists('webapp_theme_settings_board_updates')) {
    /**
     * 화면에서 보낸 게시판별 출력 순서 · 제목을 고칠 값으로 정리한다. $allowed(저장 전 매뉴얼 그룹의 게시판) 밖은 버린다.
     * 빈 제목은 고치지 않는다(게시판 제목을 지우지 않게).
     *
     * @return array<string, array{order:int, subject?:string}>
     */
    function webapp_theme_settings_board_updates(array $posted, array $allowed): array
    {
        $out = array();
        foreach ($allowed as $table) {
            $table = (string) $table;
            if (!isset($posted[$table]) || !is_array($posted[$table])) {
                continue;
            }
            $row = $posted[$table];
            $update = array('order' => max(0, min(9999, (int) ($row['order'] ?? 0))));
            $subject = webapp_theme_settings_text($row['subject'] ?? '', 255);
            if ($subject !== '') {
                $update['subject'] = $subject;
            }
            $out[$table] = $update;
        }
        return $out;
    }
}

if (!function_exists('webapp_theme_settings_group_boards')) {
    /** 매뉴얼 그룹의 게시판 — 출력 순서, 같으면 제목 순(화면의 매뉴얼 순서와 같다). */
    function webapp_theme_settings_group_boards(string $group): array
    {
        global $g5;
        if ($group === '' || !preg_match('/^[A-Za-z0-9_]{1,10}$/', $group)) {
            return array();
        }
        $rows = array();
        $result = sql_query("SELECT bo_table, bo_subject, bo_order, bo_count_write FROM `{$g5['board_table']}`
                             WHERE gr_id = '" . sql_real_escape_string($group) . "' ORDER BY bo_order, bo_subject", false);
        while ($result && ($row = sql_fetch_array($result))) {
            $rows[] = $row;
        }
        return $rows;
    }
}

if (!function_exists('webapp_theme_settings_admin_chapters')) {
    /** 장 순서 화면에 보일 것 — 매뉴얼 그룹의 게시판일 때 그 게시판과 장 목록(목차 순서, 너무 많으면 false). */
    function webapp_theme_settings_admin_chapters(string $bo_table, array $group_boards): ?array
    {
        global $g5;
        $board = webapp_theme_settings_chapter_board($bo_table, $group_boards);
        if ($board === null) {
            return null;
        }
        $rows = webapp_theme_settings_chapter_rows($g5['write_prefix'] . $bo_table);
        $board['rows'] = is_array($rows) ? webapp_theme_settings_chapter_toc_order($rows, $board['category_list']) : $rows;
        return $board;
    }
}

if (!function_exists('webapp_theme_settings_request_handler')) {
    function webapp_theme_settings_request_handler($arr_query, $token)
    {
        global $is_admin, $member, $g5;

        if ($is_admin !== 'super') {
            alert('최고관리자만 접근 가능합니다.');
        }
        $theme = webapp_theme_settings_active_theme();
        if (!webapp_theme_settings_admin_available($theme)) {
            alert('지금 적용한 테마는 이 설정을 쓰지 않습니다.');
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            check_admin_token();
            admin_referer_check();

            // common.php 가 모든 입력에 addslashes 를 걸어 두었다 — JSON 으로 저장하기 전에 되돌린다.
            $post = array_map_deep('stripslashes', $_POST);

            // 장 순서 저장(chapters.php) — 매뉴얼 그룹의 게시판만. 설정 저장과 따로 보내는 폼이다.
            if (($post['mode'] ?? '') === 'chapters' && function_exists('webapp_theme_settings_reorder_chapters')) {
                $board = (string) ($post['chapters_board'] ?? '');
                $current = webapp_theme_settings_load($theme)['settings'];
                $chapter_board = webapp_theme_settings_chapter_board($board, webapp_theme_settings_group_boards($current['docs']['group']));
                if ($chapter_board === null) {
                    alert('매뉴얼 그룹의 게시판이 아닙니다.');
                }
                $orders = isset($post['chapter_order']) && is_array($post['chapter_order']) ? $post['chapter_order'] : array();
                $error = webapp_theme_settings_reorder_chapters($board, $chapter_board['category_list'], $orders);
                if ($error !== '') {
                    alert($error);
                }
                // 변경 번호를 올려 화면의 목차 캐시(브라우저 sessionStorage 열쇠)를 버리게 한다 — 설정 값은 그대로 다시 저장.
                webapp_theme_settings_save($theme, $current, (string) $member['mb_id']);
                goto_url(G5_ADMIN_URL . '/view.php?call=theme_settings&chapters=' . rawurlencode($board) . '&saved=chapters#ts-chapters');
            }

            // 고칠 수 있는 게시판은 저장 전 그룹(화면에 보였던 목록)의 게시판뿐 — 그룹을 바꾸는 저장에서 새 그룹 게시판을 건드리지 않게.
            $before = webapp_theme_settings_load($theme)['settings']['docs']['group'];
            $allowed = array_map(static function ($row) { return (string) $row['bo_table']; }, webapp_theme_settings_group_boards($before));

            $input = array(
                'docs' => isset($post['docs']) && is_array($post['docs']) ? $post['docs'] : array(),
                'sidebar' => isset($post['sidebar']) && is_array($post['sidebar']) ? $post['sidebar'] : array(),
                'site' => isset($post['site']) && is_array($post['site']) ? $post['site'] : array(),
            );
            if (webapp_theme_settings_save($theme, $input, (string) $member['mb_id']) === 0) {
                alert('저장하지 못했습니다. DB 업그레이드(/adm/dbupgrade.php)를 한 번 열어 표를 만든 뒤 다시 저장해 주세요.');
            }

            $boards = isset($post['boards']) && is_array($post['boards']) ? $post['boards'] : array();
            foreach (webapp_theme_settings_board_updates($boards, $allowed) as $table => $update) {
                $set = "bo_order = '" . (int) $update['order'] . "'";
                if (isset($update['subject'])) {
                    $set .= ", bo_subject = '" . sql_real_escape_string($update['subject']) . "'";
                }
                sql_query("UPDATE `{$g5['board_table']}` SET {$set} WHERE bo_table = '" . sql_real_escape_string($table) . "'", false);
            }

            goto_url(G5_ADMIN_URL . '/view.php?call=theme_settings&saved=1');
        }

        $loaded = webapp_theme_settings_load($theme);
        $groups = array();
        $result = sql_query("SELECT gr_id, gr_subject FROM `{$g5['group_table']}` ORDER BY gr_order, gr_id", false);
        while ($result && ($row = sql_fetch_array($result))) {
            $groups[] = $row;
        }
        $group_boards = webapp_theme_settings_group_boards($loaded['settings']['docs']['group']);
        webapp_theme_settings_admin_state(array(
            'theme' => $theme,
            'settings' => $loaded['settings'],
            'revision' => $loaded['revision'],
            'groups' => $groups,
            'boards' => $group_boards,
            'saved' => ($_GET['saved'] ?? '') === '1',
            // 장 순서 화면(?chapters=게시판) — 매뉴얼 그룹의 게시판일 때만.
            'chapters' => isset($_GET['chapters']) && is_string($_GET['chapters']) && function_exists('webapp_theme_settings_chapter_board')
                ? webapp_theme_settings_admin_chapters($_GET['chapters'], $group_boards)
                : null,
            'chapters_saved' => ($_GET['saved'] ?? '') === 'chapters',
        ));
    }
}

if (!function_exists('webapp_theme_settings_get_page')) {
    function webapp_theme_settings_get_page($arr_query, $token)
    {
        global $is_admin;
        // 핸들러가 먼저 막지만, 핸들러를 거치지 않고 불려도 화면을 내지 않는다.
        if ($is_admin !== 'super') {
            return;
        }
        echo webapp_theme_settings_admin_html(webapp_theme_settings_admin_state(), get_admin_token());
    }
}

if (!function_exists('webapp_theme_settings_admin_html')) {
    /** 화면 HTML — 넣는 값은 모두 이스케이프한다. 저장 버튼은 그누보드 관리자처럼 위에 고정. */
    function webapp_theme_settings_admin_html(array $state, string $token): string
    {
        // 장 순서는 따로 연 한 장(chapters.php) — 위에 고정된 설정 "저장" 단추와 섞이지 않게.
        if (!empty($state['chapters']) && function_exists('webapp_theme_settings_chapters_html')) {
            return webapp_theme_settings_chapters_html($state['chapters'], $token, !empty($state['chapters_saved']));
        }
        $h = static function ($value): string {
            return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
        };
        $settings = isset($state['settings']) ? $state['settings'] : webapp_theme_settings_defaults();
        $group = $settings['docs']['group'];
        $hints = $settings['docs']['hints'];
        $site = $settings['site'];

        $out = '<form method="post" action="' . $h(G5_ADMIN_URL . '/view.php?call=theme_settings') . '">';
        $out .= '<input type="hidden" name="token" value="' . $h($token) . '">';
        if (!empty($state['saved'])) {
            $out .= '<div class="local_desc01 local_desc"><p>저장했습니다. 다시 빌드할 필요 없습니다 — 이 사이트가 내는 화면은 새로고침하면 바로, Next 서버(next start · Vercel)로 내는 화면은 30초 안에 바뀝니다.</p></div>';
        }
        $out .= '<div class="local_desc01 local_desc"><p>적용한 테마: <strong>' . $h($state['theme'] ?? '') . '</strong> · 변경 번호 '
            . (int) ($state['revision'] ?? 0) . '. 메뉴 항목은 <a href="' . $h(G5_ADMIN_URL . '/menu_list.php') . '">메뉴설정</a>, '
            . '매뉴얼로 쓸 게시판을 더하거나 빼는 일은 <a href="' . $h(G5_ADMIN_URL . '/board_list.php') . '">게시판관리</a>에서 그룹을 바꿉니다.</p></div>';

        // 매뉴얼
        $out .= '<section><h2 class="h2_frm">매뉴얼</h2><div class="tbl_frm01 tbl_wrap"><table><tbody>';
        $out .= '<tr><th scope="row"><label for="ts_docs_group">매뉴얼 게시판 그룹</label></th><td>'
            . '<select name="docs[group]" id="ts_docs_group"><option value="">(정하지 않음 — 빌드 때 정한 그룹)</option>';
        foreach ((array) ($state['groups'] ?? array()) as $row) {
            $id = (string) $row['gr_id'];
            $out .= '<option value="' . $h($id) . '"' . ($id === $group ? ' selected' : '') . '>' . $h($row['gr_subject'] . ' (' . $id . ')') . '</option>';
        }
        $out .= '</select> <span class="frm_info">이 그룹의 게시판 하나가 매뉴얼 한 권, 게시판 분류가 부, 글이 장이 됩니다. 그룹을 바꾸면 저장한 뒤 아래 목록이 바뀝니다. 정하지 않으면 테마를 빌드할 때 정한 그룹(NEXT_PUBLIC_DOCS_GROUP)을 쓰고, 그것도 없으면 매뉴얼이 없습니다.</span></td></tr>';
        $out .= '</tbody></table></div>';

        $boards = (array) ($state['boards'] ?? array());
        if ($boards !== array()) {
            $out .= '<div class="tbl_head01 tbl_wrap"><table><caption>매뉴얼 목록</caption><thead><tr>'
                . '<th scope="col">출력 순서</th><th scope="col">매뉴얼 이름(게시판 제목)</th><th scope="col">안내 문구</th><th scope="col">장</th></tr></thead><tbody>';
            foreach ($boards as $row) {
                $table = (string) $row['bo_table'];
                $out .= '<tr><td class="td_num"><input type="number" min="0" max="9999" name="boards[' . $h($table) . '][order]" value="' . (int) $row['bo_order'] . '" class="tbl_input" size="4"></td>'
                    . '<td><input type="text" name="boards[' . $h($table) . '][subject]" value="' . $h($row['bo_subject']) . '" class="tbl_input full_input" maxlength="255"> <span class="frm_info">' . $h($table) . '</span></td>'
                    . '<td><input type="text" name="docs[hints][' . $h($table) . ']" value="' . $h($hints[$table] ?? '') . '" class="tbl_input full_input" maxlength="100" placeholder="비우면 제목의 &quot;안내 · 이름&quot;에서"></td>'
                    . '<td class="td_num">' . (int) $row['bo_count_write']
                    . ' <a href="' . $h(G5_ADMIN_URL . '/view.php?call=theme_settings&chapters=' . rawurlencode($table)) . '#ts-chapters">순서</a></td></tr>';
            }
            $out .= '</tbody></table></div>';
        }
        $out .= '</section>';

        // 왼쪽 사이드바
        $screens = array('home' => '첫 화면', 'docs' => '매뉴얼 화면(목록 · 장)', 'board' => '게시판 화면(매뉴얼이 아닌 게시판의 목록 · 글)', 'other' => '그 밖의 화면(쇼핑몰 · 마이페이지 · FAQ …)');
        $out .= '<section><h2 class="h2_frm">왼쪽 사이드바</h2><div class="local_desc02 local_desc"><p>숨기면 넓은 화면(1280px 이상)에서 왼쪽 열을 두지 않고 본문을 넓게 씁니다. 좁은 화면의 메뉴 단추(서랍)는 그대로입니다.</p></div>'
            . '<div class="tbl_frm01 tbl_wrap"><table><tbody>';
        foreach ($screens as $key => $label) {
            $mode = $settings['sidebar'][$key];
            $out .= '<tr><th scope="row"><label for="ts_sidebar_' . $key . '">' . $h($label) . '</label></th><td>'
                . '<select name="sidebar[' . $key . ']" id="ts_sidebar_' . $key . '">'
                . '<option value="auto"' . ($mode === 'auto' ? ' selected' : '') . '>화면에 맞게 보이기</option>'
                . '<option value="hidden"' . ($mode === 'hidden' ? ' selected' : '') . '>숨기기</option></select></td></tr>';
        }
        $out .= '</tbody></table></div></section>';

        // 사이트 문구
        $fields = array(
            'name' => array('사이트 이름', 60), 'logoText' => array('로고 글자', 30), 'description' => array('사이트 소개', 200),
            'homeTitle' => array('첫 화면 제목', 60), 'homeDescription' => array('첫 화면 소개', 300),
            'footerDescription' => array('바닥글 소개', 300), 'customerCenterTitle' => array('고객센터 제목', 40),
            'copyrightName' => array('저작권 표시 이름', 60),
        );
        $out .= '<section><h2 class="h2_frm">사이트 문구</h2><div class="local_desc02 local_desc"><p>비워 두면 테마의 기본 문구를 씁니다. 화면(로고 · 첫 화면 · 바닥글)에 보이는 문구이고, 브라우저 탭 · 검색 결과의 사이트 이름은 기본환경설정의 홈페이지 제목입니다.</p></div>'
            . '<div class="tbl_frm01 tbl_wrap"><table><tbody>';
        foreach ($fields as $key => $field) {
            $out .= '<tr><th scope="row"><label for="ts_site_' . $key . '">' . $h($field[0]) . '</label></th><td>'
                . '<input type="text" name="site[' . $key . ']" id="ts_site_' . $key . '" value="' . $h($site[$key]) . '" class="frm_input full_input" maxlength="' . (int) $field[1] . '"></td></tr>';
        }
        $out .= '<tr><th scope="row"><label for="ts_site_lines">고객센터 안내</label></th><td>'
            . '<textarea name="site[customerCenterLines]" id="ts_site_lines" rows="5">' . $h(implode("\n", $site['customerCenterLines'])) . '</textarea>'
            . '<span class="frm_info">한 줄에 하나씩, 다섯 줄까지.</span></td></tr>';
        $out .= '</tbody></table></div></section>';

        $out .= '<div class="btn_fixed_top"><input type="submit" value="저장" class="btn_submit btn" accesskey="s"></div></form>';
        return $out;
    }
}
