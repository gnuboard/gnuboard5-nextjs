<?php
/**
 * Gnuboard5 REST API - Register Terms Endpoint
 *
 * Routes handled (prefix: v1/register-terms):
 *   GET /v1/register-terms - 회원가입 약관 전문(이용약관 · 개인정보 처리방침)
 *
 * 그누보드 회원가입(bbs/register.php · register.skin.php)이 보여 주는 것과 같은 값이다.
 * 관리자 > 환경설정 > 기본환경설정의 "회원가입약관"(cf_stipulation)과 "개인정보처리방침"(cf_privacy).
 * 약관은 가입 전에 누구나 읽어야 하므로 로그인 없이 연다. 글자 그대로 내려 주고 앱이 글자로 그린다.
 * 길어서(수 KB) 자주 부르는 /v1/settings 에는 싣지 않는다.
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$config = api_get_config();

if (!$config) {
    Response::error('Site configuration not found.', 500);
}

Response::success([
    'stipulation' => isset($config['cf_stipulation']) ? (string) $config['cf_stipulation'] : '',
    'privacy'     => isset($config['cf_privacy']) ? (string) $config['cf_privacy'] : '',
]);
