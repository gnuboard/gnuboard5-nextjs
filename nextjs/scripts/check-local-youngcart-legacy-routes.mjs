import { loadLocalEnv } from './load-local-env.mjs';
import { liveAppUrl } from './lib/live-env.mjs';

loadLocalEnv(process.cwd());

const runtimeTarget =
  process.env.RUNTIME_CHECK_TARGET || (process.env.LIVE_APP_URL ? 'live' : 'local');
const isLiveTarget = runtimeTarget === 'live';
const checkLabel =
  process.env.RUNTIME_CHECK_LABEL ||
  (isLiveTarget ? 'check-live-youngcart-legacy-routes' : 'check-local-youngcart-legacy-routes');
const defaultLocalPort = process.env.LOCAL_YOUNGCART_ROUTE_SMOKE_PORT || '3075';
const defaultLocalAppUrl = process.env.LOCAL_YOUNGCART_ROUTE_SMOKE_PORT
  ? `http://localhost:${defaultLocalPort}`
  : 'http://localhost';
const appUrl = trimTrailingSlash(
  isLiveTarget
    ? liveAppUrl('check-local-youngcart-legacy-routes')
    : process.env.LOCAL_APP_URL || defaultLocalAppUrl
);
const explicitExpectedG5Url = isLiveTarget
  ? process.env.LIVE_EXPECTED_G5_URL || process.env.NEXT_PUBLIC_G5_URL || process.env.G5_PUBLIC_URL
  : process.env.LOCAL_EXPECTED_G5_URL || process.env.NEXT_PUBLIC_G5_URL || process.env.G5_PUBLIC_URL;
const expectedG5Url = trimTrailingSlash(
  explicitExpectedG5Url || (isLiveTarget ? appUrl : 'http://localhost')
);

const legacyNextRedirects = parseRedirects(
  (isLiveTarget
    ? process.env.LIVE_SMOKE_YOUNGCART_LEGACY_REDIRECTS
    : process.env.LOCAL_SMOKE_YOUNGCART_LEGACY_REDIRECTS) ||
    [
      '/shop/item.php?it_id=1446772772=>/shop/1446772772',
      '/shop/iteminfo.php?it_id=1446772772&info=use=>/shop/1446772772?tab=reviews',
      '/shop/iteminfo.php?it_id=1446772772&info=qa=>/shop/1446772772?tab=qa',
      '/shop/category.php?ca_id=2010101010=>/shop/list-2010101010',
      '/shop/list.php?ca_id=2010101010&page=2=>/shop/list-2010101010?page=2',
      '/shop/listtype.php?type=1&page=2=>/shop/type-1?page=2',
      '/shop/event.php?ev_id=1=>/shop/events/1',
      '/shop/orderform.php?sw_direct=1=>/shop/order?direct=1',
      '/shop/orderinquiryview.php?od_id=202606030001=>/shop/orders/202606030001',
      '/shop/orderinquirycancel.php?od_id=202606030001=>/shop/orders/202606030001',
      '/shop/personalpayform.php?pp_id=demo=>/shop/personalpay/demo/pay',
      '/shop/personalpayresult.php?pp_id=demo=>/shop/personalpay/demo',
      '/mobile=>/',
      '/mobile/index.php=>/',
      '/mobile/group.php?gr_id=shop&page=2=>/boards?page=2&group=shop',
      '/mobile/content.php?co_id=company=>/content/company',
      '/mobile/content.php?co_id=company&service=shop=>/shop/content/company',
      '/mobile/content.php?co_seo_title=%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C=>/content/%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C/',
      '/bbs/board.php?bo_table=free&page=2=>/free?page=2',
      '/bbs/board.php?bo_table=free&wr_id=6=>/free/6',
      '/bbs/write.php?bo_table=free=>/free/write',
      '/bbs/content.php?co_id=company=>/content/company',
      '/bbs/content.php?co_id=company&service=shop=>/shop/content/company',
      '/bbs/group.php?gr_id=shop&page=2=>/boards?page=2&group=shop',
      '/bbs/faq.php?fm_id=1=>/faq?fm_id=1',
      '/bbs/new.php?gr_id=shop&page=2=>/recent?gr_id=shop&page=2',
      '/bbs/search.php?stx=delivery&sfl=wr_subject&bo_table=free&page=2=>/search?sfl=wr_subject&bo_table=free&page=2&q=delivery',
      '/bbs/login.php?url=%2Ffree%3Fpage%3D2=>/login?redirect=%2Ffree%3Fpage%3D2',
      '/bbs/login.php?url=%2Fshop%2Fwishlist=>/shop/login?redirect=%2Fshop%2Fwishlist',
      '/bbs/register.php=>/register',
      '/bbs/register_form.php=>/register',
      '/bbs/register_result.php=>/register/result',
      '/bbs/password_lost.php=>/forgot-password',
      '/bbs/qalist.php?page=2=>/mypage/qas?page=2',
      '/bbs/qaview.php?qa_id=7=>/mypage/qas/7',
      '/bbs/qawrite.php=>/mypage/qas/new',
      '/bbs/qawrite.php?w=u&qa_id=7=>/mypage/qas/7',
      '/bbs/qawrite.php?w=r&qa_id=7=>/mypage/qas/new?reply_to=7',
      '/bbs/memo.php?kind=send&page=2=>/mypage/memos?page=2&type=send',
      '/bbs/memo_form.php?me_recv_mb_id=demo=>/mypage/memos/new?recv=demo',
      '/bbs/memo_view.php?me_id=9&kind=send=>/mypage/memos/9?type=send',
      '/bbs/profile.php?mb_id=zz_no_member=>/members/zz_no_member',
      '/bbs/point.php=>/mypage/points',
      '/bbs/scrap.php=>/mypage/scraps',
      '/mobile/shop=>/shop',
      '/mobile/shop/index.php=>/shop',
      '/mobile/shop/cart.php=>/shop/cart',
      '/mobile/shop/wishlist.php=>/shop/wishlist',
      '/mobile/shop/item.php?it_id=1446772772=>/shop/1446772772',
      '/mobile/shop/iteminfo.php?it_id=1446772772&info=qa=>/shop/1446772772?tab=qa',
      '/mobile/shop/itemqa.php?it_id=1446772772=>/shop/1446772772?tab=qa',
      '/mobile/shop/itemqaform.php?it_id=1446772772=>/shop/1446772772?tab=qa&form=qa',
      '/mobile/shop/itemrecommend.php?it_id=1446772772=>/shop/1446772772?modal=recommend',
      '/mobile/shop/itemstocksms.php?it_id=1446772772=>/shop/1446772772?modal=restock',
      '/mobile/shop/itemuse.php?it_id=1446772772=>/shop/1446772772?tab=reviews',
      '/mobile/shop/itemuseform.php?it_id=1446772772=>/shop/1446772772?tab=reviews&form=review',
      '/mobile/shop/category.php?ca_id=2010101010&page=2=>/shop/list-2010101010?page=2',
      '/mobile/shop/list.php?ca_id=2010101010&page=2=>/shop/list-2010101010?page=2',
      '/mobile/shop/listtype.php?type=2&page=3=>/shop/type-2?page=3',
      '/mobile/shop/coupon.php=>/mypage/coupons',
      '/mobile/shop/event.php?ev_id=1=>/shop/events/1',
      '/mobile/shop/largeimage.php?it_id=1446772772&no=1=>/shop/largeimage?it_id=1446772772&no=1',
      '/mobile/shop/mypage.php=>/mypage',
      '/mobile/shop/orderaddress.php=>/mypage/addresses',
      '/mobile/shop/orderform.php?sw_direct=1=>/shop/order?direct=1',
      '/mobile/shop/orderinquiry.php=>/shop/orders',
      '/mobile/shop/orderinquiryview.php?od_id=202606030001=>/shop/orders/202606030001',
      '/mobile/shop/personalpay.php=>/shop/personalpay',
      '/mobile/shop/personalpayform.php?pp_id=demo=>/shop/personalpay/demo/pay',
      '/mobile/shop/personalpayresult.php?pp_id=demo=>/shop/personalpay/demo',
      '/mobile/shop/search.php?q=TH&qcaid=2010101010=>/shop/search?q=TH&qcaid=2010101010',
    ].join(',')
);

const originalPhpPassthroughs = parseCsv(
  (isLiveTarget
    ? process.env.LIVE_SMOKE_YOUNGCART_ORIGINAL_PHP_PASSTHROUGHS
    : process.env.LOCAL_SMOKE_YOUNGCART_ORIGINAL_PHP_PASSTHROUGHS) ||
    [
      '/shop/taxsave.php',
      '/shop/inicis/inistdpay_return.php?oid=demo',
      '/shop/kcp/pp_ax_hub.php',
      // 그누보드 5.6.30 · 5.6.41 둘 다 있는 카카오페이 복귀 주소(kakaopay_result.php 는 5.6.41 에서 빠졌다)
      '/shop/kakaopay/mobile_pay_return.php',
      '/shop/lg/returnurl.php',
      '/shop/nicepay/nicepay_result.php',
      '/shop/toss/returnurl.php?orderId=demo',
      '/shop/price/naver.php',
      '/shop/naverpay/naverpay_item.php?it_id=1446772772',
      '/mobile/shop/toss/returnurl.php?orderId=demo',
      '/mobile/shop/samsungpay/orderform.1.php',
    ].join(',')
);
const redirectStatuses = new Set([301, 302, 307, 308]);

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function fail(message, detail = undefined) {
  console.error(`[${checkLabel}] ${message}`);
  if (detail !== undefined) {
    console.error(JSON.stringify(detail, null, 2));
  }
  process.exit(1);
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRedirects(value) {
  return parseCsv(value).map((item) => {
    const [from, to] = item.split('=>').map((part) => part?.trim());
    if (!from || !to) {
      fail(`Invalid redirect expectation: ${item}`);
    }
    return { from, to };
  });
}

function absoluteAppUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function absoluteG5Url(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${expectedG5Url}${path.startsWith('/') ? path : `/${path}`}`;
}

function normalizeUrl(value) {
  const url = new URL(value, appUrl);
  url.hash = '';

  const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, itemValue] of entries) {
    url.searchParams.append(key, itemValue);
  }

  return url.toString().replace(/\/+$/, '');
}

function sameUrl(actual, expected) {
  return normalizeUrl(actual) === normalizeUrl(expected);
}

function isNextStaticShellResponse(headers, text) {
  const contentType = headers.get('content-type') || '';
  return (
    contentType.includes('text/x-component') ||
    text.includes('<!--g5_static-->') ||
    text.includes('<!--g5_nextjs25_static-->') ||
    text.includes('window.__G5_APP_CONFIG__') ||
    text.includes('window.__G5_NEXTJS25_CONFIG__') ||
    text.includes('self.__next_f')
  );
}

async function fetchManual(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'manual',
  });
  const text = await response.text();
  return { response, text };
}

async function assertExpectedAppOrigin() {
  const { response, text } = await fetchManual(absoluteAppUrl('/'));

  if (response.status >= 400 || !isNextStaticShellResponse(response.headers, text)) {
    fail(`${appUrl} does not look like the G5 static app shell`, {
      status: response.status,
      hint: 'Run npm run check:local-youngcart-legacy-routes:server or set LOCAL_APP_URL to the server under test.',
      preview: text.slice(0, 200),
    });
  }
}

await assertExpectedAppOrigin();

for (const redirect of legacyNextRedirects) {
  const url = absoluteAppUrl(redirect.from);
  const expected = absoluteAppUrl(redirect.to);
  const { response, text } = await fetchManual(url);
  const location = response.headers.get('location') || '';

  if (!redirectStatuses.has(response.status) || !sameUrl(location, expected)) {
    fail(`${url} did not redirect to the expected Next.js YoungCart route`, {
      status: response.status,
      location: location || '(missing)',
      expected,
      preview: text.slice(0, 200),
    });
  }
}

for (const path of originalPhpPassthroughs) {
  const url = absoluteAppUrl(path);
  const expected = absoluteG5Url(path);
  const { response, text } = await fetchManual(url);
  const location = response.headers.get('location') || '';

  if (response.status === 404) {
    fail(`${url} returned HTTP 404; expected original YoungCart PHP passthrough`);
  }

  if (isNextStaticShellResponse(response.headers, text)) {
    fail(`${url} returned the Next.js shell; expected original YoungCart PHP passthrough`);
  }

  if (redirectStatuses.has(response.status) && !sameUrl(location, expected)) {
    fail(`${url} redirected to an unexpected original PHP URL`, {
      status: response.status,
      location: location || '(missing)',
      expected,
    });
  }
}

console.log(
  `[${checkLabel}] legacyNextRedirects=${legacyNextRedirects
    .map((redirect) => `${redirect.from}=>${redirect.to}`)
    .join(',')}`
);
console.log(`[${checkLabel}] originalPhpPassthroughs=${originalPhpPassthroughs.join(',')}`);
