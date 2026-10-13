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
<section class="handbook-panel">
    <p class="handbook-eyebrow">YoungCart5 compatibility bridge</p>
    <h1 class="handbook-title">영카트5 라우트 브릿지가 준비되었습니다.</h1>
    <p class="handbook-copy">
        쇼핑몰, 장바구니, 주문, 결제, PG 콜백과 레거시 PHP 경로는
        theme/handbook/app 정적 산출물이 있을 때 Next.js 25 호환 계층으로 제공됩니다.
    </p>
    <div class="handbook-actions">
        <a class="handbook-button" href="<?php echo G5_THEME_URL; ?>/app/index.html" target="_blank" rel="noopener">정적 앱 열기</a>
        <a class="handbook-button secondary" href="<?php echo G5_URL; ?>/api/v1/shop/categories" target="_blank" rel="noopener">쇼핑 API 확인</a>
    </div>
</section>
<?php
include_once __DIR__ . '/shop.tail.php';
