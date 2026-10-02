<?php
/**
 * 그누보드5 훅(run_event / run_replace)을 API 에서 부르는 길.
 *
 * 그누보드 원본 화면(bbs/login_check.php, bbs/write_update.php …)은 동작마다 훅을 부르고, 플러그인은
 * add_event / add_replace 로 거기에 기능을 붙인다(워드프레스의 do_action / apply_filters 와 같다).
 * API 가 같은 동작을 하면서 훅을 부르지 않으면, 그 플러그인은 새 화면과 앱에서 조용히 빠진다.
 * 그래서 API 는 같은 동작에서 **같은 훅 이름 · 같은 인자 순서**로 부른다. 그누보드 원본 파일은 고치지 않는다.
 *
 * API 라서 지키는 것:
 *  - 출력은 버린다. 원본 훅에 붙은 함수는 HTML 을 찍기도 하는데, 그대로 두면 JSON 응답이 깨진다.
 *  - 저장 뒤 훅이 실패(예외)해도 요청을 망치지 않는다. 오류는 error_log 에만 남긴다.
 *    저장 전 훅(api_run_before_event)이 실패하면 검사를 건너뛰고 저장하지 않게 500 으로 멈춘다.
 *  - 도는 동안 전역 $member · $is_member · $is_guest · $is_admin 을 맞춘다 — 회원을 주면 그 회원,
 *    안 주면 비회원(원본 화면에서 그 자리의 상태). 라우트 파일은 전역 범위에서 돌아 그 안의 $member
 *    변수가 곧 전역 $member 이므로, 그대로 두면 엉뚱한 회원이 보인다. 끝나면 되돌린다.
 *  - 플러그인이 동작을 막는 원본 방식(alert() · alert_close() · goto_url())을 JSON 으로 바꾼다.
 *    원본 함수는 HTML 을 찍고 exit 하기 전에 run_event('alert' · 'alert_close' · 'goto_url') 를 먼저
 *    부르므로, 훅이 도는 동안에만 거기에 귀를 대 그 자리에서 빠져나온다.
 *      · api_run_before_event() — 저장 전 훅(*_before, *_valid). 막히면 그 메시지로 JSON 오류(403)를 낸다.
 *      · api_run_event()        — 그 밖의 훅. 이미 저장한 뒤라 막힘은 기록만 하고 계속한다.
 *    alert 없이 exit 만 하면 종료 직전에 JSON 오류(500)로 바꾼다.
 */

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('ApiHookInterrupt')) {
    /** 훅 함수가 alert() · alert_close() · goto_url() 로 요청을 끝내려 했다. */
    class ApiHookInterrupt extends \RuntimeException
    {
    }
}

if (!function_exists('api_hooks_depth')) {
    /** 지금 API 가 부른 훅 안에 있나(중첩 깊이). $delta 로 늘리고 줄인다. */
    function api_hooks_depth(int $delta = 0): int
    {
        static $depth = 0;
        $depth = max(0, $depth + $delta);
        return $depth;
    }
}

if (!function_exists('api_hooks_interrupt_message')) {
    /**
     * alert 메시지를 JSON 에 실을 글로. 비면 기본 문구.
     * 그누보드는 줄바꿈을 alert('…\\n…') 처럼 "\n" 두 글자로 쓴다(브라우저 경고창이 풀어 준다) — 진짜 줄바꿈으로 바꾼다.
     * <br> 도 줄바꿈으로, 나머지 태그는 빼고, &quot; 같은 엔티티는 푼다.
     */
    function api_hooks_interrupt_message($msg): string
    {
        $text = str_replace(array('\\r\\n', '\\n'), "\n", (string) $msg);
        $text = preg_replace('#<br\s*/?>#i', "\n", $text);
        $text = html_entity_decode(strip_tags((string) $text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace("/\n{3,}/", "\n\n", $text));
        return $text !== '' ? $text : '이 요청은 처리할 수 없습니다.';
    }
}

if (!function_exists('api_hooks_on_alert')) {
    function api_hooks_on_alert($msg = '', $url = '', $error = true, $post = false)
    {
        if (api_hooks_depth() > 0) {
            throw new ApiHookInterrupt(api_hooks_interrupt_message($msg));
        }
    }
    function api_hooks_on_alert_close($msg = '', $error = true)
    {
        if (api_hooks_depth() > 0) {
            throw new ApiHookInterrupt(api_hooks_interrupt_message($msg));
        }
    }
    function api_hooks_on_goto_url($url = '')
    {
        if (api_hooks_depth() > 0) {
            error_log('[api hooks] a hook tried to redirect to ' . (string) $url);
            throw new ApiHookInterrupt('이 요청은 처리할 수 없습니다.');
        }
    }

    /** 훅 함수가 exit 로 끝냈으면 버퍼(HTML)와 이동 헤더를 버리고 JSON 오류로 답한다. */
    function api_hooks_on_shutdown()
    {
        if (api_hooks_depth() === 0 || headers_sent()) {
            return;
        }
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header_remove('Location');
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array('success' => false, 'message' => '플러그인이 요청을 끝냈습니다.'), JSON_UNESCAPED_UNICODE);
    }

    if (function_exists('add_event')) {
        // 가장 먼저 듣는다 — 원본 alert() 가 HTML 을 찍기 전에 빠져나와야 한다.
        add_event('alert', 'api_hooks_on_alert', 1, 4);
        add_event('alert_close', 'api_hooks_on_alert_close', 1, 2);
        add_event('goto_url', 'api_hooks_on_goto_url', 1, 1);
    }
    register_shutdown_function('api_hooks_on_shutdown');
}

if (!function_exists('api_hooks_with_actor')) {
    /**
     * 전역 회원을 $actor(API 로그인 회원 행)로 — null 이면 비회원으로 — 두고 $fn 을 돌린 뒤 되돌린다.
     *
     * @return mixed $fn 의 반환값
     */
    function api_hooks_with_actor(?array $actor, callable $fn)
    {
        $saved = array(
            'member'    => $GLOBALS['member'] ?? null,
            'is_member' => $GLOBALS['is_member'] ?? null,
            'is_guest'  => $GLOBALS['is_guest'] ?? null,
            'is_admin'  => $GLOBALS['is_admin'] ?? null,
        );
        $isMember = $actor !== null && !empty($actor['mb_id']);
        $GLOBALS['member'] = $isMember ? $actor : array('mb_id' => '', 'mb_level' => 1);
        $GLOBALS['is_member'] = $isMember;
        $GLOBALS['is_guest'] = !$isMember;
        $GLOBALS['is_admin'] = $isMember && function_exists('is_admin') ? is_admin((string) $actor['mb_id']) : '';
        try {
            return $fn();
        } finally {
            foreach ($saved as $name => $value) {
                $GLOBALS[$name] = $value;
            }
        }
    }
}

if (!function_exists('api_hooks_dispatch')) {
    /**
     * $fn 을 훅 문맥(출력 버림 · 회원 맞춤 · 막힘 잡기)에서 돌린다.
     *
     * @return array{0:mixed,1:?string,2:bool} [반환값, 막혔으면 그 메시지, 훅 함수가 예외로 실패했나]
     */
    function api_hooks_dispatch(string $kind, string $tag, ?array $actor, callable $fn, $fallback = null): array
    {
        $level = ob_get_level();
        ob_start();
        api_hooks_depth(1);
        try {
            return array(api_hooks_with_actor($actor, $fn), null, false);
        } catch (ApiHookInterrupt $e) {
            return array($fallback, $e->getMessage(), false);
        } catch (\Throwable $e) {
            error_log('[api hooks] ' . $kind . ' ' . $tag . ' failed: ' . get_class($e) . ': ' . $e->getMessage()
                . ' in ' . $e->getFile() . ':' . $e->getLine());
            return array($fallback, null, true);
        } finally {
            api_hooks_depth(-1);
            while (ob_get_level() > $level) {
                ob_end_clean();
            }
        }
    }
}

if (!function_exists('api_run_event')) {
    /**
     * run_event($tag, ...$args) — 원본과 같은 이름 · 인자로. 이미 저장한 뒤의 훅에 쓴다.
     * 훅 함수가 alert() 등으로 막으려 하면 그 메시지를 돌려주고(기록도 남긴다) 요청은 계속한다.
     *
     * @param array<int,mixed> $args  원본 run_event 의 둘째 인자부터
     * @param array|null       $actor 훅이 도는 동안 전역 $member 로 둘 회원(null 이면 비회원)
     * @return string|null 막혔으면 그 메시지
     */
    function api_run_event(string $tag, array $args = array(), ?array $actor = null): ?string
    {
        if (!function_exists('run_event')) {
            return null;
        }
        list(, $interrupted) = api_hooks_dispatch('run_event', $tag, $actor, api_hooks_event_caller($tag, $args));
        if ($interrupted !== null) {
            error_log('[api hooks] ' . $tag . ' interrupted after the change was saved: ' . $interrupted);
        }
        return $interrupted;
    }

    /** run_event($tag, ...$args) 를 부르는 함수 */
    function api_hooks_event_caller(string $tag, array $args): callable
    {
        return static function () use ($tag, $args) {
            call_user_func_array('run_event', array_merge(array($tag), $args));
        };
    }
}

if (!function_exists('api_run_before_event')) {
    /**
     * 저장 전 훅(*_before, *_valid) — 훅 함수가 alert() 등으로 막으면 원본처럼 동작을 멈춘다.
     * 원본은 경고창을 띄우지만 API 는 그 메시지로 JSON 오류를 내고 요청을 끝낸다.
     * 훅 함수가 예외로 실패해도 멈춘다(500) — 원본에서도 요청이 오류로 끝나고, 검사(금지어 · 스팸 …)를
     * 건너뛴 채 저장하는 것보다 안전하다.
     */
    function api_run_before_event(string $tag, array $args = array(), ?array $actor = null, int $status = 403): void
    {
        if (!function_exists('run_event')) {
            return;
        }
        list(, $interrupted, $failed) = api_hooks_dispatch('run_event', $tag, $actor, api_hooks_event_caller($tag, $args));
        if (!class_exists('Response')) {
            return;
        }
        if ($interrupted !== null) {
            Response::error($interrupted, $status);
        }
        if ($failed) {
            Response::error('요청을 확인하는 플러그인에서 오류가 났습니다. 잠시 후 다시 시도해 주세요.', 500);
        }
    }
}

if (!function_exists('api_run_replace')) {
    /**
     * run_replace($tag, $value, ...$extra) — 걸러진 값을 돌려준다. 출력은 버리고, 실패 · 막힘이면 원래 값.
     *
     * @param mixed            $value 거를 값(원본 run_replace 의 둘째 인자)
     * @param array<int,mixed> $extra 원본 run_replace 의 셋째 인자부터
     * @return mixed
     */
    function api_run_replace(string $tag, $value, array $extra = array(), ?array $actor = null)
    {
        if (!function_exists('run_replace')) {
            return $value;
        }
        list($result, $interrupted) = api_hooks_dispatch('run_replace', $tag, $actor, static function () use ($tag, $value, $extra) {
            return call_user_func_array('run_replace', array_merge(array($tag, $value), $extra));
        }, $value);
        if ($interrupted !== null) {
            error_log('[api hooks] ' . $tag . ' (replace) interrupted: ' . $interrupted);
        }
        return $result;
    }
}

if (!function_exists('api_call_core')) {
    /**
     * 안에서 훅을 부르는 그누보드 함수를 훅 문맥에서 부른다 — delete_cache_latest()(훅 delete_cache_latest),
     * delete_editor_thumbnail()(훅 delete_editor_thumbnail_before · _after) 처럼. 그 훅에 붙은 플러그인의
     * 출력 · alert · 예외가 JSON 응답을 깨지 않게 한다. 정리 작업용이라 막히거나 실패해도 요청은 계속한다.
     *
     * @param array<int,mixed> $args
     * @return mixed 함수의 반환값(없거나 실패하면 null)
     */
    function api_call_core(string $function, array $args = array(), ?array $actor = null)
    {
        if (!function_exists($function)) {
            return null;
        }
        list($result, $interrupted) = api_hooks_dispatch('core', $function, $actor, static function () use ($function, $args) {
            return call_user_func_array($function, $args);
        });
        if ($interrupted !== null) {
            error_log('[api hooks] ' . $function . '() interrupted by a hook: ' . $interrupted);
        }
        return $result;
    }
}
