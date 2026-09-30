<?php
/**
 * Create or remove a temporary YoungCart event with head/tail images for local smoke checks.
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
$cleanupOnly = in_array('--cleanup', $args, true);
$subject = 'NextJS smoke YoungCart event';

function smoke_event_arg_value(array $args, string $name): ?string
{
    $prefix = '--' . $name . '=';
    foreach ($args as $arg) {
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }
    return null;
}

function smoke_event_fail(string $message, bool $jsonOutput): void
{
    if ($jsonOutput) {
        fwrite(STDERR, json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    } else {
        fwrite(STDERR, "set_nextjs_smoke_event: {$message}\n");
    }
    exit(1);
}

function smoke_event_clean_product_id(string $value): string
{
    return preg_replace('/[^0-9a-zA-Z_\-]/', '', $value);
}

function smoke_event_delete_files(int $eventId): void
{
    foreach (['h', 't'] as $suffix) {
        $path = G5_DATA_PATH . '/event/' . $eventId . '_' . $suffix;
        if (is_file($path)) {
            @unlink($path);
        }
    }
}

function smoke_event_cleanup(string $subject): int
{
    $eventTable = DB::table('g5_shop_event_table');
    $eventItemTable = DB::table('g5_shop_event_item_table');
    $rows = DB::fetchAll(
        "SELECT ev_id FROM {$eventTable} WHERE ev_subject = ?",
        [$subject]
    );

    $deleted = 0;
    foreach ($rows as $row) {
        $eventId = (int) ($row['ev_id'] ?? 0);
        if ($eventId <= 0) {
            continue;
        }

        smoke_event_delete_files($eventId);
        DB::execute("DELETE FROM {$eventItemTable} WHERE ev_id = ?", [$eventId]);
        DB::execute("DELETE FROM {$eventTable} WHERE ev_id = ?", [$eventId]);
        $deleted++;
    }

    return $deleted;
}

$productId = smoke_event_clean_product_id((string) (smoke_event_arg_value($args, 'product-id') ?: getenv('LOCAL_SMOKE_SHOP_PRODUCT_ID') ?: ''));

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
    smoke_event_fail('refusing to update a non-local database. Set ALLOW_NONLOCAL_SMOKE_SEED=1 to override.', $jsonOutput);
}

$deleted = smoke_event_cleanup($subject);

if ($cleanupOnly) {
    $payload = [
        'success' => true,
        'deleted' => $deleted,
    ];
    if ($jsonOutput) {
        echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
        exit;
    }
    echo "deleted {$deleted} smoke event(s)\n";
    exit;
}

if ($productId === '') {
    smoke_event_fail('product-id is required.', $jsonOutput);
}

$itemTable = DB::table('g5_shop_item_table');
$eventTable = DB::table('g5_shop_event_table');
$eventItemTable = DB::table('g5_shop_event_item_table');

$product = DB::fetch(
    "SELECT it_id FROM {$itemTable} WHERE it_id = ? LIMIT 1",
    [$productId]
);
if (!$product) {
    smoke_event_fail('product was not found.', $jsonOutput);
}

try {
    DB::execute(
        "INSERT INTO {$eventTable}
            SET ev_skin = '',
                ev_mobile_skin = '',
                ev_img_width = 400,
                ev_img_height = 400,
                ev_list_mod = 4,
                ev_list_row = 1,
                ev_mobile_img_width = 400,
                ev_mobile_img_height = 400,
                ev_mobile_list_mod = 2,
                ev_mobile_list_row = 2,
                ev_subject = ?,
                ev_subject_strong = 1,
                ev_head_html = '<p>NextJS smoke event head html</p>',
                ev_tail_html = '<p>NextJS smoke event tail html</p>',
                ev_use = 1",
        [$subject]
    );
    $eventId = (int) DB::lastInsertId();

    DB::execute(
        "INSERT INTO {$eventItemTable} SET ev_id = ?, it_id = ?",
        [$eventId, $productId]
    );
} catch (Throwable $e) {
    smoke_event_cleanup($subject);
    smoke_event_fail($e->getMessage(), $jsonOutput);
}

$eventDir = G5_DATA_PATH . '/event';
if (!is_dir($eventDir) && !@mkdir($eventDir, 0755, true) && !is_dir($eventDir)) {
    smoke_event_cleanup($subject);
    smoke_event_fail('failed to create data/event directory.', $jsonOutput);
}

$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=');
foreach (['h', 't'] as $suffix) {
    $path = $eventDir . '/' . $eventId . '_' . $suffix;
    if (@file_put_contents($path, $png) === false) {
        smoke_event_cleanup($subject);
        smoke_event_fail('failed to write event image file.', $jsonOutput);
    }
}

$payload = [
    'success' => true,
    'event_id' => $eventId,
    'product_id' => $productId,
    'head_image_exists' => is_file($eventDir . '/' . $eventId . '_h'),
    'tail_image_exists' => is_file($eventDir . '/' . $eventId . '_t'),
    'deleted_before_create' => $deleted,
];

if ($jsonOutput) {
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

echo "created smoke event ev_id={$eventId}\n";
