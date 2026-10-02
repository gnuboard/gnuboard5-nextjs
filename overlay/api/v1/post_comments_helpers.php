<?php
/**
 * 게시글 댓글 조회 (앱 SERVER-CHANGES SC-12) — 상세(`GET /posts/{bo}/{wr_id}`)의 `comments[]` 와 새 목록
 * (`GET /posts/{bo}/{wr_id}/comments`)이 같은 조건·같은 가공을 쓴다.
 *   조건: wr_parent = 글, 댓글만, 신고 숨김 제외, 차단한 작성자 제외. 정렬 wr_comment, wr_comment_reply.
 *   가공: 비밀댓글은 글쓴이·댓글쓴이·게시판 관리자(또는 세션 확인)만 본문, 닉네임·아이콘, 에디터 이미지 URL.
 */
if (!defined('_GNUBOARD_')) exit;

if (!function_exists('api_post_comment_where')) {
    /** @return array{0:string,1:array} [WHERE 절, 바인딩] */
    function api_post_comment_where(int $wr_id, $viewer): array
    {
        $conditions = [
            'wr_parent = ?',
            'wr_is_comment = 1',
            "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
        ];
        $params = [$wr_id];
        api_add_blocked_author_condition($conditions, $params, $viewer);
        return ['WHERE ' . implode(' AND ', $conditions), $params];
    }
}

if (!function_exists('api_post_count_comments')) {
    function api_post_count_comments(string $write_table, int $wr_id, $viewer): int
    {
        [$where, $params] = api_post_comment_where($wr_id, $viewer);
        $row = DB::readFetch("SELECT COUNT(*) AS cnt FROM {$write_table} {$where}", $params);
        return (int) ($row['cnt'] ?? 0);
    }
}

if (!function_exists('api_post_present_comment')) {
    /** 댓글 한 행을 응답 모양으로 — 비밀댓글 가림, 닉네임·아이콘, 에디터 이미지 URL. */
    function api_post_present_comment(array $comment, array $post, string $bo_table, $viewer): array
    {
        $comment['is_secret'] = api_is_secret_option($comment['wr_option'] ?? '');
        $canRead = !$comment['is_secret'];
        if ($comment['is_secret']) {
            $viewerId = $viewer && !empty($viewer['mb_id']) ? (string) $viewer['mb_id'] : '';
            $canRead = ($viewerId !== '' && (string) ($post['mb_id'] ?? '') === $viewerId)
                || ($viewerId !== '' && (string) ($comment['mb_id'] ?? '') === $viewerId)
                || ($viewer && Auth::adminRole($viewer, $bo_table) !== '');
            $sessionKey = 'ss_secret_comment_' . $bo_table . '_' . $comment['wr_id'];
            if (!$canRead && function_exists('get_session') && get_session($sessionKey)) {
                $canRead = true;
            }
            if (!$canRead) {
                $comment['wr_content'] = json_decode('"비밀댓글입니다."');
            }
        }
        $comment['can_read_secret'] = $canRead;

        if ($comment['mb_id']) {
            $mbRow = DB::readFetch(
                'SELECT mb_nick FROM ' . DB::table('member_table') . ' WHERE mb_id = ? LIMIT 1',
                [$comment['mb_id']]
            );
            $comment['mb_nick'] = isset($mbRow['mb_nick']) ? $mbRow['mb_nick'] : $comment['wr_name'];
        } else {
            $comment['mb_nick'] = $comment['wr_name'];
        }
        // 글쓴이 그림(api/lib/helpers.php 공용) — 같은 글쓴이의 댓글이 여러 개여도 파일은 한 번만 확인한다.
        $comment = array_merge($comment, api_member_media_urls($comment['mb_id']));
        $comment['wr_content'] = api_rewrite_editor_image_urls($comment['wr_content'] ?? '');
        return $comment;
    }
}

if (!function_exists('api_post_load_comments')) {
    /**
     * @param int|null $limit null 이면 전량(상세 기본 — Next.js 상세가 전량을 기대한다)
     * @return list<array<string,mixed>>
     */
    function api_post_load_comments(string $write_table, string $bo_table, array $post, $viewer, ?int $limit = null, int $offset = 0): array
    {
        [$where, $params] = api_post_comment_where((int) $post['wr_id'], $viewer);
        $page = '';
        if ($limit !== null) {
            $page = ' LIMIT ' . max(0, $offset) . ', ' . max(1, $limit);
        }
        $rows = DB::readFetchAll(
            "SELECT wr_id, wr_parent, wr_comment, wr_comment_reply,
                    wr_content, wr_name, mb_id, wr_datetime, wr_option,
                    wr_is_comment
               FROM {$write_table}
               {$where}
              ORDER BY wr_comment, wr_comment_reply{$page}",
            $params
        );
        return array_map(static fn(array $row) => api_post_present_comment($row, $post, $bo_table, $viewer), $rows);
    }
}
