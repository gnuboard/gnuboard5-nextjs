import type { ShopPolicy } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

type CalculatePointUsageInput = {
  pointUseInput: string;
  pointBalance: number;
  shippingPolicy: ShopPolicy | null;
  orderAmountAfterCoupons: number;
};

export function calculatePointUsage({
  pointUseInput,
  pointBalance,
  shippingPolicy,
  orderAmountAfterCoupons,
}: CalculatePointUsageInput) {
  const pointUseRaw = parseInt(pointUseInput || "0", 10);
  const pointUseEnabled = shippingPolicy?.point_use_enabled ?? false;
  const settleMinPoint = Math.max(0, shippingPolicy?.settle_min_point ?? 0);
  const settleMaxPoint = Math.max(0, shippingPolicy?.settle_max_point ?? 0);
  const settlePointUnit = Math.max(1, shippingPolicy?.settle_point_unit ?? 1);
  const rawMaxPointUse =
    pointUseEnabled && pointBalance >= settleMinPoint
      ? Math.min(pointBalance, settleMaxPoint, orderAmountAfterCoupons)
      : 0;
  const maxPointUse = Math.max(
    0,
    Math.floor(rawMaxPointUse / settlePointUnit) * settlePointUnit
  );
  const requestedPointUse = Math.max(0, Number.isFinite(pointUseRaw) ? pointUseRaw : 0);
  const cappedPointUse = Math.max(
    0,
    Math.min(requestedPointUse, pointBalance, maxPointUse)
  );
  const pointUse = Math.floor(cappedPointUse / settlePointUnit) * settlePointUnit;
  const normalizedPointUseInput = pointUseInput.trim() ? String(pointUse) : "";
  const pointWarn =
    !pointUseEnabled && pointUseRaw > 0
      ? "포인트 사용이 설정되어 있지 않습니다."
      : pointBalance < settleMinPoint && pointUseRaw > 0
        ? `보유 포인트가 ${formatPrice(settleMinPoint)} 이상이어야 사용할 수 있습니다.`
        : pointUseRaw > pointBalance
          ? "보유 포인트를 초과했습니다."
          : pointUseRaw > maxPointUse
            ? `사용 가능한 포인트는 ${formatPrice(maxPointUse)}까지입니다.`
            : "";

  return {
    settlePointUnit,
    maxPointUse,
    pointUse,
    normalizedPointUseInput,
    pointWarn,
  };
}
