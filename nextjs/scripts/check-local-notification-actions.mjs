import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_NOTIFICATION_LOGIN_ID || 'nextjs_notif_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_NOTIFICATION_LOGIN_PASSWORD || 'NextjsNotifSmoke123!';
const smokeRunId = `${Date.now()}`;
const smokeMarker = process.env.LOCAL_SMOKE_NOTIFICATION_MARKER || 'Next.js notification smoke';

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-notification-actions') {
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

function seedSmokeMember() {
  return runPhp('seed_nextjs_smoke_user.php', {
    LOCAL_SMOKE_LOGIN_ID: smokeMemberId,
    LOCAL_SMOKE_LOGIN_PASSWORD: smokeMemberPassword,
    LOCAL_SMOKE_LOGIN_EMAIL: `${smokeMemberId}@example.test`,
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Notification Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsNotifSmoke',
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
    fail('notification smoke login did not return a token');
  }
  return { token, refreshToken };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function cleanupNotifications(token) {
  await apiOk('/notifications', {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

async function createNotification(token, index) {
  const title = `${smokeMarker} title ${index} ${smokeRunId}`;
  const body = `${smokeMarker} body ${index} ${smokeRunId}`;
  const payload = await apiJson('/notifications', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      nt_type: 'system',
      nt_title: title,
      nt_body: body,
      nt_data: { href: '/recent', marker: smokeMarker, run_id: smokeRunId, index },
    }),
  });
  const item = payload.data;
  if (!item?.nt_id || item.nt_title !== title || item.nt_body !== body || item.is_read) {
    fail('notification create did not return the expected row', payload);
  }
  return item;
}

async function unreadNotifications(token) {
  const payload = await apiJson('/notifications?unread_only=1&per_page=30', {
    headers: authHeaders(token),
  });
  return {
    items: payload.data || [],
    total: payload.meta?.total ?? (payload.data || []).length,
  };
}

async function assertOkResponse(response, label) {
  if (!response.ok()) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // status and URL still identify the failure
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

async function verifyNotificationBell(page, token, created) {
  const [listResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/notifications') &&
        response.url().includes('unread_only=1') &&
        response.request().method() === 'GET'
    ),
    page.goto(`${appUrl}/`, { waitUntil: 'networkidle' }),
  ]);
  await assertOkResponse(listResponse, 'notification list');

  const bell = page.locator('button[aria-label="알림"]');
  await bell.waitFor({ state: 'visible', timeout: 10000 });
  await bell.getByText(String(created.length), { exact: true }).waitFor({
    state: 'visible',
    timeout: 10000,
  });

  await bell.click();
  for (const item of created) {
    await page.getByText(item.nt_title, { exact: false }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(item.nt_body, { exact: false }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
  }

  const [readAllResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/notifications/read-all') &&
        response.request().method() === 'POST'
    ),
    page.getByText('모두 읽음').click(),
  ]);
  await assertOkResponse(readAllResponse, 'notification read-all');

  const unread = await unreadNotifications(token);
  const remaining = unread.items.filter((item) =>
    created.some((createdItem) => Number(createdItem.nt_id) === Number(item.nt_id))
  );
  if (remaining.length > 0) {
    fail('notification read-all left smoke notifications unread', remaining);
  }

  return {
    displayed: created.length,
    unreadAfterReadAll: unread.total,
  };
}

let browser = null;
let credentials = null;
let exitCode = 0;

try {
  seedSmokeMember();
  credentials = await login();
  await cleanupNotifications(credentials.token);

  const created = [
    await createNotification(credentials.token, 1),
    await createNotification(credentials.token, 2),
  ];
  const unread = await unreadNotifications(credentials.token);
  for (const item of created) {
    if (!unread.items.some((candidate) => Number(candidate.nt_id) === Number(item.nt_id))) {
      fail('created notification was not returned by unread API', { item, unread });
    }
  }

  browser = await chromium.launch({ headless: true });
  const context = await browserContext(browser, credentials);
  const page = await context.newPage();
  const result = await verifyNotificationBell(page, credentials.token, created);
  await context.close();

  console.table([{ memberId: smokeMemberId, ...result }]);
  console.log(`[check-local-notification-actions] app=${appUrl}`);
  console.log(`[check-local-notification-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (credentials?.token) {
    try {
      await cleanupNotifications(credentials.token);
    } catch (error) {
      printFailure(error, 'check-local-notification-actions cleanup');
      exitCode = 1;
    }
  }
  try {
    seedSmokeMember();
  } catch (error) {
    printFailure(error, 'check-local-notification-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
