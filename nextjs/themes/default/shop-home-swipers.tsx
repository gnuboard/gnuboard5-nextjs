"use client";

import { Children, isValidElement, useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Keyboard, Navigation, Pagination, Scrollbar } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { bindSwiperControlsAfterMount, slideToFocusedSlide } from "./shop-swiper";

function slidesOf(children: ReactNode) {
  return Children.toArray(children).map((child, index) => (
    <SwiperSlide key={isValidElement(child) && child.key !== null ? child.key : index}>{child}</SwiperSlide>
  ));
}

/**
 * 분류 칩 줄. 레퍼런스 shop/index.php 의 .solune-catrow-swiper 값 그대로 — 좁은 폭 2칸에서
 * 640 · 780 · 1080 · 1280 마다 3 · 4 · 8 · 10칸. 칩 아래에 화살표 둘과 끌 수 있는 막대를 모은다.
 * 점을 쓰지 않는 것은 분류가 열두 개면 점도 열두 개가 되고, 한 번에 보이는 수가 폭마다 달라
 * 점 개수와 맞지 않아서다. 한 줄에 다 들어가면 Swiper 가 막대를 잠그고 CSS 가 통째로 감춘다.
 */
export function SoluneCategorySwiper({ children }: { children: ReactNode }) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);

  /* 단추와 막대는 Swiper 뒤(아래)에 있어 Swiper 가 설 때는 아직 없다. 붙은 뒤에 물린다. */
  useEffect(() => {
    if (!swiperRef.current) return;
    bindSwiperControlsAfterMount(swiperRef.current, { prevEl: prevRef.current, nextEl: nextRef.current, scrollbarEl: scrollbarRef.current });
  }, []);

  return (
    <>
      <div onFocus={(event) => swiperRef.current && slideToFocusedSlide(swiperRef.current, event.target)}>
        <Swiper
          className="solune-catrow-swiper"
          modules={[A11y, Keyboard, Navigation, Scrollbar]}
          slidesPerView={2}
          spaceBetween={14}
          speed={320}
          keyboard={{ enabled: true }}
          a11y={{ prevSlideMessage: "이전 분류", nextSlideMessage: "다음 분류" }}
          navigation={{ prevEl: null, nextEl: null }}
          scrollbar={{ el: null, draggable: true, hide: false }}
          breakpoints={{
            640: { slidesPerView: 3 },
            780: { slidesPerView: 4 },
            1080: { slidesPerView: 8 },
            1280: { slidesPerView: 10 },
          }}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
        >
          {slidesOf(children)}
        </Swiper>
      </div>
      <div className="solune-catrow-pager">
        <button ref={prevRef} type="button" className="solune-catrow-nav solune-catrow-prev" aria-label="이전 분류">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <div ref={scrollbarRef} className="solune-catrow-scrollbar" />
        <button ref={nextRef} type="button" className="solune-catrow-nav solune-catrow-next" aria-label="다음 분류">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </>
  );
}

/**
 * 후기 줄. 레퍼런스의 .solune-review-swiper 값 그대로 — 한 번에 한 장이 아니라 보이는 만큼을
 * 한 쪽으로 넘긴다(slidesPerGroup = slidesPerView). 그래야 아래 점 수가 실제 쪽수와 같다.
 * 끌어서 넘기는 문턱은 한 쪽 폭의 1/5 로 낮춘다 — 기본(절반)이면 넓은 화면에서 거의 늘 제자리로 돌아온다.
 * 좌우 단추는 카드 위 양옆에, 쪽 표시는 창 밖 아래에 둔다(창이 overflow:hidden 이라 안에 두면 잘린다).
 */
export function SoluneReviewSwiper({ children }: { children: ReactNode }) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);

  /* 쪽 표시는 Swiper 뒤(창 밖 아래)에 있어 Swiper 가 설 때는 아직 없다. 붙은 뒤에 물린다. */
  useEffect(() => {
    if (!swiperRef.current) return;
    bindSwiperControlsAfterMount(swiperRef.current, { prevEl: prevRef.current, nextEl: nextRef.current, paginationEl: paginationRef.current });
  }, []);

  return (
    <>
      <div onFocus={(event) => swiperRef.current && slideToFocusedSlide(swiperRef.current, event.target)}>
        <Swiper
          className="solune-review-swiper"
          wrapperClass="swiper-wrapper ondam-review-grid"
          modules={[A11y, Keyboard, Navigation, Pagination]}
          slidesPerView={1}
          slidesPerGroup={1}
          spaceBetween={22}
          speed={320}
          longSwipesRatio={0.2}
          keyboard={{ enabled: true }}
          a11y={{ prevSlideMessage: "이전 후기", nextSlideMessage: "다음 후기", paginationBulletMessage: "{{index}}쪽으로 가기" }}
          navigation={{ prevEl: null, nextEl: null }}
          pagination={{ el: null, clickable: true }}
          breakpoints={{
            640: { slidesPerView: 2, slidesPerGroup: 2 },
            900: { slidesPerView: 3, slidesPerGroup: 3 },
            1200: { slidesPerView: 4, slidesPerGroup: 4 },
          }}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
        >
          {slidesOf(children)}
          <button ref={prevRef} slot="container-end" type="button" className="solune-banner-nav solune-review-prev" aria-label="이전 후기">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button ref={nextRef} slot="container-end" type="button" className="solune-banner-nav solune-review-next" aria-label="다음 후기">
            <ChevronRight size={16} aria-hidden />
          </button>
        </Swiper>
      </div>
      <div ref={paginationRef} className="solune-review-pagination swiper-pagination" />
    </>
  );
}

/** 후기 구역 — 레퍼런스처럼 가운데 머리(REVIEW · 제목 · 부제) 아래 후기 줄. 화살표는 머리가 아니라 카드 양옆에 선다. */
export function SoluneReviewSection({ headingId, children }: { headingId: string; children: ReactNode }) {
  return (
    <section className="solune-shop-product-section solune-shop-review-section" aria-labelledby={headingId}>
      <header className="solune-shop-section-head solune-shop-section-head--center">
        <span className="solune-shop-eyebrow">REVIEW</span>
        <h2 id={headingId}>고객님이 남긴 후기</h2>
        <p className="solune-shop-section-sub">상품을 받아본 분들이 직접 적은 이야기입니다.</p>
      </header>
      <SoluneReviewSwiper>{children}</SoluneReviewSwiper>
    </section>
  );
}
