<?php
if (!defined('_INDEX_')) {
    define('_INDEX_', true);
}

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/bridge/config.php';
include_once __DIR__ . '/head.php';
?>
<section class="nextjs_default-panel">
    <p class="nextjs_default-eyebrow">Gnuboard5 compatibility theme</p>
    <h1 class="nextjs_default-title">Next.js 25 호환 테마가 선택되었습니다.</h1>
    <p class="nextjs_default-copy">
        theme/nextjs_default/app 정적 산출물이 있으면 PHP 테마가 Node 서버 없이
        그누보드5와 영카트5 호환 화면을 직접 제공합니다.
    </p>
    <div class="nextjs_default-actions">
        <a class="nextjs_default-button" href="<?php echo G5_THEME_URL; ?>/app/index.html" target="_blank" rel="noopener">정적 앱 열기</a>
        <a class="nextjs_default-button secondary" href="<?php echo G5_URL; ?>/api/v1/settings" target="_blank" rel="noopener">API 확인</a>
    </div>
    <dl class="nextjs_default-meta">
        <div><dt>정적 앱</dt><dd><code><?php echo G5_THEME_PATH; ?>/app</code></dd></div>
        <div><dt>API</dt><dd><code><?php echo nextjs_default_api_url(); ?></code></dd></div>
        <div><dt>현재 경로</dt><dd><code><?php echo get_text(nextjs_default_current_path()); ?></code></dd></div>
    </dl>
</section>
<?php
include_once __DIR__ . '/tail.php';
