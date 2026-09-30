// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { runLegacyYoungcartAction } from "../_legacy-action";

export const dynamic = "force-dynamic";

function productFallback(params: URLSearchParams) {
  const itId = params.get("it_id") || "";
  return itId ? `/shop/products/${encodeURIComponent(itId)}?modal=restock` : "/shop/products";
}

function endpoint(params: URLSearchParams) {
  return `/shop/products/${encodeURIComponent(params.get("it_id") || "")}/stock-notify`;
}

function transformParams(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  if (!next.get("hp") && next.get("ss_hp")) {
    next.set("hp", next.get("ss_hp") || "");
  }
  if (!next.get("agree") && next.get("ss_agree")) {
    next.set("agree", next.get("ss_agree") || "");
  }
  return next;
}

export function GET(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint,
    fallbackRedirect: productFallback,
    transformParams,
    responseMode: "alert-close",
    successMessage: "재입고 SMS 알림 신청이 완료되었습니다.",
  });
}

export function POST(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint,
    fallbackRedirect: productFallback,
    transformParams,
    responseMode: "alert-close",
    successMessage: "재입고 SMS 알림 신청이 완료되었습니다.",
  });
}
