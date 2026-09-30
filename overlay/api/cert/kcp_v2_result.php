<?php
/**
 * KCP(NHN) 휴대폰 본인확인 V2 결과 - Next.js postMessage 어댑터.
 */

require_once __DIR__ . '/_cert_common.php';

if (empty($config['cf_cert_use']) || (string) $config['cf_cert_hp'] !== 'kcp_v2') {
    cert_emit_error_and_close('NHN KCP 휴대폰 본인확인(api_v2)이 비활성화되어 있습니다.');
}

include_once G5_KCPCERT_V2_PATH . '/kcpcert_config.php';

$res_cd  = isset($_POST['res_cd']) ? trim((string) $_POST['res_cd']) : '';
$res_msg = isset($_POST['res_msg']) ? trim((string) $_POST['res_msg']) : '';

$reg_cert_key = (string) get_session('ss_kcp_v2_reg_cert_key');
$ordr_idxx = (string) get_session('ss_kcp_v2_ordr_idxx');
$certPageType = (string) get_session('ss_nextjs25_cert_page_type');

set_session('ss_kcp_v2_reg_cert_key', '');
set_session('ss_kcp_v2_ordr_idxx', '');
set_session('ss_nextjs25_cert_page_type', '');

if ($res_cd === '') {
    cert_emit_error_and_close('본인확인 응답값이 없습니다. 처음부터 다시 시도해 주세요.');
}

@insert_cert_history(isset($member['mb_id']) ? $member['mb_id'] : '', 'kcp_v2', 'hp');

if ($res_cd === '9999') {
    cert_emit_error_and_close('휴대폰 본인확인을 취소하셨습니다.');
}

if ($res_cd !== '0000') {
    cert_emit_error_and_close('코드 : ' . $res_cd . ' ' . urldecode($res_msg));
}

if (!$reg_cert_key || !$ordr_idxx) {
    cert_emit_error_and_close('본인확인 세션이 만료되었습니다. 처음부터 다시 시도해 주세요.');
}

$api = new C_KCP_API_V2($site_cd, $kcp_enc_key, $cert_reg_url, $cert_dec_url);
$cert = $api->get_cert_data($reg_cert_key, $ordr_idxx);

if (!isset($cert['res_cd']) || $cert['res_cd'] !== '0000') {
    $resCd = isset($cert['res_cd']) ? $cert['res_cd'] : '';
    $resMsg = isset($cert['res_msg']) ? $cert['res_msg'] : '';
    cert_emit_error_and_close('본인확인 결과조회 실패 (' . $resCd . ' : ' . $resMsg . ')');
}

$phone_no  = isset($cert['phone_no']) ? trim((string) $cert['phone_no']) : '';
$user_name = isset($cert['user_name']) ? trim((string) $cert['user_name']) : '';
$birth_day = isset($cert['birth_day']) ? trim((string) $cert['birth_day']) : '';
$sex_code  = isset($cert['sex_code']) ? trim((string) $cert['sex_code']) : '';
$ci        = isset($cert['ci']) ? trim((string) $cert['ci']) : '';
$di        = isset($cert['di']) ? trim((string) $cert['di']) : '';

if (!$phone_no || !$user_name || !$birth_day || !$ci || !$di) {
    cert_emit_error_and_close('정상적인 인증이 아닙니다. 올바른 방법으로 이용해 주세요.');
}

$phone_no = hyphen_hp_number($phone_no);
$md5_ci = md5($ci . $ci);
$mb_dupinfo = $md5_ci;
$sql_md5_ci = sql_real_escape_string($md5_ci);
$sql_di = sql_real_escape_string($di);

if (!empty($member['mb_certify']) && !empty($member['mb_dupinfo']) && strlen($member['mb_dupinfo']) != 64) {
    if ($member['mb_dupinfo'] != $mb_dupinfo && $member['mb_dupinfo'] != $di) {
        cert_emit_error_and_close('해당 계정은 이미 다른 명의로 본인인증 되어있는 계정입니다.');
    }
}

$existMbId = isset($member['mb_id']) ? sql_real_escape_string($member['mb_id']) : '';
$row = sql_fetch(
    " select mb_id, mb_dupinfo from {$g5['member_table']}
      where mb_id <> '{$existMbId}' and (mb_dupinfo = '{$sql_md5_ci}' or mb_dupinfo = '{$sql_di}')
      limit 1 "
);

if ($certPageType === 'find') {
    if (!empty($row['mb_id']) && !empty($row['mb_dupinfo'])) {
        $mb_dupinfo = $row['mb_dupinfo'];
    }
} else if (!empty($row['mb_id'])) {
    cert_emit_error_and_close("입력하신 본인확인 정보로 이미 가입된 내역이 존재합니다.\n회원아이디 : " . $row['mb_id']);
}

$cert_type = 'hp';
$md5_cert_no = md5($reg_cert_key);
$hash_data = md5($user_name . $cert_type . $birth_day . $phone_no . $md5_cert_no);

$adult_day = date('Ymd', strtotime('-19 years', G5_SERVER_TIME));
$adult = ((int) $birth_day <= (int) $adult_day) ? 1 : 0;

set_session('ss_cert_type', $cert_type);
set_session('ss_cert_no', $md5_cert_no);
set_session('ss_cert_hash', $hash_data);
set_session('ss_cert_adult', $adult);
set_session('ss_cert_birth', $birth_day);
set_session('ss_cert_sex', ($sex_code == '01' ? 'M' : 'F'));
set_session('ss_cert_dupinfo', $mb_dupinfo);

cert_emit_result_and_close(array(
    'status'    => 'success',
    'provider'  => 'kcp_v2-hp',
    'cert_type' => $cert_type,
    'mb_name'   => $user_name,
    'mb_hp'     => $phone_no,
    'cert_no'   => $md5_cert_no,
    'mb_birth'  => $birth_day,
    'adult'     => (int) $adult,
));
