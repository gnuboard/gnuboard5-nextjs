import { createLocalRuntimeHelpers, parseCsv, trimTrailingSlash } from './lib/local-runtime-helpers.mjs';
import {
  DEFAULT_AUTH_CONTEXT_REDIRECTS,
  DEFAULT_CANONICAL_REDIRECTS,
  DEFAULT_LEGACY_SHOP_PASSTHROUGH_PATHS,
  DEFAULT_LEGACY_SHOP_REDIRECTS,
  DEFAULT_PRIVATE_NOINDEX_PATHS,
  DEFAULT_PUBLIC_METADATA_PATHS,
  DEFAULT_RSC_PAYLOADS,
  DEFAULT_SITEMAP_EXPECTED_PATHS,
  DEFAULT_SITEMAP_FORBIDDEN_PARTS,
  DEFAULT_STATIC_FALLBACK_ROUTE_CHECKS,
} from './lib/local-runtime-defaults.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv(process.cwd());

const checkLabel = process.env.RUNTIME_CHECK_LABEL || 'check-local-runtime';
const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || process.env.NEXT_PUBLIC_API_URL || `${appUrl}/api/v1`
);
const expectedRuntimeApiUrl = trimTrailingSlash(
  process.env.RUNTIME_EXPECTED_API_URL || expectedApiUrl
);
const repoApiUrl = trimTrailingSlash(
  process.env.LOCAL_REPO_API_URL ||
    process.env.G5_API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    `${appUrl}/api/v1`
);
const {
  fail,
  normalizePath,
  parseRedirects,
  fetchText,
  sameUrl,
  absoluteRedirectLocation,
  isTrailingSlashNormalizationRedirect,
  escapeRegExp,
  assertStaticFallbackRouteParams,
  appAbsoluteUrl,
  appAbsoluteUrlWithQuery,
  appBasePath,
  g5PublicPath,
  g5PublicScope,
  isLocalSitePath,
  isRuntimeLocalHost,
  collectAbsoluteUrls,
  readRuntimeConfig,
  readMetaContent,
  readLinkHref,
  readJsonLdScripts,
  collectJsonLdNodes,
  hasJsonLdType,
  findJsonLdNode,
  expectHeader,
  expectHeaderIncludes,
  expectServiceWorkerScope,
  expectCorsAllowOrigin,
  expectCspDirectiveIncludes,
  expectCspDirectiveExcludes,
  expectCspDirectiveSourcePrefix,
  expectCspConnectSource,
  isDisabledLegacyRssResponse,
  expectApiSecurityHeaders,
  expectThemeSecurityHeaders,
  expectNoindexHeader,
  isNextStaticShellResponse,
} = createLocalRuntimeHelpers({ appUrl, checkLabel });
const legacyRssPath = process.env.LOCAL_SMOKE_RSS_PATH || '/rss/free';
const allowDisabledLegacyRss = (process.env.LOCAL_SMOKE_RSS_ALLOW_DISABLED || '1') === '1';
const sitemapExpectedPaths = parseCsv(
  process.env.LOCAL_SMOKE_SITEMAP_PATHS || DEFAULT_SITEMAP_EXPECTED_PATHS
);
const sitemapForbiddenParts = parseCsv(
  process.env.LOCAL_SMOKE_SITEMAP_FORBIDDEN || DEFAULT_SITEMAP_FORBIDDEN_PARTS
);
const privateNoindexPaths = parseCsv(
  process.env.LOCAL_SMOKE_PRIVATE_NOINDEX_PATHS || DEFAULT_PRIVATE_NOINDEX_PATHS
);
const publicHtmlAssets = parseCsv(process.env.LOCAL_SMOKE_PUBLIC_HTML_ASSETS || '');
const publicMetadataPaths = parseCsv(
  process.env.LOCAL_SMOKE_PUBLIC_METADATA_PATHS || DEFAULT_PUBLIC_METADATA_PATHS
);
const legacyShopPassthroughPaths = parseCsv(
  process.env.LOCAL_SMOKE_LEGACY_SHOP_PASSTHROUGH_PATHS || DEFAULT_LEGACY_SHOP_PASSTHROUGH_PATHS
);
const legacyShopRedirects = parseRedirects(
  process.env.LOCAL_SMOKE_LEGACY_SHOP_REDIRECTS || DEFAULT_LEGACY_SHOP_REDIRECTS
);
const canonicalRedirects = parseRedirects(
  process.env.LOCAL_SMOKE_CANONICAL_REDIRECTS || DEFAULT_CANONICAL_REDIRECTS
);
const authContextRedirects = parseRedirects(
  process.env.LOCAL_SMOKE_AUTH_CONTEXT_REDIRECTS || DEFAULT_AUTH_CONTEXT_REDIRECTS
);
const rscPayloads = parseRedirects(
  process.env.LOCAL_SMOKE_RSC_PAYLOADS || DEFAULT_RSC_PAYLOADS
);
const staticFallbackRouteChecks = DEFAULT_STATIC_FALLBACK_ROUTE_CHECKS;
const rscTransport = process.env.RUNTIME_RSC_TRANSPORT || 'static-file';
if (!['static-file', 'server-request'].includes(rscTransport)) {
  fail(`RUNTIME_RSC_TRANSPORT is ${rscTransport}, expected static-file or server-request`);
}
const requireExpectedApiSecurityHeaders =
  process.env.RUNTIME_REQUIRE_EXPECTED_API_SECURITY_HEADERS === '1';
const expectedCspScriptMode = process.env.RUNTIME_EXPECTED_CSP_SCRIPT_MODE || 'nonce';
const supportedCspScriptModes = new Set(['nonce', 'hash', 'inline-compatible']);
if (!supportedCspScriptModes.has(expectedCspScriptMode)) {
  fail(
    `RUNTIME_EXPECTED_CSP_SCRIPT_MODE is ${expectedCspScriptMode}, expected nonce, hash, or inline-compatible`
  );
}
const expectedApiReferrerPolicies = parseCsv(
  process.env.RUNTIME_EXPECTED_API_REFERRER_POLICIES || 'no-referrer,strict-origin-when-cross-origin'
);

const appCheckUrl = `${appUrl}/?runtime-check=${Date.now()}`;
const { response: appResponse, text: appHtml } = await fetchText(appCheckUrl);
if (!appResponse.ok) {
  fail(`${appCheckUrl} returned HTTP ${appResponse.status}`);
}

expectHeader(appResponse.headers, 'x-content-type-options', 'nosniff');
expectHeader(appResponse.headers, 'x-frame-options', 'DENY');
expectHeader(appResponse.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
expectHeaderIncludes(appResponse.headers, 'permissions-policy', ['camera=()', 'microphone=()', 'geolocation=()']);
expectCspDirectiveIncludes(appResponse.headers, 'default-src', ["'self'"]);
expectCspDirectiveIncludes(appResponse.headers, 'script-src', ["'self'", 'https://t1.daumcdn.net']);
expectCspDirectiveExcludes(appResponse.headers, 'script-src', [
  "'unsafe-eval'",
  'http:',
  'http://t1.daumcdn.net',
]);
if (expectedCspScriptMode === 'nonce') {
  expectCspDirectiveSourcePrefix(appResponse.headers, 'script-src', "'nonce-");
  expectCspDirectiveExcludes(appResponse.headers, 'script-src', ["'unsafe-inline'"]);
} else if (expectedCspScriptMode === 'hash') {
  expectCspDirectiveSourcePrefix(appResponse.headers, 'script-src', "'sha256-");
  expectCspDirectiveExcludes(appResponse.headers, 'script-src', ["'unsafe-inline'"]);
} else {
  expectCspDirectiveIncludes(appResponse.headers, 'script-src', ["'unsafe-inline'"]);
}
expectCspDirectiveIncludes(appResponse.headers, 'style-src', ["'self'", "'unsafe-inline'"]);
expectCspDirectiveIncludes(appResponse.headers, 'img-src', ["'self'", 'data:', 'blob:', 'https:']);
expectCspDirectiveIncludes(appResponse.headers, 'object-src', ["'none'"]);
expectCspDirectiveIncludes(appResponse.headers, 'frame-ancestors', ["'none'"]);
expectCspConnectSource(appResponse.headers, expectedApiUrl);

const runtimeConfig = readRuntimeConfig(appHtml);
const expectedAdminScope = process.env.RUNTIME_EXPECTED_ADMIN_SCOPE || 'app';
if (!['app', 'g5'].includes(expectedAdminScope)) {
  fail(`RUNTIME_EXPECTED_ADMIN_SCOPE is ${expectedAdminScope}, expected app or g5`);
}

function runtimeRscRequest(publicPath, staticPayloadPath, marker) {
  const serverRequest = rscTransport === 'server-request';
  const requestPath = serverRequest ? publicPath : staticPayloadPath;

  return {
    url: appAbsoluteUrlWithQuery(requestPath, { _rsc: marker }),
    options: serverRequest
      ? { headers: { RSC: '1', 'Next-Url': normalizePath(publicPath) } }
      : {},
  };
}
const expectedAdminBaseUrl = trimTrailingSlash(
  expectedAdminScope === 'g5' ? runtimeConfig.g5BaseUrl : appUrl
);
if (!expectedAdminBaseUrl) {
  fail(`runtime config is missing the ${expectedAdminScope} base URL required for admin redirects`);
}

for (const path of ['/admin', '/admin/boards/free']) {
  const url = appAbsoluteUrl(path);
  const response = await fetch(url, { redirect: 'manual' });
  const location = response.headers.get('location') || '';
  const expected = `${expectedAdminBaseUrl}/adm`;
  if (![302, 307].includes(response.status) || !sameUrl(location, expected)) {
    fail(`${url} legacy admin redirect is HTTP ${response.status} to ${location || '(missing)'}, expected ${expected}`);
  }
}

const actualApiUrl = trimTrailingSlash(runtimeConfig.apiBaseUrl || '');
if (actualApiUrl !== expectedRuntimeApiUrl) {
  fail(`apiBaseUrl is ${actualApiUrl || '(empty)'}, expected ${expectedRuntimeApiUrl}`);
}

const expectedManifestPath = g5PublicPath('/manifest.webmanifest');
const manifestHref = readLinkHref(appHtml, 'manifest', { required: true });
if (manifestHref !== expectedManifestPath) {
  fail(`manifest href is ${manifestHref || '(missing)'}, expected ${expectedManifestPath}`);
}

const expectedOgImageUrl = `${appUrl}/og-default.png`;
for (const key of ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
  const content = readMetaContent(appHtml, key, { required: key === 'twitter:image' });
  if (content !== null && content !== expectedOgImageUrl) {
    fail(`${key} is ${content}, expected ${expectedOgImageUrl}`);
  }
}

const jsonLdNodes = readJsonLdScripts(appHtml).flatMap((item) => collectJsonLdNodes(item));
const organizationJsonLd = findJsonLdNode(jsonLdNodes, 'Organization');
if (organizationJsonLd.url !== appUrl) {
  fail(`Organization JSON-LD url is ${organizationJsonLd.url || '(missing)'}, expected ${appUrl}`);
}
if (organizationJsonLd.logo !== expectedOgImageUrl) {
  fail(`Organization JSON-LD logo is ${organizationJsonLd.logo || '(missing)'}, expected ${expectedOgImageUrl}`);
}

const websiteJsonLd = findJsonLdNode(jsonLdNodes, 'WebSite');
if (websiteJsonLd.url !== appUrl) {
  fail(`WebSite JSON-LD url is ${websiteJsonLd.url || '(missing)'}, expected ${appUrl}`);
}

const searchActions = Array.isArray(websiteJsonLd.potentialAction)
  ? websiteJsonLd.potentialAction
  : [websiteJsonLd.potentialAction].filter(Boolean);
const searchAction = searchActions.find((item) => hasJsonLdType(item, 'SearchAction'));
const expectedSearchTarget = `${appUrl}/search?q={search_term_string}`;
if (!searchAction || searchAction.target !== expectedSearchTarget) {
  fail(`WebSite SearchAction target is ${searchAction?.target || '(missing)'}, expected ${expectedSearchTarget}`);
}

for (const path of privateNoindexPaths) {
  const url = `${appUrl}${normalizePath(path)}?runtime-noindex-check=${Date.now()}`;
  const { response } = await fetchText(url);
  if (!response.ok) {
    fail(`${url} returned HTTP ${response.status}`);
  }
  expectNoindexHeader(response.headers, url);
}

for (const path of publicHtmlAssets) {
  const url = `${appUrl}${normalizePath(path)}?runtime-public-asset-check=${Date.now()}`;
  const { response } = await fetchText(url);
  if (!response.ok) {
    fail(`${url} returned HTTP ${response.status}`);
  }
  expectThemeSecurityHeaders(response.headers);
  expectHeaderIncludes(response.headers, 'content-type', ['text/html']);

}

for (const path of legacyShopPassthroughPaths) {
  const url = appAbsoluteUrlWithQuery(path, {
    'legacy-shop-passthrough-smoke': String(Date.now()),
  });
  const { response, text } = await fetchText(url, { redirect: 'manual' });
  if (response.status === 404) {
    fail(`${url} returned HTTP 404; expected an original YoungCart PHP route`);
  }
  if (isNextStaticShellResponse(response.headers, text)) {
    fail(`${url} returned the Next.js static shell; expected original YoungCart PHP passthrough`);
  }
}

for (const redirect of legacyShopRedirects) {
  const url = appAbsoluteUrl(redirect.from);
  let redirectRequestUrl = url;
  let response = await fetch(url, { redirect: 'manual' });
  let location = response.headers.get('location') || '';
  const expected = appAbsoluteUrl(redirect.to);

  if (
    response.status === 308 &&
    isTrailingSlashNormalizationRedirect(url, location) &&
    !sameUrl(absoluteRedirectLocation(url, location), expected)
  ) {
    const normalizedUrl = absoluteRedirectLocation(url, location);
    redirectRequestUrl = normalizedUrl;
    response = await fetch(normalizedUrl, { redirect: 'manual' });
    location = response.headers.get('location') || '';
  }

  const destination = absoluteRedirectLocation(redirectRequestUrl, location);
  if (![301, 307, 308].includes(response.status) || !sameUrl(destination, expected)) {
    fail(
      `${url} legacy shop redirect is HTTP ${response.status} to ${location || '(missing)'}, expected ${expected}`
    );
  }
}

for (const path of publicMetadataPaths) {
  const normalizedPath = normalizePath(path);
  const expectedUrl = appAbsoluteUrl(normalizedPath);
  const url = appAbsoluteUrlWithQuery(normalizedPath, {
    'metadata-smoke': String(Date.now()),
    utm_source: 'runtime',
  });
  const { response, text } = await fetchText(url);
  if (!response.ok) {
    fail(`${url} returned HTTP ${response.status}`);
  }
  expectThemeSecurityHeaders(response.headers);
  if (text.includes('__g5_static__')) {
    fail(`${url} exposed static fallback route sentinels in public HTML`);
  }
  if (/href=(?:"|')[^"']*\/shop\/categories\//.test(text)) {
    fail(`${url} exposed non-canonical shop category links in public HTML`);
  }

  const canonical = readLinkHref(text, 'canonical', { required: true });
  if (!sameUrl(canonical, expectedUrl)) {
    fail(`${url} canonical is ${canonical || '(missing)'}, expected ${expectedUrl}`);
  }

  const ogUrl = readMetaContent(text, 'og:url', { required: true });
  if (!sameUrl(ogUrl, expectedUrl)) {
    fail(`${url} og:url is ${ogUrl || '(missing)'}, expected ${expectedUrl}`);
  }
}

for (const check of staticFallbackRouteChecks) {
  const htmlUrl = appAbsoluteUrlWithQuery(check.path, {
    'static-fallback-check': String(Date.now()),
  });
  const { response: htmlResponse, text: htmlText } = await fetchText(htmlUrl);
  if (!htmlResponse.ok) {
    fail(`${htmlUrl} returned HTTP ${htmlResponse.status}`);
  }
  expectThemeSecurityHeaders(htmlResponse.headers);
  assertStaticFallbackRouteParams(`${htmlUrl} HTML`, htmlText, check);

  const payloadRequest = runtimeRscRequest(
    check.path,
    check.payload,
    `static-fallback-check-${Date.now()}`
  );
  const payloadUrl = payloadRequest.url;
  const { response: payloadResponse, text: payloadText } = await fetchText(
    payloadUrl,
    payloadRequest.options
  );
  if (!payloadResponse.ok) {
    fail(`${payloadUrl} returned HTTP ${payloadResponse.status}`);
  }
  expectThemeSecurityHeaders(payloadResponse.headers);
  expectHeaderIncludes(payloadResponse.headers, 'content-type', ['text/x-component']);
  assertStaticFallbackRouteParams(`${payloadUrl} RSC payload`, payloadText, check);
}

const manifestByPath = new Map();
const manifestPaths = ['/manifest.webmanifest', '/manifest.json'];
for (const path of manifestPaths) {
  const manifestUrl = `${appUrl}${path}`;
  const { response: manifestResponse, text: manifestText } = await fetchText(manifestUrl);
  if (!manifestResponse.ok) {
    fail(`${manifestUrl} returned HTTP ${manifestResponse.status}`);
  }
  expectThemeSecurityHeaders(manifestResponse.headers);
  expectHeaderIncludes(manifestResponse.headers, 'content-type', [
    path.endsWith('.json') ? 'json' : 'manifest',
  ]);

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    fail(`${manifestUrl} returned invalid JSON: ${error.message}`);
  }
  if (manifest.start_url !== g5PublicScope()) {
    fail(`${manifestUrl} start_url is ${manifest.start_url || '(missing)'}, expected ${g5PublicScope()}`);
  }
  if (manifest.scope !== g5PublicScope()) {
    fail(`${manifestUrl} scope is ${manifest.scope || '(missing)'}, expected ${g5PublicScope()}`);
  }
  if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon?.src === g5PublicPath('/icon-192.png'))) {
    fail(`${manifestUrl} is missing root icon ${g5PublicPath('/icon-192.png')}`);
  }
  manifestByPath.set(path, manifest);
}

const webManifest = manifestByPath.get('/manifest.webmanifest');
const jsonManifest = manifestByPath.get('/manifest.json');
for (const key of ['name', 'short_name', 'description', 'theme_color']) {
  if (webManifest?.[key] !== jsonManifest?.[key]) {
    fail(`/manifest.json ${key} is ${jsonManifest?.[key] || '(missing)'}, expected ${webManifest?.[key] || '(missing)'}`);
  }
}

for (const path of ['/icon-192.png', '/icon-512.png', '/og-default.png']) {
  const imageUrl = `${appUrl}${path}`;
  const { response } = await fetchText(imageUrl);
  if (!response.ok) {
    fail(`${imageUrl} returned HTTP ${response.status}`);
  }
  expectThemeSecurityHeaders(response.headers);
  expectHeaderIncludes(response.headers, 'content-type', ['image/png']);
}

const swUrl = `${appUrl}/sw.js`;
const { response: swResponse, text: swText } = await fetchText(swUrl);
if (!swResponse.ok) {
  fail(`${swUrl} returned HTTP ${swResponse.status}`);
}
expectThemeSecurityHeaders(swResponse.headers);
expectHeaderIncludes(swResponse.headers, 'content-type', ['javascript']);
expectServiceWorkerScope(swResponse.headers, swUrl, g5PublicScope());
if (!swText.includes('self.addEventListener') || !swText.includes('CACHE_NAME')) {
  fail(`${swUrl} did not return the service worker script`);
}

for (const payload of rscPayloads) {
  const payloadRequest = runtimeRscRequest(
    payload.to,
    payload.from,
    `runtime-rsc-check-${Date.now()}`
  );
  const payloadUrl = payloadRequest.url;
  const { response, text } = await fetchText(payloadUrl, payloadRequest.options);
  if (!response.ok) {
    fail(`${payloadUrl} returned HTTP ${response.status}`);
  }

  expectThemeSecurityHeaders(response.headers);
  expectHeaderIncludes(response.headers, 'content-type', ['text/x-component']);
  if (rscTransport === 'static-file') {
    expectHeaderIncludes(response.headers, 'x-robots-tag', ['noindex', 'nofollow']);
  }

  const expectedPublicUrl = appAbsoluteUrl(payload.to);
  const foreignLocalUrls = collectAbsoluteUrls(text).filter((value) => {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }

    return (
      isRuntimeLocalHost(parsed.hostname) &&
      isLocalSitePath(parsed.pathname) &&
      value !== appUrl &&
      !value.startsWith(`${appUrl}/`)
    );
  });
  if (foreignLocalUrls.length > 0) {
    fail(
      `${payloadUrl} contains local-site URLs outside ${appUrl}: ${foreignLocalUrls.slice(0, 10).join(', ')}`
    );
  }

  if (!text.includes(`${appUrl}/og-default.png`)) {
    fail(`${payloadUrl} is missing the runtime OG image origin ${appUrl}/og-default.png`);
  }
  if (!text.includes(`${appUrl}/search?q={search_term_string}`)) {
    fail(`${payloadUrl} is missing the runtime SearchAction target ${appUrl}/search?q={search_term_string}`);
  }
  if (payload.to !== '/' && !text.includes(`"property":"og:url","content":"${expectedPublicUrl}"`)) {
    fail(`${payloadUrl} is missing runtime og:url ${expectedPublicUrl}`);
  }
  if (text.includes('_rsc=runtime-rsc-check')) {
    fail(`${payloadUrl} leaked the internal _rsc query into metadata`);
  }
  if (text.includes('__g5_static__')) {
    fail(`${payloadUrl} exposed static fallback route sentinels in RSC payload`);
  }
}

for (const redirect of canonicalRedirects) {
  const url = `${appUrl}${normalizePath(redirect.from)}`;
  const response = await fetch(url, { redirect: 'manual' });
  const location = response.headers.get('location') || '';
  const expected = `${appUrl}${normalizePath(redirect.to)}`;
  if (![301, 308].includes(response.status) || !sameUrl(absoluteRedirectLocation(url, location), expected)) {
    fail(
      `${url} canonical redirect is HTTP ${response.status} to ${location || '(missing)'}, expected ${expected}`
    );
  }
}

for (const redirect of authContextRedirects) {
  const url = `${appUrl}${normalizePath(redirect.from)}`;
  const response = await fetch(url, { redirect: 'manual' });
  const location = response.headers.get('location') || '';
  const expected = `${appUrl}${normalizePath(redirect.to)}`;
  if (![302, 307, 308].includes(response.status) || !sameUrl(absoluteRedirectLocation(url, location), expected)) {
    fail(
      `${url} auth-context redirect is HTTP ${response.status} to ${location || '(missing)'}, expected ${expected}`
    );
  }
}

const apiOrigin = new URL(appUrl).origin;
const settingsUrl = `${expectedApiUrl}/settings`;
const { response: settingsResponse } = await fetchText(settingsUrl, {
  headers: { Origin: apiOrigin },
});

if (!settingsResponse.ok) {
  fail(`${settingsUrl} returned HTTP ${settingsResponse.status}`);
}

const allowOrigin = expectCorsAllowOrigin(settingsResponse.headers, settingsUrl, apiOrigin);
expectApiSecurityHeaders(settingsResponse.headers, {
  permissionsPolicy: requireExpectedApiSecurityHeaders,
  referrerPolicies: expectedApiReferrerPolicies,
});

if (repoApiUrl !== expectedApiUrl) {
  const repoSettingsUrl = `${repoApiUrl}/settings`;
  const { response: repoSettingsResponse } = await fetchText(repoSettingsUrl, {
    headers: { Origin: apiOrigin },
  });

  if (!repoSettingsResponse.ok) {
    fail(`${repoSettingsUrl} returned HTTP ${repoSettingsResponse.status}`);
  }

  expectApiSecurityHeaders(repoSettingsResponse.headers, {
    permissionsPolicy: true,
    referrerPolicies: expectedApiReferrerPolicies,
  });
}

const rssUrl = `${appUrl}${normalizePath(legacyRssPath)}`;
const { response: rssResponse, text: rssText } = await fetchText(rssUrl);
if (!rssResponse.ok) {
  fail(`${rssUrl} returned HTTP ${rssResponse.status}`);
}

const rssContentType = rssResponse.headers.get('content-type') || '';
if (!/(?:xml|rss)/i.test(rssContentType)) {
  if (
    !allowDisabledLegacyRss ||
    rssText.includes('__g5_static__') ||
    !isDisabledLegacyRssResponse(rssText)
  ) {
    fail(`${rssUrl} returned content-type ${rssContentType || '(missing)'}, expected XML`);
  }
}

if (
  !allowDisabledLegacyRss &&
  (!rssText.includes('<rss') || !rssText.includes('<channel>') || rssText.includes('__g5_static__'))
) {
  fail(`${rssUrl} did not return a board RSS feed`);
}

if (
  allowDisabledLegacyRss &&
  !isDisabledLegacyRssResponse(rssText) &&
  (!rssText.includes('<rss') || !rssText.includes('<channel>') || rssText.includes('__g5_static__'))
) {
  fail(`${rssUrl} did not return a board RSS feed or a Gnuboard disabled RSS response`);
}

const robotsUrl = `${appUrl}/robots.txt`;
const { response: robotsResponse, text: robotsText } = await fetchText(robotsUrl);
if (!robotsResponse.ok) {
  fail(`${robotsUrl} returned HTTP ${robotsResponse.status}`);
}

if (!new RegExp(`^Host:\\s*${escapeRegExp(appUrl)}\\s*$`, 'mi').test(robotsText)) {
  fail(`${robotsUrl} Host does not match ${appUrl}`);
}

for (const sitemapPath of ['/sitemap.xml', '/sitemap-posts.xml']) {
  if (
    !new RegExp(`^Sitemap:\\s*${escapeRegExp(`${appUrl}${sitemapPath}`)}\\s*$`, 'mi').test(
      robotsText
    )
  ) {
    fail(`${robotsUrl} Sitemap does not match ${appUrl}${sitemapPath}`);
  }
}

const sitemapUrl = `${appUrl}/sitemap.xml`;
const { response: sitemapResponse, text: sitemapText } = await fetchText(sitemapUrl);
if (!sitemapResponse.ok) {
  fail(`${sitemapUrl} returned HTTP ${sitemapResponse.status}`);
}

const sitemapContentType = sitemapResponse.headers.get('content-type') || '';
if (!/(?:xml|text\/plain)/i.test(sitemapContentType)) {
  fail(`${sitemapUrl} returned content-type ${sitemapContentType || '(missing)'}, expected XML`);
}

for (const path of sitemapExpectedPaths) {
  const expectedLoc = `<loc>${appUrl}${normalizePath(path)}</loc>`;
  if (!sitemapText.includes(expectedLoc)) {
    fail(`${sitemapUrl} is missing ${expectedLoc}`);
  }
}

const sitemapLocs = Array.from(sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)).map((match) => match[1]);
if (sitemapLocs.length === 0) {
  fail(`${sitemapUrl} has no <loc> entries`);
}

const foreignSitemapLocs = sitemapLocs.filter(
  (loc) => loc !== appUrl && !loc.startsWith(`${appUrl}/`)
);
if (foreignSitemapLocs.length > 0) {
  fail(`${sitemapUrl} contains URLs outside ${appUrl}: ${foreignSitemapLocs.slice(0, 10).join(', ')}`);
}

const sitemapBasePath = appBasePath();
if (sitemapBasePath !== '') {
  const duplicatedBasePath = `${sitemapBasePath}${sitemapBasePath}`;
  const duplicatedSitemapLocs = sitemapLocs.filter((loc) => {
    try {
      const { pathname } = new URL(loc);
      return pathname === duplicatedBasePath || pathname.startsWith(`${duplicatedBasePath}/`);
    } catch {
      return false;
    }
  });

  if (duplicatedSitemapLocs.length > 0) {
    fail(
      `${sitemapUrl} contains duplicated base path ${sitemapBasePath}: ${duplicatedSitemapLocs
        .slice(0, 10)
        .join(', ')}`
    );
  }
}

for (const part of sitemapForbiddenParts) {
  if (sitemapText.includes(part)) {
    fail(`${sitemapUrl} contains non-rewrite sitemap URL part ${part}`);
  }
}

const postsSitemapUrl = `${appUrl}/sitemap-posts.xml`;
const { response: postsSitemapResponse, text: postsSitemapText } = await fetchText(postsSitemapUrl);
if (!postsSitemapResponse.ok) {
  fail(`${postsSitemapUrl} returned HTTP ${postsSitemapResponse.status}`);
}

const postsSitemapContentType = postsSitemapResponse.headers.get('content-type') || '';
if (!/(?:xml|text\/plain)/i.test(postsSitemapContentType)) {
  fail(
    `${postsSitemapUrl} returned content-type ${postsSitemapContentType || '(missing)'}, expected XML`
  );
}

if (!postsSitemapText.includes('<urlset')) {
  fail(`${postsSitemapUrl} did not return a sitemap urlset`);
}

const postsSitemapLocs = Array.from(postsSitemapText.matchAll(/<loc>(.*?)<\/loc>/g)).map(
  (match) => match[1]
);
const foreignPostsSitemapLocs = postsSitemapLocs.filter(
  (loc) => loc !== appUrl && !loc.startsWith(`${appUrl}/`)
);
if (foreignPostsSitemapLocs.length > 0) {
  fail(
    `${postsSitemapUrl} contains URLs outside ${appUrl}: ${foreignPostsSitemapLocs
      .slice(0, 10)
      .join(', ')}`
  );
}

console.log(`[${checkLabel}] app=${appUrl}`);
console.log(`[${checkLabel}] api=${actualApiUrl}`);
console.log(`[${checkLabel}] repoApi=${repoApiUrl}`);
console.log(`[${checkLabel}] cors=${allowOrigin}`);
console.log(
  `[${checkLabel}] expectedApiSecurityHeaders=${
    requireExpectedApiSecurityHeaders ? 'full' : 'baseline'
  }`
);
console.log(`[${checkLabel}] rss=${rssUrl}`);
console.log(`[${checkLabel}] robots=${robotsUrl}`);
console.log(`[${checkLabel}] sitemap=${sitemapUrl}`);
console.log(`[${checkLabel}] manifests=${manifestPaths.map((path) => `${appUrl}${path}`).join(',')}`);
console.log(`[${checkLabel}] serviceWorker=${swUrl}`);
console.log(`[${checkLabel}] privateNoindex=${privateNoindexPaths.join(',')}`);
console.log(`[${checkLabel}] publicHtmlAssets=${publicHtmlAssets.join(',')}`);
console.log(`[${checkLabel}] publicMetadata=${publicMetadataPaths.join(',')}`);
console.log(`[${checkLabel}] legacyShopPassthrough=${legacyShopPassthroughPaths.join(',')}`);
console.log(
  `[${checkLabel}] legacyShopRedirects=${legacyShopRedirects
    .map((redirect) => `${redirect.from}=>${redirect.to}`)
    .join(',')}`
);
console.log(
  `[${checkLabel}] rscPayloads=${rscPayloads
    .map((payload) => `${payload.from}=>${payload.to}`)
    .join(',')}`
);
console.log(
  `[${checkLabel}] canonicalRedirects=${canonicalRedirects
    .map((redirect) => `${redirect.from}=>${redirect.to}`)
    .join(',')}`
);
console.log(
  `[${checkLabel}] authContextRedirects=${authContextRedirects
    .map((redirect) => `${redirect.from}=>${redirect.to}`)
    .join(',')}`
);
