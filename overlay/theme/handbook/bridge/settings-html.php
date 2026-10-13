<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 정적 빌드의 첫 그림부터 관리자 › 테마 화면 설정 값이 보이게 한다 — 기본 문구 · 왼쪽 열이 잠깐 보였다 바뀌지 않게.
 *
 * 1) 문구: 빌드 HTML 의 data-ts="키" 요소 안 글자를 저장한 문구로 바꿔 내보낸다. 다 바꿨을 때만(하나라도 못 바꾸면 손대지
 *    않는다) 런타임 설정에 themeSettingsApplied 를 실어, 화면(React)이 하이드레이션부터 같은 설정으로 그린다
 *    (nextjs/themes/handbook/use-theme-settings.ts). 고르는 규칙은 theme-settings.ts 의 cleanText · withSiteTexts ·
 *    handbookHomeTexts 와 같다 — 하나를 바꾸면 다른 쪽도 바꾼다(어긋나면 하이드레이션 오류).
 * 2) 사이드바: 이 주소의 화면 종류(첫 화면 · 매뉴얼 · 게시판 · 그 밖)를 정해 숨길 화면이면 <html data-doc-sidebar="hidden">.
 *    CSS 가 React 가 정하기 전까지 넓은 화면의 왼쪽 열을 뺀다(theme.shell.css). 붙은 뒤에는 React 가 정한 값이 이긴다.
 */

/** 화면이 자르는 길이(theme-settings.ts MAX_TEXT_LENGTH) · 고객센터 줄 수. */
define('HANDBOOK_SETTINGS_HTML_MAX_TEXT', 300);
define('HANDBOOK_SETTINGS_HTML_MAX_LINES', 5);

/** 공개 설정(지금 적용한 테마의 값) — 한 요청에 한 번만 읽는다. 런타임 설정(render.php)도 이것을 쓴다. */
function handbook_theme_settings_public()
{
    static $public = false;
    if ($public === false) {
        $public = function_exists('webapp_theme_settings_public')
            ? webapp_theme_settings_public(webapp_theme_settings_active_theme())
            : null;
    }

    return $public;
}

/** 이 요청의 HTML 글자를 설정으로 바꿨는가 — 런타임 설정의 themeSettingsApplied. */
function handbook_settings_html_applied($set = null)
{
    static $applied = false;
    if ($set !== null) {
        $applied = (bool) $set;
    }

    return $applied;
}

/**
 * 화면이 쓰는 설정만 — 한 번이라도 저장했고(변경 번호 > 0) handbook 의 값일 때. 화면의 parseHandbookThemeSettings 와 같다.
 */
function handbook_settings_html_saved($public)
{
    if (!is_array($public) || !isset($public['revision']) || (int) $public['revision'] <= 0) {
        return null;
    }
    if (isset($public['theme']) && is_string($public['theme']) && $public['theme'] !== 'handbook') {
        return null;
    }

    return $public;
}

/** JS 의 String.prototype.trim 과 같은 공백(유니코드 공백 · 줄 끝 · BOM)을 앞뒤에서 걷는다. */
function handbook_settings_html_js_trim($text)
{
    $space = '[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';
    $trimmed = preg_replace('/^' . $space . '+|' . $space . '+$/u', '', (string) $text);

    return is_string($trimmed) ? $trimmed : trim((string) $text);
}

/** 화면의 cleanText 와 같다 — 앞뒤 공백을 걷고 글자(코드 포인트) 300자까지. */
function handbook_settings_html_text($site, $key)
{
    if (!isset($site[$key]) || !is_string($site[$key])) {
        return '';
    }
    $text = handbook_settings_html_js_trim($site[$key]);

    return function_exists('mb_substr') ? mb_substr($text, 0, HANDBOOK_SETTINGS_HTML_MAX_TEXT, 'UTF-8') : $text;
}

/**
 * data-ts 키 → 바꿔 넣을 글자, 고객센터 줄 목록. 비운 칸은 빠진다(빌드 HTML 의 테마 기본값을 그대로 둔다).
 * 첫 화면 제목은 첫 화면 제목 → 사이트 이름, 소개는 첫 화면 소개 → 사이트 소개 순(handbookHomeTexts 와 같다).
 */
function handbook_settings_html_texts(array $public)
{
    $site = isset($public['site']) && is_array($public['site']) ? $public['site'] : array();
    $texts = array();
    foreach (array('logoText', 'name', 'footerDescription', 'customerCenterTitle', 'copyrightName') as $key) {
        $value = handbook_settings_html_text($site, $key);
        if ($value !== '') {
            $texts[$key] = $value;
        }
    }
    $home_title = handbook_settings_html_text($site, 'homeTitle');
    $home_title = $home_title !== '' ? $home_title : handbook_settings_html_text($site, 'name');
    if ($home_title !== '') {
        $texts['homeTitle'] = $home_title;
    }
    $home_description = handbook_settings_html_text($site, 'homeDescription');
    $home_description = $home_description !== '' ? $home_description : handbook_settings_html_text($site, 'description');
    if ($home_description !== '') {
        $texts['homeDescription'] = $home_description;
    }

    $lines = array();
    if (isset($site['customerCenterLines']) && is_array($site['customerCenterLines'])) {
        foreach ($site['customerCenterLines'] as $line) {
            $line = handbook_settings_html_text(array('line' => $line), 'line');
            if ($line !== '' && count($lines) < HANDBOOK_SETTINGS_HTML_MAX_LINES) {
                $lines[] = $line;
            }
        }
    }

    return array('texts' => $texts, 'lines' => $lines);
}

function handbook_settings_html_escape($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * HTML 의 data-ts 요소 글자를 바꾼다. 콜백으로 넣어 $1 · \ 가 치환 문법으로 읽히지 않는다.
 * 모두 바꿨으면 바뀐 HTML, 하나라도 못 바꿨으면(요소 모양이 바뀜 등) null — 부른 쪽은 손대지 않은 HTML 을 내보내고
 * 화면은 붙은 뒤에 바꾼다(반쯤 바꾼 HTML 은 하이드레이션 글자를 어긋나게 한다).
 */
function handbook_settings_html_replace($html, array $public)
{
    $html = (string) $html;
    $values = handbook_settings_html_texts($public);
    foreach ($values['texts'] as $key => $text) {
        $markers = preg_match_all('/\sdata-ts="' . preg_quote($key, '/') . '"/', $html);
        if (!$markers) {
            continue;
        }
        $escaped = handbook_settings_html_escape($text);
        $count = 0;
        $out = preg_replace_callback(
            '#(<(span|p|h1|h2)\b[^>]*\sdata-ts="' . preg_quote($key, '#') . '"[^>]*>)[^<]*(</\2>)#',
            static function ($match) use ($escaped) {
                return $match[1] . $escaped . $match[3];
            },
            $html,
            -1,
            $count
        );
        if (!is_string($out) || $count !== $markers) {
            return null;
        }
        $html = $out;
    }

    if ($values['lines'] !== array()) {
        $markers = preg_match_all('/\sdata-ts="customerCenterLines"/', $html);
        if ($markers) {
            $items = '';
            foreach ($values['lines'] as $line) {
                $items .= '<li>' . handbook_settings_html_escape($line) . '</li>';
            }
            $count = 0;
            $out = preg_replace_callback(
                '#(<ul\b[^>]*\sdata-ts="customerCenterLines"[^>]*>)(?:<li>[^<]*</li>)*(</ul>)#',
                static function ($match) use ($items) {
                    return $match[1] . $items . $match[2];
                },
                $html,
                -1,
                $count
            );
            if (!is_string($out) || $count !== $markers) {
                return null;
            }
            $html = $out;
        }
    }

    return $html;
}

/** 빌드 때 정한 매뉴얼 그룹 — 화면이 .doc-root 에 싣는 data-docs-group(layout-shell.tsx). 없으면 ''. */
function handbook_settings_html_build_docs_group($html)
{
    return preg_match('/\sdata-docs-group="([A-Za-z0-9_]{1,10})"/', (string) $html, $match) ? $match[1] : '';
}

/**
 * 화면 종류 — home · docs · board · other, 정할 수 없으면 ''. theme-settings.ts 의 sidebarScreen 과 같은 규칙을 PHP 가 아는
 * 것으로 따른다: 주소의 게시판(/boards/<표> 나 짧은 주소 /<표>)이 있으면 매뉴얼 그룹인지로 매뉴얼 · 게시판을 가르고, 게시판이
 * 아니면 그 밖. $board_group 은 그 게시판의 그룹(게시판이 아니면 null), $docs_group 은 매뉴얼 그룹(설정 → 빌드 때 그룹).
 */
function handbook_settings_html_screen($path, $board_group, $docs_group)
{
    $path = '/' . trim((string) $path, '/');
    if ($path === '/' || $path === '/community') {
        return 'home';
    }
    if ($board_group === null) {
        return 'other';
    }
    if ($docs_group === '') {
        return '';
    }

    return $board_group === $docs_group ? 'docs' : 'board';
}

/** 이 주소의 게시판 이름(/boards/<표>/… 나 /<표>/…). 게시판 이름 모양이 아니면 ''. */
function handbook_settings_html_board_table($path)
{
    $segments = array_values(array_filter(explode('/', trim((string) $path, '/')), 'strlen'));
    $table = isset($segments[0]) && $segments[0] === 'boards' ? (isset($segments[1]) ? $segments[1] : '') : (isset($segments[0]) ? $segments[0] : '');

    return preg_match('/^[A-Za-z0-9_]{1,20}$/', $table) ? $table : '';
}

/** 이 화면에서 넓은 화면의 왼쪽 열을 숨기는가 — 정할 수 없으면 false(예전 모양, 붙은 뒤 React 가 정한다). */
function handbook_settings_html_sidebar_hidden(array $public, $screen)
{
    $sidebar = isset($public['sidebar']) && is_array($public['sidebar']) ? $public['sidebar'] : array();
    $hidden = static function ($key) use ($sidebar) {
        return isset($sidebar[$key]) && $sidebar[$key] === 'hidden';
    };
    if ($screen === '') {
        // 게시판인데 매뉴얼인지 모를 때 — 두 화면의 설정이 같으면 어느 쪽이든 같다.
        return $hidden('docs') && $hidden('board');
    }

    return $hidden($screen);
}

/**
 * 순수 함수 — 설정 · 주소 · 게시판 그룹 찾기($board_group_of: 게시판 이름 → 그룹 또는 null)로 HTML 을 다듬는다.
 * 돌려주는 값: array('html' => …, 'applied' => 글자를 바꿨는가).
 */
function handbook_settings_html_apply($html, $public, $path, $board_group_of)
{
    $public = handbook_settings_html_saved($public);
    if ($public === null) {
        return array('html' => $html, 'applied' => false);
    }

    $replaced = handbook_settings_html_replace($html, $public);
    $applied = $replaced !== null;
    $html = $applied ? $replaced : $html;

    $table = handbook_settings_html_board_table($path);
    $board_group = $table !== '' ? $board_group_of($table) : null;
    $docs_group = isset($public['docs']['group']) && is_string($public['docs']['group']) ? $public['docs']['group'] : '';
    $docs_group = $docs_group !== '' ? $docs_group : handbook_settings_html_build_docs_group($html);
    $screen = handbook_settings_html_screen($path, $board_group, $docs_group);

    if (handbook_settings_html_sidebar_hidden($public, $screen)) {
        $out = preg_replace_callback('/<html\b([^>]*)>/i', static function ($match) {
            return '<html' . $match[1] . ' data-doc-sidebar="hidden">';
        }, $html, 1);
        $html = is_string($out) ? $out : $html;
    }

    return array('html' => $html, 'applied' => $applied);
}

/** 요청 주소에 맞춰 HTML 을 다듬는다(render.php). 게시판 그룹은 그 게시판 한 줄만 읽는다. */
function handbook_apply_theme_settings_html($html)
{
    $path = function_exists('handbook_current_path') ? handbook_current_path() : '/';
    $result = handbook_settings_html_apply($html, handbook_theme_settings_public(), $path, static function ($table) {
        global $g5;
        if (!isset($g5['board_table'])) {
            return null;
        }
        $row = sql_fetch("SELECT gr_id FROM `{$g5['board_table']}` WHERE bo_table = '" . sql_real_escape_string($table) . "'", false);

        return is_array($row) && isset($row['gr_id']) ? (string) $row['gr_id'] : null;
    });
    handbook_settings_html_applied($result['applied']);

    return $result['html'];
}
