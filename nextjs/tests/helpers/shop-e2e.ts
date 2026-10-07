import { request as pwRequest, type APIRequestContext, type TestInfo } from '@playwright/test';

export interface ShopSmokeProductOption {
  io_id?: string | number;
  io_type?: string | number;
  io_stock_qty?: string | number;
  io_use?: string | number;
}

export interface ShopSmokeProduct {
  it_id: string | number;
  it_buy_min_qty?: string | number;
  options?: ShopSmokeProductOption[];
}

export interface ShopSmokeCartItem {
  it_id?: string | number;
  /** 표시 글자(영카트 io_value — "색상:실버") — 줄을 찾을 때는 io_id 를 쓴다. */
  ct_option?: string | number;
  io_id?: string | number;
  ct_qty?: string | number;
}

export const PRIMARY_PRODUCT_ID =
  process.env.SHOP_E2E_PRODUCT_ID ?? process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID ?? '1446772772';
export const OPTION_PRODUCT_ID = process.env.SHOP_E2E_OPTION_PRODUCT_ID ?? '';
export const loginId = process.env.LOCAL_SMOKE_LOGIN_ID || process.env.E2E_LOGIN_ID || '';
export const loginPassword =
  process.env.LOCAL_SMOKE_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || '';

const explicitBase = process.env.PLAYWRIGHT_BASE_URL ?? process.env.LOCAL_APP_URL ?? '';

export function apiBase(testInfo: TestInfo) {
  const projectUse = testInfo.project.use as { baseURL?: string };
  const base = explicitBase || projectUse.baseURL || 'http://localhost';
  return `${String(base).replace(/\/+$/, '')}/api/v1`;
}

export async function login(req: Awaited<ReturnType<typeof pwRequest.newContext>>, api: string) {
  const r = await req.post(`${api}/auth/login`, {
    data: { mb_id: loginId, mb_password: loginPassword },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  const body = await r.json();
  return body.data.token as string;
}

export async function fetchProduct(req: APIRequestContext, api: string, productId: string) {
  const response = await req.get(`${api}/shop/products/${encodeURIComponent(productId)}`);
  if (!response.ok()) {
    throw new Error(`product ${productId} failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  const product = body.data as ShopSmokeProduct | undefined;
  if (!product?.it_id) {
    throw new Error(`product ${productId} payload is missing data.it_id`);
  }
  return product;
}

export function firstUsableBaseOption(product: ShopSmokeProduct) {
  const option = Array.isArray(product?.options)
    ? product.options.find(
        (item) =>
          Number(item?.io_type || 0) === 0 &&
          String(item?.io_use ?? '1') !== '0' &&
          Number(item?.io_stock_qty ?? 0) > 0 &&
          String(item?.io_id || '') !== ''
      )
    : null;
  if (!option) return null;

  return {
    ioId: String(option.io_id),
  };
}

export function smokeQuantity(product: ShopSmokeProduct, requested = 1) {
  const minQty = Number(product?.it_buy_min_qty || 0);
  return Math.max(requested, minQty > 0 ? minQty : 1);
}

export function cartAddBodyForProduct(
  product: ShopSmokeProduct,
  requestedQty = 1,
  extra: Record<string, unknown> = {}
) {
  const qty = smokeQuantity(product, requestedQty);
  const option = firstUsableBaseOption(product);
  if (option) {
    return {
      body: {
        it_id: String(product.it_id),
        options: [{ io_id: option.ioId, ct_qty: qty }],
        ...extra,
      },
      option,
      qty,
    };
  }

  return {
    body: {
      it_id: String(product.it_id),
      ct_qty: qty,
      ...extra,
    },
    option,
    qty,
  };
}

export async function clearCart(
  req: APIRequestContext,
  api: string,
  headers: Record<string, string>
) {
  const response = await req.delete(`${api}/shop/cart`, { headers });
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`cart cleanup failed: ${response.status()} ${await response.text()}`);
  }
}

export async function addFixtureProduct(
  req: APIRequestContext,
  api: string,
  headers: Record<string, string>,
  productId: string,
  qty = 1,
  extra: Record<string, unknown> = {}
) {
  const product = await fetchProduct(req, api, productId);
  const payload = cartAddBodyForProduct(product, qty, extra);
  const response = await req.post(`${api}/shop/cart`, {
    headers,
    data: payload.body,
  });
  if (!response.ok()) {
    throw new Error(`cart add failed: ${response.status()} ${await response.text()}`);
  }

  return {
    product,
    option: payload.option,
    qty: payload.qty,
    data: await response.json(),
  };
}
