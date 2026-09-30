"use client";

import Image from "next/image";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import type { ShopCartItem } from "@/lib/api";
import { getShopCartShippingPaymentLabel } from "@/lib/shop-shipping-label";
import { formatCartOption, formatPrice } from "@/lib/utils";
import {
  cartItemLineTotal,
  cartItemUnitPrice,
} from "./orderPricingHelpers";

export function OrderItemsSummary({ items }: { items: ShopCartItem[] }) {
  return (
    <section className="shop-order-section shop-order-section--items rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">주문 상품</h2>
      <div className="shop-order-items space-y-3">
        {items.map((item) => (
          <div key={item.ct_id} className="shop-order-item flex items-center gap-3">
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
            <div className="flex-1">
              <p className="text-sm font-medium">{item.it_name}</p>
              {item.ct_option && (
                <p className="text-xs text-muted-foreground">
                  {formatCartOption(item.ct_option)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatPrice(cartItemUnitPrice(item))} x {item.ct_qty}개
              </p>
              <p
                className="text-xs text-muted-foreground"
                data-shop-order-send-cost-label="1"
              >
                배송비: {getShopCartShippingPaymentLabel(item, items)}
              </p>
            </div>
            <span className="shop-order-item-price text-sm font-bold">
              {formatPrice(cartItemLineTotal(item))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
