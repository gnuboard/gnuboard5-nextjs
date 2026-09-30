<?php
/*
 * 테마가 앱을 띄우지 못할 때 대신 보여 주는 화면.
 *
 * head.php 는 theme/<테마>/app/index.html 이 있을 때만 앱 셸을 렌더링하고 exit 한다.
 * 그 파일이 없으면 여기까지 흘러내려와 이 화면이 나온다. 원인은 사실상 하나뿐이다 —
 * 개발 저장소의 overlay/ 트리만 복사한 설치본. 거기에는 PHP 브리지만 있고 Next 빌드
 * 산출물(app/)이 없다. 산출물은 릴리스 zip 에만 들어간다.
 *
 * 예전에는 두 경우를 한 문구로 덮어서("app 정적 산출물이 있으면 …") 설치가 덜 된 것인지
 * 원래 그런 화면인지 구분할 수 없었고, 404 가 뻔한 '정적 앱 열기' 버튼까지 같이 보여 줬다.
 * 지금은 산출물 유무로 갈라서, 없으면 무엇이 빠졌고 어디서 받는지 말한다.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/static-paths.php';

if (!defined('G5_NEXTJS_DEFAULT_RELEASES_URL')) {
    // 버전을 박아 두면 다음 릴리스에서 낡는다. 목록 페이지는 항상 최신을 가리킨다.
    define('G5_NEXTJS_DEFAULT_RELEASES_URL', 'https://github.com/gnuboard/gnuboard5-nextjs/releases');
}

if (!function_exists('nextjs_default_setup_panel')) {
    /**
     * @param string $variant 'home' 이면 사이트 홈, 'shop' 이면 영카트 화면.
     */
    function nextjs_default_setup_panel($variant = 'home')
    {
        $is_shop = $variant === 'shop';

        if (nextjs_default_static_app_ready()) {
            // 산출물은 있는데 이 화면이 보인다 = 테마 미리보기. 앱 셸을 건너뛰는 것이 정상이다.
            nextjs_default_setup_panel_ready($is_shop);
            return;
        }

        nextjs_default_setup_panel_missing($is_shop);
    }
}

if (!function_exists('nextjs_default_setup_panel_ready')) {
    function nextjs_default_setup_panel_ready($is_shop)
    {
        $api_url = $is_shop
            ? nextjs_default_trim_url(nextjs_default_g5_url()) . '/api/v1/shop/categories'
            : nextjs_default_api_url();
        ?>
<section class="nextjs_default-panel">
    <p class="nextjs_default-eyebrow">Gnuboard5 compatibility theme</p>
    <h1 class="nextjs_default-title">테마 미리보기입니다.</h1>
    <p class="nextjs_default-copy">
        정적 산출물이 준비되어 있습니다. 미리보기에서는 앱 셸을 띄우지 않으므로 이 안내가
        보입니다. 테마를 적용한 뒤 사이트 주소로 접속하면 실제 화면이 나옵니다.
    </p>
    <div class="nextjs_default-actions">
        <a class="nextjs_default-button" href="<?php echo get_text(nextjs_default_static_app_url('index.html')); ?>" target="_blank" rel="noopener">정적 앱 열기</a>
        <a class="nextjs_default-button secondary" href="<?php echo get_text($api_url); ?>" target="_blank" rel="noopener"><?php echo $is_shop ? '쇼핑 API 확인' : 'API 확인'; ?></a>
    </div>
    <?php nextjs_default_setup_panel_meta(true); ?>
</section>
        <?php
    }
}

if (!function_exists('nextjs_default_setup_panel_missing')) {
    function nextjs_default_setup_panel_missing($is_shop)
    {
        $index_path = nextjs_default_static_app_path('index.html');
        $check_url = nextjs_default_trim_url(nextjs_default_g5_url()) . '/nextjs-install/check.php';
        ?>
<section class="nextjs_default-panel nextjs_default-panel-incomplete">
    <p class="nextjs_default-eyebrow nextjs_default-eyebrow-warning">설치가 끝나지 않았습니다</p>
    <h1 class="nextjs_default-title">Next.js 정적 산출물이 없어 화면을 띄울 수 없습니다.</h1>
    <p class="nextjs_default-copy">
        테마는 <code><?php echo get_text($index_path); ?></code> 파일이 있을 때만
        <?php echo $is_shop ? '영카트5' : '그누보드5'; ?> 호환 화면을 제공합니다. 지금 그 파일이 없습니다.
        개발 저장소의 <code>overlay/</code> 트리에는 PHP 브리지만 들어 있고 빌드 산출물은
        포함되지 않으므로, <strong>릴리스 zip</strong>을 받아 덮어써야 합니다.
    </p>
    <ol class="nextjs_default-steps">
        <li>릴리스 페이지에서 <code>gnuboard5-nextjs-vX.Y.Z.zip</code>을 받습니다. 자동 생성되는 <code>Source code.zip</code>이 아닙니다.</li>
        <li>그누보드 루트에 그대로 압축을 풉니다. 덮어쓸 수 있는 구조입니다.</li>
        <li>관리자에서 <code>/adm/dbupgrade.php</code>를 실행합니다.</li>
        <li>Apache 라면 <code>nextjs-install/apache-htaccess-rules.txt</code>의 규칙을 루트 <code>.htaccess</code>의 기존 짧은주소 규칙보다 앞에 넣습니다.</li>
        <li>이 페이지를 새로 고칩니다.</li>
    </ol>
    <div class="nextjs_default-actions">
        <a class="nextjs_default-button" href="<?php echo G5_NEXTJS_DEFAULT_RELEASES_URL; ?>" target="_blank" rel="noopener noreferrer">릴리스 zip 받기</a>
        <?php if (is_file(G5_PATH . '/nextjs-install/check.php')) { ?>
        <a class="nextjs_default-button secondary" href="<?php echo get_text($check_url); ?>" target="_blank" rel="noopener">설치 점검</a>
        <?php } ?>
    </div>
    <?php nextjs_default_setup_panel_meta(false); ?>
</section>
        <?php
    }
}

if (!function_exists('nextjs_default_setup_panel_meta')) {
    function nextjs_default_setup_panel_meta($ready)
    {
        ?>
    <dl class="nextjs_default-meta">
        <div>
            <dt>정적 앱</dt>
            <dd>
                <code><?php echo get_text(nextjs_default_static_app_path()); ?></code>
                <span class="nextjs_default-state <?php echo $ready ? 'is-ok' : 'is-missing'; ?>"><?php echo $ready ? '있음' : '없음'; ?></span>
            </dd>
        </div>
        <div><dt>API</dt><dd><code><?php echo get_text(nextjs_default_api_url()); ?></code></dd></div>
        <div><dt>현재 경로</dt><dd><code><?php echo get_text(nextjs_default_current_path()); ?></code></dd></div>
    </dl>
        <?php
    }
}
