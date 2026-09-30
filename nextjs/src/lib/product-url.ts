import type { ShopProduct } from "@/lib/api";
import { isBbsSeoRewrite, type BbsRewriteMode } from "@/lib/board-url";
import { g5ShortHref } from "@/lib/g5-short-url";
import { isReservedShopRouteRoot } from "@/lib/g5-short-url-rules";

type ProductUrlSource = Pick<ShopProduct, "it_id"> & Partial<Pick<ShopProduct, "it_seo_title">>;

function encodeRouteSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed === ".") return "%2E";
  if (trimmed === "..") return "%2E%2E";

  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

function isReservedShopSegment(value: string): boolean {
  return isReservedShopRouteRoot(value);
}

function safeProductSeoTitle(product: ProductUrlSource): string {
  const seoTitle = String(product.it_seo_title || "").trim();
  if (!seoTitle) return "";

  const normalized = seoTitle.replace(/^\/+|\/+$/g, "");
  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    // Keep the original value when it is not a valid encoded segment.
  }

  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    isReservedShopSegment(normalized) ||
    /^list-[0-9a-z]+$/i.test(normalized) ||
    /^type-[1-5]$/i.test(normalized)
  ) {
    return "";
  }

  return normalized;
}

export function shopProductPath(
  product: ProductUrlSource,
  rewriteMode?: BbsRewriteMode
): string {
  const seoTitle = safeProductSeoTitle(product);
  if (isBbsSeoRewrite(rewriteMode) && seoTitle) {
    return `/shop/${encodeRouteSegment(seoTitle)}/`;
  }

  return `/shop/${encodeRouteSegment(String(product.it_id))}`;
}

export function shopProductHref(
  product: ProductUrlSource,
  rewriteMode?: BbsRewriteMode
): string {
  return g5ShortHref(shopProductPath(product, rewriteMode));
}
