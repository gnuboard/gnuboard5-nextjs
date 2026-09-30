<?php
if (!defined('_INDEX_')) {
    define('_INDEX_', true);
}

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once dirname(__DIR__) . '/bridge/config.php';
include_once __DIR__ . '/shop.head.php';
?>
<section class="nextjs_default-panel">
    <p class="nextjs_default-eyebrow">YoungCart5 compatibility bridge</p>
    <h1 class="nextjs_default-title">영카트5 라우트 브릿지가 준비되었습니다.</h1>
    <p class="nextjs_default-copy">
        쇼핑몰, 장바구니, 주문, 결제, PG 콜백과 레거시 PHP 경로는
        theme/nextjs_default/app 정적 산출물이 있을 때 Next.js 25 호환 계층으로 제공됩니다.
    </p>
    <div class="nextjs_default-actions">
        <a class="nextjs_default-button" href="<?php echo G5_THEME_URL; ?>/app/index.html" target="_blank" rel="noopener">정적 앱 열기</a>
        <a class="nextjs_default-button secondary" href="<?php echo G5_URL; ?>/api/v1/shop/categories" target="_blank" rel="noopener">쇼핑 API 확인</a>
    </div>
</section>
<?php
include_once __DIR__ . '/shop.tail.php';
