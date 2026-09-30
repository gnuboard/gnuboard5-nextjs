// @g5-server-runtime-only
import { NextRequest } from "next/server";
import {
  fetchLegacyCoupons,
  legacyCouponParams,
  legacyCouponResponse,
  renderLegacyCouponPicker,
} from "../_legacy-coupon-picker";

export const dynamic = "force-dynamic";

async function legacyOrderCoupon(request: NextRequest) {
  const params = await legacyCouponParams(request);
  const payload = await fetchLegacyCoupons(request, "legacy-order", params);

  return legacyCouponResponse(
    renderLegacyCouponPicker(payload, {
      formId: "od_coupon_frm",
      title: "쿠폰 선택",
      caption: "쿠폰 선택",
      prefix: "o",
      applyClass: "od_cp_apply btn_frmline",
      closeId: "od_coupon_close",
    })
  );
}

export function GET(request: NextRequest) {
  return legacyOrderCoupon(request);
}

export function POST(request: NextRequest) {
  return legacyOrderCoupon(request);
}
