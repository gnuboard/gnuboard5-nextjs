import { SoluneCatrowPagerReserve, SoluneReviewHead, SoluneShopRowHead, SoluneStaticTrack } from "./shop-section-heads";
import { shopTypeHref } from "./shop-links";
import { SOLUNE_SHOP_HOME_SECTIONS } from "./shop-home-sections";

function SoluneShopProductCardSkeleton({ index }: { index: number }) {
  return (
    <article className="sct_li" aria-hidden="true">
      <div className="sct_img skeleton" />
      <div className="ondam-card-brand">
        <div className={`skeleton h-3 ${index % 2 === 0 ? "w-16" : "w-12"}`} />
      </div>
      <div className="sct_txt">
        <div className={`skeleton h-4 ${index % 3 === 0 ? "w-4/5" : "w-3/5"}`} />
      </div>
      <div className="ondam-card-prices">
        <div className="skeleton h-4 w-20" />
      </div>
      <div className="ondam-card-meta">
        <div className="skeleton h-3 w-10" />
        <div className="skeleton h-3 w-14" />
        <div className="skeleton ml-auto h-7 w-11" />
      </div>
    </article>
  );
}

function SoluneShopReviewCardSkeleton() {
  return (
    <article className="ondam-review-card" aria-hidden="true">
      <div className="skeleton aspect-square w-full" />
      <div className="ondam-review-body">
        <div className="skeleton mb-3 h-4 w-20" />
        <div className="skeleton mb-2 h-4 w-4/5" />
        <div className="skeleton mb-2 h-3 w-full" />
        <div className="skeleton mb-2 h-3 w-3/4" />
        <div className="mt-4 flex justify-between">
          <div className="skeleton h-3 w-14" />
          <div className="skeleton h-3 w-16" />
        </div>
      </div>
    </article>
  );
}

/*
 * 줄은 Swiper 없이 같은 마크업으로 그린다(shop-section-heads.tsx). 이 스켈레톤은 로딩 슬롯을 거쳐
 * 모든 화면의 번들에 들어가므로, 여기서 Swiper 줄을 쓰면 커뮤니티 화면도 Swiper 를 받는다.
 * 넘길 것도 없는 자리 잡기라 Swiper 가 할 일도 없다.
 */
export function SoluneShopProductRowsSkeleton() {
  return (
    <>
      {SOLUNE_SHOP_HOME_SECTIONS.map((section) => (
        <section
          key={section.key}
          className="solune-shop-product-section solune-shop-row"
          aria-labelledby={`solune-shop-loading-${section.key}`}
        >
          <SoluneShopRowHead
            eyebrow={section.eyebrow}
            title={section.title}
            sub={section.sub}
            href={shopTypeHref(section.type)}
            headingId={`solune-shop-loading-${section.key}`}
          />
          <SoluneStaticTrack className="solune-shop-swiper" wrapperClass="swiper-wrapper sct">
            {Array.from({ length: 6 }, (_, index) => (
              <SoluneShopProductCardSkeleton key={index} index={index} />
            ))}
          </SoluneStaticTrack>
        </section>
      ))}

      <section className="solune-shop-product-section solune-shop-review-section" aria-labelledby="solune-shop-loading-reviews">
        <SoluneReviewHead headingId="solune-shop-loading-reviews" />
        <SoluneStaticTrack className="solune-review-swiper" wrapperClass="swiper-wrapper ondam-review-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <SoluneShopReviewCardSkeleton key={index} />
          ))}
        </SoluneStaticTrack>
      </section>
    </>
  );
}

/* solune-shop-*-reserve: 지난 방문에 그 줄이 없었으면 첫 페인트부터 감춘다(shop-layout-hint.ts · theme.shop.home.css). */
export function SoluneShopBannerSkeleton() {
  return (
    <div className="solune-shop-banner solune-shop-banner-reserve" aria-hidden="true">
      <div className="solune-banner">
        <div className="solune-banner-stage">
          <div className="skeleton absolute inset-0 rounded-none" />
        </div>
      </div>
    </div>
  );
}

/* 분류 칩 자리 수 — 넓은 화면의 한 화면 칸 수(10)보다 많게 두어 넘김 막대 자리도 잡는다. 분류가 그보다 적은 사이트는
   응답 뒤 막대 자리만큼(54px) 한 번 줄어든다. */
const CATEGORY_SKELETON_CHIPS = 12;

/* 진짜 분류 줄(shop-home-client.tsx 의 CategoryRow)과 같은 마크업 · 클래스 — 한 줄 칩 + 넘김 막대 자리.
   예전 2열 격자는 휴대폰 폭에서 세 줄(466px)로 서 있다가 한 줄(128px)로 접히며 진열을 끌어올렸다. */
export function SoluneShopCategoriesSkeleton() {
  return (
    <nav className="ondam-catrow solune-shop-cats-reserve" aria-hidden="true">
      <SoluneStaticTrack className="solune-catrow-swiper" wrapperClass="swiper-wrapper">
        {Array.from({ length: CATEGORY_SKELETON_CHIPS }, (_, index) => (
          <a key={index}>
            <span className="ondam-catrow-icon skeleton" />
            <span className="ondam-catrow-label">
              <span className={`skeleton inline-block h-3 align-middle ${index % 2 === 0 ? "w-12" : "w-9"}`} />
            </span>
          </a>
        ))}
      </SoluneStaticTrack>
      <SoluneCatrowPagerReserve />
    </nav>
  );
}

export function SoluneShopHomePageLoading() {
  return (
    <div className="solune-shop-home-loading" aria-busy="true">
      <p className="sr-only" role="status">
        쇼핑몰 상품과 후기를 불러오는 중입니다.
      </p>
      <SoluneShopBannerSkeleton />
      <SoluneShopCategoriesSkeleton />
      <div className="solune-shop-product-feed">
        <SoluneShopProductRowsSkeleton />
      </div>
    </div>
  );
}
