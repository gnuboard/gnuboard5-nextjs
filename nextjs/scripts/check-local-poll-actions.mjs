import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_POLL_LOGIN_ID || 'nextjs_poll_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_POLL_LOGIN_PASSWORD || 'NextjsPollSmoke123!';
const smokeMarker = process.env.LOCAL_SMOKE_POLL_MARKER || 'nextjs-local-poll-smoke';
const pollSubject = process.env.LOCAL_SMOKE_POLL_SUBJECT || `${smokeMarker} question`;
const smokeRunId = `${Date.now()}`;

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-poll-actions') {
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
    LOCAL_SMOKE_LOGIN_EMAIL: `${smokeMemberId}@example.test`,
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs Poll Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsPollSmoke',
  });
}

function seedPoll() {
  return runPhp('seed_nextjs_smoke_poll.php', {
    LOCAL_SMOKE_POLL_MARKER: smokeMarker,
    LOCAL_SMOKE_POLL_SUBJECT: pollSubject,
  });
}

function cleanupPolls() {
  return runPhp('cleanup_nextjs_smoke_polls.php', {
    LOCAL_SMOKE_POLL_MARKER: smokeMarker,
    LOCAL_SMOKE_POLL_SUBJECT: pollSubject,
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

async function login() {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: smokeMemberPassword }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail('poll smoke member login did not return a token');
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

async function browserContext(browser, credentials) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);
  return context;
}

async function verifyPollApi(token, poId, expected) {
  const payload = await apiJson(`/polls/${poId}`, {
    headers: authHeaders(token),
  });
  const poll = payload.data;
  if (!poll || Number(poll.po_id) !== Number(poId) || poll.po_subject !== pollSubject) {
    fail('poll detail API did not return the smoke poll', {
      poId,
      pollSubject,
      poll,
    });
  }

  for (const [key, value] of Object.entries(expected)) {
    if (poll[key] !== value) {
      fail('poll detail API did not persist the expected field', {
        key,
        expected: value,
        actual: poll[key],
        poll,
      });
    }
  }
  return poll;
}

function optionByNum(poll, num) {
  return (poll.options || []).find((option) => Number(option.num) === Number(num));
}

function expectOptionCount(poll, optionNum, expectedCount) {
  const option = optionByNum(poll, optionNum);
  if (!option || Number(option.count) !== expectedCount) {
    fail('poll option count did not match', {
      optionNum,
      expectedCount,
      options: poll.options,
    });
  }
  return option;
}

async function verifyInitialPoll(token, seeded) {
  const poll = await verifyPollApi(token, seeded.po_id, {
    has_voted: false,
    can_vote: true,
    can_comment: true,
    total_count: 0,
  });

  const optionOne = optionByNum(poll, 1);
  const optionTwo = optionByNum(poll, 2);
  if (
    !optionOne ||
    !optionTwo ||
    optionOne.content !== seeded.option_one ||
    optionTwo.content !== seeded.option_two
  ) {
    fail('poll detail API did not expose the seeded options', {
      expected: seeded,
      options: poll.options,
    });
  }

  return poll;
}

async function voteInBrowser(page, token, seeded) {
  await page.goto(`${appUrl}/polls?po_id=${seeded.po_id}`, { waitUntil: 'networkidle' });
  await page.getByText(pollSubject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.locator('input[name="poll-option"][value="2"]').check();

  const voteResponse = await waitForResponseAfterAction(
    page,
    'poll vote',
    (response) =>
      response.url().replace(/\/+$/, '').endsWith(`/polls/${seeded.po_id}/vote`) &&
      response.request().method() === 'POST',
    () =>
      page
        .locator('form')
        .filter({ has: page.locator('input[name="poll-option"]') })
        .locator('button[type="submit"]')
        .click()
  );
  await assertOkResponse(voteResponse, 'poll vote');
  const votePayload = await voteResponse.json();
  const nextPoll = votePayload?.data;
  if (!nextPoll?.has_voted || nextPoll?.can_vote !== false || Number(nextPoll?.total_count) !== 1) {
    fail('poll vote response did not expose the voted state', nextPoll);
  }
  expectOptionCount(nextPoll, 2, 1);

  const persisted = await verifyPollApi(token, seeded.po_id, {
    has_voted: true,
    can_vote: false,
    total_count: 1,
  });
  expectOptionCount(persisted, 2, 1);
}

async function addCommentInBrowser(page, token, seeded) {
  const idea = `${smokeMarker} opinion ${smokeRunId}`;

  await page.goto(`${appUrl}/polls?po_id=${seeded.po_id}`, { waitUntil: 'networkidle' });
  await page.locator('#poll-idea').fill(idea);

  const commentResponse = await waitForResponseAfterAction(
    page,
    'poll comment create',
    (response) =>
      response.url().replace(/\/+$/, '').endsWith(`/polls/${seeded.po_id}/comments`) &&
      response.request().method() === 'POST',
    () =>
      page
        .locator('form')
        .filter({ has: page.locator('#poll-idea') })
        .locator('button[type="submit"]')
        .click()
  );
  await assertOkResponse(commentResponse, 'poll comment create');
  const commentPayload = await commentResponse.json();
  const nextPoll = commentPayload?.data;
  const comment = (nextPoll?.etc_comments || []).find((row) => row.pc_idea === idea);
  if (!comment || comment.mb_id !== smokeMemberId || comment.can_delete !== true) {
    fail('poll comment response did not expose the created owner comment', {
      idea,
      smokeMemberId,
      comments: nextPoll?.etc_comments,
    });
  }

  await page.getByText(idea, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const persisted = await verifyPollApi(token, seeded.po_id, {
    has_voted: true,
    can_vote: false,
    total_count: 1,
  });
  if (!(persisted.etc_comments || []).some((row) => Number(row.pc_id) === Number(comment.pc_id))) {
    fail('poll comment was not persisted in the detail API', {
      comment,
      comments: persisted.etc_comments,
    });
  }

  return { commentId: Number(comment.pc_id), idea };
}

async function deleteCommentInBrowser(page, token, seeded, created) {
  const commentRow = page.locator('div.flex.gap-3.p-4').filter({ hasText: created.idea }).last();
  await commentRow.waitFor({ state: 'visible', timeout: 10000 });
  const deleteButton = commentRow.locator('button[aria-label]').last();
  await deleteButton.waitFor({ state: 'visible', timeout: 10000 });

  const deleteResponse = await waitForResponseAfterAction(
    page,
    'poll comment delete',
    (response) =>
      response
        .url()
        .replace(/\/+$/, '')
        .endsWith(`/polls/${seeded.po_id}/comments/${created.commentId}`) &&
      response.request().method() === 'DELETE',
    () => deleteButton.click()
  );
  await assertOkResponse(deleteResponse, 'poll comment delete');
  const deletePayload = await deleteResponse.json();
  const nextComments = deletePayload?.data?.etc_comments || [];
  if (nextComments.some((row) => Number(row.pc_id) === Number(created.commentId))) {
    fail('poll comment delete response still includes the deleted comment', {
      created,
      comments: nextComments,
    });
  }

  const persisted = await verifyPollApi(token, seeded.po_id, {
    has_voted: true,
    can_vote: false,
    total_count: 1,
  });
  if ((persisted.etc_comments || []).some((row) => Number(row.pc_id) === Number(created.commentId))) {
    fail('deleted poll comment still appears in the detail API', {
      created,
      comments: persisted.etc_comments,
    });
  }
}

let browser = null;
let credentials = null;
let seededPoll = null;
let exitCode = 0;

try {
  seedSmokeMember();
  cleanupPolls();
  seededPoll = seedPoll();
  credentials = await login();
  await verifyInitialPoll(credentials.token, seededPoll);

  browser = await chromium.launch({ headless: true });
  const context = await browserContext(browser, credentials);
  const page = await context.newPage();

  await voteInBrowser(page, credentials.token, seededPoll);
  const created = await addCommentInBrowser(page, credentials.token, seededPoll);
  await deleteCommentInBrowser(page, credentials.token, seededPoll, created);
  await context.close();

  console.table([
    {
      poId: seededPoll.po_id,
      subject: pollSubject,
      status: 'voted-commented-deleted',
    },
  ]);
  console.log(`[check-local-poll-actions] app=${appUrl}`);
  console.log(`[check-local-poll-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  try {
    cleanupPolls();
  } catch (error) {
    printFailure(error, 'check-local-poll-actions cleanup');
    exitCode = 1;
  }
  try {
    seedSmokeMember();
  } catch (error) {
    printFailure(error, 'check-local-poll-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
