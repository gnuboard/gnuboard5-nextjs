import type { ShopCartItem, ShopPolicy } from "@/lib/api";
import { estimateShopShippingCost } from "@/services/shop";
import {
  cartItemLineTotal,
  type MyCoupon,
} from "./orderPricingHelpers";
import { buildCouponPreview } from "./orderCouponPreview";
import { calculatePointUsage } from "./orderPointUsage";

type BuildOrderDiscountPreviewInput = {
  items: ShopCartItem[];
  shippingPolicy: ShopPolicy | null;
  cartShippingCost: number | null;
  myCoupons: MyCoupon[];
  selectedCouponId: string;
  selectedSendCouponId: string;
  pointUseInput: string;
  pointBalance: number;
};

export function buildOrderDiscountPreview({
  items,
  shippingPolicy,
  cartShippingCost,
  myCoupons,
  selectedCouponId,
  selectedSendCouponId,
  pointUseInput,
  pointBalance,
}: BuildOrderDiscountPreviewInput) {
  const subtotal = items.reduce((sum, item) => sum + cartItemLineTotal(item), 0);
  const estimatedShippingCost = estimateShopShippingCost(
    subtotal,
    shippingPolicy
  );
  const shippingCost = cartShippingCost ?? estimatedShippingCost;

  // Client-side preview only. The server recalculates coupon/point amounts.
  const cartCoupon = items.reduce((sum, item) => sum + (item.cp_price ?? 0), 0);
  const orderCouponBase = Math.max(0, subtotal - cartCoupon);
  const couponPreview = buildCouponPreview({
    myCoupons,
    selectedCouponId,
    selectedSendCouponId,
    orderCouponBase,
    shippingCost,
  });
  const pointUsage = calculatePointUsage({
    pointUseInput,
    pointBalance,
    shippingPolicy,
    orderAmountAfterCoupons: couponPreview.orderAmountAfterCoupons,
  });
  const total = Math.max(
    0,
    subtotal +
      shippingCost -
      cartCoupon -
      couponPreview.couponDiscount -
      couponPreview.sendCouponDiscount -
      pointUsage.pointUse
  );

  return {
    subtotal,
    shippingCost,
    cartCoupon,
    orderCouponBase,
    orderCoupons: couponPreview.orderCoupons,
    sendCoupons: couponPreview.sendCoupons,
    selectedCoupon: couponPreview.selectedCoupon,
    selectedSendCoupon: couponPreview.selectedSendCoupon,
    couponDiscount: couponPreview.couponDiscount,
    orderAmountAfterCoupons: couponPreview.orderAmountAfterCoupons,
    sendCouponDiscount: couponPreview.sendCouponDiscount,
    settlePointUnit: pointUsage.settlePointUnit,
    maxPointUse: pointUsage.maxPointUse,
    pointUse: pointUsage.pointUse,
    normalizedPointUseInput: pointUsage.normalizedPointUseInput,
    pointWarn: pointUsage.pointWarn,
    total,
  };
}
