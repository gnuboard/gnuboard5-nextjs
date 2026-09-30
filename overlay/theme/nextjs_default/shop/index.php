<?php
if (!defined('_INDEX_')) {
    define('_INDEX_', true);
}

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once dirname(__DIR__) . '/bridge/config.php';
include_once __DIR__ . '/shop.head.php';

// 홈과 같은 파티얼. 영카트 화면에서는 안내 문구와 확인용 API 만 달라진다.
require_once dirname(__DIR__) . '/bridge/setup-panel.php';
nextjs_default_setup_panel('shop');

include_once __DIR__ . '/shop.tail.php';
