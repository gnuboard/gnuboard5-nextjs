<?php
/**
 * KCP(NHN) 휴대폰 본인인증 결과 — plugin/kcpcert/kcpcert_result.php 의 api 어댑터.
 *
 * dn_hash 검증·복호화·세션(ss_cert_*) 저장 로직은 원본과 동일. 차이점:
 *   - up_hash 위변조 검증을 opener-DOM 대신 PHP 세션(ss_cert_kcp_up_hash)으로 수행
 *   - 결과를 opener-DOM 주입 대신 postMessage 로 Next.js 에 전달
 * 플러그인의 lib/ct_cli 라이브러리만 재사용 (플러그인 PHP 는 수정하지 않음).
 */

require_once __DIR__ . '/_cert_common.php';
if (empty($config['cf_cert_use']) || (string) $config['cf_cert_hp'] !== 'kcp') {
    cert_emit_error_and_close('NHN KCP 휴대폰 본인확인이 비활성화되어 있습니다.');
}
// $home_dir, $kcp_enc_key, ct_cli 라이브러리, f_get_parm_str() 로드 (플러그인 설정 재사용).
include_once G5_KCPCERT_PATH . '/kcpcert_config.php';

$site_cd        = '';
$ordr_idxx      = '';
$cert_no        = '';
$cert_enc_use   = '';
$req_tx         = '';
$enc_cert_data  = '';
$enc_cert_data2 = '';
$dn_hash        = '';
$res_cd         = '';
$postedUpHash   = '';

foreach (array_keys($_POST) as $nmParam) {
    $valParam = $_POST[$nmParam];
    switch ($nmParam) {
        case 'site_cd':        $site_cd = f_get_parm_str($valParam); break;
        case 'ordr_idxx':      $ordr_idxx = f_get_parm_str($valParam); break;
        case 'res_cd':         $res_cd = f_get_parm_str($valParam); break;
        case 'cert_enc_use':   $cert_enc_use = f_get_parm_str($valParam); break;
        case 'req_tx':         $req_tx = f_get_parm_str($valParam); break;
        case 'cert_no':        $cert_no = f_get_parm_str($valParam); break;
        case 'enc_cert_data':  $enc_cert_data = f_get_parm_str($valParam); break;
        case 'enc_cert_data2': $enc_cert_data2 = f_get_parm_str($valParam); break;
        case 'dn_hash':        $dn_hash = f_get_parm_str($valParam); break;
        case 'up_hash':        $postedUpHash = f_get_parm_str($valParam); break;
    }
}

// up_hash 위변조 검증 — start 에서 세션에 저장한 값과 일치해야 함 (일회성).
$sessionUpHash = (string) get_session('ss_cert_kcp_up_hash');
set_session('ss_cert_kcp_up_hash', '');
if ($sessionUpHash === '' || !hash_equals($sessionUpHash, (string) $postedUpHash)) {
    cert_emit_error_and_close('up_hash 변조 위험이 감지되었습니다. 다시 시도해 주세요.');
}

$ct_cert = new C_CT_CLI();
$ct_cert->mf_clear();

if ($cert_enc_use !== 'Y') {
    // 암호화 인증 안함 = 사용자가 취소했거나 비정상 진입.
    cert_emit_error_and_close('휴대폰 본인확인을 취소 하셨습니다.');
}

@insert_cert_history(isset($member['mb_id']) ? $member['mb_id'] : '', 'kcp', 'hp');

if ($res_cd !== '0000') {
    cert_emit_error_and_close(
        '코드 : ' . (isset($_POST['res_cd']) ? $_POST['res_cd'] : '')
        . '  ' . (isset($_POST['res_msg']) ? urldecode($_POST['res_msg']) : '')
    );
}

// dn_hash 검증 (site_cd + ordr_idxx + cert_no)
$veri_str = $site_cd . $ordr_idxx . $cert_no;
$enc_cert_real_data = $enc_cert_data2;
$bin_path = 'bin';
if ((int) $config['cf_cert_use'] === 2 && !$config['cf_cert_kcp_enckey']) {
    $bin_path = 'bin_old';
    $enc_cert_real_data = $enc_cert_data;
}

if ($ct_cert->check_valid_hash($home_dir, $kcp_enc_key, $dn_hash, $veri_str) != '1') {
    cert_emit_error_and_close('dn_hash 변조 위험이 감지되었습니다. (ct_cli 실행권한 확인 필요)');
}

// 인증데이터 복호화 (site_cd + cert_no 로만 복호화 가능)
$opt = '1'; // UTF-8
$ct_cert->decrypt_enc_cert($home_dir, $kcp_enc_key, $site_cd, $cert_no, $enc_cert_real_data, $opt);

$phone_no   = $ct_cert->mf_get_key_value('phone_no');
$user_name  = $ct_cert->mf_get_key_value('user_name');
$birth_day  = $ct_cert->mf_get_key_value('birth_day');
$sex_code   = $ct_cert->mf_get_key_value('sex_code');
$ci         = $ct_cert->mf_get_key_value('ci');

if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' && function_exists('mb_detect_encoding')) {
    if (mb_detect_encoding($user_name, 'EUC-KR') === 'EUC-KR') {
        $user_name = iconv_utf8($user_name);
    }
}

$ct_cert->mf_clear();

if (!$phone_no) {
    cert_emit_error_and_close('정상적인 인증이 아닙니다. 올바른 방법으로 이용해 주세요.');
}

$phone_no   = hyphen_hp_number($phone_no);
$mb_dupinfo = md5($ci . $ci);
$certPageType = (string) get_session('ss_nextjs25_cert_page_type');
set_session('ss_nextjs25_cert_page_type', '');

// 명의 변경 체크 (로그인 상태에서 재인증 시)
if (!empty($member['mb_certify']) && !empty($member['mb_dupinfo']) && strlen($member['mb_dupinfo']) != 64) {
    if ($member['mb_dupinfo'] != $mb_dupinfo) {
        cert_emit_error_and_close('해당 계정은 이미 다른명의로 본인인증 되어있는 계정입니다.');
    }
}

$existMbId = isset($member['mb_id']) ? $member['mb_id'] : '';
$row = sql_fetch(" select mb_id from {$g5['member_table']} where mb_id <> '" . sql_real_escape_string($existMbId) . "' and mb_dupinfo = '" . sql_real_escape_string($mb_dupinfo) . "' ");
if ($certPageType !== 'find' && !empty($row['mb_id'])) {
    cert_emit_error_and_close("입력하신 본인확인 정보로 가입된 내역이 존재합니다.\n회원아이디 : " . $row['mb_id']);
}

$cert_type   = 'hp';
$md5_cert_no = md5($cert_no);
$hash_data   = md5($user_name . $cert_type . $birth_day . $phone_no . $md5_cert_no);

$adult_day = date('Ymd', strtotime('-19 years', G5_SERVER_TIME));
$adult = ((int) $birth_day <= (int) $adult_day) ? 1 : 0;

set_session('ss_cert_type',    $cert_type);
set_session('ss_cert_no',      $md5_cert_no);
set_session('ss_cert_hash',    $hash_data);
set_session('ss_cert_adult',   $adult);
set_session('ss_cert_birth',   $birth_day);
set_session('ss_cert_sex',     ($sex_code == '01' ? 'M' : 'F'));
set_session('ss_cert_dupinfo', $mb_dupinfo);

cert_emit_result_and_close(array(
    'status'    => 'success',
    'provider'  => 'kcp-hp',
    'cert_type' => $cert_type,
    'mb_name'   => $user_name,
    'mb_hp'     => $phone_no,
    'cert_no'   => $md5_cert_no,
    'mb_birth'  => $birth_day,
    'adult'     => (int) $adult,
));
