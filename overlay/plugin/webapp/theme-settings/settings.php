<?php
/**
 * 테마 설정 — 관리자가 화면에서 정하는 값(코드를 고치거나 다시 빌드하지 않고 바꾼다).
 *
 *   docs.group        매뉴얼로 쓰는 게시판 그룹 ID(그 그룹의 게시판 하나 = 매뉴얼 한 권)
 *   docs.hints        매뉴얼(게시판)별 안내 문구 — 비면 게시판 제목의 "안내 · 이름"에서 읽는다
 *   sidebar.<화면>    화면 유형(home · docs · board · other)별 왼쪽 사이드바 — auto(화면에 맞게) · hidden(숨김)
 *   site.*            사이트 이름 · 소개 · 바닥글 · 고객센터 문구 — 비면 테마 기본값
 *
 * 매뉴얼 순서 · 이름은 여기 두지 않는다 — 게시판의 출력 순서(bo_order) · 제목이 기준이다(관리자 화면은 그 값을 고친다).
 * 메뉴 항목은 메뉴설정(g5_menu)이 기준이다. 저장할 때마다 변경 번호(revision)가 올라, 브라우저가 들고 있던 목차를 버린다.
 * 공개 값(webapp_theme_settings_public)은 /v1/settings 와 테마 브리지의 런타임 설정으로 나간다 — 비밀값을 두지 않는다.
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('webapp_theme_settings_table')) {
    function webapp_theme_settings_table(): string
    {
        global $g5;
        return isset($g5['theme_setting_table']) ? (string) $g5['theme_setting_table'] : G5_TABLE_PREFIX . 'theme_setting';
    }
}

if (!function_exists('webapp_theme_settings_defaults')) {
    /** 빈 문자열 · 빈 목록은 "테마 기본값을 쓴다"는 뜻이다. */
    function webapp_theme_settings_defaults(): array
    {
        return [
            'docs' => ['group' => '', 'hints' => []],
            'sidebar' => ['home' => 'auto', 'docs' => 'auto', 'board' => 'auto', 'other' => 'auto'],
            'site' => [
                'name' => '',
                'logoText' => '',
                'description' => '',
                'homeTitle' => '',
                'homeDescription' => '',
                'footerDescription' => '',
                'customerCenterTitle' => '',
                'customerCenterLines' => [],
                'copyrightName' => '',
            ],
        ];
    }
}

if (!function_exists('webapp_theme_settings_text')) {
    /** 한 줄 글 — 태그와 제어 문자를 지우고 줄바꿈을 공백으로, 앞뒤 공백을 걷어 $max 자까지. */
    function webapp_theme_settings_text($value, int $max): string
    {
        if (!is_scalar($value)) {
            return '';
        }
        $text = strip_tags((string) $value);
        $text = (string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $text);
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));
        return function_exists('mb_substr') ? mb_substr($text, 0, $max, 'UTF-8') : substr($text, 0, $max);
    }
}

if (!function_exists('webapp_theme_settings_normalize')) {
    /** 들어온 값(폼 · 저장된 JSON)을 알려진 칸만 남겨 정리한다. 모르는 칸은 버리고, 틀린 값은 기본값으로 둔다. */
    function webapp_theme_settings_normalize($input): array
    {
        $input = is_array($input) ? $input : [];
        $out = webapp_theme_settings_defaults();

        $docs = isset($input['docs']) && is_array($input['docs']) ? $input['docs'] : [];
        $group = isset($docs['group']) && is_scalar($docs['group']) ? trim((string) $docs['group']) : '';
        $out['docs']['group'] = preg_match('/^[A-Za-z0-9_]{1,10}$/', $group) ? $group : '';
        $hints = isset($docs['hints']) && is_array($docs['hints']) ? $docs['hints'] : [];
        foreach ($hints as $table => $hint) {
            if (count($out['docs']['hints']) >= 100 || !preg_match('/^[A-Za-z0-9_]{1,20}$/', (string) $table)) {
                continue;
            }
            $text = webapp_theme_settings_text($hint, 100);
            if ($text !== '') {
                $out['docs']['hints'][(string) $table] = $text;
            }
        }

        $sidebar = isset($input['sidebar']) && is_array($input['sidebar']) ? $input['sidebar'] : [];
        foreach (array_keys($out['sidebar']) as $screen) {
            $mode = isset($sidebar[$screen]) && is_scalar($sidebar[$screen]) ? (string) $sidebar[$screen] : '';
            $out['sidebar'][$screen] = in_array($mode, ['auto', 'hidden'], true) ? $mode : 'auto';
        }

        $site = isset($input['site']) && is_array($input['site']) ? $input['site'] : [];
        $limits = [
            'name' => 60, 'logoText' => 30, 'description' => 200, 'homeTitle' => 60, 'homeDescription' => 300,
            'footerDescription' => 300, 'customerCenterTitle' => 40, 'copyrightName' => 60,
        ];
        foreach ($limits as $key => $max) {
            $out['site'][$key] = isset($site[$key]) ? webapp_theme_settings_text($site[$key], $max) : '';
        }
        $lines = $site['customerCenterLines'] ?? [];
        $lines = is_array($lines) ? $lines : preg_split('/\R/u', is_scalar($lines) ? (string) $lines : '');
        foreach ((array) $lines as $line) {
            $text = webapp_theme_settings_text($line, 120);
            if ($text !== '' && count($out['site']['customerCenterLines']) < 5) {
                $out['site']['customerCenterLines'][] = $text;
            }
        }

        return $out;
    }
}

if (!function_exists('webapp_theme_settings_valid_theme')) {
    /** 테마 폴더 이름 꼴(cf_theme)만 받는다 — 쿼리에 넣기 전에 거른다. */
    function webapp_theme_settings_valid_theme(string $theme): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_\-]{1,40}$/', $theme);
    }
}

if (!function_exists('webapp_theme_settings_load')) {
    /** @return array{settings: array, revision: int} 저장한 적이 없거나 표가 없으면 기본값 · 변경 번호 0. */
    function webapp_theme_settings_load(string $theme): array
    {
        // 요청 안에서 캐시하지 않는다 — 관리자 화면이 저장한 뒤 같은 요청에서 다시 읽을 때 예전 값이 나오지 않게(한 줄 조회다).
        $empty = ['settings' => webapp_theme_settings_defaults(), 'revision' => 0];
        if (!webapp_theme_settings_valid_theme($theme) || !function_exists('sql_fetch')) {
            return $empty;
        }
        $table = webapp_theme_settings_table();
        $row = sql_fetch("SELECT ts_value, ts_revision FROM `{$table}` WHERE ts_theme = '" . sql_real_escape_string($theme) . "'", false);
        if (!is_array($row) || !isset($row['ts_value'])) {
            return $empty;
        }
        $decoded = json_decode((string) $row['ts_value'], true);
        return [
            'settings' => webapp_theme_settings_normalize(is_array($decoded) ? $decoded : []),
            'revision' => (int) $row['ts_revision'],
        ];
    }
}

if (!function_exists('webapp_theme_settings_save')) {
    /**
     * 설정 전체를 바꾼다(빠진 칸은 기본값). 권한 · 토큰 검사는 부르는 쪽(관리자 화면)이 한다.
     *
     * @return int 새 변경 번호. 저장하지 못하면 0.
     */
    function webapp_theme_settings_save(string $theme, $input, string $mbId): int
    {
        if (!webapp_theme_settings_valid_theme($theme) || !function_exists('sql_query')) {
            return 0;
        }
        $table = webapp_theme_settings_table();
        $json = json_encode(webapp_theme_settings_normalize($input), JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return 0;
        }
        $theme_sql = sql_real_escape_string($theme);
        $saved = sql_query("INSERT INTO `{$table}` (ts_theme, ts_value, ts_revision, ts_updated_at, ts_updated_by)
                            VALUES ('{$theme_sql}', '" . sql_real_escape_string($json) . "', 1, '" . G5_TIME_YMDHIS . "', '"
                            . sql_real_escape_string(substr($mbId, 0, 20)) . "')
                            ON DUPLICATE KEY UPDATE ts_value = VALUES(ts_value), ts_revision = ts_revision + 1,
                                                    ts_updated_at = VALUES(ts_updated_at), ts_updated_by = VALUES(ts_updated_by)", false);
        if (!$saved) {
            return 0;
        }
        $row = sql_fetch("SELECT ts_revision FROM `{$table}` WHERE ts_theme = '{$theme_sql}'", false);
        return is_array($row) ? (int) $row['ts_revision'] : 0;
    }
}

if (!function_exists('webapp_theme_settings_public')) {
    /** 화면에 내보내는 값 — 변경 번호와 docs · sidebar · site. 저장한 사람 · 시각은 내보내지 않는다. */
    function webapp_theme_settings_public(string $theme): array
    {
        $loaded = webapp_theme_settings_load($theme);
        $settings = $loaded['settings'];
        // 빈 안내 문구도 JSON 객체({})로 — 화면은 게시판 이름 → 문구 맵으로 읽는다(빈 배열 [] 이 아니라).
        if ($settings['docs']['hints'] === []) {
            $settings['docs']['hints'] = new stdClass();
        }
        // theme — 서버 실행 화면(/v1/settings 를 읽는 쪽)이 다른 테마의 설정을 자기 것으로 쓰지 않게.
        return ['theme' => $theme, 'revision' => $loaded['revision']] + $settings;
    }
}

if (!function_exists('webapp_theme_settings_active_theme')) {
    /** 지금 적용한 테마(관리자 › 테마). */
    function webapp_theme_settings_active_theme(): string
    {
        global $config;
        return isset($config['cf_theme']) ? (string) $config['cf_theme'] : '';
    }
}
