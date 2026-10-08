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
 * - 요청 중에는 청소(gc)를 하지 않는다. 한 시간에 한 번, 응답을 먼저 보낸 뒤 만료된 우리 파일만 지운다
 *   (webapp_session_gc_tick — 응답을 먼저 보낼 수 없는 서버에서는 돌지 않는다).
 * - 쿠키 없이 온 요청의 세션은 코어가 요청마다 넣는 값(ss_is_mobile)뿐이면 파일로 남기지 않는다.
 *   다른 값을 넣으면(로그인 등) 원래처럼 쓴다.
 *
 * common.php 보다 먼저 읽으므로 _GNUBOARD_ 를 볼 수 없다 — 이 파일은 정의만 하고 아무것도 출력하지 않는다.
 */

if (!class_exists('WebappSessionHandler', false)) {
    class WebappSessionHandler extends SessionHandler
    {
        /** 이 요청의 세션을 감쌌는지 — 응답 뒤 청소(webapp_session_gc_tick)가 본다. */
        public static $installed = false;

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
                // ?device= 로 고른 PC · 모바일 화면은 코어가 세션(ss_is_mobile)에만 남긴다 — 그때는 남긴다.
                $deviceChosen = isset($_REQUEST['device']) && in_array($_REQUEST['device'], array('pc', 'mobile'), true);
                if (!$deviceChosen && !array_diff($keys, self::$throwawayKeys)) {
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
        WebappSessionHandler::$installed = true;
        // 청소는 맨 마지막 shutdown 으로 — 여기서 바로 걸면 코어보다 먼저 걸려 가장 먼저 돈다. 그때 응답을 끝내
        // 버리면 뒤의 shutdown(API 의 alert · exit → JSON 등)이 내보낼 것을 잃는다. shutdown 안에서 건 것은 맨 뒤에 돈다.
        register_shutdown_function(static function () {
            register_shutdown_function('webapp_session_gc_tick');
        });
    }
}

if (!function_exists('webapp_session_files_dir')) {
    /** PHP 가 세션 파일을 두는 폴더. "N;/path"(하위 폴더에 나눠 담기)는 다루지 않는다 — 그때는 ''. */
    function webapp_session_files_dir(): string
    {
        $path = (string) session_save_path();
        if (strpos($path, ';') !== false) {
            $parts = explode(';', $path);
            if (ctype_digit($parts[0]) && (int) $parts[0] > 0) {
                return '';
            }
            $path = (string) end($parts);
        }
        if ($path === '') {
            $path = sys_get_temp_dir();
        }
        return rtrim($path, '/\\');
    }
}

if (!function_exists('webapp_session_dir_is_shared_tmp')) {
    /** 여러 계정 · 앱이 함께 쓰는 임시 폴더(/tmp · /var/tmp · 시스템 임시 폴더)인가. */
    function webapp_session_dir_is_shared_tmp(string $dir): bool
    {
        $normalize = static function (string $path): string {
            $real = @realpath($path);
            return strtolower(rtrim(str_replace('\\', '/', $real !== false ? $real : $path), '/'));
        };
        $target = $normalize($dir);
        foreach (array('/tmp', '/var/tmp', sys_get_temp_dir()) as $shared) {
            if ($shared !== '' && $target === $normalize($shared)) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('webapp_session_gc_run')) {
    /**
     * 만료된 우리 sess_ 파일을 시간 한도 안에서 지운다 — PHP 세션 청소와 같은 기준(수정 시각이 보관 시간을 넘음).
     * 공유 폴더(/tmp)의 다른 계정 파일은 지울 수 없고 지우려 하지도 않는다(소유자를 알 수 있으면 우리 것만).
     * @return array{deleted:int, scanned:int, complete:bool}
     */
    function webapp_session_gc_run(string $dir, int $max_lifetime, float $budget_seconds): array
    {
        $result = array('deleted' => 0, 'scanned' => 0, 'complete' => false);
        $handle = @opendir($dir);
        if (!$handle) {
            return $result;
        }
        $started = microtime(true);
        $cutoff = time() - max(60, $max_lifetime);
        $uid = function_exists('posix_geteuid') ? posix_geteuid() : null;
        // 소유자를 알 수 없으면(posix 확장 없음) 공유 임시 폴더는 건드리지 않는다 — 같은 서버 다른 계정 · 다른 앱의
        // 세션 파일까지 지우게 된다. 이 설치본 전용 폴더(session.save_path 를 따로 둔 경우)만 청소한다.
        if ($uid === null && webapp_session_dir_is_shared_tmp($dir)) {
            closedir($handle);
            $result['complete'] = true;
            return $result;
        }
        $complete = true;
        while (($name = readdir($handle)) !== false) {
            if (strncmp($name, 'sess_', 5) !== 0) {
                continue;
            }
            $result['scanned']++;
            $file = $dir . '/' . $name;
            $mtime = @filemtime($file);
            if ($mtime !== false && $mtime < $cutoff && preg_match('/^sess_[A-Za-z0-9,-]+$/', $name)
                && ($uid === null || @fileowner($file) === $uid) && @unlink($file)) {
                $result['deleted']++;
            }
            if (($result['scanned'] & 255) === 0 && microtime(true) - $started > $budget_seconds) {
                $complete = false;
                break;
            }
        }
        closedir($handle);
        $result['complete'] = $complete;
        return $result;
    }
}

if (!function_exists('webapp_session_gc_claim')) {
    /** 청소 차례인지 — 표시 파일이 $interval_seconds 보다 오래됐으면 새로 표시하고 true(파일 잠금으로 하나만). */
    function webapp_session_gc_claim(string $stamp, int $interval_seconds): bool
    {
        $fp = @fopen($stamp, 'c');
        if (!$fp) {
            return false;
        }
        try {
            if (!flock($fp, LOCK_EX | LOCK_NB)) {
                return false;
            }
            clearstatcache(true, $stamp);
            if (filesize($stamp) > 0 && time() - (int) filemtime($stamp) < $interval_seconds) {
                return false;
            }
            ftruncate($fp, 0);
            fwrite($fp, date('c'));
            fflush($fp);
            return true;
        } finally {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
}

if (!function_exists('webapp_session_gc_tick')) {
    /**
     * 한 시간에 한 번, 응답을 먼저 보낸 뒤 만료된 우리 세션 파일을 지운다. 우리 입구는 세션 청소를 하지 않으므로
     * (위 처리기) 이게 없으면 우리 파일이 쌓인다. 응답을 먼저 보낼 수 없는 서버(fastcgi_finish_request 없음)에서는
     * 손님이 기다리게 되므로 돌지 않는다 — 그때는 nextjs-install/check.php 의 지우기로 정리한다.
     */
    function webapp_session_gc_tick(): void
    {
        if (!function_exists('fastcgi_finish_request') || !WebappSessionHandler::$installed || !defined('G5_DATA_PATH')) {
            return;
        }
        $dir = webapp_session_files_dir();
        if ($dir === '' || !webapp_session_gc_claim(G5_DATA_PATH . '/cache/g5app_session_gc.txt', 3600)) {
            return;
        }
        fastcgi_finish_request();
        webapp_session_gc_run($dir, (int) ini_get('session.gc_maxlifetime'), 20.0);
    }
}
