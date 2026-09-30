import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';
import {
  firstUsableBaseOption,
  productFixtureProblems,
} from './lib/shop-smoke-fixtures.mjs';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
loadLocalEnv(nextRoot);

const runShopE2e = process.env.RUN_SHOP_E2E === '1';
const loginId = process.env.LOCAL_SMOKE_LOGIN_ID || process.env.E2E_LOGIN_ID || '';
const loginPassword = process.env.LOCAL_SMOKE_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || '';
const productId = process.env.SHOP_E2E_PRODUCT_ID || process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || '';
const optionProductId = process.env.SHOP_E2E_OPTION_PRODUCT_ID || '';
const fixtureReady = process.env.SHOP_E2E_FIXTURE_READY === '1';
const host = process.env.G5_DEV_THEMES_HOST || '127.0.0.1';
const hasBasePortOverride = process.env.G5_DEV_THEMES_BASE_PORT !== undefined;
const basePort = Number.parseInt(process.env.G5_DEV_THEMES_BASE_PORT || '3001', 10);
const timeoutMs = Number.parseInt(process.env.SHOP_E2E_FIXTURE_TIMEOUT_MS || '10000', 10);
const minPointBalance = Number.parseInt(process.env.SHOP_E2E_MIN_POINT_BALANCE || '1000', 10);
const requireOptionProduct = process.env.SHOP_E2E_REQUIRE_OPTION_PRODUCT !== '0';
const allowSingleTarget = process.env.SHOP_E2E_ALLOW_SINGLE_TARGET === '1';
const allowOptionProductSkip = process.env.SHOP_E2E_ALLOW_OPTION_PRODUCT_SKIP === '1';
const singleTargetReason = String(process.env.SHOP_E2E_SINGLE_TARGET_REASON || '').trim();
const optionProductSkipReason = String(process.env.SHOP_E2E_OPTION_PRODUCT_SKIP_REASON || '').trim();
const ciRuntime = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

function fail(message, details = undefined) {
  console.error(`[require-shop-smoke-env] ${message}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function normalizeBaseUrl(value, label) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      fail(`${label} must use http or https.`, { value });
    }
    return url;
  } catch {
    fail(`${label} must be a valid absolute URL.`, { value });
  }
}

function apiBaseForAppUrl(value) {
  const url = normalizeBaseUrl(value, 'app URL');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/v1`;
  url.search = '';
  url.hash = '';
  return url;
}

function requireAuditReason(reason, envName) {
  if (reason.length < 12) {
    fail(`${envName} must explain why release smoke coverage is intentionally reduced.`, {
      required: `${envName}=<at least 12 characters>`,
    });
  }
}

function explicitTargets() {
  if (process.env.SHOP_E2E_API_URL) {
    return [
      {
        label: 'SHOP_E2E_API_URL',
        apiBaseUrl: normalizeBaseUrl(process.env.SHOP_E2E_API_URL, 'SHOP_E2E_API_URL'),
      },
    ];
  }

  const appUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.LOCAL_APP_URL || '';
  if (appUrl) {
    return [
      {
        label: 'PLAYWRIGHT_BASE_URL',
        apiBaseUrl: apiBaseForAppUrl(appUrl),
      },
    ];
  }

  return null;
}

function localThemeTargets() {
  const targets = explicitTargets();
  if (targets) return targets;

  return allVercelThemePairs().map((pair, index) => {
    const port = hasBasePortOverride ? basePort + index : pair.devPort;
    return {
      label: pair.source === pair.theme ? pair.theme : `${pair.source}->${pair.theme}`,
      apiBaseUrl: normalizeBaseUrl(`http://${host}:${port}/api/v1`, `${pair.source} API URL`),
    };
  });
}

function endpoint(apiBaseUrl, pathname) {
  return new URL(`${apiBaseUrl.pathname.replace(/\/+$/, '')}${pathname}`, apiBaseUrl);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }

  return { response, payload };
}

async function requireProductFixture(target, fixture) {
  const url = endpoint(target.apiBaseUrl, `/shop/products/${encodeURIComponent(fixture.productId)}`);
  const { response, payload } = await fetchJson(url);
  if (!response.ok || !payload?.success) {
    fail(`shop ${fixture.label} fixture is not readable for ${target.label}`, {
      url: String(url),
      status: response.status,
      payload,
    });
  }

  const problems = productFixtureProblems(payload.data, {
    expectedId: fixture.productId,
    requireBaseOption: fixture.requireBaseOption,
  });
  if (problems.length > 0) {
    fail(`shop ${fixture.label} fixture is not orderable for ${target.label}`, {
      url: String(url),
      problems,
    });
  }

  if (fixture.requireBaseOption && !firstUsableBaseOption(payload.data)) {
    fail(`shop ${fixture.label} fixture has no usable option for ${target.label}`, {
      url: String(url),
    });
  }
}

async function requireSmokeAccount(target) {
  const loginUrl = endpoint(target.apiBaseUrl, '/auth/login');
  const login = await fetchJson(loginUrl, {
    method: 'POST',
    body: JSON.stringify({
      mb_id: loginId,
      mb_password: loginPassword,
    }),
  });

  if (!login.response.ok || !login.payload?.success) {
    fail(`shop smoke account cannot log in for ${target.label}`, {
      url: String(loginUrl),
      status: login.response.status,
      payload: login.payload,
    });
  }

  const token = login.payload?.data?.token;
  if (!token) {
    fail(`shop smoke login did not return a JWT token for ${target.label}`, {
      url: String(loginUrl),
    });
  }

  const pointsUrl = endpoint(target.apiBaseUrl, '/shop/points/summary');
  const points = await fetchJson(pointsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const balance = Number(points.payload?.data?.balance ?? 0);
  if (!points.response.ok || !points.payload?.success || balance < minPointBalance) {
    fail(`shop smoke account does not have enough point balance for ${target.label}`, {
      url: String(pointsUrl),
      status: points.response.status,
      balance,
      required: minPointBalance,
      payload: points.payload,
    });
  }
}

const missing = [];
if (!runShopE2e) missing.push('RUN_SHOP_E2E=1');
if (!loginId) missing.push('LOCAL_SMOKE_LOGIN_ID or E2E_LOGIN_ID');
if (!loginPassword) missing.push('LOCAL_SMOKE_LOGIN_PASSWORD or E2E_LOGIN_PASSWORD');
if (!productId) missing.push('SHOP_E2E_PRODUCT_ID or LOCAL_SMOKE_SHOP_PRODUCT_ID');
if (requireOptionProduct && !optionProductId) missing.push('SHOP_E2E_OPTION_PRODUCT_ID');
if (!fixtureReady) missing.push('SHOP_E2E_FIXTURE_READY=1');

if (process.env.SHOP_E2E_API_URL && !allowSingleTarget) {
  fail('SHOP_E2E_API_URL checks only one API target. Set SHOP_E2E_ALLOW_SINGLE_TARGET=1 for intentional debugging.', {
    configured: process.env.SHOP_E2E_API_URL,
  });
}

if (process.env.SHOP_E2E_API_URL && allowSingleTarget) {
  requireAuditReason(singleTargetReason, 'SHOP_E2E_SINGLE_TARGET_REASON');
}

if (!requireOptionProduct) {
  if (ciRuntime) {
    fail('SHOP_E2E_REQUIRE_OPTION_PRODUCT=0 is not allowed in CI release smoke.');
  }
  if (!allowOptionProductSkip) {
    fail('SHOP_E2E_REQUIRE_OPTION_PRODUCT=0 requires SHOP_E2E_ALLOW_OPTION_PRODUCT_SKIP=1 for local debugging.');
  }
  requireAuditReason(optionProductSkipReason, 'SHOP_E2E_OPTION_PRODUCT_SKIP_REASON');
}

for (const [label, id] of [
  ['Product fixture id', productId],
  ['Option product fixture id', optionProductId],
]) {
  if (id && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    fail(`${label} must be 1-40 URL-safe characters.`);
  }
}

if (!Number.isInteger(basePort) || basePort < 1 || basePort > 65535) {
  fail('Invalid G5_DEV_THEMES_BASE_PORT. Use a TCP port from 1 to 65535.');
}

if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
  fail('Invalid SHOP_E2E_FIXTURE_TIMEOUT_MS. Use milliseconds >= 1000.');
}

if (!Number.isInteger(minPointBalance) || minPointBalance < 0) {
  fail('Invalid SHOP_E2E_MIN_POINT_BALANCE. Use a number >= 0.');
}

if (missing.length > 0) {
  fail(
    'Release shop smoke would be skipped. Configure: ' + missing.join(', '),
    {
      fixture:
        'Use visible, in-stock products, including SHOP_E2E_OPTION_PRODUCT_ID with a usable base option, and a smoke account with enough points for the checkout refund scenario.',
    }
  );
}

const targets = localThemeTargets();
const fixtures = [
  { label: 'product', productId, requireBaseOption: false },
  ...(optionProductId
    ? [{ label: 'option product', productId: optionProductId, requireBaseOption: true }]
    : []),
];
for (const target of targets) {
  for (const fixture of fixtures) {
    await requireProductFixture(target, fixture);
  }
  await requireSmokeAccount(target);
}

console.log(
  `[require-shop-smoke-env] shop smoke fixture verified for ${targets
    .map((target) => target.label)
    .join(', ')}`
);
