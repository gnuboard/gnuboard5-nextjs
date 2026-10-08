"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ChevronDown, Lock } from "lucide-react";
import type { ShopQA } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeHtml } from "@/components/SafeHtml";
import { RichTextField, useSiteEditor } from "@/components/editor/RichTextField";
import { contentForEditor, hasContent } from "@/lib/editor-content";
import { qaFocusIdFromSearch } from "@/components/shop/productDetailHelpers";
import { toastError, toastSuccess } from "@/lib/toast";
import { deleteShopQa, updateShopQa } from "@/services/shop";

/** 주소가 이 문의를 가리키면(?iq_id= — 문의 목록 · 알림에서 건너옴) 처음부터 펴 둔다. */
function pointedByUrl(iqId: string): boolean {
  if (typeof window === "undefined") return false;
  return qaFocusIdFromSearch(window.location.search) === Number(iqId);
}

/**
 * 상품문의 한 줄 — 레퍼런스 solune itemqa.skin.php 처럼 [상태 | 제목 | 작성자 | 날짜 | ▼] 한 줄이 접혀 있고,
 * 누르면 아래로 Q(물음)와 A(답, 옅은 회색 바탕)가 펼쳐진다. 답이 없는 내 문의는 펼친 곳에서 수정 · 삭제.
 */
export function QaListItem({ qa, onChanged }: { qa: ShopQA; onChanged: () => void }) {
  const [open, setOpen] = useState(() => pointedByUrl(qa.iq_id));
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(qa.iq_subject);
  const [question, setQuestion] = useState(qa.iq_question);
  const [email, setEmail] = useState(qa.iq_email ?? "");
  const [hp, setHp] = useState(qa.iq_hp ?? "");
  const [secret, setSecret] = useState(String(qa.iq_secret ?? "0") === "1");
  const [submitting, setSubmitting] = useState(false);
  const siteEditor = useSiteEditor();
  const contentId = useId();
  const editSubjectId = useId();
  const editQuestionId = useId();
  const editEmailId = useId();
  const editHpId = useId();
  const editSecretId = useId();
  const isLocked = qa.can_view === false;
  const isSecret = String(qa.iq_secret ?? "0") === "1";
  const isAnswered = qa.is_answered === true || (qa.iq_answer ?? "").trim() !== "";
  const canEdit = qa.can_edit === true && !isLocked && !isAnswered;
  const canDelete = qa.can_delete === true && !isAnswered;

  useEffect(() => {
    setEditing(false);
    setSubject(qa.iq_subject);
    setQuestion(qa.iq_question);
    setEmail(qa.iq_email ?? "");
    setHp(qa.iq_hp ?? "");
    setSecret(String(qa.iq_secret ?? "0") === "1");
  }, [qa.iq_email, qa.iq_hp, qa.iq_id, qa.iq_question, qa.iq_secret, qa.iq_subject]);

  const resetEditValues = () => {
    setSubject(qa.iq_subject);
    setQuestion(qa.iq_question);
    setEmail(qa.iq_email ?? "");
    setHp(qa.iq_hp ?? "");
    setSecret(String(qa.iq_secret ?? "0") === "1");
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subject.trim() || !hasContent(question, Boolean(siteEditor))) {
      toastError("제목과 내용을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await updateShopQa(qa.iq_id, {
        iq_subject: subject.trim(),
        iq_question: question.trim(),
        iq_email: email.trim(),
        iq_hp: hp.trim(),
        iq_secret: secret ? 1 : 0,
      });
      toastSuccess("상품문의가 수정되었습니다.");
      setEditing(false);
      onChanged();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "상품문의를 수정하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("상품문의를 삭제하시겠습니까?")) {
      return;
    }

    setSubmitting(true);
    try {
      await deleteShopQa(qa.iq_id);
      toastSuccess("상품문의가 삭제되었습니다.");
      onChanged();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "상품문의를 삭제하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="product-qa-item border-b">
      <button
        type="button"
        className="product-qa-row grid w-full grid-cols-[auto_minmax(0,1fr)_20px] items-center gap-x-3 gap-y-1 py-4 text-left sm:grid-cols-[76px_minmax(0,1fr)_auto_auto_20px] sm:gap-x-5 sm:py-5"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={cn(
            "product-qa-status inline-flex h-6 items-center justify-center border px-2 text-[11px] font-bold",
            isAnswered ? "is-done border-primary bg-primary/10 text-primary" : "is-waiting bg-muted text-muted-foreground"
          )}
        >
          {isAnswered ? "답변완료" : "답변대기"}
        </span>
        <span className="product-qa-subject flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="truncate">{qa.iq_subject}</span>
          {isSecret && (
            <>
              <Lock className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">비밀글</span>
            </>
          )}
        </span>
        {/* 폰에서는 제목 아래 둘째 줄, 넓은 화면에서는 한 줄의 칸(display: contents). */}
        <span className="product-qa-meta col-start-2 row-start-2 flex gap-2 text-xs text-muted-foreground sm:contents">
          <span className="product-qa-name">{qa.mb_nick}</span>
          <span className="product-qa-date tabular-nums">{formatDate(qa.iq_time)}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "product-qa-caret col-start-3 row-start-1 h-4 w-4 justify-self-end text-muted-foreground transition-transform motion-reduce:transition-none sm:col-auto sm:row-auto",
            open && "rotate-180"
          )}
        />
      </button>

      <div id={contentId} hidden={!open} className="product-qa-content pb-7 text-sm leading-relaxed sm:pl-[96px]">
        {editing ? (
          <form className="space-y-3 rounded-lg border p-4" onSubmit={handleUpdate}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={editSubjectId} className="mb-1 block text-sm font-medium">제목</label>
                <Input
                  id={editSubjectId}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={255}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={editQuestionId} className="mb-1 block text-sm font-medium">내용</label>
                <RichTextField
                  id={editQuestionId}
                  value={question}
                  onChange={setQuestion}
                  useEditor={siteEditor}
                  rows={4}
                  ariaLabel="문의 내용"
                />
              </div>
              <div>
                <label htmlFor={editEmailId} className="mb-1 block text-sm font-medium">이메일</label>
                <Input
                  id={editEmailId}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor={editHpId} className="mb-1 block text-sm font-medium">휴대폰</label>
                <Input
                  id={editHpId}
                  type="tel"
                  value={hp}
                  onChange={(event) => setHp(event.target.value)}
                  maxLength={30}
                />
              </div>
            </div>
            <label htmlFor={editSecretId} className="flex items-center gap-2 text-sm">
              <input
                id={editSecretId}
                type="checkbox"
                checked={secret}
                onChange={(event) => setSecret(event.target.checked)}
                className="size-4 accent-primary"
              />
              비밀글
            </label>
            <div className="flex justify-end gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "수정 중..." : "수정하기"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => {
                  resetEditValues();
                  setEditing(false);
                }}
              >
                취소
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="product-qa-question relative pl-11">
              <span className="product-qa-mark absolute left-0 top-0 text-lg font-extrabold leading-[1.6]" aria-hidden="true">Q</span>
              <strong className="sr-only">문의 내용</strong>
              {isLocked ? (
                <p className="text-muted-foreground">비밀글로 보호된 문의입니다.</p>
              ) : (
                <SafeHtml className="prose prose-sm max-w-none text-foreground" html={qa.iq_question} policy="user" />
              )}
            </div>
            {!isLocked && (
              <div className="product-qa-answer relative mt-5 bg-muted py-5 pl-16 pr-5">
                <span className="product-qa-mark absolute left-5 top-5 text-lg font-extrabold leading-[1.6]" aria-hidden="true">A</span>
                <strong className="sr-only">답변</strong>
                {isAnswered ? (
                  <SafeHtml className="prose prose-sm max-w-none text-muted-foreground" html={qa.iq_answer} policy="user" />
                ) : (
                  <p className="text-muted-foreground">답변이 등록되지 않았습니다.</p>
                )}
              </div>
            )}
            {(canEdit || canDelete) && (
              <div className="product-qa-cmd mt-3 flex gap-2">
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      // 에디터로 고칠 때 글자 문의는 줄마다 문단으로 넣는다(그대로 넣으면 줄바꿈이 사라진다).
                      setQuestion(siteEditor ? contentForEditor(qa.iq_question) : qa.iq_question);
                      setEditing(true);
                    }}
                  >
                    수정
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="product-qa-delete h-7 px-2.5 text-xs"
                    onClick={handleDelete}
                    disabled={submitting}
                  >
                    삭제
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
