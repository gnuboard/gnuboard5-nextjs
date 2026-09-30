import type { ShopProduct, ShopReview } from "@/lib/api";
import type { ContentData } from "@/lib/schemas";
import type { PostDetail } from "@/services/boards";
import { APP_BASE_URL, rootPublicAssetUrl } from "@/lib/config";
import { toG5ShortPath } from "@/lib/g5-short-url";
import { plainTextSummary } from "@/lib/seo";

/**
 * schema.org JSON-LD 헬퍼 — 검색엔진이 상품 카드 / 별점 / 가격 / 재고를 직접 이해.
 *
 *   <ProductJsonLd product={...} reviews={...} />
 *   <BreadcrumbJsonLd items={[{name, url}, ...]} />
 *
 * Next.js App Router 에서는 <script type="application/ld+json"> 을 server
 * component 안에 직접 렌더하면 hydration warning 없이 SEO 효과 그대로.
 */

const SITE = APP_BASE_URL.replace(/\/+$/, "");
const JSON_LD_ENABLED =
  process.env.NEXT_JSON_LD_ENABLED !== "0" &&
  (process.env.NEXT_CSP_STRICT !== "1" ||
    process.env.NEXT_CSP_REPORT_ONLY === "1" ||
    process.env.NEXT_CSP_ALLOW_UNSAFE_INLINE === "1");

function absoluteUrl(input: string | null | undefined): string | undefined {
  if (!input || /^(data|blob):/i.test(input)) return undefined;
  const runtimePath = input.startsWith("/") ? rootPublicAssetUrl(input) : input;
  try {
    return new URL(runtimePath, SITE).toString();
  } catch {
    return undefined;
  }
}

function absolutePageUrl(path: string): string {
  const runtimePath = rootPublicAssetUrl(toG5ShortPath(path));
  return absoluteUrl(runtimePath) ?? `${SITE}${runtimePath}`;
}

function jsonLdScript(payload: object, id?: string) {
  if (!JSON_LD_ENABLED) return null;

  return (
    <script
      type="application/ld+json"
      {...(id ? { "data-g5-json-ld": id } : {})}
      // dangerouslySetInnerHTML 대신 children string — Next.js 가 자동 escape.
      // schema.org spec 에서 JSON 본문은 사용자 입력 그대로 두면 XSS 위험이라
      // 안전하게 stringify 후 </script> 만 escape.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function ProductJsonLd({
  product,
  reviews = [],
}: {
  product: ShopProduct;
  reviews?: ShopReview[];
}) {
  const url = absolutePageUrl(`/shop/${product.it_id}`);
  const inStock =
    product.it_soldout !== "1" && (product.it_stock_qty ?? 0) !== 0;
  const imageUrls = (product.images?.length ? product.images : [product.image_url])
    .map(absoluteUrl)
    .filter(Boolean) as string[];
  const description = plainTextSummary(
    product.it_explan || product.it_basic,
    product.it_name
  );

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.it_name,
    description,
    sku: product.it_id,
    brand: product.it_brand
      ? { "@type": "Brand", name: product.it_brand }
      : undefined,
    manufacturer: product.it_maker || undefined,
    countryOfOrigin: product.it_origin || undefined,
    image: imageUrls.length > 0 ? imageUrls : undefined,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "KRW",
      price: product.it_price,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  // 후기 — 1건 이상 있으면 AggregateRating + 최신 review.
  if ((product.review_count ?? 0) > 0 && (product.review_avg ?? 0) > 0) {
    payload.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.review_avg,
      reviewCount: product.review_count,
    };
  }
  if (reviews.length > 0) {
    payload.review = reviews.slice(0, 3).map((r) => ({
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.is_score,
        bestRating: 5,
      },
      author: { "@type": "Person", name: r.mb_nick || "익명" },
      reviewBody: (r.is_content || "").replace(/<[^>]+>/g, "").slice(0, 200),
    }));
  }

  return jsonLdScript(payload, "product");
}

export function ArticleJsonLd({
  post,
  boTable,
  boardName,
  path,
}: {
  post: PostDetail;
  boTable: string;
  boardName?: string;
  path: string;
}) {
  const canonical = absolutePageUrl(path);
  const fileImages = (post.files ?? [])
    .map((file) => file.bf_url || file.bf_fileurl || file.bf_thumburl)
    .filter(Boolean) as string[];
  const imageUrls = [post.thumbnail, ...(post.images ?? []), ...fileImages]
    .map(absoluteUrl)
    .filter(Boolean) as string[];

  return jsonLdScript(
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.wr_subject,
      description: plainTextSummary(post.wr_content, post.wr_subject),
      articleSection: boardName || post.bo_subject || boTable,
      author: {
        "@type": "Person",
        name: post.mb_nick || post.wr_name || "Anonymous",
      },
      datePublished: post.wr_datetime || undefined,
      dateModified: post.wr_last || post.wr_datetime || undefined,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonical,
      },
      url: canonical,
      ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    },
    "article"
  );
}

export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url?: string }[];
}) {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: it.url.startsWith("http") ? it.url : absolutePageUrl(it.url) } : {}),
    })),
  }, "breadcrumb");
}

export function WebPageJsonLd({
  title,
  description,
  path,
}: {
  title: string;
  description?: string | null;
  path: string;
}) {
  const url = absolutePageUrl(path);

  return jsonLdScript(
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description: plainTextSummary(description, title),
      url,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": url,
      },
    },
    "webpage"
  );
}

export function ContentWebPageJsonLd({
  content,
  pathPrefix = "/content",
}: {
  content: ContentData;
  pathPrefix?: string;
}) {
  const normalizedPathPrefix = pathPrefix.replace(/\/+$/, "") || "/content";

  return (
    <WebPageJsonLd
      title={content.co_subject}
      description={content.co_content}
      path={`${normalizedPathPrefix}/${encodeURIComponent(content.co_id)}`}
    />
  );
}

export function OrganizationJsonLd({
  name,
  logo,
  sameAs,
}: {
  name: string;
  logo?: string;
  sameAs?: string[];
}) {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: SITE,
    logo: logo ?? `${SITE}/og-default.png`,
    sameAs: sameAs ?? [],
  });
}

export function WebSiteJsonLd({ name }: { name: string }) {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: SITE,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });
}
