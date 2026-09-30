<?php
/**
 * KG 이니시스 통합인증(간편인증) 시작 — plugin/inicert/ini_request.php 의 api 어댑터.
 *
 * 원본과 동일하게 인증 요청 폼을 만들어 https://sa.inicis.com/auth 로 제출하되,
 * successUrl/failUrl 만 plugin 이 아닌 api/cert/inicis_result.php 로 지정한다.
 *
 * URL: /api/cert/inicis_start.php?pageType=register
 */

require_once __DIR__ . '/_cert_common.php';

$pageType = isset($_GET['pageType']) ? preg_replace('/[^a-z]/', '', (string) $_GET['pageType']) : 'register';
if (!in_array($pageType, array('register', 'find'), true)) {
    cert_emit_error_and_close('잘못된 접근입니다.');
}
cert_capture_return_origin();
cert_capture_app_client($pageType); // 앱 WebView 시작이면 결과 페이지가 cert_token 을 발급 (SC-21)

if (empty($config['cf_cert_use']) || (string) $config['cf_cert_simple'] !== 'inicis') {
    cert_emit_error_and_close('KG이니시스 간편인증이 비활성화되어 있습니다.');
}
if ($pageType === 'find' && empty($config['cf_cert_find'])) {
    cert_emit_error_and_close('본인확인을 이용한 아이디/비밀번호 찾기가 비활성화되어 있습니다.');
}
set_session('ss_nextjs25_cert_page_type', $pageType);

$sql = "select MAX(cr_id) as max_cr_id from {$g5['cert_history_table']} limit 1";
$res = sql_fetch($sql);
$max_cr_id = isset($res['max_cr_id']) ? $res['max_cr_id'] : 0;
if (empty($max_cr_id)) {
    $max_cr_id = 0;
}

if ($config['cf_cert_use'] == 2) { // 실서비스
    $mid    = 'SRA' . $config['cf_cert_kg_mid'];
    $apiKey = $config['cf_cert_kg_cd'];
    $mTxId  = 'SIR_' . substr($max_cr_id . '_' . round(microtime(true) * 1000), 0, 16);
    certify_count_check(isset($member['mb_id']) ? $member['mb_id'] : '', 'simple'); // 금일 인증시도 횟수
} else { // 테스트
    $mid    = 'SRAiasTest';
    $apiKey = '43700dfd4c795fe9550853aef3b6aaf1';
    $mTxId  = 'SIR_' . substr($max_cr_id . '_' . round(microtime(true) * 1000), 0, 16);
}

$reqSvcCd    = '01'; // 01: 간편인증
$reservedMsg = (defined('KGINICIS_USE_CERT_SEED') && KGINICIS_USE_CERT_SEED) ? 'isUseToken=Y' : '';

// 등록가맹점 확인 해시
$authHash = hash('sha256', (string) $mid . (string) $mTxId . (string) $apiKey);

// 특정사용자 고정 안 함 (가입 단계라 회원정보 없음)
$flgFixedUser = 'N';
$userName  = '';
$userPhone = '';
$userBirth = '';
$userHash  = '';

// 결과 콜백 → 플러그인이 아니라 api 어댑터로.
$resultUrl = cert_result_base_url() . '/api/cert/inicis_result.php';

$directAgency = isset($_GET['directAgency']) ? clean_xss_tags($_GET['directAgency'], 1, 1) : '';
$mbId = isset($member['mb_id']) ? $member['mb_id'] : '';

header('Content-Type: text/html; charset=utf-8');
?><!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KG이니시스 간편인증</title>
</head>
<body>
    <form name="saForm" method="post">
        <input type="hidden" name="mid"          value="<?php echo get_text($mid); ?>">
        <input type="hidden" name="reqSvcCd"     value="<?php echo get_text($reqSvcCd); ?>">
        <input type="hidden" name="mTxId"        value="<?php echo get_text($mTxId); ?>">
        <input type="hidden" name="authHash"     value="<?php echo get_text($authHash); ?>">
        <input type="hidden" name="flgFixedUser" value="<?php echo get_text($flgFixedUser); ?>">
        <input type="hidden" name="userName"     value="<?php echo get_text($userName); ?>">
        <input type="hidden" name="userPhone"    value="<?php echo get_text($userPhone); ?>">
        <input type="hidden" name="userBirth"    value="<?php echo get_text($userBirth); ?>">
        <input type="hidden" name="userHash"     value="<?php echo get_text($userHash); ?>">
        <input type="hidden" name="reservedMsg"  value="<?php echo get_text($reservedMsg); ?>">
        <input type="hidden" name="mbId"         value="<?php echo get_text($mbId); ?>">
        <input type="hidden" name="directAgency" value="<?php echo get_text($directAgency); ?>">
        <input type="hidden" name="successUrl"   value="<?php echo get_text($resultUrl); ?>">
        <input type="hidden" name="failUrl"      value="<?php echo get_text($resultUrl); ?>">
    </form>
    <script>
        document.saForm.setAttribute("target", "_self");
        document.saForm.setAttribute("action", "https://sa.inicis.com/auth");
        document.saForm.submit();
    </script>
</body>
</html>
