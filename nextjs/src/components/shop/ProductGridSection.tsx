"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { createElement, useState } from "react";
import { GitCompare } from "lucide-react";
import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { g5ShortHref } from "@/lib/g5-short-url";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatPrice } from "@/lib/utils";
import { useCompareStore } from "@/store/compare";
import { useThemeSlot } from "@/components/providers/ThemeSlotsProvider";
import { ProductImageFallback } from "./ProductImageFallback";
import { ProductQuickAdd } from "./ProductQuickAdd";

interface ProductCardProps {
  product: ShopProduct;
  priority?: boolean;
  productRewriteMode?: BbsRewriteMode;
}

/** 테마가 ProductCard 슬롯을 제공하면 그 카드를, 아니면 기본 카드를 그린다.
 *  (createElement: 컨텍스트에서 꺼낸 컴포넌트를 JSX 태그로 쓰면
 *  react-hooks/static-components 가 렌더 중 생성으로 본다.) */
export function ProductCard(props: ProductCardProps) {
  const themeProductCard = useThemeSlot("ProductCard");
  if (themeProductCard) {
    return createElement(themeProductCard, {
      product: props.product,
      href: shopProductHref(props.product, props.productRewriteMode),
      priority: props.priority,
    });
  }
  return <DefaultProductCard {...props} />;
}

function ProductBadges({ product }: { product: ShopProduct }) {
  return (
    <div className="absolute left-2 top-2 flex flex-col gap-1">
      {product.it_type1 === "1" && <span className="product-badge product-badge-hot">HOT</span>}
      {product.it_type2 === "1" && <span className="product-badge product-badge-pick">PICK</span>}
      {product.it_type3 === "1" && <span className="product-badge product-badge-new">NEW</span>}
      {product.it_type5 === "1" && <span className="product-badge product-badge-sale">SALE</span>}
    </div>
  );
}

function DefaultProductCard({ product, priority = false, productRewriteMode }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const isTelInquiry = String(product.it_tel_inq ?? "0") === "1";
  const hasDiscount =
    !isTelInquiry &&
    product.it_price > 0 &&
    product.it_cust_price > 0 && product.it_cust_price > product.it_price;
  const discountPercent = hasDiscount
    ? Math.round(((product.it_cust_price - product.it_price) / product.it_cust_price) * 100)
    : 0;
  const showImage = Boolean(product.image_url && !imageFailed);
  const href = shopProductHref(product, productRewriteMode);

  return (
    <div className="product-card group relative">
      <Link href={href} className="flex flex-1 flex-col gap-1.5">
        <div className="product-image-shell">
          {showImage ? (
            <Image
              src={product.image_url}
              alt={product.it_name}
              fill
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 45vw, 25vw"
              unoptimized={shouldBypassImageOptimization(product.image_url)}
              priority={priority}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <ProductImageFallback compact />
          )}
          <ProductBadges product={product} />
        </div>
        <p className="mt-3 min-h-4 truncate text-xs font-medium text-[#5f6872]">
          {product.ca_name || "\u00A0"}
        </p>
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[#27313c] group-hover:text-primary">
          {product.it_name}
        </h3>
        <div className="mt-auto">
          <div className="flex items-center gap-2">
            {hasDiscount && (
              <span className="text-sm font-black text-[#b45309]">{discountPercent}%</span>
            )}
            <span className="text-base font-black text-[#1f2933]">
              {isTelInquiry ? "전화문의" : formatPrice(product.it_price)}
            </span>
          </div>
          <span className="block min-h-4 text-xs text-[#5f6872] line-through">
            {hasDiscount && !isTelInquiry ? formatPrice(product.it_cust_price) : "\u00A0"}
          </span>
        </div>
      </Link>
      {/* 담기: 옵션 없는 상품은 바로 담고, 옵션 상품은 옵션 고르기 창을 연다(테마 카드와 같은 ProductQuickAdd). */}
      <ProductQuickAdd
        product={product}
        href={href}
        className="product-card-add mt-2.5 h-9 w-full rounded-md border border-[#e4e9e6] bg-white text-xs font-semibold text-[#27313c] transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-[#f3f5f4] disabled:text-[#5f6872] disabled:hover:border-[#e4e9e6]"
      />
      <CompareToggleButton product={product} />
    </div>
  );
}

function CompareToggleButton({ product }: { product: ShopProduct }) {
  const { isCompared, add, remove } = useCompareStore();
  const active = isCompared(product.it_id);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (active) {
          remove(product.it_id);
          return;
        }

        const ok = add({
          it_id: product.it_id,
          it_name: product.it_name,
          it_price: product.it_price,
          it_cust_price: product.it_cust_price,
          it_tel_inq: product.it_tel_inq,
          image_url: product.image_url,
          ca_name: product.ca_name,
          it_brand: product.it_brand,
          it_seo_title: product.it_seo_title,
        });

        if (!ok) {
          toastError("최대 4개까지 비교할 수 있습니다.");
          return;
        }

        toastSuccess("비교 목록에 추가했습니다.");
      }}
      className={
        "absolute right-2 top-2 z-10 rounded-full p-1.5 transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "bg-white/95 text-muted-foreground opacity-0 shadow-[0_1px_3px_rgba(15,23,42,0.14)] group-hover:opacity-100")
      }
      title={active ? "비교 해제" : "비교 추가"}
      aria-label={active ? "비교 해제" : "비교 추가"}
    >
      <GitCompare className="h-3.5 w-3.5" />
    </button>
  );
}

export function ProductGridSection({
  title,
  products,
  viewAllHref,
  scroll = false,
  subtitle,
  className = "home-product-section",
  productRewriteMode,
}: {
  title: string;
  products: ShopProduct[];
  viewAllHref: string;
  scroll?: boolean;
  subtitle?: string;
  className?: string;
  productRewriteMode?: BbsRewriteMode;
}) {
  if (products.length === 0) return null;

  return (
    <section className={className}>
      <div className="home-product-head">
        <div>
          <h2 className="home-product-title">{title}</h2>
          {subtitle && <p className="home-product-subtitle">{subtitle}</p>}
        </div>
        <Link href={g5ShortHref(viewAllHref)} className="section-more">
          더보기
        </Link>
      </div>

      {scroll ? (
        <div className="scrollbar-hide grid w-full min-w-0 max-w-full grid-flow-col auto-cols-[minmax(150px,45%)] gap-3 overflow-x-auto overscroll-x-contain pb-4 sm:auto-cols-[30%] md:auto-cols-[22%] lg:auto-cols-[18%]">
          {products.map((product, idx) => (
            <ProductCard
              key={product.it_id}
              product={product}
              priority={idx < 2}
              productRewriteMode={productRewriteMode}
            />
          ))}
        </div>
      ) : (
        <ul className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-hide sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 md:grid-cols-4">
          {products.map((product, idx) => (
            <li
              key={product.it_id}
              className="min-w-0 basis-[42%] shrink-0 snap-start sm:basis-auto sm:shrink"
            >
              <ProductCard
                product={product}
                priority={idx < 4}
                productRewriteMode={productRewriteMode}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
