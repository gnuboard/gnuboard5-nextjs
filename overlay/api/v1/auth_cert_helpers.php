<?php
/**
 * 가입 본인인증 (SC-21) — `POST /v1/auth/register` 가 받는 두 가지 증명을 한 곳에서 검증한다.
 *
 *  - `cert_token`(앱): api/cert/*_result.php 가 발급한 서명 토큰. 이름·휴대폰·생년월일·성인 여부를 토큰에서만 쓴다.
 *  - `cert_no`(웹 프런트): 같은 PHP 세션의 ss_cert_* 와 비교한다. 생년월일·성인 여부도 클라이언트 값이 아니라 세션에서
 *    가져온다(예전에는 입력값을 그대로 저장해 성인 여부를 속일 수 있었다).
 *
 * 둘 다 없으면 인증 안 함. 같은 본인인증 정보(mb_dupinfo)로 이미 가입한 회원이 있으면 409 — 웹 가입
 * (bbs/register_form_update.php)과 같은 규칙이고, 토큰 재사용으로 계정이 늘지 않게 하는 장치이기도 하다.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/../lib/cert_token.php';

/**
 * @return array{certified:string, name:?string, hp:?string, birth:string, adult:int, sex:string, dupinfo:string}
 *         certified 는 mb_certify 에 저장할 인증 종류(simple|hp|ipin), 인증이 없으면 ''.
 *         name/hp 가 null 이면 입력값을 그대로 쓴다.
 */
function api_auth_register_cert(array $input): array
{
    $token = isset($input['cert_token']) ? trim((string) $input['cert_token']) : '';
    if ($token !== '') {
        $cert = api_auth_register_cert_from_token($token);
    } else {
        $cert = api_auth_register_cert_from_session($input);
    }

    if ($cert['dupinfo'] !== '') {
        api_auth_register_cert_reject_duplicate($cert['dupinfo'], $token !== '' ? 'cert_token' : 'cert_no');
    }

    return $cert;
}

function api_auth_register_cert_from_token(string $token): array
{
    $claims = api_cert_token_read($token, 'register');
    if ($claims === null) {
        Response::error('본인인증 정보가 유효하지 않습니다. 다시 인증해주세요.', 422, [
            'cert_token' => '본인인증이 만료되었거나 올바르지 않습니다.',
        ]);
    }

    return [
        'certified' => (string) $claims['cert_type'],
        'name'      => (string) $claims['name'],
        'hp'        => (string) ($claims['hp'] ?? ''),
        'birth'     => (string) ($claims['birth'] ?? ''),
        'adult'     => (int) ($claims['adult'] ?? 0),
        'sex'       => (string) ($claims['sex'] ?? ''),
        'dupinfo'   => (string) $claims['dupinfo'],
    ];
}

function api_auth_register_cert_from_session(array $input): array
{
    $none = ['certified' => '', 'name' => null, 'hp' => null, 'birth' => '', 'adult' => 0, 'sex' => '', 'dupinfo' => ''];
    $certNo = isset($input['cert_no']) ? trim((string) $input['cert_no']) : '';
    if ($certNo === '') {
        return $none;
    }

    $certType = isset($input['cert_type']) ? trim((string) $input['cert_type']) : '';
    $sessionCertNo = (string) get_session('ss_cert_no');
    $sessionCertType = (string) get_session('ss_cert_type');
    if ($sessionCertNo === '' || $sessionCertNo !== $certNo) {
        Response::error('본인인증 정보가 유효하지 않습니다. 다시 인증해주세요.', 422, [
            'cert_no' => '본인인증 세션이 만료되었거나 일치하지 않습니다.',
        ]);
    }
    if ($sessionCertType !== '' && $sessionCertType !== $certType) {
        Response::error('본인인증 정보가 유효하지 않습니다. 다시 인증해주세요.', 422, [
            'cert_type' => '본인인증 종류가 일치하지 않습니다.',
        ]);
    }

    // 본인인증한 이름 · 휴대폰으로 가입하는지 — 그누보드 bbs/register_form_update.php 와 같은 해시 대조.
    // 인증 결과 페이지(api/cert/*_result.php)가 md5(이름.종류.생일.휴대폰.인증번호)를 ss_cert_hash 에 남긴다(아이핀은 휴대폰 빼고).
    $hashType = $sessionCertType !== '' ? $sessionCertType : $certType;
    $inputName = isset($input['mb_name']) ? trim((string) $input['mb_name']) : '';
    $inputHp = isset($input['mb_hp']) ? trim((string) $input['mb_hp']) : '';
    if (function_exists('hyphen_hp_number')) {
        $inputHp = hyphen_hp_number($inputHp);
    }
    $expectedHash = md5($inputName . $hashType . (string) get_session('ss_cert_birth')
        . ($hashType === 'ipin' ? '' : $inputHp) . $sessionCertNo);
    $sessionHash = (string) get_session('ss_cert_hash');
    if ($sessionHash === '' || !hash_equals($sessionHash, $expectedHash)) {
        Response::error('본인인증된 정보와 입력한 회원정보가 일치하지 않습니다. 다시 시도해 주세요.', 422, [
            'mb_name' => '본인인증한 이름 · 휴대폰 번호로 가입해 주세요.',
        ]);
    }

    return [
        'certified' => $sessionCertType !== '' ? $sessionCertType : ($certType !== '' ? $certType : 'hp'),
        'name'      => null,
        'hp'        => null,
        'birth'     => (string) get_session('ss_cert_birth'),
        'adult'     => (int) get_session('ss_cert_adult'),
        'sex'       => (string) get_session('ss_cert_sex'),
        'dupinfo'   => (string) get_session('ss_cert_dupinfo'),
    ];
}

function api_auth_register_cert_reject_duplicate(string $dupinfo, string $field): void
{
    // 같은 본인인증 정보로 동시에 두 번 가입하면(더블 탭·토큰 재전송) 둘 다 아래 검사를 통과할 수 있다 — 본인인증
    // 정보별 이름 잠금을 잡아 검사와 INSERT 를 한 줄로 세운다. 잠금은 이 요청의 DB 연결이 끝날 때(가입 INSERT 뒤) 풀린다.
    $lock = DB::fetch('SELECT GET_LOCK(?, 5) AS locked', ['g5_cert_' . md5($dupinfo)]);
    if (!$lock || (int) $lock['locked'] !== 1) {
        Response::error('잠시 후 다시 시도해 주세요.', 409, [
            $field => '같은 본인인증 정보로 가입을 처리하는 중입니다.',
        ]);
    }

    $exists = DB::fetch(
        'SELECT mb_id FROM ' . DB::table('member_table') . ' WHERE mb_dupinfo = ? LIMIT 1',
        [$dupinfo]
    );
    if ($exists && !empty($exists['mb_id'])) {
        Response::error('입력하신 본인확인 정보로 이미 가입된 내역이 존재합니다.', 409, [
            $field => '이미 가입된 본인인증 정보입니다.',
        ]);
    }
}
