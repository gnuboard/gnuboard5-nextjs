<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!defined('G5_THEME_DEVICE')) {
    define('G5_THEME_DEVICE', '');
}

if (!defined('G5_COMMUNITY_USE')) {
    define('G5_COMMUNITY_USE', true);
}

$theme_config = array(
    'set_default_skin' => false,
    'preview_board_skin' => 'basic',
    'preview_mobile_board_skin' => 'basic',
    'cf_member_skin' => 'basic',
    'cf_mobile_member_skin' => 'basic',
    'cf_new_skin' => 'basic',
    'cf_mobile_new_skin' => 'basic',
    'cf_search_skin' => 'basic',
    'cf_mobile_search_skin' => 'basic',
    'cf_connect_skin' => 'basic',
    'cf_mobile_connect_skin' => 'basic',
    'cf_faq_skin' => 'basic',
    'cf_mobile_faq_skin' => 'basic',
    'qa_skin' => 'basic',
    'qa_mobile_skin' => 'basic',
    /* 쇼핑몰 스킨(de_shop_skin / de_shop_mobile_skin)은 일부러 비워 둔다.
       이 테마는 PHP 상점 스킨을 갖지 않는다(상점 화면은 plugin/webapp 브리지가 Next.js 로 낸다).
       값을 적어 두면 adm/theme_update.php 가 'theme/' 를 붙여 저장하고(43행),
       adm/theme_preview.php 는 set_default_skin 과 무관하게 그 값을 읽어 역시 'theme/' 를 붙인다(76행).
       그러면 shop.config.php 가 G5_SHOP_SKIN_PATH 를 theme/<이 테마>/skin/shop/basic 으로 잡는데
       그런 폴더가 없어 관리자 분류·설정 화면이 opendir 실패로 죽는다.
       비워 두면 루트 skin/shop/basic(모든 설치본에 있음)이 쓰인다. */
);
