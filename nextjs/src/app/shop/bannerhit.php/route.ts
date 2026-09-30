// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { apiUrl, G5_BASE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

function fallbackShopUrl(request: NextRequest) {
  return new URL("/shop", request.nextUrl.origin);
}

function normalizeBannerTarget(request: NextRequest, value?: string): URL {
  const raw = (value ?? "").trim();
  if (!raw) {
    return fallbackShopUrl(request);
  }

  try {
    const target = /^https?:\/\//i.test(raw)
      ? new URL(raw)
      : raw.startsWith("/")
        ? new URL(raw, request.nextUrl.origin)
        : new URL(raw, request.nextUrl);

    if (target.origin === request.nextUrl.origin) {
      return target;
    }

    try {
      const g5Base = new URL(G5_BASE_URL);
      const g5BasePath = g5Base.pathname.replace(/\/+$/, "");
      if (target.origin === g5Base.origin) {
        const targetPath = target.pathname || "/";
        const appPath =
          g5BasePath && targetPath.startsWith(`${g5BasePath}/`)
            ? targetPath.slice(g5BasePath.length)
            : targetPath === g5BasePath
              ? "/"
              : targetPath;
        return new URL(`${appPath || "/"}${target.search}${target.hash}`, request.nextUrl.origin);
      }
    } catch {
      // Fall through to the stable shop page when the configured G5 origin is malformed.
    }

    return fallbackShopUrl(request);
  } catch {
    return fallbackShopUrl(request);
  }
}

async function fetchBannerHit(bannerId: string, shouldCount: boolean) {
  const response = await fetch(
    apiUrl(`/shop/banners/${encodeURIComponent(bannerId)}/hit?count=${shouldCount ? "1" : "0"}`),
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return payload && typeof payload === "object" ? payload : null;
}

export async function GET(request: NextRequest) {
  const bannerId = (request.nextUrl.searchParams.get("bn_id") ?? "").trim();
  if (!/^[0-9]+$/.test(bannerId) || Number(bannerId) <= 0) {
    return NextResponse.redirect(fallbackShopUrl(request), 307);
  }

  const shouldCount = request.cookies.get("ck_bn_id")?.value !== bannerId;
  const payload = await fetchBannerHit(bannerId, shouldCount);
  const redirectUrl =
    payload && typeof payload === "object" && "data" in payload
      ? (payload.data as { redirect_url?: string } | undefined)?.redirect_url
      : undefined;

  const response = NextResponse.redirect(normalizeBannerTarget(request, redirectUrl), 307);
  if (shouldCount && redirectUrl) {
    response.cookies.set("ck_bn_id", bannerId, {
      path: "/",
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
    });
  }

  return response;
}
