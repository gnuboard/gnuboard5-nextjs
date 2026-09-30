"use client";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

type OrderSummarySidebarProps = {
  subtotal: number;
  cartCoupon: number;
  couponDiscount: number;
  sendCouponDiscount: number;
  pointUse: number;
  shippingCost: number;
  total: number;
  submitting: boolean;
};

export function OrderSummarySidebar({
  subtotal,
  cartCoupon,
  couponDiscount,
  sendCouponDiscount,
  pointUse,
  shippingCost,
  total,
  submitting,
}: OrderSummarySidebarProps) {
  return (
    <div className="lg:col-span-1">
      <div className="shop-order-summary sticky top-4 rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-bold">결제 금액</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">상품 금액</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {cartCoupon > 0 && (
            <div className="flex justify-between text-green-700">
              <span>상품 쿠폰</span>
              <span>-{formatPrice(cartCoupon)}</span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex justify-between text-green-700">
              <span>쿠폰 할인</span>
              <span>-{formatPrice(couponDiscount)}</span>
            </div>
          )}
          {sendCouponDiscount > 0 && (
            <div className="flex justify-between text-green-700">
              <span>배송비 쿠폰</span>
              <span>-{formatPrice(sendCouponDiscount)}</span>
            </div>
          )}
          {pointUse > 0 && (
            <div className="flex justify-between text-green-700">
              <span>포인트 사용</span>
              <span>-{formatPrice(pointUse)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">배송비</span>
            <span>
              {shippingCost === 0 ? (
                <span className="text-green-700">무료</span>
              ) : (
                formatPrice(shippingCost)
              )}
            </span>
          </div>
          <div className="shop-order-summary-total border-t pt-3">
            <div className="flex justify-between text-lg font-bold">
              <span>총 결제금액</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
          </div>
        </div>
        <Button
          type="submit"
          className="shop-order-submit mt-6 w-full"
          size="lg"
          disabled={submitting}
        >
          {submitting ? "주문 처리 중..." : `${formatPrice(total)} 결제하기`}
        </Button>
      </div>
    </div>
  );
}
