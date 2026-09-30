"use client";

import { useEffect, useState } from "react";
import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { ProductGridSection } from "@/components/shop/ProductGridSection";
import { getShopProductList } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";

type SectionKey = "recommended" | "best" | "new" | "discount";

type ProductSections = Record<SectionKey, ShopProduct[]>;

const EMPTY_SECTIONS: ProductSections = {
  recommended: [],
  best: [],
  new: [],
  discount: [],
};

export function DeferredShopSections() {
  const [sections, setSections] = useState<ProductSections>(EMPTY_SECTIONS);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    Promise.all([
      getShopProductList({ it_type2: "1", per_page: 8 }),
      getShopProductList({ it_type1: "1", per_page: 8 }),
      getShopProductList({ sort: "latest", per_page: 8 }),
      getShopProductList({ it_type5: "1", per_page: 8 }),
      getClientPublicSettings(),
    ])
      .then(([recommended, best, latest, discount, settings]) => {
        if (!alive) return;
        setError("");
        setSections({
          recommended: recommended.products,
          best: best.products,
          new: latest.products,
          discount: discount.products,
        });
        setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (!alive) return;
        setSections(EMPTY_SECTIONS);
        setError("상품 섹션을 불러오지 못했습니다.");
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
      <div role="status" aria-label="상품 섹션 로딩 중" className="space-y-8">
        {Array.from({ length: 2 }).map((_, sectionIndex) => (
          <section key={sectionIndex} className="home-product-section">
            <div className="home-product-head">
              <div className="space-y-2">
                <div className="skeleton h-6 w-32 rounded" />
                <div className="skeleton h-4 w-48 rounded" />
              </div>
              <div className="skeleton h-4 w-14 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((__, itemIndex) => (
                <div key={itemIndex} className="space-y-3">
                  <div className="skeleton aspect-square rounded-[8px]" />
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-4 w-1/2 rounded" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="status" className="rounded-[4px] border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {error}
      </p>
    );
  }

  if (
    sections.recommended.length === 0 &&
    sections.best.length === 0 &&
    sections.new.length === 0 &&
    sections.discount.length === 0
  ) {
    return null;
  }

  return (
    <>
      {sections.recommended.length > 0 && (
        <ProductGridSection
          title="추천 상품"
          subtitle="운영자가 추천한 상품입니다."
          products={sections.recommended}
          viewAllHref="/shop/products?it_type2=1"
          productRewriteMode={productRewriteMode}
        />
      )}
      {sections.best.length > 0 && (
        <ProductGridSection
          title="베스트 상품"
          subtitle="대표 인기 상품을 모았습니다."
          products={sections.best}
          viewAllHref="/shop/products?it_type1=1"
          productRewriteMode={productRewriteMode}
          scroll
        />
      )}
      {sections.new.length > 0 && (
        <ProductGridSection
          title="새 상품"
          subtitle="최근 등록된 상품입니다."
          products={sections.new}
          viewAllHref="/shop/products?sort=latest"
          productRewriteMode={productRewriteMode}
          scroll
        />
      )}
      {sections.discount.length > 0 && (
        <ProductGridSection
          title="할인 상품"
          subtitle="할인이 적용된 상품입니다."
          products={sections.discount}
          viewAllHref="/shop/products?it_type5=1"
          productRewriteMode={productRewriteMode}
        />
      )}
    </>
  );
}
