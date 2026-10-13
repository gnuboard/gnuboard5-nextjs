import {
  ChevronRight,
  Heart,
  LayoutGrid,
  Package,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
} from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { ProductQuickAdd } from "@/components/shop/ProductQuickAdd";
import { isProductSoldOut } from "@/lib/shop-product-state";
import { formatPrice, truncate } from "@/lib/utils";
import { shopProductHref } from "@/lib/product-url";
import type { ShopProduct } from "@/lib/shop-types";
import type { G5ThemeComponentProps } from "@/lib/theme-types";

const QUICK_LINKS = [
  { icon: LayoutGrid, title: "전체 상품", desc: "카탈로그 둘러보기", href: "/shop/products" },
  { icon: Sparkles, title: "이벤트", desc: "진행 중인 기획전", href: "/shop/events" },
  { icon: Ticket, title: "쿠폰존", desc: "받을 수 있는 쿠폰", href: "/shop/couponzone" },
  { icon: Heart, title: "위시리스트", desc: "찜한 상품 모아보기", href: "/shop/wishlist" },
];

function pickProducts(
  primary: ShopProduct[] | undefined,
  fallback: ShopProduct[] | undefined,
  count: number
): ShopProduct[] {
  const seen = new Set<string>();
  const result: ShopProduct[] = [];
  for (const list of [primary ?? [], fallback ?? []]) {
    for (const product of list) {
      if (!product?.it_id || seen.has(product.it_id)) continue;
      seen.add(product.it_id);
      result.push(product);
      if (result.length >= count) return result;
    }
  }
  return result;
}

/**
 * 상품 카드. 사진과 이름이 상세로 가는 링크이고(사진 링크는 탭 순서에서 뺀다 — 같은 곳을 두 번 지나지 않게),
 * 아래 줄 오른쪽 "담기"는 앱의 ProductQuickAdd — 옵션 없는 상품은 바로 담고, 옵션 상품은 옵션 고르기 창을 연다.
 * 카드 전체를 링크 하나로 감싸면 그 안에 단추를 둘 수 없어(링크 안 단추는 잘못된 HTML) 이렇게 나눴다.
 */
function ProductCard({ product, badge }: { product: ShopProduct; badge?: "new" }) {
  const soldout = isProductSoldOut(product);
  const rating = Number(product.review_avg);
  const hasRating = Number.isFinite(rating) && rating > 0;
  const href = shopProductHref(product);

  return (
    <article className="doc-product-card">
      <Link href={href} className="doc-product-thumb" tabIndex={-1} aria-hidden="true">
        {product.image_url ? (
          <img src={product.image_url} alt="" loading="lazy" />
        ) : (
          <span className="doc-product-thumb-fallback">
            {product.it_name?.slice(0, 2) || "상품"}
          </span>
        )}
        {soldout ? (
          <span className="doc-product-badge doc-product-badge-soldout">품절</span>
        ) : badge === "new" ? (
          <span className="doc-product-badge doc-product-badge-new">NEW</span>
        ) : null}
      </Link>
      <div className="doc-product-body">
        {product.ca_name ? (
          <span className="doc-product-cat">{product.ca_name}</span>
        ) : null}
        <Link href={href} className="doc-product-name">
          {truncate(product.it_name || "상품", 44)}
        </Link>
        <div className="doc-product-foot">
          <span className="doc-product-price">
            {formatPrice(product.it_price)}
          </span>
          <span className="doc-product-foot-end">
            {hasRating ? (
              <span className="doc-product-review">
                <Star size={12} aria-hidden fill="currentColor" />
                {rating.toFixed(1)}
              </span>
            ) : null}
            <ProductQuickAdd product={product} href={href} className="doc-product-add" />
          </span>
        </div>
      </div>
    </article>
  );
}

function ProductSection({
  eyebrow,
  title,
  desc,
  products,
  badge,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  products: ShopProduct[];
  badge?: "new";
}) {
  if (products.length === 0) return null;

  return (
    <section className="doc-section" aria-label={title}>
      <div className="doc-section-head flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="doc-section-eyebrow">{eyebrow}</p>
          <h2 className="doc-section-title">{title}</h2>
          <p className="doc-section-desc">{desc}</p>
        </div>
        <Link
          href="/shop/products"
          aria-label={`${title} 더 보기`}
          className="btn btn-outline btn-sm gap-1 rounded-lg"
        >
          더 보기
          <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
      <div className="doc-product-grid">
        {products.map((product) => (
          <ProductCard key={product.it_id} product={product} badge={badge} />
        ))}
      </div>
    </section>
  );
}

export function HandbookShopHomePage({
  config,
  shopHome,
  shopProducts,
}: G5ThemeComponentProps) {
  const recommended = pickProducts(
    shopHome?.recommendedProducts,
    shopHome?.featuredProducts ?? shopProducts,
    8
  );
  const best = pickProducts(shopHome?.bestProducts, shopHome?.popularProducts, 8);
  const latest = pickProducts(shopHome?.latestProducts, shopHome?.featuredProducts, 8);
  const hasAnyProduct = recommended.length + best.length + latest.length > 0;

  return (
    <div className="doc-content">
      <section className="doc-hero" aria-labelledby="shop-hero-heading">
        <span className="doc-eyebrow">
          <ShoppingBag size={13} aria-hidden />
          쇼핑 안내
        </span>
        <h1 id="shop-hero-heading" className="doc-hero-title">
          <span className="doc-hero-accent">{config.site.name} 쇼핑</span> 카탈로그
        </h1>
        <p className="doc-hero-lead">
          커뮤니티와 같은 문서형 레이아웃에서 상품·이벤트·쿠폰을 한눈에 살펴보고 바로 이동합니다.
        </p>
        <div className="doc-hero-actions">
          <Link href="/shop/products" className="btn btn-primary gap-1.5 rounded-lg">
            <LayoutGrid size={16} aria-hidden />
            전체 상품 보기
          </Link>
          <Link href="/shop/events" className="btn btn-outline gap-1.5 rounded-lg">
            <Sparkles size={16} aria-hidden />
            이벤트
          </Link>
          <Link href="/shop/couponzone" className="btn btn-ghost gap-1 rounded-lg">
            쿠폰존
            <ChevronRight size={15} aria-hidden />
          </Link>
        </div>

        <div className="doc-shop-links">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} className="doc-shop-link">
                <span className="doc-shop-link-icon">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="doc-shop-link-body">
                  <span className="doc-shop-link-title">{link.title}</span>
                  <span className="doc-shop-link-desc block">{link.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {hasAnyProduct ? (
        <>
          <ProductSection
            eyebrow="Recommended"
            title="추천 상품"
            desc="문서형 카드로 정리한 이번 주 추천 상품입니다."
            products={recommended}
          />
          <ProductSection
            eyebrow="Best"
            title="베스트셀러"
            desc="가장 많이 찾은 인기 상품을 모았습니다."
            products={best}
          />
          <ProductSection
            eyebrow="New"
            title="신상품"
            desc="새로 등록된 상품을 먼저 만나보세요."
            products={latest}
            badge="new"
          />
        </>
      ) : (
        <section className="doc-section">
          <div className="doc-guide-list">
            <p className="doc-empty">
              <Package size={22} aria-hidden className="mx-auto mb-2 block text-[color:var(--doc-muted)]" />
              아직 표시할 상품이 없습니다. 관리자에서 상품을 등록해 주세요.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
