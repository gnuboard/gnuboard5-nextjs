<?php
/**
 * Gnuboard5 REST API - Shop receipt bridge pages.
 *
 * GET /v1/shop/receipts/lg-payment - LG U+ card/mobile receipt bridge.
 * GET /v1/shop/receipts/lg-cash    - LG U+ cash receipt bridge.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

require_once __DIR__ . '/common.php';

$receiptKind = isset($shopSegments[0]) ? trim((string) $shopSegments[0]) : '';

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

if ($receiptKind === 'cash-issue') {
    $type = trim((string) ($_GET['type'] ?? ''));
    $id = trim((string) ($_GET['id'] ?? ''));
    $expires = (int) ($_GET['expires'] ?? 0);
    $sig = trim((string) ($_GET['sig'] ?? ''));

    if (!in_array($type, ['order', 'personalpay'], true) || $id === '' || $expires <= 0 || $sig === '') {
        Response::error('Invalid cash receipt issue link.', 400);
    }
    if ($expires < time()) {
        Response::error('Cash receipt issue link has expired.', 410);
    }

    if ($type === 'personalpay') {
        $row = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_personalpay_table') . " WHERE pp_id = ? LIMIT 1",
            [$id]
        );
    } else {
        $row = DB::fetch(
            "SELECT * FROM " . DB::table('g5_shop_order_table') . " WHERE od_id = ? LIMIT 1",
            [$id]
        );
    }
    if (!$row) {
        Response::error('Cash receipt target not found.', 404);
    }

    $expectedSig = shop_api_cash_receipt_issue_signature($type, $row, $expires);
    if (!hash_equals($expectedSig, $sig)) {
        Response::error('Invalid cash receipt issue signature.', 403);
    }

    if ($type === 'personalpay') {
        $remoteAddr = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $uid = function_exists('get_shop_uid')
            ? get_shop_uid('personalpay', $row['pp_id'], $row['pp_time'], $remoteAddr)
            : md5((string) $row['pp_id'] . (string) $row['pp_time'] . $remoteAddr);
        if (function_exists('set_session')) {
            set_session('ss_personalpay_uid', $uid);
        }
        $query = [
            'tx' => 'personalpay',
            'od_id' => (string) $row['pp_id'],
        ];
    } else {
        $uid = shop_api_order_uid($row['od_id'], $row['od_time'], $row['od_ip']);
        if (function_exists('set_session')) {
            set_session('ss_orderview_uid', $uid);
        }
        shop_api_set_cookie(shop_api_guest_order_cookie_name($row['od_id']), $uid, time() + (30 * 86400));
        $query = [
            'od_id' => (string) $row['od_id'],
        ];
    }

    $shopUrl = defined('G5_SHOP_URL')
        ? rtrim((string) G5_SHOP_URL, '/')
        : rtrim((string) G5_URL, '/') . '/shop';
    header('Location: ' . shop_api_url_with_query($shopUrl . '/taxsave.php', $query), true, 302);
    exit;
}

if (!in_array($receiptKind, ['lg-payment', 'lg-cash'], true)) {
    Response::error('Unknown receipt bridge.', 404);
}

$cfg = DB::fetch("SELECT * FROM " . DB::table('g5_shop_default_table') . " LIMIT 1") ?: [];
$siteConfig = DB::fetch("SELECT * FROM " . DB::table('config_table') . " LIMIT 1") ?: [];
$cfg = array_merge($cfg, $siteConfig);
$mertKey = trim((string) ($cfg['cf_lg_mert_key'] ?? ''));
if ($mertKey === '') {
    Response::error('LG U+ MertKey setting is required.', 500);
}

if ($receiptKind === 'lg-payment') {
    $params = [
        'mid' => trim((string) ($_GET['mid'] ?? '')),
        'tid' => trim((string) ($_GET['tid'] ?? '')),
    ];
} else {
    $params = [
        'mid' => trim((string) ($_GET['mid'] ?? '')),
        'oid' => trim((string) ($_GET['oid'] ?? '')),
        'casseqno' => trim((string) ($_GET['casseqno'] ?? '')),
        'trade' => trim((string) ($_GET['trade'] ?? '')),
        'platform' => trim((string) ($_GET['platform'] ?? '')),
    ];
}

foreach ($params as $value) {
    if ($value === '') {
        Response::error('Missing receipt parameter.', 400);
    }
}

$sig = trim((string) ($_GET['sig'] ?? ''));
$expectedSig = shop_api_lg_receipt_signature($receiptKind, $params, $mertKey);
if ($sig === '' || !hash_equals($expectedSig, $sig)) {
    Response::error('Invalid receipt signature.', 403);
}

$platform = $receiptKind === 'lg-cash'
    ? strtolower((string) $params['platform'])
    : ((int) ($cfg['de_card_test'] ?? 0) > 0 ? 'test' : 'service');
if (!in_array($platform, ['test', 'service'], true)) {
    Response::error('Invalid LG U+ platform.', 400);
}

$scriptUrl = $platform === 'test'
    ? (defined('SHOP_TOSSPAYMENTS_CASHRECEIPT_TEST_JS') ? SHOP_TOSSPAYMENTS_CASHRECEIPT_TEST_JS : 'https://pgweb.tosspayments.com:7085/WEB_SERVER/js/receipt_link.js')
    : (defined('SHOP_TOSSPAYMENTS_CASHRECEIPT_REAL_JS') ? SHOP_TOSSPAYMENTS_CASHRECEIPT_REAL_JS : 'https://pgweb.tosspayments.com/WEB_SERVER/js/receipt_link.js');

if ($receiptKind === 'lg-payment') {
    $args = [
        (string) $params['mid'],
        (string) $params['tid'],
        md5((string) $params['mid'] . (string) $params['tid'] . $mertKey),
    ];
    $functionName = 'showReceiptByTID';
} else {
    $args = [
        (string) $params['mid'],
        (string) $params['oid'],
        (string) $params['casseqno'],
        (string) $params['trade'],
        $platform,
    ];
    $functionName = 'showCashReceipts';
}

header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LG U+ Receipt</title>
    <style>
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1f2937; }
        .panel { max-width: 520px; border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; }
        .title { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
        .text { margin: 0; font-size: 14px; line-height: 1.6; color: #4b5563; }
        .button { display: inline-block; margin-top: 16px; border: 1px solid #10b981; border-radius: 6px; padding: 8px 12px; color: #047857; background: #ecfdf5; cursor: pointer; }
    </style>
</head>
<body>
    <div class="panel">
        <p class="title">LG U+ receipt</p>
        <p class="text" id="receipt-message">Opening the LG U+ receipt window.</p>
        <button class="button" type="button" id="receipt-open">Open receipt</button>
    </div>
    <script src="<?php echo htmlspecialchars($scriptUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
    <script>
    (function () {
        var args = <?php echo json_encode($args, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
        var fnName = <?php echo json_encode($functionName); ?>;
        var message = document.getElementById("receipt-message");
        var button = document.getElementById("receipt-open");

        function openReceipt() {
            if (typeof window[fnName] !== "function") {
                message.textContent = "The LG U+ receipt script could not be loaded. Please try again.";
                return;
            }
            window[fnName].apply(window, args);
            message.textContent = "If the receipt did not open, please allow popups and click Open receipt.";
        }

        button.addEventListener("click", openReceipt);
        if (document.readyState === "complete") {
            openReceipt();
        } else {
            window.addEventListener("load", openReceipt, { once: true });
        }
    })();
    </script>
</body>
</html>
<?php
exit;
