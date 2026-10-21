<?php
/**
 * 외부 SMTP 로그인(네이버 · Gmail 등)으로 메일 보내기.
 *
 * config.php 의 G5_SMTP(기본 127.0.0.1:25)는 코어 상수라 바꿀 수 없고, 서버에 메일 서버가 없으면 모든 메일이
 * 조용히 사라진다(디데이 운영 서버 2026-10-21: 25번 포트에 아무것도 없어 비밀번호 찾기 메일이 안 갔다).
 * 그래서 그누보드 mailer 의 mail_options 훅에서 호스트 · 포트 · 계정 · 암호화를 덮는다.
 *
 * 설정 — 상수(data/dbconfig.php) 또는 api/.env(호스트 전용 파일, 저장소에 없다):
 *   G5_SMTP_AUTH_HOST=smtp.naver.com
 *   G5_SMTP_AUTH_PORT=587
 *   G5_SMTP_AUTH_SECURE=tls          (tls | ssl)
 *   G5_SMTP_AUTH_USER=아이디@naver.com
 *   G5_SMTP_AUTH_PASS=애플리케이션 비밀번호
 * HOST 와 USER 가 없으면 아무것도 하지 않는다 — 예전 동작 그대로.
 *
 * 네이버 · Gmail 은 보내는 사람 주소가 로그인 계정과 같아야 받아 준다. 다르면 From 을 그 계정으로 바꾸고,
 * 원래 보낸 사람은 Reply-To 로 남겨 답장이 그쪽으로 가게 한다.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('g5_smtp_auth_setting')) {

    /** 상수가 먼저, 없으면 api/.env 의 KEY=VALUE. 웹 화면(bbs)에서는 API 의 .env 읽기가 돌지 않아서 여기서 직접 읽는다. */
    function g5_smtp_auth_setting($key)
    {
        $key = (string) $key;
        if (defined($key)) {
            return trim((string) constant($key));
        }
        static $env = null;
        if ($env === null) {
            $env = array();
            $file = G5_PATH . '/api/.env';
            if (is_file($file) && is_readable($file)) {
                foreach ((array) file($file, FILE_IGNORE_NEW_LINES) as $line) {
                    $line = trim((string) $line);
                    if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                        continue;
                    }
                    list($name, $value) = explode('=', $line, 2);
                    $value = trim($value);
                    if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && substr($value, -1) === $value[0]) {
                        $value = substr($value, 1, -1);
                    }
                    $env[trim($name)] = $value;
                }
            }
        }
        return isset($env[$key]) ? trim((string) $env[$key]) : '';
    }

    /** mailer.lib.php: run_replace('mail_options', $mail, …) — 설정이 있으면 SMTP 로그인으로 보낸다. */
    function g5_smtp_auth_mail_options($mail)
    {
        if (!is_object($mail)) {
            return $mail;
        }
        $host = g5_smtp_auth_setting('G5_SMTP_AUTH_HOST');
        $user = g5_smtp_auth_setting('G5_SMTP_AUTH_USER');
        if ($host === '' || $user === '') {
            return $mail;
        }

        $secure = strtolower(g5_smtp_auth_setting('G5_SMTP_AUTH_SECURE'));
        if (!in_array($secure, array('tls', 'ssl'), true)) {
            $secure = 'tls';
        }
        $port = (int) g5_smtp_auth_setting('G5_SMTP_AUTH_PORT');

        $mail->isSMTP();
        $mail->Host = $host;
        $mail->Port = $port > 0 ? $port : ($secure === 'ssl' ? 465 : 587);
        $mail->SMTPSecure = $secure;
        $mail->SMTPAuth = true;
        $mail->Username = $user;
        $mail->Password = g5_smtp_auth_setting('G5_SMTP_AUTH_PASS');
        $mail->Timeout = 15;

        if (strcasecmp((string) $mail->From, $user) !== 0) {
            if ((string) $mail->From !== '') {
                $mail->addReplyTo((string) $mail->From, (string) $mail->FromName);
            }
            $mail->From = $user;
            $mail->Sender = $user;
        }
        return $mail;
    }

    add_replace('mail_options', 'g5_smtp_auth_mail_options', 10, 1);
}
