import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { crossSiteRequestMessage, shouldGuardMutation } from "@/lib/server/request-guard";
import { fetchWithTimeout, isFetchTimeoutError } from "@/lib/server/fetch-timeout";
import { forwardedLegacyCookieHeader } from "@/lib/server/forwarded-cookies";
import { safeJsonForInlineScript } from "@/lib/runtime-config-script";

const TOKEN_COOKIE = "g5_token";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type LegacyActionPayload = {
  redirect?: string;
};

type LegacyActionMethod = "GET" | "POST" | "PATCH" | "DELETE";
type LegacyActionValue = string | ((params: URLSearchParams) => string);
type LegacyResponseMode = "redirect" | "alert-redirect" | "alert-close" | "alert-opener";
type LegacyBodyFormat = "form" | "json" | "none";

type LegacyActionOptions = {
  endpoint: LegacyActionValue;
  fallbackRedirect: LegacyActionValue;
  apiMethod?: LegacyActionMethod | ((params: URLSearchParams) => LegacyActionMethod);
  bodyFormat?: LegacyBodyFormat | ((params: URLSearchParams, method: LegacyActionMethod) => LegacyBodyFormat);
  guardMutation?: boolean;
  loginOnUnauthorized?: boolean;
  responseMode?: LegacyResponseMode | ((params: URLSearchParams) => LegacyResponseMode);
  successMessage?: string | ((params: URLSearchParams, envelope: ApiEnvelope<LegacyActionPayload>) => string);
  transformParams?: (params: URLSearchParams) => URLSearchParams;
};

export async function legacyActionParams(request: NextRequest) {
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

export async function runLegacyYoungcartAction(request: NextRequest, options: LegacyActionOptions) {
  if (options.guardMutation || shouldGuardMutation(request)) {
    const blockedMessage = crossSiteRequestMessage(request);
    if (blockedMessage) {
      return legacyAlertResponse(request, blockedMessage, "/shop");
    }
  }

  const rawParams = await legacyActionParams(request);
  const params = options.transformParams ? options.transformParams(rawParams) : rawParams;
  const endpoint = resolveLegacyValue(options.endpoint, params);
  const fallbackRedirect = legacyRedirectPath(
    request,
    resolveLegacyValue(options.fallbackRedirect, params),
    "/shop"
  );
  const apiMethod = typeof options.apiMethod === "function"
    ? options.apiMethod(params)
    : options.apiMethod || "POST";
  const bodyFormat = typeof options.bodyFormat === "function"
    ? options.bodyFormat(params, apiMethod)
    : options.bodyFormat || (apiMethod === "POST" ? "form" : "json");
  const responseMode = typeof options.responseMode === "function"
    ? options.responseMode(params)
    : options.responseMode || "redirect";
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (bodyFormat === "form") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (bodyFormat === "json") {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const cookie = forwardedLegacyCookieHeader(request);
  if (cookie) {
    headers.Cookie = cookie;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl(endpoint), {
      method: apiMethod,
      cache: "no-store",
      headers,
      body: legacyActionBody(params, bodyFormat),
    });
  } catch (error: unknown) {
    return legacyAlertResponse(
      request,
      isFetchTimeoutError(error)
        ? "쇼핑몰 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
        : "쇼핑몰 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
      fallbackRedirect
    );
  }

  if ((response.status === 401 || response.status === 403) && options.loginOnUnauthorized) {
    return legacyRedirect(request, `/shop/login?redirect=${encodeURIComponent(fallbackRedirect)}`, response);
  }

  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<LegacyActionPayload> | null;
  if (!response.ok || !envelope?.success) {
    return legacyAlertResponse(request,
      envelope?.message || response.statusText || "The requested shop action could not be completed.",
      fallbackRedirect,
      response
    );
  }

  const redirect = legacyRedirectPath(request, envelope.data?.redirect || fallbackRedirect, fallbackRedirect);
  if (responseMode === "redirect") {
    return legacyRedirect(request, redirect, response);
  }

  const successMessage = typeof options.successMessage === "function"
    ? options.successMessage(params, envelope)
    : options.successMessage || envelope.message || "처리되었습니다.";

  return legacyScriptResponse(request, successMessage, redirect, responseMode, response);
}

function legacyRedirect(request: NextRequest, targetPath: string, sourceResponse?: Response) {
  const target = legacyRedirectUrl(request, targetPath);
  const response = NextResponse.redirect(target, 303);
  forwardSetCookie(sourceResponse, response);
  return response;
}

function legacyAlertResponse(request: NextRequest, message: string, fallbackRedirect: string, sourceResponse?: Response) {
  return legacyScriptResponse(request, message, fallbackRedirect, "alert-redirect", sourceResponse);
}

function legacyScriptResponse(
  request: NextRequest,
  message: string,
  targetPath: string,
  mode: LegacyResponseMode,
  sourceResponse?: Response
) {
  const target = legacyRedirectUrl(request, targetPath).toString();
  const script = legacyActionScript(message, target, mode);
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Shop action</title></head>
<body>
<script>${script}</script>
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

function legacyActionScript(message: string, target: string, mode: LegacyResponseMode) {
  // API 메시지는 <script> 안에 그대로 들어간다. JSON.stringify 만으로는 "</script>" 가 태그를 닫으므로 < > & U+2028/2029 를 이스케이프한다.
  const alertLine = `alert(${safeJsonForInlineScript(message)});`;
  if (mode === "alert-close") {
    return `${alertLine}
try { window.close(); } catch { /* Ignore browsers that block scripted popup close. */ }
if (!window.closed) location.replace(${safeJsonForInlineScript(target)});`;
  }

  if (mode === "alert-opener") {
    return `${alertLine}
if (window.opener && !window.opener.closed) {
  try { window.opener.location.replace(${safeJsonForInlineScript(target)}); } catch { /* Ignore blocked opener navigation. */ }
  try { window.close(); } catch { /* Ignore browsers that block scripted popup close. */ }
}
if (!window.closed) location.replace(${safeJsonForInlineScript(target)});`;
  }

  return `${alertLine}
location.replace(${safeJsonForInlineScript(target)});`;
}

function resolveLegacyValue(value: LegacyActionValue, params: URLSearchParams) {
  return typeof value === "function" ? value(params) : value;
}

function legacyRedirectUrl(request: NextRequest, targetPath: string, fallbackPath = "/shop") {
  return new URL(legacyRedirectPath(request, targetPath, fallbackPath), request.nextUrl.origin);
}

function legacyRedirectPath(request: NextRequest, targetPath: string, fallbackPath = "/shop") {
  const fallback = legacyFallbackPath(request, fallbackPath);
  try {
    const target = new URL(targetPath || fallback, request.nextUrl.origin);
    if (target.origin !== request.nextUrl.origin) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

function legacyFallbackPath(request: NextRequest, fallbackPath: string) {
  try {
    const fallback = new URL(fallbackPath || "/shop", request.nextUrl.origin);
    if (fallback.origin === request.nextUrl.origin) {
      return `${fallback.pathname}${fallback.search}${fallback.hash}`;
    }
  } catch {
    // Use the stable shop landing page when the fallback is malformed.
  }
  return "/shop";
}

function legacyActionBody(params: URLSearchParams, format: LegacyBodyFormat) {
  if (format === "none") return undefined;
  if (format === "json") return JSON.stringify(urlSearchParamsToObject(params));
  return params.toString();
}

function urlSearchParamsToObject(params: URLSearchParams) {
  const output: Record<string, string | string[]> = {};
  params.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      const current = output[key];
      output[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      output[key] = value;
    }
  });
  return output;
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
