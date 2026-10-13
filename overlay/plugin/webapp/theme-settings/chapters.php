<?php
/**
 * 관리자 › 테마 화면 설정 › 장 순서 — 매뉴얼(게시판) 한 권의 장(원글) 순서를 번호로 정한다.
 *
 * 장 순서는 게시판 목록 순서(wr_num 오름차순)다. 그누보드는 새 글에 가장 작은 wr_num - 1 을 줘 새 글이 맨 앞에 와서, 손으로 쓴
 * 매뉴얼은 마지막 장부터 써야 했다. 여기서 정한 순서대로 부(분류)마다 그 부의 원글들이 이미 가진 wr_num 값을 다시 나눠 준다 — 값의 모음은
 * 그대로라 새 글 번호 매기기는 예전과 같고, 답글 · 댓글은 원글과 같은 wr_num 이라 함께 옮겨진다. 게시판 목록 순서도 같이 바뀐다.
 * 그누보드 코어 파일은 고치지 않는다.
 */
if (!defined('_GNUBOARD_')) exit;

/** 한 매뉴얼에서 순서를 정하는 장 수 상한 — 한 화면에 다 보이게. */
if (!defined('WEBAPP_CHAPTER_ORDER_MAX')) define('WEBAPP_CHAPTER_ORDER_MAX', 1000);
/** 분류(ca_name)가 없는 장을 묶는 부 이름 — 화면(docs-nav.ts UNGROUPED_LABEL)과 같다. */
if (!defined('WEBAPP_CHAPTER_UNGROUPED')) define('WEBAPP_CHAPTER_UNGROUPED', '문서');

if (!function_exists('webapp_theme_settings_js_trim')) {
    /** JS 의 String.prototype.trim 과 같은 공백(유니코드 공백 · 줄 끝 · BOM)을 앞뒤에서 걷는다 — 화면과 같은 부 이름이 되게. */
    function webapp_theme_settings_js_trim($text): string
    {
        $space = '[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';
        $trimmed = preg_replace('/^' . $space . '+|' . $space . '+$/u', '', (string) $text);
        return is_string($trimmed) ? $trimmed : trim((string) $text);
    }
}

if (!function_exists('webapp_theme_settings_chapter_toc_order')) {
    /**
     * 매뉴얼 목차 순서로 놓는다 — 부는 게시판 분류 설정 순서(설정에 없는 부는 뒤, 처음 나온 차례), 부 안에서는 게시판 순서.
     * 화면의 groupDocsChapters(docs-nav.ts)와 같은 규칙이다. $rows 는 게시판 순서(wr_num 오름차순)여야 한다.
     * 부 이름을 배열 열쇠로 쓰지 않는다 — "1" 같은 이름이 숫자 열쇠로 바뀌어 분류 순서와 맞지 않았다.
     */
    function webapp_theme_settings_chapter_toc_order(array $rows, string $category_list): array
    {
        $categories = array_values(array_filter(array_map('webapp_theme_settings_js_trim', explode('|', $category_list)), 'strlen'));
        $labels = array();
        $buckets = array();
        foreach ($rows as $row) {
            $label = webapp_theme_settings_js_trim($row['ca_name'] ?? '');
            $label = $label !== '' ? $label : WEBAPP_CHAPTER_UNGROUPED;
            $index = array_search($label, $labels, true);
            if ($index === false) {
                $index = count($labels);
                $labels[] = $label;
                $buckets[] = array();
            }
            $buckets[$index][] = $row;
        }
        $rank = static function (int $index) use ($labels, $categories): int {
            $found = array_search($labels[$index], $categories, true);
            return $found === false ? count($categories) : (int) $found;
        };
        $order = array_keys($labels);
        usort($order, static function ($a, $b) use ($rank) {
            return ($rank($a) <=> $rank($b)) ?: ($a <=> $b);
        });
        $out = array();
        foreach ($order as $index) {
            foreach ($buckets[$index] as $row) {
                $out[] = $row;
            }
        }
        return $out;
    }
}

if (!function_exists('webapp_theme_settings_chapter_plan')) {
    /**
     * 새 순서 → 옮길 값. $rows 는 화면에 보인 차례(목차 순서), $posted 는 wr_id => 순서 번호.
     * 번호가 없거나 숫자가 아니면 보인 자리 그대로, 같은 번호면 보인 차례대로.
     *
     * 부마다 따로 나눠 준다 — 장의 부는 분류로 정해져 번호로 다른 부로 옮겨 가지 않으므로, 그 부의 원글들이 가진 wr_num 값(작은
     * 것부터)을 그 부 안의 새 순서로 나눠 준다. 그래서 번호를 바꾸지 않고 저장하면 아무것도 바뀌지 않고, 게시판 목록에서 여러 부가
     * 섞여 있던 차례도 그대로다(목차 순서 전체로 나눠 주면 저장만 해도 게시판 목록이 부별로 다시 섰다).
     * 돌려주는 값은 바뀌는 것만 [예전 wr_num => 새 wr_num]. 원글끼리 wr_num 이 겹치면 null(옮기면 섞인다).
     */
    function webapp_theme_settings_chapter_plan(array $rows, array $posted): ?array
    {
        $values = array_map(static function ($row) { return (int) $row['wr_num']; }, $rows);
        if (count(array_unique($values)) !== count($values)) {
            return null;
        }

        // 부 이름을 배열 열쇠로 쓸 때 "1" 같은 이름이 숫자 열쇠가 되지 않게 앞에 글자를 붙인다(순서는 처음 나온 차례 그대로).
        $parts = array();
        foreach (array_values($rows) as $index => $row) {
            $key = (string) $row['wr_id'];
            $order = isset($posted[$key]) && is_numeric($posted[$key]) ? (int) $posted[$key] : $index + 1;
            $label = webapp_theme_settings_js_trim($row['ca_name'] ?? '');
            $parts['p:' . ($label !== '' ? $label : WEBAPP_CHAPTER_UNGROUPED)][] = array('order' => $order, 'index' => $index, 'wr_num' => (int) $row['wr_num']);
        }

        $plan = array();
        foreach ($parts as $items) {
            $part_values = array_map(static function ($item) { return $item['wr_num']; }, $items);
            sort($part_values);
            usort($items, static function ($a, $b) {
                return ($a['order'] <=> $b['order']) ?: ($a['index'] <=> $b['index']);
            });
            foreach ($items as $position => $item) {
                if ($item['wr_num'] !== $part_values[$position]) {
                    $plan[$item['wr_num']] = $part_values[$position];
                }
            }
        }
        return $plan;
    }
}

if (!function_exists('webapp_theme_settings_chapter_update_sql')) {
    /**
     * 옮기기를 한 문장으로 — 바뀌는 글들의 wr_num 을 CASE 로 한꺼번에 바꾼다. 한 문장이라 중간 값이 남지 않고(겹침 없음),
     * 표를 잠글 권한(LOCK TABLES)도 필요 없다. 옮길 것이 없으면 ''.
     */
    function webapp_theme_settings_chapter_update_sql(string $write_table, array $plan): string
    {
        if ($plan === array()) {
            return '';
        }
        $cases = '';
        foreach ($plan as $old => $new) {
            $cases .= ' WHEN ' . (int) $old . ' THEN ' . (int) $new;
        }
        $olds = implode(', ', array_map('intval', array_keys($plan)));
        return "UPDATE `{$write_table}` SET wr_num = CASE wr_num{$cases} END WHERE wr_num IN ({$olds})";
    }
}

if (!function_exists('webapp_theme_settings_chapter_rows')) {
    /** 게시판의 원글(장) — 게시판 순서. 읽지 못하면 null, 너무 많으면(WEBAPP_CHAPTER_ORDER_MAX 초과) false. */
    function webapp_theme_settings_chapter_rows(string $write_table)
    {
        $rows = array();
        $limit = (int) WEBAPP_CHAPTER_ORDER_MAX + 1;
        $result = sql_query("SELECT wr_id, wr_num, wr_subject, ca_name FROM `{$write_table}`
                             WHERE wr_is_comment = 0 AND wr_reply = '' ORDER BY wr_num, wr_id LIMIT {$limit}", false);
        if (!$result) {
            return null;
        }
        while ($row = sql_fetch_array($result)) {
            $rows[] = $row;
        }
        return count($rows) > WEBAPP_CHAPTER_ORDER_MAX ? false : $rows;
    }
}

if (!function_exists('webapp_theme_settings_chapter_board')) {
    /** 매뉴얼 그룹에 든 게시판이면 [table, subject, category_list], 아니면 null. */
    function webapp_theme_settings_chapter_board(string $bo_table, array $group_boards): ?array
    {
        global $g5;
        if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $bo_table)) {
            return null;
        }
        foreach ($group_boards as $board) {
            if ((string) $board['bo_table'] === $bo_table) {
                $row = sql_fetch("SELECT bo_category_list FROM `{$g5['board_table']}` WHERE bo_table = '" . sql_real_escape_string($bo_table) . "'", false);
                return array(
                    'table' => $bo_table,
                    'subject' => (string) $board['bo_subject'],
                    'category_list' => (string) ($row['bo_category_list'] ?? ''),
                );
            }
        }
        return null;
    }
}

if (!function_exists('webapp_theme_settings_reorder_chapters')) {
    /** 장 순서를 저장한다. 성공하면 '', 아니면 관리자에게 보일 이유. */
    function webapp_theme_settings_reorder_chapters(string $bo_table, string $category_list, array $posted): string
    {
        global $g5;
        if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $bo_table) || !isset($g5['write_prefix'])) {
            return '게시판 이름이 올바르지 않습니다.';
        }
        $table = $g5['write_prefix'] . $bo_table;
        $rows = webapp_theme_settings_chapter_rows($table);
        if ($rows === null) {
            return '장 목록을 읽지 못했습니다.';
        }
        if ($rows === false) {
            return '장이 너무 많아(' . WEBAPP_CHAPTER_ORDER_MAX . '개 초과) 여기서 순서를 정할 수 없습니다.';
        }
        $plan = webapp_theme_settings_chapter_plan(webapp_theme_settings_chapter_toc_order($rows, $category_list), $posted);
        if ($plan === null) {
            return '원글의 글 번호가 겹쳐 순서를 바꿀 수 없습니다.';
        }
        $sql = webapp_theme_settings_chapter_update_sql($table, $plan);
        if ($sql !== '' && !sql_query($sql, false)) {
            return '장 순서를 저장하지 못했습니다.';
        }
        return '';
    }
}

if (!function_exists('webapp_theme_settings_chapters_html')) {
    /**
     * 장 순서 화면 — 테마 화면 설정과 따로 연 한 장(위에 고정된 설정 "저장" 단추와 섞이지 않게).
     * $chapters: webapp_theme_settings_chapter_board() 에 rows(목차 순서, 너무 많으면 false)를 더한 것. 값은 모두 이스케이프한다.
     */
    function webapp_theme_settings_chapters_html(array $chapters, string $token, bool $saved): string
    {
        $h = static function ($value): string {
            return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
        };
        $out = '<div class="local_desc01 local_desc"><p><a href="' . $h(G5_ADMIN_URL . '/view.php?call=theme_settings') . '">← 테마 화면 설정으로</a></p></div>';
        $out .= '<section id="ts-chapters"><h2 class="h2_frm">장 순서 — ' . $h($chapters['subject']) . ' (' . $h($chapters['table']) . ')</h2>';
        if ($saved) {
            $out .= '<div class="local_desc01 local_desc"><p>장 순서를 저장했습니다. 사이트를 새로고침하면 바뀐 순서가 보입니다.</p></div>';
        }
        $out .= '<div class="local_desc02 local_desc"><p>같은 부 안에서 작은 번호가 앞입니다. 부의 순서는 게시판 분류 순서를 따릅니다. '
            . '저장하면 게시판 목록 순서도 같이 바뀌고, 답글 · 댓글은 원글을 따라 움직입니다. 새로 쓴 글은 맨 앞에 붙으니 쓴 뒤 여기서 자리를 정하세요.</p></div>';
        if ($chapters['rows'] === false) {
            return $out . '<p>장이 너무 많아(' . (int) WEBAPP_CHAPTER_ORDER_MAX . '개 초과) 여기서 순서를 정할 수 없습니다.</p></section>';
        }
        if ($chapters['rows'] === array() || $chapters['rows'] === null) {
            return $out . '<p>아직 장(글)이 없습니다.</p></section>';
        }

        $out .= '<form method="post" action="' . $h(G5_ADMIN_URL . '/view.php?call=theme_settings') . '">'
            . '<input type="hidden" name="token" value="' . $h($token) . '">'
            . '<input type="hidden" name="mode" value="chapters">'
            . '<input type="hidden" name="chapters_board" value="' . $h($chapters['table']) . '">'
            . '<div class="tbl_head01 tbl_wrap"><table><caption>장 목록</caption><thead><tr>'
            . '<th scope="col">순서</th><th scope="col">부</th><th scope="col">장 제목</th></tr></thead><tbody>';
        foreach ($chapters['rows'] as $index => $row) {
            $part = webapp_theme_settings_js_trim($row['ca_name']) !== '' ? (string) $row['ca_name'] : WEBAPP_CHAPTER_UNGROUPED;
            $out .= '<tr><td class="td_num"><input type="number" min="1" max="9999" name="chapter_order[' . (int) $row['wr_id'] . ']" value="' . ($index + 1) . '" class="tbl_input" size="4"></td>'
                . '<td>' . $h($part) . '</td>'
                . '<td>' . $h($row['wr_subject']) . ' <a href="' . $h(G5_BBS_URL . '/board.php?bo_table=' . rawurlencode($chapters['table']) . '&wr_id=' . (int) $row['wr_id']) . '" target="_blank" rel="noopener">보기</a></td></tr>';
        }
        $out .= '</tbody></table></div>'
            . '<div class="btn_fixed_top"><input type="submit" value="장 순서 저장" class="btn_submit btn" accesskey="s"></div>'
            . '</form></section>';
        return $out;
    }
}
