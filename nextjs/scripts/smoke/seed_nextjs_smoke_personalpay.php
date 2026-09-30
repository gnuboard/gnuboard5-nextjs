<?php
/**
 * Seed a local-only Youngcart personal pay row for Next.js browser checks.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

$args = $argv ?? [];
$jsonOutput = in_array('--json', $args, true);

function smoke_personalpay_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_personalpay_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_personalpay_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_personalpay_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "seed_nextjs_smoke_personalpay: {$message}\n");
    }
    exit(1);
}

$ppId = smoke_personalpay_env_or_arg($args, 'pp-id', 'LOCAL_SMOKE_PERSONALPAY_ID', '9999999999999999');
$name = smoke_personalpay_env_or_arg($args, 'name', 'LOCAL_SMOKE_PERSONALPAY_NAME', 'Nextjs PersonalPay Smoke');
$email = smoke_personalpay_env_or_arg($args, 'email', 'LOCAL_SMOKE_PERSONALPAY_EMAIL', 'nextjs_personalpay_smoke@example.test');
$hp = smoke_personalpay_env_or_arg($args, 'hp', 'LOCAL_SMOKE_PERSONALPAY_HP', '010-5555-6666');
$content = smoke_personalpay_env_or_arg($args, 'content', 'LOCAL_SMOKE_PERSONALPAY_CONTENT', 'nextjs-local-personalpay-smoke content');
$price = (int) smoke_personalpay_env_or_arg($args, 'price', 'LOCAL_SMOKE_PERSONALPAY_PRICE', '45670');
$marker = smoke_personalpay_env_or_arg($args, 'marker', 'LOCAL_SMOKE_PERSONALPAY_MARKER', 'nextjs-local-personalpay-smoke');

if (!preg_match('/^[0-9]{8,20}$/', $ppId)) {
    smoke_personalpay_fail('pp id must be 8-20 digits.', $jsonOutput);
}
if ($name === '' || strlen($name) > 255) {
    smoke_personalpay_fail('name must be 1-255 characters.', $jsonOutput);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    smoke_personalpay_fail('email must be valid.', $jsonOutput);
}
if ($price <= 0 || $price > 100000000) {
    smoke_personalpay_fail('price must be between 1 and 100000000.', $jsonOutput);
}
if ($marker === '' || strlen($marker) > 120) {
    smoke_personalpay_fail('marker must be 1-120 characters.', $jsonOutput);
}

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) {
    define('_GNUBOARD_', true);
}

ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();

require_once dirname(__DIR__, 3) . '/api/lib/DB.php';

$dbHost = defined('G5_MYSQL_HOST') ? strtolower((string) G5_MYSQL_HOST) : '';
$allowNonLocal = getenv('ALLOW_NONLOCAL_SMOKE_SEED') === '1';
if (!$allowNonLocal && !in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    smoke_personalpay_fail('refusing to seed a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$personalPayTable = DB::table('g5_shop_personalpay_table');
$now = date('Y-m-d H:i:s');
$settleCase = '무통장';
$bankAccount = 'Kookmin 123-456-7890 Nextjs Smoke';
$depositName = 'NextjsSmoke';
$unpaidReceiptTime = '1000-01-01 00:00:00';

try {
    $existing = DB::fetch(
        "SELECT pp_id, pp_shop_memo FROM {$personalPayTable} WHERE pp_id = ? LIMIT 1",
        [$ppId]
    );
    if ($existing && strpos((string) ($existing['pp_shop_memo'] ?? ''), $marker) === false) {
        smoke_personalpay_fail("personal pay {$ppId} exists but is not marked as a smoke row.", $jsonOutput);
    }

    if ($existing) {
        DB::execute(
            "UPDATE {$personalPayTable}
            SET od_id = 0,
                pp_name = ?,
                pp_email = ?,
                pp_hp = ?,
                pp_content = ?,
                pp_use = 1,
                pp_price = ?,
                pp_pg = 'kcp',
                pp_tno = '',
                pp_app_no = '',
                pp_casseqno = '',
                pp_receipt_price = 0,
                pp_settle_case = ?,
                pp_bank_account = ?,
                pp_deposit_name = ?,
                pp_receipt_time = ?,
                pp_receipt_ip = '',
                pp_shop_memo = ?,
                pp_cash = 0,
                pp_cash_no = '',
                pp_cash_info = '',
                pp_ip = '127.0.0.1',
                pp_time = ?
          WHERE pp_id = ?",
            [
                $name,
                $email,
                $hp,
                $content,
                $price,
                $settleCase,
                $bankAccount,
                $depositName,
                $unpaidReceiptTime,
                $marker,
                $now,
                $ppId,
            ]
        );
        $action = 'updated';
    } else {
        DB::execute(
            "INSERT INTO {$personalPayTable}
            (pp_id, od_id, pp_name, pp_email, pp_hp, pp_content, pp_use, pp_price,
             pp_pg, pp_tno, pp_app_no, pp_casseqno, pp_receipt_price, pp_settle_case,
             pp_bank_account, pp_deposit_name, pp_receipt_time, pp_receipt_ip,
             pp_shop_memo, pp_cash, pp_cash_no, pp_cash_info, pp_ip, pp_time)
         VALUES (?, 0, ?, ?, ?, ?, 1, ?, 'kcp', '', '', '', 0, ?, ?, ?,
                 ?, '', ?, 0, '', '', '127.0.0.1', ?)",
            [
                $ppId,
                $name,
                $email,
                $hp,
                $content,
                $price,
                $settleCase,
                $bankAccount,
                $depositName,
                $unpaidReceiptTime,
                $marker,
                $now,
            ]
        );
        $action = 'created';
    }
} catch (Throwable $e) {
    smoke_personalpay_fail($e->getMessage(), $jsonOutput);
}

$payload = [
    'success' => true,
    'action' => $action,
    'pp_id' => $ppId,
    'name' => $name,
    'price' => $price,
    'settle_case' => $settleCase,
    'bank_account' => $bankAccount,
    'deposit_name' => $depositName,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "{$action} smoke personal pay {$ppId}.\n";
