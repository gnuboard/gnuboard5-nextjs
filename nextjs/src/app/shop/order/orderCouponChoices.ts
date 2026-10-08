import { formatPrice } from "@/lib/utils";
import type { OrderCouponChoice } from "./OrderCouponDialog";
import { calculateCouponDiscount, type MyCoupon } from "./orderPricingHelpers";

/**
 * 주문할인 쿠폰 목록 — 영카트 ordercoupon.php · orderform.sub.php(.od_cp_apply) 처럼
 * 최소 주문금액이 안 되거나 할인이 주문금액 이상이면 쓸 수 없다.
 */
export function orderCouponChoices(coupons: MyCoupon[], orderCouponBase: number): OrderCouponChoice[] {
  return coupons.map((coupon) => {
    const discount = calculateCouponDiscount(coupon, orderCouponBase);
    const blockedReason =
      orderCouponBase <= 0
        ? "상품금액이 0원이라 쓸 수 없습니다."
        : orderCouponBase < coupon.cp_minimum
          ? `${formatPrice(coupon.cp_minimum)} 이상 주문 시 사용할 수 있습니다.`
          : orderCouponBase - discount <= 0
            ? "할인금액이 주문금액보다 커서 쓸 수 없습니다."
            : "";
    return { coupon, discount, blockedReason };
  });
}

/**
 * 배송비할인 쿠폰 목록 — 영카트 ordersendcostcoupon.php 처럼 주문할인까지 뺀 주문금액으로 최소 주문금액을 보고,
 * 할인은 배송비까지만.
 */
export function sendCouponChoices(
  coupons: MyCoupon[],
  orderAmountAfterCoupons: number,
  shippingCost: number
): OrderCouponChoice[] {
  return coupons.map((coupon) => {
    const discount = calculateCouponDiscount(coupon, orderAmountAfterCoupons, shippingCost);
    const blockedReason =
      shippingCost <= 0
        ? "배송비가 없어 쓸 수 없습니다."
        : orderAmountAfterCoupons < coupon.cp_minimum
          ? `${formatPrice(coupon.cp_minimum)} 이상 주문 시 사용할 수 있습니다.`
          : "";
    return { coupon, discount, blockedReason };
  });
}
