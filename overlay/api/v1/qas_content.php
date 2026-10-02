<?php
/**
 * 1:1 문의 본문 처리 — 저장할 본문 정리, 응답에 실을 본문, qa_html 값.
 * api/v1/qas.php 가 불러 쓴다. 라우트가 없어 DB 없이 시험한다(tests/smoke/QaContentTest.php).
 */

if (!defined('_GNUBOARD_')) exit;

/** 요청의 qa_html — 0 글자, 1 HTML, 2 HTML + 자동 줄바꿈(그누보드 qawrite_update.php 와 같은 값). */
function api_qa_html_flag($input, $fallback = 0)
{
    // 수정 요청에 qa_html 이 없으면(이 값을 모르는 예전 화면 · 앱) 원래 값을 지킨다 — 0 으로 두면 에디터로 쓴 글의
    // 태그가 지워져 서식 · 사진이 사라진다. 새 글은 $fallback 이 0 이다.
    if (!isset($input['qa_html']) || $input['qa_html'] === '') {
        $html = (int) $fallback;
    } else {
        $html = (int) $input['qa_html'];
    }

    return ($html === 1 || $html === 2) ? $html : 0;
}

/**
 * 응답에 실을 본문. HTML 글은 에디터 사진 주소를 이 API 주소로 바꿔 준다 — 게시판 글과 같다
 * (저장할 때 api_qa_clean_content 가 그누보드 원래 형식으로 되돌린다).
 */
function api_qa_content_for_output($row)
{
    $content = isset($row['qa_content']) ? (string) $row['qa_content'] : '';
    if ((int) ($row['qa_html'] ?? 0) > 0 && function_exists('api_rewrite_editor_image_urls')) {
        $content = api_rewrite_editor_image_urls($content);
    }

    return $content;
}

/**
 * 저장할 본문. HTML 글($html 1 · 2)은 그누보드 qawrite_update.php 처럼 HTML 을 그대로 두고(보여 줄 때 거른다 —
 * 그누보드 conv_content, 앱 SafeHtml), 에디터 사진의 API 주소만 원래 형식으로 되돌린다. 글자 글(0)은 태그를 지운다.
 */
function api_qa_clean_content($value, $html = 0)
{
    $value = trim((string) $value);
    if (substr_count($value, '&#') > 50) {
        Response::error('Invalid content.', 422);
    }

    if ((int) $html > 0) {
        if (function_exists('api_restore_editor_image_urls')) {
            $value = api_restore_editor_image_urls($value);
        }
    } elseif (function_exists('clean_xss_tags')) {
        // 마지막 0: 줄바꿈 · 탭은 남긴다. 기본값(1)은 한 줄 값용이라 여러 줄 문의가 한 줄로 붙어 저장됐다.
        $value = clean_xss_tags($value, 1, 1, 0, 0);
    } else {
        $value = strip_tags($value);
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, 65536, 'UTF-8');
    }

    return substr($value, 0, 65536);
}
