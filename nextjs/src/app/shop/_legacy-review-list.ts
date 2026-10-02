import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { sanitizeUserHtml } from "@/lib/sanitize";

const TOKEN_COOKIE = "g5_token";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  meta?: {
    total?: number;
    per_page?: number;
    current_page?: number;
    last_page?: number;
  };
  message?: string;
};

type LegacyReviewKind = "review" | "qa";

type LegacyMeta = {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
};

type LegacyReview = {
  is_id?: string | number;
  it_id?: string | number;
  it_name?: string;
  mb_nick?: string;
  is_name?: string;
  is_score?: string | number;
  is_subject?: string;
  is_content?: string;
  is_time?: string;
  product_image_url?: string;
  /** 후기 본문의 첫 사진, 없으면 상품 사진(그누보드 get_itemuselist_thumbnail). */
  thumbnail_url?: string;
};

type LegacyQa = {
  iq_id?: string | number;
  it_id?: string | number;
  it_name?: string;
  mb_nick?: string;
  iq_name?: string;
  iq_subject?: string;
  iq_question?: string;
  iq_answer?: string;
  iq_time?: string;
  is_answered?: boolean;
  can_view?: boolean;
  product_image_url?: string;
};

export async function legacyReviewList(request: NextRequest, kind: LegacyReviewKind) {
  const params = await legacyParams(request);
  const page = Math.max(1, Number(params.get("page") || "1") || 1);
  const perPage = Math.max(1, Number(params.get("rows") || params.get("per_page") || "20") || 20);
  const endpoint = kind === "review" ? "/shop/reviews" : "/shop/reviews/qna";
  const apiParams = new URLSearchParams();

  copyParam(params, apiParams, "it_id");
  copyParam(params, apiParams, "stx");
  copyParam(params, apiParams, "q", "stx");
  copyParam(params, apiParams, "sod");
  copyMappedParam(params, apiParams, "sfl", kind === "review" ? REVIEW_SEARCH_FIELDS : QA_SEARCH_FIELDS);
  copyMappedParam(params, apiParams, "sst", kind === "review" ? REVIEW_SORT_FIELDS : QA_SORT_FIELDS);
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  const cookie = request.headers.get("cookie");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(apiUrl(`${endpoint}?${apiParams.toString()}`), {
    cache: "no-store",
    headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<LegacyReview[] | LegacyQa[]> | null;

  if (!response.ok || !envelope?.success || !Array.isArray(envelope.data)) {
    return legacyHtmlResponse(
      request,
      kind,
      [],
      {
        total: 0,
        current_page: page,
        per_page: perPage,
        last_page: 1,
      },
      envelope?.message || response.statusText || "List failed."
    );
  }

  return legacyHtmlResponse(request, kind, envelope.data, {
    total: Number(envelope.meta?.total || 0),
    current_page: Number(envelope.meta?.current_page || page),
    per_page: Number(envelope.meta?.per_page || perPage),
    last_page: Number(envelope.meta?.last_page || 1),
  });
}

const REVIEW_SEARCH_FIELDS: Record<string, string> = {
  "b.it_name": "i.it_name",
  "a.it_id": "r.it_id",
  "a.is_subject": "r.is_subject",
  "a.is_content": "r.is_content",
  "a.is_name": "r.is_name",
  "a.mb_id": "r.mb_id",
};

const REVIEW_SORT_FIELDS: Record<string, string> = {
  "a.is_id": "r.is_id",
  "a.is_datetime": "r.is_datetime",
  "a.is_score": "r.is_score",
  "a.it_id": "r.it_id",
  "b.it_name": "i.it_name",
};

const QA_SEARCH_FIELDS: Record<string, string> = {
  "b.it_name": "i.it_name",
  "a.it_id": "q.it_id",
  "a.iq_subject": "q.iq_subject",
  "a.iq_question": "q.iq_question",
  "a.iq_name": "q.iq_name",
  "a.mb_id": "q.mb_id",
};

const QA_SORT_FIELDS: Record<string, string> = {
  "a.iq_id": "q.iq_id",
  "a.iq_datetime": "q.iq_datetime",
  "a.it_id": "q.it_id",
  "b.it_name": "i.it_name",
};

async function legacyParams(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  if (request.method !== "GET") {
    try {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") params.append(key, value);
      });
    } catch {
      // Query-string fallback covers non-form legacy requests.
    }
  }
  return params;
}

function copyParam(source: URLSearchParams, target: URLSearchParams, from: string, to = from) {
  const value = source.get(from);
  if (value !== null && value.trim() !== "") {
    target.set(to, value.trim());
  }
}

function copyMappedParam(
  source: URLSearchParams,
  target: URLSearchParams,
  key: string,
  map: Record<string, string>
) {
  const value = source.get(key);
  if (!value) return;
  const mapped = map[value.trim()];
  if (mapped) target.set(key, mapped);
}

function legacyHtmlResponse(
  request: NextRequest,
  kind: LegacyReviewKind,
  items: Array<LegacyReview | LegacyQa>,
  meta: LegacyMeta,
  error = ""
) {
  const title = kind === "review" ? "Product Reviews" : "Product Q&A";
  const body = kind === "review"
    ? renderReviews(items as LegacyReview[])
    : renderQas(items as LegacyQa[]);
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;background:#f8fafc;color:#111827;font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
    .legacy-shop-list{max-width:960px;margin:0 auto;padding:24px}
    .legacy-shop-list h1{margin:0 0 16px;font-size:24px}
    .legacy-shop-list form{display:flex;gap:8px;margin:0 0 16px}
    .legacy-shop-list input{flex:1;min-width:0;border:1px solid #d1d5db;border-radius:6px;padding:10px}
    .legacy-shop-list button,.legacy-shop-list a.page{border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#111827;padding:10px 14px;text-decoration:none}
    .legacy-list{display:grid;gap:12px;margin:0;padding:0;list-style:none}
    .legacy-item{display:grid;grid-template-columns:72px 1fr;gap:14px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;padding:14px}
    .legacy-thumb{width:72px;height:72px;border-radius:6px;background:#f3f4f6;object-fit:cover}
    .legacy-meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px;color:#6b7280;font-size:12px}
    .legacy-subject{margin:0 0 8px;font-size:16px}
    .legacy-content{margin:0;color:#374151;font-size:14px;line-height:1.55}
    .legacy-answer{margin-top:10px;border-left:3px solid #22c55e;padding-left:10px;color:#166534}
    .legacy-empty,.legacy-error{border:1px solid #e5e7eb;border-radius:8px;background:#fff;padding:24px;text-align:center;color:#6b7280}
    .legacy-error{color:#b91c1c}
    .legacy-pages{display:flex;gap:8px;justify-content:center;margin-top:18px}
    .legacy-pages .current{background:#111827;color:#fff}
  </style>
</head>
<body>
  <main class="legacy-shop-list">
    <h1>${escapeHtml(title)}</h1>
    ${renderSearchForm(request)}
    ${error ? `<div class="legacy-error">${escapeHtml(error)}</div>` : body}
    ${renderPagination(request, meta)}
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function renderSearchForm(request: NextRequest) {
  const stx = request.nextUrl.searchParams.get("stx") || request.nextUrl.searchParams.get("q") || "";
  return `<form method="get">
  <input type="search" name="stx" value="${escapeHtml(stx)}" placeholder="Search">
  <button type="submit">Search</button>
</form>`;
}

function renderReviews(items: LegacyReview[]) {
  if (items.length === 0) return `<div class="legacy-empty">No reviews found.</div>`;
  return `<ul class="legacy-list">${items.map((item) => {
    const itId = stringValue(item.it_id);
    const name = stringValue(item.it_name);
    const href = `/shop/${encodeURIComponent(itId)}?tab=reviews`;
    const score = Math.max(0, Math.min(5, Number(item.is_score || 0) || 0));
    return `<li class="legacy-item" data-is-id="${escapeHtml(stringValue(item.is_id))}">
  ${renderThumb(item.thumbnail_url || item.product_image_url, name, href)}
  <div>
    <p class="legacy-meta">
      <a href="${escapeHtml(href)}">${escapeHtml(name || itId)}</a>
      <span>Score ${score}/5</span>
      <span>${escapeHtml(stringValue(item.mb_nick || item.is_name))}</span>
      <span>${escapeHtml(formatDate(item.is_time))}</span>
    </p>
    <h2 class="legacy-subject">${escapeHtml(stringValue(item.is_subject))}</h2>
    <div class="legacy-content">${sanitizeLegacyHtml(stringValue(item.is_content))}</div>
  </div>
</li>`;
  }).join("")}</ul>`;
}

function renderQas(items: LegacyQa[]) {
  if (items.length === 0) return `<div class="legacy-empty">No Q&A found.</div>`;
  return `<ul class="legacy-list">${items.map((item) => {
    const itId = stringValue(item.it_id);
    const name = stringValue(item.it_name);
    const href = `/shop/${encodeURIComponent(itId)}?tab=qa`;
    const canView = item.can_view !== false;
    const answered = item.is_answered === true || stringValue(item.iq_answer).trim() !== "";
    return `<li class="legacy-item" data-iq-id="${escapeHtml(stringValue(item.iq_id))}">
  ${renderThumb(item.product_image_url, name, href)}
  <div>
    <p class="legacy-meta">
      <a href="${escapeHtml(href)}">${escapeHtml(name || itId)}</a>
      <span>${answered ? "Answered" : "Waiting"}</span>
      <span>${escapeHtml(stringValue(item.mb_nick || item.iq_name))}</span>
      <span>${escapeHtml(formatDate(item.iq_time))}</span>
    </p>
    <h2 class="legacy-subject">${escapeHtml(stringValue(item.iq_subject))}</h2>
    <div class="legacy-content">${canView ? sanitizeLegacyHtml(stringValue(item.iq_question)) : "Secret question."}</div>
    ${canView && answered ? `<div class="legacy-answer">${sanitizeLegacyHtml(stringValue(item.iq_answer))}</div>` : ""}
  </div>
</li>`;
  }).join("")}</ul>`;
}

function renderThumb(src: unknown, alt: string, href: string) {
  const image = stringValue(src);
  const inner = image
    ? `<img class="legacy-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(alt)}">`
    : `<span class="legacy-thumb" aria-hidden="true"></span>`;
  return `<a href="${escapeHtml(href)}">${inner}</a>`;
}

function renderPagination(request: NextRequest, meta: LegacyMeta) {
  const current = Math.max(1, Number(meta.current_page || 1));
  const last = Math.max(1, Number(meta.last_page || 1));
  if (last <= 1) return "";

  const start = Math.max(1, current - 2);
  const end = Math.min(last, current + 2);
  const links: string[] = [];
  for (let page = start; page <= end; page += 1) {
    const url = new URL(request.nextUrl);
    url.searchParams.set("page", String(page));
    links.push(`<a class="page${page === current ? " current" : ""}" href="${escapeHtml(url.pathname + url.search)}">${page}</a>`);
  }
  return `<nav class="legacy-pages" aria-label="Pagination">${links.join("")}</nav>`;
}

function sanitizeLegacyHtml(value: string) {
  return sanitizeUserHtml(value);
}

function formatDate(value: unknown) {
  return stringValue(value).slice(0, 10);
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
