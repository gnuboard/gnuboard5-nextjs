// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { runLegacyYoungcartAction } from "../_legacy-action";

export const dynamic = "force-dynamic";

function productFallback(params: URLSearchParams) {
  const itId = params.get("it_id") || "";
  return itId ? `/shop/products/${encodeURIComponent(itId)}?tab=reviews` : "/shop/reviews";
}

function actionMode(params: URLSearchParams) {
  return (params.get("w") || "").trim();
}

function endpoint(params: URLSearchParams) {
  const mode = actionMode(params);
  if (mode === "u" || mode === "d") {
    return `/shop/reviews/${encodeURIComponent(params.get("is_id") || "0")}`;
  }
  return "/shop/reviews";
}

function apiMethod(params: URLSearchParams) {
  const mode = actionMode(params);
  if (mode === "u") return "PATCH" as const;
  if (mode === "d") return "DELETE" as const;
  return "POST" as const;
}

function bodyFormat(params: URLSearchParams) {
  return actionMode(params) === "d" ? "none" as const : "json" as const;
}

function responseMode(params: URLSearchParams) {
  return actionMode(params) === "d" ? "alert-redirect" as const : "alert-opener" as const;
}

function successMessage(params: URLSearchParams) {
  const mode = actionMode(params);
  if (mode === "u") return "사용후기가 수정되었습니다.";
  if (mode === "d") return "사용후기를 삭제했습니다.";
  return "사용후기가 등록되었습니다.";
}

export function GET(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint,
    apiMethod,
    bodyFormat,
    fallbackRedirect: productFallback,
    guardMutation: true,
    loginOnUnauthorized: true,
    responseMode,
    successMessage,
  });
}

export function POST(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint,
    apiMethod,
    bodyFormat,
    fallbackRedirect: productFallback,
    guardMutation: true,
    loginOnUnauthorized: true,
    responseMode,
    successMessage,
  });
}
