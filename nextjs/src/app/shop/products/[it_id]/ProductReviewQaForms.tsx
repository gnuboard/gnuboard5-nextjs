"use client";

import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { ShopPolicy, ShopReview } from "@/lib/api";
import { updateShopReview } from "@/services/shop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextField, useSiteEditor } from "@/components/editor/RichTextField";
import { EDITOR_UPLOAD_STAGE } from "@/components/editor/useEditorImageUpload";
import { contentForEditor, hasContent } from "@/lib/editor-content";
import { toastSuccess, toastError } from "@/lib/toast";
import { ProductWriteDialog, ReviewPhotoField, ReviewScorePicker, WRITE_CONTENT_CLASS } from "./ProductWriteDialog";

// 상품 후기 작성 폼 — 로그인 회원만 접근. 백엔드에서 영카트 후기 작성 정책을 검증.
export function ReviewForm({
  itId,
  itName,
  itImage,
  policy,
  onSubmitted,
  initialOpen = false,
  triggerLabel = "+ 후기 작성",
  triggerClassName,
  review,
}: {
  itId: string;
  itName: string;
  itImage?: string;
  policy?: ShopPolicy | null;
  onSubmitted: () => void;
  initialOpen?: boolean;
  /** 창을 여는 단추 — 사용후기 탭 요약 상자의 "사용후기 쓰기"처럼 자리마다 글자 · 모양이 다르다. */
  triggerLabel?: string;
  triggerClassName?: string;
  /** 고칠 후기 — 주면 그 후기로 채워 열고 PATCH 로 고친다(쓴 사람 · 최고관리자, 후기 목록의 [수정]). */
  review?: ShopReview;
}) {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [score, setScore] = useState(5);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  // 사이트 에디터(cf_editor)가 있으면 웹 에디터 — 그누보드 shop/itemuseform.php 와 같은 조건.
  const siteEditor = useSiteEditor();
  const formId = useId();
  const subjectId = useId();
  const contentId = useId();
  const imageInputId = useId();

  useEffect(() => {
    if (initialOpen) {
      setOpen(true);
    }
  }, [initialOpen]);

  // 고칠 때는 열 때마다 그 후기로 채운다. 에디터로 고칠 때 글자 후기는 줄마다 문단으로 넣는다(마이페이지와 같다).
  const openForm = () => {
    if (review) {
      setSubject(review.is_subject);
      setContent(siteEditor ? contentForEditor(review.is_content) : review.is_content);
      setScore(Math.min(5, Math.max(1, Number(review.is_score) || 5)));
    }
    setOpen(true);
  };

  // 닫으면 올려 둔 사진만 비운다 — 제목 · 내용 · 평점은 다시 열 때 이어 쓴다.
  const close = () => {
    setImageUrls([]);
    setOpen(false);
  };

  // 여러 장을 고르면 고른 순서대로 한 장씩 올린다(/upload 는 한 번에 한 장). 실패한 장만 알리고 나머지는 계속.
  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    // 같은 파일을 다시 첨부할 수 있게 input 리셋(files 는 위에서 배열로 옮겨 두었다).
    input.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        // 웹 에디터 사진과 같이 임시로 올린다 — 후기를 등록할 때 서버가 옮기고, 후기를 지우면 함께 지운다.
        fd.append("stage", EDITOR_UPLOAD_STAGE);
        try {
          // POST /upload 는 file_url 로 돌려준다(api/v1/upload.php) — 예전에는 없는 url 을 읽어 사진이 빠졌다.
          const res = await api.upload<{ file_url: string }>("/upload", fd);
          const url = res.data?.file_url;
          if (url) {
            setImageUrls((prev) => [...prev, url]);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "업로드 실패";
          toastError(files.length > 1 ? `${file.name}: ${message}` : message);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploading) {
      toastError("사진을 올리는 중입니다. 잠시 후 다시 눌러 주세요.");
      return;
    }
    if (!subject.trim() || !hasContent(content, Boolean(siteEditor))) {
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
      const payload = { is_subject: subject.trim(), is_content: reviewContent, is_score: score };
      if (review) {
        await updateShopReview(review.is_id, payload);
        toastSuccess("후기가 수정되었습니다.");
      } else {
        await api.post("/shop/reviews", { it_id: itId, ...payload });
        toastSuccess("후기가 등록되었습니다.");
      }
      setSubject("");
      setContent("");
      setScore(5);
      setImageUrls([]);
      setOpen(false);
      onSubmitted();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : review ? "수정 실패" : "등록 실패";
      toastError(m);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className={triggerClassName} onClick={openForm}>
        {triggerLabel}
      </Button>
      {open && (
        <ProductWriteDialog
          title={review ? "상품후기 수정" : "상품후기 작성"}
          itName={itName}
          itImage={itImage}
          formId={formId}
          submitLabel={review ? "수정하기" : "후기 등록"}
          busy={submitting}
          onClose={close}
          notice={
            review ? undefined : (
            <>
              {policy?.review_requires_completed_order
                ? "주문 상태가 완료인 상품에만 후기 작성 가능합니다."
                : "로그인 회원은 이 상품에 후기를 작성할 수 있습니다."}
              {policy?.review_requires_moderation
                ? " 등록한 후기는 관리자 확인 후 노출됩니다."
                : " 등록한 후기는 바로 노출됩니다."}
            </>
            )
          }
        >
          <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
            <ReviewScorePicker score={score} onChange={setScore} />
            <div>
              <label htmlFor={subjectId} className="mb-1 block text-sm font-medium">제목</label>
              <Input
                id={subjectId}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={255}
                placeholder="후기 제목을 입력해 주세요"
                required
              />
            </div>
            <div>
              <label htmlFor={contentId} className="mb-1 block text-sm font-medium">내용</label>
              <RichTextField
                id={contentId}
                value={content}
                onChange={setContent}
                useEditor={siteEditor}
                rows={12}
                className={WRITE_CONTENT_CLASS}
                placeholder="상품을 써 보니 어땠나요? 사이즈 · 색감 · 품질 · 배송 등 다른 분께 도움이 될 이야기를 자세히 남겨 주세요."
                ariaLabel="후기 내용"
              />
            </div>
            {/* 이미지 첨부 — 본문에는 글만 두고, 제출 때 올린 사진 주소를 img HTML 로 붙인다.
                웹 에디터를 쓰면 에디터의 사진 단추로 본문에 넣으므로 이 칸은 없다. */}
            {siteEditor === false && (
              <ReviewPhotoField
                inputId={imageInputId}
                urls={imageUrls}
                uploading={uploading}
                onPick={uploadImage}
                onRemove={(url) => setImageUrls((prev) => prev.filter((item) => item !== url))}
              />
            )}
          </form>
        </ProductWriteDialog>
      )}
    </>
  );
}

// 상품 문의 작성 폼 — 로그인 회원만 접근. POST /shop/reviews/qna 호출.
export function QaForm({
  itId,
  itName,
  itImage,
  onSubmitted,
  initialOpen = false,
  triggerLabel = "+ 문의 작성",
  triggerClassName,
}: {
  itId: string;
  itName: string;
  itImage?: string;
  onSubmitted: () => void;
  initialOpen?: boolean;
  /** 창을 여는 단추 — 상품문의 탭 머리의 "문의하기"처럼 자리마다 글자 · 모양이 다르다. */
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  // 사이트 에디터(cf_editor)가 있으면 웹 에디터 — 그누보드 shop/itemqaform.php 와 같은 조건.
  const siteEditor = useSiteEditor();
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [secret, setSecret] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formId = useId();
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subject.trim() || !hasContent(question, Boolean(siteEditor))) {
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
  };

  return (
    <>
      <Button variant="outline" size="sm" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      {open && (
        <ProductWriteDialog
          title="상품문의 작성"
          itName={itName}
          itImage={itImage}
          formId={formId}
          submitLabel="문의 등록"
          busy={submitting}
          onClose={() => setOpen(false)}
          notice={
            /* 영카트 itemqaform.skin.php 의 frm_info 두 줄 — 답변은 관리자 화면(원본)에서 달고 그때 알림이 간다. */
            <>
              이메일을 입력하시면 답변 등록 시 답변이 이메일로 전송됩니다.
              <br />
              휴대폰번호를 입력하시면 답변 등록 시 답변등록 알림이 SMS로 전송됩니다.
            </>
          }
        >
          <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor={subjectId} className="mb-1 block text-sm font-medium">제목</label>
              <Input
                id={subjectId}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={255}
                placeholder="문의 제목을 입력해 주세요"
                required
              />
            </div>
            <div>
              <label htmlFor={questionId} className="mb-1 block text-sm font-medium">내용</label>
              <RichTextField
                id={questionId}
                value={question}
                onChange={setQuestion}
                useEditor={siteEditor}
                rows={12}
                className={WRITE_CONTENT_CLASS}
                ariaLabel="문의 내용"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={emailId} className="mb-1 block text-sm font-medium">
                  이메일 <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </label>
                <Input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor={hpId} className="mb-1 block text-sm font-medium">
                  휴대폰 <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </label>
                <Input
                  id={hpId}
                  type="tel"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                  maxLength={30}
                />
              </div>
            </div>
            <label
              htmlFor={secretId}
              className="product-write-secret flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm"
            >
              <input
                id={secretId}
                type="checkbox"
                checked={secret}
                onChange={(e) => setSecret(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span>
                비밀글로 문의
                <span className="ml-1.5 text-xs text-muted-foreground">관리자와 작성자만 볼 수 있습니다</span>
              </span>
            </label>
          </form>
        </ProductWriteDialog>
      )}
    </>
  );
}
