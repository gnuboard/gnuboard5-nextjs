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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_SHOP_CONTENT_LOGIN_ID || 'nextjs_shop_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_SHOP_CONTENT_LOGIN_PASSWORD || 'NextjsShopSmoke123!';
const smokeProductId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || '1446772772';
const smokeMarker =
  process.env.LOCAL_SMOKE_SHOP_CONTENT_MARKER || 'nextjs-local-shop-content-smoke';
const smokeRunId = `${Date.now()}`;

const SETTLE_BANK = '\uBB34\uD1B5\uC7A5';

const {
  apiJson,
  apiOk,
  expectApiStatus,
  fetchApi,
  login,
  runPhp,
} = createLocalActionApi({
  expectedApiUrl,
  smokeMemberId,
  smokeMemberPassword,
  smokeMarker,
  phpEnv: {
    LOCAL_SMOKE_LOGIN_EMAIL: `${smokeMemberId}@example.test`,
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Shop Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsShopSmoke',
    LOCAL_SMOKE_SHOP_CONTENT_MARKER: smokeMarker,
    LOCAL_SMOKE_SHOP_PRODUCT_ID: smokeProductId,
  },
});

function cleanupOrders(orderId = '') {
  const args = orderId ? [`--order-id=${orderId}`] : [];
  return runPhp('cleanup_nextjs_smoke_orders.php', {}, args);
}

function cleanupShopContent() {
  return runPhp('cleanup_nextjs_smoke_shop_content.php');
}

async function getProduct() {
  const payload = await apiJson(`/shop/products/${encodeURIComponent(smokeProductId)}`);
  const product = payload.data;
  if (!product?.it_id) {
    fail('smoke product was not returned by the API', payload);
  }
  if (String(product.it_soldout) === '1' || Number(product.it_stock_qty || 0) <= 0) {
    fail('smoke product is not available for shop content checks', product);
  }
  return product;
}

function verifyProductImageContract(product) {
  const productsPhpPath = fileURLToPath(new URL('../../api/v1/shop/products.php', import.meta.url));
  const productsPhp = readFileSync(productsPhpPath, 'utf8');

  if (!productsPhp.includes('function api_shop_item_image_urls')) {
    fail('product API does not expose the Youngcart image URL helper');
  }
  if (!/for\s*\(\s*\$i\s*=\s*1\s*;\s*\$i\s*<=\s*10\s*;\s*\$i\+\+\s*\)/.test(productsPhp)) {
    fail('product API does not scan Youngcart it_img1..it_img10 fields');
  }

  const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  if (images.length > 10) {
    fail('product API returned more than Youngcart image slots', { images });
  }
  if (images.length > 0 && product.image_url !== images[0]) {
    fail('product API image_url is not the first image slot', {
      image_url: product.image_url,
      firstImage: images[0],
      images,
    });
  }
}

async function getShopPolicy() {
  const payload = await apiJson('/shop/policy');
  return payload.data || {};
}

async function verifyProductAuxiliaryPolicy(product) {
  await expectApiStatus(
    `/shop/products/${encodeURIComponent(product.it_id)}/recommend`,
    401,
    {
      method: 'POST',
      body: JSON.stringify({
        to_email: 'nextjs_recommend_smoke@example.test',
        subject: 'Next.js recommend smoke',
        content: `${smokeMarker} unauth recommend ${smokeRunId}`,
      }),
    },
    'unauthenticated product recommend'
  );

  await expectApiStatus(
    `/shop/products/${encodeURIComponent(product.it_id)}/stock-notify`,
    409,
    {
      method: 'POST',
      body: JSON.stringify({ hp: '010-1234-5678' }),
    },
    'in-stock product restock SMS'
  );
}

function firstUsableOption(product) {
  const option = (product.options || []).find(
    (item) =>
      Number(item.io_type) === 0 &&
      Number(item.io_use ?? 1) === 1 &&
      Number(item.io_stock_qty ?? 0) > 0
  );
  return option ? String(option.io_id) : '';
}

async function cleanupCart(token) {
  await apiOk('/shop/cart', {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

async function createSmokeOrder(token, product) {
  await cleanupCart(token);

  const optionId = firstUsableOption(product);
  const cartBody = optionId
    ? { it_id: product.it_id, options: [{ io_id: optionId, ct_qty: 1 }] }
    : { it_id: product.it_id, ct_qty: 1 };

  await apiJson('/shop/cart', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(cartBody),
  });

  const orderPayload = await apiJson('/shop/orders', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      od_name: 'ShopSmoke',
      od_tel: '02-000-0000',
      od_hp: '010-1234-5678',
      od_email: `${smokeMemberId}@example.test`,
      od_zip: '12345',
      od_addr1: 'Next.js smoke address',
      od_addr2: 'Shop content flow',
      od_memo: `${smokeMarker} order ${smokeRunId}`,
      od_settle_case: SETTLE_BANK,
      od_bank_account: 'Smoke Bank',
      od_deposit_name: 'ShopSmoke',
    }),
  });

  const orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
  if (!/^[0-9]{8,20}$/.test(orderId)) {
    fail('shop content smoke order did not return an order id', orderPayload.data);
  }

  return orderId;
}

async function expectReviewCreateStatus(token, product, expectedStatus, label) {
  const { response, payload } = await fetchApi('/shop/reviews', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      it_id: product.it_id,
      is_subject: `${smokeMarker} blocked ${label} ${smokeRunId}`,
      is_content: `${smokeMarker} blocked review ${label} ${smokeRunId}`,
      is_score: 5,
    }),
  });

  if (response.status !== expectedStatus) {
    fail(`review create status mismatch for ${label}`, {
      expectedStatus,
      actualStatus: response.status,
      payload,
    });
  }

  return payload;
}

async function submitReviewInBrowser(page, token, product, policy) {
  const subject = `${smokeMarker} review ${smokeRunId}`;
  const content = `${smokeMarker} review body ${smokeRunId}`;

  await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('heading', { name: product.it_name }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const detailTabs = page.locator('.mt-12.border-t.pt-8 > .flex.border-b > button');
  await detailTabs.nth(1).click();
  const tabPanel = page.locator('.mt-12.border-t.pt-8 .py-6').first();
  await tabPanel.locator('button').first().click();

  const form = tabPanel.locator('form').last();
  await form.locator('input[type="text"]').first().fill(subject);
  await form.locator('textarea').first().fill(content);

  const [reviewResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/shop/reviews') &&
        response.request().method() === 'POST'
    ),
    form.locator('button[type="submit"]').click(),
  ]);
  await assertOkResponse(reviewResponse, 'shop review create');

  const reviews = await apiJson(
    `/shop/reviews?it_id=${encodeURIComponent(product.it_id)}&per_page=50`,
    { headers: authHeaders(token) }
  );
  const created = (reviews.data || []).find(
    (item) =>
      item.mb_id === smokeMemberId &&
      item.is_subject === subject &&
      String(item.is_content || '').includes(content)
  );
  if (!created) {
    if (policy?.review_requires_moderation) {
      return {
        reviewId: '',
        reviewSubject: subject,
        reviewSummaryTotal: 0,
        moderated: true,
      };
    }

    fail('shop review create did not persist through the API', reviews.data);
  }

  const summary = await apiJson(`/shop/reviews/summary?it_id=${encodeURIComponent(product.it_id)}`);
  const scores = summary.data?.scores || [];
  const fiveStar = scores.find((item) => Number(item.score) === 5);
  if (
    !Number.isFinite(Number(summary.data?.total)) ||
    !Number.isFinite(Number(summary.data?.average)) ||
    scores.length !== 5 ||
    !fiveStar ||
    Number(fiveStar.count || 0) < 1
  ) {
    fail('shop review summary did not include the created review distribution', summary.data);
  }

  return {
    reviewId: String(created.is_id),
    reviewSubject: subject,
    reviewSummaryTotal: Number(summary.data.total),
  };
}

async function verifyPublicShopReviewListing(page, product, reviewResult) {
  if (reviewResult.moderated) {
    return;
  }

  const publicReviews = await apiJson(
    `/shop/reviews?per_page=50&q=${encodeURIComponent(reviewResult.reviewSubject)}`
  );
  const item = (publicReviews.data || []).find(
    (row) => String(row.is_id) === String(reviewResult.reviewId)
  );
  if (
    !item ||
    item.it_id !== product.it_id ||
    !item.it_name ||
    item.is_subject !== reviewResult.reviewSubject
  ) {
    fail('public shop review list did not include the created review with product info', publicReviews.data);
  }

  await page.goto(`${appUrl}/shop/reviews?q=${encodeURIComponent(reviewResult.reviewSubject)}`, {
    waitUntil: 'networkidle',
  });
  await page.getByText(reviewResult.reviewSubject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.getByText(product.it_name, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
}

async function verifyMyShopReviewManagement(page, token, product, reviewResult) {
  let reviewId = reviewResult.reviewId || '';
  const reviewSubject = reviewResult.reviewSubject;

  if (!reviewId) {
    const mine = await apiJson(
      `/shop/reviews/mine?per_page=50&q=${encodeURIComponent(reviewSubject)}`,
      { headers: authHeaders(token) }
    );
    const pending = (mine.data || []).find(
      (item) =>
        item.mb_id === smokeMemberId &&
        item.it_id === product.it_id &&
        item.is_subject === reviewSubject
    );
    if (!pending || String(pending.is_confirm || '0') === '1') {
      fail('my shop review API did not include the moderated pending review', mine.data);
    }
    reviewId = String(pending.is_id);
  }

  const detail = await apiJson(`/shop/reviews/${encodeURIComponent(reviewId)}`, {
    headers: authHeaders(token),
  });
  if (
    String(detail.data?.is_id) !== reviewId ||
    detail.data?.is_subject !== reviewSubject ||
    detail.data?.it_name === undefined
  ) {
    fail('shop review detail API did not return the created item with product info', detail.data);
  }

  const updatedSubject = `${reviewSubject} updated`;
  const updatedContent = `${smokeMarker} review body updated through API ${smokeRunId}`;
  const patched = await apiJson(`/shop/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({
      is_subject: updatedSubject,
      is_content: updatedContent,
      is_score: 4,
    }),
  });
  if (
    patched.data?.is_subject !== updatedSubject ||
    !String(patched.data?.is_content || '').includes(updatedContent) ||
    Number(patched.data?.is_score || 0) !== 4
  ) {
    fail('shop review update API did not persist the edited fields', patched.data);
  }

  const mineAfterPatch = await apiJson(
    `/shop/reviews/mine?per_page=50&q=${encodeURIComponent(updatedSubject)}`,
    { headers: authHeaders(token) }
  );
  const mineItem = (mineAfterPatch.data || []).find((item) => String(item.is_id) === reviewId);
  if (!mineItem || !mineItem.it_name || Number(mineItem.is_score || 0) !== 4) {
    fail('my shop review API did not include the updated item with product info', mineAfterPatch.data);
  }

  await page.goto(`${appUrl}/mypage/reviews`, { waitUntil: 'networkidle' });
  await page.getByText(updatedSubject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  await apiJson(`/shop/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await expectApiStatus(
    `/shop/reviews/${encodeURIComponent(reviewId)}`,
    404,
    { headers: authHeaders(token) },
    'deleted shop review detail'
  );

  const mineAfterDelete = await apiJson('/shop/reviews/mine?per_page=50', {
    headers: authHeaders(token),
  });
  if ((mineAfterDelete.data || []).some((item) => String(item.is_id) === reviewId)) {
    fail('deleted shop review item still appears in my shop review list', mineAfterDelete.data);
  }
}

async function submitQaInBrowser(page, token, product) {
  const subject = `${smokeMarker} qa ${smokeRunId}`;
  const question = `${smokeMarker} qa body ${smokeRunId}`;
  const qaEmail = `${smokeMemberId}@example.test`;
  const qaHp = '010-1234-5678';

  await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('heading', { name: product.it_name }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const detailTabs = page.locator('.mt-12.border-t.pt-8 > .flex.border-b > button');
  await detailTabs.nth(2).click();
  const tabPanel = page.locator('.mt-12.border-t.pt-8 .py-6').first();
  await tabPanel.locator('button').first().click();

  const form = tabPanel.locator('form').last();
  await form.locator('input[type="text"]').first().fill(subject);
  await form.locator('textarea').first().fill(question);
  await form.locator('input[type="email"]').first().fill(qaEmail);
  await form.locator('input[type="tel"]').first().fill(qaHp);
  await form.locator('input[type="checkbox"]').first().check();

  const [qaResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/shop/reviews/qna') &&
        response.request().method() === 'POST'
    ),
    form.locator('button[type="submit"]').click(),
  ]);
  await assertOkResponse(qaResponse, 'shop Q&A create');
  const createPayload = await qaResponse.json();
  if (
    createPayload?.data?.can_edit !== true ||
    createPayload?.data?.can_delete !== true ||
    createPayload?.data?.is_answered !== false ||
    createPayload?.data?.iq_email !== qaEmail ||
    createPayload?.data?.iq_hp !== qaHp
  ) {
    fail('shop Q&A create response did not include owner action flags and contact fields', createPayload);
  }

  const authQas = await apiJson(
    `/shop/reviews/qna?it_id=${encodeURIComponent(product.it_id)}&per_page=50`,
    { headers: authHeaders(token) }
  );
  const created = (authQas.data || []).find(
    (item) =>
      item.mb_id === smokeMemberId &&
      item.iq_subject === subject &&
      String(item.iq_question || '').includes(question)
  );
  if (
    !created ||
    created.can_view === false ||
    created.can_edit !== true ||
    created.can_delete !== true ||
    created.is_answered !== false ||
    created.iq_email !== qaEmail ||
    created.iq_hp !== qaHp
  ) {
    fail('shop Q&A create did not persist for the owner view', authQas.data);
  }

  const publicQas = await apiJson(
    `/shop/reviews/qna?it_id=${encodeURIComponent(product.it_id)}&per_page=50`
  );
  const publicRow = (publicQas.data || []).find(
    (item) => String(item.iq_id) === String(created.iq_id)
  );
  if (
    !publicRow ||
    publicRow.can_view !== false ||
    publicRow.can_edit !== false ||
    publicRow.can_delete !== false ||
    publicRow.iq_question !== '' ||
    publicRow.iq_email !== '' ||
    publicRow.iq_hp !== ''
  ) {
    fail('secret shop Q&A was not hidden from public viewers', publicRow);
  }

  return { qaId: String(created.iq_id), qaSubject: subject, qaQuestion: question };
}

async function verifyPublicShopQaListing(page, token, product, qaResult) {
  const authQas = await apiJson(
    `/shop/reviews/qna?per_page=50&q=${encodeURIComponent(qaResult.qaSubject)}`,
    { headers: authHeaders(token) }
  );
  const item = (authQas.data || []).find((row) => String(row.iq_id) === qaResult.qaId);
  if (
    !item ||
    item.it_id !== product.it_id ||
    !item.it_name ||
    item.iq_subject !== qaResult.qaSubject
  ) {
    fail('public shop Q&A list did not include the created question with product info', authQas.data);
  }

  await page.goto(`${appUrl}/shop/qas?q=${encodeURIComponent(qaResult.qaSubject)}`, {
    waitUntil: 'networkidle',
  });
  await page.getByText(qaResult.qaSubject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.getByText(product.it_name, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
}

async function verifyMyShopQaManagement(page, token, qaResult) {
  const detail = await apiJson(`/shop/reviews/qna/${encodeURIComponent(qaResult.qaId)}`, {
    headers: authHeaders(token),
  });
  if (
    String(detail.data?.iq_id) !== qaResult.qaId ||
    detail.data?.iq_subject !== qaResult.qaSubject ||
    detail.data?.can_edit !== true ||
    detail.data?.can_delete !== true ||
    detail.data?.is_answered !== false
  ) {
    fail('shop Q&A detail API did not return the created item', detail.data);
  }

  const mine = await apiJson(
    `/shop/reviews/qna/mine?status=unanswered&per_page=50&q=${encodeURIComponent(qaResult.qaSubject)}`,
    { headers: authHeaders(token) }
  );
  const mineItem = (mine.data || []).find((item) => String(item.iq_id) === qaResult.qaId);
  if (
    !mineItem ||
    mineItem.iq_answer !== '' ||
    !mineItem.it_name ||
    mineItem.can_edit !== true ||
    mineItem.can_delete !== true ||
    mineItem.is_answered !== false
  ) {
    fail('my shop Q&A API did not include the created unanswered item with product info', mine.data);
  }

  const updatedSubject = `${qaResult.qaSubject} updated`;
  const updatedQuestion = `${qaResult.qaQuestion} updated through API`;
  const updatedEmail = 'updated-shop-qa@example.test';
  const updatedHp = '010-9876-5432';
  const patched = await apiJson(`/shop/reviews/qna/${encodeURIComponent(qaResult.qaId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({
      iq_subject: updatedSubject,
      iq_question: updatedQuestion,
      iq_email: updatedEmail,
      iq_hp: updatedHp,
      iq_secret: 0,
    }),
  });
  if (
    patched.data?.iq_subject !== updatedSubject ||
    patched.data?.iq_question !== updatedQuestion ||
    patched.data?.iq_email !== updatedEmail ||
    patched.data?.iq_hp !== updatedHp ||
    Number(patched.data?.iq_secret || 0) !== 0
  ) {
    fail('shop Q&A update API did not persist the edited fields', patched.data);
  }

  const afterPatch = await apiJson(`/shop/reviews/qna/${encodeURIComponent(qaResult.qaId)}`, {
    headers: authHeaders(token),
  });
  if (
    afterPatch.data?.iq_subject !== updatedSubject ||
    afterPatch.data?.iq_email !== updatedEmail ||
    afterPatch.data?.iq_hp !== updatedHp
  ) {
    fail('shop Q&A detail API did not reflect the updated item', afterPatch.data);
  }

  await page.goto(`${appUrl}/mypage/shop-qas`, { waitUntil: 'networkidle' });
  await page.getByText(updatedSubject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  await apiJson(`/shop/reviews/qna/${encodeURIComponent(qaResult.qaId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await expectApiStatus(
    `/shop/reviews/qna/${encodeURIComponent(qaResult.qaId)}`,
    404,
    { headers: authHeaders(token) },
    'deleted shop Q&A detail'
  );

  const mineAfterDelete = await apiJson('/shop/reviews/qna/mine?per_page=50', {
    headers: authHeaders(token),
  });
  if ((mineAfterDelete.data || []).some((item) => String(item.iq_id) === qaResult.qaId)) {
    fail('deleted shop Q&A item still appears in my shop Q&A list', mineAfterDelete.data);
  }
}

let browser = null;
let credentials = null;
let createdOrderId = '';
let exitCode = 0;

try {
  runPhp('seed_nextjs_smoke_user.php');
  cleanupShopContent();
  cleanupOrders();
  credentials = await login();
  const product = await getProduct();
  verifyProductImageContract(product);
  const policy = await getShopPolicy();
  await verifyProductAuxiliaryPolicy(product);

  const beforePurchase = await expectReviewCreateStatus(
    credentials.token,
    product,
    policy.review_requires_completed_order ? 403 : 201,
    'before-purchase'
  );
  if (!policy.review_requires_completed_order && beforePurchase?.success) {
    cleanupShopContent();
  }

  createdOrderId = await createSmokeOrder(credentials.token, product);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);

  const page = await context.newPage();
  const reviewResult = await submitReviewInBrowser(page, credentials.token, product, policy);
  await verifyPublicShopReviewListing(page, product, reviewResult);
  await verifyMyShopReviewManagement(page, credentials.token, product, reviewResult);
  const duplicate = await expectReviewCreateStatus(credentials.token, product, 201, 'second-review');
  if (duplicate?.success) {
    cleanupShopContent();
  }

  cleanupShopContent();
  await apiOk(`/shop/orders/${createdOrderId}`, {
    method: 'PATCH',
    headers: authHeaders(credentials.token),
    body: JSON.stringify({ reason: `${smokeMarker} cancelled order review gate` }),
  });
  await expectReviewCreateStatus(
    credentials.token,
    product,
    policy.review_requires_completed_order ? 403 : 201,
    'cancelled-order'
  );
  cleanupShopContent();

  const qaResult = await submitQaInBrowser(page, credentials.token, product);
  await verifyPublicShopQaListing(page, credentials.token, product, qaResult);
  await verifyMyShopQaManagement(page, credentials.token, qaResult);
  await context.close();

  console.table([{ productId: product.it_id, orderId: createdOrderId, ...reviewResult, ...qaResult }]);
  console.log(`[check-local-shop-content-actions] app=${appUrl}`);
  console.log(`[check-local-shop-content-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (credentials?.token) {
    try {
      cleanupShopContent();
      cleanupOrders(createdOrderId);
      cleanupOrders();
      await cleanupCart(credentials.token);
    } catch (error) {
      printFailure(error, 'check-local-shop-content-actions cleanup');
      exitCode = 1;
    }
  }
  try {
    runPhp('seed_nextjs_smoke_user.php');
  } catch (error) {
    printFailure(error, 'check-local-shop-content-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
