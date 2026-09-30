<?php
/* 정적 자원의 캐시 무효화 값. G5_CSS_VER 은 이 설치본의 extend/version.extend.php 가 정의하는데
   그누보드 5.6.3.9.1 같은 판에는 그 파일도, 그 상수를 쓰는 코어 코드도 없다. 상수를 그대로 쓰면
   그런 설치본에서 이 파일을 읽는 순간(테마 미리보기 등) "Undefined constant" 로 죽는다. */
if (!function_exists('nextjs_default_asset_ver')) {
    function nextjs_default_asset_ver()
    {
        return defined('G5_CSS_VER') ? G5_CSS_VER : date('Ymd');
    }
}
?>
<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/bridge/app-shell.php';

if (!defined('_THEME_PREVIEW_') && nextjs_default_static_app_ready()) {
    nextjs_default_try_next_static_asset_response();
    nextjs_default_try_public_asset_response();
    $nextjs_default_request_path = parse_url(nextjs_default_current_path(), PHP_URL_PATH);
    if ($nextjs_default_request_path && substr($nextjs_default_request_path, -4) === '.txt') {
        nextjs_default_render_static_payload();
        exit;
    }
    nextjs_default_maybe_redirect_current_short_route();
    nextjs_default_try_render_legacy_rss_route();
    nextjs_default_render_app_shell();
    exit;
}

if (!isset($g5['title']) || !$g5['title']) {
    $g5['title'] = isset($config['cf_title']) ? $config['cf_title'] : 'Gnuboard5';
}

$g5_head_title = strip_tags(implode(' | ', array_filter(array($g5['title'], $config['cf_title']))));
?>
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title><?php echo $g5_head_title; ?></title>
<link rel="stylesheet" href="<?php echo G5_THEME_URL; ?>/css/nextjs_default.css?ver=<?php echo nextjs_default_asset_ver(); ?>">
<?php if (!defined('G5_IS_ADMIN') && isset($config['cf_add_script'])) echo $config['cf_add_script']; ?>
</head>
<body>
<div class="nextjs_default-shell">
    <header class="nextjs_default-header">
        <div class="nextjs_default-header-inner">
            <a class="nextjs_default-brand" href="<?php echo G5_URL; ?>"><?php echo get_text($config['cf_title']); ?></a>
            <nav class="nextjs_default-nav" aria-label="테마 내비게이션">
                <a href="<?php echo G5_URL; ?>">홈</a>
                <?php if (defined('G5_USE_SHOP') && G5_USE_SHOP) { ?>
                <a href="<?php echo G5_SHOP_URL; ?>">쇼핑몰</a>
                <?php } ?>
                <a href="<?php echo G5_BBS_URL; ?>/new.php">새글</a>
                <?php if ($is_admin) { ?>
                <a href="<?php echo correct_goto_url(G5_ADMIN_URL); ?>">관리자</a>
                <?php } ?>
            </nav>
        </div>
    </header>
    <main id="container" class="nextjs_default-main">
