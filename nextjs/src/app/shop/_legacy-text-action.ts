import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { crossSiteRequestMessage } from "@/lib/server/request-guard";
import { fetchWithTimeout, isFetchTimeoutError } from "@/lib/server/fetch-timeout";
import { forwardedLegacyCookieHeader } from "@/lib/server/forwarded-cookies";

const TOKEN_COOKIE = "g5_token";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type LegacyTextActionOptions = {
  endpoint: string;
  method?: "GET" | "POST";
  successText?: string;
};

export async function runLegacyYoungcartTextAction(
  request: NextRequest,
  options: LegacyTextActionOptions
) {
  // These legacy text endpoints mutate order/cart state even on GET.
  const blockedMessage = crossSiteRequestMessage(request);
  if (blockedMessage) {
    return legacyTextResponse(blockedMessage);
  }

  const params = await legacyTextActionParams(request);
  const method = options.method || (request.method === "GET" ? "GET" : "POST");
  const endpoint = method === "GET" && params.toString()
    ? `${options.endpoint}${options.endpoint.includes("?") ? "&" : "?"}${params.toString()}`
    : options.endpoint;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const cookie = forwardedLegacyCookieHeader(request);
  if (cookie) {
    headers.Cookie = cookie;
  }

  if (method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl(endpoint), {
      method,
      cache: "no-store",
      headers,
      body: method === "GET" ? undefined : params.toString(),
    });
  } catch (error: unknown) {
    return legacyTextResponse(
      isFetchTimeoutError(error)
        ? "The shop server did not respond in time. Please try again."
        : "The shop server is temporarily unavailable. Please try again."
    );
  }
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope | null;

  if (response.ok && envelope?.success) {
    return legacyTextResponse(options.successText || "", response);
  }

  const fallbackText = await response.text().catch(() => "");
  return legacyTextResponse(
    envelope?.message || fallbackText || response.statusText || "The requested shop action could not be completed.",
    response
  );
}

async function legacyTextActionParams(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);

  if (request.method !== "GET") {
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
  }

  return params;
}

function legacyTextResponse(text: string, sourceResponse?: Response) {
  const response = new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
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
