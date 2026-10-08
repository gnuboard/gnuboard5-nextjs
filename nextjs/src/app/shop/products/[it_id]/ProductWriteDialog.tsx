"use client";

import Image from "next/image";
import { useRef, type ChangeEvent, type ReactNode } from "react";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { shouldBypassImageOptimization } from "@/lib/image";
import { cn } from "@/lib/utils";

type ProductWriteDialogProps = {
  /** 창 이름 — "상품후기 작성" · "상품문의 작성" */
  title: string;
  itName: string;
  itImage?: string;
  /** 아래 단추가 제출할 form 의 id(단추는 form 밖, 창 바닥에 붙어 있다) */
  formId: string;
  submitLabel: string;
  busy: boolean;
  /** 본문 아래 옅은 안내 */
  notice?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 후기 · 문의 작성 창 — 영카트 itemuseform.php · itemqaform.php 가 따로 뜨는 창이듯 목록 위에 띄운다.
 * 모양은 상품 "담기" 창(ProductQuickAddDialog)과 같은 말씨: 썸네일 머리 · 본문만 스크롤 · 바닥에 붙은 단추,
 * 폰에서는 아래에서 올라오는 시트. 등록 중에는 닫히지 않는다(바깥 누름 · Esc 포함).
 */
export function ProductWriteDialog({
  title,
  itName,
  itImage,
  formId,
  submitLabel,
  busy,
  notice,
  onClose,
  children,
}: ProductWriteDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}>
      <DialogContent
        ref={contentRef}
        // 열자마자 닫기(X)나 첫 칸에 초점이 가면 폰에서는 자판이 바로 올라온다 — 창 자체에 초점을 둔다.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="product-quick-add-dialog product-write-dialog flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none"
      >
        <DialogHeader className="product-quick-add-head flex-row items-center gap-3 border-b p-4 pr-12 text-left">
          <span className="product-quick-add-thumb relative block h-14 w-14 flex-none overflow-hidden rounded-md border bg-muted">
            {itImage ? (
              <Image src={itImage} alt="" fill sizes="64px" className="object-cover" unoptimized={shouldBypassImageOptimization(itImage)} />
            ) : (
              <ProductImageFallback compact />
            )}
          </span>
          <div className="min-w-0 space-y-0.5">
            <DialogDescription className="product-quick-add-kicker truncate text-xs text-muted-foreground">{itName}</DialogDescription>
            <DialogTitle className="product-quick-add-name text-[15px] leading-snug">{title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="product-quick-add-body product-write-body min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {children}
          {notice ? <div className="product-write-notice rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{notice}</div> : null}
        </div>

        <DialogFooter className="product-quick-add-foot flex-row gap-2 border-t p-4 sm:justify-stretch">
          <Button type="button" variant="outline" className="product-quick-add-detail flex-1" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            type="submit"
            form={formId}
            className="product-quick-add-submit flex-[2] gap-1.5"
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "등록 중..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 영카트 itemuseform.skin.php 의 평점 이름(is_score 5 → 1). */
const SCORE_LABELS: Record<number, string> = { 5: "매우만족", 4: "만족", 3: "보통", 2: "불만", 1: "매우불만" };

/** 평점 — 큰 별 다섯 개와 고른 평점의 이름. */
export function ReviewScorePicker({ score, onChange }: { score: number; onChange: (score: number) => void }) {
  return (
    <fieldset className="product-write-score flex flex-col items-center gap-1.5 rounded-lg bg-muted/60 px-4 py-4">
      <legend className="sr-only">평점</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n}점 ${SCORE_LABELS[n]}`}
            aria-pressed={n === score}
            className="product-write-star rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Star
              className={cn(
                "h-8 w-8 transition-colors",
                n <= score ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/30"
              )}
            />
          </button>
        ))}
      </div>
      <p className="product-write-score-label text-sm font-semibold" aria-live="polite">
        {SCORE_LABELS[score]} <span className="font-normal text-muted-foreground">{score} / 5</span>
      </p>
    </fieldset>
  );
}

/** 사진 첨부 — 올린 사진은 작은 썸네일(빼기 단추)로, 끝에 점선 "추가" 칸. */
export function ReviewPhotoField({
  inputId,
  urls,
  uploading,
  onPick,
  onRemove,
}: {
  inputId: string;
  urls: string[];
  uploading: boolean;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="product-write-photos">
      <p className="mb-1 block text-sm font-medium">
        사진 첨부 <span className="text-xs font-normal text-muted-foreground">(선택)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {urls.map((url) => (
          <div key={url} className="relative h-16 w-16 overflow-hidden rounded-md border bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
            <button
              type="button"
              className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
              onClick={() => onRemove(url)}
              aria-label="첨부 사진 빼기"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ))}
        <label
          htmlFor={inputId}
          className={cn(
            "product-write-photo-add flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-[11px] text-muted-foreground transition-colors hover:bg-muted",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
          {uploading ? "올리는 중" : "추가"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={onPick}
          disabled={uploading}
          className="sr-only"
        />
      </div>
    </div>
  );
}
