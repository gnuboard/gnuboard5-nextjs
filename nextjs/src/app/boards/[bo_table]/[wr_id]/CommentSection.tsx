"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Comment } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreVertical } from "lucide-react";
import { MemberAvatar } from "@/components/MemberAvatar";
import { formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toast";
import { SafeHtml } from "@/components/SafeHtml";
import { MemberSideview } from "@/components/MemberSideview";
import { htmlToPlainText } from "@/lib/sanitize";
import { contentForEditor, looksLikeHtml } from "@/lib/editor-content";
import { useCommentEditor } from "@/components/editor/RichTextField";

// "에디터 선택"(cf_editor)에 에디터가 있고 api/.env 의 G5_COMMENT_EDITOR_USE 가 켜져 있으면 게시판 글쓰기와 같은
// 웹 에디터를 낮게(compact) 쓴다. 둘 중 하나라도 아니면 글자 입력칸(commentEditorOn).
const CommentEditor = dynamic(
  () =>
    import("@/components/editor/TiptapEditor").then((mod) => ({
      default: (props: { content: string; onChange: (value: string) => void; placeholder?: string }) => (
        <mod.TiptapEditor
          {...props}
          // 에디터가 늦게 켜져(설정 확인 전에 수정을 연 경우) 글자 댓글이 그대로 와도 줄마다 문단으로 넣는다.
          content={props.content && !looksLikeHtml(props.content) ? contentForEditor(props.content) : props.content}
          compact
        />
      ),
    })),
  {
    ssr: false,
    loading: () => <div className="skeleton min-h-[80px] rounded-lg border" />,
  }
);

/** 댓글 본문 — 에디터로 쓴 HTML 은 걸러서, 태그 없는 글자 댓글(그누보드 · 글자 입력칸)은 줄바꿈을 살려 글자로. */
function CommentBody({ content }: { content: string }) {
  if (looksLikeHtml(content)) {
    return <SafeHtml className="text-sm leading-relaxed" html={content} policy="user" />;
  }
  return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</p>;
}

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
  /** 답글이면 받는 댓글의 이름("○○ 님에게"). 받는 댓글이 지워졌으면 없다. */
  replyToName?: string;
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

/** 마우스가 ⋮ 단추와 메뉴 사이 틈을 지나는 동안 닫히지 않게 기다리는 시간(ms). */
const MENU_HOVER_CLOSE_MS = 160;

interface CommentAction {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * 댓글 ⋮ 메뉴(답글 · 수정 · 삭제).
 * - 마우스: 단추에 얹으면 열리고, 단추 · 메뉴에서 벗어나면 잠깐 뒤 닫힌다(사이 틈을 지나도 닫히지 않게 기다린다).
 * - 터치 · 펜: hover 가 없으니 눌러서 열고, 바깥을 누르면 닫힌다.
 * - 키보드: Enter · Space 로 열고 첫 항목으로 초점이 들어간다. Esc 로 닫으면 단추로 돌아온다.
 * hover 로 열고 닫을 때는 초점을 옮기지 않는다 — 댓글을 쓰다 마우스가 지나가도 입력 칸의 초점을 빼앗지 않게.
 * (DropdownMenu 는 열릴 때 언제나 메뉴로 초점을 옮겨 hover 에 맞지 않아 Popover 로 그린다.)
 */
function CommentActionsMenu({ label, actions }: { label: string; actions: CommentAction[] }) {
  const [open, setOpen] = useState(false);
  const openedByHover = useRef(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(() => cancelClose, [cancelClose]);

  const openByHover = (event: ReactPointerEvent) => {
    if (event.pointerType !== "mouse") return;
    cancelClose();
    if (!open) {
      openedByHover.current = true;
      setOpen(true);
    }
  };
  const closeSoon = (event: ReactPointerEvent) => {
    if (event.pointerType !== "mouse" || !openedByHover.current) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), MENU_HOVER_CLOSE_MS);
  };
  const run = (action: CommentAction) => {
    cancelClose();
    setOpen(false);
    action.onSelect();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        if (next) openedByHover.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="board-comment-menu size-8 shrink-0"
          aria-label={label}
          onPointerEnter={openByHover}
          onPointerLeave={closeSoon}
          // hover 로 이미 열린 메뉴를 마우스로 누르면 닫지 않는다(누르는 순간 닫혔다 깜박이지 않게).
          onClick={(event) => {
            if (open && openedByHover.current) event.preventDefault();
          }}
        >
          <MoreVertical className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="board-comment-menu-list w-auto min-w-[7rem] p-1"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") cancelClose();
        }}
        onPointerLeave={closeSoon}
        onOpenAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
      >
        <div role="group" aria-label={label} className="flex flex-col">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`board-comment-menu-item rounded px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent${
                action.destructive ? " text-destructive" : ""
              }`}
              onClick={() => run(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
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
  replyToName,
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
  const depth = comment.wr_comment_reply?.length ?? 0;
  const displayName = comment.mb_nick || comment.wr_name;
  const actions: CommentAction[] = [
    ...(user
      ? [{ key: "reply", label: isReplyOpen ? "답글 닫기" : "답글", onSelect: () => onReply(isReplyOpen ? -1 : comment.wr_id) }]
      : []),
    ...(isOwner && !editing ? [{ key: "edit", label: "수정", onSelect: () => startEdit() }] : []),
    ...(isOwner ? [{ key: "delete", label: "삭제", onSelect: () => onDelete(comment.wr_id), destructive: true }] : []),
  ];

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
    // 에디터로 고칠 때 글자 댓글은 줄마다 문단으로 넣는다(그대로 넣으면 줄바꿈이 사라진다).
    setEditContent(useEditor ? contentForEditor(comment.wr_content) : comment.wr_content);
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
    // 깊이는 --comment-depth 로 넘긴다 — 들여쓰기 · 이음선(└)은 테마가 그린다(기본은 한 단에 24px).
    <div
      id={`c_${comment.wr_id}`}
      tabIndex={-1}
      data-depth={depth}
      style={{ "--comment-depth": depth } as CSSProperties}
      className={`board-comment${depth > 0 ? " board-comment--reply" : ""}${highlighted ? " is-highlighted" : ""} relative border-b py-3 pl-[calc(var(--comment-depth)*24px)] last:border-b-0 scroll-mt-24 outline-none transition-colors duration-500 ${
        highlighted ? "rounded-md bg-primary/5 ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="board-comment-row flex items-start gap-3">
        <MemberAvatar
          name={displayName}
          member={{
            mb_image_path: comment.mb_image_path,
            mb_icon_path: comment.mb_icon_path ?? comment.member?.mb_icon_path,
          }}
          className="board-comment-avatar grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold"
          size={40}
        />
        <div className="board-comment-main min-w-0 flex-1">
          <div className="board-comment-meta flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <MemberSideview
              mbId={comment.mb_id}
              name={displayName}
              iconUrl={comment.member?.mb_icon_path}
              boTable={boTable}
              className="board-comment-name font-medium"
            />
            {replyToName ? (
              <span className="board-comment-to text-xs text-muted-foreground">{replyToName} 님에게</span>
            ) : null}
            <time className="board-comment-date text-xs text-muted-foreground" dateTime={comment.wr_datetime}>
              {formatDate(comment.wr_datetime)}
            </time>
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
            <div className="board-comment-body mt-1">
              <CommentBody content={comment.wr_content} />
            </div>
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
        {/* 답글 · 수정 · 삭제는 오른쪽 ⋮ 메뉴 하나로(레퍼런스 view_comment 의 더보기 단추). */}
        {actions.length > 0 ? <CommentActionsMenu label={`${displayName} 댓글 메뉴`} actions={actions} /> : null}
      </div>
    </div>
  );
});

export function CommentSection({ boTable, wrId, initialComments, useEditor: initialUseEditor }: CommentSectionProps) {
  // 댓글 에디터 조건(에디터 선택 + G5_COMMENT_EDITOR_USE)을 브라우저에서 확인한다. 화면이 받은 값(initialUseEditor)은 빌드 · 서버 때의 설정이라
  // 관리자가 에디터를 바꾼 뒤에도 남을 수 있다 — 확인하기 전까지만 쓴다.
  const siteEditor = useCommentEditor();
  const useEditor = siteEditor === null ? Boolean(initialUseEditor) : siteEditor;
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
  // 목록 접기(레퍼런스 댓글 머리의 [접기]). 쓰기 칸은 접지 않는다.
  const [folded, setFolded] = useState(false);

  // 답글의 받는 사람: 같은 댓글 묶음(wr_comment)에서 wr_comment_reply 가 한 글자 짧은 댓글(그누보드 답글 규칙).
  const replyToNames = useMemo(() => {
    const byKey = new Map(comments.map((item) => [`${item.wr_comment}|${item.wr_comment_reply ?? ""}`, item.mb_nick || item.wr_name]));
    return new Map(
      comments
        .filter((item) => (item.wr_comment_reply ?? "") !== "")
        .map((item) => [item.wr_id, byKey.get(`${item.wr_comment}|${item.wr_comment_reply.slice(0, -1)}`)])
    );
  }, [comments]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="board-comments-head mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">
            댓글 <span className="board-comments-count text-primary">{comments.length}</span>
          </h3>
          {comments.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="board-comments-fold"
              aria-expanded={!folded}
              aria-controls="board-comments-list"
              onClick={() => setFolded((value) => !value)}
            >
              {folded ? "펼치기" : "접기"}
            </Button>
          ) : null}
        </div>

        {/* Comment List */}
        {comments.length > 0 && (
          <div id="board-comments-list" className="board-comments-list mb-6" hidden={folded}>
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
                replyToName={replyToNames.get(comment.wr_id)}
              />
            ))}
          </div>
        )}

        {/* New Comment Form */}
        {user ? (
          <div className="board-comment-form space-y-3">
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
          <p className="board-comment-login text-sm text-muted-foreground text-center py-4">
            댓글을 작성하려면 로그인이 필요합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
