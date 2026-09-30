// @g5-server-runtime-only
import { NextRequest } from "next/server";
import {
  fetchLegacyCoupons,
  legacyCouponParams,
  legacyCouponResponse,
  renderLegacyCouponPicker,
} from "../_legacy-coupon-picker";

export const dynamic = "force-dynamic";

async function legacyOrderSendCostCoupon(request: NextRequest) {
  const params = await legacyCouponParams(request);
  const payload = await fetchLegacyCoupons(request, "legacy-sendcost", params);

  return legacyCouponResponse(
    renderLegacyCouponPicker(payload, {
      outerWrap: false,
      formId: "sc_coupon_frm",
      title: "배송비 쿠폰",
      caption: "쿠폰 선택",
      prefix: "s",
      applyClass: "sc_cp_apply btn_frmline",
      closeId: "sc_coupon_close",
    })
  );
}

export function GET(request: NextRequest) {
  return legacyOrderSendCostCoupon(request);
}

export function POST(request: NextRequest) {
  return legacyOrderSendCostCoupon(request);
}
