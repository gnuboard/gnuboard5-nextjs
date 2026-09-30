import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_ADDRESS_LOGIN_ID || 'nextjs_addr_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_ADDRESS_LOGIN_PASSWORD || 'NextjsAddrSmoke123!';
const smokeProductId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || '1446772772';
const smokeMarker = process.env.LOCAL_SMOKE_ADDRESS_MARKER || 'nextjs-local-address-smoke';
const smokeRunId = `${Date.now()}`;

const SETTLE_BANK = '\uBB34\uD1B5\uC7A5';

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function youngCartAddressSubject(value) {
  return String(value).slice(0, 20);
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-address-actions') {
  console.error(`[${prefix}] ${error.message}`);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
}

function runPhp(script, env = {}, args = []) {
  const scriptPath = fileURLToPath(new URL(`../../scripts/${script}`, import.meta.url));
  const result = spawnSync('php', [scriptPath, '--json', ...args], {
    env: {
      ...process.env,
      LOCAL_SMOKE_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_LOGIN_PASSWORD: smokeMemberPassword,
      LOCAL_SMOKE_LOGIN_EMAIL: `${smokeMemberId}@example.test`,
      LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Address Smoke',
      LOCAL_SMOKE_LOGIN_NICK: 'NextjsAddrSmoke',
      LOCAL_SMOKE_ORDER_MARKER: smokeMarker,
      ...env,
    },
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    fail(`failed to run ${script}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${script} failed`, {
      status: result.status,
      stderr: result.stderr.trim(),
      stdout: result.stdout.trim(),
    });
  }

  try {
    const payload = JSON.parse(result.stdout.trim());
    if (!payload?.success) {
      fail(`${script} did not return success`, payload);
    }
    return payload;
  } catch {
    fail(`${script} returned invalid JSON`, {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }
}

async function fetchApi(path, options = {}) {
  const response = await fetch(`${expectedApiUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // no JSON body, e.g. 204
  }

  return { response, payload };
}

async function apiJson(path, options = {}) {
  const { response, payload } = await fetchApi(path, options);

  if (!response.ok || !payload?.success) {
    fail(`API request failed: ${path}`, {
      status: response.status,
      message: payload?.message || response.statusText,
      payload,
    });
  }

  return payload;
}

async function apiOk(path, options = {}) {
  const { response, payload } = await fetchApi(path, options);
  if (!response.ok || (response.status !== 204 && payload && payload.success === false)) {
    fail(`API request failed: ${path}`, {
      status: response.status,
      message: payload?.message || response.statusText,
      payload,
    });
  }
  return payload;
}

async function login() {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: smokeMemberPassword }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail('address smoke member login did not return a token');
  }
  return { token, refreshToken };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function assertOkResponse(response, label) {
  if (!response.ok()) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // Body may be unavailable after navigation; status and URL still identify the failure.
    }
    fail(`${label} response failed`, {
      status: response.status(),
      url: response.url(),
      body,
    });
  }
}

async function getProduct() {
  const payload = await apiJson(`/shop/products/${encodeURIComponent(smokeProductId)}`);
  const product = payload.data;
  if (!product?.it_id) {
    fail('smoke product was not returned by the API', payload);
  }
  if (String(product.it_soldout) === '1' || Number(product.it_stock_qty || 0) <= 0) {
    fail('smoke product is not available for address order checks', product);
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
  return option ? String(option.io_id) : '';
}

async function cleanupCart(token) {
  await apiOk('/shop/cart', {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

function cleanupOrders(orderId = '') {
  const args = orderId ? [`--order-id=${orderId}`] : [];
  return runPhp('cleanup_nextjs_smoke_orders.php', {}, args);
}

async function currentAddresses(token) {
  const payload = await apiJson('/shop/addresses', {
    headers: authHeaders(token),
  });
  return payload.data || [];
}

async function cleanupAddresses(token) {
  const addresses = await currentAddresses(token);
  for (const address of addresses) {
    const subject = String(address.ad_subject || '');
    const addr1 = String(address.ad_addr1 || '');
    if (
      !subject.includes(smokeMarker) &&
      !subject.includes('addr-smoke-') &&
      !subject.includes('addr-auto-') &&
      !addr1.includes('Next.js saved address') &&
      !addr1.includes('Next.js order auto address')
    ) {
      continue;
    }
    await apiOk(`/shop/addresses/${address.ad_id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  }
}

async function createAddressInBrowser(page, token) {
  const subject = youngCartAddressSubject(`${smokeMarker} ${smokeRunId}`);
  const receiver = 'AddressSmoke';
  const hp = '010-2222-3333';
  const tel = '02-111-2222';
  const zip = '98765';
  const addr1 = 'Next.js saved address';
  const addr2 = 'Address flow suite';
  const addr3 = 'Default recipient';

  await page.goto(`${appUrl}/mypage/addresses`, { waitUntil: 'networkidle' });
  await page.locator('button:has(svg.lucide-plus)').first().click();

  const form = page.locator('form').last();
  await form.waitFor({ state: 'visible', timeout: 10000 });
  const inputs = form.locator('input');
  const inputCount = await inputs.count();
  if (inputCount < 9) {
    fail('address form did not render the expected inputs', {
      url: page.url(),
      inputCount,
      text: await form.innerText({ timeout: 3000 }).catch(() => ''),
    });
  }

  await inputs.nth(0).fill(subject);
  await inputs.nth(1).fill(receiver);
  await inputs.nth(2).fill(hp);
  await inputs.nth(3).fill(tel);
  await inputs.nth(4).fill(zip);
  await inputs.nth(5).fill(addr1);
  await inputs.nth(6).fill(addr2);
  await inputs.nth(7).fill(addr3);
  await inputs.nth(8).check();

  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/shop/addresses') &&
        response.request().method() === 'POST'
    ),
    form.locator('button[type="submit"]').click(),
  ]);
  await assertOkResponse(createResponse, 'address create');

  const addresses = await currentAddresses(token);
  const created = addresses.find(
    (address) =>
      String(address.ad_subject || '') === subject &&
      address.ad_name === receiver &&
      address.ad_addr1 === addr1
  );
  if (!created || Number(created.ad_default) !== 1) {
    fail('address create did not persist expected row/default flag', addresses);
  }

  return {
    adId: Number(created.ad_id),
    subject,
    receiver,
    hp,
    tel,
    zip,
    addr1,
    addr2,
    addr3,
  };
}

async function updateAddressMetadata(token, address) {
  const patchedSubject = `addr-smoke-${smokeRunId.slice(-8)}`;
  const patchedAddr3 = 'Patched recipient note';
  const payload = await apiJson(`/shop/addresses/${address.adId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({
      ad_subject: patchedSubject,
      ad_default: 1,
      ad_addr3: patchedAddr3,
    }),
  });
  const updated = payload.data || {};
  if (
    String(updated.ad_subject || '') !== patchedSubject ||
    Number(updated.ad_default || 0) !== 1 ||
    String(updated.ad_addr3 || '') !== patchedAddr3
  ) {
    fail('address patch did not persist subject/default/address fields', payload);
  }

  const addresses = await currentAddresses(token);
  const listed = addresses.find((item) => Number(item.ad_id) === address.adId);
  if (
    !listed ||
    String(listed.ad_subject || '') !== patchedSubject ||
    Number(listed.ad_default || 0) !== 1 ||
    String(listed.ad_addr3 || '') !== patchedAddr3
  ) {
    fail('address list did not reflect patched address metadata', addresses);
  }

  return {
    ...address,
    subject: patchedSubject,
    addr3: patchedAddr3,
  };
}

async function setupCartForOrder(token, product) {
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
}

async function createOrderViaApiWithAutoSavedAddress(token, product) {
  await setupCartForOrder(token, product);

  const subject = `addr-auto-${smokeRunId.slice(-8)}`;
  const receiver = 'AutoAddressSmoke';
  const hp = '010-7777-8888';
  const tel = '02-777-8888';
  const zip = '45678';
  const addr1 = 'Next.js order auto address';
  const addr2 = 'Auto saved from order API';
  const addr3 = 'YoungCart address book';

  const orderPayload = await apiJson('/shop/orders', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      od_name: 'OrdererSmoke',
      od_tel: '02-000-0000',
      od_hp: '010-4444-5555',
      od_email: `${smokeMemberId}@example.test`,
      od_zip: '12345',
      od_addr1: 'Next.js orderer address',
      od_addr2: 'Orderer detail',
      od_addr3: smokeMarker,
      od_b_name: receiver,
      od_b_tel: tel,
      od_b_hp: hp,
      od_b_zip1: zip.substring(0, 3),
      od_b_zip2: zip.substring(3),
      od_b_addr1: addr1,
      od_b_addr2: addr2,
      od_b_addr3: addr3,
      od_b_addr_jibeon: 'R',
      od_memo: `${smokeMarker} auto saved address`,
      od_settle_case: SETTLE_BANK,
      od_bank_account: 'smoke-bank',
      od_deposit_name: 'OrdererSmoke',
      ad_subject: subject,
      ad_default: 1,
    }),
  });

  const orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
  if (!/^[0-9]{8,20}$/.test(orderId)) {
    fail('auto-saved-address order did not return an order id', orderPayload);
  }

  const addresses = await currentAddresses(token);
  const saved = addresses.find(
    (item) =>
      String(item.ad_subject || '') === subject &&
      String(item.ad_name || '') === receiver &&
      String(item.ad_addr1 || '') === addr1
  );
  if (!saved || Number(saved.ad_default || 0) !== 1) {
    fail('order API did not auto-save recipient address/default flag', {
      orderPayload,
      addresses,
    });
  }

  const detail = await apiJson(`/shop/orders/${orderId}`, {
    headers: authHeaders(token),
  });
  if (
    detail.data?.od_b_name !== receiver ||
    detail.data?.od_b_hp !== hp ||
    detail.data?.od_b_addr1 !== addr1
  ) {
    fail('auto-saved-address order detail did not preserve recipient fields', detail.data);
  }

  return {
    orderId,
    addressId: Number(saved.ad_id),
    subject,
  };
}

async function fillOrdererAndSelectSavedAddress(page, address) {
  const form = page.locator('form').last();
  await form.waitFor({ state: 'visible', timeout: 10000 });
  const sections = form.locator('section');

  const ordererInputs = sections.nth(1).locator('input');
  await ordererInputs.nth(0).fill('OrdererSmoke');
  await ordererInputs.nth(1).fill('02-000-0000');
  await ordererInputs.nth(2).fill('010-4444-5555');
  await ordererInputs.nth(3).fill('12345');
  await ordererInputs.nth(4).fill('Next.js orderer address');
  await ordererInputs.nth(5).fill('Orderer detail');
  await ordererInputs.nth(6).fill(smokeMarker);
  await ordererInputs.nth(7).fill(`${smokeMemberId}@example.test`);

  const recipientSection = sections.nth(2);
  await recipientSection.locator('button').nth(1).click();
  const modalRowPositionHandle = await page.waitForFunction(
    (subject) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const index = rows.findIndex((row) =>
        Array.from(row.querySelectorAll('input')).some((input) => input.value === subject)
      );
      return index >= 0 ? index + 1 : false;
    },
    address.subject,
    { timeout: 10000 }
  );
  const modalRowPosition = await modalRowPositionHandle.jsonValue();
  const modalRow = page.locator('tbody tr').nth(Number(modalRowPosition) - 1);
  await modalRow.locator('button').first().click();
  await recipientSection.getByText(address.subject, { exact: false }).waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await recipientSection.locator('textarea').first().fill(`${smokeMarker} selected saved address`);

  const paymentSection = sections.nth(3);
  const bankSelect = paymentSection.locator('select').first();
  const firstBankValue = await bankSelect.evaluate((select) => {
    const option = Array.from(select.options).find((item) => item.value);
    return option?.value || '';
  });
  if (!firstBankValue) {
    fail('local payment config has no bank account for bank transfer orders');
  }
  await bankSelect.selectOption(firstBankValue);
  await paymentSection.locator('input[type="text"]').first().fill('OrdererSmoke');

  await sections.last().locator('input[type="checkbox"]').first().check();
}

async function createOrderWithSavedAddress(page, token, product, address) {
  await setupCartForOrder(token, product);
  await seedBrowserAuth(page.context(), { token: token }, appUrl);
  await page.goto(`${appUrl}/shop/order`, { waitUntil: 'networkidle' });
  try {
    await page.getByText(product.it_name, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
  } catch {
    fail('order page did not render the cart product for saved-address order', {
      productName: product.it_name,
      url: page.url(),
      body: (await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).slice(
        0,
        2000
      ),
    });
  }
  await fillOrdererAndSelectSavedAddress(page, address);

  const observedResponses = [];
  const recordResponse = (response) => {
    const request = response.request();
    if (request.method() === 'POST' && response.url().includes('/shop/')) {
      observedResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  };
  page.on('response', recordResponse);

  let orderResponse = null;
  try {
    [orderResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().replace(/\/+$/, '').endsWith('/shop/orders') &&
          response.request().method() === 'POST'
      ),
      page.locator('form button[type="submit"]').last().click(),
    ]);
  } catch (error) {
    const invalidFields = await page.evaluate(() =>
      Array.from(document.querySelectorAll('form input, form select, form textarea'))
        .filter((element) => 'checkValidity' in element && !element.checkValidity())
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          name: element.getAttribute('name') || '',
          id: element.id || '',
          type: element.getAttribute('type') || '',
          value: 'value' in element ? String(element.value || '') : '',
          message: 'validationMessage' in element ? element.validationMessage : '',
        }))
    );
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    fail('saved-address order did not post to /shop/orders before timeout', {
      message: error.message,
      url: page.url(),
      observedResponses,
      invalidFields,
      body: bodyText.slice(0, 1600),
    });
  } finally {
    page.off('response', recordResponse);
  }
  await assertOkResponse(orderResponse, 'order create with saved address');
  const orderPayload = await orderResponse.json();
  const createdOrder = orderPayload?.data?.order || {};
  const orderId = String(orderPayload?.data?.od_id || createdOrder.od_id || '');
  if (!/^[0-9]{8,20}$/.test(orderId)) {
    fail('saved-address order did not return an order id', orderPayload);
  }
  if (
    createdOrder.od_b_name !== address.receiver ||
    createdOrder.od_b_hp !== address.hp ||
    createdOrder.od_b_addr1 !== address.addr1 ||
    createdOrder.od_b_addr2 !== address.addr2
  ) {
    fail('saved address was not mapped into order recipient fields', createdOrder);
  }

  await page.waitForURL(new RegExp(`/shop/orders/${orderId}$`), { timeout: 10000 });
  const detail = await apiJson(`/shop/orders/${orderId}`, {
    headers: authHeaders(token),
  });
  if (
    detail.data?.od_b_name !== address.receiver ||
    detail.data?.od_b_addr1 !== address.addr1
  ) {
    fail('order detail API did not expose recipient address fields', detail.data);
  }

  await page.goto(`${appUrl}/shop/orders/${orderId}`, { waitUntil: 'networkidle' });
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  if (!bodyText.includes(address.addr1) || !bodyText.includes(address.receiver)) {
    fail('order detail page did not render the saved recipient address', {
      url: page.url(),
      expectedReceiver: address.receiver,
      expectedAddress: address.addr1,
      detail: detail.data,
      body: bodyText.slice(0, 2000),
    });
  }

  return orderId;
}

let browser = null;
let credentials = null;
let createdOrderId = '';
let createdAutoAddressOrderId = '';
let exitCode = 0;

try {
  runPhp('seed_nextjs_smoke_user.php');
  cleanupOrders();
  credentials = await login();
  const product = await getProduct();
  await cleanupAddresses(credentials.token);
  await cleanupCart(credentials.token);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);

  const page = await context.newPage();
  const createdAddress = await createAddressInBrowser(page, credentials.token);
  const address = await updateAddressMetadata(credentials.token, createdAddress);
  await context.close();

  const orderContext = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(orderContext, credentials, appUrl);
  const orderPage = await orderContext.newPage();
  createdOrderId = await createOrderWithSavedAddress(
    orderPage,
    credentials.token,
    product,
    address
  );
  await orderContext.close();
  const autoAddressResult = await createOrderViaApiWithAutoSavedAddress(
    credentials.token,
    product
  );
  createdAutoAddressOrderId = autoAddressResult.orderId;

  console.table([
    { productId: product.it_id, orderId: createdOrderId, addressId: address.adId },
    {
      productId: product.it_id,
      orderId: autoAddressResult.orderId,
      addressId: autoAddressResult.addressId,
      autoSavedAddress: true,
    },
  ]);
  console.log(`[check-local-address-actions] app=${appUrl}`);
  console.log(`[check-local-address-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (credentials?.token) {
    try {
      cleanupOrders(createdOrderId);
      cleanupOrders(createdAutoAddressOrderId);
      cleanupOrders();
      await cleanupAddresses(credentials.token);
      await cleanupCart(credentials.token);
    } catch (error) {
      printFailure(error, 'check-local-address-actions cleanup');
      exitCode = 1;
    }
  }
  try {
    runPhp('seed_nextjs_smoke_user.php');
  } catch (error) {
    printFailure(error, 'check-local-address-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
