<?php
/**
 * Gnuboard5 REST API - 테마 화면 설정 편집 (최고관리자만)
 *
 * 화면(handbook)에서 최고관리자가 연 편집 창이 쓴다. 관리자 › 환경설정 › 테마 화면 설정과 같은 값 · 같은 저장
 * (plugin/webapp/theme-settings/service.php)이다. 공개 값은 예전처럼 GET /v1/settings 의 theme_settings 로 나간다.
 *
 * GET /v1/theme-settings                      저장된 설정, 게시판 그룹, 매뉴얼 그룹의 게시판
 * PUT /v1/theme-settings                      설정 · 매뉴얼 게시판 순서와 제목 저장
 *     { revision?, docs:{group, hints}, sidebar:{home, docs, board, other}, site:{…},
 *       boards:{표:{order, subject, orig_order, orig_subject}} } — boards 는 바꾼 게시판만, orig_* 는 처음 보인 값(같은 칸은 쓰지 않는다)
 * GET /v1/theme-settings/chapters/{bo_table}  한 매뉴얼의 장 목록(목차 순서)
 * PUT /v1/theme-settings/chapters/{bo_table}  장 순서 저장 { revision?, order:{wr_id: 번호} }
 *
 * revision 을 보내면 지금 변경 번호와 다를 때 409 — 편집 창을 연 뒤 다른 곳(관리자 화면 · 다른 창)에서 먼저 저장한 값을
 * 모르고 덮지 않게. 저장 응답의 public 은 /v1/settings 의 theme_settings 와 같은 모양이라 화면이 바로 바꿔 그린다.
 * 장 순서 변경이 실패했지만 설정 변경 번호를 올렸으면 422 의 errors.revision 에 이 요청이 올린 번호를 싣는다.
 * 지금 적용한 테마가 이 설정을 쓰지 않으면(WEBAPP_THEME_SETTINGS_THEMES) 404.
 */

if (!defined('_GNUBOARD_')) exit;

if (!function_exists('webapp_theme_settings_update') || !function_exists('webapp_theme_settings_admin_available')) {
    Response::error('Theme settings are not installed.', 501);
}

$me = Auth::requireAdmin();
$theme = webapp_theme_settings_active_theme();
if (!webapp_theme_settings_admin_available($theme)) {
    Response::error('The active theme does not use theme screen settings.', 404);
}

$section = isset($apiSegments[0]) ? (string) $apiSegments[0] : '';
$boTable = isset($apiSegments[1]) ? (string) $apiSegments[1] : '';
$mbId = (string) $me['mb_id'];

if (!function_exists('api_theme_settings_expected_revision')) {
    /** 보낸 변경 번호(0 이상의 정수). 보내지 않았으면 null — 확인하지 않는다(관리자 화면과 같은 마지막 저장 우선). */
    function api_theme_settings_expected_revision(array $input): ?int
    {
        $value = $input['revision'] ?? null;
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value) || (int) $value < 0) {
            Response::error('변경 번호가 올바르지 않습니다.', 400);
        }
        return (int) $value;
    }
}

if (!function_exists('api_theme_settings_fail')) {
    /** 저장 실패 응답 — 충돌이면 409, 장 순서 실패면 이 요청이 올린 번호를 함께 보낸다. */
    function api_theme_settings_fail(string $theme, array $saved, int $status): void
    {
        if (!empty($saved['conflict'])) {
            Response::error($saved['error'], 409, ['code' => 'REVISION_CONFLICT', 'revision' => webapp_theme_settings_load($theme)['revision']]);
        }
        if (($saved['revision'] ?? 0) > 0) {
            Response::error($saved['error'], $status, ['code' => 'CHAPTER_SAVE_FAILED', 'revision' => (string) $saved['revision']]);
        }
        Response::error($saved['error'], $status);
    }
}

if ($section === '' && $apiMethod === 'GET') {
    Response::success(webapp_theme_settings_editor_state($theme));
}

if ($section === '' && ($apiMethod === 'PUT' || $apiMethod === 'POST')) {
    api_require_write_quota('themesettings', $me, 20, 200);
    $input = get_request_body();
    $input = is_array($input) ? $input : array();
    $boards = isset($input['boards']) && is_array($input['boards']) ? $input['boards'] : array();
    // 변경 번호 확인은 저장과 한 SQL 문장이다(service.php webapp_theme_settings_save_expected).
    $saved = webapp_theme_settings_update($theme, $input, $boards, $mbId, api_theme_settings_expected_revision($input));
    if ($saved['revision'] === 0) {
        api_theme_settings_fail($theme, $saved, 500);
    }
    // 설정은 저장했고 게시판 일부만 못 고쳤으면 실패가 아니라 경고 — 새 변경 번호와 실제로 저장된 값을 함께 돌려줘 화면이
    // 그 값으로 다시 채우고 이어서 고칠 수 있게 한다(게시판 표는 MyISAM 이라 설정과 한 트랜잭션으로 묶을 수 없다).
    $data = webapp_theme_settings_editor_state($theme) + array('public' => webapp_theme_settings_public($theme));
    if ($saved['error'] !== '') {
        $data['warning'] = $saved['error'];
        // 못 고친 게시판 — 편집 창이 그 칸만 입력한 값으로 남겨 바로 다시 저장할 수 있게.
        $data['failed_boards'] = array_values($saved['failed'] ?? array());
    }
    Response::success($data);
}

if ($section === 'chapters' && $boTable !== '' && count($apiSegments) === 2) {
    if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $boTable)) {
        Response::error('게시판 이름이 올바르지 않습니다.', 400);
    }
    if ($apiMethod === 'GET') {
        $chapters = webapp_theme_settings_editor_chapters($theme, $boTable);
        if ($chapters === null) {
            Response::error('매뉴얼 그룹의 게시판이 아닙니다.', 404);
        }
        Response::success($chapters + array('revision' => webapp_theme_settings_load($theme)['revision']));
    }
    if ($apiMethod === 'PUT' || $apiMethod === 'POST') {
        api_require_write_quota('themesettings', $me, 20, 200);
        $input = get_request_body();
        $input = is_array($input) ? $input : array();
        $orders = isset($input['order']) && is_array($input['order']) ? $input['order'] : array();
        $saved = webapp_theme_settings_update_chapters($theme, $boTable, $orders, $mbId, api_theme_settings_expected_revision($input));
        if ($saved['error'] !== '') {
            api_theme_settings_fail($theme, $saved, 422);
        }
        $chapters = webapp_theme_settings_editor_chapters($theme, $boTable);
        Response::success(($chapters ?? array()) + array(
            'revision' => $saved['revision'],
            'public' => webapp_theme_settings_public($theme),
        ));
    }
}

Response::error('Not found.', 404);
