<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 예전 쇼핑 처리 주소의 위조 요청(CSRF) 막기 — 그누보드 원본을 고치지 않고 extend 단계에서 거른다.
 *
 *   shop/cartupdate.php  장바구니 담기 · 바꾸기 · 지우기는 POST 로만. 원본 어디에서도 GET 으로 부르지 않는데,
 *                        GET 을 받아 두면 다른 사이트의 링크 · 이미지 한 장으로 방문자의 장바구니를 바꿀 수 있다.
 *   shop/wishupdate.php  찜 삭제(w=d)는 원본이 GET 링크로 만든다 — 그래서 방법이 아니라 출처를 본다.
 *                        요청의 Origin(없으면 Referer) 호스트가 이 사이트일 때만 받는다.
 *
 * 예전에는 원본 파일(shop/cartupdate.php · wishupdate.php …)을 직접 고쳐 막았다. 원본을 그대로 두면서
 * 같은 보호를 유지하려고 여기로 옮겼다(2026-10-02, 그누보드 5.6.41 업데이트). 5.6.30 · 5.6.41 모두 같은 주소다.
 *
 * 같은 방식(원본은 그대로, extend 단계에서 먼저 거르기)으로 2026-10-07 보안 점검의 두 자리도 막는다.
 *
 *   bbs/qawrite_update.php  새 1:1 문의마다 관리자에게 유료 문자가 나간다 — API 와 같은 한도를 저장 전에 건다.
 *   소셜 로그인 복귀 주소   원본이 거르지 않은 url 을 그대로 화면에 찍는다 — 원본이 읽기 전에 걸러 둔다.
 */

if (!function_exists('g5_webapp_legacy_shop_guard')) {
    function g5_webapp_legacy_shop_guard(): void
    {
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        if (!preg_match('~/shop/(cartupdate|wishupdate)\.php$~', $script, $match)) {
            return;
        }
        $back = defined('G5_SHOP_URL') ? G5_SHOP_URL : (defined('G5_URL') ? G5_URL : '/');

        if ($match[1] === 'cartupdate') {
            if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
                alert('올바른 방법으로 이용해 주십시오.', $back . '/cart.php');
            }
            return;
        }

        $source = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($source === '' || $source === 'null') {
            $source = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
        }
        $sourceHost = strtolower((string) parse_url($source, PHP_URL_HOST));
        $selfHost = strtolower((string) parse_url('http://' . (string) ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
        if ($sourceHost === '' || $selfHost === '' || $sourceHost !== $selfHost) {
            alert('올바른 경로로 접근해 주십시오.', $back);
        }
    }
}

if (!function_exists('g5_webapp_legacy_qa_quota_guard')) {
    /**
     * 원본 1:1 문의 저장(bbs/qawrite_update.php)에 API(api/v1/qas.php)와 같은 새 문의 한도를 건다.
     * 원본은 새 질문(w = '') · 추가 질문(w = 'r')마다 관리자 휴대폰(qa_admin_hp)으로 유료 문자를 보내는데 폼 토큰 말고는
     * 막는 것이 없고, 토큰은 bbs/ajax.write.token.php 로 몇 번이고 다시 받는다. 원본의 훅(qawrite_update)은 이미 저장한
     * 뒤라 여기서 저장 전에 센다 — 넘으면 원본처럼 경고창만 띄우고 저장 · 문자 · 메일 모두 일어나지 않는다.
     * 회원별 1분 3건 · 1시간 20건, IP 별 1분 5건 · 1시간 30건을 API 와 같은 기록(qacreate · qacreateip)으로 세서 두 길을
     * 번갈아 써도 한도는 하나다. 원본이 받아 줄 요청(POST · 회원 · 맞는 토큰)만 센다 — 다른 사이트가 보낸 위조 요청으로
     * 남의 한도를 채우지 못하게. 최고관리자 · 답변(a) · 수정(u)은 세지 않는다. 기록 표나 API 파일이 없거나 DB 오류면
     * 예전처럼 막지 않는다(원본 문의 화면을 멈추지 않는다).
     */
    function g5_webapp_legacy_qa_quota_guard(): void
    {
        global $member, $is_admin, $w;

        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        if (!preg_match('~/bbs/qawrite_update\.php$~', $script)
            || strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST'
            || !in_array((string) $w, array('', 'r'), true)
            || empty($member['mb_id']) || $is_admin === 'super') {
            return;
        }
        // 원본(qawrite_update.php:17-24)과 같은 토큰 비교 — 세션 토큰은 지우지 않는다(원본이 지운다)
        $token = isset($_POST['token']) && is_string($_POST['token']) ? clean_xss_tags($_POST['token'], 1, 1) : '';
        $writeToken = get_session('ss_qa_write_token');
        if ($token === '' || !is_string($writeToken) || $writeToken !== $token) {
            return;
        }

        $root = defined('G5_PATH') ? G5_PATH : dirname(__DIR__, 3);
        if (!is_file($root . '/api/lib/DB.php') || !is_file($root . '/api/lib/Throttle.php')) {
            return;
        }
        try {
            if (!class_exists('DB')) {
                require_once $root . '/api/lib/DB.php';
            }
            if (!class_exists('Throttle')) {
                require_once $root . '/api/lib/Throttle.php';
            }
            $msg = Throttle::checkMemberQuota('qacreate', (string) $member['mb_id'], 3, 20);
            if ($msg === null) {
                $msg = Throttle::checkMemberQuota('qacreateip', 'ip:' . (string) ($_SERVER['REMOTE_ADDR'] ?? ''), 5, 30);
            }
        } catch (Throwable $e) {
            error_log('[webapp legacy_guard] qa quota skipped: ' . $e->getMessage());
            return;
        }
        if ($msg !== null) {
            alert($msg);
        }
    }
}

if (!function_exists('g5_webapp_legacy_social_url_guard')) {
    /**
     * 원본 소셜 로그인의 복귀 주소(url)를 그누보드가 쓰는 값으로 맞춘다.
     * common.php:519 는 $url 을 거르지만 plugin/social/includes/functions.php 의 social_check_login_before() 는
     * $_REQUEST['url'] 을 다시 그대로 읽어 includes/loading.php:30 의 hidden input 에 찍는다 — "> 로 속성을 닫고 스크립트를
     * 넣을 수 있다(소셜 계정이 연결된 회원이 그 링크로 로그인하면 이 사이트에서 실행된다). 원본은 요청에 provider 가 있을
     * 때만 이 길로 간다(plugin/social/popup.php · bbs/login.php) — 그때만 common.php 와 같은 규칙으로 걸러 둔다.
     * 정상 주소는 그대로이고, 로그인 뒤 이동 검사(login_check.php 의 check_url_host)도 원본 그대로다.
     */
    function g5_webapp_legacy_social_url_guard(): void
    {
        if (empty($_REQUEST['provider']) || !isset($_REQUEST['url']) || !is_string($_REQUEST['url'])) {
            return;
        }
        $url = preg_replace('|[^a-z0-9-~+_.?#=!&;,/:%@$\|*\'()\[\]\\x80-\\xff]|i', '', trim($_REQUEST['url']));
        $_REQUEST['url'] = $url;
        if (isset($_GET['url'])) {
            $_GET['url'] = $url;
        }
        if (isset($_POST['url'])) {
            $_POST['url'] = $url;
        }
    }
}

g5_webapp_legacy_shop_guard();
g5_webapp_legacy_qa_quota_guard();
g5_webapp_legacy_social_url_guard();
