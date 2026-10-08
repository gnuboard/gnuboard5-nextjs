import { isReservedShopRouteRoot } from "@/lib/g5-short-url-rules";

export function splitPath(value: string): { pathname: string; search: string; hash: string } | null {
  if (!value.startsWith("/")) return null;

  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const pathname = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  return { pathname: pathname || "/", search, hash };
}

export function withSuffix(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

export function firstYoungCartType(search: string): { type: string; search: string } | null {
  if (!search) return null;

  const params = new URLSearchParams(search.slice(1));
  for (let index = 1; index <= 5; index += 1) {
    const key = `it_type${index}`;
    if (params.get(key) === "1") {
      params.delete(key);
      const nextSearch = params.toString();
      return { type: String(index), search: nextSearch ? `?${nextSearch}` : "" };
    }
  }

  return null;
}

export function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function firstSearchParam(search: string, keys: string[]): string {
  const params = searchParams(search);

  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function safeShopProductSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed === ".") return "%2E";
  if (trimmed === "..") return "%2E%2E";
  return encodeURIComponent(trimmed);
}

function unsafeShortProductSegment(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    isReservedShopRouteRoot(trimmed)
  );
}

export function safeRelativeRedirect(value: string): string {
  if (!value) return "";

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // URLSearchParams already decodes valid values; keep the original on malformed input.
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    // 브라우저는 주소 속 탭 · 줄바꿈을 지운다("/\t/evil.com" → "//evil.com"). 제어문자와
    // 한 번 더 인코딩된 제어문자(%09 · %0a · %0d · %00 …)도 받지 않는다. PHP nextjs_default_safe_relative_redirect() 와 같은 규칙.
    /[\x00-\x1f\x7f]/.test(decoded) ||
    /%(?:[01][0-9a-f]|7f)/i.test(decoded)
  ) {
    return "";
  }

  return decoded;
}

export function relativeRedirectTargetsShop(value: string): boolean {
  const redirect = safeRelativeRedirect(value);
  if (!redirect) return false;

  const redirectPath = splitPath(redirect)?.pathname || "/";
  return redirectPath === "/shop" || redirectPath.startsWith("/shop/");
}

export function hasSearchFlag(search: string, keys: string[]): boolean {
  const params = searchParams(search);

  return keys.some((key) => {
    const value = params.get(key);
    if (value === null) return false;

    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "no";
  });
}

export function isPassthroughLegacyRequest(pathname: string, search: string): boolean {
  if (pathname !== "/shop/personalpayform.php") return false;

  for (const [key, value] of searchParams(search)) {
    if (/^g5_[a-z0-9_]+_passthrough$/.test(key) && value === "1") {
      return true;
    }
  }

  return false;
}

export function searchWithChanges(
  search: string,
  drop: string[] = [],
  set: Record<string, string | number | boolean | null | undefined> = {}
): string {
  const params = searchParams(search);

  drop.forEach((key) => params.delete(key));
  Object.entries(set).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false || value === "") {
      params.delete(key);
      return;
    }

    params.set(key, value === true ? "1" : String(value));
  });

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function legacyProductShortPath(search: string): string {
  const itemId = firstSearchParam(search, ["it_id"]);
  if (itemId) {
    const encoded = safeShopProductSegment(itemId);
    return unsafeShortProductSegment(itemId)
      ? `/shop/products/${encoded}`
      : `/shop/${encoded}`;
  }

  const seoTitle = firstSearchParam(search, ["it_seo_title"]);
  if (seoTitle && !unsafeShortProductSegment(seoTitle)) {
    return `/shop/${safeShopProductSegment(seoTitle)}/`;
  }

  return "/shop/products";
}
