import { createLocalShopCartChecks } from './lib/local-shop-cart-checks.mjs';
import { createLocalShopReviewQnaChecks } from './lib/local-shop-review-qna-checks.mjs';
import { createLocalShopSmokeHelpers } from './lib/local-shop-smoke-helpers.mjs';
import {
  assertOkResponse,
  authHeaders,
  createLocalActionApi,
  fail,
  printFailure,
  trimTrailingSlash,
} from './lib/local-action-api.mjs';
import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_LOGIN_ID || 'nextjs_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_LOGIN_PASSWORD || 'NextjsSmoke123!';
const smokeMemberName = process.env.LOCAL_SMOKE_LOGIN_NAME || 'Nextjs Smoke';
const smokeProductId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || '1446772772';
const smokeProductHeadHtmlText = 'NextJS smoke product head html';
const smokeProductTailHtmlText = 'NextJS smoke product tail html';
const smokeProductInfoValueText = 'NextJS smoke product info material';
const smokeReviewSubject = 'NextJS smoke YoungCart review';
const smokeReviewUpdatedSubject = 'NextJS smoke YoungCart review updated';
const smokeQaSubject = 'NextJS smoke YoungCart QNA';
const smokeQaUpdatedSubject = 'Q';
const smokeQaUpdatedQuestion = 'A';
const smokeEventSubject = 'NextJS smoke YoungCart event';
const smokeCouponZoneSubject = 'NextJS smoke YoungCart coupon';
const smokeRestockHpRaw = '01099112233';
const smokeRestockHp = '010-9911-2233';

const {
  apiJson,
  apiOk,
  fetchApi,
  login,
  runPhp: runSeed,
} = createLocalActionApi({
  expectedApiUrl,
  smokeMemberId,
  smokeMemberPassword,
});

const {
  currentCartRows,
  firstUsableOption,
  getProduct,
} = createLocalShopSmokeHelpers({
  apiJson,
  apiOk,
  smokeProductId,
});

async function getRelatedCandidate(productId) {
  const payload = await apiJson('/shop/products?per_page=20');
  const items = payload.data || [];
  const candidate = items.find((item) => String(item.it_id) !== String(productId));
  if (!candidate?.it_id) {
    fail('no usable product was available for related item smoke checks', payload);
  }
  return candidate;
}

async function cleanupCartProduct(token) {
  const rows = await currentCartRows(token);
  for (const row of rows) {
    if (String(row.it_id) !== smokeProductId) continue;
    await apiOk(`/shop/cart/${row.ct_id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  }
}

async function cleanupWishlistProduct(token) {
  const wish = await fetchApi(`/shop/wishlist/check/${encodeURIComponent(smokeProductId)}`, {
    headers: authHeaders(token),
  });
  if (wish.response.ok && wish.payload?.success && wish.payload.data?.wishlisted) {
    await apiOk(`/shop/wishlist/${encodeURIComponent(smokeProductId)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  } else if (!wish.response.ok && wish.response.status !== 404) {
    fail('failed to inspect existing wishlist state before cleanup', {
      status: wish.response.status,
      payload: wish.payload,
    });
  }
}

async function cleanupSmokeReviews(token, productId = smokeProductId) {
  const payload = await apiJson('/shop/reviews/mine?per_page=100', {
    headers: authHeaders(token),
  });
  const rows = payload.data?.items || payload.data || [];
  for (const row of rows) {
    if (
      String(row.it_id) === String(productId) &&
      String(row.is_subject || '').startsWith('NextJS smoke YoungCart review')
    ) {
      await apiOk(`/shop/reviews/${encodeURIComponent(row.is_id)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
    }
  }
}

async function cleanupSmokeQnas(token, productId = smokeProductId) {
  const payload = await apiJson('/shop/reviews/qna/mine?per_page=100', {
    headers: authHeaders(token),
  });
  const rows = payload.data?.items || payload.data || [];
  for (const row of rows) {
    if (
      String(row.it_id) === String(productId) &&
      String(row.iq_subject || '').startsWith('NextJS smoke YoungCart QNA') &&
      !String(row.iq_answer || '').trim()
    ) {
      await apiOk(`/shop/reviews/qna/${encodeURIComponent(row.iq_id)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
    }
  }
}

function cleanupStockSmsProduct(productId = smokeProductId, hp = smokeRestockHp) {
  return runSeed('cleanup_nextjs_smoke_stocksms.php', {}, [
    `--product-id=${productId}`,
    `--hp=${hp}`,
  ]);
}

function cleanupSmokeEvent() {
  return runSeed('set_nextjs_smoke_event.php', {}, ['--cleanup']);
}

function cleanupSmokeCouponZone() {
  return runSeed('set_nextjs_smoke_coupon_zone.php', {}, ['--cleanup']);
}

async function cleanupShopSmoke(token) {
  await cleanupCartProduct(token);
  await cleanupWishlistProduct(token);
  await cleanupSmokeReviews(token);
  await cleanupSmokeQnas(token);
  cleanupStockSmsProduct();
  cleanupSmokeEvent();
  cleanupSmokeCouponZone();
}

const {
  verifyProductOptionSoldoutState,
  verifyShippingPaymentSelection,
  verifyCartFlow,
  verifyCartBuyQtyLimits,
  verifyTelInquiryCartGuard,
  verifyWishlistFlow,
} = createLocalShopCartChecks({
  appUrl,
  smokeRestockHp,
  fail,
  runSeed,
  apiJson,
  apiOk,
  fetchApi,
  authHeaders,
  getProduct,
  firstUsableOption,
  currentCartRows,
  cleanupCartProduct,
  cleanupStockSmsProduct,
  assertOkResponse,
});

const {
  verifyReviewWriteCompatibility,
  verifyQnaWriteCompatibility,
} = createLocalShopReviewQnaChecks({
  smokeMemberName,
  smokeReviewSubject,
  smokeReviewUpdatedSubject,
  smokeQaSubject,
  smokeQaUpdatedSubject,
  smokeQaUpdatedQuestion,
  fail,
  runSeed,
  apiJson,
  apiOk,
  fetchApi,
  authHeaders,
  cleanupSmokeReviews,
  cleanupSmokeQnas,
});

async function verifyProductDetailActionDialogs(page, product) {
  const relatedCandidate = await getRelatedCandidate(product.it_id);
  const previousCustomHtml = runSeed('set_nextjs_smoke_product_custom_html.php', {}, [
    `--product-id=${product.it_id}`,
    `--head=<div>${smokeProductHeadHtmlText}</div>`,
    `--tail=<div>${smokeProductTailHtmlText}</div>`,
  ]);
  let previousProductInfo = null;
  let previousRelation = null;

  try {
    previousRelation = runSeed('set_nextjs_smoke_product_relation.php', {}, [
      `--product-id=${product.it_id}`,
      `--related-id=${relatedCandidate.it_id}`,
    ]);
    previousProductInfo = runSeed('set_nextjs_smoke_product_info.php', {}, [
      `--product-id=${product.it_id}`,
      '--gubun=wear',
      '--key=material',
      `--value=${smokeProductInfoValueText}`,
    ]);
    const detailPayload = await apiJson(`/shop/products/${encodeURIComponent(product.it_id)}`);
    const relationBackedRelated = (detailPayload.data?.related_items || []).find(
      (item) => String(item.it_id) === String(relatedCandidate.it_id)
    );
    if (!relationBackedRelated) {
      fail('product detail API did not return relation-table related item', {
        product_id: product.it_id,
        related_id: relatedCandidate.it_id,
        related_items: detailPayload.data?.related_items || [],
      });
    }

    await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: product.it_name }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(smokeProductHeadHtmlText).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText(smokeProductTailHtmlText).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText(smokeProductInfoValueText).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('link').filter({ hasText: relatedCandidate.it_name }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    let siblingNavigation = false;
    for (const sibling of [product.prev_item, product.next_item].filter((item) => item?.it_id)) {
    const link = page.getByRole('link').filter({ hasText: sibling.it_name }).first();
    await link.waitFor({ state: 'visible', timeout: 10000 });
    const href = await link.getAttribute('href');
    if (!href || !href.includes('/shop/')) {
      fail('product sibling navigation link has invalid href', { sibling, href });
    }
    siblingNavigation = true;
  }

  // 상세의 메일 추천 단추는 없앴다. 대화상자는 그누보드 itemrecommend 링크와 같은 ?modal=recommend 로 연다.
  await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}?modal=recommend`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '상품 추천 메일 보내기' }).waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.locator('#recommend-to-email').fill('nextjs_recommend_ui@example.test');
  await page.locator('#recommend-content').fill('Next.js product recommend modal smoke');

  const [recommendResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/shop/products/${product.it_id}/recommend`) &&
        response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: /메일 보내기/ }).click(),
  ]);
  await assertOkResponse(recommendResponse, 'product recommend modal');
  await page.getByRole('heading', { name: '상품 추천 메일 보내기' }).waitFor({
    state: 'hidden',
    timeout: 10000,
  });

  const previous = runSeed('set_nextjs_smoke_product_stock.php', {}, [
    `--product-id=${product.it_id}`,
    '--stock=0',
    '--soldout=1',
    '--stock-sms=1',
  ]);

  try {
    cleanupStockSmsProduct(product.it_id, smokeRestockHp);
    const rawStockNotify = await fetchApi(`/shop/products/${product.it_id}/stock-notify`, {
      method: 'POST',
      body: JSON.stringify({
        hp: smokeRestockHpRaw,
        agree: true,
      }),
    });
    if (
      rawStockNotify.response.status !== 201 ||
      rawStockNotify.payload?.success !== true ||
      rawStockNotify.payload?.data?.hp !== smokeRestockHp
    ) {
      fail('product restock notify API did not normalize phone numbers like YoungCart', {
        status: rawStockNotify.response.status,
        payload: rawStockNotify.payload,
      });
    }

    const duplicateStockNotify = await fetchApi(`/shop/products/${product.it_id}/stock-notify`, {
      method: 'POST',
      body: JSON.stringify({
        hp: smokeRestockHp,
        agree: true,
      }),
    });
    if (
      duplicateStockNotify.response.status !== 409 ||
      duplicateStockNotify.payload?.errors?.already_subscribed !== true
    ) {
      fail('product restock notify API did not block duplicate unsent requests like YoungCart', {
        status: duplicateStockNotify.response.status,
        payload: duplicateStockNotify.payload,
      });
    }

    cleanupStockSmsProduct(product.it_id, smokeRestockHp);

    await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: product.it_name }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByRole('button', { name: /재입고 알림 신청/ }).click();
    await page.getByRole('heading', { name: '재입고 알림 신청' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.locator('#restock-hp').fill('010-9911-2233');
    await page.locator('#restock-agree').check({ force: true });

    const [stockNotifyResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/shop/products/${product.it_id}/stock-notify`) &&
          response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /^신청하기$/ }).click(),
    ]);
    await assertOkResponse(stockNotifyResponse, 'product restock notify modal');
    await page.getByRole('heading', { name: '재입고 알림 신청' }).waitFor({
      state: 'hidden',
      timeout: 10000,
    });
  } finally {
    cleanupStockSmsProduct(product.it_id, smokeRestockHp);
    runSeed('set_nextjs_smoke_product_stock.php', {}, [
      `--product-id=${product.it_id}`,
      `--stock=${previous.previous_stock}`,
      `--soldout=${previous.previous_soldout}`,
      `--stock-sms=${previous.previous_stock_sms}`,
    ]);
  }

  return {
    siblingNavigation,
    customProductHtml: true,
    productInfoNotice: true,
    relatedItemsFromRelation: true,
    recommendModal: true,
    restockPhoneNormalized: true,
    restockDuplicateBlocked: true,
    restockModal: true,
  };
  } finally {
    if (previousRelation) {
      runSeed('set_nextjs_smoke_product_relation.php', {}, [
        `--product-id=${product.it_id}`,
        `--restore-csv=${previousRelation.previous_related_csv}`,
      ]);
    }
    if (previousProductInfo) {
      runSeed('set_nextjs_smoke_product_info.php', {}, [
        `--product-id=${product.it_id}`,
        `--raw-gubun=${previousProductInfo.previous_info_gubun}`,
        `--raw-value=${previousProductInfo.previous_info_value}`,
      ]);
    }
    runSeed('set_nextjs_smoke_product_custom_html.php', {}, [
      `--product-id=${product.it_id}`,
      `--head=${previousCustomHtml.previous_head_html}`,
      `--tail=${previousCustomHtml.previous_tail_html}`,
    ]);
  }
}

async function verifyShopPolicyEndpoints() {
  const policyPayload = await apiJson('/shop/policy');
  const policy = policyPayload.data;
  if (!policy || !Array.isArray(policy.shipping_rules)) {
    fail('shop policy endpoint did not return shipping rules', policyPayload);
  }
  if (!Number.isFinite(Number(policy.base_shipping_cost))) {
    fail('shop policy endpoint did not return a numeric base shipping cost', policy);
  }
  if (!Number.isFinite(Number(policy.free_threshold))) {
    fail('shop policy endpoint did not return a numeric free threshold', policy);
  }

  const bannersPayload = await apiJson('/shop/banners');
  if (!Array.isArray(bannersPayload.data)) {
    fail('shop banners endpoint did not return a list', bannersPayload);
  }

  const popupsPayload = await apiJson('/shop/popups');
  if (!Array.isArray(popupsPayload.data)) {
    fail('shop popups endpoint did not return a list', popupsPayload);
  }

  const quote = await fetchApi('/shop/shipping/quote');
  if (quote.response.status === 401) {
    fail('shop shipping quote should be available to guest carts', {
      status: quote.response.status,
      payload: quote.payload,
    });
  }
  if (quote.response.status !== 400 || quote.payload?.message !== 'Cart is empty. Add items before quoting shipping.') {
    fail('guest shipping quote should report an empty cart instead of requiring login', {
      status: quote.response.status,
      payload: quote.payload,
    });
  }

  return {
    policyFreeThreshold: Number(policy.free_threshold),
    policyRules: policy.shipping_rules.length,
    banners: bannersPayload.data.length,
    popups: popupsPayload.data.length,
    quoteAllowsGuestCart: true,
  };
}

async function verifyEventImageCompatibility(page, product) {
  const smokeEvent = runSeed('set_nextjs_smoke_event.php', {}, [
    `--product-id=${product.it_id}`,
  ]);
  const eventId = smokeEvent.event_id;

  try {
    if (!eventId || !smokeEvent.head_image_exists || !smokeEvent.tail_image_exists) {
      fail('smoke event did not create head and tail image files', smokeEvent);
    }

    const payload = await apiJson(`/shop/events/${encodeURIComponent(eventId)}`);
    const event = payload.data || {};
    const products = event.products || [];
    if (
      String(event.ev_subject || '') !== smokeEventSubject ||
      !String(event.ev_head_image_url || '').includes(`event/${eventId}_h`) ||
      !String(event.ev_tail_image_url || '').includes(`event/${eventId}_t`) ||
      !products.find((item) => String(item.it_id) === String(product.it_id))
    ) {
      fail('event API did not expose YoungCart event head/tail images and mapped products', {
        event,
        smokeEvent,
      });
    }

    await page.goto(`${appUrl}/shop/events/${encodeURIComponent(eventId)}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: smokeEventSubject }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText('NextJS smoke event head html').waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText('NextJS smoke event tail html').waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.locator(`img[src*="/data/event/${eventId}_h"]`).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.locator(`img[src*="/data/event/${eventId}_t"]`).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    return {
      eventHeadImage: true,
      eventTailImage: true,
      eventMappedProduct: true,
    };
  } finally {
    cleanupSmokeEvent();
  }
}

async function verifyCouponZoneCompatibility(page, token, product) {
  const smokeCoupon = runSeed('set_nextjs_smoke_coupon_zone.php', {}, [
    `--product-id=${product.it_id}`,
  ]);
  const couponZoneId = smokeCoupon.cz_id;

  try {
    if (!couponZoneId || !smokeCoupon.cz_file) {
      fail('smoke coupon zone was not created', smokeCoupon);
    }

    const zonePayload = await apiJson('/shop/coupons/zone', {
      headers: authHeaders(token),
    });
    const zones = zonePayload.data || [];
    const zone = zones.find((item) => Number(item.cz_id) === Number(couponZoneId));
    if (
      !zone ||
      String(zone.cz_subject || '') !== smokeCouponZoneSubject ||
      !String(zone.image_url || '').includes(`/data/coupon/${smokeCoupon.cz_file}`) ||
      String(zone.target_label || '') !== '개별상품할인' ||
      String(zone.target_name || '') !== String(product.it_name) ||
      Number(zone.cp_price) !== Number(smokeCoupon.cp_price) ||
      Number(zone.cp_minimum) !== Number(smokeCoupon.cp_minimum) ||
      zone.downloaded !== false
    ) {
      fail('coupon zone API did not expose YoungCart coupon image and target metadata', {
        zone,
        smokeCoupon,
      });
    }

    await page.goto(`${appUrl}/shop/couponzone`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: '다운로드 쿠폰' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(smokeCouponZoneSubject).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.locator(`img[src*="/data/coupon/${smokeCoupon.cz_file}"]`).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(product.it_name).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const download = await fetchApi('/shop/coupons/download', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ cz_id: couponZoneId }),
    });
    if (
      download.response.status !== 201 ||
      download.payload?.success !== true ||
      download.payload?.data?.cp_end !== smokeCoupon.expected_cp_end
    ) {
      fail('coupon zone download did not follow YoungCart issue-period calculation', {
        status: download.response.status,
        payload: download.payload,
        smokeCoupon,
      });
    }

    const duplicate = await fetchApi('/shop/coupons/download', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ cz_id: couponZoneId }),
    });
    if (
      duplicate.response.status !== 400 ||
      duplicate.payload?.message !== '이미 다운로드하신 쿠폰입니다.'
    ) {
      fail('coupon zone duplicate download was not blocked like YoungCart', {
        status: duplicate.response.status,
        payload: duplicate.payload,
      });
    }

    const afterDownloadPayload = await apiJson('/shop/coupons/zone', {
      headers: authHeaders(token),
    });
    const downloadedZone = (afterDownloadPayload.data || []).find(
      (item) => Number(item.cz_id) === Number(couponZoneId)
    );
    if (!downloadedZone || downloadedZone.downloaded !== true) {
      fail('coupon zone list did not mark a downloaded coupon', downloadedZone);
    }

    const myCoupons = await apiJson('/shop/coupons', {
      headers: authHeaders(token),
    });
    const issuedCoupon = (myCoupons.data || []).find(
      (item) => String(item.cp_id) === String(download.payload.data?.cp_id)
    );
    if (
      !issuedCoupon ||
      String(issuedCoupon.cp_start) !== String(smokeCoupon.expected_cp_start) ||
      String(issuedCoupon.cp_end) !== String(smokeCoupon.expected_cp_end)
    ) {
      fail('issued coupon was not stored with the expected YoungCart validity period', {
        issuedCoupon,
        smokeCoupon,
      });
    }

    return {
      couponZoneImage: true,
      couponZoneTarget: true,
      couponZoneDownloaded: true,
      couponZoneDuplicateBlocked: true,
      couponZonePeriod: true,
    };
  } finally {
    cleanupSmokeCouponZone();
  }
}

let browser = null;
let credentials = null;
let exitCode = 0;

try {
  runSeed('seed_nextjs_smoke_user.php');
  credentials = await login();
  const product = await getProduct();
  await cleanupShopSmoke(credentials.token);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);

  const page = await context.newPage();
  const results = [];
  results.push(await verifyShopPolicyEndpoints());
  results.push(await verifyEventImageCompatibility(page, product));
  results.push(await verifyCouponZoneCompatibility(page, credentials.token, product));
  results.push(await verifyProductOptionSoldoutState(page, product));
  results.push(await verifyShippingPaymentSelection(page, credentials.token, product));
  results.push(await verifyCartFlow(page, credentials.token, product));
  results.push(await verifyCartBuyQtyLimits(credentials.token, product));
  results.push(await verifyTelInquiryCartGuard(credentials.token, product));
  results.push(await verifyWishlistFlow(page, credentials.token, product));
  results.push(await verifyReviewWriteCompatibility(credentials.token, product));
  results.push(await verifyQnaWriteCompatibility(credentials.token, product));
  results.push(await verifyProductDetailActionDialogs(page, product));
  await context.close();

  console.table(results);
  console.log(`[check-local-shop-actions] app=${appUrl}`);
  console.log(`[check-local-shop-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (credentials?.token) {
    try {
      await cleanupShopSmoke(credentials.token);
    } catch (error) {
      printFailure(error, 'check-local-shop-actions cleanup');
      exitCode = 1;
    }
  }
  try {
    runSeed('seed_nextjs_smoke_user.php');
  } catch (error) {
    printFailure(error, 'check-local-shop-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
