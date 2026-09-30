import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

const TOKEN_COOKIE = "g5_token";
const OPTION_SEPARATOR = "\x1e";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type ShopProductOption = {
  io_id?: string;
  io_type?: number | string;
  io_price?: number | string;
  io_stock_qty?: number | string;
  io_use?: number | string;
};

type ShopProduct = {
  it_id?: string;
  it_name?: string;
  it_price?: number | string;
  it_stock_qty?: number | string;
  it_option_subject?: string;
  it_supply_subject?: string;
  it_buy_min_qty?: number | string;
  it_buy_max_qty?: number | string;
  options?: ShopProductOption[];
};

type ShopCartItem = {
  ct_id?: string | number;
  it_id?: string;
  it_name?: string;
  ct_price?: number | string;
  ct_base_price?: number | string;
  ct_qty?: number | string;
  ct_option?: string;
  io_type?: number | string;
  io_price?: number | string;
  ct_send_cost?: number | string;
};

type ShopCartResponse = {
  items?: ShopCartItem[];
};

export async function legacyOptionParams(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);

  if (request.method !== "GET") {
    try {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") {
          params.append(key, value);
        }
      });
    } catch {
      // Query-string fallback covers non-form legacy requests.
    }
  }

  return params;
}

export async function renderLegacyItemOptionResponse(request: NextRequest) {
  const params = await legacyOptionParams(request);
  const itId = cleanId(params.get("it_id") || "");
  if (!itId) return legacyTextResponse("");

  const product = await fetchProduct(request, itId);
  if (!product?.it_id) return legacyTextResponse("");

  const optId = String(params.get("opt_id") || "");
  const idx = Math.max(0, Number.parseInt(params.get("idx") || "0", 10) || 0);
  const selCount = Math.max(0, Number.parseInt(params.get("sel_count") || "0", 10) || 0);
  const opTitle = String(params.get("op_title") || "").trim();

  return legacyTextResponse(renderNextOptionOptions(product, optId, idx, selCount, opTitle));
}

export async function renderLegacyCartOptionResponse(request: NextRequest) {
  const params = await legacyOptionParams(request);
  const itId = cleanId(params.get("it_id") || "");
  if (!itId) return legacyTextResponse("no-item");

  const [product, cart] = await Promise.all([
    fetchProduct(request, itId),
    fetchCart(request),
  ]);

  if (!product?.it_id) return legacyTextResponse("no-item");

  const rows = (cart?.items ?? []).filter((item) => String(item.it_id || "") === itId);
  if (rows.length === 0) return legacyTextResponse("no-cart");

  return legacyHtmlResponse(renderCartOptionForm(product, rows));
}

function renderNextOptionOptions(
  product: ShopProduct,
  optId: string,
  idx: number,
  selCount: number,
  opTitle: string
) {
  const subjects = splitSubjects(product.it_option_subject);
  const title = opTitle && opTitle !== "Select" && subjects[idx + 1]
    ? subjects[idx + 1]
    : "Select";
  const prefix = optId ? `${optId}${OPTION_SEPARATOR}` : "";
  const key = idx + 1;
  const seen = new Set<string>();
  const options = [`<option value="">${escapeHtml(title)}</option>`];

  for (const option of product.options ?? []) {
    if (asNumber(option.io_type) !== 0 || asNumber(option.io_use ?? 1) !== 1) continue;

    const ioId = String(option.io_id || "");
    if (prefix && !ioId.startsWith(prefix)) continue;

    const parts = ioId.split(OPTION_SEPARATOR);
    const label = parts[key] || "";
    if (!label || seen.has(label)) continue;
    seen.add(label);

    if (key + 1 < selCount) {
      options.push(`<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`);
      continue;
    }

    const price = asNumber(option.io_price);
    const stock = asNumber(option.io_stock_qty);
    const priceText = price >= 0
      ? `&nbsp;&nbsp;+ ${formatNumber(price)}원`
      : `&nbsp;&nbsp; ${formatNumber(price)}원`;
    const soldout = stock < 1 ? "&nbsp;&nbsp;[품절]" : "";
    const value = `${label},${price},${stock}`;

    options.push(
      `<option value="${escapeHtml(value)}">${escapeHtml(label)}${priceText}${soldout}</option>`
    );
  }

  return options.join("\n");
}

function renderCartOptionForm(product: ShopProduct, rows: ShopCartItem[]) {
  const first = rows[0] || {};
  const itId = String(product.it_id || "");
  const basePrice = asNumber(first.ct_base_price ?? first.ct_price ?? product.it_price);
  const sendCost = asNumber(first.ct_send_cost);
  const rowHtml = rows.map((row, index) => renderSelectedCartOption(product, row, index)).join("\n");
  const baseOptions = renderBaseOptionSelects(product);
  const supplyOptions = renderSupplyOptionSelect(product);

  return `
<h2>Product option edit</h2>
<form name="foption" method="post" action="/shop/cartupdate.php" onsubmit="return formcheck(this);">
<input type="hidden" name="act" value="optionmod">
<input type="hidden" name="it_id[]" value="${escapeHtml(itId)}">
<input type="hidden" id="it_price" value="${basePrice}">
<input type="hidden" name="ct_send_cost" value="${sendCost}">
<input type="hidden" name="sw_direct">
${baseOptions}
${supplyOptions}
<div id="sit_sel_option">
  <h3>Selected options</h3>
  <ul id="sit_opt_added">
${rowHtml}
  </ul>
</div>
<div id="sit_tot_price"></div>
<div class="btn_confirm">
  <button type="submit" class="btn_submit">OK</button>
  <button type="button" id="mod_option_close" class="btn_close"><span class="sound_only">Close</span></button>
</div>
</form>
<script>
function formcheck(f) {
  var sum_qty = 0;
  var min_qty = parseInt(${asNumber(product.it_buy_min_qty)}, 10) || 0;
  var max_qty = parseInt(${asNumber(product.it_buy_max_qty)}, 10) || 0;
  var qtyInputs = f.querySelectorAll("input[name^='ct_qty']");
  var typeInputs = f.querySelectorAll("input[name^='io_type']");
  for (var i = 0; i < qtyInputs.length; i++) {
    var val = qtyInputs[i].value || "";
    if (!/^[0-9]+$/.test(val) || parseInt(val, 10) < 1) {
      alert("Please enter quantity as a number greater than 0.");
      return false;
    }
    if ((typeInputs[i] && typeInputs[i].value === "0") || !typeInputs[i]) {
      sum_qty += parseInt(val, 10);
    }
  }
  if (min_qty > 0 && sum_qty < min_qty) {
    alert("Please order at least " + min_qty + " selected option items.");
    return false;
  }
  if (max_qty > 0 && sum_qty > max_qty) {
    alert("Please order no more than " + max_qty + " selected option items.");
    return false;
  }
  return true;
}
</script>`.trim();
}

function renderBaseOptionSelects(product: ShopProduct) {
  const subjects = splitSubjects(product.it_option_subject);
  const baseOptions = (product.options ?? []).filter(
    (option) => asNumber(option.io_type) === 0 && asNumber(option.io_use ?? 1) === 1
  );
  if (subjects.length === 0 || baseOptions.length === 0) return "";

  const firstValues = uniqueValues(
    baseOptions.map((option) => String(option.io_id || "").split(OPTION_SEPARATOR)[0] || "")
  );
  const firstOptions = firstValues
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("\n");
  const selects = subjects
    .map((subject, index) => {
      const options = index === 0 ? firstOptions : "";
      return `
    <label class="sound_only" for="it_option_${index}">${escapeHtml(subject)}</label>
    <select id="it_option_${index}" class="it_option" name="it_option[]">
      <option value="">${escapeHtml(subject || "Select")}</option>
${options}
    </select>`.trim();
    })
    .join("\n");

  return `
<section class="option_wr">
  <h3>Product options</h3>
${selects}
</section>`.trim();
}

function renderSupplyOptionSelect(product: ShopProduct) {
  const supplyOptions = (product.options ?? []).filter(
    (option) => asNumber(option.io_type) === 1 && asNumber(option.io_use ?? 1) === 1
  );
  if (supplyOptions.length === 0) return "";

  const subject = splitSubjects(product.it_supply_subject)[0] || "추가 옵션";
  const options = supplyOptions
    .map((option) => {
      const ioId = String(option.io_id || "");
      const label = ioId.replaceAll(OPTION_SEPARATOR, " / ");
      const price = asNumber(option.io_price);
      const stock = asNumber(option.io_stock_qty);
      const priceText = price >= 0 ? ` (+${formatNumber(price)}원)` : ` (${formatNumber(price)}원)`;
      const soldout = stock < 1 ? " [품절]" : "";

      return `<option value="${escapeHtml(`${ioId},${price},${stock}`)}">${escapeHtml(label)}${priceText}${soldout}</option>`;
    })
    .join("\n");

  return `
<section class="option_wr">
  <h3>추가 옵션</h3>
  <label class="sound_only" for="it_supply_0">${escapeHtml(subject)}</label>
  <select id="it_supply_0" class="it_supply" name="it_supply[]">
    <option value="">${escapeHtml(subject)}</option>
${options}
  </select>
</section>`.trim();
}

function renderSelectedCartOption(product: ShopProduct, row: ShopCartItem, index: number) {
  const itId = String(product.it_id || row.it_id || "");
  const ioId = String(row.ct_option || "");
  const ioType = asNumber(row.io_type);
  const ioPrice = asNumber(row.io_price);
  const stock = stockForOption(product, ioId, ioType);
  const qty = Math.max(1, asNumber(row.ct_qty || 1));
  const label = ioId ? ioId.replaceAll(OPTION_SEPARATOR, " / ") : String(product.it_name || "기본 옵션");
  const cls = ioType ? "spl" : "opt";
  const priceText = ioPrice < 0 ? `(${formatNumber(ioPrice)}원)` : `(+${formatNumber(ioPrice)}원)`;

  return `
    <li class="sit_${cls}_list">
      <input type="hidden" name="io_type[${escapeHtml(itId)}][]" value="${ioType}">
      <input type="hidden" name="io_id[${escapeHtml(itId)}][]" value="${escapeHtml(ioId)}">
      <input type="hidden" name="io_value[${escapeHtml(itId)}][]" value="${escapeHtml(ioId || label)}">
      <input type="hidden" class="io_price" value="${ioPrice}">
      <input type="hidden" class="io_stock" value="${stock}">
      <div class="opt_name">
        <span class="sit_opt_subj">${escapeHtml(label)}</span>
      </div>
      <div class="opt_count">
        <button type="button" class="sit_qty_minus btn_frmline"><span class="sound_only">Decrease</span></button>
        <label for="ct_qty_${index}" class="sound_only">Quantity</label>
        <input type="text" name="ct_qty[${escapeHtml(itId)}][]" value="${qty}" id="ct_qty_${index}" class="num_input" size="5">
        <button type="button" class="sit_qty_plus btn_frmline"><span class="sound_only">Increase</span></button>
        <span class="sit_opt_prc">${priceText}</span>
        <button type="button" class="sit_opt_del"><span class="sound_only">Delete</span></button>
      </div>
    </li>`.trim();
}

async function fetchProduct(request: NextRequest, itId: string) {
  const envelope = await fetchApi<ShopProduct>(request, `/shop/products/${encodeURIComponent(itId)}`);
  return envelope?.success ? envelope.data : null;
}

async function fetchCart(request: NextRequest) {
  const envelope = await fetchApi<ShopCartResponse>(request, "/shop/cart");
  return envelope?.success ? envelope.data : null;
}

async function fetchApi<T>(request: NextRequest, path: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  if (token) headers.Authorization = `Bearer ${token}`;

  const cookie = request.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    headers,
  });

  return (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
}

function stockForOption(product: ShopProduct, ioId: string, ioType: number) {
  if (!ioId) return Math.max(0, asNumber(product.it_stock_qty || 999999));

  const option = (product.options ?? []).find(
    (item) => String(item.io_id || "") === ioId && asNumber(item.io_type) === ioType
  );

  return Math.max(0, asNumber(option?.io_stock_qty));
}

function legacyHtmlResponse(html: string) {
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function legacyTextResponse(text: string) {
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanId(value: string) {
  return value.replace(/[^0-9a-z_-]/gi, "");
}

function splitSubjects(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
