import { chromium } from '@playwright/test';
import { env, liveAppUrl, liveExpectedApiUrl } from './lib/live-env.mjs';

const scriptName = 'check-live-shop-cart';
const allowedArgs = new Set(['--mobile']);
for (const arg of process.argv.slice(2)) {
  if (!allowedArgs.has(arg)) {
    console.error(`[${scriptName}] Unknown argument: ${arg}`);
    process.exit(1);
  }
}

const appUrl = liveAppUrl(scriptName);
const apiUrl = liveExpectedApiUrl(appUrl);
const productId = env('LIVE_SMOKE_SHOP_PRODUCT_ID') || env('SHOP_E2E_PRODUCT_ID');
const mobile = process.argv.includes('--mobile');

if (!productId) {
  console.error(
    `[${scriptName}] LIVE_SMOKE_SHOP_PRODUCT_ID is required so the check cannot mutate an unintended product cart.`
  );
  process.exit(1);
}

function firstUsableOption(product) {
  return (product.options || []).find(
    (option) =>
      Number(option.io_type || 0) === 0 &&
      String(option.io_use ?? '1') !== '0' &&
      Number(option.io_stock_qty ?? 0) > 0 &&
      String(option.io_id || '') !== ''
  );
}

function cartPayload(product) {
  const quantity = Math.max(1, Number(product.it_buy_min_qty || 0));
  const option = firstUsableOption(product);
  if (option) {
    return {
      it_id: String(product.it_id),
      options: [{ io_id: String(option.io_id), ct_qty: quantity }],
    };
  }

  return { it_id: String(product.it_id), ct_qty: quantity };
}

async function responseJson(response, label) {
  const body = await response.text();
  let payload = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    // Keep the raw body in the error below.
  }

  if (!response.ok()) {
    throw new Error(`${label} failed: HTTP ${response.status()} ${body.slice(0, 500)}`);
  }
  return payload;
}

async function clearCart(request, { required = true } = {}) {
  const response = await request.delete(`${apiUrl}/shop/cart`, {
    headers: { Accept: 'application/json' },
  });
  if (response.ok() || response.status() === 404 || (!required && response.status() === 401)) {
    return;
  }
  throw new Error(`cart cleanup failed: HTTP ${response.status()} ${(await response.text()).slice(0, 500)}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 900 } }
);
const page = await context.newPage();
const runtimeErrors = [];

page.on('pageerror', (error) => runtimeErrors.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`[console.error] ${message.text()}`);
});

try {
  await clearCart(context.request, { required: false });

  const productResponse = await context.request.get(
    `${apiUrl}/shop/products/${encodeURIComponent(productId)}`,
    { headers: { Accept: 'application/json' } }
  );
  const productEnvelope = await responseJson(productResponse, 'product fixture');
  const product = productEnvelope?.data;
  if (!product?.it_id || !product?.it_name) {
    throw new Error('product fixture response is missing data.it_id or data.it_name');
  }

  const addResponse = await context.request.post(`${apiUrl}/shop/cart`, {
    headers: { Accept: 'application/json' },
    data: cartPayload(product),
  });
  await responseJson(addResponse, 'cart add');

  const cartResponse = await context.request.get(`${apiUrl}/shop/cart`, {
    headers: { Accept: 'application/json' },
  });
  const cartEnvelope = await responseJson(cartResponse, 'cart read');
  const rows = cartEnvelope?.data?.items || cartEnvelope?.data || [];
  if (!Array.isArray(rows) || !rows.some((row) => String(row.it_id) === String(product.it_id))) {
    throw new Error(`cart does not contain fixture product ${product.it_id}`);
  }

  const cartPageResponse = await page.goto(`${appUrl}/shop/cart`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  if (!cartPageResponse || cartPageResponse.status() >= 500) {
    throw new Error(`cart page failed: HTTP ${cartPageResponse?.status() || 0}`);
  }
  await page.locator('#main-content, main').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText(product.it_name, { exact: true }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const orderPageResponse = await page.goto(`${appUrl}/shop/order`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  if (!orderPageResponse || orderPageResponse.status() >= 500) {
    throw new Error(`order page failed: HTTP ${orderPageResponse?.status() || 0}`);
  }
  if (new URL(page.url()).pathname !== '/shop/order') {
    throw new Error(`order page redirected unexpectedly to ${page.url()}`);
  }
  await page.locator('#main-content form, main form').first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  if (runtimeErrors.length > 0) {
    throw new Error(`browser runtime errors: ${runtimeErrors.join(' | ')}`);
  }

  console.log(
    `[${scriptName}] passed app=${appUrl} product=${product.it_id} viewport=${mobile ? 'mobile' : 'desktop'}`
  );
} finally {
  try {
    await clearCart(context.request);
  } finally {
    await context.close();
    await browser.close();
  }
}
