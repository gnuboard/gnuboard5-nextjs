"use client";

import { useState, useCallback, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Comment } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toast";
import { SafeHtml } from "@/components/SafeHtml";
import { MemberSideview } from "@/components/MemberSideview";
import { htmlToPlainText } from "@/lib/sanitize";

const CommentEditor = dynamic(
  () => import("@/components/editor/CommentEditor").then((mod) => ({ default: mod.CommentEditor })),
  {
    ssr: false,
    loading: () => <div className="skeleton min-h-[80px] rounded-lg border" />,
  }
);

interface CommentSectionProps {
  boTable: string;
  wrId: string;
  initialComments: Comment[];
  useEditor?: boolean;
}

interface CommentItemProps {
  comment: Comment;
  boTable: string;
  onReply: (commentId: number) => void;
  replyTo: number | null;
  onCommentSubmit: (content: string, parentId?: number) => Promise<void>;
  onUpdate: (commentId: number, content: string) => Promise<void>;
  onDelete: (commentId: number) => void;
  useEditor?: boolean;
}

function isContentEmpty(content: string): boolean {
  return !htmlToPlainText(content);
}

const CommentItem = memo(function CommentItem({
  comment,
  boTable,
  onReply,
  replyTo,
  onCommentSubmit,
  onUpdate,
  onDelete,
  useEditor,
}: CommentItemProps) {
  const { user } = useAuthStore();
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.wr_content);
  const [saving, setSaving] = useState(false);

  const isOwner = user && (user.mb_id === comment.mb_id || user.mb_level >= 10);
  const isReplyOpen = replyTo === comment.wr_id;
  const indent = (comment.wr_comment_reply?.length ?? 0) * 24;

  const handleReplySubmit = async () => {
    if (isContentEmpty(replyContent)) return;
    setSubmitting(true);
    try {
      await onCommentSubmit(replyContent, comment.wr_id);
      setReplyContent("");
      onReply(-1);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => {
    setEditContent(comment.wr_content);
    setEditing(true);
    onReply(-1);
  };

  const handleEditSave = async () => {
    if (isContentEmpty(editContent)) return;
    setSaving(true);
    try {
      await onUpdate(comment.wr_id, editContent);
      setEditing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "댓글 수정에 실패했습니다.";
      toastError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginLeft: `${indent}px` }} className="py-3 border-b last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-sm">
          <MemberSideview
            mbId={comment.mb_id}
            name={comment.mb_nick || comment.wr_name}
            iconUrl={comment.member?.mb_icon_path}
            boTable={boTable}
            className="font-medium"
          />
          <span className="text-muted-foreground text-xs">
            {formatDate(comment.wr_datetime)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onReply(isReplyOpen ? -1 : comment.wr_id)}
            >
              답글
            </Button>
          )}
          {isOwner && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={startEdit}
            >
              수정
            </Button>
          )}
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive"
              onClick={() => onDelete(comment.wr_id)}
            >
              삭제
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="comment-edit-form mt-2 space-y-2">
          {useEditor ? (
            <CommentEditor
              content={editContent}
              onChange={setEditContent}
              placeholder="댓글을 입력하세요"
            />
          ) : (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="댓글을 입력하세요"
              rows={3}
              className="text-sm"
              aria-label="댓글 수정"
              autoFocus
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleEditSave}
              disabled={saving || isContentEmpty(editContent)}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      ) : (
        <SafeHtml
          className="text-sm leading-relaxed"
          html={comment.wr_content}
          policy="user"
        />
      )}

      {/* Reply Form */}
      {isReplyOpen && (
        <div className="mt-3 space-y-2">
          {useEditor ? (
            <CommentEditor
              content={replyContent}
              onChange={setReplyContent}
              placeholder="답글을 입력하세요"
            />
          ) : (
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="답글을 입력하세요"
              rows={2}
              className="text-sm"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReply(-1)}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleReplySubmit}
              disabled={submitting || isContentEmpty(replyContent)}
            >
              {submitting ? "등록 중..." : "답글 등록"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

export function CommentSection({ boTable, wrId, initialComments, useEditor }: CommentSectionProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);

  // 에디터 내용은 ref로 관리하여 타이핑 시 리렌더 방지
  const newCommentRef = useRef("");
  const [canSubmit, setCanSubmit] = useState(false);

  // textarea용 상태 (useEditor가 false일 때만 사용)
  const [textareaValue, setTextareaValue] = useState("");

  const handleEditorChange = useCallback((html: string) => {
    newCommentRef.current = html;
    const empty = isContentEmpty(html);
    setCanSubmit((prev) => {
      if (prev === !empty) return prev;
      return !empty;
    });
  }, []);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTextareaValue(val);
    newCommentRef.current = val;
  }, []);

  const fetchComments = useCallback(async () => {
    try {
      const res = await apiClient.get<{ comments?: Comment[] }>(`/posts/${boTable}/${wrId}`);
      setComments(res.data?.comments ?? []);
    } catch {
      // keep current state
    }
  }, [boTable, wrId]);

  const handleSubmitComment = useCallback(async (content: string, parentId?: number) => {
    await apiClient.post(`/comments/${boTable}/${wrId}`, {
      wr_content: content,
      comment_id: parentId,
    });
    await fetchComments();
    // post 상세의 wr_comment 카운트 / 게시판 listing 의 댓글 수 동기화.
    router.refresh();
  }, [boTable, wrId, fetchComments, router]);

  const handleNewComment = useCallback(async () => {
    const content = newCommentRef.current;
    if (isContentEmpty(content)) return;
    setSubmitting(true);
    try {
      await handleSubmitComment(content);
      newCommentRef.current = "";
      setCanSubmit(false);
      setTextareaValue("");
      // 에디터 리셋을 위해 강제 리마운트
      setEditorKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "댓글 등록에 실패했습니다.";
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  }, [handleSubmitComment]);

  // 서버가 권한(본인 · 최고/그룹/게시판 관리자)을 다시 확인한다. 실패 메시지는 CommentItem 이 띄운다.
  const handleUpdate = useCallback(async (commentId: number, content: string) => {
    await apiClient.patch(`/comments/${boTable}/${commentId}`, { wr_content: content });
    await fetchComments();
  }, [boTable, fetchComments]);

  const handleDelete = useCallback(async (commentId: number) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    try {
      await apiClient.delete(`/comments/${boTable}/${commentId}`);
      await fetchComments();
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "삭제에 실패했습니다.";
      toastError(message);
    }
  }, [boTable, fetchComments, router]);

  // 에디터 리셋용 key
  const [editorKey, setEditorKey] = useState(0);

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold mb-4">
          댓글 <span className="text-primary">{comments.length}</span>
        </h3>

        {/* Comment List */}
        {comments.length > 0 && (
          <div className="mb-6">
            {comments.map((comment) => (
              <CommentItem
                key={comment.wr_id}
                comment={comment}
                boTable={boTable}
                onReply={setReplyTo}
                replyTo={replyTo}
                onCommentSubmit={handleSubmitComment}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                useEditor={useEditor}
              />
            ))}
          </div>
        )}

        {/* New Comment Form */}
        {user ? (
          <div className="space-y-3">
            {useEditor ? (
              <CommentEditor
                key={editorKey}
                content=""
                onChange={handleEditorChange}
                placeholder="댓글을 입력하세요"
              />
            ) : (
              <Textarea
                value={textareaValue}
                onChange={handleTextareaChange}
                placeholder="댓글을 입력하세요"
                rows={3}
              />
            )}
            <div className="flex justify-end">
              <Button
                onClick={handleNewComment}
                disabled={submitting || (useEditor ? !canSubmit : !textareaValue.trim())}
              >
                {submitting ? "등록 중..." : "댓글 등록"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            댓글을 작성하려면 로그인이 필요합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
