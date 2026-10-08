"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { ChevronLeft, ChevronRight, ImageOff, Star, X } from "lucide-react";
import type { ShopReview } from "@/lib/api";
import { SafeHtml } from "@/components/SafeHtml";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn, formatDate, formatPrice } from "@/lib/utils";

export type ReviewPhotoProduct = { name: string; price?: number; image?: string };

type ReviewPhotoDialogProps = {
  reviews: ShopReview[];
  /** 후기마다 못 읽은 것을 뺀 사진 주소 */
  photosByReview: Map<string, string[]>;
  startReview: number;
  startPhoto: number;
  product: ReviewPhotoProduct;
  onClose: () => void;
  onPhotoError: (url: string) => void;
};

const ROUND_BUTTON =
  "grid h-9 w-9 place-items-center rounded-full bg-white/90 text-neutral-900 shadow transition-colors hover:bg-white disabled:opacity-0";

/**
 * 포토 후기 크게 보기 — 레퍼런스 solune itemuse.skin.php 의 #solune-review-lightbox:
 * 왼쪽은 그 후기의 사진(넘기기 · 점), 오른쪽은 상품 머리 · 별 · 작성자 · 날짜 · 제목 · 본문 · "사진 N장",
 * 바닥은 [이전 후기] 위치 [다음 후기]. 폰에서는 사진이 위, 글이 아래로 쌓인다.
 * 사진 없는 후기로 넘어가면 사진 칸에 "사진 없음".
 */
export function ReviewPhotoDialog({
  reviews,
  photosByReview,
  startReview,
  startPhoto,
  product,
  onClose,
  onPhotoError,
}: ReviewPhotoDialogProps) {
  const [reviewIndex, setReviewIndex] = useState(startReview);
  const [photoIndex, setPhotoIndex] = useState(startPhoto);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const review = reviews[reviewIndex];
  const photos = review ? photosByReview.get(review.is_id) ?? [] : [];
  const hasManyPhotos = photos.length > 1;
  // 창이 열린 채 사진 하나가 깨져 빠지면 번호가 범위를 넘는다 — 남은 사진 안으로 맞춘다.
  const currentPhoto = Math.min(photoIndex, Math.max(photos.length - 1, 0));

  if (!review) return null;

  const goReview = (next: number) => {
    if (next < 0 || next >= reviews.length) return;
    setReviewIndex(next);
    setPhotoIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 글 칸 안의 입력칸 · 링크에서 누른 화살표는 그대로 둔다.
    if ((event.target as Element).closest("a, input, textarea")) return;
    if (event.key === "ArrowLeft") swiperRef.current?.slidePrev();
    if (event.key === "ArrowRight") swiperRef.current?.slideNext();
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        onKeyDown={handleKeyDown}
        showCloseButton={false}
        className="review-photo-dialog flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-[1040px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1040px] md:grid md:h-[min(720px,88dvh)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      >
        <div className="review-photo-stage relative h-[42dvh] flex-none bg-neutral-900 md:h-full">
          {photos.length > 0 ? (
            <Swiper
              key={review.is_id}
              className="h-full w-full"
              modules={[A11y]}
              initialSlide={photoIndex}
              speed={reducedMotion ? 0 : 300}
              allowTouchMove={hasManyPhotos}
              a11y={{ prevSlideMessage: "이전 사진", nextSlideMessage: "다음 사진", slideLabelMessage: "{{index}} / {{slidesLength}}" }}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
              onSlideChange={(swiper) => setPhotoIndex(swiper.activeIndex)}
            >
              {photos.map((url, index) => (
                <SwiperSlide key={url} className="!flex items-center justify-center">
                  <img
                    src={url}
                    alt={`${review.mb_nick} 님의 사진 후기 ${index + 1}`}
                    draggable={false}
                    onError={() => onPhotoError(url)}
                    className="max-h-full max-w-full select-none object-contain"
                  />
                </SwiperSlide>
              ))}
            </Swiper>
          ) : (
            <p className="grid h-full place-items-center content-center gap-2 text-xs font-semibold tracking-[0.2em] text-white/60">
              <ImageOff className="h-8 w-8" aria-hidden="true" />
              사진 없음
            </p>
          )}
          {hasManyPhotos && (
            <>
              <button
                type="button"
                className={cn(ROUND_BUTTON, "absolute left-3 top-1/2 z-10 -translate-y-1/2")}
                onClick={() => swiperRef.current?.slidePrev()}
                disabled={currentPhoto === 0}
                aria-label="이전 사진"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cn(ROUND_BUTTON, "absolute right-3 top-1/2 z-10 -translate-y-1/2")}
                onClick={() => swiperRef.current?.slideNext()}
                disabled={currentPhoto === photos.length - 1}
                aria-label="다음 사진"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
                {photos.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className={cn("h-1.5 rounded-full bg-white/50 transition-all", index === currentPhoto ? "w-5 bg-white" : "w-1.5")}
                    onClick={() => swiperRef.current?.slideTo(index)}
                    aria-label={`${index + 1}번째 사진`}
                    aria-current={index === currentPhoto || undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="review-photo-side flex min-h-0 flex-1 flex-col">
          <div className="review-photo-head flex items-center gap-3 border-b px-5 py-3.5">
            {product.image ? (
              <img src={product.image} alt="" className="h-10 w-10 flex-none rounded-md object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{product.name}</p>
              {typeof product.price === "number" && (
                <p className="text-xs text-muted-foreground">{formatPrice(product.price)}</p>
              )}
            </div>
            <DialogClose
              className="review-photo-close ml-auto grid h-9 w-9 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="닫기"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogClose>
          </div>

          <div className="review-photo-body min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <p className="review-photo-meta flex flex-wrap items-center gap-2.5 text-xs">
              <span className="flex text-amber-500" role="img" aria-label={`5점 만점에 ${review.is_score}점`}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    aria-hidden="true"
                    className={cn("h-3.5 w-3.5", index < review.is_score ? "fill-current" : "fill-transparent opacity-40")}
                  />
                ))}
              </span>
              <span className="font-semibold">{review.mb_nick}</span>
              <span className="tabular-nums text-muted-foreground">{formatDate(review.is_time)}</span>
            </p>
            <DialogTitle className="review-photo-title mt-3 text-lg font-bold leading-snug">{review.is_subject}</DialogTitle>
            <DialogDescription asChild>
              <div>
                {/* 사진은 왼쪽 칸이 보여 주므로 본문 안의 사진은 감춘다. */}
                <SafeHtml
                  className="review-photo-text prose prose-sm mt-3 max-w-none text-muted-foreground [&_img]:hidden"
                  html={review.is_content}
                  policy="user"
                />
              </div>
            </DialogDescription>
            {photos.length > 0 && (
              <p className="review-photo-chip mt-4 inline-flex rounded-full bg-muted px-3 py-1 text-xs">사진 {photos.length}장</p>
            )}
          </div>

          <div className="review-photo-foot flex items-center justify-between gap-3 border-t bg-muted/60 px-5 py-3.5">
            <button
              type="button"
              className="review-photo-nav inline-flex h-9 items-center gap-1 rounded-lg border bg-background px-3 text-[13px] disabled:opacity-40"
              onClick={() => goReview(reviewIndex - 1)}
              disabled={reviewIndex === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              이전 후기
            </button>
            <p className="review-photo-pos text-[13px] tabular-nums text-muted-foreground" aria-live="polite">
              {reviewIndex + 1} / {reviews.length}
            </p>
            <button
              type="button"
              className="review-photo-nav inline-flex h-9 items-center gap-1 rounded-lg border bg-background px-3 text-[13px] disabled:opacity-40"
              onClick={() => goReview(reviewIndex + 1)}
              disabled={reviewIndex === reviews.length - 1}
            >
              다음 후기
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
