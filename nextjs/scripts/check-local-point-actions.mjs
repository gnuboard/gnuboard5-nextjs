import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_POINT_LOGIN_ID || 'nextjs_point_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_POINT_LOGIN_PASSWORD || 'NextjsPointSmoke123!';
const smokeMarker = process.env.LOCAL_SMOKE_POINT_MARKER || 'nextjs-local-point-smoke';

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-point-actions') {
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
      LOCAL_SMOKE_POINT_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_POINT_MARKER: smokeMarker,
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

function seedSmokeMember(point = '0') {
  return runPhp('seed_nextjs_smoke_user.php', {
    LOCAL_SMOKE_LOGIN_ID: smokeMemberId,
    LOCAL_SMOKE_LOGIN_PASSWORD: smokeMemberPassword,
    LOCAL_SMOKE_LOGIN_EMAIL: `${smokeMemberId}@example.test`,
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Point Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsPointSmoke',
    LOCAL_SMOKE_LOGIN_POINT: point,
  });
}

function seedPoints() {
  return runPhp('seed_nextjs_smoke_points.php');
}

function cleanupPoints(args = []) {
  return runPhp('cleanup_nextjs_smoke_points.php', {}, args);
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

async function login() {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: smokeMemberPassword }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail('point smoke member login did not return a token');
  }
  return {
    token,
    refreshToken,
    member: payload.data?.member || payload.data?.user || {},
  };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function verifyPointApi(token, seeded) {
  const payload = await apiJson('/members/me/points?per_page=50', {
    headers: authHeaders(token),
  });
  const items = payload.data || [];
  const earn = items.find((item) => item.po_content === `${smokeMarker} earn`);
  const used = items.find((item) => item.po_content === `${smokeMarker} use`);

  if (
    !earn ||
    !used ||
    Number(earn.po_point) !== Number(seeded.earn_point) ||
    Number(earn.po_mb_point) !== Number(seeded.earn_point) ||
    Number(used.po_use_point) !== Number(seeded.use_point) ||
    Number(used.po_mb_point) !== Number(seeded.balance)
  ) {
    fail('point API did not expose the seeded point ledger', {
      seeded,
      items,
    });
  }

  const me = await apiJson('/auth/me', {
    headers: authHeaders(token),
  });
  if (Number(me.data?.member?.mb_point) !== Number(seeded.balance)) {
    fail('auth user balance did not match seeded point balance', {
      seeded,
      member: me.data?.member,
    });
  }

  return { earn, used };
}

async function verifyBrowser(credentials, seeded) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: 'block',
    });
    await seedBrowserAuth(context, credentials, appUrl);

    const page = await context.newPage();
    const authReady = page
      .waitForResponse(
        (response) =>
          response.url().includes('/auth/me') &&
          response.request().method() === 'GET' &&
          response.status() === 200,
        { timeout: 10000 }
      )
      .catch(() => null);

    await page.goto(`${appUrl}/mypage/points`, { waitUntil: 'networkidle' });
    await authReady;
    await page.getByText(`${smokeMarker} earn`, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.getByText(`${smokeMarker} use`, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const body = await page.locator('body').innerText({ timeout: 10000 });
    for (const expected of ['1,500', '300', '1,200']) {
      if (!body.includes(expected)) {
        fail('point page did not render expected formatted point value', {
          expected,
          body: body.slice(0, 2000),
          seeded,
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

let credentials = null;
let exitCode = 0;

try {
  seedSmokeMember('0');
  cleanupPoints();
  const seeded = seedPoints();
  credentials = await login();
  if (Number(credentials.member?.mb_point) !== Number(seeded.balance)) {
    fail('login response did not include the seeded point balance', {
      seeded,
      member: credentials.member,
    });
  }

  const rows = await verifyPointApi(credentials.token, seeded);
  await verifyBrowser(credentials, seeded);

  console.table([
    {
      memberId: smokeMemberId,
      earnPointId: rows.earn.po_id,
      usePointId: rows.used.po_id,
      balance: seeded.balance,
    },
  ]);
  console.log(`[check-local-point-actions] app=${appUrl}`);
  console.log(`[check-local-point-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  try {
    cleanupPoints();
  } catch (error) {
    printFailure(error, 'check-local-point-actions cleanup');
    exitCode = 1;
  }
  try {
    seedSmokeMember('0');
  } catch (error) {
    printFailure(error, 'check-local-point-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
