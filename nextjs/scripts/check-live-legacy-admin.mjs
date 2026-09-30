import { RUNTIME_CONFIG_KEY } from './theme-name.mjs';
import { liveAppUrl } from './lib/live-env.mjs';

const appUrl = liveAppUrl('check-live-legacy-admin');
const adminId = process.env.LIVE_SMOKE_ADMIN_LOGIN_ID || '';
const adminPassword = process.env.LIVE_SMOKE_ADMIN_LOGIN_PASSWORD || '';
const checks = [];
const cookieJar = new Map();

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function appAbsoluteUrl(path) {
  return `${appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function normalizeLocation(value) {
  return trimTrailingSlash(value || '');
}

function header(headers, name) {
  return headers.get(name) || '';
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const value = headers.get('set-cookie');
  return value ? [value] : [];
}

function cookieName(value) {
  const firstPart = String(value || '').split(';', 1)[0] || '';
  return firstPart.split('=', 1)[0].trim();
}

function rememberCookies(headers) {
  for (const cookie of setCookieHeaders(headers)) {
    const pair = String(cookie).split(';', 1)[0] || '';
    const index = pair.indexOf('=');
    if (index <= 0) continue;

    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1);
    if (value === '') {
      cookieJar.delete(name);
    } else {
      cookieJar.set(name, value);
    }
  }
}

function cookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function record(area, name, ok, detail, hint = '') {
  checks.push({
    area,
    name,
    status: ok ? 'ok' : 'fail',
    detail: detail || '',
    hint: ok ? '' : hint,
  });
}

function includesAll(text, parts) {
  return parts.every((part) => text.includes(part));
}

function isNextStaticShellResponse(headers, text) {
  const contentType = header(headers, 'content-type');
  return (
    contentType.includes('text/x-component') ||
    text.includes('<!--g5_static-->') ||
    text.includes('<!--g5_nextjs25_static-->') ||
    text.includes(`window.${RUNTIME_CONFIG_KEY}`) ||
    text.includes('window.__G5_NEXTJS25_CONFIG__') ||
    text.includes('self.__next_f')
  );
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const cookies = cookieHeader();
  if (cookies) {
    headers.Cookie = cookies;
  }

  const response = await fetch(appAbsoluteUrl(path), {
    method: options.method || 'GET',
    redirect: 'manual',
    headers,
    body: options.body,
  });
  rememberCookies(response.headers);
  const text = await response.text();

  return { response, text };
}

async function checkAdminPage(path, label, expectedParts) {
  const { response, text } = await request(path);
  const contentType = header(response.headers, 'content-type');

  record(
    'legacy admin page',
    `${label} http`,
    response.status === 200 && contentType.includes('text/html'),
    `HTTP ${response.status} content-type=${contentType || '(missing)'}`,
    `${path} must render through original Gnuboard admin PHP`
  );
  record(
    'legacy admin page',
    `${label} content`,
    includesAll(text, expectedParts),
    expectedParts.filter((part) => text.includes(part)).join(', ') || 'expected text missing',
    `${path} must expose the expected Gnuboard admin menu/page content`
  );
  record(
    'legacy admin page',
    `${label} not nextjs shell`,
    !isNextStaticShellResponse(response.headers, text),
    `HTTP ${response.status} content-type=${contentType || '(missing)'}`,
    `${path} must not be rewritten to the Next.js shell`
  );
}

if (!adminId || !adminPassword) {
  console.log(
    '[check-live-legacy-admin] skipped; set LIVE_SMOKE_ADMIN_LOGIN_ID and LIVE_SMOKE_ADMIN_LOGIN_PASSWORD to verify original /adm PHP pages'
  );
  process.exit(0);
}

const adminUrl = `${appUrl}/adm/`;
const loginPath = `/bbs/login.php?url=${encodeURIComponent(adminUrl)}`;
const login = await request(loginPath);
const sessionCookies = setCookieHeaders(login.response.headers).filter(
  (value) => cookieName(value) === 'PHPSESSID' || cookieName(value).endsWith('PHPSESSID')
);

record(
  'legacy admin login',
  'original login form',
  login.response.status === 200 &&
    login.text.includes('name="flogin"') &&
    login.text.includes('/bbs/login_check.php'),
  `HTTP ${login.response.status}`,
  '/bbs/login.php?url=/adm must render the original Gnuboard login form'
);
record(
  'legacy admin login',
  'single session cookie',
  sessionCookies.length <= 1,
  `${sessionCookies.length} session Set-Cookie header(s)`,
  'Gnuboard session SameSite adjustment must not append duplicate PHPSESSID cookies'
);

const body = new URLSearchParams({
  mb_id: adminId,
  mb_password: adminPassword,
  url: adminUrl,
});
const loginCheck = await request('/bbs/login_check.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body,
});
const loginLocation = header(loginCheck.response.headers, 'location');

record(
  'legacy admin login',
  'login_check redirect',
  [301, 302, 303, 307, 308].includes(loginCheck.response.status) &&
    normalizeLocation(loginLocation) === normalizeLocation(adminUrl),
  `HTTP ${loginCheck.response.status} location=${loginLocation || '(missing)'}`,
  'Gnuboard login_check.php must accept the test admin credentials and redirect to /adm/'
);

await checkAdminPage('/adm/', 'dashboard', ['관리자메인', '로그아웃']);
await checkAdminPage('/adm/config_form.php', 'config', ['기본환경설정', '환경설정']);
await checkAdminPage('/adm/member_list.php', 'members', ['회원관리']);
await checkAdminPage('/adm/board_list.php', 'boards', ['게시판관리']);
await checkAdminPage('/adm/shop_admin/itemlist.php', 'shop products', ['상품관리']);
await checkAdminPage('/adm/shop_admin/orderlist.php', 'shop orders', ['주문내역']);

console.table(
  checks.map(({ area, name, status, detail }) => ({
    area,
    check: name,
    status,
    detail,
  }))
);

const failures = checks.filter((check) => check.status === 'fail');
if (failures.length > 0) {
  console.error(`[check-live-legacy-admin] ${failures.length} issue(s) found for ${appUrl}`);
  for (const failure of failures) {
    console.error(`- [${failure.area}] ${failure.name}: ${failure.detail}`);
    if (failure.hint) {
      console.error(`  hint: ${failure.hint}`);
    }
  }
  process.exit(1);
}

console.log(`[check-live-legacy-admin] original Gnuboard admin pages passed for ${appUrl}`);
