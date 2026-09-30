import { authHeaders, fail } from './local-action-api.mjs';

export function createLocalShopSmokeHelpers({ apiJson, apiOk, smokeProductId }) {
  async function currentCartRows(token, query = '') {
    const payload = await apiJson(`/shop/cart${query}`, {
      headers: authHeaders(token),
    });
    return payload.data?.items || [];
  }

  async function currentGuestCartRows(cookieJar, query = '') {
    const payload = await apiJson(`/shop/cart${query}`, {
      cookieJar,
    });
    return payload.data?.items || [];
  }

  async function getProduct() {
    const payload = await apiJson(`/shop/products/${encodeURIComponent(smokeProductId)}`);
    const product = payload.data;
    if (!product?.it_id) {
      fail('smoke product was not returned by the API', payload);
    }
    if (String(product.it_soldout) === '1' || Number(product.it_stock_qty || 0) <= 0) {
      fail('smoke product is not available for shop smoke checks', product);
    }
    return product;
  }

  function firstUsableOption(product) {
    const option = (product.options || []).find(
      (item) =>
        Number(item.io_type) === 0 &&
        Number(item.io_use ?? 1) === 1 &&
        Number(item.io_stock_qty ?? 0) > 0
    );
    if (!option) return null;
    return {
      ioId: String(option.io_id),
      values: String(option.io_id).split('\x1e'),
    };
  }

  async function cleanupCart(token) {
    await apiOk('/shop/cart', {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  }

  function cartAddBody(product, option, qty, extra = {}) {
    return option
      ? {
          it_id: product.it_id,
          options: [{ io_id: option.ioId, ct_qty: qty }],
          ...extra,
        }
      : {
          it_id: product.it_id,
          ct_qty: qty,
          ...extra,
        };
  }

  function cartIdsFromAddPayload(payload) {
    const data = payload?.data || {};
    return [
      data.ct_id,
      ...((data.items || []).map((item) => item.ct_id)),
    ]
      .filter((id) => id !== undefined && id !== null && String(id) !== '')
      .map((id) => String(id));
  }

  async function setupCartForOrder(token, product) {
    await cleanupCart(token);

    const option = firstUsableOption(product);
    const body = cartAddBody(product, option, 1);

    await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });

    const cart = await apiJson('/shop/cart', {
      headers: authHeaders(token),
    });
    const rows = cart.data?.items || [];
    const row = rows.find((item) => String(item.it_id) === product.it_id);
    if (!row) {
      fail('order setup cart item did not persist through the API', rows);
    }

    return {
      ctId: String(row.ct_id),
      option: option?.ioId || '',
    };
  }

  return {
    cartAddBody,
    cartIdsFromAddPayload,
    cleanupCart,
    currentCartRows,
    currentGuestCartRows,
    firstUsableOption,
    getProduct,
    setupCartForOrder,
  };
}
