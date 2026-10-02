import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const senderId = process.env.LOCAL_SMOKE_MEMO_SENDER_ID || 'nextjs_memo_send';
const senderPassword =
  process.env.LOCAL_SMOKE_MEMO_SENDER_PASSWORD || 'NextjsMemoSend123!';
const receiverId = process.env.LOCAL_SMOKE_MEMO_RECEIVER_ID || 'nextjs_memo_recv';
const receiverPassword =
  process.env.LOCAL_SMOKE_MEMO_RECEIVER_PASSWORD || 'NextjsMemoRecv123!';
const smokeMarker = process.env.LOCAL_SMOKE_MEMO_MARKER || 'nextjs-local-memo-smoke';
const smokeRunId = `${Date.now()}`;

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-memo-actions') {
  console.error(`[${prefix}] ${error.message}`);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
}

function runPhp(script, env = {}, args = []) {
  // 시드 PHP 는 nextjs/scripts/smoke/ 에 있다(예전 저장소 루트 scripts/ 에서 옮김).
  const scriptPath = fileURLToPath(new URL(`./smoke/${script}`, import.meta.url));
  const result = spawnSync('php', [scriptPath, '--json', ...args], {
    env: {
      ...process.env,
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

function seedMember({ id, password, email, name, nick, point = '0' }) {
  return runPhp('seed_nextjs_smoke_user.php', {
    LOCAL_SMOKE_LOGIN_ID: id,
    LOCAL_SMOKE_LOGIN_PASSWORD: password,
    LOCAL_SMOKE_LOGIN_EMAIL: email,
    LOCAL_SMOKE_LOGIN_NAME: name,
    LOCAL_SMOKE_LOGIN_NICK: nick,
    LOCAL_SMOKE_LOGIN_POINT: point,
  });
}

function cleanupMemos() {
  return runPhp('cleanup_nextjs_smoke_memos.php', {
    LOCAL_SMOKE_MEMO_SENDER_ID: senderId,
    LOCAL_SMOKE_MEMO_RECEIVER_ID: receiverId,
    LOCAL_SMOKE_MEMO_MARKER: smokeMarker,
  });
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

async function login(id, password) {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: id, mb_password: password }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail(`login for ${id} did not return a token`);
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

async function browserContext(browser, credentials) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);
  return context;
}

async function sendMemoInBrowser(browser, senderCredentials) {
  const memoText = `${smokeMarker} body ${smokeRunId}`;
  const context = await browserContext(browser, senderCredentials);
  const page = await context.newPage();

  await page.goto(`${appUrl}/mypage/memos/new?recv=${encodeURIComponent(receiverId)}`, {
    waitUntil: 'networkidle',
  });
  await page.locator('#me_recv_mb_id').fill(receiverId);
  await page.locator('#me_memo').fill(memoText);

  const [memoResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/memos') &&
        response.request().method() === 'POST'
    ),
    page.locator('form button[type="submit"]').last().click(),
  ]);
  await assertOkResponse(memoResponse, 'memo send');
  const payload = await memoResponse.json();
  const recvMemoId = Number(payload?.data?.me_id || 0);
  const sendMemoId = Number(payload?.data?.send_me_id || 0);
  if (!recvMemoId || !sendMemoId) {
    fail('memo send did not return both recv/send memo ids', payload);
  }

  await page.waitForURL(/\/mypage\/memos\?type=send$/, { timeout: 10000 });
  await page.getByText(memoText, { exact: false }).waitFor({
    state: 'visible',
    timeout: 10000,
  });
  const sentBody = await page.locator('body').innerText({ timeout: 10000 });
  if (!sentBody.includes(memoText) || !sentBody.includes(receiverId)) {
    fail('sent memo list did not render the created memo', {
      url: page.url(),
      memoText,
      receiverId,
      body: sentBody.slice(0, 2000),
    });
  }

  await context.close();
  return { memoText, recvMemoId, sendMemoId };
}

async function assertSentMemoApi(senderCredentials, memoState) {
  const payload = await apiJson('/memos?type=send&limit=50', {
    headers: authHeaders(senderCredentials.token),
  });
  const sent = (payload.data || []).find((memo) => Number(memo.me_id) === memoState.sendMemoId);
  if (
    !sent ||
    sent.me_recv_mb_id !== receiverId ||
    !String(sent.me_memo || '').includes(memoState.memoText)
  ) {
    fail('sent memo API did not expose the created memo', payload.data);
  }
}

async function assertUnreadReceiverMemo(receiverCredentials, memoState) {
  const payload = await apiJson('/memos?type=recv&limit=50', {
    headers: authHeaders(receiverCredentials.token),
  });
  const received = (payload.data || []).find((memo) => Number(memo.me_id) === memoState.recvMemoId);
  if (!received || received.me_send_mb_id !== senderId) {
    fail('receiver memo list did not include the sent memo', payload.data);
  }
  if (
    received.me_read_datetime !== '0000-00-00 00:00:00' &&
    received.me_read_datetime !== '1000-01-01 00:00:00'
  ) {
    fail('new receiver memo was already marked as read before detail view', received);
  }
}

async function readAndDeleteMemoInBrowser(browser, receiverCredentials, memoState) {
  const context = await browserContext(browser, receiverCredentials);
  const page = await context.newPage();
  const memoResponses = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('dialog', (dialog) => dialog.accept());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.url().includes('/memos')) {
      memoResponses.push({
        method: response.request().method(),
        status: response.status(),
        url: response.url(),
      });
    }
  });

  let detailResponse = null;
  try {
    [detailResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/memos/${memoState.recvMemoId}`) &&
          response.request().method() === 'GET' &&
          String(response.headers()['content-type'] || '').includes('application/json')
      ),
      page.goto(`${appUrl}/mypage/memos/${memoState.recvMemoId}`, {
        waitUntil: 'networkidle',
      }),
    ]);
  } catch (error) {
    const runtime = await page
      .evaluate(() => ({
        href: window.location.href,
        pathname: window.location.pathname,
        runtimeConfig: window.__G5_NEXTJS25_CONFIG__ || null,
        text: document.body?.innerText?.slice(0, 2000) || '',
      }))
      .catch(() => null);
    fail('memo detail API response was not observed', {
      error: error instanceof Error ? error.message : String(error),
      memoResponses,
      pageErrors,
      consoleErrors,
      runtime,
    });
  }
  await assertOkResponse(detailResponse, 'memo detail read');
  const detailPayload = await detailResponse.json();
  const readAt = String(detailPayload?.data?.me_read_datetime || '');
  if (!readAt || readAt === '0000-00-00 00:00:00') {
    fail('memo detail did not mark the received memo as read', detailPayload);
  }

  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  if (!bodyText.includes(memoState.memoText) || !bodyText.includes(senderId)) {
    fail('receiver memo detail did not render the created memo', {
      url: page.url(),
      memoText: memoState.memoText,
      senderId,
      body: bodyText.slice(0, 2000),
    });
  }

  let deleteResponse = null;
  try {
    [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/memos/${memoState.recvMemoId}`) &&
          response.request().method() === 'DELETE' &&
          String(response.headers()['content-type'] || '').includes('application/json')
      ),
      page.getByRole('button', { name: '삭제' }).click(),
    ]);
  } catch (error) {
    const runtime = await page
      .evaluate(() => ({
        href: window.location.href,
        pathname: window.location.pathname,
        runtimeConfig: window.__G5_NEXTJS25_CONFIG__ || null,
        text: document.body?.innerText?.slice(0, 2000) || '',
      }))
      .catch(() => null);
    fail('memo delete API response was not observed', {
      error: error instanceof Error ? error.message : String(error),
      memoResponses,
      pageErrors,
      consoleErrors,
      runtime,
    });
  }
  await assertOkResponse(deleteResponse, 'memo delete');
  await page.waitForURL(/\/mypage\/memos\?type=recv$/, { timeout: 10000 });

  await context.close();
}

async function assertReceiverMemoDeleted(receiverCredentials, memoState) {
  const payload = await apiJson('/memos?type=recv&limit=50', {
    headers: authHeaders(receiverCredentials.token),
  });
  const received = (payload.data || []).find((memo) => Number(memo.me_id) === memoState.recvMemoId);
  if (received) {
    fail('receiver memo still exists after browser delete', received);
  }
}

let browser = null;
let senderCredentials = null;
let receiverCredentials = null;
let exitCode = 0;
let memoState = null;

try {
  seedMember({
    id: senderId,
    password: senderPassword,
    email: `${senderId}@example.test`,
    name: 'Nextjs Memo Sender',
    nick: 'MemoSender',
    point: '10000',
  });
  seedMember({
    id: receiverId,
    password: receiverPassword,
    email: `${receiverId}@example.test`,
    name: 'Nextjs Memo Receiver',
    nick: 'MemoReceiver',
  });
  cleanupMemos();

  senderCredentials = await login(senderId, senderPassword);
  receiverCredentials = await login(receiverId, receiverPassword);

  browser = await chromium.launch({ headless: true });
  memoState = await sendMemoInBrowser(browser, senderCredentials);
  await assertSentMemoApi(senderCredentials, memoState);
  await assertUnreadReceiverMemo(receiverCredentials, memoState);
  await readAndDeleteMemoInBrowser(browser, receiverCredentials, memoState);
  await assertReceiverMemoDeleted(receiverCredentials, memoState);

  console.table([
    {
      senderId,
      receiverId,
      recvMemoId: memoState.recvMemoId,
      sendMemoId: memoState.sendMemoId,
    },
  ]);
  console.log(`[check-local-memo-actions] app=${appUrl}`);
  console.log(`[check-local-memo-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  try {
    cleanupMemos();
  } catch (error) {
    printFailure(error, 'check-local-memo-actions cleanup');
    exitCode = 1;
  }
  try {
    seedMember({
      id: senderId,
      password: senderPassword,
      email: `${senderId}@example.test`,
      name: 'Nextjs Memo Sender',
      nick: 'MemoSender',
    });
    seedMember({
      id: receiverId,
      password: receiverPassword,
      email: `${receiverId}@example.test`,
      name: 'Nextjs Memo Receiver',
      nick: 'MemoReceiver',
    });
  } catch (error) {
    printFailure(error, 'check-local-memo-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
