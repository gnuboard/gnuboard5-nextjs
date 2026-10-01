<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * API 로그인으로 열린 그누보드 세션을, 그 로그인이 끊기면 함께 닫는다.
 *
 * 새 화면에서 로그인하면 API 가 토큰과 함께 그누보드 PHP 세션(ss_mb_id)도 열어 /adm 에 바로 들어가게
 * 한다(api/v1/auth_helpers.php api_auth_open_php_session). 그때 그 로그인의 세션 번호를 ss_api_sid 에
 * 적어 둔다. 마이페이지 세션 목록에서 그 기기를 로그아웃하거나 전체 로그아웃·비밀번호 변경으로 세션이
 * 끊기면 g5_refresh_token 에 그 번호의 active 행이 없어진다 — 그러면 이 그누보드 세션도 다음 요청에서
 * 비회원으로 되돌린다. 세션 파일을 직접 지우지 않으므로 세션 저장 방식(파일·Redis·DB)과 상관없다.
 *
 * common.php 는 이 파일보다 먼저 $member · $is_admin 을 정하므로 그 값들도 비회원으로 고쳐 둔다.
 * 그누보드 화면으로 따로 로그인한 세션(ss_api_sid 없음)이나 다른 회원으로 바뀐 세션은 건드리지 않는다.
 * DB 를 읽지 못하면(표·칸이 없는 설치본 등) 아무것도 하지 않는다.
 */

if (!function_exists('webapp_api_session_is_revoked')) {
    function webapp_api_session_is_revoked(string $mbId, int $sessionId): bool
    {
        global $g5;

        $table = isset($g5['refresh_token_table']) ? (string) $g5['refresh_token_table'] : '';
        if ($table === '' || $mbId === '' || $sessionId <= 0) {
            return false;
        }
        $result = sql_query(
            "SELECT 1 AS x FROM `{$table}`
              WHERE session_family = '{$sessionId}'
                AND mb_id = '" . sql_real_escape_string($mbId) . "'
                AND status = 'active' AND expires_at > NOW()
              LIMIT 1",
            false
        );
        if ($result === false) {
            return false;
        }
        return !sql_fetch_array($result);
    }
}

if (!function_exists('webapp_api_session_guard')) {
    function webapp_api_session_guard(): void
    {
        global $member, $is_member, $is_guest, $is_admin;

        if (!function_exists('get_session') || session_status() !== PHP_SESSION_ACTIVE) {
            return;
        }
        $sessionId = (int) get_session('ss_api_sid');
        $mbId = isset($member['mb_id']) ? (string) $member['mb_id'] : '';
        if ($sessionId <= 0 || $mbId === '' || (string) get_session('ss_api_sid_mb') !== $mbId) {
            return;
        }
        if (!webapp_api_session_is_revoked($mbId, $sessionId)) {
            return;
        }

        set_session('ss_mb_id', '');
        set_session('ss_mb_key', '');
        set_session('ss_api_sid', '');
        set_session('ss_api_sid_mb', '');
        @session_regenerate_id(true);
        // 그누보드 자동 로그인 쿠키가 있으면 다음 요청에서 다시 로그인되므로 bbs/logout.php 처럼 함께 지운다.
        if (function_exists('set_cookie') && !headers_sent()) {
            set_cookie('ck_mb_id', '', 0);
            set_cookie('ck_auto', '', 0);
        }

        $member = array('mb_id' => '', 'mb_level' => 1);
        $is_member = false;
        $is_guest = true;
        $is_admin = '';
    }
}

webapp_api_session_guard();
