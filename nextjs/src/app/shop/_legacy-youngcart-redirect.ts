import { NextRequest, NextResponse } from "next/server";
import { G5_BASE_URL } from "@/lib/config";

type LegacyRedirectOptions = {
  drop?: string[];
  set?: Record<string, string | number | boolean | null | undefined>;
  permanent?: boolean;
};

type LegacyPhpRedirectOptions = LegacyRedirectOptions & {
  fallbackPathname?: string;
};

export function firstLegacyParam(request: NextRequest, keys: string[]): string {
  const searchParams = request.nextUrl.searchParams;

  for (const key of keys) {
    const value = searchParams.get(key);
    if (value !== null && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

export function hasLegacyFlag(request: NextRequest, keys: string[]): boolean {
  const searchParams = request.nextUrl.searchParams;

  return keys.some((key) => {
    const value = searchParams.get(key);
    if (value === null) return false;

    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "no";
  });
}

export function legacyYoungcartRedirect(
  request: NextRequest,
  pathname: string,
  options: LegacyRedirectOptions = {}
) {
  const target = new URL(pathname, request.nextUrl.origin);
  const drop = new Set(options.drop ?? []);

  request.nextUrl.searchParams.forEach((value, key) => {
    if (!drop.has(key)) {
      target.searchParams.append(key, value);
    }
  });

  Object.entries(options.set ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false || value === "") {
      target.searchParams.delete(key);
      return;
    }

    target.searchParams.set(key, value === true ? "1" : String(value));
  });

  return NextResponse.redirect(target, options.permanent === false ? 307 : 308);
}

export function legacyYoungcartPhpRedirect(
  request: NextRequest,
  pathname: string,
  options: LegacyPhpRedirectOptions = {}
) {
  let target: URL;

  try {
    target = new URL(pathname, `${G5_BASE_URL.replace(/\/+$/, "")}/`);
  } catch {
    target = new URL(options.fallbackPathname ?? "/shop", request.nextUrl.origin);
  }

  const drop = new Set(options.drop ?? []);
  request.nextUrl.searchParams.forEach((value, key) => {
    if (!drop.has(key)) {
      target.searchParams.append(key, value);
    }
  });

  Object.entries(options.set ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false || value === "") {
      target.searchParams.delete(key);
      return;
    }

    target.searchParams.set(key, value === true ? "1" : String(value));
  });

  return NextResponse.redirect(target, options.permanent === false ? 307 : 308);
}

export function legacyProductPath(request: NextRequest): string {
  const itId = firstLegacyParam(request, ["it_id"]);
  if (itId) return `/shop/${encodeURIComponent(itId)}`;

  const seoTitle = firstLegacyParam(request, ["it_seo_title"]);
  if (seoTitle) return `/shop/${encodeURIComponent(seoTitle)}/`;

  return "/shop/products";
}
