// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { crossSiteRequestMessage } from "@/lib/server/request-guard";
import { fetchWithTimeout, isFetchTimeoutError } from "@/lib/server/fetch-timeout";
import { forwardedLegacyCookieHeader } from "@/lib/server/forwarded-cookies";
import { safeJsonForInlineScript } from "@/lib/runtime-config-script";

export const dynamic = "force-dynamic";

const TOKEN_COOKIE = "g5_token";

type ApiEnvelope<T = Record<string, unknown>> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type OrderPayload = {
  order?: {
    od_id?: string;
    uid?: string;
  };
  od_id?: string;
  order_id?: string;
  uid?: string;
};

type PaymentPayload = {
  order_id?: string;
  uid?: string;
};

export function GET(request: NextRequest) {
  return redirectTo(request, "/shop/order");
}

export async function POST(request: NextRequest) {
  const blockedMessage = crossSiteRequestMessage(request);
  if (blockedMessage) {
    return alertRedirect(request, blockedMessage, "/shop/order");
  }

  const params = await legacyParams(request);

  if (looksLikePaymentResult(params)) {
    return confirmPaymentResult(request, params);
  }

  return createOrder(request, params);
}

async function createOrder(request: NextRequest, params: URLSearchParams) {
  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl("/shop/orders"), {
      method: "POST",
      cache: "no-store",
      headers: requestHeaders(request, "form"),
      body: params.toString(),
    });
  } catch (error: unknown) {
    return alertRedirect(
      request,
      isFetchTimeoutError(error)
        ? "쇼핑몰 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
        : "쇼핑몰 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
      "/shop/order"
    );
  }
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<OrderPayload> | null;

  if (!response.ok || !envelope?.success) {
    return alertRedirect(
      request,
      envelope?.message || response.statusText || "The order could not be completed.",
      "/shop/order",
      response
    );
  }

  const data = envelope.data;
  const orderId = String(data?.order?.od_id || data?.od_id || data?.order_id || "").trim();
  const uid = String(data?.order?.uid || data?.uid || "").trim();
  const target = orderId
    ? `/shop/orders/${encodeURIComponent(orderId)}${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`
    : "/shop/orders";

  return redirectTo(request, target, response);
}

async function confirmPaymentResult(request: NextRequest, params: URLSearchParams) {
  const body = legacyPaymentConfirmBody(params);
  if (!body.order_id || !body.pg_service || !Number.isFinite(body.amount)) {
    return alertRedirect(
      request,
      "Payment result is missing required order information.",
      "/shop/order"
    );
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl("/shop/payment/confirm"), {
      method: "POST",
      cache: "no-store",
      headers: requestHeaders(request, "json"),
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    return alertRedirect(
      request,
      isFetchTimeoutError(error)
        ? "쇼핑몰 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
        : "쇼핑몰 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
      "/shop/order"
    );
  }
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<PaymentPayload> | null;

  if (!response.ok || !envelope?.success) {
    return alertRedirect(
      request,
      envelope?.message || response.statusText || "Payment confirmation failed.",
      "/shop/order",
      response
    );
  }

  const orderId = String(envelope.data?.order_id || body.order_id || "").trim();
  const uid = String(envelope.data?.uid || "").trim();
  const target = orderId
    ? `/shop/orders/${encodeURIComponent(orderId)}${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`
    : "/shop/orders";

  return redirectTo(request, target, response);
}

async function legacyParams(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);

  try {
    const form = await request.formData();
    form.forEach((value, key) => {
      if (typeof value === "string") {
        params.append(key, value);
      }
    });
  } catch {
    // Query-string fallback covers non-form legacy requests.
  }

  return params;
}

function legacyPaymentConfirmBody(params: URLSearchParams) {
  const all = Object.fromEntries(params.entries()) as Record<string, string | number>;
  const orderId = firstParam(params, [
    "order_id",
    "orderId",
    "od_id",
    "ordr_idxx",
    "MOID",
    "Moid",
    "oid",
    "P_OID",
    "P_NOTI",
    "orderNumber",
  ]);
  const amount = Number(firstParam(params, [
    "amount",
    "good_mny",
    "good_mny2",
    "Amt",
    "TotPrice",
    "price",
    "P_AMT",
  ]) || 0);
  const pgService = inferPgService(params);

  return {
    ...all,
    order_id: orderId,
    amount,
    pg_service: pgService,
  };
}

function looksLikePaymentResult(params: URLSearchParams) {
  return [
    "paymentKey",
    "LGD_PAYKEY",
    "P_TID",
    "P_AUTH_NO",
    "authToken",
    "TID",
    "tid",
    "transactionId",
    "approvalKey",
  ].some((key) => hasValue(params, key));
}

function inferPgService(params: URLSearchParams) {
  const explicit = firstParam(params, ["pg_service", "pg", "od_pg", "de_pg_service"]).toLowerCase();
  if (["toss", "inicis", "kcp", "nicepay", "kakaopay"].includes(explicit)) {
    return explicit;
  }

  const settleCase = firstParam(params, ["od_settle_case", "settle_case"]);
  if (settleCase === "KAKAOPAY") return "kakaopay";
  if (hasValue(params, "paymentKey")) return "toss";
  if (
    hasValue(params, "authToken") ||
    hasValue(params, "TotPrice") ||
    hasValue(params, "P_REQ_URL") ||
    hasValue(params, "P_STATUS")
  ) {
    return "inicis";
  }
  if (hasValue(params, "site_cd") || hasValue(params, "enc_data")) return "kcp";
  if (hasValue(params, "TID") || hasValue(params, "Amt")) return "nicepay";

  return "";
}

function firstParam(params: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function hasValue(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value !== null && value.trim() !== "";
}

function requestHeaders(request: NextRequest, bodyFormat: "form" | "json") {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": bodyFormat === "json" ? "application/json" : "application/x-www-form-urlencoded",
  };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const cookie = forwardedLegacyCookieHeader(request);
  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

function redirectTo(request: NextRequest, targetPath: string, sourceResponse?: Response) {
  const response = NextResponse.redirect(new URL(targetPath, request.nextUrl.origin), 303);
  forwardSetCookie(sourceResponse, response);
  return response;
}

function alertRedirect(
  request: NextRequest,
  message: string,
  targetPath: string,
  sourceResponse?: Response
) {
  const target = new URL(targetPath, request.nextUrl.origin).toString();
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Shop order</title></head>
<body>
<script>
alert(${safeJsonForInlineScript(message)});
location.replace(${safeJsonForInlineScript(target)});
</script>
</body>
</html>`;
  const response = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
  forwardSetCookie(sourceResponse, response);
  return response;
}

function forwardSetCookie(sourceResponse: Response | undefined, targetResponse: NextResponse) {
  if (!sourceResponse) return;

  const headers = sourceResponse.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : splitSetCookieHeader(sourceResponse.headers.get("set-cookie"));

  for (const cookie of cookies) {
    if (cookie) {
      targetResponse.headers.append("Set-Cookie", cookie);
    }
  }
}

function splitSetCookieHeader(value: string | null) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}
