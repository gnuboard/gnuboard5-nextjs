"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";
import type { MyCoupon } from "./orderPricingHelpers";

export type OrderCouponChoice = {
  coupon: MyCoupon;
  /** 지금 주문에 적용했을 때 실제 할인액 */
  discount: number;
  /** 쓸 수 없는 까닭 — 빈 문자열이면 적용할 수 있다 */
  blockedReason: string;
};

type OrderCouponDialogProps = {
  title: string;
  description: string;
  choices: OrderCouponChoice[];
  selectedId: string;
  onApply: (cpId: string) => void;
  onClose: () => void;
};

/**
 * 주문할인 · 배송비할인 "쿠폰 선택" — 영카트 orderform.sub.php 의 #od_coupon_frm · #sc_coupon_frm 처럼
 * 쿠폰명 · 할인금액 · 적용 버튼. 조건이 안 맞는 쿠폰은 까닭과 함께 흐리게 둔다.
 */
export function OrderCouponDialog({
  title,
  description,
  choices,
  selectedId,
  onApply,
  onClose,
}: OrderCouponDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      {/* 틀은 상품 "담기" 창과 같다(product-quick-add-*) — 폰에서는 아래에서 올라오는 시트. */}
      <DialogContent className="product-quick-add-dialog shop-order-coupon-dialog flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader className="product-quick-add-head border-b p-4 pr-12 text-left">
          <DialogTitle className="product-quick-add-name text-base">{title}</DialogTitle>
          <DialogDescription className="product-quick-add-kicker text-xs">{description}</DialogDescription>
        </DialogHeader>

        <ul className="product-quick-add-body shop-order-coupon-list min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {choices.map(({ coupon, discount, blockedReason }) => {
            const applied = coupon.cp_id === selectedId;
            return (
              <li key={coupon.cp_id}>
                {/* 쿠폰 한 장이 통째로 단추 — 할인금액을 크게, 쓸 수 없으면 까닭을 적고 누를 수 없다. */}
                <button
                  type="button"
                  className="shop-order-coupon-item flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:hover:border-border"
                  data-applied={applied ? "1" : undefined}
                  disabled={Boolean(blockedReason) || applied}
                  onClick={() => onApply(coupon.cp_id)}
                >
                  <span className="min-w-0 flex-1">
                    {!blockedReason && (
                      <span className="shop-order-coupon-amount block text-base font-bold">-{formatPrice(discount)}</span>
                    )}
                    <span className={`block truncate text-sm ${blockedReason ? "font-medium" : ""}`}>{coupon.cp_subject}</span>
                    {blockedReason && <span className="block text-xs text-muted-foreground">{blockedReason}</span>}
                  </span>
                  {!blockedReason && (
                    <span className="shop-order-coupon-action shrink-0 rounded-full border px-3 py-1 text-xs font-semibold">
                      {applied ? "적용됨" : "적용"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="product-quick-add-foot border-t p-4">
          <Button type="button" variant="outline" className="product-quick-add-detail w-full" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
