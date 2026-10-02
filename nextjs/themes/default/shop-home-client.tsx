"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { GalleryThumbnail } from "@/app/boards/[bo_table]/GalleryThumbnail";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { G5Link as Link } from "@/components/ui/g5-link";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { normalizeG5ImageSrc } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { htmlToText } from "@/lib/html-text";
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
import { assignCategoryIcons } from "./shop-category-icons";
import { SOLUNE_SHOP_HOME_SECTIONS } from "./shop-home-sections";
import {
  SoluneShopBannerSkeleton,
  SoluneShopCategoriesSkeleton,
  SoluneShopProductRowsSkeleton,
} from "./shop-home-skeletons";
import { SoluneReviewHead, SoluneShopRowHead, SoluneStaticTrack } from "./shop-section-heads";
import { rememberShopLayout } from "./shop-layout-hint";
import { soluneListDate } from "./home-meta";
import { toSoluneCompany, type SoluneCompany } from "./site-company";
import { SoluneSitePopups } from "./site-popups";
import { isSecretPost } from "@/lib/post-flags";

/*
 * Swiper 를 쓰는 조각(배너 · 진열 줄 · 분류 줄 · 후기 줄)은 따로 받는다.
 *
 * 이 파일은 테마 슬롯을 거쳐 루트 layout 에서 닿으므로, 정적으로 가져오면 모든 화면이 Swiper
 * (약 200KB)를 첫 번들로 받는다 — 커뮤니티 홈도 받고 있었다. 쇼핑 홈이 붙자마자 미리 불러
 * API 응답과 나란히 받으므로, 배너가 그려질 때쯤에는 대개 이미 와 있다.
 * 네 조각을 한 문(shop-home-carousels.tsx)으로 받는다 — 따로 받으면 Swiper 가 세 벌 들어간다.
 */
const loadCarousels = () => import("./shop-home-carousels");
/*
 * 진열 줄 · 분류 줄 · 후기 줄은 Swiper 가 오기 전에도 내용을 보인다 — 같은 마크업의 정적 줄(shop-section-heads.tsx)에
 * 실제 카드를 깔고, 조각이 오면 Swiper 줄로 바꾼다. 조각을 기다리며 빈 자리로 두면 상품이 와 있어도 진열이
 * 높이 0 으로 있다가 한꺼번에 나타났다(조각만 5초 늦춘 시험). 정적 줄은 Swiper 의 "서기 전" 모양 그대로라
 * 바뀔 때 자리가 거의 움직이지 않는다.
 */
type Carousels = Awaited<ReturnType<typeof loadCarousels>>;
let loadedCarousels: Carousels | null = null;
let carouselFailureLogged = false;

/**
 * Swiper 조각. 받기 전 · 못 받았을 때는 null — 줄들은 정적 모양 그대로 남는다.
 * 조각을 못 받아도(망 끊김 · 배포 뒤 옛 조각) 쇼핑 홈이 오류 화면으로 넘어가지 않게 실패를 여기서 삼킨다.
 */
function useCarousels(): { carousels: Carousels | null; failed: boolean } {
  const [carousels, setCarousels] = useState<Carousels | null>(loadedCarousels);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (carousels) return;
    let alive = true;
    loadCarousels()
      .then((module) => {
        loadedCarousels = module;
        if (alive) setCarousels(module);
      })
      .catch((error: unknown) => {
        // 줄마다 이 훅을 쓰므로 한 번만 남긴다.
        if (!carouselFailureLogged) {
          carouselFailureLogged = true;
          console.error("[solune-shop-home:carousels]", error);
        }
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [carousels]);
  return { carousels, failed };
}

/** 배너. 조각을 받는 동안은 같은 높이의 자리를, 못 받으면 첫 배너를 넘김 없이 사진 한 장으로 보인다. */
function SoluneShopBanner({ banners }: { banners: ShopBanner[] }) {
  const { carousels, failed } = useCarousels();
  if (carousels) return <carousels.SoluneShopBanner banners={banners} />;

  const first = banners[0];
  return (
    <div className="solune-banner" aria-hidden={failed && first ? undefined : true}>
      <div className="solune-banner-stage">
        {failed && first ? (
          <img
            className="solune-banner-img"
            src={normalizeG5ImageSrc(first.image_url)}
            srcSet={first.image_srcset || undefined}
            sizes={first.image_srcset ? "100vw" : undefined}
            alt={first.bn_alt}
          />
        ) : (
          <div className="skeleton absolute inset-0 rounded-none" />
        )}
      </div>
    </div>
  );
}

interface ShopRowProps {
  eyebrow: string;
  title: string;
  sub?: string;
  href?: string;
  peek?: boolean;
  headingId?: string;
  children: ReactNode;
}

function SoluneShopRow(props: ShopRowProps) {
  const { carousels } = useCarousels();
  if (carousels) return <carousels.SoluneShopRow {...props} />;
  const { eyebrow, title, sub, href, headingId, children } = props;
  return (
    <section className="solune-shop-product-section solune-shop-row" aria-labelledby={headingId}>
      <SoluneShopRowHead eyebrow={eyebrow} title={title} sub={sub} href={href} headingId={headingId} />
      <SoluneStaticTrack className="solune-shop-swiper" wrapperClass="swiper-wrapper sct">
        {Children.toArray(children)}
      </SoluneStaticTrack>
    </section>
  );
}

function SoluneCategorySwiper({ children }: { children: ReactNode }) {
  const { carousels } = useCarousels();
  if (carousels) return <carousels.SoluneCategorySwiper>{children}</carousels.SoluneCategorySwiper>;
  return (
    <SoluneStaticTrack className="solune-catrow-swiper" wrapperClass="swiper-wrapper">
      {Children.toArray(children)}
    </SoluneStaticTrack>
  );
}

function SoluneReviewSection({ headingId, children }: { headingId: string; children: ReactNode }) {
  const { carousels } = useCarousels();
  if (carousels) return <carousels.SoluneReviewSection headingId={headingId}>{children}</carousels.SoluneReviewSection>;
  return (
    <section className="solune-shop-product-section solune-shop-review-section" aria-labelledby={headingId}>
      <SoluneReviewHead headingId={headingId} />
      <SoluneStaticTrack className="solune-review-swiper" wrapperClass="swiper-wrapper ondam-review-grid">
        {Children.toArray(children)}
      </SoluneStaticTrack>
    </section>
  );
}

const ROW_COUNT = SHOP_HOME_ROW_LIMIT;
/* 레퍼런스 쇼핑몰 공지는 latest(notice, 3) — 세 줄. 공지 글이 목록에 섞여 오면 더 오므로 잘라 쓴다. */
export const NOTICE_COUNT = 3;
export const NOTICE_BOARD = "notice";
/* 이 홈이 그리는 진열과 후기만 받는다 — 대표 상품(featuredProducts) 줄은 없다. */
const SHOP_HOME_INCLUDE = [...SOLUNE_SHOP_HOME_SECTIONS.map((section) => section.key), "reviews"] as const;

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
              <ShopImage src={review.thumbnail_url || review.product_image_url} alt="" sizes="(max-width: 780px) 50vw, 300px" />
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
              <p className="ondam-review-text">{truncate(htmlToText(review.is_content), 200)}</p>
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
                    {isSecretPost(post) ? <em className="ondam-notice-badge">비밀</em> : null}
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

/**
 * 브라우저에서 부른다. 조각마다 따로 끝나며, 어느 하나가 실패해도 빈 값으로 끝난다.
 *
 * 한데 모아 기다리지 않는 까닭: 배너(첫 화면의 가장 큰 그림)가 계좌·공지처럼 화면 맨
 * 아래에 놓일 응답까지 기다리게 된다. 도착하는 대로 그 칸만 채운다.
 */
export function loadSoluneShopHomeExtraParts(): Promise<Partial<SoluneShopHomeExtras>>[] {
  return [
    getShopBanners({ position: "메인", device: "all" }, 0)
      .catch(() => [] as ShopBanner[])
      .then((banners) => ({ banners })),
    getShopCategories(0)
      .catch(() => [] as ShopCategory[])
      .then((categories) => ({ categories })),
    // getBoardPosts 자체는 나눠 쓰지 않는다 — 게시판 화면은 방금 쓴 글이 바로 보여야 한다.
    // 이 화면의 공지 세 줄만, 두 번 도는 갱신을 합치려고 여기서 잠깐 나눠 쓴다.
    requestShare
      .get(
        `shop-home:notices:${NOTICE_BOARD}:${NOTICE_COUNT}`,
        SHOP_EXTRAS_SHARE_TTL_MS,
        () => getBoardPosts({ boTable: NOTICE_BOARD, perPage: NOTICE_COUNT, revalidate: 0 }),
        (result) => result.list.length === 0
      )
      .catch(() => ({ list: [] as WritePost[] }))
      .then((result) => ({ notices: result.list })),
    getClientPublicSettings()
      .catch(() => null)
      .then((settings) => ({
        rewriteMode: settings?.cf_bbs_rewrite ?? 0,
        company: toSoluneCompany((settings as Record<string, unknown> | null)?.company),
      })),
    loadBankAccounts()
      .catch(() => [] as string[])
      .then((bankAccounts) => ({ bankAccounts })),
  ];
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
  // 응답이 온 부가 조각(banners · categories …). 오기 전에는 배너 · 분류 자리를 같은 높이로 잡아 둔다 —
  // 늦게 끼어들면 아래 상품 진열이 밀렸다(초기 CLS 0.44).
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(() => Object.values(initialHome).every((items) => items.length === 0));

  useEffect(() => {
    let alive = true;
    // Swiper 조각을 API 와 나란히 받아 둔다(위 loadCarousels 설명). 실패는 useCarousels 가 다룬다.
    loadCarousels().catch(() => undefined);
    // 상품 줄과 부가 조각은 서로 기다리지 않는다 — 배너는 상품 목록이 오기 전에 뜰 수 있다.
    buildShopHomeData({ runtime: true, include: SHOP_HOME_INCLUDE })
      .then((nextHome) => {
        if (alive) setShopHome(nextHome);
      })
      .catch((error: unknown) => {
        console.error("[solune-shop-home:refresh]", error);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    for (const part of loadSoluneShopHomeExtraParts()) {
      void part.then((patch) => {
        if (!alive) return;
        setExtras((prev) => ({ ...prev, ...patch }));
        setSettled((prev) => new Set([...prev, ...Object.keys(patch)]));
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  const { banners, categories, notices, rewriteMode } = extras;
  const layoutKnown = settled.has("banners") && settled.has("categories");

  // 배너 · 분류 줄이 있었는지 기억해 다음 방문의 첫 페인트가 자리를 잡을지 정하게 한다(shop-layout-hint.ts).
  useEffect(() => {
    if (layoutKnown) rememberShopLayout(banners.length > 0, categories.length > 0);
  }, [layoutKnown, banners.length, categories.length]);

  return (
    <>
      {/* 첫 화면은 하나만 — 사진 위에 글자를 얹은 슬라이드. 배너가 한 장도 없으면
          아무것도 내지 않는다(없는 것을 손님에게 설명해 봐야 할 일이 없다). */}
      {banners.length > 0 ? (
        <div className="solune-shop-banner">
          <SoluneShopBanner banners={banners} />
        </div>
      ) : !settled.has("banners") ? (
        <SoluneShopBannerSkeleton />
      ) : null}
      {categories.length > 0 || settled.has("categories") ? (
        <CategoryRow categories={categories} />
      ) : (
        <SoluneShopCategoriesSkeleton />
      )}

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
      <SoluneSitePopups division="shop" />
    </>
  );
}

export { EMPTY_SHOP_HOME };
