<?php
if (!defined('_INDEX_')) {
    define('_INDEX_', true);
}

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/bridge/config.php';
include_once __DIR__ . '/head.php';

// 여기까지 내려왔다는 것은 head.php 가 앱 셸을 띄우지 못했다는 뜻이다. 산출물이 없어서인지
// 테마 미리보기라서인지는 파티얼이 가려서 안내한다.
require_once __DIR__ . '/bridge/setup-panel.php';
nextjs_default_setup_panel('home');

include_once __DIR__ . '/tail.php';
