<?php
/**
 * Gnuboard5 REST API - Site Settings Endpoint
 *
 * Routes handled (prefix: v1/settings):
 *   GET /v1/settings - Get public site settings
 */

if (!defined('_GNUBOARD_')) exit;

// -------------------------------------------------------------------------
// GET /v1/settings
// -------------------------------------------------------------------------
if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

$config = api_get_config();

if (!$config || empty($config['cf_title'])) {
    Response::error('Site configuration not found.', 500);
}

/**
 * 접속자집계. 그누보드는 네 수치를 cf_visit 한 문자열에 넣어 둔다
 * ("오늘:1,어제:1,최대:1,전체:13"). lib/visit.lib.php 와 같은 패턴으로 읽는다.
 * 레거시 테마가 이미 공개하던 값이라 공개 설정에 함께 내려도 새로 새는 정보는 없다.
 */
$visit = ['today' => 0, 'yesterday' => 0, 'max' => 0, 'total' => 0];
if (!empty($config['cf_visit'])
    && preg_match('/오늘:(.*),어제:(.*),최대:(.*),전체:(.*)/', $config['cf_visit'], $visitMatch)) {
    $visit = [
        'today'     => (int) str_replace(',', '', $visitMatch[1]),
        'yesterday' => (int) str_replace(',', '', $visitMatch[2]),
        'max'       => (int) str_replace(',', '', $visitMatch[3]),
        'total'     => (int) str_replace(',', '', $visitMatch[4]),
    ];
}

// Return only public/safe configuration values
$publicSettings = [
    'cf_title'          => isset($config['cf_title']) ? $config['cf_title'] : '',
    'cf_add_script'     => isset($config['cf_add_script']) ? $config['cf_add_script'] : '',
    'cf_add_meta'       => isset($config['cf_add_meta']) ? $config['cf_add_meta'] : '',
    'cf_use_point'      => isset($config['cf_use_point']) ? (int) $config['cf_use_point'] : 0,
    'cf_login_point'    => isset($config['cf_login_point']) ? (int) $config['cf_login_point'] : 0,
    'cf_memo_send_point'=> isset($config['cf_memo_send_point']) ? (int) $config['cf_memo_send_point'] : 0,
    'cf_register_level' => isset($config['cf_register_level']) ? (int) $config['cf_register_level'] : 2,
    'cf_register_point' => isset($config['cf_register_point']) ? (int) $config['cf_register_point'] : 0,
    'cf_nick_modify'    => isset($config['cf_nick_modify']) ? (int) $config['cf_nick_modify'] : 0,
    'cf_use_email_certify' => isset($config['cf_use_email_certify']) ? (int) $config['cf_use_email_certify'] : 0,
    'cf_use_homepage'   => isset($config['cf_use_homepage']) ? (int) $config['cf_use_homepage'] : 0,
    'cf_use_tel'        => isset($config['cf_use_tel']) ? (int) $config['cf_use_tel'] : 0,
    'cf_use_hp'         => isset($config['cf_use_hp']) ? (int) $config['cf_use_hp'] : 0,
    'cf_use_addr'       => isset($config['cf_use_addr']) ? (int) $config['cf_use_addr'] : 0,
    'cf_use_signature'  => isset($config['cf_use_signature']) ? (int) $config['cf_use_signature'] : 0,
    'cf_use_profile'    => isset($config['cf_use_profile']) ? (int) $config['cf_use_profile'] : 0,
    'cf_use_recaptcha'  => isset($config['cf_use_recaptcha']) ? (int) $config['cf_use_recaptcha'] : 0,
    'cf_page_rows'      => isset($config['cf_page_rows']) ? (int) $config['cf_page_rows'] : 15,
    'cf_mobile_page_rows' => isset($config['cf_mobile_page_rows']) ? (int) $config['cf_mobile_page_rows'] : 15,
    'cf_write_pages'    => isset($config['cf_write_pages']) ? (int) $config['cf_write_pages'] : 10,
    'cf_mobile_pages'   => isset($config['cf_mobile_pages']) ? (int) $config['cf_mobile_pages'] : 5,
    'cf_new_rows'       => isset($config['cf_new_rows']) ? (int) $config['cf_new_rows'] : 10,
    'cf_hot_rows'       => isset($config['cf_hot_rows']) ? (int) $config['cf_hot_rows'] : 10,
    'cf_bbs_rewrite'    => isset($config['cf_bbs_rewrite']) ? (int) $config['cf_bbs_rewrite'] : 0,
    'cf_image_extension'=> isset($config['cf_image_extension']) ? $config['cf_image_extension'] : '',
    'cf_flash_extension'=> isset($config['cf_flash_extension']) ? $config['cf_flash_extension'] : '',
    'cf_movie_extension'=> isset($config['cf_movie_extension']) ? $config['cf_movie_extension'] : '',
    'visit'             => $visit,
    'shop_enabled'      => defined('G5_USE_SHOP') ? G5_USE_SHOP : false,
    'comment_editor'    => defined('G5_COMMENT_EDITOR_USE') ? (bool) G5_COMMENT_EDITOR_USE : false,
    'infinite_scroll'   => defined('G5_INFINITE_SCROLL_USE') ? (bool) G5_INFINITE_SCROLL_USE : false,
    'pwa_enabled'       => defined('G5_PWA_USE') ? (bool) G5_PWA_USE : false,

    /**
     * 모바일 앱 버전 정책 — 강제 업그레이드용.
     *  - app_min_version: 이 버전 미만은 차단(앱 사용 불가, 강제 업데이트 모달).
     *  - app_latest_version: 최신 버전. 같으면 정상, 낮으면 soft prompt(권장 업데이트).
     *  - app_store_url_android/ios: 스토어 직링크. 미설정이면 클라이언트 폴백.
     *  - app_force_update_message: 강제 업데이트 모달 본문 (i18n 미반영, 서버 단일 메시지).
     *
     * 보안 패치 배포 후 운영자가 G5_APP_MIN_VERSION 환경변수 또는 상수만 올리면
     * 옛 버전 사용자가 다음 부팅 시 강제 업그레이드 화면으로 막힌다.
     */
    'app_min_version'           => defined('G5_APP_MIN_VERSION') ? (string) G5_APP_MIN_VERSION : '0.0.0',
    'app_latest_version'        => defined('G5_APP_LATEST_VERSION') ? (string) G5_APP_LATEST_VERSION : '0.0.0',
    'app_store_url_android'     => defined('G5_APP_STORE_URL_ANDROID') ? (string) G5_APP_STORE_URL_ANDROID : '',
    'app_store_url_ios'         => defined('G5_APP_STORE_URL_IOS') ? (string) G5_APP_STORE_URL_IOS : '',
    'app_force_update_message'  => defined('G5_APP_FORCE_UPDATE_MESSAGE') ? (string) G5_APP_FORCE_UPDATE_MESSAGE : '',
];

/*
 * SC-05: 앱별 버전 게이트 · 기능 플래그 · 법적 URL.
 *
 * 위 app_* 5개는 dday-app 과 공유하는 전역값이다. GET /settings?app=<패키지명> 이면 그 앱 전용 값
 * (.env G5_APP_<PACKAGE>_*) 을 apps[패키지명] 에 담고, 하나라도 설정돼 있으면 top-level app_* 도 덮어쓴다
 * (앱의 versionPolicy 가 top-level 을 읽으므로). ?app 이 없거나 형식이 틀리면 기존 응답 그대로다(400 아님).
 * apps / features / legal_urls 키는 ?app 과 무관하게 항상 내려간다(추가 키 — dday-app·Next.js 는 읽지 않는다).
 */
if (!function_exists('api_settings_app_key_prefix')) {
    /** ?app 값 검증 → 설정 키 접두어. 형식이 틀리면 null. */
    function api_settings_app_key_prefix($app)
    {
        if (!is_string($app) || !preg_match('/^[a-z][a-z0-9_.]{2,99}$/', $app)) {
            return null;
        }
        return 'G5_APP_' . strtoupper(preg_replace('/[^a-z0-9]+/i', '_', $app)) . '_';
    }
}

if (!function_exists('api_settings_app_versions')) {
    /** 앱별 버전 정책 — 하나도 설정되지 않았으면 null. */
    function api_settings_app_versions($app)
    {
        $prefix = api_settings_app_key_prefix($app);
        if ($prefix === null) {
            return null;
        }
        $fields = [
            'min_version'          => 'MIN_VERSION',
            'latest_version'       => 'LATEST_VERSION',
            'store_url_android'    => 'STORE_URL_ANDROID',
            'store_url_ios'        => 'STORE_URL_IOS',
            'force_update_message' => 'FORCE_UPDATE_MESSAGE',
        ];
        $values = [];
        $configured = false;
        foreach ($fields as $field => $suffix) {
            $values[$field] = api_settings_app_value($field, g5_api_config_value($prefix . $suffix));
            if ($values[$field] !== '') {
                $configured = true;
            }
        }
        return $configured ? $values : null;
    }
}

if (!function_exists('api_settings_app_value')) {
    /**
     * 값 형식 검증 — 공개 엔드포인트라, 키 이름이 우연히 G5_APP_<X>_MIN_VERSION 꼴과 겹치는 다른 상수·환경값이
     * 새어 나가지 않게 필드마다 모양이 맞는 값만 내보낸다(버전은 숫자 점 표기, 스토어 URL 은 https, 메시지는 짧은 평문).
     */
    function api_settings_app_value($field, $value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '';
        }
        if ($field === 'min_version' || $field === 'latest_version') {
            return preg_match('/^\d{1,4}(\.\d{1,4}){0,3}$/', $value) ? $value : '';
        }
        if ($field === 'store_url_android' || $field === 'store_url_ios') {
            $isHttps = stripos($value, 'https://') === 0 && filter_var($value, FILTER_VALIDATE_URL) !== false;
            return $isHttps ? $value : '';
        }
        $message = strip_tags($value);
        return function_exists('mb_substr') ? mb_substr($message, 0, 500, 'UTF-8') : substr($message, 0, 500);
    }
}

if (!function_exists('api_settings_features')) {
    /** 기능 플래그 — 고정 9개 키가 항상 존재하고, G5_APP_FEATURES 콤마 목록에 있는 것만 true(모르는 키는 무시). */
    function api_settings_features()
    {
        $known = [
            'ugc_reviews', 'ugc_product_qa', 'ugc_memos', 'ugc_poll_opinions',
            'order_status_filter', 'purchase_confirm', 'webview_pg', 'apple_login', 'resend_verification',
        ];
        $enabled = array_filter(array_map('trim', explode(',', strtolower(g5_api_config_value('G5_APP_FEATURES')))));
        $features = [];
        foreach ($known as $key) {
            $features[$key] = in_array($key, $enabled, true);
        }
        return $features;
    }
}

if (!function_exists('api_settings_legal_urls')) {
    /** 법적 페이지 URL — G5_LEGAL_<KIND>_URL 이 있으면 그것, 없으면 legal/*.php 가 실제로 있을 때만 내려보낸다. */
    function api_settings_legal_urls()
    {
        $pages = [
            'privacy'          => ['privacy.php', ''],
            'terms'            => ['terms.php', ''],
            'account_deletion' => ['account-deletion.php', ''],
            'refund'           => ['terms.php', '#refund'],
        ];
        $slug = g5_api_config_value('G5_LEGAL_APP_SLUG');
        $query = $slug !== '' ? '?app=' . rawurlencode($slug) : '';
        $urls = [];
        foreach ($pages as $kind => $page) {
            $override = g5_api_config_value('G5_LEGAL_' . strtoupper($kind) . '_URL');
            if ($override !== '') {
                $urls[$kind] = $override;
                continue;
            }
            if (defined('G5_PATH') && defined('G5_URL') && is_file(G5_PATH . '/legal/' . $page[0])) {
                $urls[$kind] = G5_URL . '/legal/' . $page[0] . $query . $page[1];
            }
        }
        return $urls;
    }
}

if (!function_exists('api_settings_company')) {
    /**
     * SC-18: 전자상거래법 제10조 사업자 신원정보 — 영카트 기본환경설정(g5_shop_default)의 de_admin_* 를 투영한다.
     * 값은 trim, 빈 값 키는 뺀다. 쇼핑몰이 꺼져 있거나 읽기에 실패했거나 전부 비면 null(키 생략 → 앱은 섹션을 숨긴다).
     * 공개 정보(웹 푸터에 이미 노출)만 담는다.
     */
    function api_settings_company(): ?array
    {
        global $g5;
        if (!(defined('G5_USE_SHOP') && G5_USE_SHOP) || empty($g5['g5_shop_default_table'])) {
            return null;
        }
        $fields = [
            'name'            => 'de_admin_company_name',
            'ceo'             => 'de_admin_company_owner',
            'biz_no'          => 'de_admin_company_saupja_no',
            'mail_order_no'   => 'de_admin_tongsin_no',
            'addr'            => 'de_admin_company_addr',
            'tel'             => 'de_admin_company_tel',
            'email'           => 'de_admin_info_email',
            'privacy_officer' => 'de_admin_info_name',
        ];
        try {
            $row = DB::fetch('SELECT ' . implode(', ', $fields) . ' FROM `' . $g5['g5_shop_default_table'] . '` LIMIT 1');
        } catch (\Throwable $e) {
            error_log('[settings] company read failed: ' . $e->getMessage());
            return null;
        }
        $company = [];
        foreach ($fields as $key => $column) {
            $value = trim(strip_tags((string) ($row[$column] ?? '')));
            if ($value !== '') {
                $company[$key] = $value;
            }
        }
        return $company ?: null;
    }
}

$requestedApp = isset($_GET['app']) ? trim((string) $_GET['app']) : '';
$appVersions = $requestedApp !== '' ? api_settings_app_versions($requestedApp) : null;
if ($appVersions !== null) {
    $publicSettings['app_min_version']          = $appVersions['min_version'];
    $publicSettings['app_latest_version']       = $appVersions['latest_version'];
    $publicSettings['app_store_url_android']    = $appVersions['store_url_android'];
    $publicSettings['app_store_url_ios']        = $appVersions['store_url_ios'];
    $publicSettings['app_force_update_message'] = $appVersions['force_update_message'];
}
// 빈 목록도 JSON 객체({})로 내려보낸다 — 앱은 레코드(맵)로 파싱한다.
$publicSettings['apps'] = $appVersions !== null ? [$requestedApp => $appVersions] : new stdClass();
$publicSettings['features'] = api_settings_features();
$legalUrls = api_settings_legal_urls();
$publicSettings['legal_urls'] = $legalUrls ? $legalUrls : new stdClass();
$company = api_settings_company();
if ($company !== null) {
    $publicSettings['company'] = $company;
}

Response::success($publicSettings);
