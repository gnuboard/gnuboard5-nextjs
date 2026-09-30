const checkLabel = 'check-local-social-redirects';
const socialBaseUrl = trimTrailingSlash(
  process.env.LOCAL_SOCIAL_BASE_URL ||
    process.env.LOCAL_EXPECTED_G5_URL ||
    process.env.NEXT_PUBLIC_G5_URL ||
    'http://localhost'
);
const allowedScheme = normalizeScheme(process.env.LOCAL_SOCIAL_ALLOWED_SCHEME || 'dday-app');
const deniedScheme = normalizeScheme(process.env.LOCAL_SOCIAL_DENIED_SCHEME || 'evil');

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
    // Keep body null; status checks below will provide the useful failure.
  }
  return { response, body, text };
}

if (!allowedScheme) fail('LOCAL_SOCIAL_ALLOWED_SCHEME is not a valid URI scheme');
if (!deniedScheme) fail('LOCAL_SOCIAL_DENIED_SCHEME is not a valid URI scheme');
if (allowedScheme === deniedScheme) {
  fail('LOCAL_SOCIAL_ALLOWED_SCHEME and LOCAL_SOCIAL_DENIED_SCHEME must differ');
}

console.log(`[${checkLabel}] social=${socialBaseUrl}`);
console.log(`[${checkLabel}] allowedScheme=${allowedScheme} deniedScheme=${deniedScheme}`);

const denied = await fetchJson(socialStartUrl(`${deniedScheme}://oauth`));
if (denied.response.status !== 400) {
  fail(`expected denied scheme to return HTTP 400, got ${denied.response.status}: ${denied.text.slice(0, 200)}`);
}
if (
  denied.body?.error !== 'Disallowed mobile redirect scheme' &&
  denied.text.trim() !== 'Disallowed mobile redirect scheme'
) {
  fail(`unexpected denied scheme error: ${denied.text.slice(0, 200)}`);
}

const allowed = await fetchJson(socialStartUrl(`${allowedScheme}://oauth`));
if (allowed.response.status === 200) {
  if (allowed.body?.success !== true || allowed.body?.redirect !== `${allowedScheme}://oauth`) {
    fail(`unexpected allowed scheme response: ${allowed.text.slice(0, 200)}`);
  }
  if (!Array.isArray(allowed.body?.allowed_mobile_schemes) || !allowed.body.allowed_mobile_schemes.includes(allowedScheme)) {
    fail(`allowed scheme ${allowedScheme} missing from debug allowlist response`);
  }
} else if (allowed.response.status === 302) {
  const location = allowed.response.headers.get('location') || '';
  if (!location.includes('/api/social/popup.php') || !location.includes('provider=naver')) {
    fail(`unexpected allowed scheme redirect: ${location || '(missing)'}`);
  }
} else {
  fail(`expected allowed scheme to return HTTP 200 or 302, got ${allowed.response.status}: ${allowed.text.slice(0, 200)}`);
}

console.log(`[${checkLabel}] social redirect scheme guards passed`);
