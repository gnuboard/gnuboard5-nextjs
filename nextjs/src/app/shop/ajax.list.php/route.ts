// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  meta?: {
    current_page?: number;
    per_page?: number;
    total?: number;
    last_page?: number;
  };
  message?: string;
};

type Product = {
  it_id?: string;
  it_name?: string;
  it_price?: number;
  it_cust_price?: number;
  it_tel_inq?: string | number;
  it_soldout?: string | number;
  it_seo_title?: string;
  image_url?: string;
};

export function GET(request: NextRequest) {
  return legacyAjaxList(request);
}

export function POST(request: NextRequest) {
  return legacyAjaxList(request);
}

async function legacyAjaxList(request: NextRequest) {
  const params = await legacyParams(request);
  const currentPage = Math.max(1, Number(params.get("page") || "1") || 1);
  const nextPage = currentPage + 1;
  const perPage = Math.max(1, Number(params.get("items") || params.get("per_page") || "20") || 20);
  const apiParams = new URLSearchParams();

  copyParam(params, apiParams, "ca_id");
  copyParam(params, apiParams, "sort");
  copyParam(params, apiParams, "sortodr");
  copyParam(params, apiParams, "qsort", "sort");
  copyParam(params, apiParams, "qorder", "sortodr");
  apiParams.set("page", String(nextPage));
  apiParams.set("per_page", String(perPage));

  let response: Response;
  try {
    response = await fetch(apiUrl(`/shop/products?${apiParams.toString()}`), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    return legacyListError("Product list failed.", currentPage);
  }

  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<Product[]> | null;

  if (!response.ok || !envelope?.success || !Array.isArray(envelope.data)) {
    return legacyListError(
      envelope?.message || response.statusText || "Product list failed.",
      currentPage
    );
  }

  return NextResponse.json({
    item: envelope.data.map(renderProduct).join(""),
    error: "",
    page: nextPage,
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

function legacyListError(error: string, page: number) {
  return NextResponse.json(
    {
      error,
      item: "",
      page,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

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

function renderProduct(product: Product) {
  const id = String(product.it_id || "");
  const name = String(product.it_name || "");
  const href = `/shop/${encodeURIComponent(id)}`;
  const telInquiry = String(product.it_tel_inq || "0") === "1";
  const soldout = String(product.it_soldout || "0") === "1";
  const image = String(product.image_url || "");
  const price = telInquiry ? "전화문의" : formatNumber(Number(product.it_price || 0));

  return `
<li class="sct_li legacy-ajax-product" data-it-id="${escapeHtml(id)}">
  <div class="sct_img">
    <a href="${escapeHtml(href)}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}">` : `<span class="no_image">이미지 준비중</span>`}</a>
  </div>
  <div class="sct_txt"><a href="${escapeHtml(href)}">${escapeHtml(name)}</a></div>
  <div class="sct_cost">${escapeHtml(price)}</div>
  ${soldout ? `<div class="sct_soldout">품절</div>` : ""}
</li>`.trim();
}

function formatNumber(value: number) {
  return `${Math.max(0, value).toLocaleString("ko-KR")}원`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
