<?php
/**
 * 소셜 가입 도우미 — 가입 티켓 읽기, 소셜 프로필에서 회원 아이디 · 닉네임 제안.
 * auth_helpers.php 가 읽는다(파일 크기 기준에 맞춰 떼어 냄).
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('api_social_signup_ticket_row')) {
    function api_social_signup_ticket_row($ticket)
    {
        $ticket = trim((string) $ticket);
        if ($ticket === '' || !preg_match('/^[a-f0-9]{32,128}$/i', $ticket)) {
            return null;
        }

        nextjs25_social_ensure_signup_ticket_table();
        $ticketTable = nextjs25_social_signup_ticket_table();

        return DB::fetch(
            "SELECT ticket_id, ticket, provider, code_challenge, identifier, profile_json, expires_at, used_at
             FROM {$ticketTable}
             WHERE ticket = ? LIMIT 1",
            [$ticket]
        );
    }
}

if (!function_exists('api_social_signup_profile_from_row')) {
    function api_social_signup_profile_from_row(array $row)
    {
        $profile = json_decode((string) $row['profile_json'], true);
        return is_array($profile) ? $profile : array();
    }
}

if (!function_exists('api_social_normalize_member_id')) {
    function api_social_normalize_member_id($value, $provider = 'social')
    {
        $value = strtolower((string) $value);
        $value = preg_replace('/[^0-9a-z_]+/i', '_', $value);
        $value = trim($value, '_');

        if ($value === '' || strlen($value) < 3) {
            $value = strtolower((string) $provider) . '_' . substr(bin2hex(random_bytes(4)), 0, 8);
        }

        return substr($value, 0, 20);
    }
}

if (!function_exists('api_social_unique_member_id')) {
    function api_social_unique_member_id($base)
    {
        $base = api_social_normalize_member_id($base);
        $memberTable = DB::table('member_table');
        $candidate = $base;

        for ($i = 0; $i < 100; $i++) {
            $exists = DB::fetch("SELECT mb_id FROM {$memberTable} WHERE mb_id = ? LIMIT 1", [$candidate]);
            if (!$exists) {
                return $candidate;
            }

            $suffix = (string) ($i + 1);
            $candidate = substr($base, 0, 20 - strlen($suffix)) . $suffix;
        }

        return substr($base, 0, 12) . substr(bin2hex(random_bytes(4)), 0, 8);
    }
}

if (!function_exists('api_social_suggest_member_id')) {
    function api_social_suggest_member_id(array $profile)
    {
        $provider = isset($profile['provider']) ? (string) $profile['provider'] : 'social';
        $base = '';

        if (!empty($profile['sid'])) {
            $base = preg_replace('/[^0-9a-z_]+/i', '', (string) $profile['sid']);
        }
        if ($base === '' && !empty($profile['email'])) {
            $base = (string) strtok((string) $profile['email'], '@');
        }
        if ($base === '' && !empty($profile['identifier'])) {
            $base = $provider . '_' . substr(sha1((string) $profile['identifier']), 0, 10);
        }

        $base = api_social_normalize_member_id($base, $provider);
        return api_social_unique_member_id($base);
    }
}

if (!function_exists('api_social_truncate_nick')) {
    function api_social_truncate_nick($nick, $maxLength = 20)
    {
        return function_exists('mb_substr')
            ? mb_substr((string) $nick, 0, $maxLength, 'UTF-8')
            : substr((string) $nick, 0, $maxLength);
    }
}

if (!function_exists('api_social_unique_nick')) {
    function api_social_unique_nick($nick)
    {
        $nick = trim(strip_tags((string) $nick));
        if ($nick === '') {
            $nick = '소셜회원';
        }

        $base = api_social_truncate_nick($nick, 20);
        $memberTable = DB::table('member_table');
        $candidate = $base;

        for ($i = 0; $i < 100; $i++) {
            $exists = DB::fetch("SELECT mb_id FROM {$memberTable} WHERE mb_nick = ? LIMIT 1", [$candidate]);
            if (!$exists) {
                return $candidate;
            }

            $suffix = (string) ($i + 1);
            $candidate = api_social_truncate_nick($base, 20 - strlen($suffix)) . $suffix;
        }

        return api_social_truncate_nick($base, 12) . substr(bin2hex(random_bytes(4)), 0, 8);
    }
}

if (!function_exists('api_social_suggest_nick')) {
    function api_social_suggest_nick(array $profile)
    {
        $nick = '';
        if (!empty($profile['displayName'])) {
            $nick = (string) $profile['displayName'];
        } elseif (!empty($profile['email'])) {
            $nick = (string) strtok((string) $profile['email'], '@');
        } elseif (!empty($profile['provider'])) {
            $nick = nextjs25_social_provider_label((string) $profile['provider']) . '회원';
        }

        $nick = trim(strip_tags($nick));
        if (function_exists('social_relace_nick')) {
            $nick = social_relace_nick($nick);
        }
        // 가입 검사(api_member_nick_is_valid)를 통과하는 글자만 — 이모지 · 기호가 남으면 제안한 닉네임으로 가입이 막힌다.
        $nick = (string) preg_replace('/[^가-힣A-Za-z0-9]/u', '', $nick);
        if (function_exists('mb_strlen') && mb_strlen($nick, 'UTF-8') < 2) {
            $nick = '소셜회원';
        }

        return api_social_unique_nick($nick);
    }
}
