<?php
/**
 * 앱 법적 고지 페이지(앱 SC-06)의 부트스트랩 — 그누보드를 띄우고 사이트 정보(_layout.php 의 $site)를 읽는다.
 *
 * 그누보드5 앱을 쓰는 사이트마다 같은 파일을 쓰므로 문구에 특정 운영자를 적지 않는다. 서비스 이름은 기본환경설정의
 * 사이트 제목, 운영자 · 연락처는 쇼핑몰 기본환경설정의 사업자 정보(앱 /settings 의 company 와 같은 칸)에서,
 * 연락 메일이 비면 최고관리자 메일에서 읽는다. 사이트가 자기 문서를 따로 두면 api/.env 의 G5_LEGAL_<KIND>_URL 로
 * 앱이 그 주소를 연다(api/v1/settings.php).
 */
if (basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

// 공개 문서라 쿠키 없는 요청(심사관 · 검색 봇)이 많다 — api/index.php 와 같이 빈 세션 파일을 남기지 않게 감싼다.
if (is_file(dirname(__DIR__) . '/session_guard.php')) {
    require_once dirname(__DIR__) . '/session_guard.php';
    webapp_session_guard_install();
}
// 부트스트랩이 경고를 찍으면 페이지의 header() 가 무시된다 — api/index.php 처럼 받아서 로그로만 남긴다.
ob_start();
include_once dirname(__DIR__, 3) . '/common.php';
$g5_legal_bootstrap_output = ob_get_clean();
if (is_string($g5_legal_bootstrap_output) && trim($g5_legal_bootstrap_output) !== '') {
    error_log('[legal] suppressed bootstrap output: ' . substr(trim($g5_legal_bootstrap_output), 0, 1000));
}
require_once G5_PATH . '/api/lib/DB.php';

if (!function_exists('g5_legal_site')) {
    function g5_legal_site(): array
    {
        global $config, $g5;

        $clean = static function ($value): string {
            return trim(strip_tags((string) $value));
        };
        $service = $clean($config['cf_title'] ?? '');
        if ($service === '') {
            $service = '그누보드5';
        }

        $hasShop = defined('G5_USE_SHOP') && G5_USE_SHOP && !empty($g5['g5_shop_default_table']);
        $shop = [];
        if ($hasShop) {
            try {
                $shop = DB::fetch(
                    'SELECT de_admin_company_name, de_admin_company_owner, de_admin_company_saupja_no, de_admin_tongsin_no,
                            de_admin_company_addr, de_admin_company_tel, de_admin_info_email, de_admin_info_name
                       FROM `' . $g5['g5_shop_default_table'] . '` LIMIT 1'
                ) ?: [];
            } catch (\Throwable $e) {
                error_log('[legal] shop default read failed: ' . $e->getMessage());
            }
        }

        $company = [];
        foreach ([
            '상호'           => 'de_admin_company_name',
            '대표자'         => 'de_admin_company_owner',
            '사업자등록번호' => 'de_admin_company_saupja_no',
            '통신판매업신고' => 'de_admin_tongsin_no',
            '주소'           => 'de_admin_company_addr',
            '전화'           => 'de_admin_company_tel',
            '이메일'         => 'de_admin_info_email',
        ] as $label => $column) {
            $value = $clean($shop[$column] ?? '');
            if ($value !== '') {
                $company[$label] = $value;
            }
        }

        $email = $clean($shop['de_admin_info_email'] ?? '');
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = $clean($config['cf_admin_email'] ?? '');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = '';
        }

        $signup = [];
        foreach (['cf_use_hp' => '휴대폰 번호', 'cf_use_tel' => '전화번호', 'cf_use_addr' => '주소', 'cf_use_homepage' => '홈페이지 주소'] as $key => $label) {
            if (!empty($config[$key])) {
                $signup[] = $label;
            }
        }

        $social = [];
        if (!empty($config['cf_social_login_use'])) {
            $names = ['naver' => '네이버', 'kakao' => '카카오', 'google' => '구글', 'facebook' => '페이스북', 'twitter' => 'X(트위터)', 'payco' => '페이코'];
            foreach (explode(',', (string) ($config['cf_social_servicelist'] ?? '')) as $provider) {
                $provider = strtolower(trim($provider));
                if (isset($names[$provider])) {
                    $social[] = $names[$provider];
                }
            }
        }

        return [
            'service'  => $service,
            'operator' => $company['상호'] ?? $service,
            'email'    => $email,
            'officer'  => $clean($shop['de_admin_info_name'] ?? ''),
            'tel'      => $company['전화'] ?? '',
            'has_shop' => $hasShop,
            'company'  => $company,
            'signup'   => $signup,
            'cert'     => !empty($config['cf_cert_use']),
            'social'   => $social,
            'point'    => !empty($config['cf_use_point']),
        ];
    }
}
