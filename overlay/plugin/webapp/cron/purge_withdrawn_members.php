<?php
/**
 * 탈퇴했지만 개인정보가 남아 있는 회원을 영구 삭제하는 안전망.
 *
 * 탈퇴는 DELETE /v1/members/me 가 요청 즉시 api_member_purge_now() 로 처리한다(30일 유예 없음).
 * 이 스크립트는 그 전에 소프트 삭제만 된 회원, 또는 삭제 도중 실패한 회원을 잡는 용도라
 * mb_leave_date 가 채워져 있는데 개인정보 필드가 남아 있는 행만 대상으로 한다.
 *
 * 사용:
 *   php plugin/webapp/cron/purge_withdrawn_members.php           # 실제 삭제
 *   php plugin/webapp/cron/purge_withdrawn_members.php --dry-run # 카운트만
 *   php plugin/webapp/cron/purge_withdrawn_members.php --verbose
 *
 * crontab (매일 새벽): 0 4 * * * /usr/bin/php /path/plugin/webapp/cron/purge_withdrawn_members.php >> data/dday_push_logs/purge.log 2>&1
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

$DRY_RUN = in_array('--dry-run', $argv, true);
$VERBOSE = in_array('--verbose', $argv, true) || $DRY_RUN;

chdir(dirname(__DIR__, 3));
if (!defined('_GNUBOARD_')) define('_GNUBOARD_', true);

ob_start();
require_once dirname(__DIR__, 3) . '/common.php';
ob_end_clean();

require_once dirname(__DIR__, 3) . '/api/lib/DB.php';

function logf(string $fmt, ...$args): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . vsprintf($fmt, $args);
    fwrite(STDOUT, $line . PHP_EOL);
}

require_once dirname(__DIR__, 3) . '/api/v1/member_purge.php';

$memberTable = DB::table('member_table');

logf("=== purge_withdrawn_members start (dry_run=%s) ===", $DRY_RUN ? 'YES' : 'no');

// 탈퇴 표시가 있는데 개인정보가 남아 있는 행. 정상 탈퇴는 즉시 비워지므로 보통 0건이다.
$rows = DB::fetchAll(
    "SELECT mb_id, mb_leave_date FROM `{$memberTable}`
      WHERE mb_leave_date != ''
        AND (mb_email != '' OR mb_name != '' OR mb_password != '' OR mb_addr1 != '' OR mb_hp != '')
      LIMIT 1000"
);

logf("candidates: %d", count($rows));

$purged = 0;
foreach ($rows as $row) {
    $mb_id = (string) $row['mb_id'];
    if ($VERBOSE) logf("  purging mb_id=%s leave_date=%s", $mb_id, $row['mb_leave_date']);

    if ($DRY_RUN) { $purged++; continue; }

    try {
        $result = api_member_purge_now($mb_id);
        $purged++;
        if ($VERBOSE) logf("    files=%d writes=%d", $result['deleted_files'], $result['anonymized_writes']);
    } catch (\Throwable $e) {
        logf("  [WARN] purge failed mb_id=%s: %s", $mb_id, $e->getMessage());
    }
}

logf("=== done. purged=%d ===", $purged);
exit(0);
