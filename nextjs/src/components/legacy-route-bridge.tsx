"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  apiBaseUrlForRuntime,
  g5BasePathForRuntime,
  currentPathForRuntime,
  g5PathForRuntime,
  isG5ThemeRuntime,
} from "@/lib/config";
import { toG5ShortPath } from "@/lib/g5-short-url";
import { isReservedShopRouteRoot } from "@/lib/g5-short-url-rules";

const RESERVED_ROOTS = new Set([
  "admin",
  "adm",
  "api",
  "bbs",
  "css",
  "data",
  "faq",
  "forgot-password",
  "img",
  "install",
  "js",
  "lib",
  "login",
  "members",
  "mobile",
  "offline",
  "plugin",
  "polls",
  "recent",
  "register",
  "robots.txt",
  "search",
  "shop",
  "sitemap.xml",
  "sitemap-posts.xml",
  "theme",
]);

const STATIC_FALLBACK_SEGMENTS = new Set(["__g5_static__", "g5-static-product"]);

interface RouteOptions {
  legacySeoPath?: boolean;
}

function encodeRouteSegment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function isStaticFallbackPath(pathname: string): boolean {
  return pathname
    .split(/[?#]/)[0]
    .split("/")
    .some((segment) => STATIC_FALLBACK_SEGMENTS.has(segment));
}

function isReservedShopSegment(value: string): boolean {
  return isReservedShopRouteRoot(value);
}

function pathOnly(target: string): string {
  return target.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

function requiresDocumentNavigation(target: string): boolean {
  const path = pathOnly(target);
  return [
    /^\/boards\/[^/]+$/,
    /^\/boards\/[^/]+\/(?:[^/]+|write)$/,
    /^\/content\/[^/]+$/,
    /^\/members\/[^/]+$/,
    /^\/mypage\/(?:memos|qas)\/[^/]+$/,
    /^\/shop\/content\/[^/]+$/,
    /^\/shop\/personalpay\/[^/]+\/pay$/,
    /^\/shop\/(?:categories|events|orders|personalpay|products)\/[^/]+$/,
  ].some((pattern) => pattern.test(path));
}

async function resolveSeoRoute(
  pathname: string,
  options: RouteOptions = {}
): Promise<string | null> {
  const path = pathname.replace(/\/+$/, "") || "/";
  const apiBase = apiBaseUrlForRuntime();
  const root = path.split("/")[1] || "";

  if (
    (RESERVED_ROOTS.has(root) && root !== "shop") ||
    path.startsWith("/boards/") ||
    path.startsWith("/mypage/")
  ) {
    return null;
  }

  const shopRoot = path.match(/^\/shop(?:\/([^/]+))?/);
  if (shopRoot && (!shopRoot[1] || isReservedShopSegment(shopRoot[1]))) {
    return null;
  }

  let match = path.match(/^\/shop\/([^/]+)$/);
  if (match && options.legacySeoPath) {
    return null;
  }

  match = path.match(/^\/content\/([^/]+)$/);
  if (match && options.legacySeoPath) {
    const content = await fetchJson<{ co_id?: string }>(
      `${apiBase}/content/seo/${encodeRouteSegment(match[1])}`
    );
    return content?.co_id ? `/content/${encodeURIComponent(content.co_id)}` : null;
  }

  match = path.match(/^\/shop\/content\/([^/]+)$/);
  if (match && options.legacySeoPath) {
    const content = await fetchJson<{ co_id?: string }>(
      `${apiBase}/content/seo/${encodeRouteSegment(match[1])}`
    );
    return content?.co_id ? `/shop/content/${encodeURIComponent(content.co_id)}` : null;
  }

  match = path.match(/^\/([0-9A-Za-z_]+)\/([^/]+)$/);
  if (match && options.legacySeoPath && !RESERVED_ROOTS.has(match[1])) {
    return null;
  }

  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    const payload = await response.json();
    if (payload && payload.success && payload.data) {
      return payload.data as T;
    }
  } catch {
    return null;
  }

  return null;
}

export function LegacyRouteBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function normalize() {
      const legacyPath = currentPathForRuntime(pathname || undefined);
      const rawPathname = window.location.pathname || "/";
      const legacySeoPath = legacyPath !== "/" && rawPathname.endsWith("/");
      const query = window.location.search || "";
      const hash = window.location.hash || "";
      const current = `${legacyPath}${query}${hash}`;
      const shortTarget = isG5ThemeRuntime() && !isStaticFallbackPath(legacyPath)
        ? toG5ShortPath(current)
        : current;

      if (!cancelled && shortTarget !== current) {
        window.location.replace(g5PathForRuntime(shortTarget));
        return;
      }

      const target = legacySeoPath
        ? await resolveSeoRoute(legacyPath, { legacySeoPath })
        : null;

      if (!cancelled && target && target !== `${legacyPath}${query}`) {
        const targetWithHash = `${target}${query}${hash}`;
        if (isG5ThemeRuntime() || g5BasePathForRuntime() || requiresDocumentNavigation(target)) {
          window.location.replace(g5PathForRuntime(targetWithHash));
          return;
        }

        router.replace(targetWithHash);
      }
    }

    normalize();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
