"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPrice } from "@/lib/utils";
import { OrderCouponDialog } from "./OrderCouponDialog";
import { orderCouponChoices, sendCouponChoices } from "./orderCouponChoices";
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
  couponDiscount: number;
  sendCouponDiscount: number;
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

type CouponRowProps = {
  label: string;
  coupon: MyCoupon | undefined;
  discount: number;
  warning: string;
  onOpen: () => void;
  onCancel: () => void;
};

/** 결제정보의 쿠폰 한 줄 — 영카트 #od_cp_price · #od_coupon_btn("쿠폰적용" → 적용 뒤 "변경" + "취소"). */
function CouponRow({ label, coupon, discount, warning, onOpen, onCancel }: CouponRowProps) {
  return (
    <div className="shop-order-benefit-row">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <strong className={`text-sm ${discount > 0 ? "text-green-700" : ""}`}>
            {discount > 0 ? `-${formatPrice(discount)}` : formatPrice(0)}
          </strong>
          <Button type="button" variant="outline" size="sm" className="shop-order-coupon-open h-8 px-2.5" onClick={onOpen}>
            {coupon ? "변경" : "쿠폰적용"}
          </Button>
          {coupon && (
            <Button type="button" variant="ghost" size="sm" className="shop-order-coupon-cancel h-8 px-2" onClick={onCancel}>
              취소
            </Button>
          )}
        </div>
      </div>
      {coupon && <p className="mt-1 truncate text-xs text-muted-foreground">{coupon.cp_subject}</p>}
      {warning && <p className="mt-1 text-xs text-amber-700">{warning}</p>}
    </div>
  );
}

/**
 * 쿠폰 / 포인트 — 영카트 orderform.sub.php 의 결제정보(주문할인 · 배송비할인 + 쿠폰 선택 창)와
 * 포인트 사용(.sod_frm_point: 사용 포인트 N점 단위 · 보유 · 최대 사용 가능)을 오른쪽 결제 덩어리에 둔다.
 */
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
  couponDiscount,
  sendCouponDiscount,
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
  const [dialog, setDialog] = useState<"order" | "send" | null>(null);
  const hasCoupons = orderCoupons.length > 0 || sendCoupons.length > 0;
  const pointUsable = maxPointUse > 0 || pointUseInput.trim() !== "";

  const applyOrderCoupon = (cpId: string) => {
    // 영카트처럼 주문할인을 바꾸면 배송비할인은 다시 고른다 — 최소 주문금액이 주문할인 뒤 금액 기준이라서.
    setSelectedSendCouponId("");
    setSelectedCouponId(cpId);
    setDialog(null);
  };

  return (
    <section className="shop-order-section shop-order-section--benefit rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">쿠폰 / 포인트</h2>

      <div className="space-y-3">
        {!hasCoupons && <p className="text-sm text-muted-foreground">사용할 수 있는 쿠폰이 없습니다.</p>}
        {orderCoupons.length > 0 && (
          <CouponRow
            label="주문할인"
            coupon={selectedCoupon}
            discount={couponDiscount}
            warning={
              selectedCoupon && orderCouponBase < selectedCoupon.cp_minimum
                ? `최소 주문금액 ${formatPrice(selectedCoupon.cp_minimum)} 이상에서 사용할 수 있습니다.`
                : ""
            }
            onOpen={() => setDialog("order")}
            onCancel={() => applyOrderCoupon("")}
          />
        )}
        {sendCoupons.length > 0 && (
          <CouponRow
            label="배송비할인"
            coupon={selectedSendCoupon}
            discount={sendCouponDiscount}
            warning={
              selectedSendCoupon && shippingCost <= 0
                ? "배송비가 0원이면 배송비 쿠폰은 적용되지 않습니다."
                : selectedSendCoupon && orderAmountAfterCoupons < selectedSendCoupon.cp_minimum
                  ? `쿠폰 적용 후 주문금액 ${formatPrice(selectedSendCoupon.cp_minimum)} 이상에서 사용할 수 있습니다.`
                  : ""
            }
            onOpen={() => setDialog("send")}
            onCancel={() => setSelectedSendCouponId("")}
          />
        )}
      </div>

      <div className="shop-order-point mt-5 border-t pt-5">
        <label htmlFor="shop-order-point-use" className="mb-1 block text-sm font-medium">
          사용 포인트
          {settlePointUnit > 1 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">({formatNumber(settlePointUnit)}점 단위)</span>
          )}
        </label>
        <div className="flex gap-2">
          <input
            id="shop-order-point-use"
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
            disabled={!pointUsable}
            className={`${inputClassName} min-w-0 flex-1`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0"
            disabled={maxPointUse <= 0}
            onClick={() => setPointUseInput(String(maxPointUse))}
          >
            모두 사용
          </Button>
        </div>
        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <dt>보유 포인트</dt>
            <dd>{formatNumber(pointBalance)}점</dd>
          </div>
          <div className="flex justify-between">
            <dt>최대 사용 가능 포인트</dt>
            <dd>{formatNumber(maxPointUse)}점</dd>
          </div>
        </dl>
        {pointWarn ? (
          <p className="mt-1 text-xs text-amber-700">{pointWarn}</p>
        ) : (
          !pointUsable && <p className="mt-1 text-xs text-muted-foreground">이번 주문에 사용할 수 있는 포인트가 없습니다.</p>
        )}
      </div>

      {dialog === "order" && (
        <OrderCouponDialog
          title="주문할인 쿠폰"
          description={`상품 쿠폰을 뺀 주문금액 ${formatPrice(orderCouponBase)} 기준`}
          choices={orderCouponChoices(orderCoupons, orderCouponBase)}
          selectedId={selectedCouponId}
          onApply={applyOrderCoupon}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "send" && (
        <OrderCouponDialog
          title="배송비할인 쿠폰"
          description={`배송비 ${formatPrice(shippingCost)} · 주문할인 뒤 주문금액 ${formatPrice(orderAmountAfterCoupons)} 기준`}
          choices={sendCouponChoices(sendCoupons, orderAmountAfterCoupons, shippingCost)}
          selectedId={selectedSendCouponId}
          onApply={(cpId) => {
            setSelectedSendCouponId(cpId);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
