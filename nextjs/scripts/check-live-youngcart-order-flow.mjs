import { liveAppUrl, liveExpectedApiUrl } from './lib/live-env.mjs';

const appUrl = liveAppUrl('check-live-youngcart-order-flow');
const apiUrl = liveExpectedApiUrl(appUrl);
const smokeProductId = process.env.LIVE_SMOKE_SHOP_PRODUCT_ID || '1446772772';
const smokeMarker = process.env.LIVE_SMOKE_ORDER_MARKER || 'nextjs-live-order-smoke';
const smokeRunId = `${Date.now()}`;

const STATUS_ORDERED = '\uC8FC\uBB38';
const STATUS_CANCELLED = '\uCDE8\uC18C';
const SETTLE_BANK = '\uBB34\uD1B5\uC7A5\uC785\uAE08';
const SETTLE_CARD = '\uC2E0\uC6A9\uCE74\uB4DC';

const checks = [];

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function record(area, name, ok, detail, hint = '') {
  checks.push({
    area,
    name,
    status: ok ? 'ok' : 'fail',
    detail: detail || '',
    hint: ok ? '' : hint,
  });
}

function apiAbsoluteUrl(path) {
  return `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function createCookieJar() {
  const cookies = new Map();

  return {
    header() {
      return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    },
    store(headers) {
      const values =
        typeof headers.getSetCookie === 'function'
          ? headers.getSetCookie()
          : headers.get('set-cookie')
            ? [headers.get('set-cookie')]
            : [];

      for (const value of values) {
        for (const part of String(value).split(/,(?=[^;=]+=[^;]+)/)) {
          const cookie = part.trim().split(';')[0] || '';
          const separator = cookie.indexOf('=');
          if (separator > 0) {
            const name = cookie.slice(0, separator);
            const cookieValue = cookie.slice(separator + 1);
            if (cookieValue === '') {
              cookies.delete(name);
            } else {
              cookies.set(name, cookieValue);
            }
          }
        }
      }
    },
  };
}

async function fetchApi(path, options = {}) {
  const { cookieJar, ...fetchOptions } = options;
  const cookieHeader = cookieJar?.header?.();
  const response = await fetch(apiAbsoluteUrl(path), {
    ...fetchOptions,
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(fetchOptions.headers || {}),
    },
    redirect: 'manual',
  });
  cookieJar?.store?.(response.headers);

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { response, payload, text };
}

async function apiJson(path, options = {}) {
  const { response, payload, text } = await fetchApi(path, options);

  if (!response.ok || !payload?.success) {
    fail(`API request failed: ${path}`, {
      status: response.status,
      message: payload?.message || text.slice(0, 160) || response.statusText,
      payload,
    });
  }

  return payload;
}

async function apiFailure(path, options = {}, expectedStatus = 400) {
  const { response, payload, text } = await fetchApi(path, options);
  if (response.status !== expectedStatus) {
    fail(`API request should have failed with HTTP ${expectedStatus}: ${path}`, {
      actualStatus: response.status,
      message: payload?.message || text.slice(0, 160) || response.statusText,
      payload,
    });
  }
  return payload;
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
  };
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

async function currentGuestCartRows(cookieJar, query = '') {
  const payload = await apiJson(`/shop/cart${query}`, {
    cookieJar,
  });
  return payload.data?.items || [];
}

async function getSmokeProduct() {
  const payload = await apiJson(`/shop/products/${encodeURIComponent(smokeProductId)}`);
  const product = payload.data || {};
  if (!product.it_id) {
    fail('smoke product was not returned by the live API', payload);
  }
  if (String(product.it_soldout || '0') === '1' || Number(product.it_stock_qty || 0) <= 0) {
    fail('smoke product is not available for live order checks', product);
  }
  return product;
}

function assertCreatedGuestOrder(payload) {
  const orderId = String(payload.data?.od_id || payload.data?.order?.od_id || '');
  const uid = String(payload.data?.uid || payload.data?.order?.uid || '');
  if (!/^[0-9]{8,20}$/.test(orderId) || uid.length !== 64) {
    fail('guest order did not return a valid order id and uid', payload);
  }
  return { orderId, uid };
}

async function checkGuestOrderCreateLookupCancel(product) {
  const option = firstUsableOption(product);
  const guestCartJar = createCookieJar();
  const guestPassword = 'abc123';

  const directAdd = await apiJson('/shop/cart', {
    method: 'POST',
    cookieJar: guestCartJar,
    body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
  });
  const directCtIds = cartIdsFromAddPayload(directAdd);
  if (directCtIds.length === 0) {
    fail('guest direct cart add did not return cart row ids', directAdd);
  }

  record(
    'youngcart order',
    'guest direct cart add',
    directCtIds.length > 0,
    `ct_ids=${directCtIds.join(',')}`,
    'live guest direct-buy cart add must return cart row ids'
  );

  const cart = await apiJson(`/shop/cart?ct_ids=${encodeURIComponent(directCtIds.join(','))}`, {
    cookieJar: guestCartJar,
  });
  const cartRows = cart.data?.items || [];
  record(
    'youngcart order',
    'guest direct cart readable',
    cartRows.length === directCtIds.length,
    `items=${cartRows.length}`,
    'live guest direct-buy cart rows must be readable before order creation'
  );

  const orderPayload = await apiJson('/shop/orders', {
    method: 'POST',
    cookieJar: guestCartJar,
    body: JSON.stringify({
      ct_ids: directCtIds.join(','),
      od_name: 'GuestSmoke',
      od_tel: '02-000-0000',
      od_hp: '010-1234-5678',
      od_email: 'guest-smoke@example.test',
      od_zip: '12345',
      od_addr1: 'Next.js live guest smoke address',
      od_addr2: 'Guest order lookup cancel',
      od_memo: `${smokeMarker} guest ${smokeRunId}`,
      od_settle_case: SETTLE_BANK,
      od_bank_account: 'smoke-bank',
      od_deposit_name: 'GuestSmoke',
      od_pwd: guestPassword,
    }),
  });
  const { orderId, uid: createdUid } = assertCreatedGuestOrder(orderPayload);
  record(
    'youngcart order',
    'guest bank order create',
    true,
    `od_id=${orderId} uid_length=${createdUid.length}`,
    'live guest bank order creation must return a guest uid'
  );

  await apiFailure(
    '/shop/orders/lookup',
    {
      method: 'POST',
      cookieJar: createCookieJar(),
      body: JSON.stringify({
        od_id: orderId,
        od_pwd: 'wrong123',
      }),
    },
    404
  );
  record(
    'youngcart order',
    'guest order lookup rejects wrong password',
    true,
    `od_id=${orderId}`,
    'guest order lookup must not expose orders with a wrong password'
  );

  const lookupPayload = await apiJson('/shop/orders/lookup', {
    method: 'POST',
    cookieJar: createCookieJar(),
    body: JSON.stringify({
      od_id: orderId,
      od_pwd: guestPassword,
    }),
  });
  const lookupUid = String(lookupPayload.data?.uid || '');
  const redirectUrl = String(lookupPayload.data?.redirect_url || '');
  if (lookupUid !== createdUid || !redirectUrl.includes(`uid=${encodeURIComponent(lookupUid)}`)) {
    fail('guest order lookup did not return the expected uid redirect', {
      createdUid,
      lookupPayload,
    });
  }
  record(
    'youngcart order',
    'guest order lookup',
    true,
    `od_id=${orderId} uid_length=${lookupUid.length}`,
    'guest order lookup must return the same uid used by order detail'
  );

  const detail = await apiJson(`/shop/orders/${orderId}?uid=${encodeURIComponent(lookupUid)}`, {
    cookieJar: createCookieJar(),
  });
  const order = detail.data || {};
  const wrongStatusItems = (order.items || []).filter(
    (item) => String(item.ct_status || '') !== STATUS_ORDERED
  );
  if (
    String(order.od_id || '') !== orderId ||
    String(order.mb_id || '') !== '' ||
    !String(order.od_memo || '').includes(smokeMarker) ||
    String(order.od_status || '') !== STATUS_ORDERED ||
    order.can_cancel !== true ||
    String(order.cancel_block_reason || '') !== '' ||
    wrongStatusItems.length > 0
  ) {
    fail('guest order detail did not expose YoungCart cancellable order state', {
      order,
      wrongStatusItems,
    });
  }
  record(
    'youngcart order',
    'guest order detail',
    true,
    `status=${order.od_status} items=${order.items?.length ?? 0}`,
    'guest order detail must expose ordered cart rows and can_cancel=true'
  );

  await apiFailure(
    `/shop/orders/${orderId}`,
    {
      method: 'PATCH',
      cookieJar: createCookieJar(),
      body: JSON.stringify({
        uid: 'wrong-guest-order-uid',
        reason: 'guest order wrong uid cancel smoke',
      }),
    },
    404
  );
  record(
    'youngcart order',
    'guest order cancel rejects wrong uid',
    true,
    `od_id=${orderId}`,
    'guest order cancel must require the lookup uid'
  );

  await apiJson(`/shop/orders/${orderId}`, {
    method: 'PATCH',
    cookieJar: createCookieJar(),
    body: JSON.stringify({
      uid: lookupUid,
      reason: 'guest order cancel smoke',
    }),
  });

  const cancelledDetail = await apiJson(
    `/shop/orders/${orderId}?uid=${encodeURIComponent(lookupUid)}`,
    {
      cookieJar: createCookieJar(),
    }
  );
  const cancelled = cancelledDetail.data || {};
  const notCancelled = (cancelled.items || []).filter(
    (item) => String(item.ct_status || '') !== STATUS_CANCELLED
  );
  if (
    String(cancelled.od_status || '') !== STATUS_CANCELLED ||
    cancelled.can_cancel !== false ||
    notCancelled.length > 0 ||
    Number(cancelled.od_cancel_price || 0) !== Number(cancelled.od_cart_price || 0)
  ) {
    fail('guest order cancel did not persist YoungCart cancellation state', {
      cancelled,
      notCancelled,
    });
  }
  record(
    'youngcart order',
    'guest order cancel',
    true,
    `od_id=${orderId} status=${cancelled.od_status} restored_items=${
      cancelled.items?.length ?? 0
    }`,
    'live guest order cancel must persist cancelled order and cart row state'
  );

  return { orderId, lookupUid, rowCount: directCtIds.length };
}

async function checkGuestPaymentPrepareCancel(product) {
  const option = firstUsableOption(product);
  const guestCartJar = createCookieJar();
  let orderId = '';

  try {
    await apiJson('/shop/cart', {
      method: 'POST',
      cookieJar: guestCartJar,
      body: JSON.stringify(cartAddBody(product, option, 1)),
    });
    const normalRows = await currentGuestCartRows(guestCartJar);
    const normalRow = normalRows.find((row) => String(row.it_id) === String(product.it_id));
    if (!normalRow) {
      fail('guest payment setup did not create a normal cart row', normalRows);
    }
    record(
      'youngcart payment',
      'guest normal cart setup',
      true,
      `ct_id=${normalRow.ct_id}`,
      'normal cart rows must survive a direct-buy payment prepare/cancel round trip'
    );

    const directAdd = await apiJson('/shop/cart', {
      method: 'POST',
      cookieJar: guestCartJar,
      body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
    });
    const directCtIds = cartIdsFromAddPayload(directAdd);
    if (directCtIds.length === 0) {
      fail('guest payment direct cart add did not return cart row ids', directAdd);
    }
    record(
      'youngcart payment',
      'guest payment direct cart add',
      true,
      `ct_ids=${directCtIds.join(',')}`,
      'payment prepare must be able to consume direct-buy cart rows'
    );

    const prepared = await apiJson('/shop/payment/prepare', {
      method: 'POST',
      cookieJar: guestCartJar,
      body: JSON.stringify({
        ct_ids: directCtIds.join(','),
        od_name: 'GuestPaymentSmoke',
        od_tel: '02-000-0000',
        od_hp: '010-1234-5678',
        od_email: 'guest-payment-smoke@example.test',
        od_zip: '12345',
        od_addr1: 'Next.js live guest payment smoke address',
        od_addr2: 'Guest payment prepare cancel',
        od_memo: `${smokeMarker} guest-payment ${smokeRunId}`,
        od_settle_case: SETTLE_CARD,
        od_pwd: 'abc123',
      }),
    });

    orderId = String(prepared.data?.order_id || '');
    const uid = String(prepared.data?.uid || '');
    const amount = Number(prepared.data?.amount || 0);
    if (!/^[0-9]{8,20}$/.test(orderId) || uid.length !== 64 || amount <= 0) {
      fail('guest payment prepare did not return a valid order id, uid, and amount', prepared);
    }
    record(
      'youngcart payment',
      'guest payment prepare',
      true,
      `od_id=${orderId} uid_length=${uid.length} amount=${amount}`,
      'live payment prepare must create a draft order without requiring PG confirmation'
    );

    await apiFailure(
      '/shop/payment/cancel',
      {
        method: 'POST',
        cookieJar: createCookieJar(),
        body: JSON.stringify({
          order_id: orderId,
          reason: 'untrusted guest payment cancel smoke',
        }),
      },
      404
    );
    record(
      'youngcart payment',
      'guest payment cancel rejects untrusted cookie',
      true,
      `od_id=${orderId}`,
      'guest payment cancel must require the prepare session cookie'
    );

    const detail = await apiJson(`/shop/orders/${orderId}?uid=${encodeURIComponent(uid)}`, {
      cookieJar: createCookieJar(),
    });
    const order = detail.data || {};
    if (String(order.od_id || '') !== orderId || String(order.od_status || '') === '') {
      fail('guest prepared payment order detail was not visible with uid', order);
    }
    record(
      'youngcart payment',
      'guest prepared order detail',
      true,
      `status=${order.od_status} items=${order.items?.length ?? 0}`,
      'prepared guest payment orders must remain inspectable by uid before cancel'
    );

    const cancelled = await apiJson('/shop/payment/cancel', {
      method: 'POST',
      cookieJar: guestCartJar,
      body: JSON.stringify({
        order_id: orderId,
        reason: 'guest payment prepare cancel smoke',
      }),
    });
    if (String(cancelled.data?.status || '') !== STATUS_CANCELLED) {
      fail('guest payment cancel did not return cancelled status', cancelled);
    }
    record(
      'youngcart payment',
      'guest payment cancel',
      true,
      `od_id=${orderId} restored=${cancelled.data?.restored ?? '(missing)'}`,
      'prepared payment cancellation must mark the draft order cancelled'
    );

    const restoredDirectRows = await currentGuestCartRows(
      guestCartJar,
      `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
    );
    if (restoredDirectRows.length !== directCtIds.length) {
      fail('guest payment cancel did not restore direct-buy cart rows', {
        directCtIds,
        restoredDirectRows,
      });
    }
    record(
      'youngcart payment',
      'guest payment restores direct cart',
      true,
      `restored=${restoredDirectRows.length}`,
      'cancelled draft payments must restore direct-buy cart rows for retry'
    );

    const visibleRows = await currentGuestCartRows(guestCartJar);
    if (!visibleRows.some((row) => String(row.ct_id) === String(normalRow.ct_id))) {
      fail('guest payment cancel consumed the normal cart row', {
        normalRow,
        visibleRows,
      });
    }
    record(
      'youngcart payment',
      'guest payment preserves normal cart',
      true,
      `visible=${visibleRows.length}`,
      'direct-buy payment cancel must not consume existing normal cart rows'
    );

    await fetchApi('/shop/cart', {
      method: 'DELETE',
      cookieJar: guestCartJar,
    });
  } catch (error) {
    if (orderId) {
      try {
        await fetchApi('/shop/payment/cancel', {
          method: 'POST',
          cookieJar: guestCartJar,
          body: JSON.stringify({
            order_id: orderId,
            reason: 'cleanup failed live payment prepare smoke',
          }),
        });
      } catch {
        // Best-effort cleanup only; keep the original failure visible.
      }
    }
    throw error;
  }
}

try {
  const product = await getSmokeProduct();
  record(
    'youngcart order',
    'smoke product available',
    Boolean(product?.it_id),
    `product=${product.it_id} stock=${product.it_stock_qty ?? '(missing)'}`,
    'live YoungCart smoke product must be public and in stock before order flow'
  );
  await checkGuestOrderCreateLookupCancel(product);
  await checkGuestPaymentPrepareCancel(product);
} catch (error) {
  record(
    'youngcart order',
    'unexpected error',
    false,
    error.message,
    error.details ? JSON.stringify(error.details) : ''
  );
}

console.table(
  checks.map(({ area, name, status, detail }) => ({
    area,
    check: name,
    status,
    detail,
  }))
);

const failures = checks.filter((check) => check.status === 'fail');
if (failures.length > 0) {
  console.error(`[check-live-youngcart-order-flow] ${failures.length} issue(s) found for ${appUrl}`);
  for (const failure of failures) {
    console.error(`- [${failure.area}] ${failure.name}: ${failure.detail}`);
    if (failure.hint) {
      console.error(`  hint: ${failure.hint}`);
    }
  }
  process.exit(1);
}

console.log(
  `[check-live-youngcart-order-flow] live YoungCart guest order lookup/cancel flow passed for ${appUrl}`
);
