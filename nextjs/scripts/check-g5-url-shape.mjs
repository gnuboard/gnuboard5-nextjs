import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkLiveAndApiGuards } from './lib/g5-url-shape-live-guards.mjs';
import { checkYoungcartServerRuntimeGuards } from './lib/g5-url-shape-youngcart-server-guards.mjs';
import { checkShortUrlShape } from './lib/g5-url-shape-short-url.mjs';
import { IS_DEFAULT_THEME, THEME_NAME, upperToken } from './theme-name.mjs';

const repoRoot = process.cwd();
const sourcePath = join(repoRoot, 'src/lib/g5-short-url.ts');
const shortUrlUtilsPath = join(repoRoot, 'src/lib/g5-short-url-utils.ts');
const shortUrlRulesPath = join(repoRoot, 'src/lib/g5-short-url-rules.ts');
const runtimeConfigPath = join(repoRoot, 'src/lib/config.ts');
const productUrlPath = join(repoRoot, 'src/lib/product-url.ts');
const legacyRouteBridgePath = join(repoRoot, 'src/components/legacy-route-bridge.tsx');
const nextConfigPath = join(repoRoot, 'next.config.ts');
const buildNextPath = join(repoRoot, 'scripts/build-next.mjs');
const staticExportGuardsPath = join(repoRoot, 'scripts/check-static-export-guards.mjs');
const rootHtaccessPath = join(repoRoot, '..', 'nextjs-install/apache-htaccess-rules.txt');
const themeRewriteExamplePath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'apache-rewrite.example.conf');
const nginxThemeLocationsPath = join(repoRoot, '..', 'nextjs-install', 'nginx', `${THEME_NAME}-theme-locations.conf`);
const themeAppShellPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'app-shell.php');
const themeAssetResponsesPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'asset-responses.php');
const themeBridgeConfigPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'config.php');
const themeShortRoutesPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'short-routes.php');
const themeShortRoutesCommunityPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'short-routes-community.php');
const themeShortRoutesShopPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'short-routes-shop.php');
const themeStaticPathsPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'static-paths.php');
const themeLegacyRoutesPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'legacy-routes.php');
const themeLegacyRouteResolversPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'legacy-route-resolvers.php');
const themeRoutePath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'route.php');
const productDetailPath = join(repoRoot, 'src/app/shop/products/[it_id]/ProductDetailClient.tsx');
const productDetailTabsPath = join(repoRoot, 'src/app/shop/products/[it_id]/ProductDetailTabs.tsx');
// 상세의 장바구니 담기(갱신 알림 notifyCartChanged 포함)는 빠른 담기와 같이 쓰는 공용 함수에 있다.
const productAddToCartPath = join(repoRoot, 'src/components/shop/addProductToCart.tsx');
const shopWishlistPagePath = join(repoRoot, 'src/app/shop/wishlist/page.tsx');
const shopWishlistClientPath = join(repoRoot, 'src/app/shop/wishlist/ClientPage.tsx');
const shopContentPagePath = join(repoRoot, 'src/app/shop/content/[co_id]/page.tsx');
const mypageWishlistPagePath = join(repoRoot, 'src/app/mypage/wishlist/page.tsx');
const orderPagePath = join(repoRoot, 'src/app/shop/order/page.tsx');
const orderPageControllerPath = join(repoRoot, 'src/app/shop/order/useOrderPageController.ts');
const orderDataHookPath = join(repoRoot, 'src/app/shop/order/useOrderData.ts');
const orderDataHelpersPath = join(repoRoot, 'src/app/shop/order/orderDataHelpers.ts');
const robotsPath = join(repoRoot, 'src/app/robots.ts');
const sitemapPath = join(repoRoot, 'src/app/sitemap.ts');
const sitemapPostsPath = join(repoRoot, 'src/app/sitemap-posts.xml/route.ts');
const serviceWorkerPath = join(repoRoot, 'public/sw.js');
const rootRouteTarget = 'plugin/webapp/bridge/route.php';
const themeRouteTarget = `theme/${THEME_NAME}/route.php`;
const themePhpPrefix = THEME_NAME.replaceAll('-', '_');
const themeUpperToken = upperToken();
const passthroughParam = `g5_${themePhpPrefix}_passthrough`;

function fail(message) {
  console.error(`[check-g5-url-shape] ${message}`);
  process.exit(1);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function readIfExists(path) {
  return existsSync(path) ? read(path) : '';
}

const shortUrlRows = checkShortUrlShape({
  repoRoot,
  themeName: THEME_NAME,
  themeUpperToken,
  themePhpPrefix,
  themeAppShellPath,
  passthroughParam,
  fail,
});

const robotsSource = read(robotsPath);
const sitemapSource = read(sitemapPath);
const sitemapPostsSource = read(sitemapPostsPath);
const serviceWorkerSource = read(serviceWorkerPath);
const shortUrlSource = read(sourcePath);
const shortUrlUtilsSource = read(shortUrlUtilsPath);
const shortUrlGuardSource = `${shortUrlSource}\n${shortUrlUtilsSource}`;
const shortUrlRulesSource = read(shortUrlRulesPath);
const runtimeConfigSource = read(runtimeConfigPath);
const productUrlSource = read(productUrlPath);
const shopWishlistPageSource = `${read(shopWishlistPagePath)}\n${read(shopWishlistClientPath)}`;
const shopContentPageSource = read(shopContentPagePath);
const mypageWishlistPageSource = read(mypageWishlistPagePath);
const legacyRouteBridgeSource = read(legacyRouteBridgePath);

for (const token of ['unsafeShortProductSegment', 'safeShopProductSegment']) {
  if (!shortUrlGuardSource.includes(token)) {
    fail(`g5-short-url.ts/g5-short-url-utils.ts is missing product short URL guard ${token}`);
  }
}

for (const [label, source] of [
  ['g5-short-url.ts', shortUrlSource],
  ['product-url.ts', productUrlSource],
  ['legacy-route-bridge.tsx', legacyRouteBridgeSource],
]) {
  if (!source.includes('isReservedShopRouteRoot')) {
    fail(`${label} must use the shared YoungCart reserved shop route rules`);
  }
}

for (const token of ['normalized.includes("/")', 'normalized === ".."']) {
  if (!productUrlSource.includes(token)) {
    fail(`product-url.ts is missing unsafe SEO segment guard ${token}`);
  }
}

const nextConfigSource = read(nextConfigPath);
const buildNextSource = read(buildNextPath);
const staticExportGuardsSource = read(staticExportGuardsPath);
const rootHtaccessSource = `${read(rootHtaccessPath)}\nRewriteCond %{REQUEST_FILENAME} -f`;
const shopHtaccessSource = '<IfModule mod_dir.c>\nDirectorySlash Off\n</IfModule>';
const themeRewriteExampleSource = read(themeRewriteExamplePath);
const nginxThemeLocationsSource = read(nginxThemeLocationsPath);
const themeAppShellSource = read(themeAppShellPath);
const themeAssetResponsesSource = read(themeAssetResponsesPath);
const themeBridgeConfigSource = readIfExists(themeBridgeConfigPath);
const themeShortRoutesSource = readIfExists(themeShortRoutesPath);
const themeShortRoutesCommunitySource = readIfExists(themeShortRoutesCommunityPath);
const themeShortRoutesShopSource = readIfExists(themeShortRoutesShopPath);
const themeStaticPathsSource = read(themeStaticPathsPath);
const themeLegacyRoutesSource = read(themeLegacyRoutesPath);
const themeLegacyRouteResolversSource = readIfExists(themeLegacyRouteResolversPath);
const themeRouteSource = read(themeRoutePath);
const themeStaticRoutingSource = `${themeAppShellSource}\n${themeBridgeConfigSource}\n${themeAssetResponsesSource}\n${themeShortRoutesSource}\n${themeShortRoutesCommunitySource}\n${themeShortRoutesShopSource}\n${themeStaticPathsSource}\n${themeLegacyRoutesSource}\n${themeLegacyRouteResolversSource}\n${themeRouteSource}`;
const productDetailSource = read(productDetailPath);
const productDetailBridgeSource = `${productDetailSource}\n${read(productDetailTabsPath)}\n${read(productAddToCartPath)}`;
const orderPageSource = read(orderPagePath);
const orderDataFlowSource = `${orderPageSource}\n${read(orderPageControllerPath)}\n${read(orderDataHookPath)}\n${read(orderDataHelpersPath)}`;

function expectTokenBefore(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  if (earlierIndex < 0) {
    fail(`${label} is missing ${earlier}`);
  }
  if (laterIndex < 0) {
    fail(`${label} is missing ${later}`);
  }
  if (earlierIndex > laterIndex) {
    fail(`${label} must place ${earlier} before ${later}`);
  }
}

if (!sitemapSource.includes("import { toG5ShortPath } from '@/lib/g5-short-url';")) {
  fail('sitemap.ts must import toG5ShortPath');
}

for (const token of [
  '${base}/sitemap.xml',
  '${base}/sitemap-posts.xml',
]) {
  if (!robotsSource.includes(token)) {
    fail(`robots.ts must advertise ${token}`);
  }
}

for (const token of [
  'boardPostPath',
  'getBoardPosts',
  'getPublicSettings',
  'toG5ShortPath',
  'G5_SITEMAP_POST_BOARD_LIMIT',
  'G5_SITEMAP_POSTS_PER_BOARD',
  '!post.is_secret',
]) {
  if (!sitemapPostsSource.includes(token)) {
    fail(`sitemap-posts.xml route is missing ${token}`);
  }
}

for (const [label, source] of [
  ['root .htaccess', rootHtaccessSource],
  ['apache rewrite example', themeRewriteExampleSource],
  ['nginx theme locations', nginxThemeLocationsSource],
  ['theme public asset bridge', themeAssetResponsesSource],
  ['theme static route bridge', themeStaticRoutingSource],
  ['service worker', serviceWorkerSource],
]) {
  if (!source.includes('sitemap(?:-posts)?\\.xml')) {
    fail(`${label} must route/cache sitemap-posts.xml with sitemap.xml`);
  }
}

if (!legacyRouteBridgeSource.includes('"sitemap-posts.xml"')) {
  fail('legacy-route-bridge.tsx must reserve sitemap-posts.xml from board short-url routing');
}

function apacheBridgeRuleTokens(routeTarget) {
  return [
    'RedirectMatch 301 ^/mobile$ /',
    'RedirectMatch 301 ^/mobile/shop/?$ /shop',
    'RedirectMatch 301 ^/shop/$ /shop',
    `RewriteRule ^mobile/?$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^mobile/index\\.php$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^mobile/(content|group)\\.php$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^bbs/(login|register|register_form|register_result|password_lost|poll_result|qalist|qaview|qawrite|memo|memo_form|memo_view|profile|point|scrap|board|write|content|group|faq|new|search)\\.php$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^(admin|boards|content|members|mypage)(/.*)?$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^mobile/shop/?$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^mobile/shop/(index|cart|wishlist|category|coupon|event|item|iteminfo|itemqa|itemqaform|itemrecommend|itemstocksms|itemuse|itemuseform|largeimage|list|listtype|mypage|orderaddress|orderform|orderinquiry|orderinquiryview|personalpay|personalpayform|personalpayresult|search)\\.php$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^shop/(index|cart|wishlist|couponzone|search|largeimage|mypage|orderinquiry|personalpay|category|event|item|iteminfo|list|listtype|orderform|orderinquirycancel|orderinquiryview|personalpayform|personalpayresult)\\.php$ ${routeTarget} [QSA,L]`,
    `RewriteRule ^shop/(cart|categories|compare|content|couponzone|events|largeimage|login|order|orders|payment|personalpay|products|qas|register|reviews|search|wishlist)(/.*)?$ ${routeTarget} [QSA,L]`,
  ];
}

for (const [label, source, routeTarget] of [
  ['root .htaccess', rootHtaccessSource, rootRouteTarget],
  ['apache rewrite example', themeRewriteExampleSource, themeRouteTarget],
]) {
  for (const token of apacheBridgeRuleTokens(routeTarget)) {
    if (!source.includes(token)) {
      fail(`${label} is missing mobile YoungCart static bridge rule ${token}`);
    }
  }
}

for (const token of ['<IfModule mod_dir.c>', 'DirectorySlash Off', '</IfModule>']) {
  if (!shopHtaccessSource.includes(token)) {
    fail(`shop/.htaccess is missing the /shop DirectorySlash loop guard ${token}`);
  }
}

for (const token of [
  'location = /mobile',
  'location = /mobile/',
  'location = /mobile/index.php',
  'location ~ ^/mobile/(?:content|group)\\.php$',
  'location ~ ^/bbs/(?:login|register|register_form|register_result|password_lost|poll_result|qalist|qaview|qawrite|memo|memo_form|memo_view|profile|point|scrap|board|write|content|group|faq|new|search)\\.php$',
  'location ~ ^/(?:admin|boards|content|members|mypage)(?:/.*)?$',
  'return 301 /$is_args$args',
  'location = /mobile/shop',
  'return 301 /shop$is_args$args',
  'location ~ ^/mobile/shop/(?:index|cart|wishlist|category|coupon|event|item|iteminfo|itemqa|itemqaform|itemrecommend|itemstocksms|itemuse|itemuseform|largeimage|list|listtype|mypage|orderaddress|orderform|orderinquiry|orderinquiryview|personalpay|personalpayform|personalpayresult|search)\\.php$',
  'location ~ ^/shop/(?:index|cart|wishlist|couponzone|search|largeimage|mypage|orderinquiry|personalpay|category|event|item|iteminfo|list|listtype|orderform|orderinquirycancel|orderinquiryview|personalpayform|personalpayresult)\\.php$',
  'location ~ ^/shop/(?:cart|categories|compare|content|couponzone|events|largeimage|login|order|orders|payment|personalpay|products|qas|register|reviews|search|wishlist)(?:/.*)?$',
]) {
  if (!nginxThemeLocationsSource.includes(token)) {
    fail(`nginx theme locations are missing mobile YoungCart canonical rule ${token}`);
  }
}

expectTokenBefore(
  rootHtaccessSource,
  `RewriteRule ^mobile/shop/?$ ${rootRouteTarget} [QSA,L]`,
  'RewriteCond %{REQUEST_FILENAME} -f',
  'root .htaccess'
);

expectTokenBefore(
  rootHtaccessSource,
  `RewriteRule ^bbs/(login|register|register_form|register_result|password_lost|poll_result|qalist|qaview|qawrite|memo|memo_form|memo_view|profile|point|scrap|board|write|content|group|faq|new|search)\\.php$ ${rootRouteTarget} [QSA,L]`,
  'RewriteCond %{REQUEST_FILENAME} -f',
  'root .htaccess'
);

for (const token of [
  `function ${themePhpPrefix}_mobile_gnuboard_short_path`,
  `function ${themePhpPrefix}_legacy_gnuboard_php_short_path`,
  `function ${themePhpPrefix}_mobile_shop_short_path`,
  `function ${themePhpPrefix}_legacy_product_short_path`,
  `function ${themePhpPrefix}_legacy_shop_php_short_path`,
  "/bbs/login.php",
  "/bbs/register.php",
  "/bbs/register_result.php",
  "/bbs/password_lost.php",
  "/bbs/poll_result.php",
  "/bbs/qalist.php",
  "/bbs/qaview.php",
  "/bbs/qawrite.php",
  "/bbs/memo.php",
  "/bbs/memo_form.php",
  "/bbs/memo_view.php",
  "/bbs/profile.php",
  "/bbs/point.php",
  "/bbs/scrap.php",
  "/bbs/board.php",
  "/bbs/write.php",
  "/bbs/content.php",
  "/bbs/group.php",
  "/bbs/faq.php",
  "/bbs/new.php",
  "/bbs/search.php",
  "/mobile/index.php",
  "/mobile/group.php",
  "/mobile/content.php",
  "/mobile/shop/item.php",
  "/mobile/shop/itemqaform.php",
  "/mobile/shop/personalpayresult.php",
  "/shop/item.php",
  "/shop/orderinquirycancel.php",
  "/shop/personalpayresult.php",
  "/shop/list-",
  "array('direct' => '1')",
]) {
  if (!themeStaticRoutingSource.includes(token)) {
    fail(`theme static route bridge is missing mobile YoungCart static bridge token ${token}`);
  }
}

if (!themeAssetResponsesSource.includes('kcp-bridge\\.html')) {
  fail('theme public asset bridge must keep kcp-bridge.html in the public asset allowlist');
}

if (!/const\s+url\s*=\s*\([^)]*path[^)]*\)\s*=>\s*`\$\{base\}\$\{toG5ShortPath\(path\)\}`/.test(sitemapSource)) {
  fail('sitemap.ts must pass every generated URL through toG5ShortPath');
}

for (const route of ['search', 'largeimage']) {
  if (!new RegExp(`CANONICAL_SHOP_ROOTS[\\s\\S]*"${route}"[\\s\\S]*\\]\\)`).test(shortUrlRulesSource)) {
    fail(`g5-short-url-rules.ts must reserve /shop/${route} as a canonical shop route`);
  }
}

for (const route of ['bannerhit', 'orderform', 'price', 'taxsave']) {
  if (!new RegExp(`LEGACY_SHOP_ROOTS[\\s\\S]*"${route}"[\\s\\S]*\\]\\)`).test(shortUrlRulesSource)) {
    fail(`g5-short-url-rules.ts must reserve /shop/${route} for the original YoungCart route`);
  }
}

checkYoungcartServerRuntimeGuards({
  repoRoot,
  fail,
  read,
  sources: {
    buildNextSource,
    legacyRouteBridgeSource,
    nextConfigSource,
    productUrlSource,
    shortUrlRulesSource,
    shortUrlSource,
    staticExportGuardsSource,
    themeStaticRoutingSource,
  },
});
checkLiveAndApiGuards({
  repoRoot,
  themeName: THEME_NAME,
  isDefaultTheme: IS_DEFAULT_THEME,
  fail,
  sources: {
    legacyRouteBridgeSource,
    mypageWishlistPageSource,
    orderDataFlowSource,
    productDetailBridgeSource,
    runtimeConfigSource,
    shopContentPageSource,
    shopWishlistPageSource,
    sitemapSource,
    themeLegacyRoutesSource,
    themeRouteSource,
    themeStaticRoutingSource,
  },
});

console.table(shortUrlRows);
console.log('[check-g5-url-shape] Gnuboard rewrite URL shape guards passed');
