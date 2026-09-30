import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_MEMBER_LOGIN_ID || 'nextjs_member_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_MEMBER_LOGIN_PASSWORD || 'NextjsMemberSmoke123!';
const changedPassword =
  process.env.LOCAL_SMOKE_MEMBER_CHANGED_PASSWORD || 'NextjsMemberChanged123!';
const smokeRunId = `${Date.now()}`;

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-member-actions') {
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
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Member Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsMemberSmoke',
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

async function expectLoginFailure(password, label) {
  const { response, payload } = await fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: password }),
  });
  if (response.ok || payload?.success) {
    fail(`${label} unexpectedly succeeded`, {
      status: response.status,
      payload,
    });
  }
}

async function login(password = smokeMemberPassword) {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: password }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail('member smoke login did not return a token');
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

async function waitForResponseAfterAction(page, label, predicate, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(predicate),
      action(),
    ]);
    return response;
  } catch (error) {
    const runtime = await page
      .evaluate(() => ({
        href: window.location.href,
        pathname: window.location.pathname,
        runtimeConfig: window.__G5_NEXTJS25_CONFIG__ || null,
        text: document.body?.innerText?.slice(0, 2000) || '',
      }))
      .catch(() => null);
    fail(`${label} API response was not observed`, {
      error: error instanceof Error ? error.message : String(error),
      runtime,
    });
  }
}

async function waitForVisible(page, selector, label) {
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 15000 });
  } catch (error) {
    const runtime = await page
      .evaluate(() => ({
        href: window.location.href,
        pathname: window.location.pathname,
        runtimeConfig: window.__G5_NEXTJS25_CONFIG__ || null,
        text: document.body?.innerText?.slice(0, 2000) || '',
      }))
      .catch(() => null);
    fail(`${label} was not visible`, {
      selector,
      error: error instanceof Error ? error.message : String(error),
      runtime,
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

async function verifyMemberApi(token, expected) {
  const payload = await apiJson('/members/me', {
    headers: authHeaders(token),
  });
  const member = payload.data?.member;
  if (!member || member.mb_id !== smokeMemberId) {
    fail('members/me did not return the smoke member', payload);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (member[key] !== value) {
      fail('members/me did not persist the expected profile field', {
        key,
        expected: value,
        actual: member[key],
        member,
      });
    }
  }
  return member;
}

async function updateProfileInBrowser(page, token) {
  const nextProfile = {
    mb_nick: `MemberSmoke${smokeRunId.slice(-6)}`,
    mb_name: `Nextjs Member ${smokeRunId.slice(-6)}`,
    mb_email: `${smokeMemberId}+${smokeRunId}@example.test`,
  };

  await page.goto(`${appUrl}/mypage/profile`, { waitUntil: 'networkidle' });
  await waitForVisible(page, '#mb_email', 'member profile form');
  await page.locator('#mb_nick').fill(nextProfile.mb_nick);
  await page.locator('#mb_name').fill(nextProfile.mb_name);
  await page.locator('#mb_email').fill(nextProfile.mb_email);
  // Changing the email requires the current password (profile/page.tsx guards
  // emailChanged with mb_password_current), so provide it before submitting.
  await page.locator('#mb_password_current').fill(smokeMemberPassword);

  const response = await waitForResponseAfterAction(
    page,
    'member profile update',
    (candidate) =>
      candidate.url().replace(/\/+$/, '').endsWith('/members/me') &&
      candidate.request().method() === 'PATCH',
    () => page.locator('form button[type="submit"]').last().click()
  );
  await assertOkResponse(response, 'member profile update');

  await verifyMemberApi(token, nextProfile);
  return nextProfile;
}

async function updatePasswordInBrowser(page) {
  await page.goto(`${appUrl}/mypage/password`, { waitUntil: 'networkidle' });
  await waitForVisible(page, '#mb_password_re', 'member password form');
  await page.locator('#mb_password_current').fill(smokeMemberPassword);
  await page.locator('#mb_password').fill(changedPassword);
  await page.locator('#mb_password_re').fill(changedPassword);

  const response = await waitForResponseAfterAction(
    page,
    'member password update',
    (candidate) =>
      candidate.url().replace(/\/+$/, '').endsWith('/members/me') &&
      candidate.request().method() === 'PATCH',
    () => page.locator('form button[type="submit"]').last().click()
  );
  await assertOkResponse(response, 'member password update');

  await expectLoginFailure(smokeMemberPassword, 'old password login after password change');
  await login(changedPassword);
}

let browser = null;
let credentials = null;
let exitCode = 0;

try {
  seedSmokeMember();
  credentials = await login();
  await verifyMemberApi(credentials.token, {
    mb_nick: 'NextjsMemberSmoke',
    mb_name: 'Nextjs Member Smoke',
    mb_email: `${smokeMemberId}@example.test`,
  });

  browser = await chromium.launch({ headless: true });
  const context = await browserContext(browser, credentials);
  const page = await context.newPage();

  const profile = await updateProfileInBrowser(page, credentials.token);
  await updatePasswordInBrowser(page);
  await context.close();

  console.table([
    {
      memberId: smokeMemberId,
      nick: profile.mb_nick,
      password: 'changed-and-verified',
    },
  ]);
  console.log(`[check-local-member-actions] app=${appUrl}`);
  console.log(`[check-local-member-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  try {
    seedSmokeMember();
    await login(smokeMemberPassword);
  } catch (error) {
    printFailure(error, 'check-local-member-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
