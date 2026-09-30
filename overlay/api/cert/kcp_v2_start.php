<?php
/**
 * KCP(NHN) 휴대폰 본인확인 V2 시작 - Next.js postMessage 어댑터.
 */

require_once __DIR__ . '/_cert_common.php';

$pageType = isset($_GET['pageType']) ? preg_replace('/[^a-z]/', '', (string) $_GET['pageType']) : 'register';
if (!in_array($pageType, array('register', 'find'), true)) {
    cert_emit_error_and_close('잘못된 접근입니다.');
}
cert_capture_return_origin();
cert_capture_app_client($pageType); // 앱 WebView 시작이면 결과 페이지가 cert_token 을 발급 (SC-21)
if (empty($config['cf_cert_use']) || (string) $config['cf_cert_hp'] !== 'kcp_v2') {
    cert_emit_error_and_close('NHN KCP 휴대폰 본인확인(api_v2)이 비활성화되어 있습니다.');
}
if ($pageType === 'find' && empty($config['cf_cert_find'])) {
    cert_emit_error_and_close('본인확인을 이용한 아이디/비밀번호 찾기가 비활성화되어 있습니다.');
}

setlocale(LC_CTYPE, 'ko_KR.UTF-8');
certify_count_check(isset($member['mb_id']) ? $member['mb_id'] : '', 'hp');
include_once G5_KCPCERT_V2_PATH . '/kcpcert_config.php';

$ordr_idxx = get_session('ss_uniqid');
if (!$ordr_idxx) {
    $ordr_idxx = get_uniqid();
}

$resultUrl = cert_result_base_url() . '/api/cert/kcp_v2_result.php';
$api = new C_KCP_API_V2($site_cd, $kcp_enc_key, $cert_reg_url, $cert_dec_url);
$reg = $api->trade_reg($ordr_idxx, $resultUrl, $web_siteid);

if (!isset($reg['res_cd']) || $reg['res_cd'] !== '0000' || empty($reg['call_url']) || empty($reg['reg_cert_key'])) {
    $resCd = isset($reg['res_cd']) ? $reg['res_cd'] : '';
    $resMsg = isset($reg['res_msg']) ? $reg['res_msg'] : '';
    cert_emit_error_and_close('본인확인 거래등록에 실패했습니다. (' . $resCd . ' : ' . $resMsg . ')');
}

set_session('ss_kcp_v2_reg_cert_key', $reg['reg_cert_key']);
set_session('ss_kcp_v2_ordr_idxx', $ordr_idxx);
set_session('ss_nextjs25_cert_page_type', $pageType);

header('Content-Type: text/html; charset=utf-8');
?><!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<?php if (is_mobile()) { ?>
<meta name="viewport" content="user-scalable=yes, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, width=device-width, target-densitydpi=medium-dpi">
<?php } ?>
<title>KCP 휴대폰 본인확인(api_v2)</title>
</head>
<body oncontextmenu="return false;" ondragstart="return false;" onselectstart="return false;">
<form name="form_auth" method="post" action="<?php echo htmlspecialchars($reg['call_url'], ENT_QUOTES); ?>">
    <input type="hidden" name="reg_cert_key" value="<?php echo htmlspecialchars($reg['reg_cert_key'], ENT_QUOTES); ?>">
    <input type="hidden" name="kcp_page_submit_yn" value="Y">
</form>
<script>
window.onload = function () {
    document.form_auth.submit();
};
</script>
</body>
</html>
