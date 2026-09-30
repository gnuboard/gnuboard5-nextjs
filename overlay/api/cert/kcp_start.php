<?php
/**
 * KCP(NHN) 휴대폰 본인인증 시작 — plugin/kcpcert/kcpcert_form.php 의 api 어댑터.
 *
 * 원본과 동일하게 KCP cert_view.jsp 로 제출하되, Ret_URL 만 plugin 이 아닌
 * api/cert/kcp_result.php 로 지정한다. up_hash 위변조 검증값은 opener-DOM 대신
 * PHP 세션(ss_cert_kcp_up_hash)에 저장해 result 에서 서버측 검증한다.
 *
 * URL: /api/cert/kcp_start.php?pageType=register
 */

require_once __DIR__ . '/_cert_common.php';

$pageType = isset($_GET['pageType']) ? preg_replace('/[^a-z]/', '', (string) $_GET['pageType']) : 'register';
if (!in_array($pageType, array('register', 'find'), true)) {
    cert_emit_error_and_close('잘못된 접근입니다.');
}
cert_capture_return_origin();
cert_capture_app_client($pageType); // 앱 WebView 시작이면 결과 페이지가 cert_token 을 발급 (SC-21)
if ($pageType === 'find' && empty($config['cf_cert_find'])) {
    cert_emit_error_and_close('본인확인을 이용한 아이디/비밀번호 찾기가 비활성화되어 있습니다.');
}
if (empty($config['cf_cert_use']) || (string) $config['cf_cert_hp'] !== 'kcp') {
    cert_emit_error_and_close('NHN KCP 휴대폰 본인확인이 비활성화되어 있습니다.');
}
set_session('ss_nextjs25_cert_page_type', $pageType);

setlocale(LC_CTYPE, 'ko_KR.euc-kr');

// $site_cd, $cert_url, $kcp_enc_key, $home_dir, ct_cli 라이브러리, f_get_parm_str()
// 을 플러그인 설정에서 그대로 로드 (이 파일은 수정하지 않음). 금일 인증횟수 체크도 포함.
include_once G5_KCPCERT_PATH . '/kcpcert_config.php';

if (!function_exists('cert_kcp_html_attr')) {
    function cert_kcp_html_attr($value)
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

if (!function_exists('cert_kcp_js_string')) {
    function cert_kcp_js_string($value)
    {
        return json_encode(
            (string) $value,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );
    }
}

if (!function_exists('cert_kcp_gateway_url')) {
    function cert_kcp_gateway_url($value)
    {
        $url = trim((string) $value);
        $parts = parse_url($url);
        $scheme = isset($parts['scheme']) ? strtolower((string) $parts['scheme']) : '';
        $host = isset($parts['host']) ? strtolower((string) $parts['host']) : '';

        if ($scheme !== 'https' || $host === '') {
            cert_emit_error_and_close('KCP 본인인증 요청 URL이 올바르지 않습니다.');
        }

        if ($host !== 'kcp.co.kr' && substr($host, -10) !== '.kcp.co.kr') {
            cert_emit_error_and_close('허용되지 않은 KCP 본인인증 요청 URL입니다.');
        }

        return $url;
    }
}

$ordr_idxx = get_session('ss_uniqid');
if (!$ordr_idxx) {
    $ordr_idxx = get_uniqid();
}

$ct_cert = new C_CT_CLI();
$ct_cert->mf_clear();

$year       = '00';
$month      = '00';
$day        = '00';
$user_name  = '';
$sex_code   = '';
$local_code = '';

// up_hash 생성 (site_cd, ordr_idxx 필수)
$hash_data = $site_cd . $ordr_idxx . $user_name . $year . $month . $day . $sex_code . $local_code;
$up_hash   = $ct_cert->make_hash_data($home_dir, $kcp_enc_key, $hash_data);
$ct_cert->mf_clear();

// 결과 콜백 → 플러그인이 아니라 api 어댑터로.
$retUrl = cert_result_base_url() . '/api/cert/kcp_result.php';

// up_hash 를 세션에 저장 → result 에서 서버측 위변조 검증 (React opener 는 jQuery 없음).
set_session('ss_cert_kcp_up_hash', $up_hash);

$libVer = ($config['cf_cert_kcp_enckey'] || $kcp_enc_key) ? $ct_cert->get_kcp_lib_ver($home_dir) : '';
$safeCertUrl = cert_kcp_gateway_url($cert_url);

header('Content-Type: text/html; charset=utf-8');
?><!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<?php if (is_mobile()) { ?>
<meta name="viewport" content="user-scalable=yes, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, width=device-width, target-densitydpi=medium-dpi">
<?php } ?>
<title>KCP 휴대폰 본인인증</title>
</head>
<body oncontextmenu="return false;" ondragstart="return false;" onselectstart="return false;">
<form name="form_auth" method="post" action="<?php echo cert_kcp_html_attr($safeCertUrl); ?>">
    <input type="hidden" name="user_name"   value="">
    <input type="hidden" name="ordr_idxx"   value="<?php echo cert_kcp_html_attr($ordr_idxx); ?>">
    <input type="hidden" name="req_tx"      value="cert">
    <input type="hidden" name="cert_type"   value="01">
    <input type="hidden" name="web_siteid"  value="">
    <input type="hidden" name="site_cd"     value="<?php echo cert_kcp_html_attr($site_cd); ?>">
    <input type="hidden" name="Ret_URL"     value="<?php echo cert_kcp_html_attr($retUrl); ?>">
    <input type="hidden" name="cert_otp_use" value="Y">
    <input type="hidden" name="cert_enc_use" value="Y">
<?php if (is_mobile()) { ?>
    <input type="hidden" name="cert_able_yn" value="">
<?php } ?>
    <input type="hidden" name="res_cd"      value="">
    <input type="hidden" name="res_msg"     value="">
    <input type="hidden" name="up_hash"     value="<?php echo cert_kcp_html_attr($up_hash); ?>">
    <input type="hidden" name="veri_up_hash" value="">
    <input type="hidden" name="web_siteid_hashYN" value="">
    <input type="hidden" name="param_opt_1" value="opt1">
    <input type="hidden" name="param_opt_2" value="opt2">
    <input type="hidden" name="param_opt_3" value="opt3">
<?php if ($config['cf_cert_kcp_enckey'] || $kcp_enc_key) { ?>
    <input type="hidden" name="cert_enc_use_ext" value="Y">
    <input type="hidden" name="kcp_cert_lib_ver" value="<?php echo cert_kcp_html_attr($libVer); ?>">
<?php } ?>
</form>
<script>
window.onload = function () {
    var frm = document.form_auth;
    // KCP 인증창(cert_view.jsp)은 창 이름이 auth_popup 이 아니면 새 팝업을 띄우려 한다. 웹 팝업은 이미 이 이름이고,
    // 앱 WebView 는 팝업을 열 수 없으므로 현재 창에 같은 이름을 붙인다 (SC-21, 그누보드 kcpcert_form.php 모바일 분기와 같음).
    window.name = "auth_popup";
    // 같은 팝업 창에서 KCP 인증창으로 이동 (target 미지정 = 현재 창).
    frm.action = <?php echo cert_kcp_js_string($safeCertUrl); ?>;
    frm.submit();
};
</script>
</body>
</html>
