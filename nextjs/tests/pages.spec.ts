import { expect, test } from '@playwright/test';
import { formValidationPages, smokePages } from './smoke-paths';

const FAIL_ON_CONSOLE_ERROR = process.env.PLAYWRIGHT_FAIL_ON_CONSOLE_ERROR !== '0';
const API_STATUS_ALLOWLIST = new Map<string, Set<number>>([
  ['/mypage', new Set([401, 403])],
  ['/shop/personalpay', new Set([401, 403])],
]);
const API_PATH_STATUS_ALLOWLIST = [
  { pagePath: '/polls', apiPath: '/api/v1/polls/current', statuses: new Set([404]) },
];
const CRITICAL_RESOURCE_TYPES = new Set(['document', 'fetch', 'script', 'stylesheet', 'xhr']);

function isIgnorableConsoleError(text: string) {
  // Browser resource errors are verified through response/request listeners below,
  // where the URL, status code, and resource type are available.
  return /^Failed to load resource:/i.test(text);
}

function isAllowedApiStatus(pagePath: string, apiPath: string, status: number) {
  for (const rule of API_PATH_STATUS_ALLOWLIST) {
    if (pagePath === rule.pagePath && apiPath === rule.apiPath && rule.statuses.has(status)) {
      return true;
    }
  }

  for (const [pathPrefix, allowedStatuses] of API_STATUS_ALLOWLIST) {
    if ((pagePath === pathPrefix || pagePath.startsWith(`${pathPrefix}/`)) && allowedStatuses.has(status)) {
      return true;
    }
  }

  return false;
}

function isSameOrigin(url: string, origin: string) {
  if (!origin) return false;

  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isIgnorableRequestFailure(url: string, resourceType: string, reason: string) {
  if (!/ERR_ABORTED/i.test(reason)) return false;

  try {
    const parsed = new URL(url);
    if (resourceType === 'fetch') {
      return parsed.searchParams.has('_rsc') || parsed.pathname.startsWith('/api/v1');
    }
    if (resourceType === 'script') {
      return parsed.pathname.startsWith('/_next/static/chunks/');
    }
    return false;
  } catch {
    return false;
  }
}

for (const smokePage of smokePages) {
  test(`${smokePage.name} (${smokePage.path}) loads without runtime failures`, async ({ page }) => {
    const failures: string[] = [];

    page.on('console', (msg) => {
      if (!FAIL_ON_CONSOLE_ERROR || msg.type() !== 'error') return;

      const text = msg.text();
      if (!isIgnorableConsoleError(text)) {
        failures.push(`[console.error] ${text}`);
      }
    });

    page.on('pageerror', (error) => {
      failures.push(`[pageerror] ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      if (!CRITICAL_RESOURCE_TYPES.has(request.resourceType())) return;

      const reason = request.failure()?.errorText || 'unknown error';
      if (isIgnorableRequestFailure(request.url(), request.resourceType(), reason)) return;
      failures.push(`[requestfailed] ${request.resourceType()} ${request.url()} - ${reason}`);
    });

    page.on('response', (response) => {
      const currentOrigin = page.url() === 'about:blank' ? '' : new URL(page.url()).origin;
      if (!isSameOrigin(response.url(), currentOrigin)) return;

      const url = new URL(response.url());
      const status = response.status();
      const isApiResponse = url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/');

      if (isApiResponse && status >= 400 && !isAllowedApiStatus(smokePage.path, url.pathname, status)) {
        failures.push(`[api ${status}] ${url.pathname}${url.search}`);
        return;
      }

      if (!isApiResponse && status >= 500) {
        failures.push(`[asset ${status}] ${url.pathname}${url.search}`);
      }
    });

    const response = await page.goto(smokePage.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content, main').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('main#main-content')).toHaveCount(1);
    await expect(page.locator('a[href="#main-content"]').first()).toBeAttached();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);

    const status = response?.status() ?? 0;
    expect(status, `${smokePage.name} server status`).toBeLessThan(500);
    expect(failures, `${smokePage.name} runtime failures`).toEqual([]);
  });
}

for (const formPage of formValidationPages) {
  test(`${formPage.name} form validation state does not throw runtime failures`, async ({ page }) => {
    const failures: string[] = [];

    page.on('pageerror', (error) => {
      failures.push(`[pageerror] ${error.message}`);
    });

    await page.goto(formPage.path, { waitUntil: 'domcontentloaded' });
    const form = page
      .locator('#main-content form:has(button[type="submit"]), main form:has(button[type="submit"])')
      .first();
    await expect(form).toBeVisible({ timeout: 10000 });
    await form.locator('button[type="submit"]').last().click();
    await page.waitForTimeout(250);

    const invalidControls = await form.locator('input:invalid, textarea:invalid, select:invalid').count();
    const visibleValidationMessages = await page
      .locator('#main-content .text-destructive, main .text-destructive, #main-content [role="alert"], main [role="alert"]')
      .count();

    await expect(page.locator('#main-content, main').first()).toBeVisible();
    expect(
      invalidControls + visibleValidationMessages,
      `${formPage.name} should expose a native or custom validation state`
    ).toBeGreaterThan(0);
    expect(failures, `${formPage.name} validation runtime failures`).toEqual([]);
  });
}

test('search form submits a query from the visible page form', async ({ page }) => {
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  const form = page.locator('#main-content form, main form').first();
  await expect(form).toBeVisible({ timeout: 10000 });

  await form.locator('input[name="q"]').fill('test');
  await form.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/search\?q=test(?:&|$)/);
});

for (const path of ['/search', '/shop/search', '/notice', '/faq']) {
  test(`${path} visible search inputs are named and labelled`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);

    const unnamedControls = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('form input, form select, form textarea'))
        .map((control) => {
          const rect = control.getBoundingClientRect();
          const style = getComputedStyle(control);
          const hidden =
            control.type === 'hidden' ||
            control.getAttribute('aria-hidden') === 'true' ||
            control.tabIndex < 0 ||
            rect.width <= 1 ||
            rect.height <= 1 ||
            style.display === 'none' ||
            style.visibility === 'hidden';
          const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent?.trim() || '' : '';
          const placeholder = 'placeholder' in control ? control.placeholder : '';
          const accessibleName = control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || label || placeholder || '';

          return {
            hidden,
            name: control.name,
            accessibleName,
            html: control.outerHTML.slice(0, 180),
          };
        })
        .filter((control) => !control.hidden && (!control.name || !control.accessibleName))
    );

    expect(unnamedControls).toEqual([]);
  });
}
