// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { crossSiteRequestMessage } from "@/lib/server/request-guard";

export const dynamic = "force-dynamic";

const TOKEN_COOKIE = "g5_token";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;
};

export function GET(request: NextRequest) {
  return downloadCoupon(request);
}

export function POST(request: NextRequest) {
  return downloadCoupon(request);
}

async function downloadCoupon(request: NextRequest) {
  const blockedMessage = crossSiteRequestMessage(request);
  if (blockedMessage) {
    return legacyJson({ error: blockedMessage });
  }

  const params = await legacyParams(request);
  const response = await fetch(apiUrl("/shop/coupons/download"), {
    method: "POST",
    cache: "no-store",
    headers: requestHeaders(request),
    body: params.toString(),
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope | null;

  if (response.ok && envelope?.success) {
    return legacyJson({ error: "" }, response);
  }

  return legacyJson({
    error: envelope?.message || response.statusText || "Coupon download failed.",
  }, response);
}

async function legacyParams(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  if (request.method !== "GET") {
    try {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") params.append(key, value);
      });
    } catch {
      // Query-string fallback covers non-form legacy requests.
    }
  }
  return params;
}

function requestHeaders(request: NextRequest) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  const cookie = request.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function legacyJson(payload: { error: string }, sourceResponse?: Response) {
  const response = NextResponse.json(payload, {
    status: 200,
    headers: {
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
    if (cookie) targetResponse.headers.append("Set-Cookie", cookie);
  }
}

function splitSetCookieHeader(value: string | null) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}
