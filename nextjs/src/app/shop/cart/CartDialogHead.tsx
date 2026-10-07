"use client";

import Image from "next/image";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { shouldBypassImageOptimization } from "@/lib/image";
import { formatPrice } from "@/lib/utils";
import type { CartGroup } from "./cartGroups";

/** 장바구니 창(선택사항수정 · 쿠폰적용)의 머리 — 상품 카드의 옵션 고르기 창과 같은 손잡이(product-quick-add-*). */
export function CartDialogHead({ group, kicker }: { group: CartGroup; kicker: string }) {
  const image = group.item.image_url;
  return (
    <DialogHeader className="product-quick-add-head flex-row items-center gap-3 border-b p-4 pr-12 text-left">
      <span className="product-quick-add-thumb relative block h-14 w-14 flex-none overflow-hidden rounded-md border bg-muted">
        {image ? (
          <Image src={image} alt="" fill sizes="64px" className="object-cover" unoptimized={shouldBypassImageOptimization(image)} />
        ) : (
          <ProductImageFallback compact />
        )}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="product-quick-add-kicker truncate text-xs text-muted-foreground">{kicker}</p>
        <DialogTitle className="product-quick-add-name line-clamp-2 text-[15px] leading-snug">{group.item.it_name}</DialogTitle>
        <DialogDescription className="product-quick-add-price text-sm font-bold text-foreground">
          <span className="product-quick-add-price-now">{formatPrice(group.salePrice)}</span>
        </DialogDescription>
      </div>
    </DialogHeader>
  );
}
