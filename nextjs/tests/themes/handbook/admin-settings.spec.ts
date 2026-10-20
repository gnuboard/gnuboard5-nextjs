import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// handbook 관리자 › 환경설정 › 테마 화면 설정 검수 — 저장한 문구 · 사이드바가 첫 그림부터 보이는지, 장 순서 저장.
// 실행: PLAYWRIGHT_BASE_URL=<handbook 사이트> HANDBOOK_ADMIN_ID=… HANDBOOK_ADMIN_PASSWORD=… \
//       npx playwright test tests/themes/handbook/admin-settings.spec.ts --workers=1
// 화면을 내는 곳과 관리자가 다른 주소면(Vercel 화면 + 그누보드 API) HANDBOOK_ADMIN_URL 로 그누보드 주소를 준다.
// 사이트의 설정 · 장 순서를 바꿨다가 끝에 되돌린다 — 운영 사이트에서는 돌리지 않는다. 바꾸는 동안 같은 사이트를 보는 다른
// 스펙이 같이 돌면 그쪽이 흔들리므로 --workers=1 일 때만 돈다.

const BASE = (process.env.PLAYWRIGHT_BASE_URL || process.env.LOCAL_APP_URL || 'http://localhost').replace(/\/+$/, '');
const ADMIN_BASE = (process.env.HANDBOOK_ADMIN_URL || BASE).replace(/\/+$/, '');
const ADMIN_ID = process.env.HANDBOOK_ADMIN_ID || '';
const ADMIN_PASSWORD = process.env.HANDBOOK_ADMIN_PASSWORD || '';
const SETTINGS_URL = `${ADMIN_BASE}/adm/view.php?call=theme_settings`;
const SETTINGS_FORM = 'form[action*="call=theme_settings"]';
const BACKSLASH = String.fromCharCode(92);

// 서버 실행은 설정을 30초 캐시해 바뀔 때까지 최대 90초 기다린다 — 기본 30초로는 모자란다.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

/** 설정 폼의 칸 값(이름 → 값) — 끝에 되돌리려고 적어 둔다. */
type FormSnapshot = Array<{ name: string; value: string }>;

/** 바꾼 것을 되돌리는 일 — 시험이 시간 초과로 끊겨도 afterEach 가 새 브라우저 문맥에서 돌린다. */
const restores: Array<(admin: Page) => Promise<void>> = [];

/** 검사할 데이터가 없을 때 — 검수(HANDBOOK_E2E=1)에서는 실패, 아니면 건너뛴다(manual-navigation.spec.ts 와 같다). */
function requireData(present: boolean, reason: string) {
  if (present) return;
  expect(process.env.HANDBOOK_E2E, `HANDBOOK_E2E=1 needs: ${reason}`).not.toBe('1');
  test.skip(true, reason);
}

async function login(request: APIRequestContext) {
  const response = await request.post(`${ADMIN_BASE}/bbs/login_check.php`, {
    form: { mb_id: ADMIN_ID, mb_password: ADMIN_PASSWORD, url: '/' },
    maxRedirects: 0,
  });
  // 로그인하면 302, 아이디 · 비밀번호가 틀리면 200(경고 화면) — 200 을 받아 주면 계정 오류가 "설정 없음" 건너뛰기로 숨는다.
  expect(response.status(), 'admin login with HANDBOOK_ADMIN_ID / HANDBOOK_ADMIN_PASSWORD').toBe(302);
}

/** 관리자 화면을 연다 — 테마 화면 설정이 없으면(handbook 이 아니거나 오래된 판) 건너뛴다. */
async function openSettings(page: Page) {
  await page.goto(SETTINGS_URL);
  requireData((await page.locator('#ts_docs_group').count()) > 0, 'theme screen settings are not available on this site');
}

async function snapshotForm(page: Page): Promise<FormSnapshot> {
  return page.locator(SETTINGS_FORM).first().evaluate((form) =>
    Array.from((form as HTMLFormElement).elements)
      .filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => 'name' in element && Boolean((element as HTMLInputElement).name))
      // 숨은 칸(token · 게시판의 처음 값 orig_*)은 적지 않는다 — 되돌릴 때 페이지가 새로 낸 값 그대로 보내면 되고,
      // 숨은 칸에 fill 하면 보일 때까지 기다리다 시간 초과로 되돌리기가 끝나지 않았다.
      .filter((element) => !['hidden', 'submit'].includes((element as HTMLInputElement).type))
      .map((element) => ({ name: element.name, value: element.value }))
  );
}

/** 되돌리기 — 건너뛰지 않는다(되돌리지 못하면 실패로 알린다). */
async function restoreForm(page: Page, snapshot: FormSnapshot) {
  await page.goto(SETTINGS_URL);
  await expect(page.locator('#ts_docs_group')).toHaveCount(1);
  for (const { name, value } of snapshot) {
    const field = page.locator(`${SETTINGS_FORM} [name="${name}"]`).first();
    if ((await field.count()) === 0) continue;
    if ((await field.evaluate((element) => element.tagName)) === 'SELECT') await field.selectOption(value);
    else await field.fill(value);
  }
  await Promise.all([page.waitForURL(/saved=1/), page.click('.btn_fixed_top input[type=submit]')]);
}

/** 장 순서 화면의 장(wr_id) · 제목 — 보인 차례. */
async function shownChapters(page: Page): Promise<Array<{ id: string; subject: string }>> {
  return page.locator('#ts-chapters tbody tr').evaluateAll((rows) =>
    rows.map((row) => ({
      id: row.querySelector('input[name^="chapter_order"]')?.getAttribute('name')?.match(/\[(\d+)\]/)?.[1] ?? '',
      subject: row.querySelector('td:nth-child(3)')?.firstChild?.textContent?.trim() ?? '',
    }))
  );
}

async function saveChapterOrder(page: Page, table: string, ids: string[]) {
  await page.goto(`${SETTINGS_URL}&chapters=${encodeURIComponent(table)}`);
  await page.waitForSelector('#ts-chapters');
  for (const [index, id] of ids.entries()) await page.fill(`#ts-chapters input[name="chapter_order[${id}]"]`, String(index + 1));
  await Promise.all([page.waitForURL(/saved=chapters/), page.click('#ts-chapters input[type=submit]')]);
  expect((await shownChapters(page)).map((chapter) => chapter.id)).toEqual(ids);
}

async function isServerRuntime(page: Page): Promise<boolean> {
  if (process.env.HANDBOOK_RUNTIME) return process.env.HANDBOOK_RUNTIME === 'server';
  const response = await page.request.get(`${BASE}/`);
  return (response.headers()['x-powered-by'] ?? '').includes('Next.js');
}

/** 화면(Next.js)에서 로그인 — 화면 편집 단추는 API 로그인(최고관리자)으로 보인다. 관리자 화면 로그인(PHP 세션)과 따로다. */
async function frontLogin(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const form = page.locator('form').filter({ has: page.locator('input[name="mb_password"]') }).first();
  await form.locator('input[name="mb_id"]').fill(ADMIN_ID);
  await form.locator('input[name="mb_password"]').fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.replace(/\/+$/, '').endsWith('/login'), { timeout: 20_000 }),
    form.locator('button[type="submit"]').first().click(),
  ]);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'HANDBOOK_ADMIN_ID / HANDBOOK_ADMIN_PASSWORD are not set');
  test.skip(testInfo.config.workers > 1, 'changes the site settings — run this file alone with --workers=1');
  await login(page.context().request);
});

test.afterEach(async ({ page, browser }) => {
  if (restores.length === 0) return;
  // 시간 초과로 끊긴 시험 본문이 그 화면으로 계속 저장하지 않게 먼저 닫는다.
  await page.close();
  const context = await browser.newContext();
  try {
    await login(context.request);
    const admin = await context.newPage();
    while (restores.length > 0) await restores.pop()!(admin);
  } finally {
    await context.close();
  }
});

test('saved site texts and the hidden home sidebar show from the first paint', async ({ page }) => {
  await openSettings(page);
  const snapshot = await snapshotForm(page);
  const stamp = String(Date.now()).slice(-6);
  const logo = `E2E 로고 ${stamp}`;
  const footer = `E2E 바닥글 $1 ${BACKSLASH} ${stamp}`;

  restores.push((admin) => restoreForm(admin, snapshot));
  await page.fill('#ts_site_logoText', logo);
  await page.fill('#ts_site_footerDescription', footer);
  await page.selectOption('#ts_sidebar_home', 'hidden');
  await Promise.all([page.waitForURL(/saved=1/), page.click('.btn_fixed_top input[type=submit]')]);

  const server = await isServerRuntime(page);
  if (!server) {
    // 정적 설치본 — 브리지가 HTML 을 내보낼 때 이미 저장한 문구 · 사이드바다(하이드레이션 전).
    const raw = await (await page.request.get(`${BASE}/`)).text();
    expect(raw).toMatch(new RegExp(`data-ts="logoText"[^>]*>\\s*${logo}`));
    expect(raw).toMatch(/<html[^>]*data-doc-sidebar="hidden"/);
    expect(raw).toContain('"themeSettingsApplied":true');
  }

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __brandAtDcl?: string }).__brandAtDcl = document.querySelector('.doc-brand-name')?.textContent?.trim();
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  // 서버 실행은 설정을 30초 캐시한다 — 바뀔 때까지 다시 연다.
  await expect(async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await expect(page.locator('.doc-brand-name')).toHaveText(logo, { timeout: 2000 });
  }).toPass({ timeout: server ? 90_000 : 15_000 });

  if (!server) {
    expect(await page.evaluate(() => (window as unknown as { __brandAtDcl?: string }).__brandAtDcl)).toBe(logo);
  }
  await expect(page.locator('[data-ts="footerDescription"]')).toHaveText(footer);
  await expect(page.locator('.doc-drawer > .drawer-side')).toBeHidden();
  await expect(page.locator('.doc-drawer')).toHaveAttribute('data-sidebar', 'hidden');
  expect(errors).toEqual([]);
});

test('chapter order saves in the admin and shows in the table of contents', async ({ page }) => {
  await openSettings(page);
  const orderLink = page.locator('a[href*="chapters="]').first();
  requireData((await orderLink.count()) > 0, 'no manual board in the manual group');
  const href = (await orderLink.getAttribute('href')) ?? '';
  const table = new URL(href, ADMIN_BASE).searchParams.get('chapters') ?? '';
  await orderLink.click();
  await page.waitForSelector('#ts-chapters');
  // 설정 화면과 따로 연 한 장 — 위에 고정된 설정 "저장" 단추가 섞이지 않는다.
  await expect(page.locator('#ts_docs_group')).toHaveCount(0);

  const chapters = await shownChapters(page);
  const original = chapters.map((chapter) => chapter.id);
  // 같은 부의 이웃한 두 장을 바꾼다(부가 다르면 목차의 부 순서가 이겨 바뀌지 않는다). 목차에서는 제목으로 찾는다.
  const parts = await page.locator('#ts-chapters tbody tr td:nth-child(2)').allTextContents();
  const pair = parts.findIndex(
    (part, index) => index + 1 < parts.length && parts[index + 1] === part && chapters[index].subject !== chapters[index + 1].subject
  );
  requireData(pair >= 0, 'no two differently titled chapters in the same part');
  const swapped = [...original];
  [swapped[pair], swapped[pair + 1]] = [swapped[pair + 1], swapped[pair]];
  const [first, second] = [chapters[pair + 1].subject, chapters[pair].subject];

  restores.push((admin) => saveChapterOrder(admin, table, original));
  await saveChapterOrder(page, table, swapped);

  // 화면 목차(매뉴얼 목록 화면의 장 링크)도 같은 차례다 — 긴 매뉴얼은 부가 접혀 있어 모두 편다.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(async () => {
    await page.goto(`${BASE}/${table}`, { waitUntil: 'networkidle' });
    const collapsed = page.locator('.doc-part-toggle[aria-expanded="false"]');
    while ((await collapsed.count()) > 0) await collapsed.first().click();
    const titles = await page.locator('.doc-chapter-link span[title]').evaluateAll((items) => items.map((item) => item.getAttribute('title') ?? ''));
    expect(titles).toContain(first);
    expect(titles).toContain(second);
    expect(titles.indexOf(first)).toBeLessThan(titles.indexOf(second));
  }).toPass({ timeout: 90_000 });
});

test('the super admin edits texts and the sidebar in place from the screen editor', async ({ page, browser }) => {
  await openSettings(page);
  const snapshot = await snapshotForm(page);
  restores.push((admin) => restoreForm(admin, snapshot));
  const logo = `편집 창 로고 ${String(Date.now()).slice(-6)}`;

  // 손님에게는 편집 단추가 없다.
  const guest = await browser.newContext();
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await expect(guestPage.locator('.doc-brand-name')).toBeVisible();
    await expect(guestPage.getByRole('button', { name: '화면 설정 열기' })).toHaveCount(0);
    await expect(guestPage.locator('.doc-edit-pencil')).toHaveCount(0);
  } finally {
    await guest.close();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await frontLogin(page);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '첫 화면 제목 · 소개 수정' })).toBeVisible();
  await page.getByRole('button', { name: '화면 설정 열기' }).click();

  const dialog = page.getByRole('dialog', { name: '화면 설정' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('로고 글자').fill(logo);
  await dialog.getByRole('tab', { name: '사이드바' }).click();
  await dialog.getByRole('radiogroup', { name: '첫 화면 사이드바' }).getByText('숨기기').click();
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toBeHidden();

  // 새로고침 없이 바로 — 로고 글자와 첫 화면 사이드바.
  await expect(page.locator('.doc-brand-name')).toHaveText(logo);
  await expect(page.locator('.doc-drawer')).toHaveAttribute('data-sidebar', 'hidden');
  await expect(page.getByRole('status').filter({ hasText: '저장했습니다' })).toBeVisible();

  // 새로고침해도 남는다(서버 실행은 설정 캐시 30초).
  const server = await isServerRuntime(page);
  await expect(async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.doc-brand-name')).toHaveText(logo, { timeout: 2000 });
  }).toPass({ timeout: server ? 90_000 : 15_000 });

  // 저장하지 않은 변경이 있으면 닫기 전에 묻는다.
  await page.getByRole('button', { name: '화면 설정 열기' }).click();
  await dialog.getByLabel('로고 글자').fill(`${logo} 고침`);
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('저장하지 않은 변경이 있습니다')).toBeVisible();
  await dialog.getByRole('button', { name: '버리고 닫기' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.doc-brand-name')).toHaveText(logo);
});

test('clearing the manual group in the screen editor empties the table of contents right away', async ({ page }) => {
  await openSettings(page);
  const snapshot = await snapshotForm(page);
  restores.push((admin) => restoreForm(admin, snapshot));
  requireData(snapshot.some((field) => field.name === 'docs[group]' && field.value !== ''), 'no manual group is saved');

  await page.setViewportSize({ width: 1440, height: 900 });
  await frontLogin(page);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await expect(page.locator('.doc-book-browse-link').first()).toBeAttached();
  await page.getByRole('button', { name: '매뉴얼 목록 · 순서 수정' }).click();
  const dialog = page.getByRole('dialog', { name: '화면 설정' });
  await dialog.getByLabel('매뉴얼 게시판 그룹').selectOption('');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toBeHidden();
  // 빌드 때 정한 그룹이 없는 빌드면 매뉴얼이 하나도 없어야 한다 — 예전 목차가 남지 않는다(새로고침 없이).
  test.skip(await page.locator('.doc-root[data-docs-group]').count() > 0, 'this build has its own manual group');
  await expect(page.locator('.doc-book-browse-link')).toHaveCount(0);
  await expect(page.locator('#books-heading')).toHaveCount(0);
});

test('the screen editor reorders chapters and the table of contents follows', async ({ page }) => {
  await openSettings(page);
  const orderLink = page.locator('a[href*="chapters="]').first();
  requireData((await orderLink.count()) > 0, 'no manual board in the manual group');
  const table = new URL((await orderLink.getAttribute('href')) ?? '', ADMIN_BASE).searchParams.get('chapters') ?? '';
  await orderLink.click();
  await page.waitForSelector('#ts-chapters');
  const original = (await shownChapters(page)).map((chapter) => chapter.id);
  restores.push((admin) => saveChapterOrder(admin, table, original));

  await page.setViewportSize({ width: 1440, height: 900 });
  await frontLogin(page);
  await page.goto(`${BASE}/${table}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '이 매뉴얼 장 순서' }).click();
  const dialog = page.getByRole('dialog', { name: '화면 설정' });
  await expect(dialog.getByRole('tab', { name: '장 순서' })).toHaveAttribute('aria-selected', 'true');

  // 같은 부에서 아래로 옮길 수 있는 첫 장을 한 칸 내린다.
  const down = dialog.getByRole('button', { name: /아래로$/ });
  await expect(down.first()).toBeVisible();
  const movable = await down.evaluateAll((buttons) => buttons.findIndex((button) => !(button as HTMLButtonElement).disabled));
  requireData(movable >= 0, 'no two chapters in the same part');
  const titles = await dialog.locator('.doc-editor-chapter-title').allTextContents();
  const [first, second] = [titles[movable + 1], titles[movable]];
  requireData(first !== second, 'two neighbouring chapters share a title');
  await down.nth(movable).click();
  await dialog.getByRole('button', { name: '장 순서 저장' }).click();
  await expect(dialog.getByText('장 순서를 저장했습니다.')).toBeVisible();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog).toBeHidden();

  // 사이드바 목차가 새 차례로 다시 받아진다(새로고침 없이).
  await expect(async () => {
    const collapsed = page.locator('.doc-part-toggle[aria-expanded="false"]');
    while ((await collapsed.count()) > 0) await collapsed.first().click();
    const toc = await page.locator('.doc-chapter-link span[title]').evaluateAll((items) => items.map((item) => item.getAttribute('title') ?? ''));
    expect(toc.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(toc.indexOf(first)).toBeLessThan(toc.indexOf(second));
  }).toPass({ timeout: 30_000 });
});
