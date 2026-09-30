"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { ShopPolicy, ShopQA } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeHtml } from "@/components/SafeHtml";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import { updateShopQa, deleteShopQa } from "@/services/shop";

// 상품 후기 작성 폼 — 로그인 회원만 접근. 백엔드에서 영카트 후기 작성 정책을 검증.
export function ReviewForm({
  itId,
  policy,
  onSubmitted,
  initialOpen = false,
}: {
  itId: string;
  policy?: ShopPolicy | null;
  onSubmitted: () => void;
  initialOpen?: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [score, setScore] = useState(5);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const subjectId = useId();
  const contentId = useId();
  const imageInputId = useId();

  useEffect(() => {
    if (initialOpen) {
      setOpen(true);
    }
  }, [initialOpen]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + 후기 작성
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!subject.trim() || !content.trim()) {
          toastError("제목과 내용을 입력해주세요.");
          return;
        }
        if (score < 1 || score > 5) {
          toastError("평점을 1~5 사이로 선택해주세요.");
          return;
        }
        setSubmitting(true);
        try {
          const imageHtml = imageUrls
            .map((url) => `<p><img src="${url.replace(/"/g, "&quot;")}" alt="" /></p>`)
            .join("\n");
          const reviewContent = [content.trim(), imageHtml].filter(Boolean).join("\n");
          await api.post("/shop/reviews", {
            it_id: itId,
            is_subject: subject.trim(),
            is_content: reviewContent,
            is_score: score,
          });
          toastSuccess("후기가 등록되었습니다.");
          setSubject("");
          setContent("");
          setScore(5);
          setImageUrls([]);
          setOpen(false);
          onSubmitted();
        } catch (err: unknown) {
          const m = err instanceof Error ? err.message : "등록 실패";
          toastError(m);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium">평점</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className="rounded p-1 hover:bg-accent"
              aria-label={`${n}점`}
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                )}
              />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{score} / 5</span>
        </div>
      </div>
      <div>
        <label htmlFor={subjectId} className="mb-1 block text-sm font-medium">제목</label>
        <input
          id={subjectId}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          maxLength={255}
          required
        />
      </div>
      <div>
        <label htmlFor={contentId} className="mb-1 block text-sm font-medium">내용</label>
        <textarea
          id={contentId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>
      {/* 이미지 첨부 — textarea에는 본문만 두고, 제출 시 업로드 URL을 img HTML로 합친다. */}
      <div>
        <label htmlFor={imageInputId} className="mb-1 block text-sm font-medium">
          사진 첨부 <span className="text-xs text-muted-foreground">(선택)</span>
        </label>
        <input
          id={imageInputId}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.append("file", f);
            try {
              const res = await api.upload<{ url: string }>("/upload", fd);
              const url = (res.data as { url?: string })?.url;
              if (url) {
                setImageUrls((prev) => [...prev, url]);
                toastSuccess("이미지가 첨부됐습니다.");
              }
            } catch (err: unknown) {
              const m = err instanceof Error ? err.message : "업로드 실패";
              toastError(m);
            } finally {
              // 같은 파일을 다시 첨부할 수 있게 input 리셋.
              e.target.value = "";
            }
          }}
          className="text-xs"
        />
        {imageUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {imageUrls.map((url) => (
              <div key={url} className="relative h-16 w-16 overflow-hidden rounded-md border bg-muted">
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                <button
                  type="button"
                  className="absolute right-0 top-0 bg-background/90 px-1 text-xs"
                  onClick={() => setImageUrls((prev) => prev.filter((item) => item !== url))}
                  aria-label="첨부 이미지 제거"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "등록 중..." : "등록"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setImageUrls([]);
            setOpen(false);
          }}
          disabled={submitting}
        >
          취소
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {policy?.review_requires_completed_order
          ? "주문 상태가 완료인 상품에만 후기 작성 가능합니다."
          : "로그인 회원은 이 상품에 후기를 작성할 수 있습니다."}
        {policy?.review_requires_moderation
          ? " 등록한 후기는 관리자 확인 후 노출됩니다."
          : " 등록한 후기는 바로 노출됩니다."}
      </p>
    </form>
  );
}

// 상품 문의 작성 폼 — 로그인 회원만 접근. POST /shop/reviews/qna 호출.
export function QaForm({
  itId,
  onSubmitted,
  initialOpen = false,
}: {
  itId: string;
  onSubmitted: () => void;
  initialOpen?: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [secret, setSecret] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const subjectId = useId();
  const questionId = useId();
  const emailId = useId();
  const hpId = useId();
  const secretId = useId();

  useEffect(() => {
    if (initialOpen) {
      setOpen(true);
    }
  }, [initialOpen]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + 문의 작성
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!subject.trim() || !question.trim()) {
          toastError("제목과 내용을 입력해주세요.");
          return;
        }
        setSubmitting(true);
        try {
          await api.post("/shop/reviews/qna", {
            it_id: itId,
            iq_subject: subject.trim(),
            iq_question: question.trim(),
            iq_email: email.trim(),
            iq_hp: hp.trim(),
            iq_secret: secret ? 1 : 0,
          });
          toastSuccess("문의가 등록되었습니다.");
          setSubject("");
          setQuestion("");
          setEmail("");
          setHp("");
          setSecret(false);
          setOpen(false);
          onSubmitted();
        } catch (err: unknown) {
          const m = err instanceof Error ? err.message : "등록 실패";
          toastError(m);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <label htmlFor={subjectId} className="mb-1 block text-sm font-medium">제목</label>
        <input
          id={subjectId}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          maxLength={255}
          required
        />
      </div>
      <div>
        <label htmlFor={questionId} className="mb-1 block text-sm font-medium">내용</label>
        <textarea
          id={questionId}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={emailId} className="mb-1 block text-sm font-medium">이메일</label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor={hpId} className="mb-1 block text-sm font-medium">휴대폰</label>
          <input
            id={hpId}
            type="tel"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            maxLength={30}
          />
        </div>
      </div>
      <label htmlFor={secretId} className="flex items-center gap-2 text-sm">
        <input
          id={secretId}
          type="checkbox"
          checked={secret}
          onChange={(e) => setSecret(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        비밀글 (관리자/작성자만 확인 가능)
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "등록 중..." : "등록"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          취소
        </Button>
      </div>
    </form>
  );
}

export function QaListItem({ qa, onChanged }: { qa: ShopQA; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(qa.iq_subject);
  const [question, setQuestion] = useState(qa.iq_question);
  const [email, setEmail] = useState(qa.iq_email ?? "");
  const [hp, setHp] = useState(qa.iq_hp ?? "");
  const [secret, setSecret] = useState(String(qa.iq_secret ?? "0") === "1");
  const [submitting, setSubmitting] = useState(false);
  const editSubjectId = useId();
  const editQuestionId = useId();
  const editEmailId = useId();
  const editHpId = useId();
  const editSecretId = useId();
  const isLocked = qa.can_view === false;
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
    if (!subject.trim() || !question.trim()) {
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

  if (editing) {
    return (
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
            <Textarea
              id={editQuestionId}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              required
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
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{qa.mb_nick}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(qa.iq_time)}</span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium">{isLocked ? "비밀글입니다." : qa.iq_subject}</h4>
        {(canEdit || canDelete) && (
          <div className="flex shrink-0 gap-1">
            {canEdit && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                수정
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={submitting}
              >
                삭제
              </Button>
            )}
          </div>
        )}
      </div>
      {isLocked ? (
        <p className="mt-1 text-sm text-muted-foreground">
          작성자와 관리자만 내용을 볼 수 있습니다.
        </p>
      ) : (
        <SafeHtml
          className="mt-1 text-sm text-muted-foreground prose prose-sm max-w-none"
          html={qa.iq_question}
          policy="user"
        />
      )}
      {!isLocked && qa.iq_answer && (
        <div className="mt-3 rounded-md bg-muted p-3">
          <p className="text-sm font-medium">답변</p>
          <SafeHtml
            className="mt-1 text-sm text-muted-foreground prose prose-sm max-w-none"
            html={qa.iq_answer}
            policy="user"
          />
        </div>
      )}
    </div>
  );
}
