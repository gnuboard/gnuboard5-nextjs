<?php
/**
 * 앱 E2E(Maestro) 쇼핑·커뮤니티 흐름용 고정 데이터 시드 — 멱등. `E2E Sample Item`(it_id 9990000001) + 게시판(기본 free) 설정.
 *
 *   php nextjs/scripts/smoke/seed_e2e_fixtures.php [--board=free]
 *
 * Android Maestro 의 inputText 가 한글을 못 쳐서 검색어가 ASCII 여야 하고, 필수 옵션이 없어야 바로 담을 수 있다.
 * 새 행은 이미 있는 "옵션 없는 판매 중 상품" 한 개를 복사해 이름·재고·가격만 바꾼다(열 기본값 차이를 피하려고).
 * 로컬 DB 에서만 동작한다.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

const E2E_ITEM_ID = '9990000001';
const E2E_ITEM_NAME = 'E2E Sample Item';

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) {
    define('_GNUBOARD_', true);
}
ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();
require_once dirname(__DIR__, 3) . '/api/lib/DB.php';

$dbHost = defined('G5_MYSQL_HOST') ? strtolower((string) G5_MYSQL_HOST) : '';
if (getenv('ALLOW_NONLOCAL_SMOKE_SEED') !== '1' && !in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    fwrite(STDERR, "seed_e2e_fixtures: refusing to seed a non-local database.\n");
    exit(1);
}

$table = $g5['g5_shop_item_table'];
$existing = DB::fetch("SELECT it_id FROM {$table} WHERE it_id = ? LIMIT 1", [E2E_ITEM_ID]);

if (!$existing) {
    $source = DB::fetch(
        "SELECT * FROM {$table}
          WHERE it_use = 1 AND it_soldout = 0 AND it_option_subject = '' AND it_supply_subject = '' AND it_tel_inq = 0
          ORDER BY it_id LIMIT 1"
    );
    if (!$source) {
        fwrite(STDERR, "seed_e2e_fixtures: no option-free item to copy.\n");
        exit(1);
    }
    $source['it_id'] = E2E_ITEM_ID;
    $columns = array_keys($source);
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    DB::execute(
        "INSERT INTO {$table} (`" . implode('`, `', $columns) . "`) VALUES ({$placeholders})",
        array_values($source)
    );
}

DB::execute(
    "UPDATE {$table}
        SET it_name = ?, it_seo_title = 'e2e-sample-item', it_use = 1, it_soldout = 0, it_stock_qty = 99999, it_price = 1000, it_cust_price = 0,
            it_option_subject = '', it_supply_subject = '', it_buy_min_qty = 0, it_buy_max_qty = 0, it_tel_inq = 0
      WHERE it_id = ?",
    [E2E_ITEM_NAME, E2E_ITEM_ID]
);
// 옵션 행이 복사본에 딸려 있지 않게.
DB::execute("DELETE FROM {$g5['g5_shop_item_option_table']} WHERE it_id = ?", [E2E_ITEM_ID]);

echo ($existing ? 'updated' : 'created') . ': ' . E2E_ITEM_ID . ' ' . E2E_ITEM_NAME . "\n";

// 커뮤니티 흐름용 게시판(기본 free, --board=xxx): 추천 사용·분류 없음·level 2 쓰기/댓글. 게시판 표가 있어야 한다.
$board = 'free';
foreach ($argv ?? [] as $arg) {
    if (strpos($arg, '--board=') === 0) {
        $board = preg_replace('/[^A-Za-z0-9_]/', '', substr($arg, 8));
    }
}
$boardRow = DB::fetch("SELECT bo_table FROM {$g5['board_table']} WHERE bo_table = ? LIMIT 1", [$board]);
if (!$boardRow) {
    fwrite(STDERR, "seed_e2e_fixtures: board {$board} not found (create it in admin first).\n");
    exit(1);
}
DB::execute(
    "UPDATE {$g5['board_table']}
        SET bo_use_good = 1, bo_use_category = 0, bo_write_level = 2, bo_comment_level = 2, bo_read_level = 1, bo_list_level = 1
      WHERE bo_table = ?",
    [$board]
);
echo "board ready: {$board}\n";
