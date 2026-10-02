<?php
/**
 * API 공용 함수(api/lib/helpers.php) 검사 — DB 없이 함수 입출력만 본다.
 *   php scripts/smoke/check_api_helpers.php   (npm run check:api-helpers)
 * 쪽 번호 · 비밀글 판정 · 상품 이미지 주소의 경로 막기를 여러 핸들러가 함께 쓰므로 규칙이 바뀌지 않게 묶어 둔다.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}
error_reporting(E_ALL & ~E_DEPRECATED);

define('_GNUBOARD_', true);
define('G5_URL', 'http://localhost/sub');
define('G5_DATA_PATH', sys_get_temp_dir() . '/g5-api-helpers-check');
define('G5_DATA_URL', G5_URL . '/data');
$_SERVER['HTTP_HOST'] = 'localhost';

$apiLib = dirname(__DIR__, 3) . '/api/lib';
require_once $apiLib . '/request_helpers.php';
require_once $apiLib . '/helpers.php';

$failures = 0;
$count = 0;
function expect_same(string $label, $actual, $expected): void
{
    global $failures, $count;
    $count++;
    if ($actual !== $expected) {
        $failures++;
        echo "FAIL  {$label}: expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n";
    }
}

// --- api_page_params / api_page_number -------------------------------------------------
$cases = [
    [[], [20, 100], [1, 20, 0]],
    [['page' => '3'], [20, 100], [3, 20, 40]],
    [['page' => '0'], [20, 100], [1, 20, 0]],
    [['page' => '-5', 'per_page' => '5'], [20, 100], [1, 5, 0]],
    [['page' => 'abc'], [20, 100], [1, 20, 0]],
    [['per_page' => '1000'], [20, 100], [1, 100, 0]],
    [['per_page' => '0'], [20, 100], [1, 1, 0]],
    [['page' => '2', 'limit' => '999'], [50, 200, 'limit'], [2, 200, 200]],
    [['page' => '2', 'per_page' => '7'], [50, 200, 'limit'], [2, 50, 50]],
];
foreach ($cases as [$get, $args, $expected]) {
    $_GET = $get;
    expect_same('api_page_params(' . json_encode($args) . ') ' . json_encode($get), api_page_params(...$args), $expected);
}
$_GET = ['page' => '4'];
expect_same('api_page_number page=4', api_page_number(), 4);
$_GET = [];

// --- api_is_secret_option -------------------------------------------------------------
expect_same('secret in list', api_is_secret_option('html1,secret,mail'), true);
expect_same('secret alone', api_is_secret_option('secret'), true);
expect_same('no secret', api_is_secret_option('html1,mail'), false);
expect_same('empty', api_is_secret_option(''), false);
expect_same('null', api_is_secret_option(null), false);

// --- api_shop_item_image_url: data/item 밖을 가리키는 값은 받지 않는다 ------------------
@mkdir(G5_DATA_PATH . '/item/IT1', 0777, true);
file_put_contents(G5_DATA_PATH . '/item/IT1/a.png', 'x');
file_put_contents(G5_DATA_PATH . '/secret.txt', 'x');
$url = api_shop_item_image_url('IT1', 'a.png');
expect_same('item image under sub-folder install', strpos($url, 'http://localhost/sub/api/v1/shop/images/item/IT1/a.png?v=') === 0, true);
expect_same('dot-dot path blocked', api_shop_item_image_url('IT1', '../secret.txt'), '');
expect_same('missing file empty', api_shop_item_image_url('IT1', 'nope.png'), '');
expect_same('absolute url kept', api_shop_item_image_url('IT1', 'https://cdn.example/x.png'), 'https://cdn.example/x.png');

// --- api_member_media_urls: 같은 요청 안 캐시, $fresh 는 파일을 다시 본다 ---------------
@mkdir(G5_DATA_PATH . '/member_image/me', 0777, true);
expect_same('no image yet', api_member_media_urls('member1')['mb_image_path'], null);
file_put_contents(G5_DATA_PATH . '/member_image/me/member1.gif', 'x');
expect_same('cached (no re-check)', api_member_media_urls('member1')['mb_image_path'], null);
expect_same('fresh re-checks', is_string(api_member_media_urls('member1', true)['mb_image_path']), true);
expect_same('guest gets nulls', api_member_media_urls(''), ['mb_icon_path' => null, 'mb_image_path' => null]);

// 정리
foreach (['/item/IT1/a.png', '/secret.txt', '/member_image/me/member1.gif'] as $f) {
    @unlink(G5_DATA_PATH . $f);
}

echo ($failures === 0 ? "[check-api-helpers] {$count} checks passed\n" : "[check-api-helpers] {$failures}/{$count} failed\n");
exit($failures === 0 ? 0 : 1);
