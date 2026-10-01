import { g5ShortHref } from "@/lib/g5-short-url";
import { appBaseUrlForRuntime, g5BaseUrlForRuntime } from "@/lib/config";

export interface MenuItem {
  me_id: number;
  me_code: string;
  me_name: string;
  me_link: string;
  me_target: string;
  children?: MenuItem[];
}

export function isExternalMenuLink(link: string): boolean {
  return /^https?:\/\//.test(link);
}

export function isUnsafeMenuLink(link: string): boolean {
  return /^\s*javascript:/i.test(link);
}

export function menuAnchorTarget(target?: string): "_blank" | undefined {
  return target?.trim().replace(/^_/, "") === "blank" ? "_blank" : undefined;
}

function pathWithinBase(url: URL, base: string): string | null {
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return null;
  }

  if (url.origin !== baseUrl.origin) return null;

  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  if (!basePath) return `${url.pathname}${url.search}${url.hash}`;
  if (url.pathname === basePath) return `/${url.search}${url.hash}`;
  if (!url.pathname.startsWith(`${basePath}/`)) return null;

  return `${url.pathname.slice(basePath.length)}${url.search}${url.hash}`;
}

function knownG5LegacyPathFromAbsoluteUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const knownBases = [
    g5BaseUrlForRuntime(),
    appBaseUrlForRuntime(),
    currentOrigin,
  ].filter(Boolean);

  for (const base of knownBases) {
    const path = pathWithinBase(url, base);
    if (!path) continue;
    if (/^\/(?:bbs|mobile|shop)\/[^/?#]+\.php(?:[?#].*)?$/i.test(path)) {
      return path;
    }
    // 그누보드 첫 주소(G5_URL, G5_URL/index.php) — 관리자 > 메뉴설정의 상위 메뉴 기본값. 앱 홈으로 보낸다.
    const root = path.match(/^\/(?:index\.php)?((?:[?#].*)?)$/i);
    if (root) {
      return `/${root[1]}`;
    }
  }

  return null;
}

export function menuHref(link: string): string {
  const href = link.trim();
  if (isUnsafeMenuLink(href)) return "#";
  if (!href) return href;
  if (isExternalMenuLink(href)) {
    const legacyPath = knownG5LegacyPathFromAbsoluteUrl(href);
    return legacyPath ? g5ShortHref(legacyPath) : href;
  }
  if (/^(#|mailto:|tel:)/i.test(href)) return href;

  return g5ShortHref(href.startsWith("/") ? href : `/${href}`);
}
