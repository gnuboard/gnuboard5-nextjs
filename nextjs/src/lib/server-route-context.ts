import {
  relativeRedirectTargetsShop,
  safeRelativeRedirect,
} from "@/lib/g5-short-url-utils";

export type RouteSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function withFilteredQuery(
  pathname: string,
  input: RouteSearchParams,
  drop: Set<string>,
  set: Record<string, string> = {}
): string {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(input)) {
    if (drop.has(key)) continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      if (value !== undefined) query.append(key, value);
    }
  }

  for (const [key, value] of Object.entries(set)) {
    query.set(key, value);
  }

  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function shopLoginContextPath(params: RouteSearchParams): string | null {
  const target = safeRelativeRedirect(
    firstValue(params.redirect) || firstValue(params.url)
  );
  if (!relativeRedirectTargetsShop(target)) return null;

  return withFilteredQuery(
    "/shop/login",
    params,
    new Set(["redirect", "url", "rewrite", "shop_path"]),
    { redirect: target }
  );
}

export function shopServiceContextPath(
  params: RouteSearchParams,
  destination: string
): string | null {
  if (firstValue(params.service) !== "shop") return null;
  return withFilteredQuery(destination, params, new Set(["service"]));
}

function selectedShopType(params: RouteSearchParams): string {
  const rewrittenType = firstValue(params.g5_type);
  if (/^[1-5]$/.test(rewrittenType)) return rewrittenType;

  for (let type = 1; type <= 5; type += 1) {
    if (firstValue(params[`it_type${type}`]) === "1") return String(type);
  }
  return "";
}

export function shopTypeCanonicalPath(params: RouteSearchParams): string {
  const type = selectedShopType(params);
  return type ? `/shop/type-${type}` : "/shop/products";
}

export function legacyShopTypeRedirectPath(params: RouteSearchParams): string | null {
  const hasLegacyType = Array.from({ length: 5 }, (_, index) => index + 1).some(
    (type) => firstValue(params[`it_type${type}`]) === "1"
  );
  if (!hasLegacyType) return null;

  const type = selectedShopType(params);
  const drop = new Set(["g5_type", ...Array.from({ length: 5 }, (_, index) => `it_type${index + 1}`)]);
  return withFilteredQuery(`/shop/type-${type}`, params, drop);
}
