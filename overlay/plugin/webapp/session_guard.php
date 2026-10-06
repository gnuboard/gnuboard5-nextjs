<?php
/**
 * 우리 입구(api/index.php · bridge/route.php)의 세션 — 그누보드 common.php 보다 먼저 읽는다.
 *
 * 그누보드 코어(common.php)는 요청마다 세션을 열고, 요청 1%마다 세션 폴더 전체를 훑어 오래된 파일을 지운다
 * (gc_probability 1/100). 카페24 같은 공유 호스팅은 그 폴더(/tmp)를 여러 계정이 함께 써 수십만 개를 훑느라 그
 * 요청이 수 초씩 멈추고, 남의 파일은 지울 수도 없다. 또 쿠키 없이 오는 요청(앱 · 봇 · 서버 간 호출)마다 빈 세션
 * 파일이 하나씩 쌓인다. 코어를 고치지 않고, 코어보다 먼저 도는 우리 입구에서만 파일 세션을 감싼다.
 *
 * - 저장 위치 · 형식은 그대로(PHP 의 files 처리기를 그대로 부른다) — 코어 화면과 로그인을 함께 쓴다.
 * - 청소(gc)는 하지 않는다. 만료된 파일은 코어 화면 요청의 청소가 그대로 지운다.
 * - 쿠키 없이 온 요청의 세션은 코어가 요청마다 넣는 값(ss_is_mobile)뿐이면 파일로 남기지 않는다.
 *   다른 값을 넣으면(로그인 등) 원래처럼 쓴다.
 *
 * common.php 보다 먼저 읽으므로 _GNUBOARD_ 를 볼 수 없다 — 이 파일은 정의만 하고 아무것도 출력하지 않는다.
 */

if (!class_exists('WebappSessionHandler', false)) {
    class WebappSessionHandler extends SessionHandler
    {
        /** 이 세션이 쿠키 없이 새로 열렸는지 — 그렇다면 버려도 되는 값뿐일 때는 파일을 만들지 않는다. */
        private $fresh = false;

        /** 코어 common.php 가 요청마다 다시 정해 넣는 값 — 이것뿐인 새 세션은 남길 까닭이 없다. */
        private static $throwawayKeys = array('ss_is_mobile');

        #[\ReturnTypeWillChange]
        public function read($id)
        {
            $name = session_name();
            $this->fresh = !isset($_COOKIE[$name]) || (string) $_COOKIE[$name] !== (string) $id;
            if ($this->fresh) {
                return '';
            }
            return parent::read($id);
        }

        #[\ReturnTypeWillChange]
        public function write($id, $data)
        {
            if ($this->fresh) {
                $keys = isset($_SESSION) && is_array($_SESSION) ? array_keys($_SESSION) : array();
                if (!array_diff($keys, self::$throwawayKeys)) {
                    return true; // 로그인 등 남길 값이 없다
                }
            }
            return parent::write($id, $data);
        }

        #[\ReturnTypeWillChange]
        public function gc($max_lifetime)
        {
            return 0;
        }
    }
}

if (!function_exists('webapp_session_guard_install')) {
    /** 파일 세션일 때만, 세션을 열기 전에 감싼다(이미 열렸거나 다른 저장 방식이면 그대로 둔다). */
    function webapp_session_guard_install(): void
    {
        if (session_status() !== PHP_SESSION_NONE || ini_get('session.save_handler') !== 'files') {
            return;
        }
        session_set_save_handler(new WebappSessionHandler(), true);
    }
}
