"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ProductGridSection } from "@/components/shop/ProductGridSection";
import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { getShopProductList } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";

export function ShopHomePopular() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;

    Promise.all([
      getShopProductList({ sort: "popular", per_page: 8 }),
      getClientPublicSettings(),
    ])
      .then(([popular, settings]) => {
        if (!alive) return;
        setProducts(popular.products);
        setProductRewriteMode(settings.cf_bbs_rewrite);
        setError(false);
      })
      .catch(() => {
        if (!alive) return;
        setProducts([]);
        setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="home-product-section" aria-label="인기 상품 로딩 중">
        <div className="home-product-head">
          <div className="space-y-2">
            <div className="skeleton h-6 w-28 rounded" />
            <div className="skeleton h-4 w-52 rounded" />
          </div>
          <div className="skeleton h-4 w-14 rounded" />
        </div>
        <div className="scrollbar-hide grid w-full min-w-0 max-w-full grid-flow-col auto-cols-[minmax(150px,45%)] gap-3 overflow-x-auto overscroll-x-contain pb-4 sm:auto-cols-[30%] md:auto-cols-[22%] lg:auto-cols-[18%]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <div className="skeleton aspect-square rounded-[8px]" />
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || products.length === 0) {
    return (
      <EmptyState
        className="mb-8"
        title="표시할 상품이 없습니다"
        description="상품을 등록하면 쇼핑몰 첫 화면에 표시됩니다."
      />
    );
  }

  return (
    <ProductGridSection
      title="인기 상품"
      subtitle="방문자가 많이 찾는 상품입니다."
      products={products}
      viewAllHref="/shop/products?sort=popular"
      productRewriteMode={productRewriteMode}
      scroll
    />
  );
}
