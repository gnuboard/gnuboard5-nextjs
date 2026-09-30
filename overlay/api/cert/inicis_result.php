<?php
/**
 * KG 이니시스 통합인증 결과 — plugin/inicert/ini_result.php 의 api 어댑터.
 *
 * 복호화·검증·세션(ss_cert_*) 저장 로직은 원본과 동일하며, 결과를 opener-DOM 에
 * 주입하는 대신 postMessage 로 Next.js 에 전달한다. 플러그인의 libs/ 만 재사용.
 */

require_once __DIR__ . '/_cert_common.php';
require_once G5_INICERT_PATH . '/libs/KISA_SEED_CBC.php';
require_once G5_INICERT_PATH . '/libs/INILib.php';

if (empty($config['cf_cert_use']) || (string) $config['cf_cert_simple'] !== 'inicis') {
    cert_emit_error_and_close('KG이니시스 간편인증이 비활성화되어 있습니다.');
}

$txId    = isset($_POST['txId']) ? clean_xss_tags($_POST['txId'], 1, 1) : '';
$mid     = substr($txId, 6, 10);
$SEEDKEY = isset($_POST['token']) ? clean_xss_tags($_POST['token'], 1, 1) : '';
$SEEDIV  = 'SASHOSTSIRIAS000';

if (!($txId && isset($_POST['resultCode']) && $_POST['resultCode'] === '0000')) {
    cert_emit_error_and_close(
        '코드 : ' . (isset($_POST['resultCode']) ? clean_xss_tags($_POST['resultCode'], 1, 1) : '')
        . '  ' . (isset($_POST['resultMsg']) ? clean_xss_tags(urldecode($_POST['resultMsg']), 1, 1) : '')
    );
}

$data = array('mid' => $mid, 'txId' => $txId);
$post_data = json_encode($data);

$authRequestUrl = isset($_POST['authRequestUrl']) ? is_inicis_url_return($_POST['authRequestUrl']) : '';

// SaSample 가이드대로 응답 URL 을 검증.
if (!(strpos($authRequestUrl, 'https://kssa.inicis.com') == 0 || strpos($authRequestUrl, 'https://fcsa.inicis.com') == 0)) {
    $authRequestUrl = '';
}
if (!$authRequestUrl) {
    cert_emit_error_and_close('잘못된 요청입니다.');
}

// 결과조회 (server-to-server)
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $authRequestUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_POSTFIELDS, $post_data);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, array('Accept: application/json', 'Content-Type: application/json'));
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$response = curl_exec($ch);
curl_close($ch);
$res_data = json_decode($response, true);

if (!isset($res_data['resultCode']) || $res_data['resultCode'] !== '0000') {
    cert_emit_error_and_close(
        '코드 : ' . (isset($res_data['resultCode']) ? $res_data['resultCode'] : '')
        . '  ' . (isset($res_data['resultMsg']) ? urldecode($res_data['resultMsg']) : '')
    );
}

$cert_type = 'simple';                 // 인증타입
$cert_no   = $res_data['txId'];        // 이니시스 트랜잭션 ID
$phone_no  = $res_data['userPhone'];   // 전화번호
$user_name = $res_data['userName'];    // 이름
$birth_day = $res_data['userBirthday']; // 생년월일
$ci        = $res_data['userCi'];      // CI

if (defined('KGINICIS_USE_CERT_SEED') && KGINICIS_USE_CERT_SEED) {
    // 개인정보 SEED 복호화
    $user_name = decrypt_SEED($user_name, $SEEDKEY, $SEEDIV);
    $phone_no  = decrypt_SEED($phone_no, $SEEDKEY, $SEEDIV);
    $birth_day = decrypt_SEED($birth_day, $SEEDKEY, $SEEDIV);
    $ci        = decrypt_SEED($ci, $SEEDKEY, $SEEDIV);
}

@insert_cert_history(isset($member['mb_id']) ? $member['mb_id'] : '', 'inicis', $cert_type);

if (!$phone_no) {
    cert_emit_error_and_close('정상적인 인증이 아닙니다. 올바른 방법으로 이용해 주세요.');
}

$mb_dupinfo = md5($ci . $ci);
$phone_no   = hyphen_hp_number($phone_no);
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
    cert_emit_error_and_close("입력하신 본인확인 정보로 이미 가입된 내역이 존재합니다.\n회원아이디 : " . $row['mb_id']);
}

$md5_cert_no = md5($cert_no);
$hash_data   = md5($user_name . $cert_type . $birth_day . $phone_no . $md5_cert_no);

// 성인인증
$adult_day = date('Ymd', strtotime('-19 years', G5_SERVER_TIME));
$adult = ((int) $birth_day <= (int) $adult_day) ? 1 : 0;

set_session('ss_cert_type',    $cert_type);
set_session('ss_cert_no',      $md5_cert_no);
set_session('ss_cert_hash',    $hash_data);
set_session('ss_cert_adult',   $adult);
set_session('ss_cert_birth',   $birth_day);
set_session('ss_cert_dupinfo', $mb_dupinfo);

cert_emit_result_and_close(array(
    'status'    => 'success',
    'provider'  => 'inicis-simple',
    'cert_type' => $cert_type,
    'mb_name'   => $user_name,
    'mb_hp'     => $phone_no,
    'cert_no'   => $md5_cert_no,
    'mb_birth'  => $birth_day,
    'adult'     => (int) $adult,
));
