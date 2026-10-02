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
    /**
     * 표 이름. 확장이 표를 등록하지 않았거나, 이 요청에서 표가 없다고 확인됐으면 ''.
     * 요청마다 information_schema 를 보지 않는다 — 쿼리가 "표 없음"으로 실패하면 그때 기억한다
     * (api_member_key_query). 표는 Schema::ensure() 가 설치기로 만든다.
     */
    function api_member_key_table(): string
    {
        global $g5;
        $name = isset($g5['member_public_key_table']) ? (string) $g5['member_public_key_table'] : '';
        return ($name === '' || !empty($GLOBALS['api_member_key_missing'][$name])) ? '' : $name;
    }
}

if (!function_exists('api_member_key_query')) {
    /**
     * 키 표에 대고 쿼리를 돌린다. 표가 없으면(확장만 올리고 설치기를 아직 안 돌린 설치본) 이 요청 동안 '없음'으로
     * 기억하고 null — 부르는 쪽은 예전 주소(아이디)로 물러선다. 그 밖의 DB 오류는 그대로 던진다.
     *
     * @return mixed|null
     */
    function api_member_key_query(string $table, callable $query)
    {
        try {
            return $query($table);
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '42S02') { // Base table or view not found
                $GLOBALS['api_member_key_missing'][$table] = true;
                return null;
            }
            throw $e;
        }
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

if (!function_exists('api_member_key_is_stale')) {
    /**
     * 키가 지금 회원보다 먼저 만들어졌나 — 회원 줄을 DB 에서 지운 뒤 같은 아이디로 새로 가입하면 예전 키가
     * 새 사람을 가리키게 된다(그누보드 탈퇴 · 삭제는 줄을 남겨 아이디를 다시 못 쓰게 하지만, 줄을 직접 지우면 생긴다).
     * 가입 시각(mb_datetime)이 키를 만든 시각보다 나중이면 다른 사람이다. 가입 시각이 비었으면 판단하지 않는다.
     */
    function api_member_key_is_stale(array $row): bool
    {
        $joined = (string) ($row['mb_datetime'] ?? '');
        $created = (string) ($row['created_at'] ?? '');
        if ($joined === '' || strpos($joined, '0000-00-00') === 0 || $created === '') {
            return false;
        }
        return strcmp($joined, $created) > 0;
    }
}

if (!function_exists('api_member_public_key')) {
    /**
     * 회원의 공개 키. 없으면 만든다(있는 회원일 때만 부른다). 예전 회원의 키가 남아 있으면 지우고 새로 만든다.
     * 표가 없으면 ''.
     */
    function api_member_public_key(string $mb_id): string
    {
        $table = api_member_key_table();
        if ($table === '' || !api_is_member_id_format($mb_id)) {
            return '';
        }
        $memberTable = DB::table('member_table');
        $current = static function (string $table) use ($mb_id, $memberTable) {
            return DB::fetch(
                "SELECT k.mk_key, k.created_at, m.mb_datetime
                   FROM {$table} k JOIN {$memberTable} m ON m.mb_id = k.mb_id
                  WHERE k.mb_id = ? LIMIT 1",
                [$mb_id]
            );
        };

        $row = api_member_key_query($table, $current);
        if ($row === null && api_member_key_table() === '') {
            return '';
        }
        if (!empty($row['mk_key']) && !api_member_key_is_stale($row)) {
            return (string) $row['mk_key'];
        }
        if (!empty($row['mk_key'])) {
            DB::execute("DELETE FROM {$table} WHERE mb_id = ? AND mk_key = ?", [$mb_id, (string) $row['mk_key']]);
        }

        // 두 요청이 같은 회원 키를 함께 만들면 먼저 들어간 것이 남는다(INSERT IGNORE). 키가 겹치면 새로 뽑는다.
        for ($try = 0; $try < 3; $try++) {
            DB::execute(
                "INSERT IGNORE INTO {$table} (mb_id, mk_key, created_at) VALUES (?, ?, ?)",
                [$mb_id, api_member_new_key(), date('Y-m-d H:i:s')]
            );
            $row = $current($table);
            if (!empty($row['mk_key'])) {
                return (string) $row['mk_key'];
            }
        }
        return '';
    }
}

if (!function_exists('api_member_id_from_key')) {
    /** 공개 키 → 회원 아이디. 없거나 예전 회원의 키(같은 아이디로 새로 가입)면 ''. */
    function api_member_id_from_key(string $key): string
    {
        $table = api_member_key_table();
        if ($table === '' || !api_is_member_key($key)) {
            return '';
        }
        $memberTable = DB::table('member_table');
        $row = api_member_key_query($table, static function (string $table) use ($key, $memberTable) {
            return DB::fetch(
                "SELECT k.mb_id, k.mk_key, k.created_at, m.mb_datetime
                   FROM {$table} k JOIN {$memberTable} m ON m.mb_id = k.mb_id
                  WHERE k.mk_key = ? LIMIT 1",
                [$key]
            );
        });
        // 표의 정렬 규칙이 대소문자를 가리지 않아 'abc…' 로도 'ABC…' 가 찾아진다. 같은 회원 주소가 여러 모양이 되지 않게
        // 글자 하나하나까지 같을 때만 받는다.
        if (!isset($row['mb_id'], $row['mk_key']) || !hash_equals((string) $row['mk_key'], $key) || api_member_key_is_stale($row)) {
            return '';
        }
        return (string) $row['mb_id'];
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
