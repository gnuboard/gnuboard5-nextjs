import { SoluneReviewHead, SoluneShopRowHead, SoluneStaticTrack } from "./shop-section-heads";
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

export function SoluneShopCategoriesSkeleton() {
  return (
    <nav className="ondam-catrow solune-shop-cats-reserve" aria-hidden="true">
      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-h-[146px] flex-col items-center gap-3 rounded-lg border border-base-300 bg-base-100 px-2 py-[18px]">
            <div className="skeleton h-[58px] w-[58px] shrink-0 rounded-full" />
            <div className={`skeleton h-3 ${index % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
          </div>
        ))}
      </div>
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
