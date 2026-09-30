// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { runLegacyYoungcartAction } from "../_legacy-action";

export const dynamic = "force-dynamic";

function productFallback(params: URLSearchParams) {
  const itId = params.get("it_id") || "";
  return itId ? `/shop/products/${encodeURIComponent(itId)}?modal=recommend` : "/shop/products";
}

function endpoint(params: URLSearchParams) {
  return `/shop/products/${encodeURIComponent(params.get("it_id") || "")}/recommend`;
}

export function GET(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint,
    fallbackRedirect: productFallback,
    guardMutation: true,
    loginOnUnauthorized: true,
    responseMode: "alert-close",
    successMessage: "메일을 전달했습니다.",
  });
}

export function POST(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint,
    fallbackRedirect: productFallback,
    guardMutation: true,
    loginOnUnauthorized: true,
    responseMode: "alert-close",
    successMessage: "메일을 전달했습니다.",
  });
}
