import { NextRequest, NextResponse } from "next/server";
import { APP_BASE_URL, G5_BASE_URL, apiUrl, g5PathForRuntime } from "@/lib/config";
import { forwardedLegacyCookieHeader } from "@/lib/server/forwarded-cookies";
import { crossSiteRequestMessage } from "@/lib/server/request-guard";

const TOKEN_COOKIE = "g5_token";
const NAVERPAY_REDIRECT_ORIGINS = new Set([
  "https://pay.naver.com",
  "https://m.pay.naver.com",
  "https://test-pay.naver.com",
  "https://test-m.pay.naver.com",
]);

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type NaverPayOrderData = {
  order_id?: string;
  shop_id?: string;
  total_price?: number;
  redirect_url?: string;
};

type NaverPayWishData = {
  shop_id?: string;
  item_ids?: string[];
  redirect_url?: string;
};

type LegacyFormMap = Map<string, string[]>;

export async function legacyNaverPayOrder(request: NextRequest) {
  const blockedMessage = crossSiteRequestMessage(request);
  if (blockedMessage) {
    return legacyNaverPayJsonError(blockedMessage);
  }

  const form = await legacyFormMap(request);
  const payload = buildOrderPayload(request, form);

  if (!payload) {
    return legacyNaverPayJsonError("No Naver Pay items were selected.");
  }

  const { response, envelope } = await postNaverPayApi<NaverPayOrderData>(request, "/shop/naverpay/order", payload);
  if (!response.ok || !envelope?.success) {
    return legacyNaverPayJsonError(envelope?.message || response.statusText || "Naver Pay order registration failed.");
  }

  const data = envelope.data || {};
  const redirectUrl = safeNaverPayRedirectUrl(data.redirect_url || "");
  if (data.redirect_url && !redirectUrl) {
    return legacyNaverPayJsonError("Naver Pay redirect URL is not allowed.");
  }

  return NextResponse.json({
    error: "",
    ORDER_ID: data.order_id || "",
    SHOP_ID: data.shop_id || "",
    TOTAL_PRICE: Number(data.total_price || 0),
    redirect_url: redirectUrl,
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function legacyNaverPayWish(request: NextRequest) {
  const blockedMessage = crossSiteRequestMessage(request);
  if (blockedMessage) {
    return legacyNaverPayAlertClose(blockedMessage);
  }

  const form = await legacyFormMap(request);
  const itIds = uniqueCleanItemIds([
    ...formArray(form, "it_id"),
    ...formArray(form, "ITEM_ID"),
  ]);

  if (itIds.length < 1) {
    return legacyNaverPayAlertClose("No Naver Pay wish items were selected.");
  }

  const { response, envelope } = await postNaverPayApi<NaverPayWishData>(request, "/shop/naverpay/wish", {
    it_ids: itIds,
  });
  if (!response.ok || !envelope?.success || !envelope.data?.redirect_url) {
    return legacyNaverPayAlertClose(envelope?.message || response.statusText || "Naver Pay wish registration failed.");
  }

  const redirectUrl = safeNaverPayRedirectUrl(envelope.data.redirect_url);
  if (!redirectUrl) {
    return legacyNaverPayAlertClose("Naver Pay redirect URL is not allowed.");
  }

  return legacyNaverPayRedirectHtml(redirectUrl);
}

async function legacyFormMap(request: NextRequest) {
  const map: LegacyFormMap = new Map();
  request.nextUrl.searchParams.forEach((value, key) => appendFormValue(map, key, value));

  if (request.method !== "GET") {
    try {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") appendFormValue(map, key, value);
      });
    } catch {
      // Query-string fallback covers non-form legacy requests.
    }
  }

  return map;
}

function appendFormValue(map: LegacyFormMap, key: string, value: string) {
  const current = map.get(key);
  if (current) {
    current.push(value);
  } else {
    map.set(key, [value]);
  }
}

function buildOrderPayload(request: NextRequest, form: LegacyFormMap) {
  const source = firstFormValue(form, "naverpay_form") === "cart.php" ? "cart" : "item";
  const referer = request.headers.get("referer") || "";

  if (source === "cart") {
    const itIds = selectedCartItemIds(form);
    if (itIds.length < 1) return null;
    const fallbackPath = "/shop/cart";
    return {
      source: "cart",
      it_ids: itIds,
      back_url: safeNaverPayBackUrl(request, firstFormValue(form, "back_url") || referer, fallbackPath),
    };
  }

  const itId = cleanItemId(firstFormValue(form, "it_id"));
  if (!itId) return null;
  const options = legacyNaverPayOptions(form, itId);
  const quantity = Number(options[0]?.qty || firstFormValue(form, "ct_qty") || firstFormValue(form, "qty") || 1) || 1;

  const fallbackPath = `/shop/${encodeURIComponent(itId)}`;
  return {
    source: "item",
    it_id: itId,
    quantity,
    options,
    back_url: safeNaverPayBackUrl(request, firstFormValue(form, "back_url") || referer, fallbackPath),
  };
}

function selectedCartItemIds(form: LegacyFormMap) {
  const itemIds = formArray(form, "it_id").map(cleanItemId);
  const checkedIndexes = checkedCartIndexes(form);
  const selected = checkedIndexes.size > 0
    ? itemIds.filter((_, index) => checkedIndexes.has(index))
    : itemIds;
  return uniqueCleanItemIds(selected);
}

function checkedCartIndexes(form: LegacyFormMap) {
  const indexes = new Set<number>();
  for (const [key, values] of form.entries()) {
    const match = /^ct_chk\[(\d+)\]$/.exec(key);
    if (match && values.some(isTruthyFormValue)) {
      indexes.add(Number(match[1]));
    }
  }

  formArray(form, "ct_chk").forEach((value) => {
    const index = Number(value);
    if (Number.isInteger(index) && index >= 0) {
      indexes.add(index);
    }
  });

  return indexes;
}

function legacyNaverPayOptions(form: LegacyFormMap, itId: string) {
  const ioIds = nestedFormArray(form, "io_id", itId);
  const ioTypes = nestedFormArray(form, "io_type", itId);
  const quantities = nestedFormArray(form, "ct_qty", itId);
  const labels = nestedFormArray(form, "io_value", itId);
  const count = Math.max(ioIds.length, ioTypes.length, quantities.length, labels.length);

  if (count < 1) {
    return [{
      io_id: "",
      io_type: 0,
      io_value: "",
      qty: Math.max(1, Number(firstFormValue(form, "ct_qty") || firstFormValue(form, "qty") || 1) || 1),
    }];
  }

  const rows = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({
      io_id: cleanOptionId(ioIds[index] || ""),
      io_type: Number(ioTypes[index] || 0) || 0,
      io_value: labels[index] || "",
      qty: Math.max(1, Number(quantities[index] || 1) || 1),
    });
  }
  return rows;
}

function formArray(form: LegacyFormMap, name: string) {
  const values: string[] = [];
  for (const key of [name, `${name}[]`]) {
    values.push(...(form.get(key) || []));
  }

  const indexed: Array<[number, string]> = [];
  for (const [key, keyValues] of form.entries()) {
    const match = new RegExp(`^${escapeRegExp(name)}\\[(\\d+)\\]$`).exec(key);
    if (match) {
      keyValues.forEach((value) => indexed.push([Number(match[1]), value]));
    }
  }
  indexed.sort((a, b) => a[0] - b[0]).forEach(([, value]) => values.push(value));

  return values;
}

function nestedFormArray(form: LegacyFormMap, name: string, id: string) {
  const values: string[] = [];
  for (const key of [`${name}[${id}][]`, `${name}[${id}]`]) {
    values.push(...(form.get(key) || []));
  }
  return values.length > 0 ? values : formArray(form, name);
}

function firstFormValue(form: LegacyFormMap, name: string) {
  return formArray(form, name)[0] || form.get(name)?.[0] || "";
}

async function postNaverPayApi<T>(request: NextRequest, endpoint: string, payload: unknown) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  const cookie = forwardedLegacyCookieHeader(request);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(payload),
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  return { response, envelope };
}

function safeNaverPayRedirectUrl(value: string) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !NAVERPAY_REDIRECT_ORIGINS.has(url.origin)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function safeNaverPayBackUrl(request: NextRequest, value: string, fallbackPath: string) {
  const fallback = new URL(fallbackPath, request.nextUrl.origin).toString();
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  try {
    const url = new URL(raw, request.nextUrl.origin);
    if (!["http:", "https:"].includes(url.protocol)) {
      return fallback;
    }

    return naverPayBackOrigins(request).has(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function naverPayBackOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  addOrigin(origins, G5_BASE_URL);
  addOrigin(origins, APP_BASE_URL);
  return origins;
}

function addOrigin(origins: Set<string>, value: string) {
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Invalid optional runtime URLs are ignored here; config validation handles G5_BASE_URL.
  }
}

function legacyNaverPayJsonError(message: string) {
  return NextResponse.json({ error: message }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

function legacyNaverPayRedirectHtml(url: string) {
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Naver Pay</title></head>
<body>
<script>
location.replace(${JSON.stringify(url)});
</script>
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

function legacyNaverPayAlertClose(message: string) {
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Naver Pay</title></head>
<body>
<script>
alert(${JSON.stringify(message)});
try { window.close(); } catch { /* Ignore browsers that block scripted popup close. */ }
history.length > 1 ? history.back() : location.replace(${JSON.stringify(g5PathForRuntime("/shop"))});
</script>
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

function uniqueCleanItemIds(values: string[]) {
  return Array.from(new Set(values.map(cleanItemId).filter(Boolean)));
}

function cleanItemId(value: string) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function cleanOptionId(value: string) {
  return String(value || "").replace(/[\0"'\\]/g, "");
}

function isTruthyFormValue(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "no";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
