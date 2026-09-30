import { NextRequest, NextResponse } from "next/server";
import { legacyYoungcartPhpRedirect } from "./_legacy-youngcart-redirect";

export type LegacyProvider = "inicis" | "kcp" | "kakaopay" | "lg" | "nicepay" | "toss" | "price";

type LegacyProviderParams = {
  path?: string[];
};

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

export async function legacyProviderPhpRedirect(
  request: NextRequest,
  params: Promise<LegacyProviderParams> | LegacyProviderParams,
  provider: LegacyProvider
) {
  const resolved = await Promise.resolve(params);
  const path = providerPhpPath(provider, resolved.path || []);

  if (!path) {
    return NextResponse.redirect(new URL("/shop", request.nextUrl.origin), 307);
  }

  return legacyYoungcartPhpRedirect(request, path, {
    permanent: false,
    fallbackPathname: "/shop",
  });
}

function providerPhpPath(provider: LegacyProvider, segments: string[]) {
  if (segments.length < 1 || segments.length > 4) {
    return "";
  }

  const cleaned: string[] = [];
  for (const segment of segments) {
    const value = decodeURIComponent(String(segment || "")).trim();
    if (!value || value === "." || value === ".." || !SAFE_SEGMENT_RE.test(value)) {
      return "";
    }
    cleaned.push(value);
  }

  const file = cleaned[cleaned.length - 1] || "";
  if (!/\.(php|inc|html)$/i.test(file)) {
    return "";
  }

  return `/shop/${provider}/${cleaned.map(encodeURIComponent).join("/")}`;
}
