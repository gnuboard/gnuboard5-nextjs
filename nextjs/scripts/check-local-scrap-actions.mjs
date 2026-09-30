import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_SCRAP_LOGIN_ID || 'nextjs_scrap_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_SCRAP_LOGIN_PASSWORD || 'NextjsScrapSmoke123!';
const smokeBoard = process.env.LOCAL_SMOKE_SCRAP_BOARD || 'free';
const smokePostId = process.env.LOCAL_SMOKE_SCRAP_WR_ID || '6';

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-scrap-actions') {
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
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Scrap Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsScrapSmoke',
  });
}

function cleanupScraps() {
  return runPhp('cleanup_nextjs_smoke_scraps.php', {
    LOCAL_SMOKE_SCRAP_LOGIN_ID: smokeMemberId,
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

async function login() {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: smokeMemberPassword }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail('scrap smoke member login did not return a token');
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

async function getTargetPost(token) {
  const payload = await apiJson(
    `/posts/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(smokePostId)}`,
    { headers: authHeaders(token) }
  );
  if (!payload.data?.wr_id || !payload.data?.wr_subject) {
    fail('scrap target post was not returned by the API', payload);
  }
  if (payload.data.is_scrapped) {
    fail('scrap target was already scrapped after cleanup', payload.data);
  }
  return payload.data;
}

async function getScrapStatus(token) {
  const payload = await apiJson(
    `/scraps/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(smokePostId)}`,
    { headers: authHeaders(token) }
  );
  return payload.data || {};
}

async function getScraps(token) {
  const payload = await apiJson('/scraps?per_page=50', {
    headers: authHeaders(token),
  });
  return payload.data || [];
}

async function waitForScrapState(token, expected) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = await getScrapStatus(token);
    if (!!status.scrapped === expected) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(`scrap status did not become ${expected}`, await getScrapStatus(token));
}

async function verifyPostDetailToggle(page, token, post) {
  const authReady = page
    .waitForResponse(
      (response) =>
        response.url().includes('/auth/me') &&
        response.request().method() === 'GET' &&
        response.status() === 200,
      { timeout: 10000 }
    )
    .catch(() => null);

  await page.goto(`${appUrl}/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(smokePostId)}`, {
    waitUntil: 'networkidle',
  });
  await authReady;
  await page.getByText(post.wr_subject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const addResponse = await waitForResponseAfterAction(
    page,
    'scrap add from post detail',
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/scraps') &&
        response.request().method() === 'POST',
    () => page.locator('button[aria-label="스크랩"]').first().click()
  );
  await assertOkResponse(addResponse, 'scrap add from post detail');
  let status = await waitForScrapState(token, true);
  const firstScrapId = Number(status.scrap?.ms_id || 0);
  if (!firstScrapId) {
    fail('scrap add did not return a persisted scrap row', status);
  }

  const postAfterAdd = await apiJson(
    `/posts/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(smokePostId)}`,
    { headers: authHeaders(token) }
  );
  if (!postAfterAdd.data?.is_scrapped || Number(postAfterAdd.data?.scrap_id) !== firstScrapId) {
    fail('post detail API did not expose the scrapped state', postAfterAdd.data);
  }

  const detailDeleteResponse = await waitForResponseAfterAction(
    page,
    'scrap delete from post detail',
      (response) =>
        response.url().includes(
          `/scraps/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(smokePostId)}`
        ) && response.request().method() === 'DELETE',
    () => page.locator('button[aria-label="스크랩 삭제"]').first().click()
  );
  await assertOkResponse(detailDeleteResponse, 'scrap delete from post detail');
  await waitForScrapState(token, false);

  const secondAddResponse = await waitForResponseAfterAction(
    page,
    'scrap add before mypage delete',
      (response) =>
        response.url().replace(/\/+$/, '').endsWith('/scraps') &&
        response.request().method() === 'POST',
    () => page.locator('button[aria-label="스크랩"]').first().click()
  );
  await assertOkResponse(secondAddResponse, 'scrap add before mypage delete');
  status = await waitForScrapState(token, true);
  const secondScrapId = Number(status.scrap?.ms_id || 0);
  if (!secondScrapId) {
    fail('second scrap add did not return a persisted scrap row', status);
  }

  return { firstScrapId, secondScrapId };
}

async function verifyMypageListAndDelete(page, token, post, scrapId) {
  await page.goto(`${appUrl}/mypage/scraps`, { waitUntil: 'networkidle' });
  await page.getByText(post.wr_subject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const scraps = await getScraps(token);
  const persisted = scraps.find((item) => Number(item.ms_id) === scrapId);
  if (
    !persisted ||
    persisted.bo_table !== smokeBoard ||
    Number(persisted.wr_id) !== Number(smokePostId) ||
    persisted.wr_subject !== post.wr_subject
  ) {
    fail('mypage scrap list API did not include the expected scrap', scraps);
  }

  page.once('dialog', (dialog) => dialog.accept());
  const deleteResponse = await waitForResponseAfterAction(
    page,
    'scrap delete from mypage',
      (response) =>
        response.url().includes(`/scraps/${scrapId}`) &&
        response.request().method() === 'DELETE',
    () => page.getByRole('button', { name: '스크랩 삭제' }).first().click()
  );
  await assertOkResponse(deleteResponse, 'scrap delete from mypage');
  await waitForScrapState(token, false);

  const remaining = await getScraps(token);
  if (remaining.some((item) => Number(item.ms_id) === scrapId)) {
    fail('scrap still exists after mypage delete', remaining);
  }
}

let browser = null;
let credentials = null;
let exitCode = 0;

try {
  seedSmokeMember();
  cleanupScraps();
  credentials = await login();
  const post = await getTargetPost(credentials.token);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);

  const page = await context.newPage();
  const toggleResult = await verifyPostDetailToggle(page, credentials.token, post);
  await verifyMypageListAndDelete(page, credentials.token, post, toggleResult.secondScrapId);
  await context.close();

  console.table([
    {
      board: smokeBoard,
      postId: smokePostId,
      firstScrapId: toggleResult.firstScrapId,
      secondScrapId: toggleResult.secondScrapId,
    },
  ]);
  console.log(`[check-local-scrap-actions] app=${appUrl}`);
  console.log(`[check-local-scrap-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  try {
    cleanupScraps();
  } catch (error) {
    printFailure(error, 'check-local-scrap-actions cleanup');
    exitCode = 1;
  }
  try {
    seedSmokeMember();
  } catch (error) {
    printFailure(error, 'check-local-scrap-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
