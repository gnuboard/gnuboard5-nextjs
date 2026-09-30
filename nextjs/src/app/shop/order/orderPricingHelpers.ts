import type { ShopCartItem } from "@/lib/api";

export interface MyCoupon {
  cp_id: string;
  cp_subject: string;
  cp_method: number;
  cp_type: number;
  cp_price: number;
  cp_minimum: number;
  cp_maximum: number;
  cp_trunc: number;
  cp_start: string;
  cp_end: string;
}

export interface PointSummary {
  balance: number;
}

export function cartItemLineTotal(item: ShopCartItem): number {
  const lineTotal = typeof item.line_total === "number"
    ? item.line_total
    : item.ct_price * item.ct_qty;
  return Math.max(0, lineTotal);
}

export function cartItemUnitPrice(item: ShopCartItem): number {
  if (item.ct_qty <= 0) return item.ct_price;
  return Math.floor(cartItemLineTotal(item) / item.ct_qty);
}

export function calculateCouponDiscount(
  coupon: MyCoupon | undefined,
  minimumBase: number,
  discountBase = minimumBase
): number {
  if (!coupon) return 0;
  const base = Math.max(0, Math.floor(minimumBase));
  const discountFrom = Math.max(0, Math.floor(discountBase));
  if (base < coupon.cp_minimum || discountFrom <= 0) return 0;

  let discount =
    coupon.cp_type === 1
      ? Math.floor((discountFrom * coupon.cp_price) / 100)
      : coupon.cp_price;
  if (coupon.cp_type === 1 && coupon.cp_trunc > 0) {
    discount = Math.floor(discount / coupon.cp_trunc) * coupon.cp_trunc;
  }
  if (coupon.cp_maximum > 0 && discount > coupon.cp_maximum) {
    discount = coupon.cp_maximum;
  }

  return Math.max(0, Math.min(discount, discountFrom));
}
