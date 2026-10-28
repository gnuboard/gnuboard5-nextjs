<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/*
 * 웹앱 플랫폼(Next.js 테마 브리지 + 알림)의 유일한 그누보드 훅.
 *
 * 그누보드는 extend/*.extend.php 를 모든 요청에서 자동으로 실행한다. 원본을 고치지 않고
 * 코드를 끼워 넣는 통로가 이것뿐이라 파일 하나는 꼭 여기 있어야 한다. 실제 코드는 전부
 * plugin/webapp/ 에 있고 이 파일은 그것을 순서대로 읽기만 한다.
 *
 *   mail/smtp_auth.php  메일을 외부 SMTP 로그인(네이버 · Gmail 등)으로 보낸다 — G5_SMTP_AUTH_* 가 있을 때만
 *   notify/tables.php   API·알림이 쓰는 표(푸시 토큰, 큐, 알림 이력, 로그인 토큰 …) 등록과 설치기
 *   post-history/admin.php 삭제·이동된 매뉴얼 이력의 /adm 보관함
 *   bridge/api_session.php  새 화면 로그인이 끊기면(세션 목록·전체 로그아웃) 함께 열린 그누보드 세션(/adm)도 닫기
 *   bridge/runtime.php  테마 브리지 부팅 — 사이트 주소 확정, 짧은 주소 규칙·테마 변경 훅
 *   bridge/social.php   소셜 로그인 팝업과 앱 사이의 다리
 *   bridge/legacy_guard.php  예전 쇼핑 처리 주소(cartupdate · wishupdate)의 위조 요청, 1:1 문의 문자 폭주,
 *                            소셜 로그인 복귀 주소(url) 막기 — 원본을 고치지 않고
 *   notify/events.php   그누보드 화면의 댓글·답글·쪽지 이벤트 → 알림(Notify::emit)
 *   notify/admin.php    관리자 → 알림 발송 현황 화면
 *   notify/admin_prefs.php  관리자 → 알림 설정 현황(회원별 알림 수신 설정)
 *   notify/admin_order_push.php  관리자 주문 저장(입금 확인·송장) 직후 앱 주문 푸시(SC-07, 예전 g5app.extend.php)
 *   editor/events.php   글 · 댓글 · 상품 후기 · 문의 · 1:1 문의를 지우면 웹 에디터로 올린 사진(대장에 붙은 것)도 지우기
 *
 * plugin/webapp/ 가 없으면 조용히 끝낸다 — 이 파일만 남은 설치본이 죽지 않게.
 */

$g5_webapp_plugin_dir = (defined('G5_PATH') ? G5_PATH : dirname(__DIR__)) . '/plugin/webapp';

if (is_dir($g5_webapp_plugin_dir)) {
    foreach (array('mail/smtp_auth.php', 'notify/tables.php', 'post-history/service.php', 'post-history/admin.php', 'bridge/api_session.php', 'bridge/runtime.php', 'bridge/social.php', 'bridge/legacy_guard.php', 'notify/events.php', 'notify/admin.php', 'notify/admin_prefs.php', 'notify/admin_order_push.php', 'editor/events.php', 'theme-settings/settings.php', 'theme-settings/chapters.php', 'theme-settings/service.php', 'theme-settings/admin.php') as $g5_webapp_plugin_file) {
        if (is_file($g5_webapp_plugin_dir . '/' . $g5_webapp_plugin_file)) {
            require_once $g5_webapp_plugin_dir . '/' . $g5_webapp_plugin_file;
        }
    }
}

unset($g5_webapp_plugin_dir, $g5_webapp_plugin_file);
