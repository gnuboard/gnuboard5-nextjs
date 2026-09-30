<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (defined('G5_NEXTJS_DEFAULT_LEGACY_SHOP_PHP_SHELL') && G5_NEXTJS_DEFAULT_LEGACY_SHOP_PHP_SHELL) {
    ?>
    </div>
</div>
<?php
    if (isset($config['cf_analytics']) && $config['cf_analytics']) {
        echo $config['cf_analytics'];
    }

    include_once G5_PATH . '/tail.sub.php';
    return;
}

include_once dirname(__DIR__) . '/tail.php';
