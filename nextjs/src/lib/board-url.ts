import type { WritePost } from "@/lib/types";
import { g5ShortHref } from "@/lib/g5-short-url";

export type BbsRewriteMode = number | string | null | undefined;

type PostUrlSource = Pick<WritePost, "wr_id"> & Partial<Pick<WritePost, "wr_seo_title">>;

const RESERVED_POST_SEGMENTS = new Set(["rss", "write"]);

export function isBbsSeoRewrite(mode: BbsRewriteMode): boolean {
  return Number(mode) === 2;
}

function encodeRouteSegment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function safeSeoTitle(post: PostUrlSource): string {
  const seoTitle = String(post.wr_seo_title || "").trim();
  if (!seoTitle) return "";

  const normalized = seoTitle.replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    RESERVED_POST_SEGMENTS.has(normalized.toLowerCase())
  ) {
    return "";
  }

  return normalized;
}

export function boardPostPath(
  boTable: string,
  post: PostUrlSource,
  rewriteMode?: BbsRewriteMode
): string {
  const seoTitle = safeSeoTitle(post);
  if (isBbsSeoRewrite(rewriteMode) && seoTitle) {
    return `/boards/${encodeRouteSegment(boTable)}/${encodeRouteSegment(seoTitle)}/`;
  }

  return `/boards/${encodeRouteSegment(boTable)}/${encodeRouteSegment(String(post.wr_id))}`;
}

export function boardPostHref(
  boTable: string,
  post: PostUrlSource,
  rewriteMode?: BbsRewriteMode
): string {
  return g5ShortHref(boardPostPath(boTable, post, rewriteMode));
}
