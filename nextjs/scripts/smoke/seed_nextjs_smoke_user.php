<?php
/**
 * Seed a local-only member used by the Next.js browser smoke tests.
 *
 * This script intentionally creates a normal level-2 member, not an admin.
 * It refuses to overwrite an existing member unless that member was previously
 * created by this script, or --force is passed.
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
$force = in_array('--force', $args, true);

function smoke_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_env_or_arg(array $args, string $argName, string $envName, string $default): string
{
    $argValue = smoke_arg_value($args, $argName);
    if ($argValue !== null && $argValue !== '') {
        return $argValue;
    }

    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }

    return $default;
}

function smoke_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "seed_nextjs_smoke_user: {$message}\n");
    }
    exit(1);
}

$memberId = smoke_env_or_arg($args, 'id', 'LOCAL_SMOKE_LOGIN_ID', 'nextjs_smoke');
$password = smoke_env_or_arg($args, 'password', 'LOCAL_SMOKE_LOGIN_PASSWORD', 'NextjsSmoke123!');
$email = smoke_env_or_arg(
    $args,
    'email',
    'LOCAL_SMOKE_LOGIN_EMAIL',
    $memberId . '@example.test'
);
$name = smoke_env_or_arg(
    $args,
    'name',
    'LOCAL_SMOKE_LOGIN_NAME',
    'Nextjs Smoke'
);
$nick = smoke_env_or_arg(
    $args,
    'nick',
    'LOCAL_SMOKE_LOGIN_NICK',
    'NextjsSmoke'
);
$point = (int) smoke_env_or_arg(
    $args,
    'point',
    'LOCAL_SMOKE_LOGIN_POINT',
    '0'
);

if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $memberId)) {
    smoke_fail('member id must be 3-20 characters of letters, numbers, or underscores.', $jsonOutput);
}

if (strlen($password) < 8 || strlen($password) > 64) {
    smoke_fail('password must be 8-64 characters.', $jsonOutput);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    smoke_fail('email must be valid.', $jsonOutput);
}

if ($point < 0 || $point > 10000000) {
    smoke_fail('point must be between 0 and 10000000.', $jsonOutput);
}

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) {
    define('_GNUBOARD_', true);
}

ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();

require_once dirname(__DIR__, 3) . '/api/lib/DB.php';
require_once dirname(__DIR__, 3) . '/api/lib/Auth.php';

$dbHost = defined('G5_MYSQL_HOST') ? strtolower((string) G5_MYSQL_HOST) : '';
$allowNonLocal = getenv('ALLOW_NONLOCAL_SMOKE_SEED') === '1';
if (!$allowNonLocal && !in_array($dbHost, ['localhost', '127.0.0.1', '::1'], true)) {
    smoke_fail('refusing to seed a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$marker = 'nextjs-local-smoke';
$memberTable = DB::table('member_table');
$now = date('Y-m-d H:i:s');
$today = date('Y-m-d');
$passwordHash = Auth::hashPassword($password);
$memberLevel = 2;

$existing = DB::fetch(
    "SELECT mb_id, mb_email, mb_10 FROM {$memberTable} WHERE mb_id = ? LIMIT 1",
    [$memberId]
);

$emailOwner = DB::fetch(
    "SELECT mb_id FROM {$memberTable} WHERE mb_email = ? AND mb_id <> ? LIMIT 1",
    [$email, $memberId]
);
if ($emailOwner) {
    smoke_fail("email is already used by {$emailOwner['mb_id']}; set LOCAL_SMOKE_LOGIN_EMAIL.", $jsonOutput);
}

if ($existing && (string) ($existing['mb_10'] ?? '') !== $marker && !$force) {
    smoke_fail("member {$memberId} already exists and is not marked as a smoke user. Pass --force to overwrite.", $jsonOutput);
}

if ($existing) {
    DB::execute(
        "UPDATE {$memberTable}
            SET mb_password = ?,
                mb_name = ?,
                mb_nick = ?,
                mb_email = ?,
                mb_level = ?,
                mb_point = ?,
                mb_hp = '',
                mb_tel = '',
                mb_today_login = ?,
                mb_login_ip = '127.0.0.1',
                mb_email_certify = ?,
                mb_email_certify2 = '',
                mb_leave_date = '',
                mb_intercept_date = '',
                mb_open = 1,
                mb_open_date = ?,
                mb_10 = ?
          WHERE mb_id = ?",
        [
            $passwordHash,
            $name,
            $nick,
            $email,
            $memberLevel,
            $point,
            $now,
            $now,
            $today,
            $marker,
            $memberId,
        ]
    );
    $action = 'updated';
} else {
    DB::execute(
        "INSERT INTO {$memberTable}
            (mb_id, mb_password, mb_nick, mb_nick_date, mb_name, mb_email,
             mb_level, mb_point, mb_datetime, mb_today_login,
             mb_open, mb_open_date,
             mb_signature, mb_memo, mb_lost_certify, mb_profile, mb_agree_log,
             mb_email_certify, mb_email_certify2,
             mb_recommend,
             mb_login_ip, mb_ip, mb_10)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $memberId,
            $passwordHash,
            $nick,
            $today,
            $name,
            $email,
            $memberLevel,
            $point,
            $now,
            $now,
            1,
            $today,
            '',
            '',
            '',
            '',
            '',
            $now,
            '',
            '',
            '127.0.0.1',
            '127.0.0.1',
            $marker,
        ]
    );
    $action = 'created';
}

$payload = [
    'success' => true,
    'action' => $action,
    'admin' => false,
    'id' => $memberId,
    'password' => $password,
    'email' => $email,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "Smoke member {$action}: {$memberId}\n";
echo "PowerShell:\n";
echo "\$env:LOCAL_SMOKE_LOGIN_ID=\"{$memberId}\"\n";
echo "\$env:LOCAL_SMOKE_LOGIN_PASSWORD=\"{$password}\"\n";
echo "npm run check:local-browser:auth\n";
