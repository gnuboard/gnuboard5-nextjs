<?php
/**
 * API 스키마 자가 점검.
 *
 * API 의 인증·회원 기능은 그누보드 기본 테이블 외에 extend/ 가 등록하고 만드는 테이블
 * (refresh_token, login_attempt, member_pref …)에 기댄다. 원래는 관리자가 adm/dbupgrade.php
 * 를 한 번 열어야 만들어지는데, 파일만 올리고 그 단계를 건너뛴 설치본에서는 맞는 비밀번호로
 * 로그인하는 순간 "Internal server error." 만 남기고 죽었다. 틀린 비밀번호는 그 전에 401 로
 * 끝나 멀쩡해 보이므로 원인을 짚기가 유난히 어렵다.
 *
 * 그래서 API 가 스스로 확인한다. 설치 상태가 바뀔 때(extend 추가, API 갱신) 한 번만 extend 의
 * dbupgrade 설치기를 그대로 부르고, 결과를 data/ 의 표식 파일에 적어 두어 요청마다 DB 를 뒤지지
 * 않는다. 무엇이 빠졌는지는 /v1/status 의 schema 항목과 오류 응답 본문에 그대로 드러낸다.
 */

if (!defined('_GNUBOARD_')) exit;

class Schema
{
    /** 이 값이 바뀌면 표식이 무효가 되어 다음 요청에서 다시 점검한다. */
    const VERSION = '2026-10-06.1'; // 에디터 이미지 예전 정보 파일 .meta.json → .meta.php (이전: content_report.hide_prev_option · hide_prev_wr10, 신고 기각 뒤 되돌리기) (이전: member_pref.notify_dday 는 plugin/dday · plugin/baby 가 만든다) (이전: session_family · revoked_remotely) (이전: social_apple_token SC-11, web_ticket, SC-16, SC-07)

    /**
     * 테이블 키 → 그 키를 등록하는 extend 파일. 키가 없으면 어떤 파일이 빠졌는지 안내한다.
     */
    private static $keyOwners = array(
        'refresh_token_table'            => 'plugin/webapp/notify/tables.php',
        'login_attempt_table'            => 'plugin/webapp/notify/tables.php',
        'member_block_table'             => 'plugin/webapp/notify/tables.php',
        'member_pref_table'              => 'plugin/webapp/notify/tables.php',
        'notification_log_table'         => 'plugin/webapp/notify/tables.php',
        'push_token_table'               => 'plugin/webapp/notify/tables.php',
        'push_queue_table'               => 'plugin/webapp/notify/tables.php',
        'device_table'                   => 'plugin/webapp/notify/tables.php',
        'content_report_table'           => 'plugin/webapp/notify/tables.php',
        'account_deletion_request_table' => 'plugin/webapp/notify/tables.php',
        'member_public_key_table'        => 'plugin/webapp/notify/tables.php',
    );

    /**
     * 제품 표 → 그 제품 폴더. 코어에는 없어도 되므로 점검에서 세지 않고, 안내문에만 쓴다.
     */
    private static $productOwners = array(
        'user_dday_table'        => 'plugin/dday/dday.php (with extend/dday.extend.php)',
        'baby_table'             => 'plugin/baby/baby.php (with extend/baby.extend.php)',
        'baby_log_table'         => 'plugin/baby/baby.php (with extend/baby.extend.php)',
        'baby_growth_table'      => 'plugin/baby/baby.php (with extend/baby.extend.php)',
        'baby_vaccine_tpl_table' => 'plugin/baby/baby.php (with extend/baby.extend.php)',
        'baby_vaccine_table'     => 'plugin/baby/baby.php (with extend/baby.extend.php)',
        'print_product_table'    => 'plugin/print/print.php (with extend/print.extend.php)',
        'print_artwork_table'    => 'plugin/print/print.php (with extend/print.extend.php)',
        'print_order_table'      => 'plugin/print/print.php (with extend/print.extend.php)',
        'print_order_item_table' => 'plugin/print/print.php (with extend/print.extend.php)',
        'print_review_table'     => 'plugin/print/print.php (with extend/print.extend.php)',
    );

    /** 로그인이 되려면 반드시 있어야 하는 것. 나머지는 기능별로 없어도 로그인은 된다. */
    private static $authKeys = array('refresh_token_table', 'login_attempt_table');

    /** extend 가 admin_dbupgrade 훅에 거는 설치기. 있으면 그대로 부른다. */
    private static $installers = array(
        'webapp_admin_dbupgrade',
        'dday_admin_dbupgrade',
        'baby_admin_dbupgrade',
        'print_admin_dbupgrade',
    );

    /** @var array|null 이 요청에서 계산한 점검 결과 */
    private static $report = null;

    /**
     * 설치 상태를 맞춘다. 표식이 최신이면 파일 하나만 읽고 끝난다.
     *
     * @return array {ok:bool, missing_extends:string[], missing_tables:string[], installed:string[]}
     */
    public static function ensure()
    {
        if (self::$report !== null) {
            return self::$report;
        }

        $stamp = self::stamp();
        $marker = self::markerPath();
        $cached = self::readMarker($marker);
        if ($cached !== null && isset($cached['stamp']) && $cached['stamp'] === $stamp && !empty($cached['ok'])) {
            return self::$report = $cached;
        }

        // 설치기는 한 번에 하나만 돈다 — 배포 직후 한꺼번에 들어온 요청(로그인 없는 요청 포함)이 같은 ALTER · 정리
        // 문장을 겹쳐 돌리지 않게. 기다리는 동안 앞 요청이 표식을 써 두었으면 그것을 쓰고, 끝내 못 잡으면 고치지 않고 본다.
        // 잠금이 오류(이름 잠금을 못 쓰는 DB · 프록시)면 예전처럼 설치기를 돌린다 — 새 설치본의 표가 안 생기면 안 된다.
        $lockName = 'g5_api_schema_' . substr(sha1(dirname(__DIR__, 2)), 0, 12);
        $lock = self::lock($lockName);
        try {
            if ($lock !== null) {
                $cached = self::readMarker($marker);
                if ($cached !== null && isset($cached['stamp']) && $cached['stamp'] === $stamp && !empty($cached['ok'])) {
                    return self::$report = $cached;
                }
                if ($lock === 0) {
                    return self::$report = self::inspect(false) + array('stamp' => $stamp);
                }
            }

            $report = self::inspect(true);
            $report['stamp'] = $stamp;
            if ($report['ok']) {
                self::writeMarker($marker, $report);
            }
        } finally {
            if ($lock === 1) {
                self::unlock($lockName);
            }
        }

        return self::$report = $report;
    }

    /**
     * 현재 상태만 본다(고치지 않음). /v1/status 가 쓴다.
     */
    public static function report()
    {
        return self::inspect(false);
    }

    /**
     * 알 수 없는 테이블 키에 대한 사람이 읽을 안내.
     */
    public static function describeMissingKey($key)
    {
        $key = (string) $key;
        if (isset(self::$keyOwners[$key])) {
            $owner = self::$keyOwners[$key];
            return "Table key '{$key}' is not registered. Upload the core package ({$owner} with extend/webapp.extend.php) to the Gnuboard root and open adm/dbupgrade.php once.";
        }
        if (isset(self::$productOwners[$key])) {
            $owner = self::$productOwners[$key];
            return "Table key '{$key}' is not registered. This feature needs the product folder {$owner}; upload it and open adm/dbupgrade.php once.";
        }

        return "Table key '{$key}' is not registered by any installed extend.";
    }

    // ------------------------------------------------------------------

    private static function inspect($install)
    {
        global $g5;

        $missingExtends = array();
        foreach (self::$keyOwners as $key => $owner) {
            if (!isset($g5[$key]) && !in_array($owner, $missingExtends, true)) {
                $missingExtends[] = $owner;
            }
        }

        $installed = array();
        if ($install) {
            foreach (self::$installers as $fn) {
                if (!function_exists($fn)) {
                    continue;
                }
                try {
                    // 그누보드 adm/dbupgrade.php 가 하는 것과 같은 호출. false = 점검이 아니라 실행.
                    call_user_func($fn, false);
                    $installed[] = $fn;
                } catch (Throwable $e) {
                    error_log('[api/schema] ' . $fn . ' failed: ' . $e->getMessage());
                }
            }
        }

        $missingTables = array();
        $authKeysMissing = false;
        foreach (self::$authKeys as $key) {
            if (!isset($g5[$key])) {
                $authKeysMissing = true; // extend 자체가 없는 경우는 위에서 이미 셌다
                continue;
            }
            if (!self::tableExists($g5[$key])) {
                $missingTables[] = $g5[$key];
            }
        }

        return array(
            'ok'              => !$authKeysMissing && !$missingTables,
            'missing_extends' => $missingExtends,
            'missing_tables'  => $missingTables,
            'installed'       => $installed,
            'checked_at'      => date('c'),
        );
    }

    private static function tableExists($table)
    {
        try {
            // SHOW TABLES LIKE ? 는 네이티브 prepare 에서 바인딩이 안 된다. 카탈로그를 직접 본다.
            $row = DB::fetch(
                'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
                array($table)
            );
            return !empty($row);
        } catch (Throwable $e) {
            return false;
        }
    }

    private static function stamp()
    {
        global $g5;

        $present = array();
        foreach (self::$installers as $fn) {
            if (function_exists($fn)) {
                $present[] = $fn;
            }
        }
        $keys = array();
        foreach (array_keys(self::$keyOwners) as $key) {
            if (isset($g5[$key])) {
                $keys[] = $key;
            }
        }

        return sha1(self::VERSION . '|' . implode(',', $present) . '|' . implode(',', $keys));
    }

    private static function markerPath()
    {
        $dir = defined('G5_DATA_PATH') ? G5_DATA_PATH : dirname(__DIR__, 2) . '/data';
        if (!is_dir($dir) || !is_writable($dir)) {
            // data/ 에 못 쓰는 호스팅에서도 요청마다 설치기를 돌리지는 않도록 임시 폴더에 둔다.
            $dir = sys_get_temp_dir();
        }

        return rtrim($dir, '/' . chr(92)) . '/api-schema-' . substr(sha1(dirname(__DIR__, 2)), 0, 12) . '.json';
    }

    /** @return int|null 1 = 잡음, 0 = 다른 요청이 설치 중(10초 기다림), null = 잠금 오류 */
    private static function lock($name)
    {
        try {
            $row = DB::fetch('SELECT GET_LOCK(?, 10) AS got', array($name));
        } catch (Throwable $e) {
            return null;
        }
        if (!is_array($row) || !isset($row['got'])) {
            return null;
        }

        return (int) $row['got'] === 1 ? 1 : 0;
    }

    private static function unlock($name)
    {
        try {
            DB::fetch('SELECT RELEASE_LOCK(?) AS released', array($name));
        } catch (Throwable $e) {
            // 연결이 끝나면 풀린다.
        }
    }

    private static function readMarker($path)
    {
        if (!is_readable($path)) {
            return null;
        }
        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : null;
    }

    private static function writeMarker($path, array $report)
    {
        @file_put_contents($path, json_encode($report), LOCK_EX);
    }
}
