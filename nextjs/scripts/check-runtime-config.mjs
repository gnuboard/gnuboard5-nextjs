import { readFileSync } from 'node:fs';
import { loadRuntimeConfigModule } from './lib/runtime-config-loader.mjs';
import { checkRuntimeAdminPolicy } from './lib/runtime-config-admin-policy.mjs';
import { checkRuntimeOriginGuards } from './lib/runtime-config-origin-guards.mjs';
import { runtimeConfigPaths } from './lib/runtime-config-paths.mjs';
import { checkRuntimeConfigScenarios } from './lib/runtime-config-scenarios.mjs';
const repoRoot = process.cwd();
const {
  publicPackage,
  packageJsonPath, vercelJsonPath, sourcePath, nextConfigPath, adminAppPath, apiClientPath,
  authServerPath, authStorePath, authProviderPath, shareButtonsPath,
  orderDataActionsPath, legacyShopActionPath, legacyReviewListPath,
  sanitizePath, serviceWorkerPath, apacheHeaderWriterPath, staticSecurityHeadersPath,
  nginxSecurityMapPath, nginxGreenhubSecurityHeadersPath, nginxNextjs25SecurityHeadersPath,
  packageLiveDeployPath, checkReleaseLivePath, checkLiveYoungcartLegacyRoutesPath,
  checkLocalYoungcartLegacyRoutesPath, rootHtaccessPath, phpApiIndexPath, phpShopRouterPath, phpAuthPath,
  phpAuthAccountRoutesPath, phpAuthHelpersPath, phpAuthSessionRoutesPath,
  phpAuthSocialRoutesPath, phpAuthLibPath, phpPaymentPath, phpStatusPath, phpSocialBridgePath,
  phpSocialStartPath, phpSocialPopupPath, phpSocialFinishPath, phpThemeCommonPath,
  phpNextjsRuntimeExtendPath, phpApiHelpersPath, phpCertCommonPath, phpKcpStartPath,
  phpShopCommonPath, phpShopSessionHelpersPath, phpShopNaverpayPath, phpShopPaymentHelpersPath,
  phpGreenhubRuntimeCorePath, phpGreenhubMetadataRewritePath, phpGreenhubAppShellPath,
  phpNextjs25AppShellPath, phpNextjs25AssetResponsesPath, phpNextjs25LegacyRouteResolversPath,
  phpNextjs25LegacyRoutesPath, phpNextjs25MetadataPath, phpNextjs25RenderPath,
  phpNextjs25SecurityHeadersPath,
} = runtimeConfigPaths(repoRoot);

function fail(message) {
  console.error(`[check-runtime-config] ${message}`);
  process.exit(1);
}

const loadConfigModule = (options = {}) => loadRuntimeConfigModule(sourcePath, { ...options, fail });

function expectEqual(name, actual, expected) {
  if (actual !== expected) {
    fail(`${name} produced ${actual}, expected ${expected}`);
  }
}

const readText = (path) => readFileSync(path, 'utf8');
checkRuntimeConfigScenarios({ loadConfigModule, expectEqual });

const packageJsonSource = readText(packageJsonPath);
const vercelJsonSource = readText(vercelJsonPath);
const nextConfigSource = readText(nextConfigPath);
const apiClientSource = readText(apiClientPath);
const authServerSource = readText(authServerPath);
const authStoreSource = readText(authStorePath);
const authProviderSource = readText(authProviderPath);
const shareButtonsSource = readText(shareButtonsPath);
const orderDataActionsSource = readText(orderDataActionsPath);
const legacyShopActionSource = readText(legacyShopActionPath);
const legacyReviewListSource = readText(legacyReviewListPath);
const sanitizeSource = readText(sanitizePath);
const serviceWorkerSource = readText(serviceWorkerPath);
const apacheHeaderWriterSource = readText(apacheHeaderWriterPath);
const staticSecurityHeadersSource = readText(staticSecurityHeadersPath);
const nginxSecurityMapSource = readText(nginxSecurityMapPath);
const nginxGreenhubSecurityHeadersSource = readText(nginxGreenhubSecurityHeadersPath);
const nginxNextjs25SecurityHeadersSource = readText(nginxNextjs25SecurityHeadersPath);
const packageLiveDeploySource = publicPackage ? '' : readText(packageLiveDeployPath);
const checkReleaseLiveSource = publicPackage ? '' : readText(checkReleaseLivePath);
const checkLiveYoungcartLegacyRoutesSource = readText(checkLiveYoungcartLegacyRoutesPath);
const checkLocalYoungcartLegacyRoutesSource = readText(checkLocalYoungcartLegacyRoutesPath);
const rootHtaccessSource = readText(rootHtaccessPath);
const phpApiIndexSource = readText(phpApiIndexPath);
const phpShopRouterSource = readText(phpShopRouterPath);
const phpAuthSource = readText(phpAuthPath);
const phpAuthAccountRoutesSource = readText(phpAuthAccountRoutesPath);
const phpAuthHelpersSource = readText(phpAuthHelpersPath);
const phpAuthSessionRoutesSource = readText(phpAuthSessionRoutesPath);
const phpAuthSocialRoutesSource = readText(phpAuthSocialRoutesPath);
const phpAuthRuntimeSource = [
  phpAuthSource,
  phpAuthHelpersSource,
  phpAuthAccountRoutesSource,
  phpAuthSessionRoutesSource,
  phpAuthSocialRoutesSource,
].join('\n');
const phpAuthLibSource = readText(phpAuthLibPath);
const phpPaymentSource = readText(phpPaymentPath);
const phpStatusSource = readText(phpStatusPath);
const phpSocialBridgeSource = readText(phpSocialBridgePath);
const phpSocialStartSource = readText(phpSocialStartPath);
const phpSocialPopupSource = readText(phpSocialPopupPath);
const phpSocialFinishSource = readText(phpSocialFinishPath);
const phpThemeCommonSource = readText(phpThemeCommonPath);
const phpNextjsRuntimeExtendSource = readText(phpNextjsRuntimeExtendPath);
const phpApiHelpersSource = readText(phpApiHelpersPath);
const phpApiRequestHelpersSource = readText(phpApiHelpersPath.replace(/helpers\.php$/, 'request_helpers.php'));
const phpCertCommonSource = readText(phpCertCommonPath);
const phpKcpStartSource = readText(phpKcpStartPath);
const phpShopCommonSource = readText(phpShopCommonPath);
const phpShopSessionHelpersSource = readText(phpShopSessionHelpersPath);
const phpShopNaverpaySource = readText(phpShopNaverpayPath);
const phpShopPaymentHelpersSource = readText(phpShopPaymentHelpersPath);
const phpGreenhubRuntimeCoreSource = readText(phpGreenhubRuntimeCorePath);
const phpGreenhubMetadataRewriteSource = readText(phpGreenhubMetadataRewritePath);
const phpGreenhubAppShellSource = readText(phpGreenhubAppShellPath);
const phpNextjs25AppShellSource = readText(phpNextjs25AppShellPath);
const phpNextjs25AssetResponsesSource = readText(phpNextjs25AssetResponsesPath);
const phpNextjs25LegacyRouteResolversSource = readText(phpNextjs25LegacyRouteResolversPath);
const phpNextjs25LegacyRoutesSource = readText(phpNextjs25LegacyRoutesPath);
const phpNextjs25MetadataSource = readText(phpNextjs25MetadataPath);
const phpNextjs25RenderSource = readText(phpNextjs25RenderPath);
const phpNextjs25SecurityHeadersSource = readText(phpNextjs25SecurityHeadersPath);
const phpNextjs25BridgeSource = [
  phpNextjs25SecurityHeadersSource,
  phpNextjs25AppShellSource,
  phpNextjs25AssetResponsesSource,
  phpNextjs25LegacyRouteResolversSource,
  phpNextjs25LegacyRoutesSource,
  phpNextjs25MetadataSource,
  phpNextjs25RenderSource,
].join('\n');
// greenhub 테마는 지웠다(2026-09-28). 그 역할의 검사는 공개 배포판 모드처럼 nextjs_default 브리지 전체로 한다.
const phpGreenhubBridgeSource = phpNextjs25BridgeSource;
const phpGreenhubRuntimeCoreCheckSource = phpNextjs25BridgeSource;
const phpGreenhubMetadataRewriteCheckSource = phpNextjs25BridgeSource;
const phpGreenhubAppShellCheckSource = phpNextjs25BridgeSource;
if ([phpApiHelpersSource, phpApiRequestHelpersSource].some((source) => source.includes('return addslashes('))) fail('API helpers must not fall back to addslashes() for SQL escaping; use DB placeholders instead');
for (const [label, source] of [
  ['next.config.ts', nextConfigSource],
  ['write-apache-static-headers.mjs', apacheHeaderWriterSource],
  ['vercel.json', vercelJsonSource],
]) {
  if (source.includes("script-src 'self' 'unsafe-inline' 'unsafe-eval'")) {
    fail(`${label} must not enable unsafe-eval unconditionally in the production CSP`);
  }
  if (label === 'vercel.json' && source.includes("'unsafe-eval'")) {
    fail('vercel.json must not ship unsafe-eval in the static-export CSP');
  }
  if (label !== 'vercel.json' && !source.includes('NEXT_CSP_ALLOW_UNSAFE_EVAL')) {
    fail(`${label} must make unsafe-eval an explicit environment opt-in`);
  }
}

if (!nextConfigSource.includes('const pgScriptSources = pgFrameSources')) {
  fail('next.config.ts must include PG SDK hosts in script-src, not only frame-src');
}

if (!apacheHeaderWriterSource.includes('./static-security-headers.mjs')) {
  fail('write-apache-static-headers.mjs must reuse static-security-headers.mjs');
}

if (
  !staticSecurityHeadersSource.includes('PG_FRAME_SOURCES') ||
  !staticSecurityHeadersSource.includes('PG_FRAME_SOURCES,') ||
  !staticSecurityHeadersSource.includes('https://js.tosspayments.com')
) {
  fail('static-security-headers.mjs must include PG SDK hosts in script-src, not only frame-src');
}

if (
  staticSecurityHeadersSource.includes("'unsafe-eval'") &&
  !staticSecurityHeadersSource.includes('allowUnsafeEval')
) {
  fail('static-security-headers.mjs must make unsafe-eval an explicit option');
}

for (const envName of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_G5_URL']) {
  if (!nextConfigSource.includes(envName) || !nextConfigSource.includes('Missing ${name}')) {
    fail(`next.config.ts must fail production builds when ${envName} is missing`);
  }
}

if (!phpNextjsRuntimeExtendSource.includes('/nextjs/.env.production')) {
  fail('generic Next.js runtime extend must read nextjs/.env.production for the pinned public G5 URL');
}

if (!phpNextjsRuntimeExtendSource.includes('G5_WEBAPP_RUNTIME_CONFIG_KEY')) {
  fail('generic Next.js runtime extend must expose NEXT_PUBLIC_RUNTIME_CONFIG_KEY to PHP bridges');
}

// 사이트 주소는 그누보드의 G5_URL 을 믿는다(휴대용 설치). env 파일의 개발용 주소는 요청
// 호스트와 맞을 때만 쓴다 — 그 검사 함수가 있어야 한다.
if (!phpNextjsRuntimeExtendSource.includes('g5_nextjs_runtime_url_matches_host')) {
  fail('generic Next.js runtime must only trust env-file site URLs whose host matches the request');
}

for (const [label, source] of [
  ['theme/nextjs_default/bridge/app-shell.php', phpGreenhubAppShellCheckSource],
  ['theme/nextjs_default/bridge runtime files', phpNextjs25BridgeSource],
]) {
  for (const token of [
    'runtime_config_key',
    'NEXT_PUBLIC_RUNTIME_CONFIG_KEY',
    'G5_WEBAPP_RUNTIME_CONFIG_KEY',
    'window[',
    'window.__G5_APP_CONFIG__ = window[',
  ]) {
    if (!source.includes(token)) {
      fail(`${label} must inject runtime config under the configured key (${token})`);
    }
  }
}

if (!phpNextjs25AppShellSource.includes("require_once __DIR__ . '/security-headers.php';")) {
  fail('theme/nextjs_default/bridge/app-shell.php must load security-headers.php instead of owning security header helpers inline');
}

for (const file of [
  'asset-responses.php',
  'legacy-routes.php',
  'metadata.php',
  'render.php',
]) {
  if (!phpNextjs25AppShellSource.includes(`require_once __DIR__ . '/${file}';`)) {
    fail(`theme/nextjs_default/bridge/app-shell.php must load split bridge module ${file}`);
  }
}

for (const [label, source] of [
  ['theme/nextjs_default/bridge runtime', phpGreenhubBridgeSource],
  ['theme/nextjs_default/bridge security/runtime', phpNextjs25BridgeSource],
]) {
  for (const token of ['csp_nonce', 'add_script_nonce', "script-src ' . $script_sources"]) {
    if (!source.includes(token)) {
      fail(`${label} must emit and apply per-request CSP script nonces (${token})`);
    }
  }
  if (!source.includes("'nonce-")) {
    fail(`${label} CSP script-src must include the generated nonce`);
  }
  if (!source.includes('add_script_nonce($html)')) {
    fail(`${label} must add the CSP nonce to rendered script tags before sending headers`);
  }
  for (const forbidden of [
    "script-src 'self' 'unsafe-inline'",
    "array(\"'self'\", 'https:')",
    'http://t1.daumcdn.net',
    "img-src 'self' data: blob: http: https:",
    'uniqid(',
  ]) {
    if (source.includes(forbidden)) {
      fail(`${label} must not keep weak static-export CSP token: ${forbidden}`);
    }
  }
  for (const token of ['function_exists(\'random_bytes\')', 'Unable to generate a secure CSP nonce.', 'catch (Exception']) {
    if (!source.includes(token)) {
      fail(`${label} must fail closed when secure CSP nonce generation is unavailable (${token})`);
    }
  }
}

for (const token of [
  'function cert_kcp_html_attr',
  'function cert_kcp_js_string',
  'function cert_kcp_gateway_url',
  "ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'",
  'JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT',
  '$safeCertUrl = cert_kcp_gateway_url($cert_url);',
  'cert_kcp_html_attr($safeCertUrl)',
  'cert_kcp_js_string($safeCertUrl)',
]) {
  if (!phpKcpStartSource.includes(token)) {
    fail(`api/cert/kcp_start.php is missing hardened KCP output token ${token}`);
  }
}

for (const forbidden of [
  'action="<?php echo $cert_url; ?>"',
  'frm.action = "<?php echo $cert_url; ?>";',
  'value="<?php echo $up_hash; ?>"',
]) {
  if (phpKcpStartSource.includes(forbidden)) {
    fail(`api/cert/kcp_start.php must not echo raw KCP bridge values (${forbidden})`);
  }
}

for (const [label, source] of [
  ['docs/nginx/nextjs_default-security-headers.conf', nginxGreenhubSecurityHeadersSource],
  ['docs/nginx/nextjs25-security-headers.conf', nginxNextjs25SecurityHeadersSource],
]) {
  if (source.includes('add_header Content-Security-Policy')) {
    fail(`${label} must not override the PHP bridge nonce CSP`);
  }
  if (source.includes('hide_header Content-Security-Policy')) {
    fail(`${label} must not hide the PHP bridge nonce CSP`);
  }
}

if (nginxSecurityMapSource.includes('script-src') || nginxSecurityMapSource.includes('unsafe-inline')) {
  fail('docs/nginx/nextjs25-security-map.conf must remain a no-op compatibility map');
}

for (const [label, source] of [
  ['theme/nextjs_default/bridge/metadata-rewrite.php', phpGreenhubMetadataRewriteCheckSource],
  ['theme/nextjs_default/bridge/metadata.php', phpNextjs25MetadataSource],
]) {
  for (const token of [
    'should_apply_runtime_detail_metadata',
    '/__g5_static__',
    'board_allows_public_runtime_metadata',
    'bo_read_level',
    'bo_use_secret',
    'fetch_board_runtime_metadata',
    'fetch_product_runtime_metadata',
    'fetch_content_runtime_metadata',
    'apply_runtime_detail_metadata',
    "'@type' => 'WebPage'",
  ]) {
    if (!source.includes(token)) {
      fail(`${label} must keep runtime detail SEO metadata support (${token})`);
    }
  }
}

for (const [label, source] of [
  ['theme/nextjs_default/bridge/app-shell.php', phpGreenhubAppShellCheckSource],
  ['theme/nextjs_default/bridge/render.php', phpNextjs25RenderSource],
]) {
  if (!source.includes('rewrite_runtime_metadata_urls($html, $index_path)')) {
    fail(`${label} must pass the resolved static HTML path into runtime metadata rewriting`);
  }
}

if (!publicPackage) {
  for (const token of ['forbiddenLiveStaticOriginPattern', 'localhost', '0\\.0\\.0\\.0', '\\[::1\\]']) {
    if (!packageLiveDeploySource.includes(token)) {
      fail(`package-live-deploy.mjs must scan static export text for local origins (${token})`);
    }
  }
}

if (publicPackage) {
  if (!rootHtaccessSource.includes('theme/nextjs_default/route.php')) {
    fail('public install rewrite rules must route public Next.js paths through theme/nextjs_default/route.php');
  }
} else {
  if (!rootHtaccessSource.includes('<FilesMatch "^\\.env(\\..*)?$">')) {
    fail('root .htaccess must deny direct access to environment files');
  }

  if (!rootHtaccessSource.includes('RewriteRule (^|/)\\.env(\\..*)?$ - [F,L]')) {
    fail('root .htaccess must block nested environment file URLs before file passthrough');
  }
}

if (vercelJsonSource.includes('Content-Security-Policy')) {
  const scriptSrc = vercelJsonSource.match(/script-src [^;"]+/)?.[0] ?? '';
  for (const token of [
    'https://testpay.kcp.co.kr',
    'https://*.kcp.co.kr',
    'https://stdpay.inicis.com',
    'https://*.inicis.com',
    'https://web.nicepay.co.kr',
    'https://*.nicepay.co.kr',
  ]) {
    if (!scriptSrc.includes(token)) {
      fail(`vercel.json script-src is missing PG SDK host ${token}`);
    }
  }
  if (/(^|\s)https:(\s|$)/.test(scriptSrc)) {
    fail('vercel.json script-src must not use the https: wildcard for PG SDKs');
  }
  if (scriptSrc.includes("'unsafe-eval'")) {
    fail('vercel.json script-src must not enable unsafe-eval by default');
  }
}

for (const token of [
  'function isCacheableStaticAsset',
  "url.pathname.startsWith('/_next/static/')",
  'CACHEABLE_PUBLIC_ASSET_RE',
  "if (!isCacheableStaticAsset(url)) return;",
  "response.type === 'basic'",
]) {
  if (!serviceWorkerSource.includes(token)) {
    fail(`public/sw.js is missing restricted static cache token ${token}`);
  }
}

for (const token of [
  'const userAllowedTags',
  'const userAllowedAttributes',
  'export function sanitizeContentHtml',
  'export function sanitizeCommerceHtml',
  'export function sanitizeUserHtml',
  'export function sanitizeInlineHtml',
]) {
  if (!sanitizeSource.includes(token)) {
    fail(`src/lib/sanitize.ts is missing trust-level sanitizer token ${token}`);
  }
}

for (const token of ['import { sanitizeUserHtml } from "@/lib/sanitize"', 'return sanitizeUserHtml(value);']) {
  if (!legacyReviewListSource.includes(token)) {
    fail(`src/app/shop/_legacy-review-list.ts is missing shared sanitizer token ${token}`);
  }
}

if (legacyReviewListSource.includes('replace(/<script')) {
  fail('src/app/shop/_legacy-review-list.ts must use sanitizeUserHtml instead of regex HTML stripping');
}

for (const token of [
  'function g5_nextjs_runtime_is_trusted_proxy_request',
  'function g5_nextjs_runtime_forwarded_proto',
  'G5_TRUSTED_PROXY_REMOTE_ADDRS',
  '$_SERVER[\'HTTP_X_FORWARDED_PROTO\']',
]) {
  if (!phpThemeCommonSource.includes(token)) {
    fail(`plugin/webapp/bridge/common.php is missing trusted proxy guard token ${token}`);
  }
}

if (!phpThemeCommonSource.includes("preg_match('/^[a-z][a-z0-9_-]{1,31}$/', $theme)")) {
  fail('plugin/webapp/bridge/common.php must validate active theme names with the same lowercase kebab-case rule as theme-pair.mjs');
}

if (!publicPackage && packageLiveDeploySource.includes('^[A-Za-z0-9_-]+$')) {
  fail('package-live-deploy.mjs must not generate loose active-theme validators that disagree with theme-pair.mjs');
}

for (const token of [
  '$g5_nextjs_trusted_proxy_addrs = g5_nextjs_runtime_env_value',
  "define('G5_TRUSTED_PROXY_REMOTE_ADDRS', $g5_nextjs_trusted_proxy_addrs)",
  '$g5_nextjs_current_origin = g5_nextjs_runtime_current_origin($g5_nextjs_http_host)',
]) {
  if (!phpNextjsRuntimeExtendSource.includes(token)) {
    fail(`plugin/webapp/bridge/runtime.php is missing trusted proxy env propagation token ${token}`);
  }
}

checkRuntimeOriginGuards({
  fail, nextConfigSource, staticSecurityHeadersSource,
  phpNextjsRuntimeExtendSource,
  phpApiIndexSource,
  phpApiHelpersSource,
  phpAuthHelpersSource,
  phpCertCommonSource,
  phpShopCommonSource,
  phpShopSessionHelpersSource,
  phpShopNaverpaySource,
  phpShopPaymentHelpersSource,
  phpGreenhubRuntimeCoreCheckSource,
  phpGreenhubAppShellCheckSource,
  phpNextjs25SecurityHeadersSource,
  phpNextjs25BridgeSource,
});

if (!nextConfigSource.includes("NEXT_IMAGE_ALLOW_LOCAL_HOSTS === '1'")) {
  fail('next.config.ts must keep localhost/127 image optimization behind an explicit opt-in');
}

checkRuntimeAdminPolicy({
  fail, adminAppPath, nextConfigSource, phpThemeCommonSource,
  phpApiIndexSource, phpShopRouterSource,
});

if (!apiClientSource.includes('body: body !== undefined ? JSON.stringify(body) : undefined')) {
  fail('api.ts must preserve falsy JSON request bodies such as false, 0, and empty strings');
}

if (!apiClientSource.includes('shouldPersistClientAuthCookies')) {
  fail('api.ts must avoid JS-readable auth cookie persistence for same-origin API deployments');
}

if (apiClientSource.includes('setCookie(TOKEN_COOKIE, legacy)')) {
  fail('api.ts must not migrate legacy localStorage auth tokens back into JS-readable cookies');
}

if (apiClientSource.includes('if (!this.refreshToken) return null;')) {
  fail('api.ts refreshAccessToken must support HttpOnly refresh cookies without a JS-readable refresh token');
}

if (!apiClientSource.includes("this.refreshToken || (this.canAttemptCookieRefresh() && this.hasAuthHint())")) {
  fail('api.ts must retry 401 responses when HttpOnly cookie refresh is possible');
}

for (const token of [
  "const AUTH_HINT_COOKIE = 'g5_auth_hint'",
  'hasAuthHint(): boolean',
]) {
  if (!apiClientSource.includes(token)) {
    fail(`api.ts is missing auth hint support token ${token}`);
  }
}

if (!authServerSource.includes("cache: 'no-store'")) {
  fail('auth-server.ts must not cache per-user /auth/me responses');
}

for (const token of [
  'function g5_api_enforce_write_origin',
  'function g5_api_config_value',
  'function g5_api_configured',
  "array('POST', 'PUT', 'PATCH', 'DELETE')",
  "Response::error('Forbidden origin.', 403)",
  "Response::error('Forbidden referer.', 403)",
  'g5_api_normalize_allowed_origins',
  'g5_api_enforce_write_origin($DEFAULT_ALLOWED_ORIGINS);',
]) {
  if (!phpApiIndexSource.includes(token)) {
    fail(`api/index.php is missing CSRF origin guard token ${token}`);
  }
}

if (!phpAuthLibSource.includes("$_COOKIE['g5_token']")) {
  fail('api/lib/Auth.php must accept same-origin HttpOnly g5_token cookies when Authorization is absent');
}

for (const token of [
  "'httponly' => (bool) $httpOnly",
  'function api_auth_env_value',
  'function api_auth_cookie_samesite',
  'G5_AUTH_COOKIE_SAMESITE',
  'G5_AUTH_COOKIE_SECURE',
  'function api_auth_set_session_cookies',
  'function api_auth_member_from_refresh_cookie',
  "'authenticated' => false",
  "'authenticated' => true",
  "'g5_auth_hint'",
  "$_COOKIE['g5_refresh']",
  'api_auth_set_session_cookies($token, $refresh',
  'api_auth_clear_session_cookies();',
]) {
  if (!phpAuthRuntimeSource.includes(token)) {
    fail(`api/v1/auth.php/auth_helpers.php is missing HttpOnly auth cookie support token ${token}`);
  }
}

for (const token of [
  'AND used_at IS NULL',
  'AND expires_at >= NOW()',
  '$claimed !== 1',
  "Response::error('Ticket already used or expired.', 410)",
]) {
  if (!phpAuthRuntimeSource.includes(token)) {
    fail(`api/v1/auth.php/auth_helpers.php is missing social ticket atomic exchange token ${token}`);
  }
}

for (const token of [
  "g5_api_configured('G5_CORS_ALLOWED_ORIGINS')",
  "g5_api_configured('G5_SOCIAL_WEB_HOSTS')",
]) {
  if (!phpStatusSource.includes(token) && !phpApiIndexSource.includes(token)) {
    fail(`API status checks must detect ${token} through constants, api/.env, or server env`);
  }
}

if (!phpApiIndexSource.includes('function g5_api_is_local_origin')) {
  fail('api/index.php must not trust Host-derived CORS origins except for local development');
}

if (!phpApiIndexSource.includes("$currentOrigin !== '' && g5_api_is_local_origin($currentOrigin)")) {
  fail('api/index.php must gate Host-derived CORS origins behind g5_api_is_local_origin');
}

for (const token of [
  'function nextjs25_social_allowed_mobile_schemes',
  'function nextjs25_social_validate_mobile_redirect',
  'G5_SOCIAL_MOBILE_SCHEMES',
  "array('dday-app')",
  'nextjs25_social_validate_mobile_redirect($redirect)',
  'function nextjs25_social_issue_bridge_state',
  'function nextjs25_social_validate_bridge_state',
  'function nextjs25_social_clear_bridge_state',
  "strpos($url, '#')",
  'hash_equals',
]) {
  if (!phpSocialBridgeSource.includes(token)) {
    fail(`api/social/_bridge_common.php is missing mobile redirect scheme guard token ${token}`);
  }
}

if (phpSocialBridgeSource.includes("nextjs25_social_add_allowed_hosts($hosts, $_SERVER['HTTP_HOST'])")) {
  fail('api/social/_bridge_common.php must not trust HTTP_HOST as an OAuth redirect allowlist source');
}

if (!phpSocialStartSource.includes("nextjs25_social_start_error('Disallowed mobile redirect scheme'")) {
  fail('api/social/start.php must reject custom OAuth redirect schemes outside the mobile scheme allowlist');
}

for (const token of [
  'nextjs25_social_issue_bridge_state($provider, $redirect)',
  "'bridge_state' => $bridgeState",
  "'&state=' . urlencode($bridgeState)",
]) {
  if (!phpSocialStartSource.includes(token)) {
    fail(`api/social/start.php is missing OAuth bridge state token ${token}`);
  }
}

for (const token of [
  'nextjs25_social_validate_bridge_state($bridgeState, $provider, $oauthRedirect)',
  "nextjs25_social_popup_fail('invalid_bridge_state'",
  "'&state=' . rawurlencode($bridgeState)",
]) {
  if (!phpSocialPopupSource.includes(token)) {
    fail(`api/social/popup.php is missing OAuth bridge state validation token ${token}`);
  }
}

if (!phpSocialFinishSource.includes("nextjs25_social_validate_mobile_redirect($redirect) !== ''")) {
  fail('api/social/finish.php must revalidate custom OAuth redirect schemes before issuing tickets');
}

if (!packageJsonSource.includes('"check:live-social-redirects": "node scripts/check-live-social-redirects.mjs"')) {
  fail('package.json must expose the live social redirect smoke check');
}

if (!publicPackage && !checkReleaseLiveSource.includes("'check:live-social-redirects'")) {
  fail('check-release-live.mjs must include the live social redirect smoke check');
}

if (
  !packageJsonSource.includes(
    '"check:live-youngcart-legacy-routes": "node scripts/check-live-youngcart-legacy-routes.mjs"'
  )
) {
  fail('package.json must route the live YoungCart legacy smoke check through its live wrapper');
}

for (const token of [
  "process.env.RUNTIME_CHECK_TARGET ||= 'live'",
  "process.env.RUNTIME_CHECK_LABEL ||= 'check-live-youngcart-legacy-routes'",
  "await import('./check-local-youngcart-legacy-routes.mjs')",
]) {
  if (!checkLiveYoungcartLegacyRoutesSource.includes(token)) {
    fail(`check-live-youngcart-legacy-routes.mjs is missing live wrapper token ${token}`);
  }
}

for (const token of [
  'const runtimeTarget =',
  "runtimeTarget === 'live'",
  'LIVE_SMOKE_YOUNGCART_LEGACY_REDIRECTS',
  'LIVE_SMOKE_YOUNGCART_ORIGINAL_PHP_PASSTHROUGHS',
]) {
  if (!checkLocalYoungcartLegacyRoutesSource.includes(token)) {
    fail(`check-local-youngcart-legacy-routes.mjs is missing live target token ${token}`);
  }
}

if (!publicPackage) {
  for (const token of [
    "const excludedApiPackagePatterns = ['.env', '.env.*']",
    'function shouldCopyApiEntry',
    "part === '.env' || part.startsWith('.env.')",
    'cpSync(apiSource, apiTarget, { recursive: true, filter: shouldCopyApiEntry })',
  ]) {
    if (!packageLiveDeploySource.includes(token)) {
      fail(`package-live-deploy.mjs is missing API environment file exclusion token ${token}`);
    }
  }
}

if (authStoreSource.includes('let token = api.getToken()')) {
  fail('auth store initialization must not require a JS-readable access token before /auth/me');
}

if (!authStoreSource.includes("api.post('/auth/logout', refresh ? { refresh_token: refresh } : {})")) {
  fail('auth store logout must call /auth/logout even when refresh is only present as an HttpOnly cookie');
}

if (!authProviderSource.includes('api.hasAuthHint()')) {
  fail('AuthProvider must skip guest-only /auth/me initialization when no auth hint cookie exists');
}

const safeSharePopupCount = shareButtonsSource.match(/width=600,height=400,noopener,noreferrer/g)?.length ?? 0;
if (safeSharePopupCount < 3) {
  fail('ShareButtons external popups must use noopener,noreferrer');
}

if (orderDataActionsSource.includes('api.getToken()')) {
  fail('order initial data loading must not hide member data behind JS-readable token checks');
}

if (!orderDataActionsSource.includes('const shouldLoadMember = hasCartItems && api.hasAuthHint();')) {
  fail('order initial data loading must avoid guest-only /auth/me calls while preserving HttpOnly auth sessions');
}

for (const token of [
  'function legacyRedirectPath',
  'function legacyRedirectUrl',
  'function legacyFallbackPath',
  'target.origin !== request.nextUrl.origin',
  'fallback.origin === request.nextUrl.origin',
  'const redirect = legacyRedirectPath(request, envelope.data?.redirect || fallbackRedirect, fallbackRedirect);',
]) {
  if (!legacyShopActionSource.includes(token)) {
    fail(`shop legacy action bridge is missing same-origin redirect guard token ${token}`);
  }
}

if (
  phpPaymentSource.includes('cookie("g5_token")') ||
  phpPaymentSource.includes('headers.Authorization="Bearer "+token')
) {
  fail('payment PG return bridges must rely on credentials: include and HttpOnly cookies, not JS-readable g5_token');
}

for (const token of [
  'function sameOriginNotificationPath',
  'url.origin !== self.location.origin',
  'sameOriginNotificationPath(event.notification.data?.url)',
]) {
  if (!serviceWorkerSource.includes(token)) {
    fail(`public/sw.js is missing notification URL hardening token ${token}`);
  }
}

console.log('[check-runtime-config] runtime base path guards passed');
