"use client";

import { useEffect } from "react";
import { isProductDetailSoldOut } from "@/components/shop/productDetailHelpers";
import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import {
  applyClientJsonLd,
  applyClientPageMetadata,
  clientAbsoluteUrl,
  plainTextSummary,
} from "@/lib/client-metadata";
import { g5ShortHref } from "@/lib/g5-short-url";
import { shopProductPath } from "@/lib/product-url";

export function useProductDetailMetadata(
  product: ShopProduct | null,
  productRewriteMode: BbsRewriteMode
) {
  useEffect(() => {
    if (!product) return;
    const productPath = shopProductPath(product, productRewriteMode);
    const canonical = new URL(g5ShortHref(productPath), window.location.origin).toString();
    const imageUrls = (product.images?.length ? product.images : [product.image_url])
      .map((image) => (image ? clientAbsoluteUrl(image) : undefined))
      .filter(Boolean) as string[];
    const description = product.it_explan || product.it_basic || product.it_name;

    applyClientPageMetadata({
      title: product.it_name,
      description,
      path: productPath,
      image: product.image_url || product.images?.[0],
      // 정적 셸은 noindex 로 구워져 있다. 실제 상품을 찾았으니 색인을 연다(중복 robots 도 정리).
      index: true,
    });
    applyClientJsonLd("article", null);
    applyClientJsonLd("product", {
      "@context": "https://schema.org/",
      "@type": "Product",
      name: product.it_name,
      description: plainTextSummary(description, product.it_name),
      sku: product.it_id,
      ...(product.it_brand ? { brand: { "@type": "Brand", name: product.it_brand } } : {}),
      ...(product.it_maker ? { manufacturer: product.it_maker } : {}),
      ...(product.it_origin ? { countryOfOrigin: product.it_origin } : {}),
      ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
      offers: {
        "@type": "Offer",
        url: canonical,
        priceCurrency: "KRW",
        price: product.it_price,
        availability:
          !isProductDetailSoldOut(product)
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
      },
      ...(product.review_count && product.review_avg
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: product.review_avg,
              reviewCount: product.review_count,
            },
          }
        : {}),
    });
    applyClientJsonLd("breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "쇼핑몰",
          item: new URL(g5ShortHref("/shop"), window.location.origin).toString(),
        },
        ...(product.ca_id && product.ca_name
          ? [
              {
                "@type": "ListItem",
                position: 2,
                name: product.ca_name,
                item: new URL(
                  g5ShortHref(`/shop/categories/${product.ca_id}`),
                  window.location.origin
                ).toString(),
              },
            ]
          : []),
        {
          "@type": "ListItem",
          position: product.ca_id && product.ca_name ? 3 : 2,
          name: product.it_name,
          item: canonical,
        },
      ],
    });
  }, [product, productRewriteMode]);
}
