import { SoluneReviewSection } from "./shop-home-swipers";
import { SoluneShopRow } from "./shop-row";
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

export function SoluneShopProductRowsSkeleton() {
  return (
    <>
      {SOLUNE_SHOP_HOME_SECTIONS.map((section) => (
        <SoluneShopRow
          key={section.key}
          eyebrow={section.eyebrow}
          title={section.title}
          sub={section.sub}
          href={shopTypeHref(section.type)}
          peek={section.peek}
          headingId={`solune-shop-loading-${section.key}`}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <SoluneShopProductCardSkeleton key={index} index={index} />
          ))}
        </SoluneShopRow>
      ))}

      <SoluneReviewSection headingId="solune-shop-loading-reviews">
        {Array.from({ length: 4 }, (_, index) => (
          <SoluneShopReviewCardSkeleton key={index} />
        ))}
      </SoluneReviewSection>
    </>
  );
}

function SoluneShopBannerSkeleton() {
  return (
    <div className="solune-shop-banner" aria-hidden="true">
      <div className="solune-banner">
        <div className="solune-banner-stage">
          <div className="skeleton absolute inset-0 rounded-none" />
        </div>
      </div>
    </div>
  );
}

function SoluneShopCategoriesSkeleton() {
  return (
    <nav className="ondam-catrow" aria-hidden="true">
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
