import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeBoard = process.env.LOCAL_SMOKE_REACTION_BOARD || 'board';
const smokeMarker =
  process.env.LOCAL_SMOKE_REACTION_MARKER || 'Next.js post reaction smoke';
const smokeRunId = `${Date.now()}`;

const author = {
  id: process.env.LOCAL_SMOKE_REACTION_AUTHOR_ID || 'nextjs_react_author',
  password:
    process.env.LOCAL_SMOKE_REACTION_AUTHOR_PASSWORD || 'NextjsReactAuthor123!',
  email: 'nextjs_react_author@example.test',
  name: 'Nextjs Reaction Author',
  nick: 'NextjsReactAuthor',
};
const goodVoter = {
  id: process.env.LOCAL_SMOKE_REACTION_GOOD_ID || 'nextjs_react_good',
  password:
    process.env.LOCAL_SMOKE_REACTION_GOOD_PASSWORD || 'NextjsReactGood123!',
  email: 'nextjs_react_good@example.test',
  name: 'Nextjs Reaction Good',
  nick: 'NextjsReactGood',
};
const nogoodVoter = {
  id: process.env.LOCAL_SMOKE_REACTION_NOGOOD_ID || 'nextjs_react_nogood',
  password:
    process.env.LOCAL_SMOKE_REACTION_NOGOOD_PASSWORD || 'NextjsReactNogood123!',
  email: 'nextjs_react_nogood@example.test',
  name: 'Nextjs Reaction Nogood',
  nick: 'NextjsReactNogood',
};

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-post-reaction-actions') {
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

function seedMember(member) {
  return runPhp('seed_nextjs_smoke_user.php', {
    LOCAL_SMOKE_LOGIN_ID: member.id,
    LOCAL_SMOKE_LOGIN_PASSWORD: member.password,
    LOCAL_SMOKE_LOGIN_EMAIL: member.email,
    LOCAL_SMOKE_LOGIN_NAME: member.name,
    LOCAL_SMOKE_LOGIN_NICK: member.nick,
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

async function login(member) {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: member.id, mb_password: member.password }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail(`${member.id} login did not return a token`);
  }
  return { token, refreshToken, member };
}

function authHeaders(credentials) {
  return { Authorization: `Bearer ${credentials.token}` };
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

async function browserContext(browser, credentials) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);
  return context;
}

async function cleanupSmokePosts(credentials, state = {}) {
  const headers = authHeaders(credentials);
  const posts = await apiJson(
    `/boards/${encodeURIComponent(smokeBoard)}/posts?sfl=wr_subject&stx=${encodeURIComponent(smokeMarker)}&per_page=50`,
    { headers }
  );

  const ids = new Set();
  if (state.postId) {
    ids.add(Number(state.postId));
  }
  for (const post of posts.data || []) {
    if (String(post.wr_subject || '').includes(smokeMarker)) {
      ids.add(Number(post.wr_id));
    }
  }

  for (const wrId of ids) {
    if (!wrId) continue;
    const inspected = await fetchApi(
      `/posts/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(String(wrId))}`,
      { headers }
    );
    if (inspected.response.status === 404) continue;
    if (!inspected.response.ok || !inspected.payload?.success) {
      fail('failed to inspect smoke reaction post before cleanup', {
        wrId,
        status: inspected.response.status,
        payload: inspected.payload,
      });
    }

    const post = inspected.payload.data;
    if (
      post.mb_id !== author.id ||
      !String(post.wr_subject || '').includes(smokeMarker)
    ) {
      fail('refusing to delete a non-smoke reaction post during cleanup', post);
    }

    await apiOk(`/posts/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(String(wrId))}`, {
      method: 'DELETE',
      headers,
    });
  }
}

async function createSmokePost(credentials, state) {
  const subject = `${smokeMarker} ${smokeRunId}`;
  const content = `${smokeMarker} body ${smokeRunId}`;
  const payload = await apiJson(`/boards/${encodeURIComponent(smokeBoard)}/posts`, {
    method: 'POST',
    headers: authHeaders(credentials),
    body: JSON.stringify({
      wr_subject: subject,
      wr_content: content,
    }),
  });

  const postId = Number(payload.data?.wr_id || 0);
  if (!postId) {
    fail('reaction smoke post create did not return wr_id', payload);
  }
  state.postId = postId;

  return { postId, subject, content };
}

async function getPost(credentials, postId) {
  const payload = await apiJson(
    `/posts/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(String(postId))}`,
    { headers: authHeaders(credentials) }
  );
  return payload.data;
}

async function verifyPostCounts(credentials, postId, expected) {
  const post = await getPost(credentials, postId);
  for (const [key, value] of Object.entries(expected)) {
    if (Number(post[key]) !== Number(value)) {
      fail('post reaction count did not match', {
        key,
        expected: value,
        actual: post[key],
        post,
      });
    }
  }
  if (Number(post.bo_use_good) !== 1 || Number(post.bo_use_nogood) !== 1) {
    fail('post detail API did not expose enabled reaction settings', post);
  }
  return post;
}

async function voteInBrowser(browser, credentials, created, type, expected) {
  const context = await browserContext(browser, credentials);
  const page = await context.newPage();

  await page.goto(
    `${appUrl}/${encodeURIComponent(smokeBoard)}/${encodeURIComponent(String(created.postId))}`,
    { waitUntil: 'networkidle' }
  );
  await page.getByText(created.subject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const voteButtons = page.locator('div.flex.items-center.justify-center.gap-4 button');
  await voteButtons.first().waitFor({ state: 'visible', timeout: 10000 });
  const button = type === 'good' ? voteButtons.nth(0) : voteButtons.nth(1);
  await button.waitFor({ state: 'visible', timeout: 10000 });

  const response = await waitForResponseAfterAction(
    page,
    `post ${type}`,
    (candidate) =>
      candidate
        .url()
        .replace(/\/+$/, '')
        .endsWith(`/posts/${smokeBoard}/${created.postId}/${type}`) &&
      candidate.request().method() === 'POST',
    () => button.click()
  );
  await assertOkResponse(response, `post ${type}`);
  const payload = await response.json();
  if (
    payload?.data?.flag !== type ||
    Number(payload?.data?.wr_good) !== Number(expected.wr_good) ||
    Number(payload?.data?.wr_nogood) !== Number(expected.wr_nogood)
  ) {
    fail(`post ${type} response did not expose expected counts`, {
      expected,
      payload,
    });
  }

  await context.close();
  return payload.data;
}

let browser = null;
let authorCredentials = null;
let exitCode = 0;
const state = { postId: null };

try {
  seedMember(author);
  seedMember(goodVoter);
  seedMember(nogoodVoter);

  authorCredentials = await login(author);
  const goodCredentials = await login(goodVoter);
  const nogoodCredentials = await login(nogoodVoter);

  await cleanupSmokePosts(authorCredentials, state);
  const created = await createSmokePost(authorCredentials, state);
  await verifyPostCounts(authorCredentials, created.postId, {
    wr_good: 0,
    wr_nogood: 0,
  });

  browser = await chromium.launch({ headless: true });
  await voteInBrowser(browser, goodCredentials, created, 'good', {
    wr_good: 1,
    wr_nogood: 0,
  });
  await verifyPostCounts(authorCredentials, created.postId, {
    wr_good: 1,
    wr_nogood: 0,
  });
  await voteInBrowser(browser, nogoodCredentials, created, 'nogood', {
    wr_good: 1,
    wr_nogood: 1,
  });
  await verifyPostCounts(authorCredentials, created.postId, {
    wr_good: 1,
    wr_nogood: 1,
  });

  console.table([
    {
      board: smokeBoard,
      postId: created.postId,
      status: 'good-and-nogood',
    },
  ]);
  console.log(`[check-local-post-reaction-actions] app=${appUrl}`);
  console.log(`[check-local-post-reaction-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (authorCredentials) {
    try {
      await cleanupSmokePosts(authorCredentials, state);
    } catch (error) {
      printFailure(error, 'check-local-post-reaction-actions cleanup');
      exitCode = 1;
    }
  }
  for (const member of [author, goodVoter, nogoodVoter]) {
    try {
      seedMember(member);
    } catch (error) {
      printFailure(error, 'check-local-post-reaction-actions reset');
      exitCode = 1;
    }
  }
}

process.exit(exitCode);
