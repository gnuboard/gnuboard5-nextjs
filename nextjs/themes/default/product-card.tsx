"use client";

import { GalleryThumbnail } from "@/app/boards/[bo_table]/GalleryThumbnail";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { G5Link as Link } from "@/components/ui/g5-link";
import { normalizeG5ImageSrc } from "@/lib/image";
import type { G5ThemeProductCardProps } from "@/lib/theme-types";
import type { ShopProduct } from "@/lib/shop-types";
import { formatNumber, formatPrice } from "@/lib/utils";

function discountPercent(product: ShopProduct): number {
  if (String(product.it_tel_inq ?? "0") === "1") return 0;
  if (product.it_price <= 0 || product.it_cust_price <= product.it_price) return 0;
  return Math.round(((product.it_cust_price - product.it_price) / product.it_cust_price) * 100);
}

function isSoldOut(product: ShopProduct): boolean {
  return String(product.it_soldout ?? "0") === "1" || Number(product.it_stock_qty) <= 0;
}

/**
 * 레퍼런스 온담 상품 카드(sct_li). 홈의 상품 줄과 목록 페이지(ProductCard 슬롯)가
 * 같은 한 장을 쓴다: 정사각 이미지 · 브랜드 · 이름 · 할인율/판매가/정가 · 별점/리뷰/담기.
 */
export function SoluneProductCard({ product, href, priority = false }: G5ThemeProductCardProps) {
  const discount = discountPercent(product);
  const telInquiry = String(product.it_tel_inq ?? "0") === "1";
  const brand = product.it_brand || product.it_maker || product.ca_name || "";
  const rating = Number(product.review_avg ?? 0);
  const image = normalizeG5ImageSrc(product.image_url);

  return (
    <article className="sct_li">
      <Link className="sct_img" href={href}>
        {image ? (
          <GalleryThumbnail src={image} alt={product.it_name} sizes="(max-width: 780px) 50vw, 300px" priority={priority} />
        ) : (
          <ProductImageFallback compact />
        )}
        {String(product.it_type3 ?? "0") === "1" ? <span className="ondam-card-badge">NEW</span> : null}
        {isSoldOut(product) ? <span className="ondam-card-soldout">SOLD OUT</span> : null}
      </Link>
      {brand ? <p className="ondam-card-brand">{brand}</p> : null}
      <Link className="sct_txt" href={href}>
        {product.it_name}
      </Link>
      <div className="ondam-card-prices">
        {discount > 0 ? <span className="ondam-card-off">{discount}%</span> : null}
        <span className="ondam-card-now">{telInquiry ? "전화문의" : formatPrice(product.it_price)}</span>
        {discount > 0 ? <span className="ondam-card-was">{formatPrice(product.it_cust_price)}</span> : null}
      </div>
      <div className="ondam-card-meta">
        {rating > 0 ? <span className="ondam-card-star">★ {rating.toFixed(1)}</span> : null}
        <span>리뷰 {formatNumber(Number(product.review_count ?? 0))}</span>
        <Link className="ondam-card-add" href={href}>
          담기
        </Link>
      </div>
    </article>
  );
}
