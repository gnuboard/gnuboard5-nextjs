import { authHeaders, createCookieJar, fail } from './local-action-api.mjs';

const SETTLE_CARD = '\uC2E0\uC6A9\uCE74\uB4DC';

export async function verifyCrossSiteGuestCookiePolicy({
  product,
  firstUsableOption,
  fetchApi,
  apiOk,
  cartAddBody,
  smokeCrossSiteOrigin,
}) {
  const option = firstUsableOption(product);
  const cookieJar = createCookieJar();
  const { response, payload } = await fetchApi('/shop/cart', {
    method: 'POST',
    cookieJar,
    headers: {
      Origin: smokeCrossSiteOrigin,
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify(cartAddBody(product, option, 1)),
  });

  try {
    if (!response.ok || !payload?.success) {
      fail('cross-site guest cart cookie setup failed', {
        status: response.status,
        payload,
      });
    }

    const setCookie = response.headers.get('set-cookie') || '';
    if (!/SameSite=None/i.test(setCookie) || !/(^|;\s*)Secure(?:;|$)/i.test(setCookie)) {
      fail('cross-site guest cookie did not use SameSite=None; Secure', {
        origin: smokeCrossSiteOrigin,
        setCookie,
      });
    }

    return {
      crossSiteGuestCookie: 'SameSite=None; Secure',
      crossSiteOrigin: smokeCrossSiteOrigin,
    };
  } finally {
    await apiOk('/shop/cart', {
      method: 'DELETE',
      cookieJar,
    }).catch(() => null);
  }
}

export async function verifyOrderStockRevalidation({
  token,
  product,
  cleanupCart,
  firstUsableOption,
  apiJson,
  apiFailure,
  cartAddBody,
  cartIdsFromAddPayload,
  setSmokeStock,
  smokeMemberId,
  smokeMarker,
  smokeRunId,
}) {
  await cleanupCart(token);

  const option = firstUsableOption(product);
  let stockSnapshot = null;
  try {
    const directAdd = await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
    });
    const directCtIds = cartIdsFromAddPayload(directAdd);
    if (directCtIds.length === 0) {
      fail('stock revalidation setup did not return direct cart row ids', directAdd);
    }

    stockSnapshot = setSmokeStock(product, option, 0);
    const failure = await apiFailure('/shop/orders', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        ct_ids: directCtIds.join(','),
        od_name: 'NextjsSmoke',
        od_tel: '02-000-0000',
        od_hp: '010-1234-5678',
        od_email: `${smokeMemberId}@example.test`,
        od_zip: '12345',
        od_addr1: 'Next.js smoke address',
        od_addr2: 'Stock revalidation',
        od_memo: `${smokeMarker} stock-revalidation ${smokeRunId}`,
        od_settle_case: SETTLE_CARD,
      }),
    });

    const message = String(failure?.message || '');
    if (!message.includes('재고수량')) {
      fail('stock revalidation failure did not return a stock shortage message', failure);
    }

    return {
      stockRevalidation: option ? 'option' : 'product',
      stockFailureStatus: 400,
    };
  } finally {
    if (stockSnapshot) {
      setSmokeStock(product, option, Number(stockSnapshot.previous_stock || 0));
    }
    await cleanupCart(token);
  }
}
