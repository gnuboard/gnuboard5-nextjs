export function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

export function parseCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createLocalRuntimeHelpers({ appUrl, checkLabel }) {
  function fail(message) {
    console.error(`[${checkLabel}] ${message}`);
    process.exit(1);
  }

  function normalizePath(value) {
    return value.startsWith('/') ? value : `/${value}`;
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

  async function fetchText(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    return { response, text };
  }

  function sameUrl(actual, expected) {
    const normalize = (value) => trimTrailingSlash(String(value || '').replace(/&amp;/g, '&'));
    return normalize(actual) === normalize(expected);
  }

  function absoluteRedirectLocation(requestUrl, location) {
    if (!location) return '';

    try {
      return new URL(location, requestUrl).toString();
    } catch {
      return '';
    }
  }

  function isTrailingSlashNormalizationRedirect(requestUrl, location) {
    try {
      const request = new URL(requestUrl);
      const destination = new URL(location, request);
      const normalizedPath =
        request.pathname === '/' ? '/' : request.pathname.replace(/\/+$/, '');

      return (
        request.origin === destination.origin &&
        destination.pathname === normalizedPath &&
        destination.search === request.search &&
        destination.hash === request.hash
      );
    } catch {
      return false;
    }
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function nextFlightEscapedToken(value) {
    return String(value).replaceAll('"', '\\"');
  }

  function tokenVariants(value) {
    const escaped = nextFlightEscapedToken(value);
    return escaped === value ? [value] : [value, escaped];
  }

  function staticFallbackTokens(check, value) {
    return tokenVariants(
      `${JSON.stringify(String(check.paramName))},${JSON.stringify(String(value))},"d"`
    );
  }

  function assertStaticFallbackRouteParams(label, text, check) {
    const forbiddenTokens = [
      '__g5_static__',
      ...staticFallbackTokens(check, check.placeholder),
    ];

    for (const token of forbiddenTokens) {
      if (text.includes(token)) {
        fail(`${label} leaked static fallback route token ${token}`);
      }
    }

    const expectedTokenGroups = [
      tokenVariants(
        `${JSON.stringify(String(check.paramName))},${JSON.stringify(String(check.value))},"d"`
      ),
    ];

    for (const group of expectedTokenGroups) {
      if (!group.some((token) => text.includes(token))) {
        fail(`${label} is missing rewritten runtime route token ${group[0]}`);
      }
    }
  }

  function appAbsoluteUrl(path) {
    const normalized = normalizePath(path);
    return normalized === '/' ? appUrl : `${appUrl}${normalized}`;
  }

  function appAbsoluteUrlWithQuery(path, params) {
    const url = new URL(appAbsoluteUrl(path));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  function appBasePath() {
    const pathname = new URL(appUrl).pathname.replace(/\/+$/, '');
    return pathname === '/' ? '' : pathname;
  }

  function g5PublicPath(path) {
    return `${appBasePath()}${normalizePath(path)}` || '/';
  }

  function g5PublicScope() {
    const basePath = appBasePath();
    return basePath ? `${basePath}/` : '/';
  }

  function isLocalSitePath(path) {
    const normalized = normalizePath(path);
    const exactPaths = new Set([
      '/',
      '/favicon.ico',
      '/manifest.json',
      '/manifest.webmanifest',
      '/og-default.png',
      '/robots.txt',
      '/sitemap.xml',
      '/sitemap-posts.xml',
      '/sw.js',
    ]);
    if (exactPaths.has(normalized) || /^\/icon-[0-9]+\.png$/.test(normalized)) {
      return true;
    }

    if (
      /^\/(?:admin|boards|content|faq|forgot-password|login|mypage|polls|recent|register|rss|search|shop)(?:\/|$)/.test(
        normalized
      )
    ) {
      return true;
    }

    return /^\/[0-9A-Za-z_]+(?:\/[^/]+)?$/.test(normalized);
  }

  function isRuntimeLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    const appHost = new URL(appUrl).hostname.toLowerCase();
    if (host === appHost || host === 'localhost' || host === '::1' || host.startsWith('127.')) {
      return true;
    }

    return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
  }

  function collectAbsoluteUrls(text) {
    return Array.from(String(text).matchAll(/https?:\/\/[^"'<>\s\\]+/gi)).map((match) => match[0]);
  }

  function parseRuntimeConfigCandidate(candidate) {
    try {
      const config = JSON.parse(candidate.json);
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { error: 'value is not an object' };
      }

      const hasRuntimeUrl = ['apiBaseUrl', 'g5BaseUrl', 'appBaseUrl'].some(
        (key) => typeof config[key] === 'string' && config[key].trim() !== ''
      );
      if (!hasRuntimeUrl) {
        return { error: 'missing runtime URL fields' };
      }

      return { config };
    } catch (error) {
      return { error: error.message };
    }
  }

  function readRuntimeConfig(html) {
    // The PHP bridge injects the primary assignment with bracket notation
    // (window["__G5_APP_CONFIG__"] = {...}) so a configurable runtime key works.
    // Accept any bracket key that contains the runtime URL payload, plus legacy
    // dot-notation keys for older static shells.
    const candidates = [];
    for (const match of html.matchAll(
      /window\["([^"]+)"\]\s*=\s*Object\.assign\(\s*(\{.*?\})\s*,/gs
    )) {
      candidates.push({
        label: `window["${match[1]}"] Object.assign`,
        json: match[2],
      });
    }

    for (const match of html.matchAll(/window\[(["'])([^"']+)\1\]\s*=\s*(\{.*?\});/gs)) {
      candidates.push({
        label: `window[${match[1]}${match[2]}${match[1]}]`,
        json: match[3],
      });
    }

    for (const match of html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=\s*(\{.*?\});/gs)) {
      candidates.push({
        label: `window.${match[1]}`,
        json: match[2],
      });
    }

    if (candidates.length === 0) {
      fail(`Missing runtime config object assignment in ${appUrl}`);
    }

    const errors = [];
    for (const candidate of candidates) {
      const parsed = parseRuntimeConfigCandidate(candidate);
      if (parsed.config) {
        return parsed.config;
      }
      errors.push(`${candidate.label}: ${parsed.error}`);
    }

    fail(`Runtime config assignments were present but unusable: ${errors.join('; ')}`);
  }

  function readMetaContent(html, key, options = {}) {
    const tagMatch = html.match(
      new RegExp(`<meta\\b(?=[^>]*\\b(?:property|name)=["']${escapeRegExp(key)}["'])[^>]*>`, 'i')
    );

    if (!tagMatch) {
      if (options.required) {
        fail(`Missing ${key} meta tag in ${appUrl}`);
      }
      return null;
    }

    const contentMatch = tagMatch[0].match(/\bcontent=["']([^"']*)["']/i);
    if (!contentMatch) {
      fail(`${key} meta tag is missing content in ${appUrl}`);
    }

    return contentMatch[1];
  }

  function readLinkHref(html, rel, options = {}) {
    const tagMatch = html.match(
      new RegExp(`<link\\b(?=[^>]*\\brel=["']${escapeRegExp(rel)}["'])[^>]*>`, 'i')
    );

    if (!tagMatch) {
      if (options.required) {
        fail(`Missing ${rel} link in ${appUrl}`);
      }
      return null;
    }

    const hrefMatch = tagMatch[0].match(/\bhref=["']([^"']*)["']/i);
    if (!hrefMatch) {
      fail(`${rel} link is missing href in ${appUrl}`);
    }

    return hrefMatch[1];
  }

  function readJsonLdScripts(html) {
    const scripts = Array.from(
      html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>(.*?)<\/script>/gis)
    );

    if (scripts.length === 0) {
      fail(`Missing JSON-LD scripts in ${appUrl}`);
    }

    return scripts.map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch (error) {
        fail(`Invalid JSON-LD in ${appUrl}: ${error.message}`);
      }
    });
  }

  function collectJsonLdNodes(value, nodes = []) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectJsonLdNodes(item, nodes);
      }
      return nodes;
    }

    if (value && typeof value === 'object') {
      nodes.push(value);
      if (Array.isArray(value['@graph'])) {
        collectJsonLdNodes(value['@graph'], nodes);
      }
    }

    return nodes;
  }

  function hasJsonLdType(node, type) {
    const nodeType = node?.['@type'];
    return Array.isArray(nodeType) ? nodeType.includes(type) : nodeType === type;
  }

  function findJsonLdNode(nodes, type) {
    const node = nodes.find((item) => hasJsonLdType(item, type));
    if (!node) {
      fail(`Missing ${type} JSON-LD node in ${appUrl}`);
    }
    return node;
  }

  function expectHeader(headers, name, expected) {
    const actual = headers.get(name);
    if (actual !== expected) {
      fail(`${name} is ${actual || '(missing)'}, expected ${expected}`);
    }
  }

  function expectHeaderOneOf(headers, name, expectedValues) {
    const actual = headers.get(name);
    if (!expectedValues.includes(actual)) {
      fail(`${name} is ${actual || '(missing)'}, expected one of ${expectedValues.join(', ')}`);
    }
  }

  function expectHeaderIncludes(headers, name, expectedParts) {
    const actual = headers.get(name) || '';
    for (const part of expectedParts) {
      if (!actual.includes(part)) {
        fail(`${name} is ${actual || '(missing)'}, expected to include ${part}`);
      }
    }
  }

  function expectServiceWorkerScope(headers, scriptUrl, expectedScope) {
    const scriptPath = new URL(scriptUrl).pathname;
    const defaultScope = scriptPath.slice(0, scriptPath.lastIndexOf('/') + 1);
    const allowedScope = headers.get('service-worker-allowed');

    if (allowedScope && allowedScope !== expectedScope) {
      fail(`${scriptUrl} service-worker-allowed is ${allowedScope}, expected ${expectedScope}`);
    }
    if (!allowedScope && defaultScope !== expectedScope) {
      fail(`${scriptUrl} is missing service-worker-allowed ${expectedScope} for default scope ${defaultScope}`);
    }
  }

  function expectCorsAllowOrigin(headers, requestUrl, expectedOrigin) {
    const allowOrigin = headers.get('access-control-allow-origin');
    const crossOrigin = new URL(requestUrl).origin !== expectedOrigin;
    if ((!allowOrigin && !crossOrigin) || allowOrigin === expectedOrigin) {
      return allowOrigin || '(same-origin)';
    }
    fail(`CORS allow-origin is ${allowOrigin || '(missing)'}, expected ${expectedOrigin}`);
  }

  function cspDirectiveSources(csp, directiveName) {
    const directive = String(csp || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part === directiveName || part.startsWith(`${directiveName} `));

    if (!directive) {
      return [];
    }

    return directive
      .split(/\s+/)
      .slice(1)
      .map((source) => source.trim())
      .filter(Boolean);
  }

  function expectCspDirectiveIncludes(headers, directiveName, expectedSources) {
    const csp = headers.get('content-security-policy') || '';
    const sources = cspDirectiveSources(csp, directiveName);
    if (sources.length === 0) {
      fail(`content-security-policy ${directiveName} is missing`);
    }

    for (const source of expectedSources) {
      if (!sources.includes(source)) {
        fail(
          `content-security-policy ${directiveName} is ${sources.join(' ') || '(missing)'}, expected to include ${source}`
        );
      }
    }
  }

  function expectCspDirectiveExcludes(headers, directiveName, forbiddenSources) {
    const csp = headers.get('content-security-policy') || '';
    const sources = cspDirectiveSources(csp, directiveName);
    for (const source of forbiddenSources) {
      if (sources.includes(source)) {
        fail(`content-security-policy ${directiveName} must not include ${source}`);
      }
    }
  }

  function expectCspDirectiveSourcePrefix(headers, directiveName, expectedPrefix) {
    const csp = headers.get('content-security-policy') || '';
    const sources = cspDirectiveSources(csp, directiveName);
    if (!sources.some((source) => source.startsWith(expectedPrefix))) {
      fail(
        `content-security-policy ${directiveName} is ${sources.join(' ') || '(missing)'}, expected a source starting ${expectedPrefix}`
      );
    }
  }

  function expectCspConnectSource(headers, expectedUrl) {
    const csp = headers.get('content-security-policy') || '';
    const sources = cspDirectiveSources(csp, 'connect-src');
    const url = new URL(expectedUrl);

    if (sources.includes("'self'") && url.origin === new URL(appUrl).origin) {
      return;
    }

    if (sources.includes(url.origin)) {
      return;
    }

    if (url.protocol === 'https:' && sources.includes('https:')) {
      return;
    }

    if (url.protocol === 'http:' && (sources.includes('http:') || sources.includes('http://localhost:*'))) {
      return;
    }

    fail(
      `content-security-policy connect-src is ${sources.join(' ') || '(missing)'}, expected to allow ${url.origin}`
    );
  }

  function isDisabledLegacyRssResponse(text) {
    const normalized = String(text).replace(/\s+/g, ' ');
    return /RSS/i.test(normalized) && normalized.includes('\uae08\uc9c0');
  }

  function expectApiSecurityHeaders(headers, options = {}) {
    expectHeader(headers, 'x-content-type-options', 'nosniff');
    expectHeader(headers, 'x-frame-options', 'DENY');
    expectHeaderOneOf(headers, 'referrer-policy', options.referrerPolicies || ['no-referrer']);
    expectHeaderIncludes(headers, 'content-type', ['application/json']);

    if (options.permissionsPolicy) {
      expectHeaderIncludes(headers, 'permissions-policy', ['camera=()', 'microphone=()', 'geolocation=()']);
      expectHeader(headers, 'x-permitted-cross-domain-policies', 'none');
    }
  }

  function expectThemeSecurityHeaders(headers) {
    expectHeader(headers, 'x-content-type-options', 'nosniff');
    expectHeader(headers, 'x-frame-options', 'DENY');
    expectHeader(headers, 'referrer-policy', 'strict-origin-when-cross-origin');
    expectHeaderIncludes(headers, 'permissions-policy', ['camera=()', 'microphone=()', 'geolocation=()']);
  }

  function expectNoindexHeader(headers, url) {
    expectHeaderIncludes(headers, 'x-robots-tag', ['noindex', 'nofollow']);
    expectHeaderIncludes(headers, 'cache-control', ['no-store', 'private']);
    expectHeader(headers, 'pragma', 'no-cache');
    const contentType = headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      fail(`${url} returned content-type ${contentType || '(missing)'}, expected HTML`);
    }
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
  

  return {
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
  };
}
