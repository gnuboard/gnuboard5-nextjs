import type { ReactNode, Ref } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";

/*
 * 쇼핑 홈 진열 줄 · 후기 구역의 머리와, Swiper 가 서기 전의 줄 모양.
 *
 * Swiper 를 가져오지 않는다 — 로딩 스켈레톤이 이것만으로 줄을 그리게 하려는 것이다. 스켈레톤은
 * 테마 로딩 슬롯을 거쳐 모든 화면의 번들에 들어가므로, 여기서 Swiper 를 가져오면 커뮤니티 화면도
 * Swiper 를 받는다. 진짜 줄(shop-row.tsx · shop-home-swipers.tsx)도 같은 머리를 쓴다.
 */

export interface SoluneShopRowHeadProps {
  eyebrow: string;
  title: string;
  sub?: string;
  href?: string;
  headingId?: string;
  prevRef?: Ref<HTMLButtonElement>;
  nextRef?: Ref<HTMLButtonElement>;
  progressRef?: Ref<HTMLDivElement>;
}

/** 진열 줄 머리 — 왼쪽에 눈썹·제목·전체 보기, 오른쪽 끝에 화살표 둘, 아래 진행 막대 자리. */
export function SoluneShopRowHead({ eyebrow, title, sub, href, headingId, prevRef, nextRef, progressRef }: SoluneShopRowHeadProps) {
  return (
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
  );
}

/** 후기 구역 머리 — 레퍼런스처럼 가운데에 REVIEW · 제목 · 부제. */
export function SoluneReviewHead({ headingId }: { headingId: string }) {
  return (
    <header className="solune-shop-section-head solune-shop-section-head--center">
      <span className="solune-shop-eyebrow">REVIEW</span>
      <h2 id={headingId}>고객님이 남긴 후기</h2>
      <p className="solune-shop-section-sub">상품을 받아본 분들이 직접 적은 이야기입니다.</p>
    </header>
  );
}

/**
 * Swiper 가 서기 전과 같은 마크업의 줄. 클래스 이름이 같아 초기화 전 규칙(theme.shop.carousel.css 의
 * :not(.swiper-initialized))이 그대로 걸린다 — 스켈레톤이 진짜 줄과 같은 자리 · 같은 칸으로 선다.
 */
export function SoluneStaticTrack({
  className,
  wrapperClass,
  children,
}: {
  className: string;
  wrapperClass: string;
  children: ReactNode[];
}) {
  return (
    <div className={`swiper ${className}`}>
      <div className={wrapperClass}>
        {children.map((child, index) => (
          <div key={index} className="swiper-slide">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Swiper 가 서기 전 분류 줄 아래의 넘김 막대 자리(단추 둘 + 막대, 높이가 진짜 막대와 같다).
 * 진짜 막대는 Swiper 가 선 뒤에야 생겨, 자리가 없으면 그때 아래 진열이 54px 밀린다. 분류가 한 화면에 다
 * 들어가 Swiper 가 막대를 감출 때는 이 자리도 감춘다(theme.shop.carousel.css 의 화면 폭별 칸 수 규칙).
 */
export function SoluneCatrowPagerReserve() {
  return (
    <div className="solune-catrow-pager solune-catrow-pager-reserve" aria-hidden="true">
      <span className="solune-catrow-nav" />
      <span className="solune-catrow-scrollbar" />
      <span className="solune-catrow-nav" />
    </div>
  );
}
