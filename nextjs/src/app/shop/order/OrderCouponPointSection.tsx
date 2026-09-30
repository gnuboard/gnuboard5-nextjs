"use client";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { type MyCoupon } from "./orderPricingHelpers";

type OrderCouponPointSectionProps = {
  inputClassName: string;
  orderCoupons: MyCoupon[];
  sendCoupons: MyCoupon[];
  selectedCoupon: MyCoupon | undefined;
  selectedSendCoupon: MyCoupon | undefined;
  selectedCouponId: string;
  setSelectedCouponId: (value: string) => void;
  selectedSendCouponId: string;
  setSelectedSendCouponId: (value: string) => void;
  orderCouponBase: number;
  orderAmountAfterCoupons: number;
  shippingCost: number;
  pointBalance: number;
  settlePointUnit: number;
  pointUseInput: string;
  setPointUseInput: (value: string) => void;
  maxPointUse: number;
  pointUse: number;
  normalizedPointUseInput: string;
  pointWarn: string;
};

function couponValueText(coupon: MyCoupon): string {
  return coupon.cp_type === 1
    ? `${coupon.cp_price}%` +
        (coupon.cp_maximum > 0
          ? ` (최대 ${formatPrice(coupon.cp_maximum)})`
          : "")
    : formatPrice(coupon.cp_price);
}

function couponMinimumText(coupon: MyCoupon): string {
  return coupon.cp_minimum > 0
    ? ` · ${formatPrice(coupon.cp_minimum)} 이상`
    : "";
}

export function OrderCouponPointSection({
  inputClassName,
  orderCoupons,
  sendCoupons,
  selectedCoupon,
  selectedSendCoupon,
  selectedCouponId,
  setSelectedCouponId,
  selectedSendCouponId,
  setSelectedSendCouponId,
  orderCouponBase,
  orderAmountAfterCoupons,
  shippingCost,
  pointBalance,
  settlePointUnit,
  pointUseInput,
  setPointUseInput,
  maxPointUse,
  pointUse,
  normalizedPointUseInput,
  pointWarn,
}: OrderCouponPointSectionProps) {
  return (
    <section className="shop-order-section shop-order-section--benefit rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">쿠폰 / 포인트</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">쿠폰</label>
          <select
            aria-label="주문 쿠폰"
            value={selectedCouponId}
            onChange={(event) => setSelectedCouponId(event.target.value)}
            className={inputClassName}
          >
            <option value="">사용 안 함</option>
            {orderCoupons.map((coupon) => (
              <option key={coupon.cp_id} value={coupon.cp_id}>
                {coupon.cp_subject} ({couponValueText(coupon)})
                {couponMinimumText(coupon)}
              </option>
            ))}
          </select>
          {selectedCoupon && orderCouponBase < selectedCoupon.cp_minimum && (
            <p className="mt-1 text-xs text-amber-700">
              최소 주문금액 {formatPrice(selectedCoupon.cp_minimum)} 이상에서
              사용 가능.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">배송비 쿠폰</label>
          <select
            aria-label="배송비 쿠폰"
            value={selectedSendCouponId}
            onChange={(event) => setSelectedSendCouponId(event.target.value)}
            className={inputClassName}
          >
            <option value="">사용 안 함</option>
            {sendCoupons.map((coupon) => (
              <option key={coupon.cp_id} value={coupon.cp_id}>
                {coupon.cp_subject} ({couponValueText(coupon)})
                {couponMinimumText(coupon)}
              </option>
            ))}
          </select>
          {selectedSendCoupon &&
            orderAmountAfterCoupons < selectedSendCoupon.cp_minimum && (
              <p className="mt-1 text-xs text-amber-700">
                쿠폰 적용 후 주문금액{" "}
                {formatPrice(selectedSendCoupon.cp_minimum)} 이상에서 사용
                가능.
              </p>
            )}
          {selectedSendCoupon && shippingCost <= 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              배송비가 0원이면 배송비 쿠폰은 적용되지 않습니다.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            포인트 사용
            <span className="ml-2 text-xs text-muted-foreground">
              (보유 {formatPrice(pointBalance)})
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step={settlePointUnit}
              value={pointUseInput}
              onChange={(event) => setPointUseInput(event.target.value)}
              onBlur={() => {
                if (pointUseInput.trim() && pointUseInput !== normalizedPointUseInput) {
                  setPointUseInput(normalizedPointUseInput || String(pointUse));
                }
              }}
              placeholder="0"
              className={`${inputClassName} flex-1`}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPointUseInput(String(maxPointUse))}
            >
              전액
            </Button>
          </div>
          {pointWarn && (
            <p className="mt-1 text-xs text-amber-700">{pointWarn}</p>
          )}
        </div>
      </div>
    </section>
  );
}
