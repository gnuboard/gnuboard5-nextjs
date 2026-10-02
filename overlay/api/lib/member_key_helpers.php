<?php
/**
 * 회원 공개 키 — 주소(/members/{키}, /recent?mb={키})에 회원 아이디 대신 쓰는 무작위 값.
 *
 * 아이디는 로그인 계정이라 주소에 그대로 두면 검색엔진 · 링크로 퍼진다. 그래서 회원마다 처음 필요할 때
 * 무작위 키를 하나 만들어 member_public_key 표(plugin/webapp/notify/tables.php)에 남기고 주소에는 그 키만 쓴다.
 *  - 암호문이 아니라 무작위 값이라 키에서 아이디를 계산해 낼 길이 없다(그누보드 str_encrypt 는 아이디 하나와
 *    그 암호문만 알면 다른 회원 것까지 풀린다).
 *  - 서버 · 설정이 바뀌어도 키는 그대로라 주소가 깨지지 않는다.
 *  - 모양은 7자-7자(영숫자 사이에 하이픈). 아이디에는 하이픈이 올 수 없어 예전 주소(/members/아이디)와 섞이지 않는다.
 * 표가 없는 설치본(확장 미설치)에서는 키를 만들지 못하고 빈 값을 돌려준다 — 부르는 쪽이 예전 주소로 물러선다.
 */

if (!defined('_GNUBOARD_')) exit;

if (!function_exists('api_is_member_key')) {
    function api_is_member_key(string $value): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9]{7}-[A-Za-z0-9]{7}$/', $value);
    }
}

if (!function_exists('api_is_member_id_format')) {
    /** 그누보드 회원 아이디 모양(영문 · 숫자 · _ , 20자 이내). */
    function api_is_member_id_format(string $value): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_]{1,20}$/', $value);
    }
}

if (!function_exists('api_member_key_table')) {
    /** 표 이름. 확장이 표를 등록하지 않았거나 아직 만들지 않았으면 ''. */
    function api_member_key_table(): string
    {
        global $g5;
        static $table = null;
        if ($table !== null) {
            return $table;
        }
        $name = isset($g5['member_public_key_table']) ? (string) $g5['member_public_key_table'] : '';
        if ($name !== '') {
            try {
                $exists = DB::fetch(
                    'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
                    [$name]
                );
                $name = $exists ? $name : '';
            } catch (Throwable $e) {
                $name = '';
            }
        }
        return $table = $name;
    }
}

if (!function_exists('api_member_new_key')) {
    function api_member_new_key(): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        $out = '';
        for ($i = 0; $i < 14; $i++) {
            $out .= $alphabet[random_int(0, 61)];
        }
        return substr($out, 0, 7) . '-' . substr($out, 7);
    }
}

if (!function_exists('api_member_public_key')) {
    /**
     * 회원의 공개 키. 없으면 만든다(있는 회원일 때만 부른다). 표가 없으면 ''.
     */
    function api_member_public_key(string $mb_id): string
    {
        $table = api_member_key_table();
        if ($table === '' || !api_is_member_id_format($mb_id)) {
            return '';
        }

        $row = DB::fetch("SELECT mk_key FROM {$table} WHERE mb_id = ? LIMIT 1", [$mb_id]);
        if (!empty($row['mk_key'])) {
            return (string) $row['mk_key'];
        }

        // 두 요청이 같은 회원 키를 함께 만들면 먼저 들어간 것이 남는다(INSERT IGNORE). 키가 겹치면 새로 뽑는다.
        for ($try = 0; $try < 3; $try++) {
            DB::execute(
                "INSERT IGNORE INTO {$table} (mb_id, mk_key, created_at) VALUES (?, ?, ?)",
                [$mb_id, api_member_new_key(), date('Y-m-d H:i:s')]
            );
            $row = DB::fetch("SELECT mk_key FROM {$table} WHERE mb_id = ? LIMIT 1", [$mb_id]);
            if (!empty($row['mk_key'])) {
                return (string) $row['mk_key'];
            }
        }
        return '';
    }
}

if (!function_exists('api_member_id_from_key')) {
    /** 공개 키 → 회원 아이디. 없으면 ''. */
    function api_member_id_from_key(string $key): string
    {
        $table = api_member_key_table();
        if ($table === '' || !api_is_member_key($key)) {
            return '';
        }
        $row = DB::fetch("SELECT mb_id FROM {$table} WHERE mk_key = ? LIMIT 1", [$key]);
        return isset($row['mb_id']) ? (string) $row['mb_id'] : '';
    }
}

if (!function_exists('api_member_id_from_ref')) {
    /**
     * 주소에 온 회원 값(공개 키, 또는 예전 주소의 아이디) → 회원 아이디. 알아볼 수 없으면 ''.
     */
    function api_member_id_from_ref(string $ref): string
    {
        if (api_is_member_key($ref)) {
            return api_member_id_from_key($ref);
        }
        return api_is_member_id_format($ref) ? $ref : '';
    }
}
