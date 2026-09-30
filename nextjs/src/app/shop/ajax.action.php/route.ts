// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { crossSiteRequestMessage } from "@/lib/server/request-guard";

export const dynamic = "force-dynamic";

const TOKEN_COOKIE = "g5_token";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type CartPayload = {
  items?: CartItem[];
  total_price?: number;
  total_qty?: number;
};

type CartItem = {
  ct_id?: number | string;
  it_id?: string;
  it_name?: string;
  ct_qty?: number;
  ct_option?: string;
  line_total?: number;
  image_url?: string;
};

type Product = {
  it_id?: string;
  it_name?: string;
  it_price?: number;
  it_stock_qty?: number;
  it_buy_min_qty?: number;
  it_soldout?: string | number;
  it_tel_inq?: string | number;
  options?: ProductOption[];
};

type ProductOption = {
  io_id?: string;
  io_type?: number;
  io_price?: number;
  io_stock_qty?: number;
  io_use?: number;
};

export function GET(request: NextRequest) {
  return handleAjaxAction(request);
}

export function POST(request: NextRequest) {
  return handleAjaxAction(request);
}

async function handleAjaxAction(request: NextRequest) {
  const params = await legacyParams(request);
  const action = sanitizeAction(params.get("action") || "");

  if (action !== "refresh_cart" && action !== "refresh_wish") {
    const blockedMessage = crossSiteRequestMessage(request);
    if (blockedMessage) {
      return htmlResponse(blockedMessage, 403);
    }
  }

  switch (action) {
    case "refresh_cart":
      return refreshCart(request);
    case "refresh_wish":
      return refreshWish(request);
    case "cart_delete":
      return cartDelete(request, params);
    case "cart_update":
      return cartUpdate(request, params);
    case "get_item_option":
      return getItemOption(request, params);
    case "wish_update":
      return wishUpdate(request, params);
    default:
      return new NextResponse("", {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
  }
}

async function refreshCart(request: NextRequest) {
  const response = await fetch(apiUrl("/shop/cart"), {
    cache: "no-store",
    headers: requestHeaders(request),
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<CartPayload> | null;
  const items = response.ok && envelope?.success && Array.isArray(envelope.data?.items)
    ? envelope.data.items
    : [];

  return htmlResponse(renderCartBox(items, envelope?.data));
}

async function refreshWish(request: NextRequest) {
  const response = await fetch(apiUrl("/shop/wishlist?per_page=12"), {
    cache: "no-store",
    headers: requestHeaders(request),
  });

  if (response.status === 401 || response.status === 403) {
    return htmlResponse("");
  }

  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<Array<{ it_id?: string; it_name?: string }>> | null;
  const items = response.ok && envelope?.success && Array.isArray(envelope.data)
    ? envelope.data
    : [];

  return htmlResponse(renderWishBox(items));
}

async function cartDelete(request: NextRequest, params: URLSearchParams) {
  const nextParams = new URLSearchParams(params);
  nextParams.set("act", "seldelete");
  if (params.get("it_id") && !params.has("it_id[]")) {
    nextParams.append("it_id[]", params.get("it_id") || "");
  }

  const result = await postApi(request, "/shop/cart/legacy-update", nextParams);
  return jsonError(result.ok ? "" : result.message);
}

async function cartUpdate(request: NextRequest, params: URLSearchParams) {
  const result = await postApi(request, "/shop/cart/legacy-update", params);
  return jsonError(result.ok ? "" : result.message);
}

async function wishUpdate(request: NextRequest, params: URLSearchParams) {
  const result = await postApi(request, "/shop/wishlist/legacy-update", params);
  return textResponse(result.ok ? "OK" : result.message);
}

async function getItemOption(request: NextRequest, params: URLSearchParams) {
  const itId = String(params.get("it_id") || params.get("it_id[]") || "").replace(/[^0-9a-z_-]/gi, "");
  if (!itId) {
    return NextResponse.json({ error: "Product id is required." }, { status: 200 });
  }

  const response = await fetch(apiUrl(`/shop/products/${encodeURIComponent(itId)}`), {
    cache: "no-store",
    headers: requestHeaders(request),
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<Product> | null;
  if (!response.ok || !envelope?.success || !envelope.data) {
    return NextResponse.json({
      error: envelope?.message || response.statusText || "Product not found.",
    }, { status: 200 });
  }

  const product = envelope.data;
  if (String(product.it_soldout || "0") === "1" || String(product.it_tel_inq || "0") === "1") {
    return NextResponse.json({ error: "Product is not available for purchase." }, { status: 200 });
  }

  const options = Array.isArray(product.options) ? product.options : [];
  const baseOptions = options.filter((option) => Number(option.io_type || 0) === 0 && Number(option.io_use ?? 1) === 1);
  const html = renderOptionForm(product, baseOptions);

  return NextResponse.json({
    error: "",
    option: baseOptions.length > 0 ? 1 : 0,
    html,
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

async function postApi(request: NextRequest, endpoint: string, params: URLSearchParams) {
  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    cache: "no-store",
    headers: {
      ...requestHeaders(request),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope | null;

  return {
    ok: response.ok && envelope?.success !== false,
    message: envelope?.message || response.statusText || "The requested shop action failed.",
    response,
  };
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

function requestHeaders(request: NextRequest) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  const cookie = request.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function renderCartBox(items: CartItem[], totals?: CartPayload) {
  if (items.length === 0) {
    return '<div id="sbsk" class="sbsk_empty">Cart is empty.</div>';
  }

  const rows = items.map((item) => `
    <li data-ct-id="${escapeHtml(String(item.ct_id || ""))}">
      <a href="/shop/${escapeHtml(encodeURIComponent(String(item.it_id || "")))}">${escapeHtml(String(item.it_name || ""))}</a>
      <span class="qty">${Number(item.ct_qty || 0).toLocaleString("ko-KR")}</span>
      <span class="price">${formatNumber(Number(item.line_total || 0))}</span>
    </li>`).join("");

  return `
<div id="sbsk" class="sbsk_box">
  <ul>${rows}</ul>
  <div class="total">Total ${formatNumber(Number(totals?.total_price || 0))} / ${Number(totals?.total_qty || 0).toLocaleString("ko-KR")}</div>
</div>`.trim();
}

function renderWishBox(items: Array<{ it_id?: string; it_name?: string }>) {
  if (items.length === 0) {
    return '<div id="stv" class="stv_empty">Wishlist is empty.</div>';
  }

  return `
<div id="stv" class="stv_box">
  <ul>
    ${items.map((item) => `<li><a href="/shop/${escapeHtml(encodeURIComponent(String(item.it_id || "")))}">${escapeHtml(String(item.it_name || ""))}</a></li>`).join("")}
  </ul>
</div>`.trim();
}

function renderOptionForm(product: Product, options: ProductOption[]) {
  const id = String(product.it_id || "");
  const minQty = Math.max(1, Number(product.it_buy_min_qty || 1) || 1);
  const optionRows = options.length > 0
    ? options.map((option) => {
      const ioId = String(option.io_id || "");
      const label = `${ioId.replace(/\u001e/g, " / ")}${Number(option.io_price || 0) ? ` (${formatNumber(Number(option.io_price || 0))})` : ""}`;
      return `<option value="${escapeHtml(ioId)}">${escapeHtml(label)}</option>`;
    }).join("")
    : `<option value="">Default</option>`;

  return `
<div class="sct_cartop_wr">
  <form name="fcart" method="post" action="/shop/ajax.action.php">
    <input type="hidden" name="action" value="cart_update">
    <input type="hidden" name="it_id[]" value="${escapeHtml(id)}">
    <input type="hidden" name="sw_direct" value="0">
    <label class="sound_only" for="legacy_io_${escapeHtml(id)}">Option</label>
    <select id="legacy_io_${escapeHtml(id)}" name="io_id[${escapeHtml(id)}][]">${optionRows}</select>
    <input type="hidden" name="io_type[${escapeHtml(id)}][]" value="0">
    <input type="hidden" name="io_value[${escapeHtml(id)}][]" value="">
    <input type="number" name="ct_qty[${escapeHtml(id)}][]" value="${minQty}" min="1">
    <button type="button" class="cartopt_cart_btn">Add to cart</button>
    <button type="button" class="cartopt_close_btn">Close</button>
  </form>
</div>`.trim();
}

function jsonError(message: string) {
  return NextResponse.json({ error: message }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function textResponse(text: string) {
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeAction(value: string) {
  return value.replace(/[^a-z0-9_]/gi, "");
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
