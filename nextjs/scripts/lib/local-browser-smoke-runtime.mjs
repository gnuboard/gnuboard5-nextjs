import { createLocalBrowserChecks } from './local-browser-checks.mjs';
import {
  createLocalBrowserRuntimeHelpers,
  trimTrailingSlash,
} from './local-browser-runtime.mjs';
import { allVercelThemePairs } from '../vercel-theme-pair.mjs';

function parseRetries(env) {
  return Math.max(
    0,
    Number.parseInt(env.LOCAL_SMOKE_BROWSER_RUNTIME_RETRIES || '0', 10) || 0
  );
}

function overrideSmokePath(smokePaths, label, values) {
  const check = smokePaths.find((item) => item.label === label);
  if (!check) return;

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      check[key] = value;
    }
  }
}

function skippedSmokeLabelSet(env) {
  return new Set(
    (env.LOCAL_SMOKE_SKIP_LABELS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function inferThemeSource(appUrl, env) {
  const explicit = String(env.LOCAL_SMOKE_THEME_SOURCE || '').trim();
  if (explicit) return explicit;

  try {
    const url = new URL(appUrl);
    const hostname = url.hostname.toLowerCase();
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const localHost = ['127.0.0.1', 'localhost', '::1'].includes(hostname);

    for (const pair of allVercelThemePairs()) {
      if (localHost && port === pair.devPort) return pair.source;

      const canonicalHost = new URL(pair.appUrl).hostname.toLowerCase();
      const projectPrefix = canonicalHost.replace(/\.vercel\.app$/, '');
      if (
        hostname === canonicalHost ||
        (hostname.endsWith('.vercel.app') && hostname.startsWith(`${projectPrefix}-`))
      ) {
        return pair.source;
      }
    }
  } catch {
    // Fall through to the configured source or the default theme source (default -> nextjs_default).
  }

  return String(env.G5_THEME_SOURCE || 'default').trim() || 'default';
}

export function createLocalBrowserSmokeRuntime({
  env = process.env,
  argv = process.argv,
} = {}) {
  const appUrl = trimTrailingSlash(env.LOCAL_APP_URL || 'http://localhost');
  const expectedApiUrl = trimTrailingSlash(
    env.LOCAL_EXPECTED_API_URL || env.NEXT_PUBLIC_API_URL || `${appUrl}/api/v1`
  );
  const expectedRuntimeApiUrl = trimTrailingSlash(
    env.LOCAL_EXPECTED_RUNTIME_API_URL || env.NEXT_PUBLIC_API_URL || expectedApiUrl
  );
  // 화면이 프록시(/api/v1)로 API 를 부르고 첨부는 백엔드가 준 절대 주소로 받는 배포(Vercel 데모 등)는 API 주소가 둘이다.
  // 쉼표로 더 허용할 API 주소를 받는다(예: https://backend.example.com/api/v1).
  const extraApiUrls = String(env.LOCAL_EXTRA_API_URLS || '')
    .split(',')
    .map((item) => trimTrailingSlash(item.trim()))
    .filter(Boolean);
  const mobileViewport = argv.includes('--mobile') || env.LOCAL_SMOKE_MOBILE === '1';
  const activeViewport = mobileViewport
    ? { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { name: 'desktop', viewport: { width: 1366, height: 900 } };
  const themeSource = inferThemeSource(appUrl, env);
  const { smokePaths, authSmokePaths } = createLocalBrowserChecks({ expectedApiUrl, themeSource });
  const runtimeHelpers = createLocalBrowserRuntimeHelpers({
    appUrl,
    expectedApiUrl,
    expectedRuntimeApiUrl,
  });

  overrideSmokePath(smokePaths, 'board post', {
    expectedTitleIncludes: env.LOCAL_SMOKE_POST_TITLE,
    expectedH1: env.LOCAL_SMOKE_POST_H1,
    expectedCanonicalPath: env.LOCAL_SMOKE_POST_CANONICAL_PATH,
  });
  overrideSmokePath(smokePaths, 'board post seo', {
    expectedFinalPath: env.LOCAL_SMOKE_POST_SEO_FINAL_PATH,
    expectedTitleIncludes: env.LOCAL_SMOKE_POST_SEO_TITLE || env.LOCAL_SMOKE_POST_TITLE,
    expectedH1: env.LOCAL_SMOKE_POST_SEO_H1 || env.LOCAL_SMOKE_POST_H1,
    expectedCanonicalPath:
      env.LOCAL_SMOKE_POST_SEO_CANONICAL_PATH || env.LOCAL_SMOKE_POST_CANONICAL_PATH,
  });

  // 상품 · 분류 검사도 다른 데이터(예: 공개 데모)에 맞출 수 있게 — 경로는 LOCAL_SMOKE_PRODUCT_PATH · LOCAL_SMOKE_CATEGORY_PATH.
  overrideSmokePath(smokePaths, 'shop product', {
    expectedTitleIncludes: env.LOCAL_SMOKE_PRODUCT_TITLE,
    expectedH1: env.LOCAL_SMOKE_PRODUCT_H1 || env.LOCAL_SMOKE_PRODUCT_TITLE,
  });
  overrideSmokePath(smokePaths, 'shop category', {
    expectedTitleIncludes: env.LOCAL_SMOKE_CATEGORY_TITLE,
    expectedH1: env.LOCAL_SMOKE_CATEGORY_H1 || env.LOCAL_SMOKE_CATEGORY_TITLE,
  });

  const skippedSmokeLabels = skippedSmokeLabelSet(env);

  return {
    appUrl,
    expectedApiUrl,
    expectedRuntimeApiUrl,
    extraApiUrls,
    authId: env.LOCAL_SMOKE_LOGIN_ID || '',
    authPassword: env.LOCAL_SMOKE_LOGIN_PASSWORD || '',
    requireAuth: argv.includes('--require-auth') || env.LOCAL_SMOKE_REQUIRE_AUTH === '1',
    seedAuth: argv.includes('--seed-auth') || env.LOCAL_SMOKE_SEED_AUTH === '1',
    activeViewport,
    themeSource,
    browserRuntimeRetries: parseRetries(env),
    smokePaths,
    authSmokePaths,
    ...runtimeHelpers,
    filterSkippedChecks(checks) {
      if (skippedSmokeLabels.size === 0) return checks;
      return checks.filter((check) => !skippedSmokeLabels.has(check.label));
    },
  };
}
