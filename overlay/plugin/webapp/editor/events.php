<?php
if (!defined('_GNUBOARD_')) exit; // 개별 페이지 접근 불가

/*
 * 웹 에디터 사진 대장(g5_editor_image) — 글을 지우면 그 글에 붙은 사진 파일도 지우고, 글을 옮기면 대장을 따라 고친다.
 *
 * 그누보드 화면(bbs/delete.php …) · 관리자 화면(상품 후기 · 문의 일괄 삭제) · 새 화면 API(api/v1/*)가 모두 같은 그누보드
 * 이벤트를 부르므로 여기 한 곳에서 받는다. 대장에 붙어 있는(ei_state 1) 사진만 지운다 — 대장에 없는 예전 사진, 앱이 바로
 * 올린 사진, 복사된 글이 함께 쓰는 사진은 건드리지 않는다. 실제 일은 api/lib/editor-uploads.php.
 *
 *   bbs_delete · bbs_delete_all  글(과 그 댓글)      shop_item_use_deleted · shop_admin_item_use_deleted  상품 후기
 *   bbs_delete_comment          댓글               shop_item_qa_deleted · shop_admin_item_qa_deleted    상품 문의
 *   qa_delete                   1:1 문의 · 답변     bbs_move_copy  글 옮기기(대장 고침) · 복사(지우지 않음으로)
 *
 * 사진을 못 지워도 글 지우기는 이미 끝났으므로 로그만 남긴다.
 */

if (!function_exists('webapp_editor_images_run')) {
    /** api/lib 의 대장 함수를 불러 $fn 을 돌린다. 대장 표가 없거나(업그레이드 전) API 폴더가 없으면 아무 것도 안 한다. */
    function webapp_editor_images_run(callable $fn): void
    {
        static $ready = null;
        if ($ready === null) {
            $lib = G5_PATH . '/api/lib';
            $ready = false;
            if (is_file($lib . '/DB.php') && is_file($lib . '/editor-uploads.php')) {
                require_once $lib . '/DB.php';
                require_once $lib . '/editor-uploads.php';
                $ready = api_editor_uploads_ready();
            }
        }
        if (!$ready) {
            return;
        }
        try {
            $fn();
        } catch (Throwable $e) {
            error_log('[editor-images] ' . $e->getMessage());
        }
    }

    function webapp_editor_images_board_table($board): string
    {
        return is_array($board) ? (string) ($board['bo_table'] ?? '') : '';
    }

    /** 수정 이력을 남기는 게시판(매뉴얼, plugin/webapp/post-history) — 지운 글의 옛 판이 보관함에 남아 그 사진을 계속 쓴다. */
    function webapp_editor_images_keeps_history($board): bool
    {
        return is_array($board) && function_exists('webapp_post_history_is_tracked_board') && webapp_post_history_is_tracked_board($board);
    }

    /** 글을 지웠다 — 글과 그 댓글(ei_parent_id 가 글 번호)의 사진. 이력 게시판이면 글 자신의 사진은 남긴다. */
    function webapp_editor_images_on_bbs_delete($write, $board = null): void
    {
        $boTable = webapp_editor_images_board_table($board);
        $wrId = is_array($write) ? (int) ($write['wr_id'] ?? 0) : 0;
        $keep = webapp_editor_images_keeps_history($board);
        webapp_editor_images_run(static function () use ($boTable, $wrId, $keep) {
            if ($keep) {
                api_editor_keep_attached('write', $boTable, $wrId);
            }
            api_editor_delete_attached('write', $boTable, $wrId, true);
        });
    }

    /** 목록에서 여러 글을 지웠다. */
    function webapp_editor_images_on_bbs_delete_all($wrIds, $board = null): void
    {
        $boTable = webapp_editor_images_board_table($board);
        $keep = webapp_editor_images_keeps_history($board);
        webapp_editor_images_run(static function () use ($wrIds, $boTable, $keep) {
            foreach ((array) $wrIds as $wrId) {
                if ($keep) {
                    api_editor_keep_attached('write', $boTable, (int) $wrId);
                }
                api_editor_delete_attached('write', $boTable, (int) $wrId, true);
            }
        });
    }

    function webapp_editor_images_on_comment_delete($commentId, $board = null): void
    {
        $boTable = webapp_editor_images_board_table($board);
        webapp_editor_images_run(static function () use ($commentId, $boTable) {
            api_editor_delete_attached('write', $boTable, (int) $commentId);
        });
    }

    /** 1:1 문의를 지웠다 — $deleted 에 함께 지운 답변까지 들어 있다. */
    function webapp_editor_images_on_qa_delete($requested = array(), $deleted = array()): void
    {
        webapp_editor_images_run(static function () use ($deleted) {
            foreach ((array) $deleted as $qaId) {
                api_editor_delete_attached('qa', '', (int) $qaId);
            }
        });
    }

    function webapp_editor_images_on_item_use_delete($isId): void
    {
        webapp_editor_images_run(static function () use ($isId) {
            api_editor_delete_attached('item_use', '', (int) $isId);
        });
    }

    function webapp_editor_images_on_item_qa_delete($iqId): void
    {
        webapp_editor_images_run(static function () use ($iqId) {
            api_editor_delete_attached('item_qa', '', (int) $iqId);
        });
    }

    /**
     * 글을 옮기거나 복사했다 — 한 행(글 · 댓글)씩 온다. 글이 댓글보다 먼저 오므로 새 글 번호를 기억해 댓글의 새 부모로 쓴다.
     */
    function webapp_editor_images_on_move_copy($row, $dstBoTable = '', $insertId = 0, $nextWrNum = 0, $sw = ''): void
    {
        static $newParents = array();
        if (!is_array($row)) {
            return;
        }
        $oldId = (int) ($row['wr_id'] ?? 0);
        $key = (string) $dstBoTable;
        if ((int) ($row['wr_is_comment'] ?? 0) === 0) {
            $newParents[$key][$oldId] = (int) $insertId;
            $newParent = (int) $insertId;
        } else {
            $newParent = (int) ($newParents[$key][(int) ($row['wr_parent'] ?? 0)] ?? 0);
        }
        $content = (string) ($row['wr_content'] ?? '');
        webapp_editor_images_run(static function () use ($content, $oldId, $dstBoTable, $insertId, $newParent, $sw) {
            api_editor_move_copy($content, $oldId, (string) $dstBoTable, (int) $insertId, $newParent, $sw !== 'move');
        });
    }
}

add_event('bbs_delete', 'webapp_editor_images_on_bbs_delete', G5_HOOK_DEFAULT_PRIORITY, 2);
add_event('bbs_delete_all', 'webapp_editor_images_on_bbs_delete_all', G5_HOOK_DEFAULT_PRIORITY, 2);
add_event('bbs_delete_comment', 'webapp_editor_images_on_comment_delete', G5_HOOK_DEFAULT_PRIORITY, 2);
add_event('qa_delete', 'webapp_editor_images_on_qa_delete', G5_HOOK_DEFAULT_PRIORITY, 2);
add_event('shop_item_use_deleted', 'webapp_editor_images_on_item_use_delete', G5_HOOK_DEFAULT_PRIORITY, 1);
add_event('shop_admin_item_use_deleted', 'webapp_editor_images_on_item_use_delete', G5_HOOK_DEFAULT_PRIORITY, 1);
add_event('shop_item_qa_deleted', 'webapp_editor_images_on_item_qa_delete', G5_HOOK_DEFAULT_PRIORITY, 1);
add_event('shop_admin_item_qa_deleted', 'webapp_editor_images_on_item_qa_delete', G5_HOOK_DEFAULT_PRIORITY, 1);
add_event('bbs_move_copy', 'webapp_editor_images_on_move_copy', G5_HOOK_DEFAULT_PRIORITY, 5);
