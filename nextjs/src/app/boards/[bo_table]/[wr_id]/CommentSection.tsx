"use client";

import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Comment } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  onCommentSubmit: (content: string, parentId?: number, secret?: boolean) => Promise<void>;
  onUpdate: (commentId: number, content: string, secret: boolean) => Promise<void>;
  onDelete: (commentId: number) => void;
  useEditor?: boolean;
  /** 주소의 #c_번호 로 찾아온 댓글 — 잠깐 강조한다. */
  highlighted?: boolean;
}

/** 강조를 유지하는 시간(ms). 눈이 그 자리를 찾을 만큼만 둔다. */
const COMMENT_HIGHLIGHT_MS = 2500;
/** 찾아간 댓글을 붙잡아 두는 최대 시간(ms). 본문 이미지가 늦게 읽혀 페이지가 길어지면 댓글이 밀려나므로 다시 맞춘다. */
const COMMENT_PIN_MS = 8000;
/** 이 입력이 오면 붙잡기를 그만둔다 — 사용자가 직접 움직이는 화면을 끌어가지 않는다. */
const COMMENT_PIN_STOP_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * 댓글을 가운데에 두고, 페이지 높이가 바뀌면(이미지 로드 등) 다시 가운데로 맞춘다. 그만두는 함수를 돌려준다.
 * 시간이 다 되거나 사용자가 스크롤·클릭·키 입력을 하면 그만둔다.
 */
function pinCommentInView(target: HTMLElement): () => void {
  let stopped = false;
  const recenter = () => {
    if (!stopped && target.isConnected) target.scrollIntoView({ block: "center" });
  };
  // 높이 변화는 ResizeObserver 로, 늦게 읽히는 본문 이미지는 load 이벤트(캡처 — img 의 load 는 버블되지 않는다)로도
  // 잡는다. 화면 그리기가 쉬는 탭에서는 ResizeObserver 가 늦게 오므로 이미지 쪽이 확실한 신호다.
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(recenter);
  const onMediaLoad = (event: Event) => {
    if (event.target instanceof HTMLImageElement || event.target instanceof HTMLIFrameElement) recenter();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    window.clearTimeout(timer);
    document.removeEventListener("load", onMediaLoad, true);
    COMMENT_PIN_STOP_EVENTS.forEach((type) => window.removeEventListener(type, stop));
  };
  const timer = window.setTimeout(stop, COMMENT_PIN_MS);
  observer?.observe(document.body);
  document.addEventListener("load", onMediaLoad, true);
  COMMENT_PIN_STOP_EVENTS.forEach((type) => window.addEventListener(type, stop, { passive: true }));
  recenter();
  return stop;
}

function isContentEmpty(content: string): boolean {
  return !htmlToPlainText(content);
}

/** 비밀 댓글 체크 — 그누보드 기본 스킨 댓글 폼의 "비밀글"(wr_secret=secret). 원본처럼 늘 보인다. */
function SecretCommentCheck({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="comment-secret-check mr-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
      <Checkbox id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      비밀글
    </label>
  );
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
  highlighted = false,
}: CommentItemProps) {
  const { user } = useAuthStore();
  const [replyContent, setReplyContent] = useState("");
  const [replySecret, setReplySecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.wr_content);
  const [editSecret, setEditSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const isOwner = user && (user.mb_id === comment.mb_id || user.mb_level >= 10);
  const isReplyOpen = replyTo === comment.wr_id;
  const indent = (comment.wr_comment_reply?.length ?? 0) * 24;

  const handleReplySubmit = async () => {
    if (isContentEmpty(replyContent)) return;
    setSubmitting(true);
    try {
      await onCommentSubmit(replyContent, comment.wr_id, replySecret);
      setReplyContent("");
      setReplySecret(false);
      onReply(-1);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => {
    setEditContent(comment.wr_content);
    // 원본 기본 스킨처럼 수정 폼의 비밀글 체크를 지금 상태로 연다.
    setEditSecret((comment.wr_option || "").includes("secret"));
    setEditing(true);
    onReply(-1);
  };

  const handleEditSave = async () => {
    if (isContentEmpty(editContent)) return;
    setSaving(true);
    try {
      await onUpdate(comment.wr_id, editContent, editSecret);
      setEditing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "댓글 수정에 실패했습니다.";
      toastError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    // id 는 그누보드 댓글(view_comment 의 c_번호)과 같은 주소 — 최근 댓글 링크의 #c_번호 가 여기로 온다.
    <div
      id={`c_${comment.wr_id}`}
      tabIndex={-1}
      style={{ marginLeft: `${indent}px` }}
      className={`py-3 border-b last:border-b-0 scroll-mt-24 outline-none transition-colors duration-500 ${
        highlighted ? "rounded-md bg-primary/5 ring-1 ring-primary/30" : ""
      }`}
    >
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
          <div className="flex items-center justify-end gap-2">
            <SecretCommentCheck
              id={`wr_secret_edit_${comment.wr_id}`}
              checked={editSecret}
              onChange={setEditSecret}
            />
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
          <div className="flex items-center justify-end gap-2">
            <SecretCommentCheck
              id={`wr_secret_reply_${comment.wr_id}`}
              checked={replySecret}
              onChange={setReplySecret}
            />
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
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const handledHashRef = useRef("");
  const pinStopRef = useRef<(() => void) | null>(null);

  // 화면을 떠나면 붙잡기도 그만둔다.
  useEffect(() => () => pinStopRef.current?.(), []);

  // 최근 댓글 등에서 #c_번호 로 들어오면 그 댓글로 옮겨 가 포커스한다. 댓글은 글을 읽은 뒤 그려지므로
  // 브라우저의 기본 앵커 이동이 닿지 않는다 — 그려진 뒤 직접 찾는다. 같은 해시는 한 번만(댓글을 달거나
  // 지워 목록이 바뀔 때 다시 끌어가지 않게), 주소의 해시가 바뀌면 다시.
  useEffect(() => {
    const focusFromHash = (force: boolean) => {
      const hash = window.location.hash;
      const match = hash.match(/^#c_(\d+)$/);
      if (!match || (!force && handledHashRef.current === hash)) return;
      const target = document.getElementById(`c_${match[1]}`);
      if (!target) return;
      handledHashRef.current = hash;
      // 그누보드 앵커처럼 바로 옮긴다(부드러운 스크롤은 첫 로드 중 이 화면에서 끝까지 가지 않았다). 강조가 자리를 알려 준다.
      // 본문 이미지가 뒤늦게 읽혀 댓글이 밀려나지 않게 잠깐 붙잡아 둔다.
      pinStopRef.current?.();
      pinStopRef.current = pinCommentInView(target);
      target.focus({ preventScroll: true });
      setHighlightedId(Number(match[1]));
    };
    focusFromHash(false);
    const onHashChange = () => focusFromHash(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [comments]);

  useEffect(() => {
    if (highlightedId === null) return;
    const timer = window.setTimeout(() => setHighlightedId(null), COMMENT_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  // 에디터 내용은 ref로 관리하여 타이핑 시 리렌더 방지
  const newCommentRef = useRef("");
  const [canSubmit, setCanSubmit] = useState(false);

  // textarea용 상태 (useEditor가 false일 때만 사용)
  const [textareaValue, setTextareaValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);

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

  const handleSubmitComment = useCallback(async (content: string, parentId?: number, secret = false) => {
    await apiClient.post(`/comments/${boTable}/${wrId}`, {
      wr_content: content,
      comment_id: parentId,
      // 그누보드 write_comment_update.php 의 비밀 댓글 필드.
      wr_secret: secret ? "secret" : "",
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
      await handleSubmitComment(content, undefined, newSecret);
      newCommentRef.current = "";
      setCanSubmit(false);
      setTextareaValue("");
      setNewSecret(false);
      // 에디터 리셋을 위해 강제 리마운트
      setEditorKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "댓글 등록에 실패했습니다.";
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  }, [handleSubmitComment, newSecret]);

  // 서버가 권한(본인 · 최고/그룹/게시판 관리자)을 다시 확인한다. 실패 메시지는 CommentItem 이 띄운다.
  const handleUpdate = useCallback(async (commentId: number, content: string, secret: boolean) => {
    await apiClient.patch(`/comments/${boTable}/${commentId}`, {
      wr_content: content,
      wr_secret: secret ? "secret" : "",
    });
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
                highlighted={highlightedId === comment.wr_id}
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
            <div className="flex items-center justify-end gap-2">
              <SecretCommentCheck id="wr_secret_comment" checked={newSecret} onChange={setNewSecret} />
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
