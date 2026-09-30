<?php
/**
 * Gnuboard5 REST API - Captcha Endpoint
 *
 * Routes handled (prefix: v1/captcha):
 *   GET  /v1/captcha        - Generate new captcha, store key in session, return image (jpeg/png)
 *   GET  /v1/captcha/audio  - Return the current captcha key as concatenated MP3 audio
 *
 * The session cookie (PHPSESSID) set by this request must be preserved by the client
 * and sent back when submitting the register form. The register handler calls the
 * shared chk_captcha() logic to validate ss_captcha_key against the user input.
 */

if (!defined('_GNUBOARD_')) exit;

if ($apiMethod !== 'GET') {
    Response::error('Method not allowed.', 405);
}

require_once G5_CAPTCHA_PATH . '/kcaptcha_config.php';
require_once G5_CAPTCHA_PATH . '/kcaptcha.lib.php';

$captchaAction = isset($apiSegments[0]) ? (string) $apiSegments[0] : '';

if (!function_exists('g5_api_captcha_session_plain_key')) {
    function g5_api_captcha_session_plain_key()
    {
        $number = (string) get_session('ss_captcha_key');
        if ($number === '') {
            return '';
        }

        if (function_exists('get_string_decrypt')) {
            $ip = md5(sha1($_SERVER['REMOTE_ADDR']));
            $decrypted = get_string_decrypt($number);
            if (is_string($decrypted) && $decrypted !== '') {
                return strpos($decrypted, $ip) === 0
                    ? substr($decrypted, strlen($ip))
                    : $decrypted;
            }
        }

        return $number;
    }
}

if ($captchaAction === 'audio' || $captchaAction === 'mp3') {
    $number = g5_api_captcha_session_plain_key();
    if ($number === '') {
        Response::error('Captcha is not initialized.', 404);
    }
    if (!preg_match('/^[0-9A-Za-z]+$/', $number)) {
        Response::error('Invalid captcha state.', 422);
    }

    $voice = isset($config['cf_captcha_mp3']) ? (string) $config['cf_captcha_mp3'] : 'basic';
    $voice = preg_replace('/[^0-9A-Za-z_-]/', '', $voice);
    if ($voice === '') {
        $voice = 'basic';
    }

    $contents = '';
    for ($i = 0; $i < strlen($number); $i++) {
        $file = G5_CAPTCHA_PATH . '/mp3/' . $voice . '/' . $number[$i] . '.mp3';
        if (!is_readable($file)) {
            Response::error('Captcha audio is not available.', 404);
        }
        $contents .= file_get_contents($file);
    }

    header_remove('Content-Type');
    header('Content-Type: audio/mpeg');
    header('Content-Length: ' . strlen($contents));
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo $contents;
    exit;
}

if ($captchaAction !== '') {
    Response::error('Unknown captcha action.', 404);
}

// Re-create the keystring generation logic from kcaptcha_session.php so we can
// both generate and render the image in a single request without relying on the
// plugin's bootstrap which would re-include common.php.
while (true) {
    $keystring = '';
    for ($i = 0; $i < $length; $i++) {
        $keystring .= $allowed_symbols[mt_rand(0, strlen($allowed_symbols) - 1)];
    }
    if (!preg_match('/cp|cb|ck|c6|c9|rn|rm|mm|co|do|cl|db|qp|qb|dp|ww/', $keystring)) {
        break;
    }
}

$plainKey     = $keystring;
$encryptedKey = $keystring;
if (function_exists('get_string_encrypt')) {
    $ip = md5(sha1($_SERVER['REMOTE_ADDR']));
    $encryptedKey = get_string_encrypt($ip . $keystring);
}

set_session('ss_captcha_count', 0);
set_session('ss_captcha_key', $encryptedKey);

// Override JSON content-type set by index.php, and prevent caching so each
// reload fetches a fresh image.
header_remove('Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$captcha = new KCAPTCHA();
$captcha->setKeyString($plainKey);
$captcha->image();
exit;
