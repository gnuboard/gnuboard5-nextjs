import { expect, test } from '@playwright/test';

test('primary navigation renders usable menu links', async ({ page }) => {
  const menuResponse = await page.request.get('/api/v1/menus');
  const menuPayload = menuResponse.ok() ? await menuResponse.json() : null;
  const configuredMenus: Array<{ me_name: string; me_link: string; children?: unknown[] }> =
    menuPayload?.success && Array.isArray(menuPayload.data) ? menuPayload.data : [];
  const flattenMenus = (items: typeof configuredMenus): typeof configuredMenus =>
    items.flatMap((item) => [item, ...flattenMenus(Array.isArray(item.children) ? item.children as typeof configuredMenus : [])]);
  const configuredMenuItems = flattenMenus(configuredMenus);

  await page.goto('/', { waitUntil: 'networkidle' });

  // 사이트 머리. 테마가 위젯 제목에도 <header> 를 쓰므로(nextjs_default 의 사이드바 카드) 첫 것만 본다.
  const header = page.locator('header').first();
  await expect(header).toBeVisible();

  // Themes may place administrator menus in a persistent side navigation
  // instead of the compact top bar. Treat both as primary navigation.
  const navigation = page.locator('header, nav[aria-label]');
  const menuLinks = page.locator('header a[href], nav[aria-label] a[href]').filter({
    hasNotText: /^(Skip|Login|Register)$/i,
  });
  const linkCount = await menuLinks.count();

  expect(linkCount, 'primary navigation should expose links from the active theme/menu source').toBeGreaterThan(3);

  const hrefs = await menuLinks.evaluateAll((links) =>
    links
      .map((link) => link.getAttribute('href') || '')
      .filter((href) => href && href !== '#' && !href.startsWith('javascript:'))
  );
  const linkData = await menuLinks.evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute('href') || '',
      text: (link.textContent || '').trim().replace(/\s+/g, ' '),
    }))
  );

  expect(hrefs.length, 'header links should use safe hrefs').toBe(linkCount);
  for (const name of [...new Set(configuredMenuItems.map((item) => item.me_name).filter(Boolean))]) {
    expect(
      await navigation.getByText(name, { exact: true }).count(),
      `administrator-configured menu ${name} should be present in primary navigation`
    ).toBeGreaterThan(0);
  }
  expect(
    hrefs.some((href) => {
      const url = new URL(href, 'https://example.com');
      return !['/', '/search', '/login', '/register', '/shop/cart'].includes(url.pathname);
    }),
    'header should include at least one primary content route, board route, shop route, or legacy content URL'
  ).toBeTruthy();
  expect(hrefs.some((href) => href.includes('&amp;')), 'header hrefs should decode stored HTML entities').toBe(false);
  expect(
    hrefs.some((href) => /\.php\?[^#?]+\?/.test(href)),
    'header hrefs should not expose legacy links with a second question mark'
  ).toBe(false);
  expect(
    hrefs.some((href) => /^\/(news|schedule|sermon|video|story)(?:[/?#]|$)/.test(href)),
    'imported legacy boards that are not present locally should not become broken local routes'
  ).toBe(false);
  expect(
    hrefs.some((href) => /^\/content\/(?:guide|history|contribution|titleofprayer|organization)(?:[/?#]|$)/.test(href)),
    'imported legacy content pages that are not present locally should not become broken local routes'
  ).toBe(false);
  const configuredExternalLinks = configuredMenuItems
    .map((item) => item.me_link)
    .filter((href) => /^https?:\/\//i.test(href));
  for (const href of configuredExternalLinks) {
    expect(hrefs, `administrator-configured external menu link ${href} should stay visible`).toContain(href);
  }
  if (process.env.UI_SMOKE_WRITE_SCREENSHOTS === '1') {
    await page.screenshot({ path: 'tests/header-menu.png' });
  }
});
