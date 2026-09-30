"use client";

import { Children, isValidElement, useRef, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Keyboard, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { attachSwiperControls, slideToFocusedSlide } from "./shop-swiper";

interface SoluneShopRowProps {
  eyebrow: string;
  title: string;
  sub?: string;
  /** 제목과 "전체 보기" 가 가리키는 곳. 없으면 제목은 글자만. */
  href?: string;
  /** 마지막 한 장을 반쯤 걸쳐 옅게 두고 끝에서 처음으로 이어 돈다(레퍼런스 loop · peek). */
  peek?: boolean;
  headingId?: string;
  children: ReactNode;
}

/* 레퍼런스 shop/index.php soluneShopRows() 의 값 그대로 — 폭 640 · 900 · 1200 에서 칸 수가 는다.
   반쪽 줄은 (1280 + 20) / (216 + 20) = 5.5 라는 시안 비율을 좁은 폭에도 .5 로 얹는다. */
const PEEK_SLIDES = [2.5, 3.5, 4.5, 5.5];
const WHOLE_SLIDES = [2, 3, 4, 5];

/**
 * 쇼핑 홈의 진열 한 줄. 레퍼런스 solune_shop_product_section() 그대로 — 왼쪽에 눈썹·제목·전체 보기,
 * 오른쪽 끝에 42px 네모 화살표 둘, 그 아래 얇은 선 위에 Swiper 의 진행 막대.
 * 넘길 것이 없으면 Swiper 가 화살표와 막대를 잠그고(lock) CSS 가 감춘다.
 */
export function SoluneShopRow({ eyebrow, title, sub, href, peek = false, headingId, children }: SoluneShopRowProps) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const spv = peek ? PEEK_SLIDES : WHOLE_SLIDES;
  const slides = Children.toArray(children);
  /* Swiper 11 의 loop 는 복제 없이 실제 칸을 앞뒤로 옮겨 잇는다. 한 화면(가장 넓은 폭 기준)의 두 배가
     안 되는 줄은 이을 칸이 모자라 Swiper 가 loop 를 끄면서 경고를 남기므로 처음부터 켜지 않는다. */
  const loop = peek && slides.length >= Math.ceil(spv[spv.length - 1]) * 2;

  return (
    <section className="solune-shop-product-section solune-shop-row" aria-labelledby={headingId}>
      <header className="solune-shop-section-head solune-shop-section-head--row">
        <span className="solune-shop-eyebrow">{eyebrow}</span>
        <h2 id={headingId}>{href ? <Link href={href}>{title}</Link> : title}</h2>
        {href ? (
          <Link className="solune-shop-section-more" href={href}>
            전체 보기
            <ArrowRight size={13} strokeWidth={2.6} aria-hidden />
          </Link>
        ) : null}
        <div className="solune-shop-swiper-nav">
          <button ref={prevRef} type="button" className="solune-shop-swiper-prev" aria-label={`${title} 이전`}>
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button ref={nextRef} type="button" className="solune-shop-swiper-next" aria-label={`${title} 다음`}>
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        {sub ? <p className="solune-shop-section-sub">{sub}</p> : null}
        <div ref={progressRef} className="solune-shop-swiper-progress" aria-hidden />
      </header>
      <div onFocus={(event) => swiperRef.current && slideToFocusedSlide(swiperRef.current, event.target)}>
        <Swiper
          className="solune-shop-swiper"
          wrapperClass="swiper-wrapper sct"
          data-solune-swiper-peek={peek ? "1" : undefined}
          modules={[A11y, Keyboard, Navigation, Pagination]}
          slidesPerView={spv[0]}
          spaceBetween={14}
          speed={320}
          loop={loop}
          watchSlidesProgress={peek}
          watchOverflow
          keyboard={{ enabled: true }}
          a11y={{ prevSlideMessage: "이전 상품", nextSlideMessage: "다음 상품" }}
          navigation={{ prevEl: null, nextEl: null }}
          pagination={{ el: null, type: "progressbar" }}
          breakpoints={{
            640: { slidesPerView: spv[1], spaceBetween: 16 },
            900: { slidesPerView: spv[2], spaceBetween: 20 },
            1200: { slidesPerView: spv[3], spaceBetween: 20 },
          }}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onBeforeInit={(swiper) =>
            attachSwiperControls(swiper, { prevEl: prevRef.current, nextEl: nextRef.current, paginationEl: progressRef.current })
          }
        >
          {slides.map((child, index) => (
            <SwiperSlide key={isValidElement(child) && child.key !== null ? child.key : index}>{child}</SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
