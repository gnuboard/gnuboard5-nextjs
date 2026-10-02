import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_AUTH_LOGIN_ID || 'nextjs_auth_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_AUTH_LOGIN_PASSWORD || 'NextjsAuthSmoke123!';
const changedPassword =
  process.env.LOCAL_SMOKE_AUTH_CHANGED_PASSWORD || 'NextjsAuthChanged123!';
const smokeMemberEmail =
  process.env.LOCAL_SMOKE_AUTH_LOGIN_EMAIL || `${smokeMemberId}@example.test`;
const smokeRunId = `${Date.now()}`;

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-auth-actions') {
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

function seedSmokeMember() {
  return runPhp('seed_nextjs_smoke_user.php', {
    LOCAL_SMOKE_LOGIN_ID: smokeMemberId,
    LOCAL_SMOKE_LOGIN_PASSWORD: smokeMemberPassword,
    LOCAL_SMOKE_LOGIN_EMAIL: smokeMemberEmail,
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Auth Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsAuthSmoke',
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
    // no JSON body
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

async function login(password = smokeMemberPassword) {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: password }),
  });
  const token = payload.data?.token;
  if (!token) {
    fail('auth smoke login did not return a token');
  }
  return token;
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

async function assertOkResponse(response, label) {
  if (!response.ok()) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // The status and URL still identify the failure.
    }
    fail(`${label} response failed`, {
      status: response.status(),
      url: response.url(),
      body,
    });
  }
}

function requestBody(request) {
  try {
    return request.postDataJSON();
  } catch {
    return null;
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
        text: document.body?.innerText?.slice(0, 2000) || '',
      }))
      .catch(() => null);
    fail(`${label} API response was not observed`, {
      error: error instanceof Error ? error.message : String(error),
      runtime,
    });
  }
}

async function fillRegisterForm(page) {
  const suffix = smokeRunId.slice(-8);
  const memberId = `nextjs_reg_${suffix}`;
  const password = `RegSmoke${suffix}1!`;

  await page.goto(`${appUrl}/register`, { waitUntil: 'networkidle' });
  await page.locator('#mb_id').fill(memberId);
  await page.locator('#mb_password').fill(password);
  await page.locator('#mb_password_re').fill(password);
  await page.locator('#mb_nick').fill(`Reg${suffix}`);
  await page.locator('#mb_name').fill(`Reg ${suffix}`);
  await page.locator('#mb_email').fill(`${memberId}@example.test`);
  await page.locator('#captcha_key').fill('000000');

  return { memberId, password };
}

async function verifyRegisterConsent(page) {
  const { memberId } = await fillRegisterForm(page);
  const registerRequests = [];
  page.on('request', (request) => {
    if (
      request.url().replace(/\/+$/, '').endsWith('/auth/register') &&
      request.method() === 'POST'
    ) {
      registerRequests.push(request);
    }
  });

  await page.locator('form button[type="submit"]').last().click();
  await page.waitForTimeout(700);
  if (registerRequests.length > 0) {
    fail('register form submitted before required agreements were checked', {
      requestCount: registerRequests.length,
      requestBody: requestBody(registerRequests[0]),
    });
  }
  await page.getByText('이용약관에 동의해주세요.').waitFor({ state: 'visible' });
  await page.getByText('개인정보처리방침에 동의해주세요.').waitFor({ state: 'visible' });

  // The agreement inputs are visually-hidden (`sr-only`) and toggled via their
  // associated label, so click the label like a real user instead of
  // force-clicking the hidden input (which the styled peer element overlays).
  await page.locator('label[for="agree_terms"]').click();
  await page.locator('label[for="agree_privacy"]').click();
  await page.locator('#agree_terms').waitFor({ state: 'attached' });
  if (!(await page.locator('#agree_terms').isChecked())) {
    await page.locator('#agree_terms').setChecked(true, { force: true });
  }
  if (!(await page.locator('#agree_privacy').isChecked())) {
    await page.locator('#agree_privacy').setChecked(true, { force: true });
  }

  const response = await waitForResponseAfterAction(
    page,
    'register consent submit',
    (candidate) =>
      candidate.url().replace(/\/+$/, '').endsWith('/auth/register') &&
      candidate.request().method() === 'POST',
    () => page.locator('form button[type="submit"]').last().click()
  );

  const body = requestBody(response.request());
  if (
    body?.mb_id !== memberId ||
    body?.agree_terms !== true ||
    body?.agree_privacy !== true
  ) {
    fail('register request did not include the required agreement fields', body);
  }

  const payload = await response.json().catch(() => null);
  if (response.status() !== 422 || !payload?.errors?.captcha_key) {
    fail('register request did not reach captcha validation after agreements', {
      status: response.status(),
      payload,
    });
  }
  if (payload.errors?.agree_terms || payload.errors?.agree_privacy) {
    fail('register request still failed agreement validation', payload);
  }

  return { memberId, captchaError: payload.errors.captcha_key };
}

async function verifyPasswordReset(page) {
  await page.goto(`${appUrl}/forgot-password`, { waitUntil: 'networkidle' });
  await page.locator('#mb_id').fill(smokeMemberId);
  await page.locator('#mb_email').fill(smokeMemberEmail);

  const requestResponse = await waitForResponseAfterAction(
    page,
    'password reset request',
    (candidate) => {
      const body = requestBody(candidate.request());
      return (
        candidate.url().replace(/\/+$/, '').endsWith('/auth/password-reset') &&
        candidate.request().method() === 'POST' &&
        body?.step === 'request'
      );
    },
    () => page.locator('form button[type="submit"]').last().click()
  );
  await assertOkResponse(requestResponse, 'password reset request');

  await page.locator('#mb_password').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#mb_password').fill(changedPassword);
  await page.locator('#mb_password_re').fill(changedPassword);

  const resetResponse = await waitForResponseAfterAction(
    page,
    'password reset submit',
    (candidate) => {
      const body = requestBody(candidate.request());
      return (
        candidate.url().replace(/\/+$/, '').endsWith('/auth/password-reset') &&
        candidate.request().method() === 'POST' &&
        body?.step === 'reset'
      );
    },
    () => page.locator('form button[type="submit"]').last().click()
  );
  await assertOkResponse(resetResponse, 'password reset submit');

  await page.getByRole('button', { name: '로그인하기' }).waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await expectLoginFailure(smokeMemberPassword, 'old password login after reset');
  await login(changedPassword);

  return { memberId: smokeMemberId, password: 'reset-and-verified' };
}

let browser = null;
let exitCode = 0;

try {
  seedSmokeMember();
  await login();

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  const results = [];
  results.push(await verifyRegisterConsent(page));
  results.push(await verifyPasswordReset(page));
  await context.close();

  console.table(results);
  console.log(`[check-local-auth-actions] app=${appUrl}`);
  console.log(`[check-local-auth-actions] api=${expectedApiUrl}`);
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
    printFailure(error, 'check-local-auth-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
