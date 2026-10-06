<?php
/**
 * 주문 · 결제 준비의 경합 재현 — 로컬 전용(CI 아님). 쇼핑 테이블이 MyISAM 이어도(그누보드 설치 기본, 트랜잭션 되돌리기가
 * 듣지 않는다) 상품 없는 주문 · 남는 쿠폰 기록 · 줄어든 재고가 생기지 않는지 실제 API 로 본다.
 *
 *  1) 줄 이동: 주문 만들기(무통장) · 결제 준비(카드)가 줄을 읽은 뒤 묶기 전에 그 줄이 다른 장바구니로 옮겨진다
 *     (장바구니 모으기 · 다른 탭의 삭제) → 409 CART_CHANGED, 주문 · 임시 주문 없음, 재고 그대로.
 *  2) 마지막 재고: 줄을 묶고 주문 행을 넣은 뒤 재고 줄이기에서 둘째 상품이 모자란다(누가 마지막 재고를 샀다)
 *     → 409, 주문 · 쿠폰 기록 없음, 줄은 장바구니로(쇼핑 중, 재고 사용 전), 첫째 상품 재고 그대로.
 * 테이블 쓰기 잠금(LOCK TABLES)으로 API 가 그 자리에서 기다리게 해 틈을 만든다 — 그동안(약 2초) 사이트의 상품 · 주문
 * 표가 잠깐 막힌다.
 *
 * 사용(저장소 루트에서):
 *   CART_SMOKE_MEMBER_ID=cartsmoke CART_SMOKE_MEMBER_PASSWORD=… CART_SMOKE_ITEM_IDS=1417651530,1403059869 \
 *     php nextjs/scripts/smoke/check_cart_order_races.php
 *   CART_SMOKE_API_URL(기본 LOCAL_APP_URL/api/v1, 없으면 http://localhost/api/v1)
 * 회원은 시험 전용(다른 사람 · 세션이 쓰지 않는 회원), 상품 둘은 옵션 없이 1개씩 담기는 판매 중 상품.
 * 끝에 그 회원의 장바구니 줄 · 이 시험이 만든 주문과 그 알림 · 쿠폰 기록을 지우고 두 상품 재고를 시험 전 값으로 되돌린다.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

function race_env(string $name, string $default = ''): string
{
    $value = getenv($name);
    return is_string($value) && $value !== '' ? $value : $default;
}

function race_fail(string $message): void
{
    fwrite(STDERR, "check_cart_order_races: {$message}\n");
    exit(1);
}

$member = race_env('CART_SMOKE_MEMBER_ID');
$password = race_env('CART_SMOKE_MEMBER_PASSWORD');
$items = array_values(array_filter(array_map('trim', explode(',', race_env('CART_SMOKE_ITEM_IDS')))));
$api = rtrim(race_env('CART_SMOKE_API_URL', rtrim(race_env('LOCAL_APP_URL', 'http://localhost'), '/') . '/api/v1'), '/');
if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $member) || $password === '') {
    race_fail('set CART_SMOKE_MEMBER_ID / CART_SMOKE_MEMBER_PASSWORD (a test-only member).');
}
if (count($items) < 2 || preg_grep('/^[A-Za-z0-9_-]{1,20}$/', $items) !== $items) {
    race_fail('set CART_SMOKE_ITEM_IDS to two option-free items, comma separated.');
}
[$itemA, $itemB] = $items;

chdir(dirname(__DIR__, 3));
define('_GNUBOARD_', true);
date_default_timezone_set('Asia/Seoul');
include 'data/dbconfig.php';
$dbHost = strtolower((string) G5_MYSQL_HOST);
if (getenv('ALLOW_NONLOCAL_SMOKE_SEED') !== '1' && !in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    race_fail('refusing to lock tables on a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.');
}
$db = new mysqli(G5_MYSQL_HOST, G5_MYSQL_USER, G5_MYSQL_PASSWORD, G5_MYSQL_DB);
$db->set_charset('utf8mb4');
$p = G5_TABLE_PREFIX;

function race_req(string $method, string $url, string $token, string $cartId, ?array $body = null): array
{
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json; charset=utf-8'];
    if ($token !== '') $headers[] = "Authorization: Bearer {$token}";
    if ($cartId !== '') $headers[] = "X-Cart-Id: {$cartId}";
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 60]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    $raw = (string) curl_exec($ch);
    return [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), json_decode($raw, true) ?: []];
}

function race_one(mysqli $db, string $sql): ?array
{
    $r = $db->query($sql);
    return $r instanceof mysqli_result ? $r->fetch_assoc() : null;
}

function race_stock(mysqli $db, string $p, string $itemId): int
{
    return (int) race_one($db, "SELECT it_stock_qty s FROM {$p}shop_item WHERE it_id='" . $db->real_escape_string($itemId) . "'")['s'];
}

$results = [];
function race_check(string $label, bool $ok, string $extra = ''): void
{
    global $results;
    $results[] = $ok;
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . ($extra !== '' ? "  ({$extra})" : '') . "\n";
}

/**
 * $table 에 쓰기 잠금을 걸고 요청을 보낸 뒤, 요청이 그 표에서 기다리는 동안 $whileWaiting 을 하고 잠금을 푼다.
 * @return array{0:bool,1:int,2:array} 기다렸나, 응답 상태, 응답 본문
 */
function race_while_locked(string $table, string $url, string $token, string $cartId, array $body, callable $whileWaiting): array
{
    $lock = new mysqli(G5_MYSQL_HOST, G5_MYSQL_USER, G5_MYSQL_PASSWORD, G5_MYSQL_DB);
    $lock->query("LOCK TABLES {$table} WRITE");
    $mh = curl_multi_init();
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8', "Authorization: Bearer {$token}", "X-Cart-Id: {$cartId}"],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    curl_multi_add_handle($mh, $ch);
    $deadline = microtime(true) + 2.0;
    do { curl_multi_exec($mh, $running); curl_multi_select($mh, 0.1); } while ($running && microtime(true) < $deadline);
    $waited = $running > 0;
    $whileWaiting();
    $lock->query('UNLOCK TABLES');
    $lock->close();
    do { curl_multi_exec($mh, $running); curl_multi_select($mh, 0.2); } while ($running);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = json_decode((string) curl_multi_getcontent($ch), true) ?: [];
    curl_multi_remove_handle($mh, $ch);
    curl_multi_close($mh);
    return [$waited, $status, $json];
}

$startedAt = date('Y-m-d H:i:s');
$stockA = race_stock($db, $p, $itemA);
$stockB = race_stock($db, $p, $itemB);
[, $login] = race_req('POST', "{$api}/auth/login", '', '', ['mb_id' => $member, 'mb_password' => $password]);
$token = (string) ($login['data']['token'] ?? '');
if ($token === '') race_fail("login failed for {$member} at {$api}.");
[, $config] = race_req('GET', "{$api}/shop/payment/config", $token, '');
$orderer = ['od_name' => '경합시험', 'od_hp' => '010-0000-0000', 'od_zip' => '12345', 'od_addr1' => '서울'];
$bank = ['od_settle_case' => '무통장', 'od_bank_account' => (string) ($config['data']['bank_accounts'][0] ?? ''), 'od_deposit_name' => '경합시험'];
$newCart = static fn (string $tail): string => '9' . substr((string) time(), 0, 10) . $tail;
$memberSql = $db->real_escape_string($member);

try {
    echo "1) 줄을 읽은 뒤 묶기 전에 다른 장바구니로 옮겨진다\n";
    foreach (['bank' => ["{$api}/shop/orders", $bank], 'card' => ["{$api}/shop/payment/prepare", ['od_settle_case' => '신용카드']]] as $kind => [$url, $settle]) {
        $from = $newCart($kind === 'bank' ? '00011' : '00021');
        $to = $newCart($kind === 'bank' ? '00012' : '00022');
        [, $added] = race_req('POST', "{$api}/shop/cart", $token, $from, ['it_id' => $itemA, 'ct_qty' => 1]);
        $ctId = (int) ($added['data']['ct_id'] ?? 0);
        if ($ctId <= 0) race_fail("could not add {$itemA}: " . ($added['message'] ?? ''));
        // 상품 표를 잠그면 API 는 줄을 읽은 뒤 재고 확인에서 기다린다 — 그동안 줄을 옮긴다
        [$waited, $status, $res] = race_while_locked("{$p}shop_item", $url, $token, $from, $orderer + $settle + ['ct_ids' => (string) $ctId, 'client_uid' => "race-{$kind}-{$from}"],
            static function () use ($db, $p, $ctId, $to): void {
                $db->query("UPDATE {$p}shop_cart SET od_id='{$to}' WHERE ct_id={$ctId}");
            });
        $row = race_one($db, "SELECT od_id, ct_status FROM {$p}shop_cart WHERE ct_id={$ctId}");
        $orders = (int) race_one($db, "SELECT COUNT(*) n FROM {$p}shop_order WHERE mb_id='{$memberSql}' AND od_time >= '{$startedAt}'")['n'];
        race_check("{$kind}: the request waited on the lock", $waited);
        race_check("{$kind}: 409 CART_CHANGED", $status === 409 && ($res['errors']['code'] ?? '') === 'CART_CHANGED', "status {$status}");
        race_check("{$kind}: no order or draft left", $orders === 0, "orders {$orders}");
        race_check("{$kind}: the row stays shopping where it moved", ($row['od_id'] ?? '') === $to && ($row['ct_status'] ?? '') === '쇼핑');
        race_check("{$kind}: stock unchanged", race_stock($db, $p, $itemA) === $stockA);
    }

    echo "2) 줄을 묶고 주문 행을 넣은 뒤 둘째 상품의 마지막 재고를 누가 샀다\n";
    $cart = $newCart('00041');
    $ctIds = [];
    foreach ([$itemA, $itemB] as $itemId) {
        [, $added] = race_req('POST', "{$api}/shop/cart", $token, $cart, ['it_id' => $itemId, 'ct_qty' => 1]);
        $ctIds[] = (int) ($added['data']['ct_id'] ?? 0);
    }
    if (in_array(0, $ctIds, true)) race_fail('could not add both items.');
    // 주문 표를 잠그면 API 는 주문 행을 넣기 전에 기다린다 — 그동안 둘째 상품 재고를 0 으로
    [$waited, $status, $res] = race_while_locked("{$p}shop_order", "{$api}/shop/orders", $token, $cart, $orderer + $bank,
        static function () use ($db, $p, $itemB): void {
            $db->query("UPDATE {$p}shop_item SET it_stock_qty = 0 WHERE it_id='" . $db->real_escape_string($itemB) . "'");
        });
    $orders = (int) race_one($db, "SELECT COUNT(*) n FROM {$p}shop_order WHERE mb_id='{$memberSql}' AND od_time >= '{$startedAt}'")['n'];
    $back = (int) race_one($db, "SELECT COUNT(*) n FROM {$p}shop_cart WHERE ct_id IN (" . implode(',', $ctIds) . ")
        AND od_id='{$cart}' AND ct_status='쇼핑' AND ct_stock_use=0")['n'];
    race_check('the request waited on the lock', $waited);
    race_check('409 stock shortage', $status === 409 && strpos((string) ($res['message'] ?? ''), '재고수량이 부족') !== false, "status {$status}");
    race_check('no order row left', $orders === 0, "orders {$orders}");
    race_check('rows back in the cart, shopping, stock not used', $back === 2, "rows back {$back}");
    race_check('first item stock unchanged', race_stock($db, $p, $itemA) === $stockA);
} finally {
    $odIds = array_column($db->query("SELECT od_id FROM {$p}shop_order WHERE mb_id='{$memberSql}' AND od_time >= '{$startedAt}'")->fetch_all(MYSQLI_ASSOC), 'od_id');
    if ($odIds) {
        $in = "'" . implode("','", array_map([$db, 'real_escape_string'], $odIds)) . "'";
        try {
            $db->query("DELETE FROM {$p}notification_log WHERE nt_sent_at >= '{$startedAt}' AND nt_data REGEXP '\"od_id\":\"(" . implode('|', $odIds) . ")\"'");
        } catch (\Throwable $e) {
            // 알림 표가 없는 설치
        }
        $db->query("DELETE FROM {$p}shop_coupon_log WHERE od_id IN ({$in})");
        $db->query("DELETE FROM {$p}shop_order WHERE od_id IN ({$in})");
        echo '  removed test orders ' . implode(', ', $odIds) . "\n";
    }
    $db->query("DELETE FROM {$p}shop_cart WHERE mb_id='{$memberSql}'");
    $db->query("UPDATE {$p}shop_item SET it_stock_qty = {$stockA} WHERE it_id='" . $db->real_escape_string($itemA) . "'");
    $db->query("UPDATE {$p}shop_item SET it_stock_qty = {$stockB} WHERE it_id='" . $db->real_escape_string($itemB) . "'");
    race_check('cleaned up, stock restored', race_stock($db, $p, $itemA) === $stockA && race_stock($db, $p, $itemB) === $stockB);
}

$ok = !in_array(false, $results, true);
echo $ok ? "ALL PASS\n" : "SOME FAILED\n";
exit($ok ? 0 : 1);
