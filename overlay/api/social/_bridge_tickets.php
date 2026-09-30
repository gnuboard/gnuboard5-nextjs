<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * 소셜 로그인 ticket — 테이블 보장, 발급, PKCE 바인딩.
 *
 * _bridge_common.php 가 require 하므로 그 파일을 include 하는 곳(start/popup/signup/
 * finish, api/v1/auth.php, members.php)에서는 모두 쓸 수 있다. 함수는 전부
 * function_exists 가드라 중복 include 에 안전하다.
 */

if (!function_exists('nextjs25_social_signup_ticket_table')) {
    function nextjs25_social_signup_ticket_table()
    {
        return G5_TABLE_PREFIX . 'social_signup_ticket';
    }
}

if (!function_exists('nextjs25_social_ensure_signup_ticket_table')) {
    function nextjs25_social_ensure_signup_ticket_table()
    {
        $table = nextjs25_social_signup_ticket_table();
        sql_query("CREATE TABLE IF NOT EXISTS `{$table}` (
            `ticket_id` INT NOT NULL AUTO_INCREMENT,
            `ticket` VARCHAR(64) NOT NULL,
            `provider` VARCHAR(30) NOT NULL DEFAULT '',
            `code_challenge` VARCHAR(64) NOT NULL DEFAULT '',
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
        // 아래쪽에 정의된 함수지만 PHP 는 호출 시점에만 찾으므로 문제 없다.
        nextjs25_social_ensure_ticket_code_challenge_column($table);
    }
}

// -------------------------------------------------------------------------
// PKCE (RFC 7636, S256) — 모바일 커스텀 스킴 콜백 가로채기 대응.
//
// Android 의 커스텀 URI 스킴(dday-app://)은 https App Link 와 달리 소유권 검증이
// 없어, 같은 스킴을 선언한 다른 앱이 콜백을 받아 URL 의 ticket 을 그대로 얻을 수
// 있다. 그래서 앱이 start.php 에 code_challenge 를 보내면 발급하는 ticket(로그인
// ticket · 가입 ticket 모두)에 묶어 두고, ticket 을 쓰는 모든 곳(exchange · 탈퇴
// 재인증 · 가입 프로필 조회 · 가입/연결)에서 code_verifier 를 요구한다. 콜백 URL 만
// 가로챈 쪽은 verifier 가 없어 ticket 을 쓸 수 없다.
//
// challenge 없이 발급된 ticket(Next.js 웹 테마, 구버전 앱)은 종전처럼 verifier
// 없이 통과한다. 묶을지 여부는 발급 시점에 정해지므로 공격자가 낮출 수 없다.
// -------------------------------------------------------------------------
if (!function_exists('nextjs25_social_normalize_code_challenge')) {
    function nextjs25_social_normalize_code_challenge($value)
    {
        $value = trim((string) $value);
        // base64url(SHA-256) 은 패딩 없이 정확히 43자.
        return preg_match('/^[A-Za-z0-9_-]{43}$/', $value) ? $value : '';
    }
}

if (!function_exists('nextjs25_social_normalize_code_verifier')) {
    function nextjs25_social_normalize_code_verifier($value)
    {
        $value = trim((string) $value);
        return preg_match('/^[A-Za-z0-9._~-]{43,128}$/', $value) ? $value : '';
    }
}

if (!function_exists('nextjs25_social_code_challenge_matches')) {
    function nextjs25_social_code_challenge_matches($challenge, $verifier)
    {
        $challenge = nextjs25_social_normalize_code_challenge($challenge);
        $verifier = nextjs25_social_normalize_code_verifier($verifier);
        if ($challenge === '' || $verifier === '') {
            return false;
        }

        $computed = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        return hash_equals($challenge, $computed);
    }
}

/**
 * ticket 에 challenge 가 묶여 있으면 verifier 가 맞아야 true, 묶여 있지 않으면 true.
 */
if (!function_exists('nextjs25_social_ticket_verifier_ok')) {
    function nextjs25_social_ticket_verifier_ok($storedChallenge, $verifier)
    {
        $storedChallenge = trim((string) $storedChallenge);
        if ($storedChallenge === '') {
            return true;
        }

        return nextjs25_social_code_challenge_matches($storedChallenge, $verifier);
    }
}

/** start.php 가 세션에 넣어 둔 이번 로그인 시도의 challenge. 없으면 ''. */
if (!function_exists('nextjs25_social_session_code_challenge')) {
    function nextjs25_social_session_code_challenge()
    {
        if (!function_exists('get_session')) {
            return '';
        }

        return nextjs25_social_normalize_code_challenge(get_session('mobile_oauth_code_challenge'));
    }
}

/** 이미 만들어진 설치본의 ticket 테이블에 code_challenge 컬럼이 없으면 추가한다. */
if (!function_exists('nextjs25_social_ensure_ticket_code_challenge_column')) {
    function nextjs25_social_ensure_ticket_code_challenge_column($table)
    {
        static $checked = array();
        if (isset($checked[$table])) {
            return;
        }
        $checked[$table] = true;

        $column = sql_fetch("SHOW COLUMNS FROM `{$table}` LIKE 'code_challenge'", false);
        if (!$column) {
            sql_query(
                "ALTER TABLE `{$table}` ADD COLUMN `code_challenge` VARCHAR(64) NOT NULL DEFAULT '' AFTER `provider`",
                false
            );
        }
    }
}

if (!function_exists('nextjs25_social_ensure_mobile_ticket_table')) {
    function nextjs25_social_ensure_mobile_ticket_table()
    {
        $table = G5_TABLE_PREFIX . 'social_mobile_ticket';
        sql_query("CREATE TABLE IF NOT EXISTS `{$table}` (
            `ticket_id`  INT PRIMARY KEY AUTO_INCREMENT,
            `ticket`     VARCHAR(64) NOT NULL,
            `mb_id`      VARCHAR(20) NOT NULL,
            `provider`   VARCHAR(30) NOT NULL DEFAULT '',
            `code_challenge` VARCHAR(64) NOT NULL DEFAULT '',
            `expires_at` DATETIME NOT NULL,
            `used_at`    DATETIME NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY `uniq_ticket` (`ticket`),
            INDEX `idx_expires` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", false);
        nextjs25_social_ensure_ticket_code_challenge_column($table);
    }
}

if (!function_exists('nextjs25_social_issue_mobile_ticket')) {
    function nextjs25_social_issue_mobile_ticket($mbId, $providerName, $codeChallenge = '')
    {
        if ((string) $mbId === '') {
            return '';
        }

        nextjs25_social_ensure_mobile_ticket_table();

        $ticket = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 300);
        $table = G5_TABLE_PREFIX . 'social_mobile_ticket';
        $codeChallenge = nextjs25_social_normalize_code_challenge($codeChallenge);

        sql_query(
            "INSERT INTO `{$table}` (ticket, mb_id, provider, code_challenge, expires_at)
             VALUES (
                '" . sql_real_escape_string($ticket) . "',
                '" . sql_real_escape_string((string) $mbId) . "',
                '" . sql_real_escape_string(strtolower((string) $providerName)) . "',
                '" . sql_real_escape_string($codeChallenge) . "',
                '" . sql_real_escape_string($expiresAt) . "'
             )",
            false
        );

        return $ticket;
    }
}
