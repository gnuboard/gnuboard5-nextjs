"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatPrice } from "@/lib/utils";
import { formatCartLineOption, type CartGroup } from "./cartGroups";
import { CartDialogHead } from "./CartDialogHead";

interface ApplicableCoupon {
  cp_id: string;
  cp_subject: string;
  cp_method: number;     // 0 상품, 1 카테고리
  cp_type: number;       // 0 정액, 1 정률
  cp_price: number;
  cp_minimum: number;
  cp_maximum: number;
  discount: number;      // 이 줄에 적용 시 실제 할인액
}

interface CartCouponDialogProps {
  group: CartGroup;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

/** 그 줄에 쓸 수 있는 쿠폰. 불러오지 못하면 null — "쓸 수 있는 쿠폰이 없다"와 구별한다. */
async function fetchApplicable(ctId: string): Promise<ApplicableCoupon[] | null> {
  try {
    const res = await api.get<ApplicableCoupon[]>(
      `/shop/coupons/applicable?ct_id=${encodeURIComponent(ctId)}`
    );
    return (res.data as ApplicableCoupon[]) ?? [];
  } catch {
    return null;
  }
}

/**
 * 쿠폰적용 — 상품 · 카테고리 쿠폰을 장바구니 줄마다 묶는다(영카트는 주문서에서만 고르지만, 여기서는 담아 둔 채 미리 쓸 수 있다).
 * 묶인 할인은 줄의 cp_price 로 돌아오고, 주문서가 그대로 이어받는다.
 */
export function CartCouponDialog({ group, onClose, onChanged }: CartCouponDialogProps) {
  const [applicable, setApplicable] = useState<Record<string, ApplicableCoupon[] | null> | null>(null);
  const [busyCtId, setBusyCtId] = useState("");
  const latestRequest = useRef(0);
  const ctIdsKey = group.ctIds.join(",");

  const loadApplicable = useCallback(async () => {
    const request = ++latestRequest.current;
    const ctIds = ctIdsKey.split(",").filter(Boolean);
    const lists = await Promise.all(ctIds.map(fetchApplicable));
    // 늦게 온 예전 응답이 새 목록을 덮지 않게 — 마지막으로 보낸 요청의 답만 쓴다.
    if (request !== latestRequest.current) return;
    setApplicable(Object.fromEntries(ctIds.map((ctId, index) => [ctId, lists[index]])));
  }, [ctIdsKey]);

  useEffect(() => {
    void loadApplicable();
  }, [loadApplicable]);

  const applyCoupon = async (ctId: string, cpId: string) => {
    setBusyCtId(ctId);
    try {
      await api.post("/shop/coupons/apply-to-cart", { ct_id: Number(ctId), cp_id: cpId });
      toastSuccess(cpId ? "쿠폰이 적용되었습니다." : "쿠폰을 해제했습니다.");
      await onChanged();
      await loadApplicable();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "쿠폰 적용에 실패했습니다.");
    } finally {
      setBusyCtId("");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !busyCtId ? onClose() : undefined)}>
      <DialogContent className="product-quick-add-dialog cart-coupon-dialog flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <CartDialogHead group={group} kicker="쿠폰적용" />

        <div className="product-quick-add-body min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {group.lines.map((line) => {
            const loaded = applicable?.[line.ct_id];
            const coupons = loaded ?? [];
            const boundElsewhere = Boolean(line.cp_id) && !coupons.some((coupon) => coupon.cp_id === line.cp_id);
            return (
              <div key={line.ct_id} className="cart-coupon-line space-y-1.5">
                <p className="text-sm font-medium">{formatCartLineOption(line)}</p>
                <select
                  aria-label={`${formatCartLineOption(line)} 쿠폰 선택`}
                  value={line.cp_id || ""}
                  onChange={(event) => applyCoupon(line.ct_id, event.target.value)}
                  disabled={!applicable || Boolean(busyCtId)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  <option value="">{applicable ? "쿠폰 사용 안 함" : "쿠폰을 불러오는 중..."}</option>
                  {boundElsewhere && (
                    // 이미 묶인 쿠폰이 목록에 없으면(예: 조건이 바뀜) 묶인 상태를 보여 주고 해제할 수 있게 한다.
                    <option value={line.cp_id}>적용됨: {formatPrice(line.cp_price ?? 0)} 할인</option>
                  )}
                  {coupons.map((coupon) => (
                    <option key={coupon.cp_id} value={coupon.cp_id}>
                      {coupon.cp_subject} (-{formatPrice(coupon.discount)})
                    </option>
                  ))}
                </select>
                {(line.cp_price ?? 0) > 0 ? (
                  <p className="text-xs text-green-700">쿠폰 할인 -{formatPrice(line.cp_price ?? 0)}</p>
                ) : applicable && loaded === null ? (
                  <p className="text-xs text-destructive" role="alert">쿠폰을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>
                ) : applicable && coupons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">이 옵션에 쓸 수 있는 쿠폰이 없습니다.</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter className="product-quick-add-foot border-t p-4">
          <Button variant="outline" className="product-quick-add-detail w-full" onClick={onClose} disabled={Boolean(busyCtId)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
