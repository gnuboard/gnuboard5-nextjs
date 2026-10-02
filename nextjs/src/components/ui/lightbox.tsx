"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image";

interface LightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * 상품 이미지 크게 보기. 사진 칸은 Swiper 라 마우스로 끌거나 손가락으로 밀어 넘긴다.
 * 화살표 · 썸네일 · 키보드(← → Esc)도 그대로 쓴다 — 어느 쪽으로 넘겨도 currentIndex 하나로 맞춘다.
 * 사진 밖(검은 바탕)을 누르면 닫는다. 끌기를 마친 순간의 클릭으로 닫히지 않게 Swiper 의 click
 * 이벤트(움직임 없는 탭에서만 난다)로 받는다.
 */
export function Lightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: LightboxProps) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;
  const hasMany = images.length > 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) onNavigate(currentIndex - 1);
  }, [hasPrev, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) onNavigate(currentIndex + 1);
  }, [hasNext, currentIndex, onNavigate]);

  // 화살표 · 썸네일 · 키보드로 바뀐 currentIndex 를 Swiper 에 옮긴다(끌어서 바뀐 경우는 이미 같다).
  useEffect(() => {
    const swiper = swiperRef.current;
    if (swiper && !swiper.destroyed && swiper.activeIndex !== currentIndex) {
      swiper.slideTo(currentIndex);
    }
  }, [currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, handlePrev, handleNext]);

  return (
    <div
      className="lightbox fixed inset-0 z-[100] bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="상품 이미지 크게 보기"
    >
      <Swiper
        className="lightbox-swiper absolute inset-0 h-full w-full"
        modules={[A11y]}
        initialSlide={currentIndex}
        speed={reducedMotion ? 0 : 300}
        grabCursor={hasMany}
        allowTouchMove={hasMany}
        a11y={{ prevSlideMessage: "이전 이미지", nextSlideMessage: "다음 이미지", slideLabelMessage: "{{index}} / {{slidesLength}}" }}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        onSlideChange={(swiper) => {
          if (swiper.activeIndex !== currentIndex) onNavigate(swiper.activeIndex);
        }}
        onClick={(_swiper, event) => {
          // 사진을 누른 것은 닫지 않는다. 사진 밖 검은 바탕을 눌렀을 때만 닫는다.
          const target = event.target as Element | null;
          if (target && !target.closest("img")) onClose();
        }}
      >
        {images.map((src, i) => (
          <SwiperSlide key={`${src}-${i}`} className="!flex items-center justify-center">
            <Image
              src={src}
              alt={hasMany ? `상품 이미지 ${i + 1} / ${images.length}` : "상품 이미지"}
              width={1600}
              height={1200}
              sizes="90vw"
              draggable={false}
              className={cn(
                "max-w-[90vw] select-none object-contain",
                // 썸네일 줄이 있으면 그만큼 사진 높이를 줄여 겹치지 않게 한다.
                hasMany ? "max-h-[calc(100vh-9rem)]" : "max-h-[90vh]"
              )}
              style={{ width: "auto", height: "auto" }}
              unoptimized={shouldBypassImageOptimization(src)}
              priority={i === currentIndex}
            />
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        aria-label="닫기"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Counter */}
      {hasMany && (
        // 읽어 주기는 Swiper A11y 가 슬라이드 이름("2 / 5")으로 한다 — 여기에 aria-live 를 또 달면 두 번 읽힌다.
        <div className="lightbox-counter pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 text-white/70 text-sm" aria-hidden="true">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Prev button */}
      {hasPrev && (
        <button
          type="button"
          onClick={handlePrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          aria-label="이전 이미지"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          type="button"
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          aria-label="다음 이미지"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Thumbnail strip */}
      {hasMany && (
        <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              type="button"
              key={i}
              onClick={() => onNavigate(i)}
              aria-label={`${i + 1}번째 이미지 보기`}
              aria-current={i === currentIndex ? "true" : undefined}
              className={cn(
                "h-12 w-12 flex-none overflow-hidden rounded border-2 transition-colors",
                i === currentIndex
                  ? "border-white"
                  : "border-white/30 hover:border-white/60"
              )}
            >
              <Image
                src={img}
                alt=""
                width={48}
                height={48}
                className="h-full w-full object-cover"
                unoptimized={shouldBypassImageOptimization(img)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
