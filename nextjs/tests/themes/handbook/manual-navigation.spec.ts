import { expect, test, type Page } from '@playwright/test';

// handbook 매뉴얼 탐색 검수 — docs/prototypes/handbook-menu/design-qa.md "실제 테마 적용 검수 목록".
// 실행: PLAYWRIGHT_BASE_URL=<handbook 사이트> npx playwright test tests/themes/handbook/manual-navigation.spec.ts
// 기대값(메뉴 · 게시판 분류 · 글)은 그 사이트의 /api/v1 에서 읽는다 — 매뉴얼 내용이 바뀌어도 그대로 돈다.

type ApiMenu = { me_name: string; me_link: string; me_target: string; children?: ApiMenu[] };
type ApiBoard = { bo_table: string; bo_category_list?: string };
type ApiPost = { wr_id: number | string; ca_name?: string };

/** 하위 폴더 설치(PLAYWRIGHT_BASE_URL=http://host/gnu)에서도 돌도록 사이트 안 주소에 설치 경로를 붙인다 —
 *  Playwright 는 '/…' 를 baseURL 의 경로를 버리고 호스트 기준으로 푼다. */
const BASE_PATH = new URL(process.env.PLAYWRIGHT_BASE_URL || process.env.LOCAL_APP_URL || 'http://localhost').pathname.replace(
  /\/+$/,
  ''
);
const at = (path: string) => `${BASE_PATH}${path}`;

/** 검사에 필요한 데이터(긴 매뉴얼 · 하위 메뉴 …)가 없을 때 — 검수(HANDBOOK_E2E=1)에서는 실패, 아니면 건너뛴다. */
function requireData(present: boolean, reason: string) {
  if (present) return;
  expect(process.env.HANDBOOK_E2E, `HANDBOOK_E2E=1 needs: ${reason}`).not.toBe('1');
  test.skip(true, reason);
}

/** 서버 실행(next dev · next start)인지 — 정적 빌드는 PHP 브리지가 낸다. HANDBOOK_RUNTIME=server|static 으로 정할 수 있다. */
async function isServerRuntime(page: Page): Promise<boolean> {
  if (process.env.HANDBOOK_RUNTIME) return process.env.HANDBOOK_RUNTIME === 'server';
  const response = await page.request.get(at('/'));
  return (response.headers()['x-powered-by'] ?? '').includes('Next.js');
}

async function apiData<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(at(`/api/v1${path}`));
  expect(response.ok(), `GET /api/v1${path}`).toBeTruthy();
  return ((await response.json()) as { data: T }).data;
}

/** 목록 API 한 쪽 — 글과 전체 개수(meta.total) · 마지막 쪽(meta.last_page). */
async function apiList<T>(page: Page, path: string): Promise<{ data: T[]; total: number; lastPage: number }> {
  const response = await page.request.get(at(`/api/v1${path}`));
  expect(response.ok(), `GET /api/v1${path}`).toBeTruthy();
  const body = (await response.json()) as { data: T[]; meta?: { total?: number; last_page?: number } };
  return { data: body.data, total: Number(body.meta?.total ?? body.data.length), lastPage: Number(body.meta?.last_page ?? 1) };
}

/** 매뉴얼 게시판의 글 전부 — 테마 목차처럼 100개씩 쪽을 넘겨 끝까지 읽는다(100장 넘는 매뉴얼도 부 순서를 맞게 본다). */
async function apiAllPosts(page: Page, table: string): Promise<{ posts: ApiPost[]; total: number }> {
  const first = await apiList<ApiPost>(page, `/boards/${table}/posts?per_page=100&page=1`);
  const posts = [...first.data];
  for (let pageNo = 2; pageNo <= first.lastPage; pageNo += 1) {
    posts.push(...(await apiList<ApiPost>(page, `/boards/${table}/posts?per_page=100&page=${pageNo}`)).data);
  }
  return { posts, total: first.total };
}

/** 상단 바에 보이는 메뉴 줄의 칸 — 너비를 재는 숨은 줄(.doc-mainnav-measure)과 "더보기" 칸은 뺀다. */
const MAINNAV_ITEM = '.doc-mainnav > .doc-mainnav-list:not(.doc-mainnav-measure) > .doc-mainnav-item:not(.doc-mainnav-more)';

function pathOf(href: string | null): string {
  return href ? new URL(href, 'http://local.test').pathname.replace(/\/+$/, '') : '';
}

/** 첫 화면 사이드바의 매뉴얼 목록 — { 게시판, 장 수 }. 첫 화면에서 부른다. */
async function selectorBooks(page: Page): Promise<Array<{ table: string; count: number }>> {
  const links = page.locator('.doc-book-browse-link');
  await expect(links.first()).toBeVisible();
  return links.evaluateAll((items) =>
    items.map((link) => ({
      table: new URL((link as HTMLAnchorElement).href).pathname.split('/').filter(Boolean).pop() ?? '',
      count: Number(link.querySelector('.doc-booksel-count')?.textContent?.replace(/\D/g, '') ?? 0),
    }))
  );
}

/** 목차의 접힌 부를 모두 편다. 하나를 펴면 접힌 목록이 줄어들므로 매번 첫 번째를 누른다. */
async function expandAllParts(page: Page) {
  const collapsed = page.locator('.doc-part-toggle[aria-expanded="false"]');
  while ((await collapsed.count()) > 0) await collapsed.first().click();
}

/** HANDBOOK_E2E=1 이면 handbook 이 아닌 사이트에서 건너뛰지 않고 실패한다 — 설정이 틀린 검수가 0개 검사로 통과하지 않게. */
async function openHandbook(page: Page, path = '/') {
  await page.goto(at(path), { waitUntil: 'networkidle' });
  if ((await page.locator('.doc-root .doc-sidebar').count()) === 0) {
    expect(process.env.HANDBOOK_E2E, 'HANDBOOK_E2E=1 but the active theme is not Handbook').not.toBe('1');
    test.skip(true, 'active theme is not Handbook');
  }
}

test.describe('handbook manual navigation', () => {
  test('home sidebar lists the manuals instead of one manual table of contents', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const books = await selectorBooks(page);
    expect(books.length).toBeGreaterThan(0);
    await expect(page.locator('.doc-chapter-link')).toHaveCount(0);
    await expect(page.locator('.doc-booksel-button')).toHaveCount(0);
  });

  test('a page in an admin menu group shows that group and highlights the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const bookTables = (await selectorBooks(page)).map((book) => book.table);
    // 상단 메뉴에서 매뉴얼이 아닌 사이트 안 하위 메뉴(커뮤니티 게시판 등) 하나를 고른다.
    const target = await page.locator(MAINNAV_ITEM).evaluateAll((items, tables) => {
      for (const item of items) {
        const group = item.querySelector('.doc-mainnav-trigger')?.textContent?.trim() ?? '';
        for (const link of Array.from(item.querySelectorAll<HTMLAnchorElement>('.doc-mainnav-link'))) {
          if (link.target === '_blank' || new URL(link.href).origin !== location.origin) continue;
          const table = new URL(link.href).pathname.split('/').filter(Boolean).pop() ?? '';
          if (!(tables as string[]).includes(table)) {
            return { group, label: link.textContent?.trim() ?? '', path: new URL(link.href).pathname };
          }
        }
      }
      return null;
    }, bookTables);
    requireData(Boolean(target), 'a non-manual page in the admin menu');

    await page.goto(target!.path, { waitUntil: 'networkidle' });
    await expect(page.locator('.doc-side-menu-title')).toHaveText(target!.group);
    await expect(page.locator('.doc-side-menu [aria-current="page"]')).toHaveText(target!.label);
    await expect(page.locator('.doc-chapter-link')).toHaveCount(0);
    await expect(page.locator('.doc-booksel-button')).toHaveCount(0);
    await expect(page.locator('.doc-side-browse')).toBeVisible();
  });

  test('top menu shows every admin menu item in order with its links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const menus = await apiData<ApiMenu[]>(page, '/menus');

    const triggers = page.locator(`${MAINNAV_ITEM} > .doc-mainnav-trigger`);
    await expect(triggers).toHaveCount(menus.length);
    for (const [index, menu] of menus.entries()) {
      await expect(triggers.nth(index)).toContainText(menu.me_name);
      const children = page.locator(MAINNAV_ITEM).nth(index).locator('.doc-mainnav-link');
      await expect(children).toHaveCount(menu.children?.length ?? 0);
      for (const [childIndex, child] of (menu.children ?? []).entries()) {
        await expect(children.nth(childIndex)).toHaveText(child.me_name);
        if (child.me_target.replace(/^_/, '') === 'blank') {
          await expect(children.nth(childIndex)).toHaveAttribute('target', '_blank');
        }
      }
    }
  });

  test('phone drawer starts with the same admin menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHandbook(page);
    const menus = await apiData<ApiMenu[]>(page, '/menus');

    await page.locator('.doc-hamburger').click();
    const tops = page.locator('.doc-drawer-menu-top');
    await expect(tops).toHaveCount(menus.length);
    for (const [index, menu] of menus.entries()) {
      await expect(tops.nth(index)).toHaveText(menu.me_name);
      if ((menu.children?.length ?? 0) === 0) continue;
      const row = page.locator('.doc-drawer-menu > ul > li').nth(index);
      await row.locator('.doc-drawer-menu-toggle').click();
      await expect(row.locator('.doc-nav-children a')).toHaveText((menu.children ?? []).map((child) => child.me_name));
      // 하위 메뉴는 들여 쓴다 — 서랍 목록 초기화가 하위 목록까지 덮으면 0px 이 된다.
      await expect(row.locator('.doc-nav-children')).not.toHaveCSS('padding-left', '0px');
      await row.locator('.doc-drawer-menu-toggle').click();
    }
  });

  test('table of contents follows the board categories, numbers chapters and opens parts by length', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const books = await selectorBooks(page);
    expect(books.length).toBeGreaterThan(0);

    for (const book of books) {
      const [board, { posts, total }] = await Promise.all([
        apiData<ApiBoard>(page, `/boards/${book.table}`),
        apiAllPosts(page, book.table),
      ]);
      // 100장을 넘는 매뉴얼도 목차가 끝까지 읽혀야 한다(전체 개수와 같아야).
      expect(book.count, `${book.table} chapter count`).toBe(total);

      // 부 순서 = 분류 설정 순서(글이 있는 분류만), 설정에 없는 분류는 그 뒤.
      const used = [...new Set(posts.map((post) => (post.ca_name ?? '').trim() || '문서'))];
      const order = (board.bo_category_list ?? '').split('|').map((name) => name.trim()).filter(Boolean);
      const expectedParts = [...order.filter((name) => used.includes(name)), ...used.filter((name) => !order.includes(name))];

      const firstChapter = `/${book.table}/${posts[0]?.wr_id}`;
      await page.goto(at(firstChapter), { waitUntil: 'networkidle' });
      await expect(page.locator('.doc-part-name')).toHaveText(expectedParts);

      const toggles = page.locator('.doc-part-toggle');
      const expanded = await toggles.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-expanded')));
      if (total <= 10) {
        expect(expanded.every((value) => value === 'true'), `${book.table}: short manual opens every part`).toBe(true);
      } else {
        expect(expanded.filter((value) => value === 'true'), `${book.table}: long manual opens one part`).toHaveLength(1);
      }

      // 펼친 부의 장 번호는 매뉴얼 전체에서 이어지고, 글 머리의 "N / M장"과 같다.
      const active = page.locator('.doc-chapter-link.is-active');
      await expect(active).toHaveCount(1);
      const activeNumber = await active.locator('.doc-chapter-no').innerText();
      await expect(page.locator('.doc-chapter-position-count')).toHaveText(`${activeNumber} / ${total}장`);
    }
  });

  test('chapter pager crosses part boundaries in table-of-contents order', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const books = await selectorBooks(page);
    const book = books.find((candidate) => candidate.count > 1);
    requireData(Boolean(book), 'a manual with two or more chapters');

    await page.goto(at(`/${book!.table}`), { waitUntil: 'networkidle' });
    // 모든 부를 펴서 목차 순서대로 장 주소를 모은다.
    await expandAllParts(page);
    const hrefs = await page.locator('.doc-chapter-link').evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname)
    );
    const partSizes = await page
      .locator('.doc-part')
      .evaluateAll((parts) => parts.map((part) => part.querySelectorAll('.doc-chapter-link').length));
    const boundary = partSizes.length > 1 ? partSizes[0] - 1 : 0;

    await page.goto(hrefs[boundary], { waitUntil: 'networkidle' });
    await expect(page.locator('.board-view-siblings')).toBeHidden();
    const next = page.locator('.doc-pager-link.is-next');
    expect(pathOf(await next.getAttribute('href'))).toBe(pathOf(hrefs[boundary + 1]));
    await next.click();
    await expect(page).toHaveURL(new RegExp(`${hrefs[boundary + 1]}$`));

    await page.goto(hrefs[hrefs.length - 1], { waitUntil: 'networkidle' });
    expect(pathOf(await page.locator('.doc-pager-link.is-next').getAttribute('href'))).toBe(at(`/${book!.table}`));
  });

  test('Ctrl+K finds a chapter by title and opens it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const books = await selectorBooks(page);
    const target = books[books.length - 1];
    await page.goto(at(`/${target.table}`), { waitUntil: 'networkidle' });
    await expandAllParts(page);
    const chapter = page.locator('.doc-chapter-link').last();
    const title = (await chapter.locator('.truncate').innerText()).trim();
    const href = pathOf(await chapter.getAttribute('href'));

    await page.keyboard.press('Control+K');
    const dialog = page.locator('.doc-search-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[type="search"]')).toBeFocused();
    await dialog.locator('input[type="search"]').fill(title);
    await expect(dialog.locator('.doc-search-hit').first()).toContainText(title);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator('.doc-chapter-link.is-active')).toContainText(title);
  });

  test('Ctrl+K opens only on the plain shortcut, lists the whole manual and closes with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const books = await selectorBooks(page);
    const book = [...books].sort((a, b) => b.count - a.count)[0];
    await page.goto(at(`/${book.table}`), { waitUntil: 'networkidle' });
    const dialog = page.locator('.doc-search-dialog');
    const hits = dialog.locator('.doc-search-hit');

    // 닫혀 있는 동안은 결과 링크를 만들지 않는다.
    await expect(hits).toHaveCount(0);
    // 단축키는 화면에 붙은 뒤에 받는다 — 열릴 때까지 다시 눌러 본 뒤에야 "안 열린다"는 확인이 뜻을 갖는다.
    await expect(async () => {
      await page.keyboard.press('Control+K');
      await expect(dialog).toBeVisible({ timeout: 500 });
    }).toPass();
    // 빈 검색어의 목차는 자르지 않는다 — 긴 매뉴얼도 장 수만큼.
    await expect(hits).toHaveCount(book.count);
    await expect(dialog.locator('input[type="search"]')).toHaveAttribute('aria-controls', /.+/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(hits).toHaveCount(0);

    // Shift · Alt 가 붙은 조합(AltGr = Ctrl+Alt 포함)은 다른 단축키라 열지 않는다.
    for (const combo of ['Control+Shift+K', 'Control+Alt+K']) {
      await page.keyboard.press(combo);
      await expect(dialog).toBeHidden();
    }
    // 편집기 안의 Ctrl+K(글쓰기 편집기의 "링크 넣기")는 뺏지 않는다.
    await page.evaluate(() => {
      const editor = document.createElement('div');
      editor.contentEditable = 'true';
      editor.className = 'e2e-editor';
      document.body.append(editor);
      editor.focus();
    });
    await page.keyboard.press('Control+K');
    await expect(dialog).toBeHidden();
    await page.evaluate(() => document.querySelector('.e2e-editor')?.remove());
    // 다른 창(대화상자)이 떠 있으면 그 위에 겹쳐 열지 않는다.
    await page.evaluate(() => {
      const other = document.createElement('dialog');
      other.className = 'e2e-other';
      other.textContent = '다른 창';
      document.body.append(other);
      other.showModal();
    });
    await page.keyboard.press('Control+K');
    await expect(dialog).toBeHidden();
  });

  test('search opens on a Hangul-mode Ctrl+K and stays open after a drag that ends outside', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const dialog = page.locator('.doc-search-dialog');

    // 한글 입력 상태에서는 key 가 "k" 가 아닐 수 있다 — 키 자리(code)로도 받는다. 단축키는 화면에 붙은 뒤에 받으므로 열릴 때까지.
    await expect(async () => {
      await page.evaluate(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅏ', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }))
      );
      await expect(dialog).toBeVisible({ timeout: 500 });
    }).toPass();

    // 검색칸에서 글자를 끌어 고르다 창 바깥에서 손을 떼도 닫히지 않는다.
    const input = dialog.locator('input[type="search"]');
    await input.fill('설치 따라하기');
    const box = (await input.boundingBox())!;
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(8, 8, { steps: 4 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();

    // 바깥을 누르면 닫힌다.
    await page.mouse.click(8, 8);
    await expect(dialog).toBeHidden();
  });

  test('a long manual opens its first part on the manual index page', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const book = (await selectorBooks(page)).find((candidate) => candidate.count > 10);
    requireData(Boolean(book), 'a manual with more than 10 chapters');

    await page.goto(at(`/${book!.table}`), { waitUntil: 'networkidle' });
    const toggles = page.locator('.doc-part-toggle');
    await expect(toggles.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.doc-part-toggle[aria-expanded="true"]')).toHaveCount(1);
    // 접힌 부의 단추는 없는 목록을 가리키지 않는다.
    for (const toggle of await page.locator('.doc-part-toggle[aria-expanded="false"]').all()) {
      await expect(toggle).not.toHaveAttribute('aria-controls', /.*/);
    }

    // 뒤쪽 부의 장 — 화면에 붙기 전(스크립트 없이 받은 HTML)에 첫 부를 폈다가 붙은 뒤 그 장의 부로
    // 옮겨 가며 목차가 출렁이면 안 된다. 서버 HTML 에서 펼친 부는 붙은 뒤에도 펼쳐져 있어야 한다.
    await expandAllParts(page);
    const lastChapter = new URL((await page.locator('.doc-chapter-link').last().getAttribute('href'))!, page.url()).href;
    const openParts = (target: Page) =>
      target.locator('.doc-part-toggle[aria-expanded="true"] .doc-part-name').allInnerTexts();
    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const htmlOnly = await noScript.newPage();
    await htmlOnly.goto(lastChapter);
    const serverOpen = await openParts(htmlOnly);
    const serverChapterCount = await htmlOnly.locator('.doc-chapter-link').count();
    const serverActiveCount = await htmlOnly.locator('.doc-chapter-link.is-active').count();
    await noScript.close();

    await page.goto(lastChapter, { waitUntil: 'networkidle' });
    await expect(page.locator('.doc-chapter-link.is-active')).toBeVisible();
    const hydratedOpen = await openParts(page);
    expect(hydratedOpen).toHaveLength(1);
    expect(serverOpen.every((name) => hydratedOpen.includes(name)), `server HTML opened ${serverOpen}`).toBe(true);
    // 서버 실행(개발 서버 · next start)은 처음 HTML 부터 지금 장의 부를 펴고 그 장을 강조한다. 정적 빌드의 글 화면은
    // 자리표시 HTML 이라 매뉴얼 부분이 없다(화면에 붙은 뒤 그린다).
    if (await isServerRuntime(page)) {
      expect(serverChapterCount).toBeGreaterThan(0);
      expect(serverOpen).toEqual(hydratedOpen);
      expect(serverActiveCount).toBe(1);
    } else {
      expect(serverChapterCount).toBe(0);
    }
  });

  test('home, manual, chapter and menu pages hydrate without errors', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat|Minified React error #4(18|19|20|21|23|25)/i.test(message.text())) {
        problems.push(message.text());
      }
    });

    await openHandbook(page);
    const books = await selectorBooks(page);
    const tables = books.map((book) => book.table);
    const menuPath = await page.locator('.doc-mainnav-link').evaluateAll(
      (links, manualTables) =>
        links
          .map((link) => new URL((link as HTMLAnchorElement).href))
          .find(
            (url) =>
              url.origin === location.origin &&
              !(manualTables as string[]).includes(url.pathname.split('/').filter(Boolean).pop() ?? '')
          )?.pathname,
      tables
    );

    // 각 화면은 화면에 붙은 뒤(지금 주소를 안 뒤)에만 생기는 표시를 기다린 다음 넘어간다 — 하이드레이션
    // 오류는 그 사이에 난다. 정적 빌드의 글 화면은 자리표시 HTML 이라 이 검사가 하이드레이션 어긋남을 잡는다.
    const longest = [...books].sort((a, b) => b.count - a.count)[0];
    await page.goto(at(`/${longest.table}`), { waitUntil: 'networkidle' });
    await expect(page.locator('.doc-part-toggle[aria-expanded="true"]').first()).toBeVisible();
    const chapter = await page.locator('.doc-chapter-link').first().getAttribute('href');
    await page.goto(chapter!, { waitUntil: 'networkidle' });
    await expect(page.locator('.doc-chapter-link.is-active')).toBeVisible();
    if (menuPath) {
      await page.goto(menuPath, { waitUntil: 'networkidle' });
      await expect(page.locator('.doc-side-menu [aria-current="page"], .doc-book-browse').first()).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test('the table of contents is not downloaded again on the next page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const tables = (await selectorBooks(page)).map((book) => book.table);
    // 서버 실행은 서버가 넘긴 목차를 쓰고, 정적 빌드는 이 탭에 저장해 둔 목차를 쓴다 — 다음 화면에서 다시 받지 않는다.
    // 다음 화면은 매뉴얼이 아닌 검색 화면이라, 매뉴얼 게시판의 글 목록 요청은 모두 목차를 다시 받는 것이다.
    const tocRequests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (tables.some((table) => path.endsWith(`/boards/${table}/posts`))) tocRequests.push(request.url());
    });
    await page.goto(at('/search'), { waitUntil: 'networkidle' });
    // 검색 화면은 메뉴 묶음(예: 커뮤니티)에 들 수도, 매뉴얼 목록을 보일 수도 있다 — 어느 쪽이든 사이드바가 그려진 뒤에 센다.
    await expect(page.locator('.doc-side-menu, .doc-book-browse').first()).toBeVisible();
    expect(tocRequests).toEqual([]);
  });

  test('home hero starts at the first chapter of the table of contents', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    await expect(page.locator('#recent-heading')).toHaveText('최근 추가한 장');
    const start = page.locator('.doc-hero-actions .btn-primary');
    await expect(start).toContainText('부터 읽기');
    await page.goto((await start.getAttribute('href'))!, { waitUntil: 'networkidle' });
    // 목차(분류) 순서의 첫 장 — 글 순서의 첫 글이 아니다.
    await expect(page.locator('.doc-chapter-link.is-active .doc-chapter-no')).toHaveText('01');
  });

  test('page TOC survives a malformed #hash and marks the heading you jump to', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // 강조색은 밝은 모드 값으로 본다.
    await page.emulateMedia({ colorScheme: 'light' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openHandbook(page);
    const books = await selectorBooks(page);
    const longest = [...books].sort((a, b) => b.count - a.count)[0];
    await page.goto(at(`/${longest.table}`), { waitUntil: 'networkidle' });
    await expandAllParts(page);
    const chapters = await page
      .locator('.doc-chapter-link')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));

    // 오른쪽 목차는 본문 제목이 둘 이상인 장에만 생기고, 앵커는 그때만 푼다 — 그런 장을 고른다.
    const tocLinks = page.locator('.doc-toc-link');
    let chapter = '';
    for (const path of chapters.slice(0, 12)) {
      await page.goto(path, { waitUntil: 'networkidle' });
      if ((await tocLinks.count()) >= 2) {
        chapter = path;
        break;
      }
    }
    requireData(chapter !== '', 'a chapter with two or more headings');

    // "#100%" 같은 잘못된 % 는 화면 전체를 오류 화면으로 만들었다.
    await page.goto(`${chapter}#%E0%A4%A`, { waitUntil: 'networkidle' });
    await expect(page.locator('.doc-chapter-link.is-active')).toBeVisible();
    await expect(tocLinks.nth(1)).toBeVisible();
    expect(errors).toEqual([]);

    await tocLinks.nth(1).click();
    // 지금 위치는 강조색으로 — 정의되지 않은 변수를 쓰던 때는 다른 항목과 같은 색이었다.
    await expect(tocLinks.nth(1)).toHaveClass(/is-active/);
    await expect(tocLinks.nth(1)).toHaveCSS('color', 'rgb(67, 56, 202)');
  });

  test('book selector closes when focus leaves it and Escape returns focus to its button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const [first] = await selectorBooks(page);
    await page.goto(at(`/${first.table}`), { waitUntil: 'networkidle' });
    const button = page.locator('.doc-booksel-button');
    const panel = page.locator('.doc-booksel-panel');

    await button.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await page.locator('.doc-booksel-option').last().focus();
    await page.keyboard.press('Tab');
    await expect(panel).toBeHidden();
  });

  test('top menu dropdown closes with Escape and opens again after focus moves on', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    const item = page.locator(MAINNAV_ITEM).filter({ has: page.locator('.doc-mainnav-panel') }).first();
    requireData((await item.count()) > 0, 'an admin menu with sub-menus');
    const trigger = item.locator('.doc-mainnav-trigger');
    const panel = item.locator('.doc-mainnav-panel');

    await trigger.focus();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(trigger).toBeFocused();
    await expect(panel).toBeVisible();
  });

  test('a long admin menu folds what does not fit into 더보기 without dropping any item', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // 관리자 메뉴가 열두 개 — 상단 바에 다 들어가지 않는다. 브라우저가 다시 읽는 메뉴(useRuntimeMenus)를 바꿔 넣는다.
    const many = Array.from({ length: 12 }, (_, index) => ({
      me_id: 900 + index,
      me_code: `x${index}`,
      me_name: `긴 메뉴 이름 ${index + 1}`,
      me_link: '/search',
      me_target: 'self',
      children:
        index % 3 === 0
          ? [{ me_id: 950 + index, me_code: `x${index}10`, me_name: `하위 ${index + 1}`, me_link: '/faq', me_target: 'self' }]
          : [],
    }));
    await page.route('**/api/v1/menus', (route) => route.fulfill({ json: { success: true, data: many } }));
    await openHandbook(page);

    const more = page.locator('.doc-mainnav-more');
    // 첫 화면(서버 HTML)은 실제 관리자 메뉴다 — 바꿔 넣은 열두 개가 다 그려진 뒤에 센다.
    await expect
      .poll(async () => (await page.locator(`${MAINNAV_ITEM} > .doc-mainnav-trigger`).count()) + (await more.locator('.doc-mainnav-more-title').count()))
      .toBe(many.length);
    await expect(page.locator(`${MAINNAV_ITEM} > .doc-mainnav-trigger`).first()).toHaveText(many[0].me_name);
    await expect(more).toBeVisible();
    // 줄에 남은 메뉴 + "더보기" 안의 메뉴 = 관리자 메뉴 전부, 순서 그대로. 하위 메뉴도 따라간다.
    const inline = (await page.locator(`${MAINNAV_ITEM} > .doc-mainnav-trigger`).allInnerTexts()).map((label) => label.trim());
    const folded = (await more.locator('.doc-mainnav-more-title').allTextContents()).map((label) => label.trim());
    expect(inline.length).toBeGreaterThan(0);
    expect([...inline, ...folded]).toEqual(many.map((menu) => menu.me_name));
    const foldedChildren = (await more.locator('.doc-mainnav-more-group .doc-mainnav-link:not(.doc-mainnav-more-title)').allTextContents()).map((label) => label.trim());
    expect(foldedChildren).toEqual(
      many.slice(inline.length).flatMap((menu) => menu.children.map((child) => child.me_name))
    );

    // 검색칸은 찌그러지지 않고, 메뉴 줄이 검색칸을 넘어가지 않는다.
    const search = (await page.locator('.doc-topbar .doc-search').boundingBox())!;
    const nav = (await page.locator('.doc-mainnav').boundingBox())!;
    expect(search.width).toBeGreaterThanOrEqual(190);
    expect(nav.x + nav.width).toBeLessThanOrEqual(search.x + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // "더보기"도 키보드로 열리고 Escape 로 닫힌다.
    const trigger = more.locator('> .doc-mainnav-trigger');
    await trigger.focus();
    await expect(more.locator('.doc-mainnav-more-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more.locator('.doc-mainnav-more-panel')).toBeHidden();
    await expect(trigger).toBeFocused();
    // 닫은 뒤에도 Enter 로 다시 연다.
    await page.keyboard.press('Enter');
    await expect(more.locator('.doc-mainnav-more-panel')).toBeVisible();

    // 넓은 화면에서는 더 많은 메뉴가 줄에 남는다.
    await page.setViewportSize({ width: 1920, height: 900 });
    await expect
      .poll(async () => (await page.locator(`${MAINNAV_ITEM} > .doc-mainnav-trigger`).count()) > inline.length)
      .toBe(true);
  });

  test('the new posts page and board category chips are styled by the theme', async ({ page }) => {
    // 새글(/recent) 표와 게시판 분류 칩은 앱이 모양을 테마에 맡긴다(theme.pages.css) — 맡기지 못하면 맨 HTML 표가 된다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page, '/recent');
    const rows = page.locator('.recent-table tbody tr');
    requireData((await page.locator('.recent-title').count()) > 0, 'recent posts');
    await expect(rows.first()).toHaveCSS('display', 'grid');
    await expect(page.locator('.recent-initial').first()).toHaveCSS('border-radius', '50%');

    // 휴대폰 폭에서는 같은 마크업이 카드 목록이 된다 — 표 머리는 숨고 가로로 넘치지 않는다.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.recent-table thead')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // 분류 칩은 줄어 한 자씩 꺾이지 않고(한 줄 높이), 넘치는 칩은 다음 줄 왼쪽부터 선다.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openHandbook(page);
    const books = await selectorBooks(page);
    const withParts = books.find((book) => book.count > 10) ?? books[0];
    await page.goto(at(`/${withParts.table}`), { waitUntil: 'networkidle' });
    const chips = page.locator('.board-list-categories .filter-chip');
    requireData((await chips.count()) > 0, 'a manual board with categories');
    const heights = await chips.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.max(...heights)).toBeLessThan(40);
    await expect(page.locator('.board-list-categories')).toHaveCSS('justify-content', 'flex-start');

    // 쇼핑몰 화면(장바구니)은 문서 셸 안의 여백 칸에 든다 — 사이드바 선에 붙지 않는다.
    await page.goto(at('/shop/cart'), { waitUntil: 'networkidle' });
    const shopPage = page.locator('.doc-shop-page');
    await expect(shopPage).toHaveCount(1);
    expect(parseFloat(await shopPage.evaluate((element) => getComputedStyle(element).paddingLeft))).toBeGreaterThan(8);
  });

  for (const viewport of [
    { width: 1280, fixedSidebar: true },
    { width: 1279, fixedSidebar: false },
    { width: 1024, fixedSidebar: false },
    { width: 390, fixedSidebar: false },
  ]) {
    test(`layout at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await openHandbook(page);
      const side = page.locator('.doc-drawer > .drawer-side');
      await expect(side).toHaveCSS('position', viewport.fixedSidebar ? 'sticky' : 'fixed');
      await expect(page.locator('.doc-hamburger')).toBeVisible({ visible: !viewport.fixedSidebar });
      // 상단 메뉴 줄은 관리자 메뉴가 있을 때만 그린다(0개면 줄 자체가 없다).
      const hasMenus = (await apiData<ApiMenu[]>(page, '/menus')).length > 0;
      await expect(page.locator('.doc-mainnav')).toBeVisible({ visible: viewport.fixedSidebar && hasMenus });
      await expect(page.locator('.doc-search-icon')).toBeVisible({ visible: viewport.width < 640 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('light and dark modes use the handbook tokens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHandbook(page);
    // 선택기는 매뉴얼 화면에만 있으니 첫 매뉴얼로 옮겨서 본다.
    const [first] = await selectorBooks(page);
    await page.goto(at(`/${first.table}`), { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 250, 252)');

    await page.locator('.doc-theme-swap').click();
    await expect(page.locator('html')).toHaveAttribute('data-handbook-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 17, 32)');
    await expect(page.locator('.doc-booksel-button')).toHaveCSS('background-color', 'rgb(17, 24, 39)');
    await page.locator('.doc-theme-swap').click();
    await expect(page.locator('html')).toHaveAttribute('data-handbook-theme', 'light');
  });
});
