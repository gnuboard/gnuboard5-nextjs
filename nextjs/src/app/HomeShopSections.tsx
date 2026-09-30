"use client";

import { useEffect, useState } from "react";
import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { ProductGridSection } from "@/components/shop/ProductGridSection";
import { getShopProductList } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { Skeleton } from "@/components/ui/skeleton";

function ProductSectionSkeleton({ title }: { title: string }) {
  return (
    <section className="home-product-section">
      <div className="home-product-head">
        <div>
          <h2 className="home-product-title">{title}</h2>
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <Skeleton className="h-8 w-16 rounded-[4px]" />
      </div>
      <ul className="flex w-full min-w-0 max-w-full gap-3 overflow-x-hidden pb-2 scrollbar-hide sm:grid sm:grid-cols-3 sm:pb-0 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <li key={index} className="min-w-0 basis-[42%] shrink-0 sm:basis-auto sm:shrink">
            <div className="product-card">
              <Skeleton className="aspect-square w-full rounded-[6px]" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeShopSections() {
  const [popularItems, setPopularItems] = useState<ShopProduct[]>([]);
  const [latestItems, setLatestItems] = useState<ShopProduct[]>([]);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    Promise.all([
      getShopProductList({ sort: "popular", per_page: 8 }),
      getShopProductList({ sort: "latest", per_page: 8 }),
      getClientPublicSettings(),
    ])
      .then(([popular, latest, settings]) => {
        if (!alive) return;
        setPopularItems(popular.products);
        setLatestItems(latest.products);
        setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setPopularItems([]);
        setLatestItems([]);
        console.error("[home:shop-sections]", error);
      })
      .finally(() => {
        if (!alive) return;
        setLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) {
    return (
      <section className="site-container grid gap-6 px-4 pt-6 md:grid-cols-2">
        <ProductSectionSkeleton title="인기 상품" />
        <ProductSectionSkeleton title="새 상품" />
      </section>
    );
  }

  if (popularItems.length === 0 && latestItems.length === 0) return null;

  return (
    <section className="site-container grid gap-6 px-4 pt-6 md:grid-cols-2">
      <ProductGridSection
        title="인기 상품"
        subtitle="많이 찾는 상품을 먼저 보여줍니다."
        products={popularItems}
        viewAllHref="/shop/products?sort=popular"
        productRewriteMode={productRewriteMode}
      />
      <ProductGridSection
        title="새 상품"
        subtitle="최근 등록된 쇼핑 상품입니다."
        products={latestItems}
        viewAllHref="/shop/products?sort=latest"
        productRewriteMode={productRewriteMode}
      />
    </section>
  );
}
