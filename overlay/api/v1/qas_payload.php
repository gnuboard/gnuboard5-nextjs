<?php
/**
 * 1:1 문의 저장 값 — 질문 · 답변 요청을 검사하고 저장할 값으로 만든다(분류 · 메일 · 휴대폰 필수, 제목 · 본문).
 * api/v1/qas.php 가 불러 쓴다(api_qa_categories · api_qa_clean_text 는 qas.php, 본문 정리는 qas_content.php).
 */

if (!defined('_GNUBOARD_')) exit;

function api_qa_validate_category($category, $qaConfig, $required = true)
{
    $categories = api_qa_categories($qaConfig);

    if (!$categories) {
        return '';
    }

    if ($category === '' && $required) {
        Response::error('Please select a category.', 422);
    }

    if ($category !== '' && !in_array($category, $categories, true)) {
        Response::error('Invalid Q&A category.', 422);
    }

    return $category;
}

function api_qa_question_payload($input, $qaConfig, $member, $currentHtml = 0)
{
    $category = api_qa_clean_text(isset($input['qa_category']) ? $input['qa_category'] : '', 255);
    $category = api_qa_validate_category($category, $qaConfig, true);

    $email = '';
    if (!empty($input['qa_email'])) {
        $email = function_exists('get_email_address')
            ? get_email_address(trim((string) $input['qa_email']))
            : trim((string) $input['qa_email']);
    }
    if ((int) ($qaConfig['qa_req_email'] ?? 0) === 1 && $email === '') {
        Response::error('Please enter an email address.', 422);
    }

    $hp = isset($input['qa_hp']) ? preg_replace('/[^0-9\-]/', '', (string) $input['qa_hp']) : '';
    if ((int) ($qaConfig['qa_req_hp'] ?? 0) === 1 && $hp === '') {
        Response::error('Please enter a mobile phone number.', 422);
    }

    $subject = api_qa_clean_text(isset($input['qa_subject']) ? $input['qa_subject'] : '', 255);
    $html = api_qa_html_flag($input, $currentHtml);
    $content = api_qa_clean_content(isset($input['qa_content']) ? $input['qa_content'] : '', $html);

    if ($subject === '') {
        Response::error('Please enter a subject.', 422);
    }
    if ($content === '') {
        Response::error('Please enter content.', 422);
    }

    return [
        'qa_category'   => $category,
        'qa_email'      => $email,
        'qa_hp'         => $hp,
        'qa_subject'    => $subject,
        'qa_content'    => $content,
        'qa_email_recv' => !empty($input['qa_email_recv']) ? 1 : 0,
        'qa_sms_recv'   => !empty($input['qa_sms_recv']) ? 1 : 0,
        'qa_html'       => $html,
        'qa_name'       => isset($member['mb_nick']) && $member['mb_nick'] !== ''
            ? $member['mb_nick']
            : (isset($member['mb_name']) ? $member['mb_name'] : $member['mb_id']),
    ];
}

function api_qa_answer_payload($input, $currentHtml = 0)
{
    $subject = api_qa_clean_text(isset($input['qa_subject']) ? $input['qa_subject'] : '', 255);
    $html = api_qa_html_flag($input, $currentHtml);
    $content = api_qa_clean_content(isset($input['qa_content']) ? $input['qa_content'] : '', $html);

    if ($subject === '') {
        Response::error('Please enter an answer subject.', 422);
    }
    if ($content === '') {
        Response::error('Please enter answer content.', 422);
    }

    return [
        'qa_subject' => $subject,
        'qa_content' => $content,
        'qa_html'    => $html,
    ];
}
