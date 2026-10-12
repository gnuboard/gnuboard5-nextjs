import { SoluneCatrowPagerReserve, SoluneReviewHead, SoluneShopRowHead, SoluneStaticTrack } from "./shop-section-heads";
import { shopTypeHref } from "./shop-links";
import { SOLUNE_SHOP_HOME_SECTIONS } from "./shop-home-sections";

/*
 * 카드 자리 잡기는 진짜 카드와 같은 클래스 · 같은 줄 수로 그린다. 막대(solune-skel-line)는 글줄 안에 서는
 * 인라인 상자라 줄 높이가 진짜 글자와 같다 — 상품명 두 줄 · 후기 본문 세 줄처럼 자리도 진짜만큼 잡혀, 응답 뒤에
 * 카드가 늘어나며 아래 진열을 밀어내지 않는다(예전 막대는 글줄보다 낮아 줄마다 50~70px, 후기는 200px 넘게 밀렸다).
 */
function SoluneShopProductCardSkeleton({ index }: { index: number }) {
  return (
    <article className="sct_li solune-skel-card" aria-hidden="true">
      <div className="sct_img skeleton" />
      <p className="ondam-card-brand">
        <span className={`skeleton solune-skel-line ${index % 2 === 0 ? "w-16" : "w-12"}`} />
      </p>
      <p className="sct_txt">
        <span className={`skeleton solune-skel-line ${index % 3 === 0 ? "w-[88%]" : "w-[78%]"}`} />
        <br />
        <span className={`skeleton solune-skel-line ${index % 2 === 0 ? "w-1/2" : "w-2/5"}`} />
        {/* 폰 폭(두 장 반)의 좁은 칸에서는 상품명이 대개 세 줄이다 — 그때만 셋째 줄을 둔다. */}
        <br className="solune-skel-narrow" />
        <span className="skeleton solune-skel-line solune-skel-narrow w-1/3" />
      </p>
      {/* 가격 · 아래 줄은 flex 상자라 막대를 진짜와 같은 글자 상자(ondam-card-now · span)에 넣어야 줄 높이가 같다. */}
      <div className="ondam-card-prices">
        <span className="ondam-card-now">
          <span className="skeleton solune-skel-line w-20" />
        </span>
      </div>
      <div className="ondam-card-meta">
        <span>
          <span className="skeleton solune-skel-line w-9" />
        </span>
        <span>
          <span className="skeleton solune-skel-line w-12" />
        </span>
        <span className="skeleton solune-skel-chip ml-auto" />
      </div>
    </article>
  );
}

function SoluneShopReviewCardSkeleton({ index }: { index: number }) {
  return (
    <article className="ondam-review-card solune-skel-card" aria-hidden="true">
      <div className="ondam-review-thumb skeleton" />
      <div className="ondam-review-body">
        <p className="ondam-review-score">
          <span className="skeleton solune-skel-line w-16" />
        </p>
        <p className="ondam-review-title">
          <span className={`skeleton solune-skel-line ${index % 2 === 0 ? "w-3/4" : "w-3/5"}`} />
        </p>
        <p className="ondam-review-text">
          <span className="skeleton solune-skel-line w-full" />
          <br />
          <span className="skeleton solune-skel-line w-[92%]" />
          <br />
          <span className={`skeleton solune-skel-line ${index % 2 === 0 ? "w-2/3" : "w-1/2"}`} />
        </p>
        <div className="ondam-review-meta">
          <span>
            <span className="skeleton solune-skel-line w-12" />
          </span>
          <span>
            <span className="skeleton solune-skel-line w-14" />
          </span>
        </div>
        <p className="ondam-review-item">
          <span className="skeleton solune-skel-line w-1/2" />
        </p>
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
          <SoluneStaticTrack className="solune-shop-swiper" wrapperClass="swiper-wrapper sct" peek={section.peek}>
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
            <SoluneShopReviewCardSkeleton key={index} index={index} />
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
