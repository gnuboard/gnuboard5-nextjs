"use client";

import Image from "next/image";
import type { ShopOrder } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { getShopCartShippingPaymentLabel } from "@/lib/shop-shipping-label";
import { formatCartOption, formatPrice } from "@/lib/utils";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";

type OrderLine = NonNullable<ShopOrder["items"]>[number];

type OrderProduct = {
  itId: string;
  /** 이름 · 그림 · 링크에 쓰는 대표 줄 */
  first: OrderLine;
  /** 본품 줄 먼저, 그다음 담은 순서 */
  lines: OrderLine[];
};

function lineTotal(line: OrderLine): number {
  return line.line_total ?? line.ct_price * line.ct_qty;
}

/** 주문 줄을 상품별로 묶는다 — 영카트 orderinquiryview.php 처럼 같은 상품의 옵션 줄은 한 칸. */
function groupOrderLines(lines: OrderLine[]): OrderProduct[] {
  const byItem = new Map<string, OrderLine[]>();
  for (const line of lines) {
    byItem.set(line.it_id, [...(byItem.get(line.it_id) ?? []), line]);
  }
  return Array.from(byItem.entries()).map(([itId, group]) => {
    const sorted = [...group].sort(
      (a, b) => Number(a.io_type ?? 0) - Number(b.io_type ?? 0) || Number(a.ct_id) - Number(b.ct_id)
    );
    return { itId, first: sorted[0], lines: sorted };
  });
}

/** 옵션 줄 — "옵션 수량개 (+옵션금액)"(영카트 print_item_options). 옵션 없는 줄은 상품명. */
function lineLabel(line: OrderLine): string {
  const label = formatCartOption(line.ct_option, line.it_name) || line.it_name;
  const ioPrice = Number(line.io_price ?? 0);
  return `${label} ${line.ct_qty}개 (${ioPrice >= 0 ? "+" : ""}${formatPrice(ioPrice)})`;
}

/** 주문 상세의 "주문 상품" — 상품마다 한 칸, 그 아래에 옵션 줄 · 총수량 · 배송비 · 상품별 합계. */
export function OrderDetailItems({
  items,
  productRewriteMode,
}: {
  items: OrderLine[];
  productRewriteMode: BbsRewriteMode;
}) {
  return (
    <section className="shop-order-section rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">주문 상품</h2>
      <div className="space-y-3">
        {groupOrderLines(items).map(({ itId, first, lines }) => (
          <div key={itId} className="flex items-start gap-4 rounded-md border p-3">
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
              {first.image_url ? (
                <Image
                  src={first.image_url}
                  alt={first.it_name}
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized={shouldBypassImageOptimization(first.image_url)}
                />
              ) : (
                <ProductImageFallback compact />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <a href={shopProductHref(first, productRewriteMode)} className="text-sm font-medium hover:text-primary">
                {first.it_name}
              </a>
              <ul className="mt-1 space-y-0.5">
                {lines.map((line) => (
                  <li key={line.ct_id} className="text-xs text-muted-foreground">
                    {lineLabel(line)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                총수량 {lines.reduce((sum, line) => sum + line.ct_qty, 0)}개
              </p>
              <p className="text-xs text-muted-foreground" data-shop-order-item-send-cost-label="1">
                배송비: {getShopCartShippingPaymentLabel(first, items)}
              </p>
            </div>
            <span className="text-sm font-bold">
              {formatPrice(lines.reduce((sum, line) => sum + lineTotal(line), 0))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
