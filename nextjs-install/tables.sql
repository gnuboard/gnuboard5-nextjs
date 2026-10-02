-- gnuboard5-nextjs runtime tables (generated from plugin/webapp/notify/tables.php — do not edit).
--
-- Preferred: open /adm/dbupgrade.php as the super admin. The core registers an
-- idempotent admin_dbupgrade migration that creates and upgrades these tables.
-- Use this file only when that is not possible. Default Gnuboard installations
-- use the `g5_` table prefix; replace it first if yours differs.

CREATE TABLE IF NOT EXISTS `g5_push_token` (
    `token_id` INT PRIMARY KEY AUTO_INCREMENT,
    `mb_id` VARCHAR(20) NOT NULL,
    `push_token` VARCHAR(255) NOT NULL,
    `platform` ENUM('android','ios','web') NOT NULL DEFAULT 'android',
    `last_used_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_token` (`push_token`),
    INDEX `idx_mb_id` (`mb_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_notification_log` (
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
    KEY `idx_device_sent` (`device_id`, `nt_sent_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_device` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_push_queue` (
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
    KEY `idx_pending_next` (`status`, `next_attempt_at`, `queue_id`),
    KEY `idx_claim_token` (`claim_token`),
    KEY `idx_mb_id` (`mb_id`),
    KEY `idx_nt_id` (`nt_id`),
    KEY `idx_processed_at` (`processed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_refresh_token` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_content_report` (
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
    UNIQUE KEY `uniq_one_per_reporter` (`target_type`, `target_key`, `reporter_mb`, `reporter_dev`),
    KEY `idx_target_status` (`target_type`, `target_key`, `status`),
    KEY `idx_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_member_block` (
    `block_id`      INT PRIMARY KEY AUTO_INCREMENT,
    `mb_id`         VARCHAR(20) NOT NULL,
    `blocked_key`   VARCHAR(128) NOT NULL,
    `blocked_label` VARCHAR(100) NOT NULL DEFAULT '',
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_mb_block` (`mb_id`, `blocked_key`),
    KEY `idx_mb_created` (`mb_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_account_deletion_request` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_login_attempt` (
    `attempt_id`     INT PRIMARY KEY AUTO_INCREMENT,
    `mb_id`          VARCHAR(64) NOT NULL,
    `ip`             VARCHAR(45) NOT NULL,
    `fail_count`     INT NOT NULL DEFAULT 0,
    `locked_until`   DATETIME NULL DEFAULT NULL,
    `last_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_mb_ip` (`mb_id`, `ip`),
    KEY `idx_last_attempt` (`last_attempt_at`),
    KEY `idx_locked_until` (`locked_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_member_pref` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_social_mobile_ticket` (
    `ticket_id`  INT PRIMARY KEY AUTO_INCREMENT,
    `ticket`     VARCHAR(64) NOT NULL,
    `mb_id`      VARCHAR(20) NOT NULL,
    `provider`   VARCHAR(30) NOT NULL DEFAULT '',
    `expires_at` DATETIME NOT NULL,
    `used_at`    DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_ticket` (`ticket`),
    INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_social_signup_ticket` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_member_legal_consent` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_web_ticket` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `g5_social_apple_token` (
    `sub_hash`          CHAR(64) NOT NULL,
    `refresh_token_enc` TEXT NOT NULL,
    `created_at`        DATETIME NOT NULL,
    `updated_at`        DATETIME NOT NULL,
    PRIMARY KEY (`sub_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
