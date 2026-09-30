import { chromium } from '@playwright/test';
import { normalizePath, sameUrlAllowingQueryStripping, sameUrlWithoutTrailingSlash, trimTrailingSlash, waitForUrlWithoutTrailingSlash } from './lib/local-browser-runtime.mjs';
import { runLocalBrowserSeeds } from './lib/local-browser-seed.mjs';
import { createLocalBrowserSmokeRuntime } from './lib/local-browser-smoke-runtime.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv(process.cwd());

const browserRuntime = createLocalBrowserSmokeRuntime();
const {
  appUrl,
  expectedApiUrl,
  expectedRuntimeApiUrl,
  requireAuth,
  seedAuth,
  activeViewport,
  themeSource,
  browserRuntimeRetries,
  smokePaths,
  authSmokePaths,
  browserRuntimeProblems,
  isRetryableHydrationResult,
  filterSkippedChecks,
} = browserRuntime;
let {
  authId,
  authPassword,
} = browserRuntime;

function fail(message, details = undefined) {
  console.error(`[check-local-browser] ${message}`);
  if (details) {
    console.error(JSON.stringify(details, null, 2));
  }
  process.exit(1);
}

({
  authId,
  authPassword,
} = runLocalBrowserSeeds({
  seedAuth,
  authId,
  authPassword,
  fail,
}));

if (requireAuth && (!authId || !authPassword)) {
  fail('authenticated checks require LOCAL_SMOKE_LOGIN_ID and LOCAL_SMOKE_LOGIN_PASSWORD');
}

async function authenticateContext(context, credentials) {
  const { id, password, label, idEnv, passwordEnv } = credentials;
  if (!id && !password) return false;
  if (!id || !password) {
    fail(`${idEnv} and ${passwordEnv} must be set together`);
  }

  const response = await fetch(`${expectedApiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ mb_id: id, mb_password: password }),
  });

  let envelope = null;
  try {
    envelope = await response.json();
  } catch {
    // handled below with a clearer failure message
  }

  const token = envelope?.data?.token;
  const refreshToken = envelope?.data?.refresh_token;
  if (!response.ok || !envelope?.success || !token) {
    fail(`${label} smoke login failed`, {
      status: response.status,
      message: envelope?.message || response.statusText,
    });
  }

  const cookies = [
    {
      name: 'g5_auth_hint',
      value: '1',
      url: appUrl,
      sameSite: 'Lax',
    },
    {
      name: 'g5_token',
      value: token,
      url: appUrl,
      sameSite: 'Lax',
    },
  ];

  if (refreshToken) {
    cookies.push({
      name: 'g5_refresh',
      value: refreshToken,
      url: appUrl,
      sameSite: 'Lax',
    });
  }

  await context.addCookies(cookies);
  await context.addInitScript(
    ({ accessToken }) => {
      window.localStorage.setItem('g5_token', accessToken);
    },
    { accessToken: token }
  );
  return true;
}

function unique(values) {
  return Array.from(new Set(values));
}

async function inspectPage(page, check) {
  const path = normalizePath(check.path);
  const url = `${appUrl}${path === '/' ? '/' : path}`;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const apiUrls = [];

  page.removeAllListeners();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const requestUrl = request.url();
    if (requestUrl.includes('/api/')) {
      apiUrls.push(requestUrl);
    }
    failedRequests.push({
      method: request.method(),
      url: requestUrl,
      errorText: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
    });
  });
  page.on('response', (response) => {
    const responseUrl = response.url();
    if (responseUrl.includes('/api/')) {
      apiUrls.push(responseUrl);
    }
    if (response.status() >= 400 && !responseUrl.includes('favicon.ico')) {
      badResponses.push(`${response.status()} ${responseUrl}`);
    }
  });

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  if (check.expectedFinalPath) {
    const expectedFinalUrl = new URL(normalizePath(check.expectedFinalPath), `${appUrl}/`).href;
    if (!sameUrlWithoutTrailingSlash(page.url(), expectedFinalUrl)) {
      await waitForUrlWithoutTrailingSlash(page, expectedFinalUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch((error) => {
        throw new Error(
          `${check.label} expected final URL ${expectedFinalUrl}, current URL ${page.url()}: ${error.message}`
        );
      });
    }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  }
  await page.waitForTimeout(800);

  const expectedSelectors = check.expectedSelectors || [];
  const forbiddenSelectors = check.forbiddenSelectors || [];
  const actual = await page.evaluate(({ expectedSelectors: selectors, forbiddenSelectors }) => {
    const anchors = Array.from(document.querySelectorAll('a[href]')).map(
      (anchor) => anchor.getAttribute('href') || ''
    );
    const headerHrefs = Array.from(document.querySelectorAll('header a[href]')).map(
      (anchor) => anchor.getAttribute('href') || ''
    );

    function normalizeText(value) {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function isElementVisible(element) {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
        return false;
      }

      if (element.closest('[hidden], [aria-hidden="true"]')) {
        return false;
      }

      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      return element.getClientRects().length > 0;
    }

    function describeElement(element) {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList || [])
        .slice(0, 3)
        .map((className) => `.${className}`)
        .join('');
      const text = normalizeText(element.textContent).slice(0, 60);
      return `${tag}${id}${classes}${text ? ` "${text}"` : ''}`;
    }

    function referencedText(element, attr) {
      return normalizeText(
        (element.getAttribute(attr) || '')
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' ')
      );
    }

    function labelText(element) {
      const labels = 'labels' in element ? Array.from(element.labels || []) : [];
      return normalizeText(labels.map((label) => label.textContent || '').join(' '));
    }

    function accessibleName(element) {
      const ariaLabel = normalizeText(element.getAttribute('aria-label'));
      if (ariaLabel) return ariaLabel;

      const labelledBy = referencedText(element, 'aria-labelledby');
      if (labelledBy) return labelledBy;

      const label = labelText(element);
      if (label) return label;

      const title = normalizeText(element.getAttribute('title'));
      if (title) return title;

      if (element instanceof HTMLInputElement) {
        const type = element.type.toLowerCase();
        if (['button', 'submit', 'reset'].includes(type)) {
          const value = normalizeText(element.value);
          if (value) return value;
        }
        const placeholder = normalizeText(element.placeholder);
        if (placeholder) return placeholder;
      }

      const descendantImageAlt = normalizeText(
        Array.from(element.querySelectorAll('img[alt]'))
          .map((image) => image.getAttribute('alt') || '')
          .join(' ')
      );
      if (descendantImageAlt) return descendantImageAlt;

      const svgTitle = normalizeText(
        Array.from(element.querySelectorAll('svg title'))
          .map((titleElement) => titleElement.textContent || '')
          .join(' ')
      );
      if (svgTitle) return svgTitle;

      return normalizeText(element.textContent);
    }

    function inspectAccessibility() {
      const controls = Array.from(
        document.querySelectorAll(
          [
            'button',
            'a[href]',
            'input:not([type="hidden"])',
            'select',
            'textarea',
            '[role="button"]',
            '[role="link"]',
            '[role="menuitem"]',
            '[role="tab"]',
            '[role="checkbox"]',
            '[role="radio"]',
            '[role="switch"]',
            '[role="combobox"]',
          ].join(',')
        )
      );

      return {
        mainContentCount: document.querySelectorAll('main#main-content').length,
        skipLinkCount: document.querySelectorAll('a[href="#main-content"]').length,
        missingImageAlts: Array.from(document.querySelectorAll('img:not([alt])'))
          .filter(isElementVisible)
          .map(describeElement)
          .slice(0, 20),
        unnamedControls: controls
          .filter((element) => isElementVisible(element))
          .filter((element) => !accessibleName(element))
          .map(describeElement)
          .slice(0, 20),
      };
    }

    function inspectLayout() {
      const doc = document.documentElement;
      const body = document.body;
      const viewportWidth = Math.round(window.visualViewport?.width || doc.clientWidth || window.innerWidth);
      const scrollWidth = Math.max(doc.scrollWidth || 0, body?.scrollWidth || 0);
      const fixedElements = new WeakSet();

      function isInsideFixedElement(element) {
        for (let current = element; current && current !== body; current = current.parentElement) {
          if (fixedElements.has(current)) {
            return true;
          }
          const isFixed = getComputedStyle(current).position === 'fixed';
          if (isFixed) {
            fixedElements.add(current);
            return true;
          }
        }
        return false;
      }

      function isInsideHorizontalOverflowContainer(element) {
        const containedOverflowValues = new Set(['auto', 'scroll', 'hidden', 'clip']);
        for (
          let current = element.parentElement;
          current && current !== body;
          current = current.parentElement
        ) {
          const style = getComputedStyle(current);
          if (!containedOverflowValues.has(style.overflowX)) {
            continue;
          }

          const rect = current.getBoundingClientRect();
          if (rect.left >= -1 && rect.right <= viewportWidth + 1) {
            return true;
          }
        }
        return false;
      }

      const offenders = Array.from(document.querySelectorAll('body *'))
        .filter((element) => !isInsideFixedElement(element))
        .filter((element) => !isInsideHorizontalOverflowContainer(element))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { element, rect };
        })
        .filter(({ element, rect }) => {
          if (rect.width <= 0 || rect.height <= 0) {
            return false;
          }
          if (!isElementVisible(element)) {
            return false;
          }
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .map(({ element, rect }) => ({
          element: describeElement(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          overflow: Math.ceil(Math.max(0, rect.right - viewportWidth, -rect.left)),
        }))
        .sort((a, b) => b.overflow - a.overflow)
        .slice(0, 10);
      const contentOverflow = offenders.reduce(
        (maxOverflow, offender) => Math.max(maxOverflow, offender.overflow),
        0
      );

      return {
        viewportWidth,
        scrollWidth,
        documentHorizontalOverflow: Math.max(0, scrollWidth - viewportWidth),
        horizontalOverflow: contentOverflow,
        offenders,
      };
    }

    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
      jsonLdTypes: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .flatMap((script) => {
          try {
            const payload = JSON.parse(script.textContent || '{}');
            const entries = Array.isArray(payload) ? payload : [payload];
            return entries.flatMap((entry) => entry?.['@type'] || []);
          } catch {
            return [];
          }
        }),
      runtimeConfig:
        window.__G5_APP_CONFIG__ ||
        window.__G5_NEXTJS25_CONFIG__ ||
        window.__G5_GREENHUB_CONFIG__ ||
        null,
      headerHrefs,
      selectorMatches: selectors.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
      })),
      forbiddenSelectorMatches: forbiddenSelectors.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
      })),
      longLinks: anchors
        .filter((href) =>
          /\/boards\/|\/shop\/products\/|\/shop\/categories\/|\/shop\/products\?[^#]*it_type[1-5]=1/.test(
            href
          )
        )
        .slice(0, 20),
      accessibility: inspectAccessibility(),
      layout: inspectLayout(),
    };
  }, { expectedSelectors, forbiddenSelectors });

  return {
    check,
    status: response?.status() || 0,
    finalUrl: page.url(),
    apiUrls: unique(apiUrls),
    consoleErrors,
    pageErrors,
    failedRequests,
    badResponses,
    actual,
    viewport: activeViewport.name,
  };
}

function assertPage(result) {
  const { check, status, apiUrls, actual } = result;
  const path = normalizePath(check.path);
  const expectedPath = check.expectedFinalPath ? normalizePath(check.expectedFinalPath) : path;
  const expectedSeoPath = check.expectedCanonicalPath
    ? normalizePath(check.expectedCanonicalPath)
    : expectedPath;
  const expectedUrl = new URL(expectedSeoPath, `${appUrl}/`).href;
  const sameSeoUrl = check.allowSeoQueryStripping
    ? sameUrlAllowingQueryStripping
    : sameUrlWithoutTrailingSlash;

  if (status !== 200) {
    fail(`${check.label} returned HTTP ${status}`, result);
  }

  if (check.expectedTitleIncludes && !actual.title.includes(check.expectedTitleIncludes)) {
    fail(`${check.label} title does not include ${check.expectedTitleIncludes}`, {
      actual: actual.title,
      expectedTitleIncludes: check.expectedTitleIncludes,
    });
  }

  if (check.expectedH1 && actual.h1 !== check.expectedH1) {
    fail(`${check.label} h1 mismatch`, {
      actual: actual.h1,
      expected: check.expectedH1,
    });
  }

  for (const type of check.expectedJsonLdTypes || []) {
    if (!actual.jsonLdTypes.includes(type)) {
      fail(`${check.label} missing JSON-LD type ${type}`, {
        actual: actual.jsonLdTypes,
        expected: check.expectedJsonLdTypes,
      });
    }
  }

  for (const match of actual.selectorMatches || []) {
    if (match.count < 1) {
      fail(`${check.label} missing expected selector ${match.selector}`, {
        selectorMatches: actual.selectorMatches,
        finalUrl: result.finalUrl,
      });
    }
  }

  for (const match of actual.forbiddenSelectorMatches || []) {
    if (match.count > 0) {
      fail(`${check.label} rendered forbidden selector ${match.selector}`, {
        forbiddenSelectorMatches: actual.forbiddenSelectorMatches,
        finalUrl: result.finalUrl,
      });
    }
  }

  for (const part of check.forbiddenFinalPathParts || []) {
    if (result.finalUrl.includes(part)) {
      fail(`${check.label} navigated to forbidden final URL`, {
        finalUrl: result.finalUrl,
        forbidden: part,
      });
    }
  }

  if (actual.accessibility?.mainContentCount !== 1) {
    fail(`${check.label} must render one main#main-content landmark`, {
      accessibility: actual.accessibility,
      finalUrl: result.finalUrl,
    });
  }

  if ((actual.accessibility?.skipLinkCount || 0) < 1) {
    fail(`${check.label} must render a skip link to #main-content`, {
      accessibility: actual.accessibility,
      finalUrl: result.finalUrl,
    });
  }

  if ((actual.accessibility?.missingImageAlts || []).length > 0) {
    fail(`${check.label} has images without alt attributes`, {
      missingImageAlts: actual.accessibility.missingImageAlts,
      finalUrl: result.finalUrl,
    });
  }

  if ((actual.accessibility?.unnamedControls || []).length > 0) {
    fail(`${check.label} has interactive elements without accessible names`, {
      unnamedControls: actual.accessibility.unnamedControls,
      finalUrl: result.finalUrl,
    });
  }

  if (result.viewport === 'mobile' && (actual.layout?.horizontalOverflow || 0) > 1) {
    fail(`${check.label} has page-level horizontal overflow on mobile`, {
      layout: actual.layout,
      finalUrl: result.finalUrl,
    });
  }

  const runtimeApi = trimTrailingSlash(actual.runtimeConfig?.apiBaseUrl || '');
  if (runtimeApi !== expectedRuntimeApiUrl) {
    fail(`${check.label} runtime apiBaseUrl is ${runtimeApi || '(empty)'}`, result);
  }

  const unexpectedApiUrls = apiUrls.filter((url) => !url.startsWith(`${expectedApiUrl}/`));
  if (unexpectedApiUrls.length > 0) {
    fail(`${check.label} used unexpected API origin`, { unexpectedApiUrls, expectedApiUrl });
  }

  for (const part of check.expectedApiParts || []) {
    if (!apiUrls.some((url) => url.includes(part))) {
      fail(`${check.label} did not call expected API path ${part}`, result);
    }
  }

  for (const part of check.forbiddenApiParts || []) {
    if (apiUrls.some((url) => url.includes(part))) {
      fail(`${check.label} called forbidden API path ${part}`, result);
    }
  }

  if (
    !check.skipSeoUrlCheck &&
    path !== '/' &&
    actual.canonical &&
    !sameSeoUrl(actual.canonical, expectedUrl)
  ) {
    fail(`${check.label} canonical mismatch`, {
      actual: actual.canonical,
      expected: expectedUrl,
    });
  }

  if (
    !check.skipSeoUrlCheck &&
    path !== '/' &&
    actual.ogUrl &&
    !sameSeoUrl(actual.ogUrl, expectedUrl)
  ) {
    fail(`${check.label} og:url mismatch`, {
      actual: actual.ogUrl,
      expected: expectedUrl,
    });
  }

  if (check.checkShortLinks !== false && actual.longLinks.length > 0) {
    fail(`${check.label} still has long internal links`, actual.longLinks);
  }

  for (const href of check.expectedHeaderHrefs || []) {
    if (!actual.headerHrefs.includes(href)) {
      fail(`${check.label} missing expected header href ${href}`, {
        expected: check.expectedHeaderHrefs,
        actual: actual.headerHrefs,
      });
    }
  }

  for (const part of check.forbiddenHeaderHrefParts || []) {
    const matched = actual.headerHrefs.filter((href) => href.includes(part));
    if (matched.length > 0) {
      fail(`${check.label} has forbidden header href ${part}`, {
        forbidden: part,
        matched,
        actual: actual.headerHrefs,
      });
    }
  }

  const runtimeProblems = browserRuntimeProblems(result);

  if (
    runtimeProblems.consoleErrors.length > 0 ||
    runtimeProblems.pageErrors.length > 0 ||
    runtimeProblems.failedRequests.length > 0 ||
    runtimeProblems.badResponses.length > 0
  ) {
    fail(`${check.label} has browser/runtime errors`, {
      ...runtimeProblems,
    });
  }
}

async function runChecks(browser, checks, options = {}) {
  let context = null;

  async function openContext() {
    const nextContext = await browser.newContext({
      viewport: activeViewport.viewport,
      isMobile: activeViewport.isMobile,
      hasTouch: activeViewport.hasTouch,
      serviceWorkers: 'block',
    });
    await nextContext.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });

    if (options.authenticated) {
      const didAuthenticate = await authenticateContext(nextContext, options.credentials);
      if (!didAuthenticate) {
        await nextContext.close();
        return null;
      }
    }

    return nextContext;
  }

  try {
    context = await openContext();
    if (!context) {
      return {
        results: [],
        skipped: true,
      };
    }

    const results = [];
    async function inspectCheckInFreshPage(check) {
      const page = await context.newPage();
      try {
        return await inspectPage(page, check);
      } finally {
        await page.close().catch(() => {});
      }
    }

    for (const check of checks) {
      let result = await inspectCheckInFreshPage(check);
      for (
        let attempt = 1;
        attempt <= browserRuntimeRetries && isRetryableHydrationResult(result);
        attempt += 1
      ) {
        console.warn(
          `[check-local-browser] retrying ${check.label} after hydration runtime error (${attempt}/${browserRuntimeRetries})`
        );
        await context.close();
        context = await openContext();
        if (!context) {
          return {
            results: [],
            skipped: true,
          };
        }
        result = await inspectCheckInFreshPage(check);
      }
      assertPage(result);
      results.push({
        label: check.label,
        path: check.path,
        viewport: result.viewport,
        status: result.status,
        apiCalls: result.apiUrls.length,
        title: result.actual.title,
      });
    }

    return { results, skipped: false };
  } finally {
    await context?.close();
  }
}

const browser = await chromium.launch({ headless: true });

try {
  const results = [];
  const guest = await runChecks(browser, filterSkippedChecks(smokePaths));
  results.push(...guest.results);

  const authenticated = await runChecks(browser, filterSkippedChecks(authSmokePaths), {
    authenticated: true,
    credentials: {
      id: authId,
      password: authPassword,
      label: 'authenticated',
      idEnv: 'LOCAL_SMOKE_LOGIN_ID',
      passwordEnv: 'LOCAL_SMOKE_LOGIN_PASSWORD',
    },
  });
  if (authenticated.skipped) {
    if (requireAuth) {
      fail(
        'authenticated checks require LOCAL_SMOKE_LOGIN_ID and LOCAL_SMOKE_LOGIN_PASSWORD'
      );
    }
    console.log(
      '[check-local-browser] authenticated checks skipped (set LOCAL_SMOKE_LOGIN_ID and LOCAL_SMOKE_LOGIN_PASSWORD)'
    );
  } else {
    results.push(...authenticated.results);
  }

  console.table(results);
  console.log(`[check-local-browser] app=${appUrl}`);
  console.log(`[check-local-browser] api=${expectedApiUrl}`);
  console.log(`[check-local-browser] runtime-api=${expectedRuntimeApiUrl}`);
  console.log(`[check-local-browser] theme=${themeSource}`);
  console.log(
    `[check-local-browser] viewport=${activeViewport.name} ${activeViewport.viewport.width}x${activeViewport.viewport.height}`
  );
} finally {
  await browser.close();
}
