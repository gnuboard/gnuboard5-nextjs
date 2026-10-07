import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export function checkYoungcartServerRuntimeGuards({ repoRoot, fail, read, sources }) {
  const {
    buildNextSource,
    legacyRouteBridgeSource,
    nextConfigSource,
    productUrlSource,
    shortUrlRulesSource,
    shortUrlSource,
    staticExportGuardsSource,
    themeStaticRoutingSource,
  } = sources;

const youngCartServerRedirects = [
  ['/shop/search.php', '/shop/search'],
  ['/shop/largeimage.php', '/shop/largeimage'],
  ['/shop/mypage.php', '/mypage'],
  ['/shop/orderinquiry.php', '/shop/orders'],
  ['/shop/personalpay.php', '/shop/personalpay'],
];

for (const [source, destination] of youngCartServerRedirects) {
  if (!nextConfigSource.includes(`source: '${source}'`)) {
    fail(`next.config.ts is missing YoungCart server redirect source ${source}`);
  }
  if (!nextConfigSource.includes(`destination: '${destination}'`)) {
    fail(`next.config.ts is missing YoungCart server redirect destination ${destination}`);
  }
}

const serverRuntimeOnlyRouteHandlers = [
  'ajax.action.php',
  'ajax.coupondownload.php',
  'ajax.list.php',
  'ajax.orderdatasave.php',
  'ajax.orderstock.php',
  'bannerhit.php',
  'cartoption.php',
  'cartupdate.php',
  'category.php',
  'coupon.php',
  'event.php',
  'item.php',
  'iteminfo.php',
  'itemqa.php',
  'itemqalist.php',
  'itemqaform.php',
  'itemqaformupdate.php',
  'itemoption.php',
  'itemrecommend.php',
  'itemrecommendmail.php',
  'itemstocksms.php',
  'itemstocksmsupdate.php',
  'itemuse.php',
  'itemuselist.php',
  'itemuseform.php',
  'itemuseformupdate.php',
  'list.php',
  'listtype.php',
  'inicis/[...path]',
  'kcp/[...path]',
  'kakaopay/[...path]',
  'lg/[...path]',
  'nicepay/[...path]',
  'orderaddress.php',
  'orderaddressupdate.php',
  'ordercoupon.php',
  'orderform.php',
  'orderformupdate.php',
  'orderinquirycancel.php',
  'orderinquiryview.php',
  'orderitemcoupon.php',
  'ordersendcost.php',
  'ordersendcostcoupon.php',
  'personalpayform.php',
  'personalpayformupdate.php',
  'personalpayresult.php',
  'price/[...path]',
  'taxsave.php',
  'toss/[...path]',
  'wishupdate.php',
];

const internalRootShopFiles = new Set([
  '_common.php',
  '_head.php',
  '_tail.php',
  'cancel_pg.inc.php',
  'ordererrormail.php',
  'orderform.sub.php',
  'orderinquiry.sub.php',
  'ordermail1.inc.php',
  'ordermail2.inc.php',
  'personalpayform.sub.php',
  'settle_inicis.inc.php',
  'settle_inicis_common.php',
  'settle_kakaopay.inc.php',
  'settle_kcp.inc.php',
  'settle_kcp_common.php',
  'settle_lg.inc.php',
  'settle_lg_common.php',
  'settle_nicepay.inc.php',
  'settle_nicepay_common.php',
  'settle_toss.inc.php',
  'settle_toss_common.php',
  'shop.head.php',
  'shop.tail.php',
]);

const originalShopRoot = join(repoRoot, '..', 'shop');
const hasOriginalShopRoot = existsSync(originalShopRoot);
const isPublicPackage = existsSync(join(repoRoot, '..', 'overlay'));

if (!hasOriginalShopRoot && !isPublicPackage) {
  fail(`original YoungCart shop directory is missing: ${originalShopRoot}`);
}

// 원본에 남아 있지만 이제 쓰지 않는 아주 오래된 코드(네이버페이 주문형, shop/naverpay · settle_naverpay.inc.php) —
// 우리 앱(api · nextjs)은 이 기능을 넣지 않으므로 라우트나 예약 이름을 요구하지 않는다.
const obsoleteOriginalShopNames = new Set(['naverpay', 'settle_naverpay.inc.php']);

const rootShopPhpFiles = hasOriginalShopRoot
  ? readdirSync(originalShopRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.php') && !obsoleteOriginalShopNames.has(entry.name))
      .map((entry) => entry.name)
      .sort()
  : [];
const rootShopPhpDirs = hasOriginalShopRoot
  ? readdirSync(originalShopRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !obsoleteOriginalShopNames.has(entry.name))
      .filter((entry) => {
        try {
          return readdirSync(join(originalShopRoot, entry.name), { withFileTypes: true }).some(
            (child) => child.isFile() && child.name.endsWith('.php')
          );
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name)
      .sort()
  : [];

function phpBasename(file) {
  return file.replace(/\.php$/i, '');
}

function expectReservedShopRoot(root, context) {
  const quoted = `"${root}"`;
  const phpKey = `'${root}' => true`;
  const sharedReservedSource = `${shortUrlSource}\n${shortUrlRulesSource}`;

  for (const [label, source, token] of [
    ['g5-short-url rules', sharedReservedSource, quoted],
    ['product-url.ts shared rules', `${productUrlSource}\n${sharedReservedSource}`, quoted],
    ['legacy-route-bridge.tsx shared rules', `${legacyRouteBridgeSource}\n${sharedReservedSource}`, quoted],
    ['theme static route bridge', themeStaticRoutingSource, phpKey],
  ]) {
    if (!source.includes(token)) {
      fail(`${label} must reserve original YoungCart root "${root}" discovered from ${context}`);
    }
  }
}

for (const file of rootShopPhpFiles) {
  expectReservedShopRoot(phpBasename(file), `shop/${file}`);

  if (internalRootShopFiles.has(file)) {
    continue;
  }

  const routeHandlerExists = serverRuntimeOnlyRouteHandlers.includes(file);
  const redirectExists = nextConfigSource.includes(`source: '/shop/${file}'`);
  if (!routeHandlerExists && !redirectExists) {
    fail(`original shop/${file} must have a Next route handler or redirect, or be added to internalRootShopFiles`);
  }
}

const internalRootShopDirs = new Set([
  // Mail templates are included by order flows and are not public route entrypoints.
  'mail',
]);

for (const dir of rootShopPhpDirs) {
  expectReservedShopRoot(dir, `shop/${dir}/`);

  if (internalRootShopDirs.has(dir)) {
    continue;
  }

  const catchAllRouteExists = serverRuntimeOnlyRouteHandlers.includes(`${dir}/[...path]`);
  const explicitNestedRouteExists = serverRuntimeOnlyRouteHandlers.some((route) => route.startsWith(`${dir}/`));
  if (!catchAllRouteExists && !explicitNestedRouteExists) {
    fail(`original shop/${dir}/ PHP directory must have a Next route handler or be added to internalRootShopDirs`);
  }
}

for (const route of serverRuntimeOnlyRouteHandlers) {
  const routeSource = read(join(repoRoot, 'src/app/shop', route, 'route.ts'));
  if (!routeSource.includes('@g5-server-runtime-only')) {
    fail(`shop/${route}/route.ts must be marked as server-runtime-only`);
  }
  if (route === 'bannerhit.php') {
    if (!routeSource.includes('/shop/banners/') || !routeSource.includes('ck_bn_id')) {
      fail('shop/bannerhit.php/route.ts must bridge banner hit counting through the API');
    }
    if (!routeSource.includes('target.origin === request.nextUrl.origin') || !routeSource.includes('return fallbackShopUrl(request);')) {
      fail('shop/bannerhit.php/route.ts must block external banner redirect targets');
    }
    continue;
  }
  if (route === 'ajax.orderstock.php') {
    if (!routeSource.includes('runLegacyYoungcartTextAction') || !routeSource.includes('/shop/cart/order-stock')) {
      fail('shop/ajax.orderstock.php/route.ts must return original YoungCart order stock text response');
    }
    continue;
  }
  if (route === 'ajax.orderdatasave.php') {
    if (!routeSource.includes('runLegacyYoungcartTextAction') || !routeSource.includes('/shop/orders/legacy-data')) {
      fail('shop/ajax.orderdatasave.php/route.ts must save original YoungCart temporary order data through the API');
    }
    continue;
  }
  if (route === 'ajax.action.php') {
    for (const token of ['refresh_cart', 'cart_update', 'get_item_option', 'wish_update']) {
      if (!routeSource.includes(token)) {
        fail(`shop/ajax.action.php/route.ts must handle original YoungCart ${token} action`);
      }
    }
    continue;
  }
  if (route === 'ajax.coupondownload.php') {
    if (!routeSource.includes('/shop/coupons/download') || !routeSource.includes('error: ""')) {
      fail('shop/ajax.coupondownload.php/route.ts must bridge original coupon download JSON format');
    }
    continue;
  }
  if (route === 'ajax.list.php') {
    if (!routeSource.includes('/shop/products?') || !routeSource.includes('item:')) {
      fail('shop/ajax.list.php/route.ts must return original YoungCart product list JSON shape');
    }
    continue;
  }
  if ([
    'inicis/[...path]',
    'kcp/[...path]',
    'kakaopay/[...path]',
    'lg/[...path]',
    'nicepay/[...path]',
    'price/[...path]',
    'toss/[...path]',
  ].includes(route)) {
    const provider = route.split('/')[0];
    if (!routeSource.includes('legacyProviderPhpRedirect') || !routeSource.includes(`"${provider}"`)) {
      fail(`shop/${route}/route.ts must pass original YoungCart ${provider} provider callbacks to PHP`);
    }
    continue;
  }
  if (route === 'itemuselist.php') {
    if (!routeSource.includes('legacyReviewList') || !routeSource.includes('"review"')) {
      fail('shop/itemuselist.php/route.ts must return original YoungCart review list HTML');
    }
    continue;
  }
  if (route === 'itemqalist.php') {
    if (!routeSource.includes('legacyReviewList') || !routeSource.includes('"qa"')) {
      fail('shop/itemqalist.php/route.ts must return original YoungCart Q&A list HTML');
    }
    continue;
  }
  if (route === 'taxsave.php') {
    if (!routeSource.includes('legacyYoungcartPhpRedirect') || !routeSource.includes('/shop/taxsave.php')) {
      fail('shop/taxsave.php/route.ts must pass cash receipt issue requests to original YoungCart PHP');
    }
    continue;
  }
  if (route === 'orderinquirycancel.php') {
    if (!routeSource.includes('NextResponse.redirect') || !routeSource.includes('/shop/orders/')) {
      fail('shop/orderinquirycancel.php/route.ts must route legacy cancel entry to the Next.js order detail');
    }
    continue;
  }
  if (route === 'ordersendcost.php') {
    if (!routeSource.includes('/shop/shipping/extra') || !routeSource.includes('text/plain')) {
      fail('shop/ordersendcost.php/route.ts must return original YoungCart extra shipping cost text');
    }
    continue;
  }
  if (['ordercoupon.php', 'orderitemcoupon.php', 'ordersendcostcoupon.php'].includes(route)) {
    if (!routeSource.includes('fetchLegacyCoupons') || !routeSource.includes('renderLegacyCouponPicker')) {
      fail(`shop/${route}/route.ts must return original YoungCart coupon picker HTML`);
    }
    continue;
  }
  if (['cartupdate.php', 'wishupdate.php'].includes(route)) {
    if (!routeSource.includes('runLegacyYoungcartAction') || !routeSource.includes('legacy-update')) {
      fail(`shop/${route}/route.ts must bridge the original YoungCart action through the API legacy-update endpoint`);
    }
    if (route === 'wishupdate.php' && !routeSource.includes('guardMutation: true')) {
      fail('shop/wishupdate.php/route.ts must guard legacy GET wishlist mutations against CSRF');
    }
    continue;
  }
  if (route === 'orderaddressupdate.php') {
    if (!routeSource.includes('runLegacyYoungcartAction') || !routeSource.includes('/shop/addresses/legacy-update')) {
      fail('shop/orderaddressupdate.php/route.ts must bridge original YoungCart address update form through the API');
    }
    continue;
  }
  if (route === 'orderformupdate.php') {
    if (!routeSource.includes('/shop/orders') || !routeSource.includes('/shop/payment/confirm')) {
      fail('shop/orderformupdate.php/route.ts must bridge original YoungCart order completion through the order/payment APIs');
    }
    continue;
  }
  if (route === 'personalpayformupdate.php') {
    if (!routeSource.includes('/shop/personalpay/') || !routeSource.includes('alertRedirect')) {
      fail('shop/personalpayformupdate.php/route.ts must handle legacy personal payment POSTs without a 404');
    }
    continue;
  }
  if (route === 'cartoption.php') {
    if (!routeSource.includes('renderLegacyCartOptionResponse')) {
      fail('shop/cartoption.php/route.ts must return original YoungCart cart option edit HTML');
    }
    continue;
  }
  if (route === 'itemoption.php') {
    if (!routeSource.includes('renderLegacyItemOptionResponse')) {
      fail('shop/itemoption.php/route.ts must return original YoungCart option <option> HTML');
    }
    continue;
  }
  if (route === 'iteminfo.php') {
    if (!routeSource.includes('NextResponse.redirect') || !routeSource.includes('tab", "reviews') || !routeSource.includes('tab", "qa')) {
      fail('shop/iteminfo.php/route.ts must route original YoungCart item info requests to Next.js product tabs');
    }
    continue;
  }
  if (['itemrecommendmail.php', 'itemstocksmsupdate.php', 'itemuseformupdate.php', 'itemqaformupdate.php'].includes(route)) {
    if (!routeSource.includes('runLegacyYoungcartAction')) {
      fail(`shop/${route}/route.ts must bridge the original YoungCart form action through the API`);
    }
    if (['itemuseformupdate.php', 'itemqaformupdate.php'].includes(route) && !routeSource.includes('apiMethod')) {
      fail(`shop/${route}/route.ts must choose the API method for create/update/delete form actions`);
    }
    continue;
  }
  if (!routeSource.includes('legacyYoungcartRedirect')) {
    fail(`shop/${route}/route.ts must use legacyYoungcartRedirect`);
  }
}

for (const route of ['route.ts', 'index.php/route.ts']) {
  const routeSource = read(join(repoRoot, 'src/app/mobile', route));
  if (!routeSource.includes('@g5-server-runtime-only')) {
    fail(`mobile/${route} must be marked as server-runtime-only`);
  }
  if (!routeSource.includes('legacyYoungcartRedirect') || !routeSource.includes('"/"')) {
    fail(`mobile/${route} must redirect original mobile home requests to the Next.js root`);
  }
}

const mobileGnuboardServerRuntimeRoutes = [
  ['content.php/route.ts', ['"/content"', '"/shop/content"', '"service"']],
  ['group.php/route.ts', ['/boards']],
];

for (const [route, expectedTokens] of mobileGnuboardServerRuntimeRoutes) {
  const routeSource = read(join(repoRoot, 'src/app/mobile', route));
  if (!routeSource.includes('@g5-server-runtime-only')) {
    fail(`mobile/${route} must be marked as server-runtime-only`);
  }
  if (!routeSource.includes('legacyYoungcartRedirect')) {
    fail(`mobile/${route} must use legacyYoungcartRedirect`);
  }
  for (const expectedToken of expectedTokens) {
    if (!routeSource.includes(expectedToken)) {
      fail(`mobile/${route} must redirect legacy mobile Gnuboard requests with token ${expectedToken}`);
    }
  }
}

const bbsCatchAllSource = read(join(repoRoot, 'src/app/bbs/[...path]/route.ts'));
for (const token of [
  '@g5-server-runtime-only',
  'case "login.php"',
  'case "register.php"',
  'case "register_form.php"',
  'case "register_result.php"',
  'case "password_lost.php"',
  'case "poll_result.php"',
  'case "qalist.php"',
  'case "qaview.php"',
  'case "qawrite.php"',
  'reply_to',
  'case "memo.php"',
  'case "memo_form.php"',
  'case "memo_view.php"',
  'case "profile.php"',
  'case "point.php"',
  'case "scrap.php"',
  'case "board.php"',
  'case "write.php"',
  'case "content.php"',
  'case "group.php"',
  'case "faq.php"',
  'case "new.php"',
  'case "search.php"',
  'legacyYoungcartPhpRedirect',
  'legacyYoungcartRedirect',
]) {
  if (!bbsCatchAllSource.includes(token)) {
    fail(`bbs/[...path]/route.ts is missing legacy Gnuboard BBS bridge token ${token}`);
  }
}

const mobileShopServerRuntimeOnlyRouteHandlers = [
  'route.ts',
  '[...path]/route.ts',
];

for (const route of mobileShopServerRuntimeOnlyRouteHandlers) {
  const routeSource = read(join(repoRoot, 'src/app/mobile/shop', route));
  if (!routeSource.includes('@g5-server-runtime-only')) {
    fail(`mobile/shop/${route} must be marked as server-runtime-only`);
  }
}

const mobileShopCatchAllSource = read(join(repoRoot, 'src/app/mobile/shop/[...path]/route.ts'));
for (const token of [
  'ORIGINAL_PHP_ROOTS',
  'PASS_THROUGH_ROOT_FILES',
  'samsungpay',
  '/mobile/shop/',
  'orderform.php',
  'personalpayform.php',
  'case "iteminfo.php"',
  'case "itemqaform.php"',
  'case "itemuseform.php"',
  'case "personalpayresult.php"',
  'tab: "qa"',
  'tab: "reviews"',
  'legacyYoungcartPhpRedirect',
  'legacyYoungcartRedirect',
]) {
  if (!mobileShopCatchAllSource.includes(token)) {
    fail(`mobile/shop/[...path]/route.ts is missing mobile YoungCart legacy bridge token ${token}`);
  }
}

for (const route of ['iteminfo.php', 'personalpayresult.php']) {
  if (mobileShopCatchAllSource.includes(`  "${route}",`)) {
    fail(`mobile/shop/[...path]/route.ts must canonicalize ${route} instead of passing it through`);
  }
}

const internalMobileRootShopFiles = new Set([
  '_common.php',
  '_head.php',
  '_tail.php',
  'orderform.sub.php',
  'orderinquiry.sub.php',
  'personalpayform.sub.php',
  'settle_inicis.inc.php',
  'settle_kcp.inc.php',
  'settle_lg.inc.php',
  'settle_nicepay.inc.php',
  'settle_toss.inc.php',
  'shop.head.php',
  'shop.tail.php',
]);

const originalMobileShopRoot = join(repoRoot, '..', 'mobile', 'shop');
const hasOriginalMobileShopRoot = existsSync(originalMobileShopRoot);

if (!hasOriginalMobileShopRoot && !isPublicPackage) {
  fail(`original mobile YoungCart shop directory is missing: ${originalMobileShopRoot}`);
}

const mobileRootShopPhpFiles = hasOriginalMobileShopRoot
  ? readdirSync(originalMobileShopRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.php'))
      .map((entry) => entry.name)
      .sort()
  : [];

for (const file of mobileRootShopPhpFiles) {
  expectReservedShopRoot(phpBasename(file), `mobile/shop/${file}`);

  if (internalMobileRootShopFiles.has(file)) {
    continue;
  }

  if (!mobileShopCatchAllSource.includes(`"${file}"`)) {
    fail(
      `original mobile/shop/${file} must be explicitly handled by the mobile YoungCart catch-all route`
    );
  }
}

const originalMobileShopPhpDirs = hasOriginalMobileShopRoot
  ? readdirSync(originalMobileShopRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        try {
          return readdirSync(join(originalMobileShopRoot, entry.name), { withFileTypes: true }).some(
            (child) => child.isFile() && child.name.endsWith('.php')
          );
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name)
      .sort()
  : [];

for (const dir of originalMobileShopPhpDirs) {
  if (!mobileShopCatchAllSource.includes(`"${dir}"`)) {
    fail(
      `original mobile/shop/${dir}/ PHP directory must be explicitly passed through by the mobile YoungCart catch-all route`
    );
  }
}

for (const token of [
  'SERVER_RUNTIME_ONLY_RE',
  'collectServerRuntimeOnlyRouteFiles',
  '.g5-static-disabled',
  'BUILD_LOCK_PATH',
  'acquireBuildLock',
  'releaseBuildLock',
]) {
  if (!buildNextSource.includes(token)) {
    fail(`build-next.mjs is missing server-runtime-only static export guard ${token}`);
  }
}

for (const token of [
  '@g5-server-runtime-only',
  'force-dynamic',
  'NextResponse.redirect',
  "output: 'export'",
  'unoptimized: STATIC_EXPORT',
]) {
  if (!staticExportGuardsSource.includes(token)) {
    fail(`check-static-export-guards.mjs is missing static export invariant token ${token}`);
  }
}
}
