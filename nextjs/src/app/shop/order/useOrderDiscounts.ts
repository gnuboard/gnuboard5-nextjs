"use client";

import { useMemo } from "react";
import type { ShopCartItem, ShopPolicy } from "@/lib/api";
import { buildOrderDiscountPreview } from "./orderDiscountPreview";
import type { MyCoupon } from "./orderPricingHelpers";

type UseOrderDiscountsOptions = {
  items: ShopCartItem[];
  shippingPolicy: ShopPolicy | null;
  cartShippingCost: number | null;
  myCoupons: MyCoupon[];
  selectedCouponId: string;
  selectedSendCouponId: string;
  pointUseInput: string;
  pointBalance: number;
};

export function useOrderDiscounts({
  items,
  shippingPolicy,
  cartShippingCost,
  myCoupons,
  selectedCouponId,
  selectedSendCouponId,
  pointUseInput,
  pointBalance,
}: UseOrderDiscountsOptions) {
  return useMemo(
    () =>
      buildOrderDiscountPreview({
        items,
        shippingPolicy,
        cartShippingCost,
        myCoupons,
        selectedCouponId,
        selectedSendCouponId,
        pointUseInput,
        pointBalance,
      }),
    [
      cartShippingCost,
      items,
      myCoupons,
      pointBalance,
      pointUseInput,
      selectedCouponId,
      selectedSendCouponId,
      shippingPolicy,
    ]
  );
}
