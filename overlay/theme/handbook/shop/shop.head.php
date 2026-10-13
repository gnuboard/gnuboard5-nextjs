<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once dirname(__DIR__) . '/bridge/app-shell.php';

if (handbook_is_legacy_shop_php_request()) {
    if (!defined('G5_HANDBOOK_LEGACY_SHOP_PHP_SHELL')) {
        define('G5_HANDBOOK_LEGACY_SHOP_PHP_SHELL', true);
    }

    include_once G5_PATH . '/head.sub.php';
    ?>
<div id="wrapper" class="handbook-legacy-shop-wrapper">
    <div id="container">
    <?php
    return;
}

include_once dirname(__DIR__) . '/head.php';
