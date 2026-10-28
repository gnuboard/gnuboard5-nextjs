<?php
if (!defined('_GNUBOARD_')) exit; // 개별 페이지 접근 불가

// ---------------------------------------------------------------------------
// 웹·앱 공통 표 — 로그인 토큰 / 기기 / 푸시 토큰·큐 / 알림 이력 / 소셜 ticket / 신고·차단
// (제품 고유 표는 plugin/<제품>/ 이 등록한다: user_dday → plugin/dday/dday.php)
// ---------------------------------------------------------------------------
$g5['push_token_table']           = G5_TABLE_PREFIX.'push_token';           // Expo Push 토큰
$g5['notification_log_table']     = G5_TABLE_PREFIX.'notification_log';     // 발송 알림 이력
$g5['social_mobile_ticket_table'] = G5_TABLE_PREFIX.'social_mobile_ticket'; // 모바일 소셜 로그인 one-time ticket
$g5['social_signup_ticket_table'] = G5_TABLE_PREFIX.'social_signup_ticket'; // Next.js 소셜 신규가입 one-time ticket
$g5['device_table']               = G5_TABLE_PREFIX.'device';               // 비회원 device_id 발급 이력 (claim-device 보호)
$g5['push_queue_table']           = G5_TABLE_PREFIX.'push_queue';           // 푸시 발송 큐 (enqueue → worker drain)
$g5['refresh_token_table']        = G5_TABLE_PREFIX.'refresh_token';        // JWT refresh token (revocation 가능)
$g5['content_report_table']       = G5_TABLE_PREFIX.'content_report';       // 게시글/댓글/이미지 신고
$g5['member_block_table']         = G5_TABLE_PREFIX.'member_block';         // 회원별 작성자 차단
$g5['account_deletion_request_table'] = G5_TABLE_PREFIX.'account_deletion_request'; // 웹 계정 삭제 요청
$g5['login_attempt_table']        = G5_TABLE_PREFIX.'login_attempt';        // 로그인 실패 카운팅 + enum probe quota
$g5['member_pref_table']          = G5_TABLE_PREFIX.'member_pref';          // 회원 환경설정 (locale, tz)
$g5['member_legal_consent_table'] = G5_TABLE_PREFIX.'member_legal_consent'; // 약관·개인정보 동의 이력 (앱 POST /members/me/legal-consent)
$g5['web_ticket_table']           = G5_TABLE_PREFIX.'web_ticket';           // 앱 → 레거시 웹 페이지 1회용 입장권 (POST /auth/web-ticket)
$g5['social_apple_token_table']   = G5_TABLE_PREFIX.'social_apple_token';   // Sign in with Apple refresh_token(암호화) — 탈퇴 시 revoke (SC-11)
$g5['member_public_key_table']    = G5_TABLE_PREFIX.'member_public_key';    // 회원 공개 키 — 주소에 아이디 대신 쓰는 무작위 값 (api/lib/member_key_helpers.php)
$g5['theme_setting_table']        = G5_TABLE_PREFIX.'theme_setting';        // 테마 설정 — 왼쪽 메뉴 · 사이트 문구 (plugin/webapp/theme-settings/settings.php)
$g5['post_revision_table']        = G5_TABLE_PREFIX.'post_revision';        // 매뉴얼 게시글 전체 스냅샷 이력
$g5['editor_image_table']         = G5_TABLE_PREFIX.'editor_image';         // 웹 에디터로 올린 사진 — 임시(data/tmp) → 글 저장 때 data/editor (api/lib/editor-uploads.php)

// ---------------------------------------------------------------------------
// 모바일 앱 버전 정책 — /v1/settings 에서 노출되어 클라이언트가 강제 업데이트 판정.
// 보안 패치 후 G5_APP_MIN_VERSION 을 올리면 옛 버전 사용자는 다음 부팅 시 차단됨.
// 공유 기본값은 "정책 없음"(0.0.0, 빈 주소)이다 — 여기에 특정 앱의 버전을 두면 같은 코드를 쓰는 다른 사이트의 앱까지
// 업데이트 안내를 띄운다. 앱을 내는 사이트는 extend/ 나 제품 플러그인에서 먼저 define 한다(디데이 앱: plugin/dday/dday.php).
// ---------------------------------------------------------------------------
if (!defined('G5_APP_MIN_VERSION'))          define('G5_APP_MIN_VERSION', '0.0.0');
if (!defined('G5_APP_LATEST_VERSION'))       define('G5_APP_LATEST_VERSION', '0.0.0');
if (!defined('G5_APP_STORE_URL_ANDROID'))    define('G5_APP_STORE_URL_ANDROID', '');
if (!defined('G5_APP_STORE_URL_IOS'))        define('G5_APP_STORE_URL_IOS', '');
if (!defined('G5_APP_FORCE_UPDATE_MESSAGE')) define('G5_APP_FORCE_UPDATE_MESSAGE', '');

// ---------------------------------------------------------------------------
// adm/dbupgrade.php 의 admin_dbupgrade 훅에 자동 마이그레이션 등록.
// 관리자가 `/adm/dbupgrade.php` 한 번 열면 변경 가능한 모든 항목이 자동 실행되고,
// 더 이상 적용할 게 없으면 함수가 $is_check 를 그대로 반환해 그누보드가
// "더 이상 업그레이드 할 내용이 없습니다" 메시지를 띄운다.
//
// 모든 ALTER 는 information_schema 로 사전 체크 — `IF NOT EXISTS` 가 아닌 명시적
// 분기로 처리해서 (1) MySQL 8.0.29+ 의존 제거 (2) "실제 변경 여부" 추적 가능.
// ---------------------------------------------------------------------------
add_replace('admin_dbupgrade', 'webapp_admin_dbupgrade', 1, 1);

// 그누보드 5.6.41 부터 adm/dbupgrade.php 는 migrations/*.sql 을 돌리고 admin_dbupgrade 대신
// admin_dbupgrade_result(결과 배열) 를 부른다. 두 판 모두에서 우리 표가 설치되도록 새 훅에도 건다 —
// 5.6.30 은 새 훅을, 5.6.41 은 옛 훅을 부르지 않으므로 한 번만 돈다.
add_replace('admin_dbupgrade_result', 'webapp_admin_dbupgrade_result', 1, 1);

if (!function_exists('webapp_admin_dbupgrade_result')) {
    /**
     * @param mixed $result ['success' => bool, 'applied' => int, 'skipped' => int, 'errors' => string[]]
     * @return mixed 같은 배열 — 우리 설치기가 표를 바꿨으면 applied 를 하나씩 올리고, 실패는 errors 에 더한다
     */
    function webapp_admin_dbupgrade_result($result)
    {
        if (!is_array($result)) {
            return $result;
        }
        // api/lib/Schema.php 의 $installers 와 같은 목록 — 그 제품이 설치돼 있을 때만 함수가 있다.
        foreach (array('webapp_admin_dbupgrade', 'dday_admin_dbupgrade', 'baby_admin_dbupgrade', 'print_admin_dbupgrade') as $installer) {
            if (!function_exists($installer)) {
                continue;
            }
            try {
                if ($installer(false)) {
                    $result['applied'] = (int) ($result['applied'] ?? 0) + 1;
                }
            } catch (\Throwable $e) {
                $result['success'] = false;
                $result['errors'][] = $installer . ': ' . $e->getMessage();
            }
        }
        return $result;
    }
}

if (!function_exists('webapp_table_exists')) {
    function webapp_table_exists(string $table): bool
    {
        $row = sql_fetch("SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
                          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" . addslashes($table) . "'
                          LIMIT 1");
        return !empty($row['x']);
    }
}

if (!function_exists('webapp_column_exists')) {
    function webapp_column_exists(string $table, string $column): bool
    {
        $row = sql_fetch("SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = '" . addslashes($table) . "'
                            AND COLUMN_NAME = '" . addslashes($column) . "'
                          LIMIT 1");
        return !empty($row['x']);
    }
}

if (!function_exists('webapp_column_is_nullable')) {
    function webapp_column_is_nullable(string $table, string $column): bool
    {
        $row = sql_fetch("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = '" . addslashes($table) . "'
                            AND COLUMN_NAME = '" . addslashes($column) . "'
                          LIMIT 1");
        return !empty($row) && strtoupper($row['IS_NULLABLE']) === 'YES';
    }
}

if (!function_exists('webapp_index_build_allowed')) {
    /**
     * 이미 있는 표에 보조 인덱스를 지금 더해도 되는지. 이 설치기는 API 자가 점검(api/lib/Schema.php)이 손님 요청 안에서도
     * 부르므로, 큰 표에서 인덱스를 만드는 동안 그 요청과 뒤에 줄 선 API 요청이 기다리지 않게 작은 표만 바로 더한다.
     * 큰 표는 관리자 DB 업그레이드(/adm/dbupgrade.php — G5_IS_ADMIN)나 CLI 에서 더한다.
     */
    function webapp_index_build_allowed(int $estimatedRows, bool $isCli, bool $isAdmin): bool
    {
        return $isCli || $isAdmin || $estimatedRows < 200000;
    }
}

if (!function_exists('webapp_index_build_allowed_now')) {
    function webapp_index_build_allowed_now(string $table): bool
    {
        $row = sql_fetch("SELECT TABLE_ROWS AS n FROM INFORMATION_SCHEMA.TABLES
                          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" . addslashes($table) . "' LIMIT 1", false);
        return webapp_index_build_allowed((int) ($row['n'] ?? 0), PHP_SAPI === 'cli', defined('G5_IS_ADMIN') && G5_IS_ADMIN);
    }
}

if (!function_exists('webapp_index_exists')) {
    function webapp_index_exists(string $table, string $index): bool
    {
        $row = sql_fetch("SELECT 1 AS x FROM INFORMATION_SCHEMA.STATISTICS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = '" . addslashes($table) . "'
                            AND INDEX_NAME = '" . addslashes($index) . "'
                          LIMIT 1");
        return !empty($row['x']);
    }
}

if (!function_exists('webapp_column_default')) {
    /** @return string|null 컬럼 기본값. 컬럼이 없거나 NULL 기본이면 null. */
    function webapp_column_default(string $table, string $column)
    {
        $row = sql_fetch("SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = '" . addslashes($table) . "'
                            AND COLUMN_NAME = '" . addslashes($column) . "'
                          LIMIT 1");
        if (!$row || $row['COLUMN_DEFAULT'] === null) {
            return null;
        }
        return trim((string) $row['COLUMN_DEFAULT'], "'"); // MariaDB 10.2+ 는 따옴표째 돌려준다
    }
}

if (!function_exists('webapp_fold_column_into_json')) {
    /**
     * 컬럼 하나를 JSON 컬럼 안의 같은 이름 키로 옮긴다(컬럼을 지우기 전 단계).
     * 행마다 PHP 에서 decode/encode 하므로 JSON 함수가 없는 MySQL 에서도 돈다. 500행씩 끊는다.
     */
    function webapp_fold_column_into_json(string $table, string $pk, string $column, string $jsonColumn): void
    {
        $lastId = 0;
        while (true) {
            $rows = array();
            $res = sql_query("SELECT `{$pk}` AS id, `{$column}` AS v, `{$jsonColumn}` AS j FROM `{$table}`
                              WHERE `{$column}` IS NOT NULL AND `{$column}` <> '' AND `{$pk}` > {$lastId}
                              ORDER BY `{$pk}` LIMIT 500", false);
            while ($res && ($r = sql_fetch_array($res))) {
                $rows[] = $r;
            }
            if (!$rows) {
                break;
            }
            foreach ($rows as $r) {
                $lastId = (int) $r['id'];
                $data = json_decode((string) $r['j'], true);
                if (!is_array($data)) {
                    $data = array();
                }
                if (!isset($data[$column])) {
                    $data[$column] = is_numeric($r['v']) ? (int) $r['v'] : (string) $r['v'];
                    sql_query("UPDATE `{$table}` SET `{$jsonColumn}` = '" . sql_real_escape_string(json_encode($data, JSON_UNESCAPED_UNICODE)) . "'
                               WHERE `{$pk}` = {$lastId}", false);
                }
            }
        }
    }
}

if (!function_exists('webapp_admin_dbupgrade')) {
    function webapp_admin_dbupgrade(bool $is_check): bool
    {
        global $g5;

        $push_token           = $g5['push_token_table'];
        $notification_log     = $g5['notification_log_table'];
        $social_mobile_ticket = $g5['social_mobile_ticket_table'];
        $social_signup_ticket = $g5['social_signup_ticket_table'];
        $device               = $g5['device_table'];
        $push_queue           = $g5['push_queue_table'];
        $refresh_token        = $g5['refresh_token_table'];
        $content_report       = $g5['content_report_table'];
        $member_block         = $g5['member_block_table'];
        $account_delete_req   = $g5['account_deletion_request_table'];
        $login_attempt        = $g5['login_attempt_table'];
        $member_pref          = $g5['member_pref_table'];
        $legal_consent        = $g5['member_legal_consent_table'];
        $post_revision        = $g5['post_revision_table'];

        $changed = false;

        // =====================================================================
        // 매뉴얼 게시글 변경 이력 — 원본 게시글 표는 MyISAM일 수 있어 별도 InnoDB 로 보관.
        // =====================================================================
        if (!webapp_table_exists($post_revision)) {
            sql_query("CREATE TABLE `{$post_revision}` (
                `rev_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `bo_table` VARCHAR(20) NOT NULL,
                `wr_id` INT UNSIGNED NOT NULL,
                `history_uuid` CHAR(36) NOT NULL,
                `rev_no` INT UNSIGNED NOT NULL,
                `archived_at` DATETIME NULL DEFAULT NULL,
                `archive_reason` VARCHAR(16) NOT NULL DEFAULT '',
                `archive_target_bo_table` VARCHAR(20) NOT NULL DEFAULT '',
                `event` VARCHAR(16) NOT NULL DEFAULT 'updated',
                `capture_status` VARCHAR(16) NOT NULL DEFAULT 'finalized',
                `source` VARCHAR(16) NOT NULL DEFAULT 'web',
                `actor_mb_id` VARCHAR(20) NOT NULL DEFAULT '',
                `actor_name` VARCHAR(255) NOT NULL DEFAULT '',
                `actor_role` VARCHAR(16) NOT NULL DEFAULT 'system',
                `note` VARCHAR(500) NOT NULL DEFAULT '',
                `wr_subject` VARCHAR(255) NOT NULL DEFAULT '',
                `wr_seo_title` VARCHAR(200) NOT NULL DEFAULT '',
                `ca_name` VARCHAR(255) NOT NULL DEFAULT '',
                `wr_option` VARCHAR(255) NOT NULL DEFAULT '',
                `wr_link1` TEXT NOT NULL,
                `wr_link2` TEXT NOT NULL,
                `wr_content` MEDIUMTEXT NOT NULL,
                `content_hash` CHAR(64) NOT NULL,
                `created_at` DATETIME NOT NULL,
                PRIMARY KEY (`rev_id`),
                UNIQUE KEY `uniq_post_history_revision_no` (`bo_table`, `wr_id`, `history_uuid`, `rev_no`),
                KEY `idx_post_revision_active` (`bo_table`, `wr_id`, `archived_at`, `rev_id`),
                KEY `idx_post_revision_archive` (`archived_at`, `bo_table`, `rev_id`),
                KEY `idx_post_revision_history` (`history_uuid`, `archived_at`, `rev_no`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 게시글 삭제·이동 후에도 과거 이력을 보관한다. history_uuid 로 글 번호 재사용 시 이력을 분리한다.
        // =====================================================================
        if (webapp_table_exists($post_revision)) {
            if (!webapp_column_exists($post_revision, 'history_uuid')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD COLUMN `history_uuid` CHAR(36) NULL DEFAULT NULL AFTER `wr_id`", false);
                $changed = true;
            }
            if (!webapp_column_exists($post_revision, 'archived_at')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD COLUMN `archived_at` DATETIME NULL DEFAULT NULL AFTER `rev_no`", false);
                $changed = true;
            }
            if (!webapp_column_exists($post_revision, 'archive_reason')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD COLUMN `archive_reason` VARCHAR(16) NOT NULL DEFAULT '' AFTER `archived_at`", false);
                $changed = true;
            }
            if (!webapp_column_exists($post_revision, 'archive_target_bo_table')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD COLUMN `archive_target_bo_table` VARCHAR(20) NOT NULL DEFAULT '' AFTER `archive_reason`", false);
                $changed = true;
            }

            // 기존 한 게시글의 모든 버전에 같은 이력 ID 를 부여한다.
            if (webapp_column_exists($post_revision, 'history_uuid')) {
                $missing = sql_query("SELECT bo_table, wr_id FROM `{$post_revision}`
                                      WHERE history_uuid IS NULL OR history_uuid = ''
                                      GROUP BY bo_table, wr_id", false);
                while ($missing && ($group = sql_fetch_array($missing))) {
                    $uuidRow = sql_fetch("SELECT UUID() AS history_uuid", false);
                    $historyUuid = sql_real_escape_string((string) ($uuidRow['history_uuid'] ?? ''));
                    $bo = sql_real_escape_string((string) $group['bo_table']);
                    $wrId = (int) $group['wr_id'];
                    if ($historyUuid !== '') {
                        sql_query("UPDATE `{$post_revision}` SET history_uuid = '{$historyUuid}'
                                   WHERE bo_table = '{$bo}' AND wr_id = {$wrId}
                                     AND (history_uuid IS NULL OR history_uuid = '')", false);
                    }
                }
                if (webapp_column_is_nullable($post_revision, 'history_uuid')) {
                    sql_query("ALTER TABLE `{$post_revision}` MODIFY COLUMN `history_uuid` CHAR(36) NOT NULL", false);
                    $changed = true;
                }
            }

            if (webapp_index_exists($post_revision, 'uniq_post_revision_no')) {
                sql_query("ALTER TABLE `{$post_revision}` DROP INDEX `uniq_post_revision_no`", false);
                $changed = true;
            }
            if (webapp_index_exists($post_revision, 'idx_post_revision_post')) {
                sql_query("ALTER TABLE `{$post_revision}` DROP INDEX `idx_post_revision_post`", false);
                $changed = true;
            }
            if (!webapp_index_exists($post_revision, 'uniq_post_history_revision_no')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD UNIQUE KEY `uniq_post_history_revision_no`
                           (`bo_table`, `wr_id`, `history_uuid`, `rev_no`)", false);
                $changed = true;
            }
            if (!webapp_index_exists($post_revision, 'idx_post_revision_active')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD KEY `idx_post_revision_active`
                           (`bo_table`, `wr_id`, `archived_at`, `rev_id`)", false);
                $changed = true;
            }
            if (!webapp_index_exists($post_revision, 'idx_post_revision_archive')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD KEY `idx_post_revision_archive`
                           (`archived_at`, `bo_table`, `rev_id`)", false);
                $changed = true;
            }
            if (!webapp_index_exists($post_revision, 'idx_post_revision_history')) {
                sql_query("ALTER TABLE `{$post_revision}` ADD KEY `idx_post_revision_history`
                           (`history_uuid`, `archived_at`, `rev_no`)", false);
                $changed = true;
            }
        }

        // =====================================================================
        // 2) g5_push_token — Expo Push 토큰
        // =====================================================================
        if (!webapp_table_exists($push_token)) {
            sql_query("CREATE TABLE `{$push_token}` (
                `token_id` INT PRIMARY KEY AUTO_INCREMENT,
                `mb_id` VARCHAR(20) NOT NULL,
                `push_token` VARCHAR(255) NOT NULL,
                `platform` ENUM('android','ios','web') NOT NULL DEFAULT 'android',
                `last_used_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `registered_at` DATETIME NULL DEFAULT NULL COMMENT '앱이 마지막으로 등록한 시각 — 발송 성공으로는 안 바뀐다',
                UNIQUE KEY `uniq_token` (`push_token`),
                INDEX `idx_mb_id` (`mb_id`),
                INDEX `idx_last_used` (`last_used_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // 앱이 토큰을 등록한 시각(2026-10). last_used_at 은 발송 성공에도 올라가서, 늦게 온 receipt 가
        // DeviceNotRegistered 일 때 "그 뒤에 다시 등록된 토큰인지" 가를 수 없다(PushQueue::checkReceipts).
        if (webapp_table_exists($push_token) && !webapp_column_exists($push_token, 'registered_at')) {
            sql_query("ALTER TABLE `{$push_token}` ADD COLUMN `registered_at` DATETIME NULL DEFAULT NULL AFTER `last_used_at`", false);
            // 기존 행은 마지막 사용 시각으로 채운다 — NULL 이면 "발송 전 등록"으로 보고 지우므로, 배포 직후 24시간 동안
            // 이미 다시 등록된 토큰까지 지울 수 있다. last_used_at 은 발송으로도 올라가 덜 지우는 쪽으로 기운다(의도).
            sql_query("UPDATE `{$push_token}` SET `registered_at` = `last_used_at` WHERE `registered_at` IS NULL", false);
            $changed = true;
        }

        // 표 정리(api/lib/TableCleanup.php)가 오래 안 쓴 토큰을 last_used_at 으로 찾는다 — 표 전체를 훑지 않게.
        if (webapp_table_exists($push_token) && !webapp_index_exists($push_token, 'idx_last_used')
            && webapp_index_build_allowed_now($push_token)) {
            sql_query("ALTER TABLE `{$push_token}` ADD KEY `idx_last_used` (`last_used_at`)", false);
            $changed = true;
        }

        // Legacy push_token 테이블에 UNIQUE 제약이 없으면 (한참 전 설치본) 추가.
        // 중복 row 가 있으면 ALTER 가 실패하므로 먼저 dedupe.
        if (webapp_table_exists($push_token) && !webapp_index_exists($push_token, 'uniq_token')) {
            // 동일 push_token row 가 여러 개 있으면 최신 1건만 남기고 삭제.
            sql_query("DELETE p1 FROM `{$push_token}` p1
                       INNER JOIN `{$push_token}` p2
                           ON p1.push_token = p2.push_token
                          AND p1.token_id  < p2.token_id", false);
            sql_query("ALTER TABLE `{$push_token}` ADD UNIQUE KEY `uniq_token` (`push_token`)", false);
            $changed = true;
        }

        // =====================================================================
        // 3) g5_notification_log — 발송 알림 이력
        //    mb_id(회원) 또는 device_id(비회원) 으로 식별.
        // =====================================================================
        if (!webapp_table_exists($notification_log)) {
            sql_query("CREATE TABLE `{$notification_log}` (
                `nt_id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                `mb_id` VARCHAR(20) NULL DEFAULT NULL,
                `device_id` VARCHAR(64) NULL DEFAULT NULL,
                `nt_type` VARCHAR(20) NOT NULL DEFAULT 'custom',
                `nt_event` VARCHAR(40) NOT NULL DEFAULT '',
                `nt_title` VARCHAR(255) NOT NULL DEFAULT '',
                `nt_body` TEXT NOT NULL,
                `nt_data` TEXT NOT NULL,
                `nt_dedup_key` VARCHAR(96) NULL DEFAULT NULL,
                `nt_sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `nt_read_at` DATETIME NULL DEFAULT NULL,
                PRIMARY KEY (`nt_id`),
                UNIQUE KEY `uniq_dedup_key` (`nt_dedup_key`),
                KEY `idx_mb_sent` (`mb_id`, `nt_sent_at`),
                KEY `idx_mb_read` (`mb_id`, `nt_read_at`),
                KEY `idx_mb_event_sent` (`mb_id`, `nt_event`, `nt_sent_at`),
                KEY `idx_device_sent` (`device_id`, `nt_sent_at`),
                KEY `idx_read_sent` (`nt_read_at`, `nt_sent_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        } else {
            // 기존 운영 DB 마이그레이션: device_id 컬럼 + mb_id NULL 허용 + 인덱스
            if (!webapp_column_exists($notification_log, 'device_id')) {
                sql_query("ALTER TABLE `{$notification_log}`
                           ADD COLUMN `device_id` VARCHAR(64) NULL DEFAULT NULL AFTER `mb_id`", false);
                $changed = true;
            }
            if (!webapp_column_is_nullable($notification_log, 'mb_id')) {
                sql_query("ALTER TABLE `{$notification_log}`
                           MODIFY COLUMN `mb_id` VARCHAR(20) NULL DEFAULT NULL", false);
                $changed = true;
            }
            if (!webapp_index_exists($notification_log, 'idx_device_sent')) {
                sql_query("ALTER TABLE `{$notification_log}`
                           ADD KEY `idx_device_sent` (`device_id`, `nt_sent_at`)", false);
                $changed = true;
            }
        }

        // notification_log 중복 발송 방지:
        // cron 이 같은 날 두 번 실행돼도 같은 dday 의 알림은 한 번만 enqueue.
        // nt_dedup_key = "{mb_or_dev}|{제품 키}|{YYYY-MM-DD}" — 발송 측이 명시적 set.
        // UNIQUE 로 두 번째 INSERT 는 INSERT IGNORE 로 조용히 무시됨.
        if (webapp_table_exists($notification_log) && !webapp_column_exists($notification_log, 'nt_dedup_key')) {
            sql_query("ALTER TABLE `{$notification_log}`
                       ADD COLUMN `nt_dedup_key` VARCHAR(96) NULL DEFAULT NULL AFTER `nt_data`", false);
            $changed = true;
        }
        if (webapp_table_exists($notification_log) && !webapp_index_exists($notification_log, 'uniq_dedup_key')) {
            sql_query("ALTER TABLE `{$notification_log}`
                       ADD UNIQUE KEY `uniq_dedup_key` (`nt_dedup_key`)", false);
            $changed = true;
        }

        // 3.1) nt_event — 실제 이벤트 이름(comment.created …). nt_type 은 dday|system|custom
        //      큰 갈래만 남기고, "댓글 알림만" 같은 필터는 이 컬럼으로 SQL 에서 건다.
        //      옛 행은 nt_data.type 에 같은 값이 있으므로 거기서 채우고, 없으면 nt_type 으로.
        if (webapp_table_exists($notification_log) && !webapp_column_exists($notification_log, 'nt_event')) {
            sql_query("ALTER TABLE `{$notification_log}`
                       ADD COLUMN `nt_event` VARCHAR(40) NOT NULL DEFAULT '' AFTER `nt_type`", false);
            // JSON 함수는 MySQL 5.7+/MariaDB 10.2+ — 없으면 조용히 건너뛰고 아래 fallback 이 채운다.
            sql_query("UPDATE `{$notification_log}`
                          SET nt_event = LEFT(JSON_UNQUOTE(JSON_EXTRACT(nt_data, '$.type')), 40)
                        WHERE nt_event = '' AND nt_data LIKE '{%' AND JSON_VALID(nt_data)
                          AND JSON_EXTRACT(nt_data, '$.type') IS NOT NULL", false);
            sql_query("UPDATE `{$notification_log}` SET nt_event = nt_type WHERE nt_event = '' OR nt_event IS NULL", false);
            $changed = true;
        }
        if (webapp_table_exists($notification_log) && !webapp_index_exists($notification_log, 'idx_mb_event_sent')) {
            sql_query("ALTER TABLE `{$notification_log}`
                       ADD KEY `idx_mb_event_sent` (`mb_id`, `nt_event`, `nt_sent_at`)", false);
            $changed = true;
        }
        // 3.1.1) 표 정리(api/lib/TableCleanup.php)가 읽은 알림은 nt_read_at, 안 읽은 알림은 nt_read_at IS NULL + nt_sent_at 으로
        //        지운다. 이 인덱스가 없으면 정리할 때마다 표 전체를 훑으며 그동안 새 알림 저장이 기다린다.
        //        큰 표는 손님 요청(API 자가 점검) 안에서 만들지 않는다 — 관리자 DB 업그레이드 · CLI 에서(webapp_index_build_allowed).
        if (webapp_table_exists($notification_log) && !webapp_index_exists($notification_log, 'idx_read_sent')
            && webapp_index_build_allowed_now($notification_log)) {
            sql_query("ALTER TABLE `{$notification_log}`
                       ADD KEY `idx_read_sent` (`nt_read_at`, `nt_sent_at`)", false);
            $changed = true;
        }
        // 3.2) 제품 고유 참조(dday_id)는 공통 표의 컬럼이 아니라 nt_data 안에 산다.
        //      값을 JSON 으로 옮긴 뒤 컬럼을 지운다. nt_created_at 은 nt_sent_at 과 같은 값이라 함께 정리.
        if (webapp_table_exists($notification_log) && webapp_column_exists($notification_log, 'dday_id')) {
            webapp_fold_column_into_json($notification_log, 'nt_id', 'dday_id', 'nt_data');
            if (webapp_index_exists($notification_log, 'idx_dday')) {
                sql_query("ALTER TABLE `{$notification_log}` DROP KEY `idx_dday`", false);
            }
            sql_query("ALTER TABLE `{$notification_log}` DROP COLUMN `dday_id`", false);
            $changed = true;
        }
        if (webapp_table_exists($notification_log) && webapp_column_exists($notification_log, 'nt_created_at')) {
            sql_query("ALTER TABLE `{$notification_log}` DROP COLUMN `nt_created_at`", false);
            $changed = true;
        }
        if (webapp_table_exists($notification_log) && webapp_column_default($notification_log, 'nt_type') === 'dday') {
            sql_query("ALTER TABLE `{$notification_log}` MODIFY COLUMN `nt_type` VARCHAR(20) NOT NULL DEFAULT 'custom'", false);
            $changed = true;
        }

        // =====================================================================
        // 3.5) g5_device — 비회원 device_id 발급 이력 (HMAC sig + claim-device 보호)
        // =====================================================================
        if (!webapp_table_exists($device)) {
            sql_query("CREATE TABLE `{$device}` (
                `device_id` VARCHAR(64) NOT NULL,
                `first_signed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `last_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `first_ip` VARCHAR(45) NULL DEFAULT NULL,
                `last_ip` VARCHAR(45) NULL DEFAULT NULL,
                `user_agent` VARCHAR(255) NULL DEFAULT NULL,
                `claimed_by_mb_id` VARCHAR(20) NULL DEFAULT NULL COMMENT 'claim-device 로 흡수된 회원',
                `claimed_at` DATETIME NULL DEFAULT NULL,
                PRIMARY KEY (`device_id`),
                KEY `idx_last_seen` (`last_seen_at`),
                KEY `idx_claimed_by` (`claimed_by_mb_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 3.6) g5_push_queue — 푸시 발송 큐 (enqueue → worker drain)
        //
        // 동작 모델:
        //  - cron 1: plugin/dday/cron/send_dday_push.php 가 발송 후보(디데이 매칭)를 찾아
        //    이 테이블에 row 당 1건씩 enqueue (status=pending).
        //  - cron 2 (또는 같은 cron 의 후속 단계): plugin/webapp/cron/process_push_queue.php
        //    가 SELECT … FOR UPDATE SKIP LOCKED 로 청크 단위 claim 해 Expo API 호출.
        //    실패 시 attempts 증가 + 백오프 후 재시도, 5회 초과 시 status='failed'.
        //
        // 운영 1만 MAU+ 부하 시:
        //  - enqueue 는 빠르고 한 cron 안에서 끝남 (단순 INSERT 만).
        //  - worker 는 시간 예산 안에서 처리 가능한 만큼만 처리 → 부분 발송 위험 없음.
        //  - 다음 cron 이 남은 pending 을 이어받음 (durable).
        // =====================================================================
        if (!webapp_table_exists($push_queue)) {
            sql_query("CREATE TABLE `{$push_queue}` (
                `queue_id`     INT PRIMARY KEY AUTO_INCREMENT,
                `expo_token`   VARCHAR(255) NOT NULL,
                `mb_id`        VARCHAR(20) NULL DEFAULT NULL,
                `nt_id`        INT UNSIGNED NULL DEFAULT NULL COMMENT '알림함(notification_log) 행 — 제목·본문·data 는 거기서 읽는다',
                `nt_type`      VARCHAR(20) NOT NULL DEFAULT 'custom',
                `nt_title`     VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'nt_id 없는(알림함에 안 남기는) 푸시만 채운다',
                `nt_body`      VARCHAR(255) NOT NULL DEFAULT '',
                `nt_data`      TEXT NULL DEFAULT NULL COMMENT 'JSON payload (nt_id 없을 때만)',
                `status`       ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
                `attempts`     TINYINT UNSIGNED NOT NULL DEFAULT 0,
                `last_error`   VARCHAR(255) NULL DEFAULT NULL,
                `claim_token`  VARCHAR(40) NULL DEFAULT NULL COMMENT 'worker claim 시 발급된 UUID',
                `claimed_at`   DATETIME NULL DEFAULT NULL,
                `next_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `processed_at` DATETIME NULL DEFAULT NULL,
                `ticket_id`    VARCHAR(64) NULL DEFAULT NULL COMMENT 'Expo push ticket id — 나중에 receipt 로 실제 전달 결과를 확인',
                `receipt_checked_at` DATETIME NULL DEFAULT NULL,
                KEY `idx_pending_next` (`status`, `next_attempt_at`, `queue_id`),
                KEY `idx_receipt` (`status`, `receipt_checked_at`, `processed_at`),
                KEY `idx_claim_token` (`claim_token`),
                KEY `idx_mb_id` (`mb_id`),
                KEY `idx_nt_id` (`nt_id`),
                KEY `idx_processed_at` (`processed_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }
        // Expo receipt 확인용 컬럼(2026-10). ticket 이 ok 여도 FCM 단계에서 버려질 수 있어
        // (예: 기기 토큰 무효) 발송 15분 뒤 receipt 를 물어 실제 결과를 남긴다.
        if (webapp_table_exists($push_queue) && !webapp_column_exists($push_queue, 'ticket_id')) {
            sql_query("ALTER TABLE `{$push_queue}`
                ADD COLUMN `ticket_id` VARCHAR(64) NULL DEFAULT NULL AFTER `processed_at`,
                ADD COLUMN `receipt_checked_at` DATETIME NULL DEFAULT NULL AFTER `ticket_id`,
                ADD KEY `idx_receipt` (`status`, `receipt_checked_at`, `processed_at`)", false);
            $changed = true;
        }

        // =====================================================================
        // 3.7) g5_refresh_token — JWT refresh token (revocation 가능)
        //
        // Access token 은 30 분 짧게, refresh token 은 30 일 + DB 기반 revocation.
        // 로그아웃 / 비밀번호 변경 / 탈퇴 시 해당 토큰을 status='revoked' 로 표시 →
        // 그 토큰으론 더 이상 access token 발급 불가.
        //
        // 보안: token_hash 는 raw token 의 SHA-256 — DB 유출돼도 토큰 자체는 안 노출.
        // =====================================================================
        if (!webapp_table_exists($refresh_token)) {
            sql_query("CREATE TABLE `{$refresh_token}` (
                `token_id`    INT PRIMARY KEY AUTO_INCREMENT,
                `mb_id`       VARCHAR(20) NOT NULL,
                `token_hash`  CHAR(64) NOT NULL COMMENT 'SHA-256(raw refresh token)',
                `status`      ENUM('active','revoked') NOT NULL DEFAULT 'active',
                `device_label` VARCHAR(64) NULL DEFAULT NULL,
                `user_agent`  VARCHAR(255) NULL DEFAULT NULL,
                `ip`          VARCHAR(45) NULL DEFAULT NULL,
                `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `expires_at`  DATETIME NOT NULL,
                `revoked_at`  DATETIME NULL DEFAULT NULL,
                `last_used_at` DATETIME NULL DEFAULT NULL,
                UNIQUE KEY `uniq_token_hash` (`token_hash`),
                KEY `idx_mb_status` (`mb_id`, `status`),
                KEY `idx_expires_at` (`expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 3.8) g5_content_report — 사용자 신고 이력
        //
        // post / comment / image (게시판 첨부) 단위 신고. 동일 사용자가 동일 컨텐츠
        // 중복 신고 못 하도록 UNIQUE 제약. status='open' → 운영자 검토 → 'closed'.
        //
        // 자동 가림 정책: 동일 컨텐츠에 status='open' 신고가 N건(기본 3) 쌓이면
        // /v1/posts/... 응답에서 wr_content 가 ⚠ 차단됨 placeholder 로 교체 (구현은
        // posts.php 에 hook 추가). 운영자는 /adm 에서 'closed' 처리 시 복원.
        // =====================================================================
        if (!webapp_table_exists($content_report)) {
            sql_query("CREATE TABLE `{$content_report}` (
                `report_id`    INT PRIMARY KEY AUTO_INCREMENT,
                `target_type`  ENUM('post','comment','image') NOT NULL,
                `target_key`   VARCHAR(128) NOT NULL COMMENT 'post: bo_table/wr_id, image: file_url',
                `reporter_mb`  VARCHAR(20) NULL DEFAULT NULL,
                `reporter_dev` VARCHAR(64) NULL DEFAULT NULL,
                `reason`       VARCHAR(40) NOT NULL DEFAULT 'other',
                `detail`       VARCHAR(500) NULL DEFAULT NULL,
                `status`       ENUM('open','closed','dismissed') NOT NULL DEFAULT 'open',
                `closed_by`    VARCHAR(20) NULL DEFAULT NULL,
                `closed_at`    DATETIME NULL DEFAULT NULL,
                `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `hide_prev_option` VARCHAR(255) NULL DEFAULT NULL COMMENT '자동 가림 전 wr_option (가림을 일으킨 신고 행만)',
                `hide_prev_wr10`   VARCHAR(255) NULL DEFAULT NULL COMMENT '자동 가림 전 wr_10',
                UNIQUE KEY `uniq_one_per_reporter` (`target_type`, `target_key`, `reporter_mb`, `reporter_dev`),
                KEY `idx_target_status` (`target_type`, `target_key`, `status`),
                KEY `idx_status_created` (`status`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }
        // 자동 가림 전 값 — 관리자가 신고를 기각하면 이 값으로 글을 되돌린다(api/lib/report_hide.php).
        if (webapp_table_exists($content_report) && !webapp_column_exists($content_report, 'hide_prev_option')) {
            sql_query("ALTER TABLE `{$content_report}`
                       ADD COLUMN `hide_prev_option` VARCHAR(255) NULL DEFAULT NULL AFTER `created_at`", false);
            $changed = true;
        }
        if (webapp_table_exists($content_report) && !webapp_column_exists($content_report, 'hide_prev_wr10')) {
            sql_query("ALTER TABLE `{$content_report}`
                       ADD COLUMN `hide_prev_wr10` VARCHAR(255) NULL DEFAULT NULL AFTER `hide_prev_option`", false);
            $changed = true;
        }

        // =====================================================================
        // 3.8.5) g5_member_block — 회원별 작성자 차단 목록
        //
        // 앱은 로컬 차단 목록을 즉시 적용하고, 로그인 회원은 이 테이블에 동기화해서
        // 다른 기기에서도 같은 작성자를 숨길 수 있게 한다.
        // blocked_key: member:{mb_id} 또는 name:{wr_name}
        // =====================================================================
        if (!webapp_table_exists($member_block)) {
            sql_query("CREATE TABLE `{$member_block}` (
                `block_id`      INT PRIMARY KEY AUTO_INCREMENT,
                `mb_id`         VARCHAR(20) NOT NULL,
                `blocked_key`   VARCHAR(128) NOT NULL,
                `blocked_label` VARCHAR(100) NOT NULL DEFAULT '',
                `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_mb_block` (`mb_id`, `blocked_key`),
                KEY `idx_mb_created` (`mb_id`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 3.8.6) g5_account_deletion_request — 웹 계정 삭제 요청
        //
        // Google Play 계정 삭제 요건: 앱을 삭제한 사용자도 웹 리소스에서 삭제 요청을
        // 시작할 수 있어야 한다. legal/account-deletion.php 의 공개 폼이 사용한다.
        // =====================================================================
        if (!webapp_table_exists($account_delete_req)) {
            sql_query("CREATE TABLE `{$account_delete_req}` (
                `request_id`    INT PRIMARY KEY AUTO_INCREMENT,
                `identifier`    VARCHAR(100) NOT NULL,
                `contact_email` VARCHAR(255) NULL DEFAULT NULL,
                `detail`        VARCHAR(500) NULL DEFAULT NULL,
                `request_ip`    VARCHAR(45) NULL DEFAULT NULL,
                `user_agent`    VARCHAR(255) NULL DEFAULT NULL,
                `status`        ENUM('open','closed') NOT NULL DEFAULT 'open',
                `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `closed_at`     DATETIME NULL DEFAULT NULL,
                `closed_by`     VARCHAR(20) NULL DEFAULT NULL,
                `admin_note`    VARCHAR(500) NULL DEFAULT NULL,
                KEY `idx_status_created` (`status`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }
        if (webapp_table_exists($account_delete_req) && !webapp_column_exists($account_delete_req, 'closed_by')) {
            sql_query("ALTER TABLE `{$account_delete_req}`
                       ADD COLUMN `closed_by` VARCHAR(20) NULL DEFAULT NULL AFTER `closed_at`", false);
            $changed = true;
        }
        if (webapp_table_exists($account_delete_req) && !webapp_column_exists($account_delete_req, 'admin_note')) {
            sql_query("ALTER TABLE `{$account_delete_req}`
                       ADD COLUMN `admin_note` VARCHAR(500) NULL DEFAULT NULL AFTER `closed_by`", false);
            $changed = true;
        }

        // =====================================================================
        // 3.9) g5_login_attempt — 로그인 실패 카운팅 + 계정/이메일 존재 확인 quota
        //
        // (mb_id, ip) 쌍 단위로 실패 누적 → 5회 도달 시 15 분 lock-out.
        // 별도 enum probe 추적도 같은 테이블에서 mb_id='__enum__<hash>' 프리픽스로.
        // 1 시간 지난 row 는 호출 시점에 lazy GC.
        // =====================================================================
        if (!webapp_table_exists($login_attempt)) {
            sql_query("CREATE TABLE `{$login_attempt}` (
                `attempt_id`     INT PRIMARY KEY AUTO_INCREMENT,
                `mb_id`          VARCHAR(64) NOT NULL,
                `ip`             VARCHAR(45) NOT NULL,
                `fail_count`     INT NOT NULL DEFAULT 0,
                `locked_until`   DATETIME NULL DEFAULT NULL,
                `last_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY `idx_mb_ip` (`mb_id`, `ip`),
                KEY `idx_last_attempt` (`last_attempt_at`),
                KEY `idx_locked_until` (`locked_until`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 3.11) g5_member_pref — 회원 locale / timezone 등 환경 설정
        // 클라이언트가 언어를 바꾸면 PATCH /v1/auth/preferences 로 동기 → 푸시 발송 시
        // 회원별로 알맞은 언어/타임존으로 본문 생성.
        // =====================================================================
        if (!webapp_table_exists($member_pref)) {
            sql_query("CREATE TABLE `{$member_pref}` (
                `mb_id`      VARCHAR(20) NOT NULL,
                `locale`     VARCHAR(10) NOT NULL DEFAULT 'ko',
                `tz`         VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
                `notify_comment` TINYINT(1) NOT NULL DEFAULT 1,
                `notify_reply`   TINYINT(1) NOT NULL DEFAULT 1,
                `notify_message` TINYINT(1) NOT NULL DEFAULT 1,
                `notify_inquiry` TINYINT(1) NOT NULL DEFAULT 1,
                `notify_system`  TINYINT(1) NOT NULL DEFAULT 1,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`mb_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }
        // 알림 수신 설정 — 이벤트별 푸시 on/off (plugin/webapp/notify/Prefs.php 가 읽고 쓴다). 기본 1 = 받음.
        // core 다섯 칸만. 제품 플러그인의 칸(notify_dday 등)은 그 플러그인의 admin_dbupgrade 가 더한다.
        $after = 'tz';
        foreach (array('notify_comment', 'notify_reply', 'notify_message', 'notify_inquiry', 'notify_system') as $flag) {
            if (webapp_table_exists($member_pref) && !webapp_column_exists($member_pref, $flag)) {
                sql_query("ALTER TABLE `{$member_pref}` ADD COLUMN `{$flag}` TINYINT(1) NOT NULL DEFAULT 1 AFTER `{$after}`", false);
                $changed = true;
            }
            $after = $flag;
        }

        // refresh 회전 체인(앱 SC-16) — 응답을 잃은 재시도를 60초 유예로 받으려고 후속 행 번호를 남긴다.
        if (webapp_table_exists($refresh_token) && !webapp_column_exists($refresh_token, 'replaced_by_token_id')) {
            sql_query("ALTER TABLE `{$refresh_token}` ADD COLUMN `replaced_by_token_id` INT NULL DEFAULT NULL AFTER `status`", false);
            $changed = true;
        }
        // 로그인 세션 번호 — 로그인 한 번 = 번호 하나, 회전해도 그대로. 액세스 토큰의 sid 와 /adm 세션이 이 번호로
        // "그 로그인이 아직 살아 있나"를 본다(세션 목록에서 로그아웃하면 그 자리에서 끊긴다).
        if (webapp_table_exists($refresh_token) && !webapp_column_exists($refresh_token, 'session_family')) {
            sql_query("ALTER TABLE `{$refresh_token}`
                       ADD COLUMN `session_family` INT NULL DEFAULT NULL AFTER `replaced_by_token_id`,
                       ADD KEY `idx_session_status` (`session_family`, `status`)", false);
            $changed = true;
        }
        // 서버가 끊은 토큰 표시(세션 목록 로그아웃·전체 로그아웃·비밀번호 변경). 끊긴 기기가 그 토큰을 다시 내미는 것은
        // 도난 재사용이 아니므로 거절만 한다 — 이 표시가 없으면 재사용 감지가 끊은 쪽 기기까지 모두 로그아웃시킨다.
        if (webapp_table_exists($refresh_token) && !webapp_column_exists($refresh_token, 'revoked_remotely')) {
            sql_query("ALTER TABLE `{$refresh_token}`
                       ADD COLUMN `revoked_remotely` TINYINT(1) NOT NULL DEFAULT 0 AFTER `revoked_at`", false);
            $changed = true;
        }
        // refresh_token 핫경로: WHERE mb_id = ? AND status = 'active' ORDER BY token_id DESC
        if (webapp_table_exists($refresh_token) && !webapp_index_exists($refresh_token, 'idx_mb_status_id')) {
            sql_query("ALTER TABLE `{$refresh_token}`
                       ADD KEY `idx_mb_status_id` (`mb_id`, `status`, `token_id`)", false);
            $changed = true;
        }
        // push_queue worker 핵심 쿼리: status='pending' AND next_attempt_at <= NOW()
        if (webapp_table_exists($push_queue) && !webapp_index_exists($push_queue, 'idx_pending_next')) {
            sql_query("ALTER TABLE `{$push_queue}`
                       ADD KEY `idx_pending_next` (`status`, `next_attempt_at`, `queue_id`)", false);
            $changed = true;
        }
        // 큐 행 → 알림함 행. 제목·본문을 기기 수만큼 복제하지 않고 nt_id 로 가리킨다.
        if (webapp_table_exists($push_queue) && !webapp_column_exists($push_queue, 'nt_id')) {
            sql_query("ALTER TABLE `{$push_queue}`
                       ADD COLUMN `nt_id` INT UNSIGNED NULL DEFAULT NULL AFTER `mb_id`,
                       ADD KEY `idx_nt_id` (`nt_id`)", false);
            $changed = true;
        }
        if (webapp_table_exists($push_queue) && webapp_column_exists($push_queue, 'dday_id')) {
            webapp_fold_column_into_json($push_queue, 'queue_id', 'dday_id', 'nt_data');
            sql_query("ALTER TABLE `{$push_queue}` DROP COLUMN `dday_id`", false);
            $changed = true;
        }
        if (webapp_table_exists($push_queue) && webapp_column_default($push_queue, 'nt_type') === 'dday') {
            sql_query("ALTER TABLE `{$push_queue}` MODIFY COLUMN `nt_type` VARCHAR(20) NOT NULL DEFAULT 'custom'", false);
            $changed = true;
        }

        // =====================================================================
        // 4) g5_social_mobile_ticket — 모바일 소셜 로그인 brige (one-time ticket)
        // =====================================================================
        if (!webapp_table_exists($social_mobile_ticket)) {
            sql_query("CREATE TABLE `{$social_mobile_ticket}` (
                `ticket_id`  INT PRIMARY KEY AUTO_INCREMENT,
                `ticket`     VARCHAR(64) NOT NULL,
                `mb_id`      VARCHAR(20) NOT NULL,
                `provider`   VARCHAR(30) NOT NULL DEFAULT '',
                `expires_at` DATETIME NOT NULL,
                `used_at`    DATETIME NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_ticket` (`ticket`),
                INDEX `idx_expires` (`expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 4.1) g5_social_signup_ticket — Next.js 소셜 신규가입 bridge
        // =====================================================================
        if (!webapp_table_exists($social_signup_ticket)) {
            sql_query("CREATE TABLE `{$social_signup_ticket}` (
                `ticket_id` INT NOT NULL AUTO_INCREMENT,
                `ticket` VARCHAR(64) NOT NULL,
                `provider` VARCHAR(30) NOT NULL DEFAULT '',
                `identifier` VARCHAR(255) NOT NULL DEFAULT '',
                `profile_json` MEDIUMTEXT NOT NULL,
                `expires_at` DATETIME NOT NULL,
                `used_at` DATETIME NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`ticket_id`),
                UNIQUE KEY `uniq_ticket` (`ticket`),
                KEY `idx_provider_identifier` (`provider`, `identifier`),
                KEY `idx_expires` (`expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 3.12) g5_member_legal_consent — 약관·개인정보처리방침 동의 이력.
        // 회원당 여러 행(버전이 바뀔 때마다 새로 동의). 최신 행이 현재 상태. 스토어 심사·분쟁 대비 기록.
        // =====================================================================
        if (!webapp_table_exists($legal_consent)) {
            sql_query("CREATE TABLE `{$legal_consent}` (
                `lc_id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `mb_id`           VARCHAR(20) NOT NULL,
                `terms_version`   VARCHAR(32) NOT NULL DEFAULT '',
                `privacy_version` VARCHAR(32) NOT NULL DEFAULT '',
                `accepted_at`     DATETIME NOT NULL,
                `ip`              VARCHAR(45) NOT NULL DEFAULT '',
                `user_agent`      VARCHAR(255) NOT NULL DEFAULT '',
                `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`lc_id`),
                KEY `idx_mb_accepted` (`mb_id`, `accepted_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 4.2) g5_web_ticket — 앱에서 레거시 웹 페이지(현금영수증 발급 요청 등)를 열 때 쓰는 1회용 입장권.
        //      원문은 앱만 받고 표에는 SHA-256 만 남긴다. 60초·1회용·열 수 있는 경로 고정(api/v1/auth_web_ticket_route.php,
        //      plugin/webapp/bridge/enter.php).
        // =====================================================================
        $web_ticket = isset($g5['web_ticket_table']) ? $g5['web_ticket_table'] : '';
        if ($web_ticket !== '' && !webapp_table_exists($web_ticket)) {
            sql_query("CREATE TABLE `{$web_ticket}` (
                `wt_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `token_hash` CHAR(64) NOT NULL,
                `mb_id`      VARCHAR(20) NOT NULL DEFAULT '',
                `od_id`      VARCHAR(20) NOT NULL DEFAULT '',
                `target`     VARCHAR(255) NOT NULL,
                `expires_at` DATETIME NOT NULL,
                `used_at`    DATETIME NULL DEFAULT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`wt_id`),
                UNIQUE KEY `uniq_token_hash` (`token_hash`),
                KEY `idx_expires` (`expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 4.3) g5_social_apple_token — Sign in with Apple refresh_token (앱 SC-11, api/lib/AppleClient.php).
        //      키는 Apple sub 의 SHA-256, 토큰은 AES-256-GCM 암호문. 탈퇴 때 Apple 에 revoke 하고 지운다.
        // =====================================================================
        $apple_token = isset($g5['social_apple_token_table']) ? $g5['social_apple_token_table'] : '';
        if ($apple_token !== '' && !webapp_table_exists($apple_token)) {
            sql_query("CREATE TABLE `{$apple_token}` (
                `sub_hash`          CHAR(64) NOT NULL,
                `refresh_token_enc` TEXT NOT NULL,
                `created_at`        DATETIME NOT NULL,
                `updated_at`        DATETIME NOT NULL,
                PRIMARY KEY (`sub_hash`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 4.4) g5_member_public_key — 회원 공개 키(api/lib/member_key_helpers.php).
        //      주소(/members/{키}, /recent?mb={키})에 아이디 대신 쓰는 무작위 값. 회원마다 처음 필요할 때 한 줄 만든다.
        // =====================================================================
        $member_key = isset($g5['member_public_key_table']) ? $g5['member_public_key_table'] : '';
        if ($member_key !== '' && !webapp_table_exists($member_key)) {
            sql_query("CREATE TABLE `{$member_key}` (
                `mb_id`      VARCHAR(20) NOT NULL,
                `mk_key`     VARCHAR(20) NOT NULL,
                `created_at` DATETIME NOT NULL,
                PRIMARY KEY (`mb_id`),
                UNIQUE KEY `uniq_mk_key` (`mk_key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 4.5) g5_theme_setting — 테마 설정(plugin/webapp/theme-settings/settings.php).
        //      관리자 화면에서 정하는 왼쪽 메뉴 · 사이트 문구를 테마마다 한 줄(JSON)로. 저장할 때마다 변경 번호가 오른다.
        // =====================================================================
        $theme_setting = isset($g5['theme_setting_table']) ? $g5['theme_setting_table'] : '';
        if ($theme_setting !== '' && !webapp_table_exists($theme_setting)) {
            sql_query("CREATE TABLE `{$theme_setting}` (
                `ts_theme`      VARCHAR(40) NOT NULL,
                `ts_value`      MEDIUMTEXT NOT NULL,
                `ts_revision`   INT UNSIGNED NOT NULL DEFAULT 0,
                `ts_updated_at` DATETIME NULL DEFAULT NULL,
                `ts_updated_by` VARCHAR(20) NOT NULL DEFAULT '',
                PRIMARY KEY (`ts_theme`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 4.6) g5_editor_image — 웹 에디터로 올린 사진 대장(api/lib/editor-uploads.php).
        //      웹 에디터(글 · 댓글 · 상품 후기 · 상품 문의 · 1:1 문의)에서 올린 사진은 data/tmp/editor_upload/ 에 두었다가
        //      (ei_state 0) 그 글을 저장할 때 data/editor/<yymm>/ 으로 옮기고 그 글에 붙인다(1). 글을 지우면 붙은 사진도
        //      지운다(plugin/webapp/editor/events.php). 앱 · 그 밖의 바로 저장, 복사된 글이 함께 쓰는 사진은 2(지우지 않음).
        //      붙은 곳: ei_kind(write 게시판 글 · 댓글, item_use 상품 후기, item_qa 상품 문의, qa 1:1 문의) · bo_table(write 만)
        //      · ei_ref_id(wr_id · is_id · iq_id · qa_id) · ei_parent_id(글 번호 — 글을 지우면 그 댓글 사진까지 한 번에).
        //      ei_file 은 무작위 이름이라 본문 주소에서 바로 찾는다(UNIQUE). 경로는 G5_DATA_PATH 기준 상대 경로로 —
        //      서버를 옮기거나 하위 폴더에 설치해도 그대로 맞는다. ei_state · ei_datetime 은 오래된 임시 사진 정리.
        // =====================================================================
        $editor_image = isset($g5['editor_image_table']) ? $g5['editor_image_table'] : '';
        if ($editor_image !== '' && !webapp_table_exists($editor_image)) {
            sql_query("CREATE TABLE `{$editor_image}` (
                `ei_id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `ei_file`        VARCHAR(64) NOT NULL,
                `ei_dir`         VARCHAR(64) NOT NULL,
                `ei_state`       TINYINT UNSIGNED NOT NULL DEFAULT 0,
                `mb_id`          VARCHAR(20) NOT NULL DEFAULT '',
                `ei_kind`        VARCHAR(16) NOT NULL DEFAULT '',
                `bo_table`       VARCHAR(20) NOT NULL DEFAULT '',
                `ei_ref_id`      INT UNSIGNED NOT NULL DEFAULT 0,
                `ei_parent_id`   INT UNSIGNED NOT NULL DEFAULT 0,
                `ei_source`      VARCHAR(255) NOT NULL DEFAULT '',
                `ei_mime`        VARCHAR(32) NOT NULL DEFAULT '',
                `ei_size`        INT UNSIGNED NOT NULL DEFAULT 0,
                `ei_width`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                `ei_height`      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                `ei_ip`          VARCHAR(45) NOT NULL DEFAULT '',
                `ei_datetime`    DATETIME NOT NULL,
                `ei_attached_at` DATETIME NULL DEFAULT NULL,
                PRIMARY KEY (`ei_id`),
                UNIQUE KEY `uniq_editor_image_file` (`ei_file`),
                KEY `idx_editor_image_ref` (`ei_kind`, `bo_table`, `ei_ref_id`),
                KEY `idx_editor_image_parent` (`ei_kind`, `bo_table`, `ei_parent_id`),
                KEY `idx_editor_image_state` (`ei_state`, `ei_datetime`),
                KEY `idx_editor_image_member` (`mb_id`, `ei_datetime`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
            $changed = true;
        }

        // =====================================================================
        // 5) g5_shop_order — 주문 상태 푸시 발송 표식 (앱 SC-07, api/v1/shop/order_push_helpers.php)
        //    관리자 화면에서 바뀐 무통장 입금·배송을 한 번만 알리려고 보낸 시각을 남긴다.
        //    쇼핑몰이 없는 설치본은 건너뛴다.
        // =====================================================================
        $shop_order = isset($g5['g5_shop_order_table']) ? $g5['g5_shop_order_table'] : '';
        if ($shop_order !== '' && webapp_table_exists($shop_order)) {
            $push_columns = array(
                'od_push_paid_at'    => array('idx_paid_push', 'od_status, od_push_paid_at, od_receipt_time'),
                'od_push_shipped_at' => array('idx_shipped_push', 'od_status, od_push_shipped_at, od_invoice_time'),
            );
            foreach ($push_columns as $column => $index) {
                if (!webapp_column_exists($shop_order, $column)) {
                    sql_query("ALTER TABLE `{$shop_order}` ADD COLUMN `{$column}` DATETIME NULL DEFAULT NULL", false);
                    $changed = true;
                }
                if (!webapp_index_exists($shop_order, $index[0])) {
                    sql_query("ALTER TABLE `{$shop_order}` ADD KEY `{$index[0]}` ({$index[1]})", false);
                    $changed = true;
                }
            }
        }

        // 에디터 이미지 옆의 예전 정보 파일(.meta.json — 웹에서 그대로 열렸다)을 .meta.php 로 옮긴다.
        if (webapp_migrate_editor_meta(2000) > 0) {
            $changed = true;
        }

        // 실제 변경이 일어났을 때만 true 로 전환. 이전 훅 결과($is_check)는 보존.
        return $changed ? true : $is_check;
    }
}

if (!function_exists('webapp_migrate_editor_meta')) {
    /**
     * data/editor/<yymm>/<그림>.meta.json(올린 사람 HMAC · 올린 시각, 웹에서 그대로 열렸다)을 같은 내용의
     * <그림>.meta.php(맨 앞 exit — api/v1/upload.php 와 같은 머리말)로 옮긴다. 한 번에 $limit 개까지 — 남으면 다음
     * DB 업그레이드(관리자 화면 · 스키마 자가 점검) 때 이어서 옮긴다.
     *
     * @return int 옮기거나 지운 예전 파일 수
     */
    function webapp_migrate_editor_meta(int $limit = 2000): int
    {
        if (!defined('G5_DATA_PATH') || $limit <= 0) {
            return 0;
        }
        if (!defined('API_UPLOAD_META_GUARD')) {
            define('API_UPLOAD_META_GUARD', "<?php exit; ?>\n");
        }

        $done = 0;
        foreach (glob(G5_DATA_PATH . '/editor/*', GLOB_ONLYDIR) ?: array() as $dir) {
            foreach (glob($dir . '/*.meta.json') ?: array() as $legacy) {
                if ($done >= $limit) {
                    return $done;
                }
                $target = substr($legacy, 0, -strlen('.meta.json')) . '.meta.php';
                if (!is_file($target)) {
                    // 읽지 못했거나 새 파일을 쓰지 못했으면 예전 파일을 남긴다(지우면 올린 사람 정보를 잃는다).
                    // 빈 파일은 옮길 것이 없으니 지운다.
                    $raw = @file_get_contents($legacy);
                    if (!is_string($raw)) {
                        continue;
                    }
                    if ($raw !== '' && @file_put_contents($target, API_UPLOAD_META_GUARD . $raw, LOCK_EX) === false) {
                        continue;
                    }
                }
                @unlink($legacy);
                $done++;
            }
        }

        return $done;
    }
}
