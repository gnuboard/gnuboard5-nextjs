<?php
/**
 * 앱 본인인증 토큰 (SC-21).
 *
 * 웹은 본인인증 결과를 PHP 세션(ss_cert_*)에 두고 같은 세션으로 가입을 제출한다. 앱은 인증을 WebView 에서 하고
 * 가입은 네이티브 요청으로 보내므로 세션을 믿을 수 없다. 그래서 인증 결과 페이지(api/cert/*_result.php)가 세션에
 * 막 기록한 검증값으로 짧은 서명 토큰을 만들어 WebView 로 넘기고, 가입(`POST /v1/auth/register`)은 그 토큰만 믿는다.
 *
 * - 서명: 기존 JWT_SECRET(HS256). 10분 유효.
 * - 재사용: 같은 본인인증 정보(mb_dupinfo)로는 두 번째 가입이 막히므로 토큰을 다시 써도 계정이 늘지 않는다.
 * - 담는 값은 본인 것(이름·휴대폰·생년월일)과 해시(cert_no·dupinfo)뿐이고, 토큰은 인증한 본인의 앱에만 전달된다.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/JWT.php';

if (!defined('API_CERT_TOKEN_PURPOSE')) {
    define('API_CERT_TOKEN_PURPOSE', 'identity_cert');
}
if (!defined('API_CERT_TOKEN_TTL')) {
    define('API_CERT_TOKEN_TTL', 600);
}

/**
 * @param array $claims page_type, cert_type, cert_no, name, hp, birth, adult, sex, dupinfo
 */
function api_cert_token_issue(array $claims): string
{
    return JWT::encode([
        'purpose'   => API_CERT_TOKEN_PURPOSE,
        'page_type' => (string) ($claims['page_type'] ?? ''),
        'cert_type' => (string) ($claims['cert_type'] ?? ''),
        'cert_no'   => (string) ($claims['cert_no'] ?? ''),
        'name'      => (string) ($claims['name'] ?? ''),
        'hp'        => (string) ($claims['hp'] ?? ''),
        'birth'     => (string) ($claims['birth'] ?? ''),
        'adult'     => (int) ($claims['adult'] ?? 0),
        'sex'       => (string) ($claims['sex'] ?? ''),
        'dupinfo'   => (string) ($claims['dupinfo'] ?? ''),
    ], null, API_CERT_TOKEN_TTL);
}

/**
 * 서명·만료·용도·페이지 종류를 확인한 클레임. 하나라도 어긋나면 null.
 */
function api_cert_token_read(string $token, string $pageType): ?array
{
    $claims = JWT::decode(trim($token));
    if (!is_array($claims) || ($claims['purpose'] ?? '') !== API_CERT_TOKEN_PURPOSE) {
        return null;
    }
    if (($claims['page_type'] ?? '') !== $pageType) {
        return null;
    }
    if (!in_array($claims['cert_type'] ?? '', ['simple', 'hp', 'ipin'], true)) {
        return null;
    }
    if (($claims['cert_no'] ?? '') === '' || ($claims['dupinfo'] ?? '') === '' || ($claims['name'] ?? '') === '') {
        return null;
    }

    return $claims;
}
