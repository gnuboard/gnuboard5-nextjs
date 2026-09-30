<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/bridge/config.php';
?>
    </main>
    <footer class="nextjs_default-footer">
        <div class="nextjs_default-footer-inner">
            G5 Next.js 25 호환 테마 · API <?php echo nextjs_default_api_url(); ?>
        </div>
    </footer>
</div>
<?php
if (isset($config['cf_analytics']) && $config['cf_analytics']) {
    echo $config['cf_analytics'];
}

run_event('tail_sub');
?>
</body>
</html>
<?php echo html_end(); ?>
