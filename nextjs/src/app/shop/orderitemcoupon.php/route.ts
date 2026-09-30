// @g5-server-runtime-only
import { NextRequest } from "next/server";
import {
  fetchLegacyCoupons,
  legacyCouponParams,
  legacyCouponResponse,
  renderLegacyCouponPicker,
} from "../_legacy-coupon-picker";

export const dynamic = "force-dynamic";

async function legacyOrderItemCoupon(request: NextRequest) {
  const params = await legacyCouponParams(request);
  const payload = await fetchLegacyCoupons(request, "legacy-item", params);

  return legacyCouponResponse(
    renderLegacyCouponPicker(payload, {
      formId: "cp_frm",
      title: "쿠폰 선택",
      caption: "쿠폰 선택",
      prefix: "f",
      applyClass: "cp_apply",
      closeId: "cp_close",
      emptyClass: "empty_list",
    })
  );
}

export function GET(request: NextRequest) {
  return legacyOrderItemCoupon(request);
}

export function POST(request: NextRequest) {
  return legacyOrderItemCoupon(request);
}
