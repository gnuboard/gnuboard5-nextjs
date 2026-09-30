import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_QA_LOGIN_ID || 'nextjs_qa_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_QA_LOGIN_PASSWORD || 'NextjsQaSmoke123!';
const smokeMarker = process.env.LOCAL_SMOKE_QA_MARKER || 'nextjs-local-qa-smoke';
const smokeRunId = `${Date.now()}`;

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function printFailure(error, prefix = 'check-local-qa-actions') {
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
    LOCAL_SMOKE_LOGIN_NAME: 'Nextjs QA Smoke',
    LOCAL_SMOKE_LOGIN_NICK: 'NextjsQaSmoke',
  });
}

function cleanupQas() {
  return runPhp('cleanup_nextjs_smoke_qas.php', {
    LOCAL_SMOKE_QA_LOGIN_ID: smokeMemberId,
    LOCAL_SMOKE_QA_MARKER: smokeMarker,
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

async function expectApiMissing(path, options = {}, label = path) {
  const { response, payload } = await fetchApi(path, options);
  if (response.status !== 404 || payload?.success) {
    fail(`${label} still exists`, {
      status: response.status,
      payload,
    });
  }
}

async function login() {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mb_id: smokeMemberId, mb_password: smokeMemberPassword }),
  });
  const token = payload.data?.token;
  const refreshToken = payload.data?.refresh_token;
  if (!token) {
    fail('Q&A smoke member login did not return a token');
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

async function currentQaConfig(token) {
  const payload = await apiJson('/qas/config', {
    headers: authHeaders(token),
  });
  return payload.data || {};
}

async function verifyQaApi(token, qaId, expected) {
  const payload = await apiJson(`/qas/${qaId}`, {
    headers: authHeaders(token),
  });
  const qa = payload.data;
  if (!qa || qa.mb_id !== smokeMemberId) {
    fail('Q&A detail API did not return the smoke member item', qa);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (qa[key] !== value) {
      fail('Q&A detail API did not persist the expected field', {
        key,
        expected: value,
        actual: qa[key],
        qa,
      });
    }
  }
  return qa;
}

async function verifyQaList(token, qaId, subject) {
  const payload = await apiJson('/qas?per_page=50', {
    headers: authHeaders(token),
  });
  const item = (payload.data || []).find((row) => Number(row.qa_id) === Number(qaId));
  if (!item || item.qa_subject !== subject) {
    fail('Q&A list API did not include the expected item', {
      qaId,
      subject,
      items: payload.data,
    });
  }
  return item;
}

async function fillOptionalContactFields(page, config) {
  const emailInput = page.locator('#qa_email');
  if ((await emailInput.count()) > 0 && (await emailInput.first().isVisible())) {
    await emailInput.first().fill(`${smokeMemberId}@example.test`);
  }

  const hpInput = page.locator('#qa_hp');
  if ((await hpInput.count()) > 0 && (await hpInput.first().isVisible())) {
    await hpInput.first().fill('010-3333-4444');
  }

  const categorySelect = page.locator('#qa_category');
  if ((await categorySelect.count()) > 0 && (await categorySelect.first().isVisible())) {
    const category = config.categories?.[0] || '';
    if (category) {
      await categorySelect.first().selectOption(category);
    }
  }
}

async function createQaInBrowser(page, token, config) {
  const subject = `${smokeMarker} subject ${smokeRunId}`;
  const content = `${smokeMarker} content ${smokeRunId}`;
  const attachmentName = `${smokeMarker}-${smokeRunId}.txt`;

  await page.goto(`${appUrl}/mypage/qas/new`, { waitUntil: 'networkidle' });
  await page.locator('#qa_subject').fill(subject);
  await page.locator('#qa_content').fill(content);
  await page.locator('#bf_file_1').setInputFiles({
    name: attachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`${content}\nattachment smoke\n`, 'utf8'),
  });
  await fillOptionalContactFields(page, config);

  const createResponse = await waitForResponseAfterAction(
    page,
    'Q&A create',
    (response) =>
      response.url().replace(/\/+$/, '').endsWith('/qas') &&
      response.request().method() === 'POST',
    () => page.locator('form button[type="submit"]').last().click()
  );
  await assertOkResponse(createResponse, 'Q&A create');
  const createPayload = await createResponse.json();
  const qaId = Number(createPayload?.data?.qa_id || 0);
  if (!qaId) {
    fail('Q&A create did not return a qa_id', createPayload);
  }

  await page.waitForURL(new RegExp(`/mypage/qas/${qaId}$`), { timeout: 10000 });
  await page.getByText(subject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.getByText(content, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  const qa = await verifyQaApi(token, qaId, {
    qa_subject: subject,
    qa_content: content,
    qa_status: 0,
  });
  if (qa.qa_source1 !== attachmentName || !qa.qa_file1 || !qa.qa_file1_url) {
    fail('Q&A create did not persist the uploaded attachment', {
      attachmentName,
      qa,
    });
  }
  await verifyQaList(token, qaId, subject);

  return { qaId, subject, content };
}

async function updateQaInBrowser(page, token, created, config) {
  const updatedSubject = `${created.subject} updated`;
  const updatedContent = `${created.content} updated by browser flow`;

  await page.goto(`${appUrl}/mypage/qas/${created.qaId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '수정' }).click();
  await page.locator('#qa_subject').fill(updatedSubject);
  await page.locator('#qa_content').fill(updatedContent);
  await fillOptionalContactFields(page, config);

  const updateResponse = await waitForResponseAfterAction(
    page,
    'Q&A update',
    (response) =>
      response.url().replace(/\/+$/, '').endsWith(`/qas/${created.qaId}`) &&
      response.request().method() === 'PATCH',
    () => page.locator('form button[type="submit"]').last().click()
  );
  await assertOkResponse(updateResponse, 'Q&A update');

  await page.getByText(updatedSubject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.getByText('updated by browser flow', { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  await verifyQaApi(token, created.qaId, {
    qa_subject: updatedSubject,
    qa_content: updatedContent,
    qa_status: 0,
  });
  await verifyQaList(token, created.qaId, updatedSubject);

  return { ...created, subject: updatedSubject, content: updatedContent };
}

async function createFollowUpQa(token, original, config) {
  const subject = `${smokeMarker} follow-up ${smokeRunId}`;
  const content = `${smokeMarker} follow-up content ${smokeRunId}`;
  const originalQa = await verifyQaApi(token, original.qaId, {});
  const payload = await apiJson('/qas', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      qa_category: originalQa.qa_category || config.categories?.[0] || '',
      qa_email: `${smokeMemberId}@example.test`,
      qa_hp: '010-3333-4444',
      qa_subject: subject,
      qa_content: content,
      qa_email_recv: true,
      qa_sms_recv: false,
      qa_reply_to: original.qaId,
    }),
  });
  const followUp = payload.data;
  const followUpId = Number(followUp?.qa_id || 0);
  if (!followUpId) {
    fail('Q&A follow-up create did not return a qa_id', payload);
  }

  const expectedRelated = Number(originalQa.qa_related || originalQa.qa_id);
  await verifyQaApi(token, followUpId, {
    qa_subject: subject,
    qa_content: content,
    qa_parent: followUpId,
    qa_related: expectedRelated,
    qa_status: 0,
  });
  const originalAfterFollowUp = await verifyQaApi(token, original.qaId, {});
  const relatedQuestions = Array.isArray(originalAfterFollowUp.related_questions)
    ? originalAfterFollowUp.related_questions
    : [];
  if (!relatedQuestions.some((row) => Number(row.qa_id) === followUpId)) {
    fail('Q&A detail API did not include the follow-up in related_questions', {
      original: originalAfterFollowUp,
      followUpId,
    });
  }
  await verifyQaList(token, followUpId, subject);

  return { qaId: followUpId, subject, content };
}

async function verifyMypageListAndDelete(page, token, updated) {
  await page.goto(`${appUrl}/mypage/qas`, { waitUntil: 'networkidle' });
  await page.getByText(updated.subject, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });

  await page.goto(`${appUrl}/mypage/qas/${updated.qaId}`, { waitUntil: 'networkidle' });
  page.once('dialog', (dialog) => dialog.accept());
  const deleteResponse = await waitForResponseAfterAction(
    page,
    'Q&A delete',
    (response) =>
      response.url().replace(/\/+$/, '').endsWith(`/qas/${updated.qaId}`) &&
      response.request().method() === 'DELETE',
    () => page.getByRole('button', { name: '삭제' }).click()
  );
  await assertOkResponse(deleteResponse, 'Q&A delete');
  await page.waitForURL(/\/mypage\/qas$/, { timeout: 10000 });

  await expectApiMissing(`/qas/${updated.qaId}`, {
    headers: authHeaders(token),
  }, 'deleted Q&A item');

  const list = await apiJson('/qas?per_page=50', {
    headers: authHeaders(token),
  });
  if ((list.data || []).some((row) => Number(row.qa_id) === Number(updated.qaId))) {
    fail('deleted Q&A item still appears in my Q&A list', list.data);
  }
}

let browser = null;
let credentials = null;
let exitCode = 0;

try {
  seedSmokeMember();
  cleanupQas();
  credentials = await login();
  const config = await currentQaConfig(credentials.token);

  browser = await chromium.launch({ headless: true });
  const context = await browserContext(browser, credentials);
  const page = await context.newPage();

  const created = await createQaInBrowser(page, credentials.token, config);
  const updated = await updateQaInBrowser(page, credentials.token, created, config);
  const followUp = await createFollowUpQa(credentials.token, updated, config);
  await verifyMypageListAndDelete(page, credentials.token, updated);
  await context.close();

  console.table([
    {
      qaId: created.qaId,
      followUpQaId: followUp.qaId,
      subject: updated.subject,
      status: 'created-updated-followed-up-deleted',
    },
  ]);
  console.log(`[check-local-qa-actions] app=${appUrl}`);
  console.log(`[check-local-qa-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  try {
    cleanupQas();
  } catch (error) {
    printFailure(error, 'check-local-qa-actions cleanup');
    exitCode = 1;
  }
  try {
    seedSmokeMember();
  } catch (error) {
    printFailure(error, 'check-local-qa-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);
