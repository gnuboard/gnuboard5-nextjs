import { liveAppUrl } from './lib/live-env.mjs';

const checkLabel = 'check-live-social-redirects';

const socialBaseUrl = trimTrailingSlash(process.env.LIVE_SOCIAL_BASE_URL || liveAppUrl(checkLabel));
const allowedScheme = normalizeScheme(process.env.LIVE_SOCIAL_ALLOWED_SCHEME || 'dday-app');
const deniedScheme = normalizeScheme(process.env.LIVE_SOCIAL_DENIED_SCHEME || 'evil');
const deniedWebRedirect =
  process.env.LIVE_SOCIAL_DENIED_WEB_REDIRECT || 'https://evil.example/login/social-callback';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeScheme(value) {
  const raw = String(value || '').trim().replace(/:.*$/, '');
  return /^[a-z][a-z0-9.+-]*$/i.test(raw) ? raw.toLowerCase() : '';
}

function fail(message) {
  console.error(`[${checkLabel}] ${message}`);
  process.exit(1);
}

function socialStartUrl(redirect) {
  const url = new URL(`${socialBaseUrl}/api/social/start.php`);
  url.searchParams.set('provider', 'naver');
  url.searchParams.set('redirect', redirect);
  url.searchParams.set('debug', '1');
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep body null; the caller reports the status and first response bytes.
  }
  return { response, body, text };
}

async function expectError(redirect, expectedError) {
  const result = await fetchJson(socialStartUrl(redirect));
  if (result.response.status !== 400) {
    fail(
      `expected ${redirect} to return HTTP 400, got ${result.response.status}: ${result.text.slice(0, 200)}`
    );
  }
  if (result.body?.error !== expectedError) {
    fail(`unexpected error for ${redirect}: ${result.text.slice(0, 200)}`);
  }
}

if (!allowedScheme) fail('LIVE_SOCIAL_ALLOWED_SCHEME is not a valid URI scheme');
if (!deniedScheme) fail('LIVE_SOCIAL_DENIED_SCHEME is not a valid URI scheme');
if (allowedScheme === deniedScheme) {
  fail('LIVE_SOCIAL_ALLOWED_SCHEME and LIVE_SOCIAL_DENIED_SCHEME must differ');
}

console.log(`[${checkLabel}] social=${socialBaseUrl}`);
console.log(`[${checkLabel}] allowedScheme=${allowedScheme} deniedScheme=${deniedScheme}`);

await expectError(`${deniedScheme}://oauth`, 'Disallowed mobile redirect scheme');
await expectError(deniedWebRedirect, 'Disallowed redirect host');

const allowed = await fetchJson(socialStartUrl(`${allowedScheme}://oauth`));
if (allowed.response.status !== 200) {
  fail(`expected allowed scheme to return HTTP 200, got ${allowed.response.status}: ${allowed.text.slice(0, 200)}`);
}
if (allowed.body?.success !== true || allowed.body?.redirect !== `${allowedScheme}://oauth`) {
  fail(`unexpected allowed scheme response: ${allowed.text.slice(0, 200)}`);
}
if (!Array.isArray(allowed.body?.allowed_mobile_schemes) || !allowed.body.allowed_mobile_schemes.includes(allowedScheme)) {
  fail(`allowed scheme ${allowedScheme} missing from debug allowlist response`);
}

console.log(`[${checkLabel}] live social redirect guards passed`);
