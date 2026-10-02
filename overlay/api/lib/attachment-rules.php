<?php
/**
 * 첨부 파일 허용 규칙 — 게시판 첨부(api/v1/post-files.php)와 1:1 문의 첨부(api/v1/qas_attachments.php)가 같이 쓴다.
 * 확장자 허용 목록 + 실제 내용(MIME) 확인. 브라우저가 문서로 실행할 수 있는 형식(HTML · XHTML · XML · SVG · 스크립트)은
 * 확장자 · MIME 둘 다에서 막는다 — data/ 아래 파일은 사이트 주소로 바로 열리므로 같은 출처에서 스크립트가 돈다.
 */

if (!defined('_GNUBOARD_')) exit;

function post_files_allowed_extension($extension)
{
    $extension = strtolower(trim((string) $extension));
    if ($extension === '' || !preg_match('/^[a-z0-9]+$/', $extension)) {
        return false;
    }

    global $config;
    $imageExt = isset($config['cf_image_extension']) ? (string) $config['cf_image_extension'] : 'gif|jpg|jpeg|png|webp';
    $imageExtensions = array_diff(
        array_filter(array_map('strtolower', preg_split('/[|, ]+/', $imageExt))),
        array('svg', 'svgz')
    );
    $documentExtensions = array(
        'pdf', 'txt', 'csv',
        'hwp', 'hwpx',
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        // 압축 — 앱 첨부 "파일(문서·압축)"과 같은 목록(앱 entities/postFile/attachmentRules.ts, 2026-09-30).
        'zip', '7z', 'rar', 'alz', 'egg', 'tar', 'gz', 'tgz',
    );

    return in_array($extension, array_merge($imageExtensions, $documentExtensions), true);
}

function post_files_image_extensions(): array
{
    global $config;
    $imageExt = isset($config['cf_image_extension']) ? (string) $config['cf_image_extension'] : 'gif|jpg|jpeg|png|webp';
    return array_diff(
        array_filter(array_map('strtolower', preg_split('/[|, ]+/', $imageExt))),
        array('svg', 'svgz')
    );
}

function post_files_detect_mime($path): string
{
    if (function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mime = @finfo_file($finfo, $path);
            @finfo_close($finfo);
            if (is_string($mime) && $mime !== '') {
                return strtolower(trim($mime));
            }
        }
    }
    if (function_exists('mime_content_type')) {
        $mime = @mime_content_type($path);
        if (is_string($mime) && $mime !== '') {
            return strtolower(trim($mime));
        }
    }
    return '';
}

function post_files_allowed_mime(string $extension, string $mime, $imgInfo): bool
{
    $extension = strtolower(trim($extension));
    $mime = strtolower(trim(strtok($mime, ';') ?: $mime));
    if ($mime === '') {
        return true;
    }

    $blockedMimes = array(
        'application/javascript',
        'application/json',
        'application/xhtml+xml',
        'application/xml',
        'application/x-httpd-php',
        'application/x-javascript',
        'application/x-php',
        'image/svg+xml',
        'text/html',
        'text/javascript',
        'text/xml',
        'text/x-php',
    );
    if (in_array($mime, $blockedMimes, true)) {
        return false;
    }

    if (in_array($extension, post_files_image_extensions(), true)) {
        if (!$imgInfo || $imgInfo[2] < 1 || $imgInfo[2] > 18) {
            return false;
        }
        $imageMimes = array(
            'gif' => array('image/gif'),
            'jpg' => array('image/jpeg', 'image/pjpeg'),
            'jpeg' => array('image/jpeg', 'image/pjpeg'),
            'png' => array('image/png', 'image/x-png'),
            'webp' => array('image/webp'),
            'bmp' => array('image/bmp', 'image/x-ms-bmp'),
        );
        return in_array($mime, $imageMimes[$extension] ?? array(), true);
    }

    $documentMimes = array(
        'pdf'  => array('application/pdf'),
        'txt'  => array('text/plain', 'text/x-plain'),
        'csv'  => array('application/csv', 'application/vnd.ms-excel', 'text/csv', 'text/plain'),
        'zip'  => array('application/octet-stream', 'application/x-zip-compressed', 'application/zip', 'multipart/x-zip'),
        'hwp'  => array('application/haansofthwp', 'application/octet-stream', 'application/x-hwp'),
        'hwpx' => array('application/octet-stream', 'application/vnd.hancom.hwpx', 'application/zip'),
        'doc'  => array('application/msword', 'application/octet-stream'),
        'docx' => array(
            'application/octet-stream',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
        ),
        'xls'  => array('application/octet-stream', 'application/vnd.ms-excel'),
        'xlsx' => array(
            'application/octet-stream',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip',
        ),
        'ppt'  => array('application/octet-stream', 'application/vnd.ms-powerpoint'),
        'pptx' => array(
            'application/octet-stream',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip',
        ),
        // 압축(2026-09-30) — finfo 가 알아보는 형식과, 알아보지 못할 때의 octet-stream.
        '7z'   => array('application/octet-stream', 'application/x-7z-compressed'),
        'rar'  => array('application/octet-stream', 'application/vnd.rar', 'application/x-rar', 'application/x-rar-compressed'),
        'alz'  => array('application/octet-stream'),
        'egg'  => array('application/octet-stream'),
        'tar'  => array('application/octet-stream', 'application/x-tar'),
        'gz'   => array('application/octet-stream', 'application/gzip', 'application/x-gzip'),
        'tgz'  => array('application/octet-stream', 'application/gzip', 'application/x-gzip'),
    );

    return isset($documentMimes[$extension])
        && in_array($mime, $documentMimes[$extension], true);
}
