"use client";

import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { RecentlyViewed, RelatedProducts } from "./ProductDetailSections";

interface ProductRecommendationsProps {
  currentId: string;
  items?: ShopProduct[];
  productRewriteMode?: BbsRewriteMode;
}

export function ProductRecommendations({
  currentId,
  items,
  productRewriteMode,
}: ProductRecommendationsProps) {
  return (
    <>
      <RelatedProducts items={items} productRewriteMode={productRewriteMode} />
      <RecentlyViewed currentId={currentId} productRewriteMode={productRewriteMode} />
    </>
  );
}
