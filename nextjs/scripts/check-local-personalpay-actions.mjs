import {
  createLocalActionApi,
  fail,
  printFailure,
  trimTrailingSlash,
} from './lib/local-action-api.mjs';
import { chromium } from '@playwright/test';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);
const expectedPageApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_PAGE_API_URL || `${appUrl}/api/v1`
);
const expectedG5Url = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_G5_URL || appUrl
);

const smokePersonalPayId = process.env.LOCAL_SMOKE_PERSONALPAY_ID || '9999999999999999';
const smokeMarker = process.env.LOCAL_SMOKE_PERSONALPAY_MARKER || 'nextjs-local-personalpay-smoke';

const {
  apiJson,
  fetchApi,
  runPhp,
} = createLocalActionApi({
  expectedApiUrl,
  phpEnv: {
    LOCAL_SMOKE_PERSONALPAY_ID: smokePersonalPayId,
    LOCAL_SMOKE_PERSONALPAY_MARKER: smokeMarker,
  },
});

function normalizePathname(pathname) {
  const normalized = String(pathname || '').replace(/\/+$/, '');
  return normalized || '/';
}

async function waitForAppPath(page, expectedPath, timeout = 10000) {
  const expected = normalizePathname(expectedPath);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    let current = '';
    try {
      current = normalizePathname(new URL(page.url()).pathname);
    } catch {
      current = '';
    }

    if (current === expected || current.endsWith(expected)) {
      return;
    }

    await page.waitForTimeout(100);
  }

  fail(`timed out waiting for app path ${expected}`, {
    expected,
    currentUrl: page.url(),
  });
}

function seedPersonalPay() {
  return runPhp('seed_nextjs_smoke_personalpay.php');
}

function markPersonalPayPaid(args = []) {
  return runPhp('mark_nextjs_smoke_personalpay_paid.php', {}, args);
}

function markPersonalPayProcessing() {
  return markPersonalPayPaid(['--processing']);
}

function cleanupPersonalPay() {
  return runPhp('cleanup_nextjs_smoke_personalpay.php');
}

async function verifyApi(seeded) {
  const listPayload = await apiJson('/shop/personalpay?per_page=50');
  const listed = (listPayload.data || []).find((item) => String(item.pp_id) === String(seeded.pp_id));
  if (
    !listed ||
    listed.pp_name !== seeded.name ||
    Number(listed.pp_price) !== Number(seeded.price) ||
    listed.already_paid !== false ||
    listed.payment_state !== 'ready' ||
    listed.payment_state_label !== '결제 대기' ||
    listed.payment_in_progress !== false ||
    listed.pp_receipt_time !== null
  ) {
    fail('personal pay list API did not expose the seeded unpaid row', {
      seeded,
      listed,
      meta: listPayload.meta,
    });
  }

  const payload = await apiJson(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}`);
  const personalPay = payload.data;
  if (
    personalPay?.pp_id !== String(seeded.pp_id) ||
    personalPay?.pp_name !== seeded.name ||
    Number(personalPay?.pp_price) !== Number(seeded.price) ||
    personalPay?.pp_settle_case !== seeded.settle_case ||
    personalPay?.pp_bank_account !== seeded.bank_account ||
    personalPay?.pp_deposit_name !== seeded.deposit_name ||
    personalPay?.already_paid !== false ||
    personalPay?.payment_state !== 'ready' ||
    personalPay?.payment_state_label !== '결제 대기' ||
    personalPay?.payment_in_progress !== false ||
    personalPay?.has_payment_transaction !== false ||
    personalPay?.pp_receipt_time !== null ||
    personalPay?.can_pay !== true ||
    String(personalPay?.payment_path || '') !== `/shop/personalpayform.php?pp_id=${seeded.pp_id}`
  ) {
    fail('personal pay API did not expose the seeded unpaid row', {
      seeded,
      personalPay,
    });
  }
  return personalPay;
}

async function verifyPaymentStartApi(seeded) {
  const payload = await apiJson(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const start = payload.data || {};
  const paymentPath = String(start.payment_path || '');
  const paymentUrl = String(start.payment_url || start.legacy_payment_url || '');
  const url = new URL(paymentPath || paymentUrl, expectedG5Url);

  if (
    start.pp_id !== String(seeded.pp_id) ||
    start.can_pay !== true ||
    start.payment_state !== 'ready' ||
    url.pathname !== '/shop/personalpayform.php' ||
    url.searchParams.get('pp_id') !== String(seeded.pp_id)
  ) {
    fail('personal pay start API did not return a valid YoungCart handoff URL', {
      seeded,
      start,
      paymentUrl,
    });
  }

  return start;
}

async function verifyProcessingApi(seeded) {
  const marked = markPersonalPayProcessing();
  const payload = await apiJson(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}`);
  const personalPay = payload.data || {};

  if (
    personalPay.pp_id !== String(seeded.pp_id) ||
    personalPay.already_paid !== false ||
    personalPay.payment_state !== 'processing' ||
    personalPay.payment_state_label !== '결제 처리 중' ||
    personalPay.payment_in_progress !== true ||
    personalPay.has_payment_transaction !== true ||
    personalPay.can_pay !== false ||
    personalPay.payment_block_reason !== '이미 결제하신 개인결제 내역입니다.' ||
    personalPay.pp_tno !== marked.tno ||
    Number(personalPay.pp_receipt_price || 0) !== 0 ||
    Number(personalPay.pp_misu_price || 0) !== Number(seeded.price) ||
    personalPay.pp_receipt_time !== null
  ) {
    fail('personal pay processing API did not expose the YoungCart transaction-in-progress state', {
      marked,
      personalPay,
    });
  }

  const listPayload = await apiJson('/shop/personalpay?per_page=50');
  const listed = (listPayload.data || []).find((item) => String(item.pp_id) === String(seeded.pp_id));
  if (listed) {
    fail('personal pay processing row was still listed in unpaid personal pay list', {
      marked,
      listed,
    });
  }

  const blockedStart = await fetchApi(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (
    blockedStart.response.status !== 409 ||
    blockedStart.payload?.success !== false ||
    blockedStart.payload?.message !== '이미 결제하신 개인결제 내역입니다.'
  ) {
    fail('personal pay start API allowed a transaction-in-progress row', {
      marked,
      blockedStart: {
        status: blockedStart.response.status,
        payload: blockedStart.payload,
      },
    });
  }

  return { marked, personalPay };
}

async function verifyPaidReceiptApi(seeded) {
  const marked = markPersonalPayPaid(['--with-toss-receipt']);
  const payload = await apiJson(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}`);
  const personalPay = payload.data || {};
  const receiptUrl = String(personalPay.receipt_url || personalPay.pp_payment_receipt_url || '');

  if (
    personalPay.pp_id !== String(seeded.pp_id) ||
    personalPay.already_paid !== true ||
    personalPay.payment_state !== 'paid' ||
    personalPay.payment_state_label !== '결제 완료' ||
    personalPay.payment_in_progress !== false ||
    personalPay.has_payment_transaction !== true ||
    personalPay.can_pay !== false ||
    personalPay.payment_block_reason !== '이미 결제하신 개인결제 내역입니다.' ||
    Number(personalPay.pp_receipt_price || 0) !== Number(marked.price || 0) ||
    Number(personalPay.pp_misu_price || 0) !== 0 ||
    personalPay.pp_settle_case !== marked.settle_case ||
    personalPay.pp_tno !== marked.tno ||
    !receiptUrl.includes('dashboard.tosspayments.com/receipt/redirection') ||
    !receiptUrl.includes(encodeURIComponent(String(marked.tno)))
  ) {
    fail('personal pay paid receipt API did not expose YoungCart receipt details', {
      marked,
      personalPay,
      receiptUrl,
    });
  }

  const listPayload = await apiJson('/shop/personalpay?per_page=50');
  const listed = (listPayload.data || []).find((item) => String(item.pp_id) === String(seeded.pp_id));
  if (listed) {
    fail('personal pay paid row was still listed in unpaid personal pay list', {
      marked,
      listed,
    });
  }

  const blockedStart = await fetchApi(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (blockedStart.response.status !== 409 || blockedStart.payload?.success !== false) {
    fail('personal pay start API allowed an already paid row', {
      marked,
      blockedStart: {
        status: blockedStart.response.status,
        payload: blockedStart.payload,
      },
    });
  }

  return { marked, personalPay };
}

async function verifyCashReceiptApi(seeded) {
  const marked = markPersonalPayPaid(['--with-toss-cash-receipt']);
  const payload = await apiJson(`/shop/personalpay/${encodeURIComponent(seeded.pp_id)}`);
  const personalPay = payload.data || {};
  const cashReceiptUrl = String(personalPay.cash_receipt_url || personalPay.pp_cash_receipt_url || '');
  const issueUrl = String(
    personalPay.cash_receipt_issue_url || personalPay.pp_cash_receipt_issue_url || ''
  );

  if (
    personalPay.pp_id !== String(seeded.pp_id) ||
    personalPay.already_paid !== true ||
    personalPay.payment_state !== 'paid' ||
    personalPay.payment_state_label !== '결제 완료' ||
    personalPay.payment_in_progress !== false ||
    personalPay.has_payment_transaction !== true ||
    personalPay.can_pay !== false ||
    Number(personalPay.pp_receipt_price || 0) !== Number(marked.price || 0) ||
    Number(personalPay.pp_misu_price || 0) !== 0 ||
    personalPay.pp_settle_case !== marked.settle_case ||
    personalPay.pp_tno !== marked.tno ||
    Number(personalPay.pp_cash || 0) !== 1 ||
    String(personalPay.pp_cash_no || '') !== String(marked.cash_no || '') ||
    cashReceiptUrl !== String(marked.cash_receipt_url || '') ||
    issueUrl !== ''
  ) {
    fail('personal pay cash receipt API did not expose issued cash receipt details', {
      marked,
      personalPay,
      cashReceiptUrl,
      issueUrl,
    });
  }

  return { marked, personalPay };
}

async function verifyBrowser(seeded, personalPay) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    const [listApiResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().startsWith(`${expectedPageApiUrl}/shop/personalpay`) &&
          !response.url().includes(`/shop/personalpay/${seeded.pp_id}`) &&
          response.request().method() === 'GET'
      ),
      page.goto(`${appUrl}/shop/personalpay`, {
        waitUntil: 'networkidle',
      }),
    ]);

    if (!listApiResponse.ok()) {
      fail('personal pay list page API response failed', {
        status: listApiResponse.status(),
        url: listApiResponse.url(),
        body: await listApiResponse.text().catch(() => ''),
      });
    }

    await page.getByText(personalPay.pp_name, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText('45,670', { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const detailHref = `/shop/personalpay/${encodeURIComponent(String(seeded.pp_id))}`;
    const [apiResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().startsWith(`${expectedPageApiUrl}/shop/personalpay/`) &&
          response.url().includes(`/shop/personalpay/${seeded.pp_id}`) &&
          response.request().method() === 'GET'
      ),
      page.locator(`a[href="${detailHref}"]`).first().click(),
    ]);
    await waitForAppPath(page, detailHref);

    if (!apiResponse.ok()) {
      fail('personal pay page API response failed', {
        status: apiResponse.status(),
        url: apiResponse.url(),
        body: await apiResponse.text().catch(() => ''),
      });
    }

    await page.getByText(personalPay.pp_name, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(personalPay.pp_content, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText('45,670', { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(personalPay.pp_bank_account, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(personalPay.pp_deposit_name, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const body = await page.locator('body').innerText({ timeout: 10000 });
    if (!body.includes('45,670') || !body.includes(personalPay.pp_bank_account)) {
      fail('personal pay page did not render expected payment details', {
        body: body.slice(0, 2000),
        personalPay,
      });
    }

    const payHref = `/shop/personalpay/${encodeURIComponent(String(seeded.pp_id))}/pay`;
    await page.locator(`a[href="${payHref}"]`).first().click();
    await waitForAppPath(page, payHref);

    await page.getByText('결제 전 확인', { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const paymentBody = await page.locator('body').innerText({ timeout: 10000 });
    if (
      !paymentBody.includes('결제 전 확인') ||
      !paymentBody.includes('45,670') ||
      !paymentBody.includes(personalPay.pp_name)
    ) {
      fail('personal pay payment page did not render the Next.js payment handoff screen', {
        body: paymentBody.slice(0, 2500),
        personalPay,
      });
    }

    const [startResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().startsWith(`${expectedPageApiUrl}/shop/personalpay/${seeded.pp_id}/start`) &&
          response.request().method() === 'POST'
      ),
      page.waitForURL(
        (url) =>
          url.href.startsWith(`${expectedG5Url}/shop/personalpayform.php`) &&
          url.searchParams.get('pp_id') === String(seeded.pp_id),
        { timeout: 10000 }
      ),
      page.getByRole('button', { name: /결제 시작/ }).click(),
    ]);

    if (!startResponse.ok()) {
      fail('personal pay start API response failed from payment page', {
        status: startResponse.status(),
        url: startResponse.url(),
        body: await startResponse.text().catch(() => ''),
      });
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

async function verifyProcessingBrowser(seeded, personalPay) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const detailPath = `/shop/personalpay/${encodeURIComponent(String(seeded.pp_id))}`;
    const payPath = `${detailPath}/pay`;

    const [detailApiResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().startsWith(`${expectedPageApiUrl}/shop/personalpay/`) &&
          response.url().includes(`/shop/personalpay/${seeded.pp_id}`) &&
          response.request().method() === 'GET'
      ),
      page.goto(`${appUrl}${detailPath}`, {
        waitUntil: 'networkidle',
      }),
    ]);

    if (!detailApiResponse.ok()) {
      fail('processing personal pay detail API response failed', {
        status: detailApiResponse.status(),
        url: detailApiResponse.url(),
        body: await detailApiResponse.text().catch(() => ''),
      });
    }

    const detailBody = await page.locator('body').innerText({ timeout: 10000 });
    if (
      !detailBody.includes('결제 처리 중') ||
      !detailBody.includes('이미 결제하신 개인결제 내역입니다.') ||
      !detailBody.includes('45,670')
    ) {
      fail('processing personal pay detail page did not render the blocked state', {
        body: detailBody.slice(0, 2500),
        personalPay,
      });
    }

    const disabledDetailButtons = await page
      .getByRole('button', { name: /결제 처리 중|결제하기/ })
      .evaluateAll((buttons) => buttons.filter((button) => button.disabled).length);
    if (disabledDetailButtons < 1) {
      fail('processing personal pay detail page did not disable the payment button', {
        body: detailBody.slice(0, 2500),
      });
    }

    const [payApiResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().startsWith(`${expectedPageApiUrl}/shop/personalpay/`) &&
          response.url().includes(`/shop/personalpay/${seeded.pp_id}`) &&
          response.request().method() === 'GET'
      ),
      page.goto(`${appUrl}${payPath}`, {
        waitUntil: 'networkidle',
      }),
    ]);

    if (!payApiResponse.ok()) {
      fail('processing personal pay payment API response failed', {
        status: payApiResponse.status(),
        url: payApiResponse.url(),
        body: await payApiResponse.text().catch(() => ''),
      });
    }

    const payBody = await page.locator('body').innerText({ timeout: 10000 });
    if (
      !payBody.includes('결제 처리 중') ||
      !payBody.includes('이미 결제하신 개인결제 내역입니다.') ||
      !payBody.includes('결제할 수 없습니다')
    ) {
      fail('processing personal pay payment page did not render the blocked state', {
        body: payBody.slice(0, 2500),
        personalPay,
      });
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

async function verifyPaidBrowser(seeded, personalPay) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const detailPath = `/shop/personalpay/${encodeURIComponent(String(seeded.pp_id))}`;

    const [apiResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().startsWith(`${expectedPageApiUrl}/shop/personalpay/`) &&
          response.url().includes(`/shop/personalpay/${seeded.pp_id}`) &&
          response.request().method() === 'GET'
      ),
      page.goto(`${appUrl}${detailPath}`, {
        waitUntil: 'networkidle',
      }),
    ]);

    if (!apiResponse.ok()) {
      fail('paid personal pay page API response failed', {
        status: apiResponse.status(),
        url: apiResponse.url(),
        body: await apiResponse.text().catch(() => ''),
      });
    }

    const body = await page.locator('body').innerText({ timeout: 10000 });
    if (
      !body.includes('결제 완료') ||
      !body.includes('영수증') ||
      !body.includes('45,670') ||
      !body.includes(String(personalPay.pp_tno || ''))
    ) {
      fail('paid personal pay page did not render YoungCart payment details', {
        body: body.slice(0, 2500),
        personalPay,
      });
    }

    const cashReceiptUrl = String(personalPay.cash_receipt_url || personalPay.pp_cash_receipt_url || '');
    if (cashReceiptUrl) {
      const cashReceiptLinkCount = await page.locator(`a[href="${cashReceiptUrl}"]`).count();
      if (cashReceiptLinkCount < 1) {
        fail('paid personal pay page did not render cash receipt link', {
          cashReceiptUrl,
          body: body.slice(0, 2500),
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

let exitCode = 0;

try {
  cleanupPersonalPay();
  const seeded = seedPersonalPay();
  const personalPay = await verifyApi(seeded);
  await verifyPaymentStartApi(seeded);
  await verifyBrowser(seeded, personalPay);
  const processingResult = await verifyProcessingApi(seeded);
  await verifyProcessingBrowser(seeded, processingResult.personalPay);
  await verifyPaidReceiptApi(seeded);
  const cashReceiptResult = await verifyCashReceiptApi(seeded);
  await verifyPaidBrowser(seeded, cashReceiptResult.personalPay);

  console.table([
    {
      ppId: seeded.pp_id,
      price: seeded.price,
      settleCase: seeded.settle_case,
      listed: true,
      processingBlocked: true,
      paidReceipt: true,
      cashReceipt: true,
    },
  ]);
  console.log(`[check-local-personalpay-actions] app=${appUrl}`);
  console.log(`[check-local-personalpay-actions] api=${expectedApiUrl}`);
  console.log(`[check-local-personalpay-actions] pageApi=${expectedPageApiUrl}`);
  console.log(`[check-local-personalpay-actions] g5=${expectedG5Url}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  try {
    cleanupPersonalPay();
  } catch (error) {
    printFailure(error, 'check-local-personalpay-actions cleanup');
    exitCode = 1;
  }
}

process.exit(exitCode);
