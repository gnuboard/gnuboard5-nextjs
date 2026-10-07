"use client";

import Image from "next/image";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import type { ShopCartItem } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { formatCartLineOption, groupCartItems } from "../cart/cartGroups";
import { cartItemLineTotal } from "./orderPricingHelpers";

/**
 * 주문 상품 — 영카트 orderform.sub.php 처럼 상품마다 한 칸(group by it_id)으로 묶고, 그 아래에 옵션 줄을
 * "옵션 수량개 (+옵션금액)" 으로 나열한다(print_item_options). 같은 상품의 옵션 줄이 여러 상품처럼 보이지 않게.
 */
export function OrderItemsSummary({ items }: { items: ShopCartItem[] }) {
  const groups = groupCartItems(items);
  return (
    <section className="shop-order-section shop-order-section--items rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">주문 상품</h2>
      <div className="shop-order-items space-y-3">
        {groups.map((group) => {
          const item = group.item;
          const subtotal = group.lines.reduce((sum, line) => sum + cartItemLineTotal(line), 0);
          return (
            <div key={group.itId} className="shop-order-item flex items-start gap-3">
              <div className="shop-order-item-thumb relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.it_name}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <ProductImageFallback compact />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.it_name}</p>
                <ul className="shop-order-item-options mt-1 space-y-0.5">
                  {group.lines.map((line) => (
                    <li key={line.ct_id} className="text-xs text-muted-foreground">
                      {formatCartLineOption(line)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  총수량 {group.totalQty}개 · 판매가 {formatPrice(group.salePrice)}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  data-shop-order-send-cost-label="1"
                >
                  배송비: {group.shippingLabel}
                </p>
              </div>
              <span className="shop-order-item-price text-sm font-bold">
                {formatPrice(subtotal)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
