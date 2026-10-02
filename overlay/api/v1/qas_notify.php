<?php
/**
 * 1:1 문의 메일 · 문자 알림 — 그누보드 bbs/qawrite_update.php 와 같은 조건 · 같은 문구.
 *
 *   새 답변($w = 'a')  질문자에게 메일(qa_email_recv · qa_email), 문자(qa_sms_recv · qa_hp)
 *   새 질문($w = '' · 'r')  관리자에게 메일(qa_admin_email), 문자(qa_admin_hp)
 *   문자는 사이트가 아이코드 문자를 쓰고(cf_sms_use = icode) 1:1문의 문자 사용(qa_use_sms)이 켜졌을 때만.
 *   메일은 그누보드 mailer() 가 사이트 메일 사용(cf_email_use)을 스스로 확인한다.
 *
 * api_qa_notification_plan() 이 보낼 것을 정하고(DB · 네트워크 없이 시험한다 — tests/smoke/QaContentTest.php),
 * api_qa_send_notifications() 가 보낸다. 앱 푸시는 따로(api_qa_push_answer_notification).
 */

if (!defined('_GNUBOARD_')) exit;

function api_qa_digits($value)
{
    return preg_replace('/[^0-9]/', '', (string) $value);
}

/**
 * 메일 본문 — 그누보드 화면(conv_content)과 같은 수준으로 거른다. 그누보드 qawrite_update.php 는 글쓴이의 HTML 을
 * 그대로 메일에 넣는데, 에디터 문의는 아무 회원이나 HTML 을 쓸 수 있어 관리자에게 가짜 링크 · 외부 그림을 보낼 수 있다.
 * 글자 문의(0)는 이스케이프하고 줄바꿈을 <br> 로, HTML(1 · 2)은 html_purifier 로(2 는 줄바꿈을 먼저 <br> 로).
 */
function api_qa_mail_body($content, $html)
{
    // 그누보드는 여기서 stripslashes 를 하는데(magic quotes 시절 요청값용), 이 본문은 DB 나 정리된 입력이라
    // 역슬래시가 진짜 글자다(예: 윈도 경로) — 지우지 않는다.
    $content = (string) $content;
    if ((int) $html > 0) {
        if ((int) $html === 2) {
            $content = nl2br($content);
        }
        return function_exists('html_purifier')
            ? html_purifier($content)
            : nl2br(htmlspecialchars(strip_tags($content), ENT_QUOTES, 'UTF-8'));
    }

    return nl2br(htmlspecialchars(conv_unescape_nl($content), ENT_QUOTES, 'UTF-8'));
}

/**
 * @param string $w        '' 새 질문, 'r' 추가질문, 'a' 새 답변(답변 수정은 알리지 않는다 — 그누보드와 같다)
 * @param array  $question 질문 행 — 새 답변이면 답을 받을 질문, 새 질문이면 방금 저장한 질문
 * @param string $content  이번에 저장한 본문(질문 또는 답변)
 * @param int    $html     그 본문의 qa_html(0 · 1 · 2)
 * @return array<int, array<string, string>> channel(mail|sms) · to · from · from_name · reply_to · subject · content
 */
function api_qa_notification_plan($w, array $question, $content, $html, array $qaConfig, array $config)
{
    $plan = [];
    $isAnswer = $w === 'a';
    $isQuestion = $w === '' || $w === 'r';
    if (!$isAnswer && !$isQuestion) {
        return $plan;
    }

    $title = (string) ($config['cf_title'] ?? '') . ' ' . (string) ($qaConfig['qa_title'] ?? '');

    if (($config['cf_sms_use'] ?? '') === 'icode' && !empty($qaConfig['qa_use_sms'])) {
        $from = api_qa_digits($qaConfig['qa_send_number'] ?? '');
        if ($isAnswer && !empty($question['qa_sms_recv']) && trim((string) ($question['qa_hp'] ?? '')) !== '') {
            $to = api_qa_digits($question['qa_hp']);
            if ($to !== '') {
                $plan[] = ['channel' => 'sms', 'to' => $to, 'from' => $from, 'content' => $title . '에 답변이 등록되었습니다.'];
            }
        }
        if ($isQuestion && trim((string) ($qaConfig['qa_admin_hp'] ?? '')) !== '') {
            $to = api_qa_digits($qaConfig['qa_admin_hp']);
            if ($to !== '') {
                $plan[] = ['channel' => 'sms', 'to' => $to, 'from' => $from, 'content' => $title . '에 문의글이 등록되었습니다.'];
            }
        }
    }

    $mailBody = api_qa_mail_body($content, $html);
    $fromName = (string) ($config['cf_admin_email_name'] ?? '');
    $siteMail = (string) ($config['cf_admin_email'] ?? '');
    if ($isAnswer && !empty($question['qa_email_recv']) && trim((string) ($question['qa_email'] ?? '')) !== '') {
        $plan[] = [
            'channel' => 'mail',
            'to' => trim((string) $question['qa_email']),
            'from' => $siteMail,
            'from_name' => $fromName,
            'reply_to' => '',
            'subject' => $title . ' 답변 알림 메일',
            'content' => $mailBody,
        ];
    }
    if ($isQuestion && trim((string) ($qaConfig['qa_admin_email'] ?? '')) !== '') {
        // 그누보드는 질문자 메일을 보낸 사람(From)으로 쓴다. 우리 서버가 남의 도메인(gmail 등)을 보낸 사람으로 적으면
        // SPF · DMARC 에 걸려 스팸함으로 가거나 거부된다 — 보낸 사람은 사이트 메일, 질문자는 답장 받을 주소로.
        // 관리자가 "답장"을 누르면 그대로 질문자에게 간다.
        $plan[] = [
            'channel' => 'mail',
            'to' => trim((string) $qaConfig['qa_admin_email']),
            'from' => $siteMail,
            'from_name' => $fromName,
            'reply_to' => trim((string) ($question['qa_email'] ?? '')),
            'subject' => $title . ' 질문 알림 메일',
            'content' => $mailBody,
        ];
    }

    return $plan;
}

/** 계획대로 보낸다. 실패해도 문의 저장 응답은 막지 않는다(로그만). 라이브러리가 찍는 출력도 응답에 섞지 않는다. */
function api_qa_send_notifications(array $plan, array $config)
{
    foreach ($plan as $message) {
        ob_start();
        try {
            if ($message['channel'] === 'mail') {
                include_once G5_LIB_PATH . '/mailer.lib.php';
                // 안의 mailer · mail_options · mail_send_result 훅도 보호해서(api/lib/hooks.php)
                api_call_core('mailer', array(
                    $message['from_name'], $message['from'], $message['to'], $message['subject'], $message['content'], 1,
                    '', '', '', (string) ($message['reply_to'] ?? ''),
                ));
            } else {
                api_qa_send_sms($message, $config);
            }
        } catch (\Throwable $e) {
            error_log('[api_qa_send_notifications] ' . $message['channel'] . ': ' . $e->getMessage());
        } finally {
            ob_end_clean();
        }
    }
}

/** 아이코드 문자 — 그누보드처럼 사이트 설정이 LMS 면 LMS 모듈, 아니면 SMS 모듈. */
function api_qa_send_sms(array $message, array $config)
{
    if (($config['cf_sms_type'] ?? '') === 'LMS') {
        include_once G5_LIB_PATH . '/icode.lms.lib.php';
        $port = get_icode_port_type($config['cf_icode_id'], $config['cf_icode_pw']);
        if ($port === false) {
            return;
        }
        $sms = new LMS;
        $sms->SMS_con($config['cf_icode_server_ip'], $config['cf_icode_id'], $config['cf_icode_pw'], $port);
        $added = $sms->Add(array($message['to']), $message['from'], iconv_euckr(trim((string) $config['cf_title'])), '', '', iconv_euckr($message['content']), '', 1);
        if ($added) {
            $sms->Send();
        }
        $sms->Init();
        return;
    }

    include_once G5_LIB_PATH . '/icode.sms.lib.php';
    $sms = new SMS;
    $sms->SMS_con($config['cf_icode_server_ip'], $config['cf_icode_id'], $config['cf_icode_pw'], $config['cf_icode_server_port']);
    $sms->Add($message['to'], $message['from'], $config['cf_icode_id'], iconv('utf-8', 'euc-kr', stripslashes($message['content'])), '');
    $sms->Send();
}

/** 새 답변 앱 푸시 — 질문한 회원에게(Notify, 회원 글만). 메일 · 문자와 따로 간다. */
function api_qa_push_answer_notification($question, $answerPayload, $answerId = 0)
{
    $mbId = isset($question['mb_id']) ? trim((string) $question['mb_id']) : '';
    if ($mbId === '' || !class_exists('Notify')) {
        return;
    }

    $qaId = (int) ($question['qa_id'] ?? 0);
    $subject = trim((string) ($question['qa_subject'] ?? ''));
    $body = $subject !== ''
        ? $subject
        : trim((string) ($answerPayload['qa_subject'] ?? '고객센터 답변을 확인해 주세요.'));

    try {
        Notify::emit('qa.answered', $mbId, '1:1 문의 답변이 등록되었어요', $body, [
            'qa_id' => (string) $qaId,
            'qa_answer_id' => (string) ((int) $answerId),
            'qa_category' => (string) ($question['qa_category'] ?? ''),
            'link' => '/mypage/qas/' . (int) $qaId,
        ]);
    } catch (\Throwable $e) {
        error_log('[api_qa_push_answer_notification] ' . $e->getMessage());
    }
}
