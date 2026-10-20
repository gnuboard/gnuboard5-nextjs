<?php
/**
 * 첨부 파일 받기(board-file-downloads.php)의 도우미 — 요청 · 응답 모양만 다루고 DB 를 쓰지 않아
 * 스모크 테스트(tests/smoke/BoardFileDownloadsTest.php)가 따로 불러 검사한다.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('api_download_has_bearer')) {
    /**
     * Authorization: Bearer 로 들어온 요청인가. Auth::getUser() 는 헤더가 없으면 g5_token 쿠키도 받는데,
     * 그러면 웹에 로그인한 사람이 다른 사이트의 링크를 누르기만 해도(최상위 GET 에는 SameSite=Lax 쿠키가 실린다)
     * 포인트가 빠질 수 있다. bbs/download.php 는 nonce 로 막지만 이 경로는 앱 전용이라 쿠키를 아예 보지 않는다.
     */
    function api_download_has_bearer(): bool
    {
        $header = '';
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $header = (string) $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $header = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (function_exists('apache_request_headers')) {
            foreach (apache_request_headers() as $key => $value) {
                if (strtolower((string) $key) === 'authorization') {
                    $header = (string) $value;
                    break;
                }
            }
        }
        return preg_match('/^Bearer\s+\S/i', $header) === 1;
    }
}

if (!function_exists('api_download_ascii_name')) {
    /**
     * 옛 클라이언트용 filename 값(ASCII). 한글 이름은 filename* 로 따로 보낸다.
     * 영문 · 숫자가 없는 이름(한글뿐인 이름)은 밑줄만 남으므로 download.<확장자> 로 쓴다.
     */
    function api_download_ascii_name(string $source): string
    {
        $ascii = preg_replace('/[^A-Za-z0-9._-]+/u', '_', $source);
        if (is_string($ascii) && preg_match('/[A-Za-z0-9]/', (string) pathinfo($ascii, PATHINFO_FILENAME))) {
            return $ascii;
        }
        $extension = preg_replace('/[^A-Za-z0-9]/', '', (string) pathinfo($source, PATHINFO_EXTENSION));
        return 'download' . ($extension !== '' ? '.' . substr((string) $extension, 0, 10) : '');
    }
}

if (!function_exists('api_download_range')) {
    /**
     * Range 머리글 한 구간을 읽는다 — 앱이 끊긴 큰 파일을 이어받을 때 쓴다.
     * @return array{0:int,1:int}|null|false  [시작, 끝](끝 포함) · null = 전체를 보낸다(머리글 없음 · 읽을 수 없음 · 여러 구간) ·
     *                                         false = 줄 수 없는 구간(416)
     */
    function api_download_range(?string $header, int $size)
    {
        if ($header === null || $size <= 0) {
            return null;
        }
        if (!preg_match('/^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i', $header, $m)) {
            return null; // 여러 구간(쉼표)이나 모르는 단위는 무시하고 전체를 보낸다(RFC 9110 이 허락한다).
        }
        if ($m[1] === '' && $m[2] === '') {
            return null;
        }
        if ($m[1] === '') {
            // bytes=-500 → 마지막 500 바이트
            $suffix = (int) $m[2];
            if ($suffix <= 0) {
                return false;
            }
            return [max(0, $size - $suffix), $size - 1];
        }
        $start = (int) $m[1];
        $end = $m[2] === '' ? $size - 1 : min((int) $m[2], $size - 1);
        if ($start >= $size || $start > $end) {
            return false;
        }
        return [$start, $end];
    }
}

if (!function_exists('api_download_remote_url')) {
    /**
     * 파일을 외부 저장소(S3 같은 곳)에 두는 설치본은 bf_fileurl 에 주소가 있고 서버에 파일이 없다.
     * http(s) 주소일 때만 돌려준다 — 그 밖(javascript:, 상대 경로 등)은 빈 값.
     */
    function api_download_remote_url(array $file): string
    {
        $url = trim((string) ($file['bf_fileurl'] ?? ''));
        if ($url === '' || !preg_match('#^https?://#i', $url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return '';
        }
        return $url;
    }
}
