"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { GalleryThumbnail } from "@/app/boards/[bo_table]/GalleryThumbnail";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { G5Link as Link } from "@/components/ui/g5-link";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { normalizeG5ImageSrc } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { htmlToPlainText } from "@/lib/sanitize";
import { buildShopHomeData, EMPTY_SHOP_HOME, SHOP_HOME_ROW_LIMIT } from "@/lib/shop-home";
import type { ShopBanner, ShopCategory, ShopReview } from "@/lib/shop-types";
import type { G5ThemeComponentProps, G5ThemeShopHomeData } from "@/lib/theme-types";
import type { WritePost } from "@/lib/types";
import { apiClient } from "@/lib/api";
import { requestShare } from "@/lib/request-share";
import { formatNumber, truncate } from "@/lib/utils";
import { getBoardPosts } from "@/services/boards";
import { getClientPublicSettings } from "@/services/settings";
import { getShopBanners, getShopCategories } from "@/services/shop";
import { shopCategoryHref, shopTypeHref } from "./shop-links";
import { SoluneProductCard } from "./product-card";
import { SoluneShopBanner } from "./shop-banner";
import { assignCategoryIcons } from "./shop-category-icons";
import { SoluneShopRow } from "./shop-row";
import { SoluneCategorySwiper, SoluneReviewSection } from "./shop-home-swipers";
import { SOLUNE_SHOP_HOME_SECTIONS } from "./shop-home-sections";
import { SoluneShopProductRowsSkeleton } from "./shop-home-skeletons";
import { soluneListDate } from "./home-meta";
import { toSoluneCompany, type SoluneCompany } from "./site-company";

const ROW_COUNT = SHOP_HOME_ROW_LIMIT;
/* 레퍼런스 쇼핑몰 공지는 latest(notice, 3) — 세 줄. 공지 글이 목록에 섞여 오면 더 오므로 잘라 쓴다. */
export const NOTICE_COUNT = 3;
export const NOTICE_BOARD = "notice";

/* 이미지가 없는 후기는 빈 src 를 next/image 에 넘기지 않고 앱의 대체 그림을 쓴다. */
function ShopImage({ src, alt, sizes }: { src?: string | null; alt: string; sizes: string }) {
  const normalized = normalizeG5ImageSrc(src);
  if (!normalized) return <ProductImageFallback compact />;
  return <GalleryThumbnail src={normalized} alt={alt} sizes={sizes} />;
}

function stars(score: number): string {
  const full = Math.max(0, Math.min(5, Math.round(score)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function CategoryRow({ categories }: { categories: ShopCategory[] }) {
  if (categories.length === 0) return null;
  const icons = assignCategoryIcons(categories.map((category) => category.ca_id));

  return (
    <nav className="ondam-catrow" aria-label="상품 분류">
      <SoluneCategorySwiper>
        {categories.map((category, index) => {
          const Icon = icons[index];
          return (
            <Link key={category.ca_id} href={shopCategoryHref(category)} className={index === 0 ? "is-featured" : undefined}>
              <span className="ondam-catrow-icon" aria-hidden>
                <Icon size={22} strokeWidth={1.6} />
              </span>
              <span className="ondam-catrow-label">{category.ca_name}</span>
            </Link>
          );
        })}
      </SoluneCategorySwiper>
    </nav>
  );
}

function ReviewSection({ reviews, rewriteMode }: { reviews: ShopReview[]; rewriteMode?: BbsRewriteMode }) {
  if (reviews.length === 0) return null;

  return (
    <SoluneReviewSection headingId="solune-shop-reviews">
      {reviews.map((review) => {
        const href = shopProductHref({ it_id: review.it_id, it_seo_title: review.it_seo_title }, rewriteMode);
        const reviewHref = `${href}${href.includes("?") ? "&" : "?"}is_id=${encodeURIComponent(String(review.is_id))}`;
        const score = Number(review.is_score ?? 0);
        return (
          <article className="ondam-review-card" key={review.is_id}>
            <Link className="ondam-review-thumb" href={reviewHref} tabIndex={-1} aria-hidden>
              <ShopImage src={review.product_image_url} alt="" sizes="(max-width: 780px) 50vw, 300px" />
            </Link>
            <div className="ondam-review-body">
              <p className="ondam-review-score">
                {stars(score)} <span>{score.toFixed(1)}</span>
              </p>
              {review.is_subject ? (
                <p className="ondam-review-title">
                  <Link href={reviewHref}>{review.is_subject}</Link>
                </p>
              ) : null}
              <p className="ondam-review-text">{truncate(htmlToPlainText(review.is_content), 200)}</p>
              <div className="ondam-review-meta">
                <span>{review.mb_nick || review.is_name}</span>
                {/* 레퍼런스 후기 날짜는 연도 두 자리(26-09-22). */}
                <span>{(review.is_time || "").slice(2, 10)}</span>
              </div>
              {review.it_name ? (
                <p className="ondam-review-item">
                  <Link href={href}>{review.it_name}</Link>
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
    </SoluneReviewSection>
  );
}

function BottomAside({
  notices,
  config,
  rewriteMode,
  company,
  bankAccounts,
}: {
  notices: WritePost[];
  config: G5ThemeComponentProps["config"];
  rewriteMode?: BbsRewriteMode;
  company: SoluneCompany | null;
  bankAccounts: string[];
}) {
  // 레퍼런스 고객센터 칸은 사업자 정보의 대표 전화를 굵게 세운다. 없으면 테마 설정의 안내 문구.
  const helpLead = company?.tel || config.site.customerCenterLines[0] || "";
  const extraLines = config.site.customerCenterLines.slice(1);

  return (
    <aside className="solune-shop-sidebar" aria-label="쇼핑몰 안내">
      <section className="solune-shop-sidebar-card ondam-notice">
        <div className="ondam-notice-head">
          <h2>
            <Link href={`/${NOTICE_BOARD}`}>공지사항</Link>
          </h2>
          <Link className="ondam-notice-more" href={`/${NOTICE_BOARD}`}>
            전체 보기
            <ArrowRight size={13} strokeWidth={2.6} aria-hidden />
          </Link>
        </div>
        {notices.length > 0 ? (
          <ul className="ondam-notice-list">
            {notices.slice(0, NOTICE_COUNT).map((post) => {
              const comments = Number(post.wr_comment) || 0;
              return (
                <li key={post.wr_id}>
                  <Link href={boardPostHref(NOTICE_BOARD, post, rewriteMode)}>
                    {(post.wr_option || "").includes("secret") ? <em className="ondam-notice-badge">비밀</em> : null}
                    <span>{truncate(post.wr_subject || "제목 없음", 50)}</span>
                    {comments > 0 ? (
                      <b className="ondam-notice-comment">
                        <span className="sr-only">댓글 </span>
                        {formatNumber(comments)}
                      </b>
                    ) : null}
                    <time dateTime={post.wr_datetime}>{soluneListDate(post.wr_datetime)}</time>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="sct_noitem">아직 공지가 없습니다.</p>
        )}
      </section>

      <section className="solune-shop-sidebar-card solune-shop-help-card ondam-help">
        <section>
          <h3>{config.site.customerCenterTitle}</h3>
          {helpLead ? <p className="ondam-help-tel">{helpLead}</p> : null}
          <p>
            주문과 상품 문의는 <Link href="/faq">고객센터</Link>에서 확인해 주세요.
            <br />
            <Link href="/shop/couponzone">쿠폰존</Link>에서 사용할 수 있는 쿠폰을 받아가세요.
          </p>
        </section>
        {/* 레퍼런스: 무통장 입금 계좌(영카트 결제 설정). 계좌가 없으면 테마 설정의 나머지 안내. */}
        {bankAccounts.length > 0 ? (
          <section>
            <h3>무통장 입금</h3>
            <p className="ondam-help-bank">{bankAccounts.join("\n")}</p>
          </section>
        ) : extraLines.length > 0 ? (
          <section>
            <h3>안내</h3>
            <p className="ondam-help-bank">{extraLines.join("\n")}</p>
          </section>
        ) : null}
      </section>
    </aside>
  );
}


/** 쇼핑 홈이 슬롯 밖에서 직접 읽는 것들 — 배너 · 분류 · 공지 · URL 규칙. */
export type SoluneShopHomeExtras = {
  banners: ShopBanner[];
  categories: ShopCategory[];
  notices: WritePost[];
  rewriteMode: BbsRewriteMode;
  company: SoluneCompany | null;
  bankAccounts: string[];
};

/** 이 화면의 갱신이 두 번 도는 사이를 덮을 만큼만. services/shop.ts 의 목록 TTL 과 같은 값. */
const SHOP_EXTRAS_SHARE_TTL_MS = 5_000;

export const EMPTY_SHOP_EXTRAS: SoluneShopHomeExtras = {
  banners: [],
  categories: [],
  notices: [],
  rewriteMode: 0,
  company: null,
  bankAccounts: [],
};

/**
 * 무통장 입금 계좌 — 결제 설정의 공개 값(로그인 없이 읽는다).
 *
 * 이 갱신은 화면 이동으로 들어오면 두 번 돈다. 상점 설정은 사람마다 다르지 않으므로
 * 잠깐 나눠 써서 같은 요청이 두 번 나가지 않게 한다.
 */
async function loadBankAccounts(): Promise<string[]> {
  return requestShare.get(
    "shop/payment-config:bank-accounts",
    SHOP_EXTRAS_SHARE_TTL_MS,
    async () => {
      const response = await apiClient.get<{ bank_accounts?: unknown }>("/shop/payment/config");
      const accounts = response.data?.bank_accounts;
      return Array.isArray(accounts)
        ? accounts.filter((line): line is string => typeof line === "string" && line.trim() !== "")
        : [];
    },
    (accounts) => accounts.length === 0
  );
}

/** 브라우저에서 부른다. 어느 하나가 실패해도 나머지는 채워지도록 개별로 감싼다. */
export async function loadSoluneShopHomeExtras(): Promise<SoluneShopHomeExtras> {
  const [banners, categories, noticeResult, settings, bankAccounts] = await Promise.all([
    getShopBanners({ position: "메인", device: "all" }, 0).catch(() => [] as ShopBanner[]),
    getShopCategories(0).catch(() => [] as ShopCategory[]),
    getBoardPosts({ boTable: NOTICE_BOARD, perPage: NOTICE_COUNT, revalidate: 0 }).catch(() => ({ list: [] as WritePost[] })),
    getClientPublicSettings().catch(() => null),
    loadBankAccounts().catch(() => [] as string[]),
  ]);
  return {
    banners,
    categories,
    notices: noticeResult.list,
    rewriteMode: settings?.cf_bbs_rewrite ?? 0,
    company: toSoluneCompany((settings as Record<string, unknown> | null)?.company),
    bankAccounts,
  };
}

type SoluneShopHomeClientProps = {
  config: G5ThemeComponentProps["config"];
  initialHome: G5ThemeShopHomeData;
  initialExtras: SoluneShopHomeExtras;
};

/**
 * 쇼핑 홈 본체. 서버가 준 초기값으로 먼저 그리고(하이드레이션이 서버 HTML 과 맞도록),
 * 붙은 뒤 브라우저에서 같은 데이터를 한 번 더 받아 갈아 끼운다.
 *
 * 휴대용 정적 빌드는 어느 사이트의 상품도 굽지 않는다. 그래서 초기값은 보통 비어 있고,
 * 이 갱신이 곧 실제 첫 내용이다. API 가 잠시 죽어 있으면 초기값을 그대로 둔다.
 */
export function SoluneShopHomeClient({ config, initialHome, initialExtras }: SoluneShopHomeClientProps) {
  const [shopHome, setShopHome] = useState(initialHome);
  const [extras, setExtras] = useState(initialExtras);
  const [isLoading, setIsLoading] = useState(() => Object.values(initialHome).every((items) => items.length === 0));

  useEffect(() => {
    let alive = true;
    Promise.all([buildShopHomeData({ runtime: true }), loadSoluneShopHomeExtras()])
      .then(([nextHome, nextExtras]) => {
        if (!alive) return;
        setShopHome(nextHome);
        setExtras(nextExtras);
      })
      .catch((error: unknown) => {
        console.error("[solune-shop-home:refresh]", error);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const { banners, categories, notices, rewriteMode } = extras;

  return (
    <>
      {/* 첫 화면은 하나만 — 사진 위에 글자를 얹은 슬라이드. 배너가 한 장도 없으면
          아무것도 내지 않는다(없는 것을 손님에게 설명해 봐야 할 일이 없다). */}
      {banners.length > 0 ? (
        <div className="solune-shop-banner">
          <SoluneShopBanner banners={banners} />
        </div>
      ) : null}
      <CategoryRow categories={categories} />

      <div className="solune-shop-product-feed" aria-busy={isLoading}>
        {isLoading ? (
          <>
            <p className="sr-only" role="status">
              쇼핑몰 상품과 후기를 불러오는 중입니다.
            </p>
            <SoluneShopProductRowsSkeleton />
          </>
        ) : null}
        {/* 한때 여기에 대표 구역("이번 주 가장 많이 담긴 것")과 타임세일 띠가 있었는데
            둘 다 뺐다 — 대표 구역은 히트상품 줄과 같은 상품을 두 번 냈고, 타임세일은
            실제로 자정에 끝나는 행사가 없는 화면 위의 시계였다. 레퍼런스와 같다. */}
        {!isLoading ? SOLUNE_SHOP_HOME_SECTIONS.map((section) => {
          const products = (shopHome[section.key] ?? []).slice(0, ROW_COUNT);
          if (products.length === 0) return null;
          return (
            <SoluneShopRow
              key={section.key}
              eyebrow={section.eyebrow}
              title={section.title}
              sub={section.sub}
              href={shopTypeHref(section.type)}
              peek={section.peek}
              headingId={`solune-shop-${section.key}`}
            >
              {products.map((product) => (
                <SoluneProductCard key={product.it_id} product={product} href={shopProductHref(product, rewriteMode)} />
              ))}
            </SoluneShopRow>
          );
        }) : null}

        {!isLoading ? <ReviewSection reviews={(shopHome.reviews ?? []).slice(0, ROW_COUNT)} rewriteMode={rewriteMode} /> : null}
      </div>

      <BottomAside
        notices={notices}
        config={config}
        rewriteMode={rewriteMode}
        company={extras.company}
        bankAccounts={extras.bankAccounts}
      />
    </>
  );
}

export { EMPTY_SHOP_HOME };
