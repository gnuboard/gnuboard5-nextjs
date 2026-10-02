<?php
/**
 * GET /v1/recent 의 도우미 — 테스트(tests/smoke/RecentCommentExcerptTest.php)가 라우트를 돌리지 않고 부를 수 있게 따로 둔다.
 */

if (!defined('_GNUBOARD_')) exit;

if (!function_exists('api_recent_comment_excerpt')) {
    /**
     * 최근 댓글 요약 — 레퍼런스 사이드바(theme/solune widget/comment_stream.php)와 같은 규칙:
     * 태그를 빼고 공백을 접어 60자. 목록은 그누보드 new.php 처럼 게시판 읽기 레벨을 보지 않으므로
     * 본문은 보는 사람이 그 게시판을 읽을 수 있고, 비밀댓글·비밀글의 댓글이 아닐 때만 싣는다.
     * 그 밖에는 null — 화면은 종전대로 글 제목을 보여 준다.
     */
    function api_recent_comment_excerpt(array $comment, array $parent, int $boardReadLevel, $viewer): ?string
    {
        if (api_is_secret_option($comment['wr_option'] ?? '')
            || api_is_secret_option($parent['wr_option'] ?? '')) {
            return null;
        }
        $isSuper = $viewer && Auth::adminRole($viewer) === 'super';
        $level = $viewer ? (int) ($viewer['mb_level'] ?? 1) : 1;
        if (!$isSuper && $level < max(1, $boardReadLevel)) {
            return null;
        }

        $text = str_ireplace(array('<br>', '<br />', '<br/>'), ' ', (string) ($comment['wr_content'] ?? ''));
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));
        if ($text === '') {
            return null;
        }
        return mb_strlen($text, 'UTF-8') > 60 ? mb_substr($text, 0, 60, 'UTF-8') . '…' : $text;
    }
}
