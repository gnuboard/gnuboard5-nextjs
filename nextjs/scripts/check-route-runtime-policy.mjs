import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_NOINDEX_SOURCES } from './lib/route-policy-rules.mjs';
import { rewriteVercelPathname } from './lib/vercel-rewrite-matcher.mjs';
import { vercelStaticFallbackRewrites } from './route-rules.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const appRoot = join(nextRoot, 'src', 'app');
const nextConfigPath = join(nextRoot, 'next.config.ts');
const routeRulesPath = join(nextRoot, 'scripts', 'route-rules.mjs');
const routePolicyRulesPath = join(nextRoot, 'scripts', 'lib', 'route-policy-rules.mjs');
const ciWorkflowPaths = [
  join(nextRoot, '..', '.github', 'workflows', 'nextjs25-ci.yml'),
  join(nextRoot, '..', '.github', 'workflows', 'ci.yml'),
];

const routePolicyMarkers = {
  staticFallback: '@g5-static-fallback',
  staticShell: '@g5-static-shell',
  staticClosed: '@g5-static-closed',
  serverRuntimeOnly: '@g5-server-runtime-only',
};

const requiredNoindexSources = PRIVATE_NOINDEX_SOURCES;

const errors = [];

function fail(message) {
  errors.push(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function routeFilePath(route) {
  return join(appRoot, ...route.split('/'));
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path));
    } else if (entry.isFile() && (entry.name === 'page.tsx' || entry.name === 'route.ts')) {
      files.push(path);
    }
  }
  return files;
}

function routePath(path) {
  return normalizePath(relative(appRoot, path));
}

function isDynamicRoute(route) {
  return route.includes('[');
}

function requireRouteSource(route) {
  const path = routeFilePath(route);
  if (!existsSync(path)) {
    fail(`Missing route policy target ${route}`);
    return '';
  }

  return read(path);
}

function resolveLocalModulePath(fromPath, specifier) {
  if (!specifier.startsWith('.')) return null;

  const basePath = resolve(dirname(fromPath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    join(basePath, 'page.tsx'),
    join(basePath, 'route.ts'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function sourceWithLocalReexports(route, source, visited = new Set()) {
  const path = routeFilePath(route);
  const sources = [source];
  const reexportPattern = /export\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g;

  for (const match of source.matchAll(reexportPattern)) {
    const targetPath = resolveLocalModulePath(path, match[1]);
    if (!targetPath || visited.has(targetPath)) continue;

    visited.add(targetPath);
    const targetSource = read(targetPath);
    sources.push(targetSource);
    sources.push(
      sourceWithLocalReexports(
        normalizePath(relative(appRoot, targetPath)),
        targetSource,
        visited
      )
    );
  }

  return sources.join('\n');
}

function assertIncludes(source, route, token) {
  if (!source.includes(token)) {
    fail(`${route} must include ${token}`);
  }
}

const routeFiles = collectFiles(appRoot);
const staticFallbackRoutes = [];
const staticShellRoutes = [];
const staticClosedRoutes = [];
const serverRuntimeOnlyRoutes = [];

function routePolicyFor(source, route) {
  const matches = Object.entries(routePolicyMarkers).filter(([, marker]) => source.includes(marker));
  if (matches.length > 1) {
    fail(`Dynamic route ${route} has multiple route policy markers: ${matches.map(([, marker]) => marker).join(', ')}`);
    return null;
  }

  return matches[0]?.[0] ?? null;
}

for (const path of routeFiles) {
  const route = routePath(path);
  if (!isDynamicRoute(route)) continue;

  const source = read(path);
  const policy = routePolicyFor(source, route);
  if (!policy) {
    fail(
      `Dynamic route ${route} is missing a route policy marker (` +
        `${Object.values(routePolicyMarkers).join(', ')})`
    );
    continue;
  }

  if (policy === 'staticFallback') staticFallbackRoutes.push(route);
  if (policy === 'staticShell') staticShellRoutes.push(route);
  if (policy === 'staticClosed') staticClosedRoutes.push(route);
  if (policy === 'serverRuntimeOnly') serverRuntimeOnlyRoutes.push(route);
}

for (const path of routeFiles) {
  const source = read(path);
  const route = routePath(path);
  if (!source.includes('__g5_static__')) continue;

  assertIncludes(source, route, 'export const dynamic = "force-static"');
  assertIncludes(source, route, 'generateStaticParams');
}

for (const route of staticFallbackRoutes) {
  const source = requireRouteSource(route);
  if (!source) continue;
  const reexportAwareSource = sourceWithLocalReexports(route, source);

  assertIncludes(source, route, 'export const dynamicParams = true');
  assertIncludes(source, route, 'export const dynamic = "force-static"');
  assertIncludes(reexportAwareSource, route, 'generateStaticParams');
  assertIncludes(reexportAwareSource, route, '__g5_static__');
}

for (const route of staticShellRoutes) {
  const source = requireRouteSource(route);
  if (!source) continue;
  const reexportAwareSource = sourceWithLocalReexports(route, source);

  assertIncludes(source, route, 'export const dynamicParams = true');
  assertIncludes(source, route, 'export const dynamic = "force-static"');
  assertIncludes(reexportAwareSource, route, 'generateStaticParams');
  assertIncludes(reexportAwareSource, route, '__g5_static__');
  assertIncludes(source, route, 'ClientPage');
}

for (const route of staticClosedRoutes) {
  const source = requireRouteSource(route);
  if (!source) continue;
  const reexportAwareSource = sourceWithLocalReexports(route, source);

  assertIncludes(source, route, 'export const dynamicParams = false');
  assertIncludes(source, route, 'export const dynamic = "force-static"');
  assertIncludes(reexportAwareSource, route, 'generateStaticParams');
  assertIncludes(reexportAwareSource, route, '__g5_static__');
}

for (const route of serverRuntimeOnlyRoutes) {
  const source = requireRouteSource(route);
  if (!source) continue;

  assertIncludes(source, route, '@g5-server-runtime-only');
  assertIncludes(source, route, 'export const dynamic = "force-dynamic"');
}

const nextConfig = existsSync(nextConfigPath) ? read(nextConfigPath) : '';
const routePolicyRules = existsSync(routePolicyRulesPath) ? read(routePolicyRulesPath) : '';
if (!nextConfig) {
  fail('next.config.ts is missing');
} else {
  assertIncludes(nextConfig, 'next.config.ts', 'PRIVATE_NOINDEX_SOURCES');
  for (const source of requiredNoindexSources) {
    if (!routePolicyRules.includes(`'${source}'`) && !routePolicyRules.includes(`"${source}"`)) {
      fail(`PRIVATE_NOINDEX_SOURCES must include ${source}`);
    }
  }

  for (const token of [
    'NEXT_CSP_STRICT',
    'NEXT_CSP_REPORT_ONLY',
    'Content-Security-Policy-Report-Only',
    'allowUnsafeInlineScript',
    'allowUnsafeInlineStyle',
    'includeRuntimeConfigScriptHash',
    'runtimeConfigScriptHash',
  ]) {
    if (!nextConfig.includes(token)) {
      fail(`next.config.ts must include CSP hardening token ${token}`);
    }
  }
}

const routeRules = existsSync(routeRulesPath) ? read(routeRulesPath) : '';
for (const token of [
  'route-policy-rules.mjs',
  'vercelStaticFallbackManifest',
  'fallbackPair',
  'SHORT_BOARD_RESERVED_ROOTS',
  'SHORT_SHOP_RESERVED_SEGMENTS',
  'VERCEL_SHORT_BOARD_RESERVED_ROOTS',
  'VERCEL_SHORT_SHOP_RESERVED_SEGMENTS',
]) {
  if (!routeRules.includes(token)) {
    fail(`route-rules.mjs must keep generated fallback manifest token ${token}`);
  }
}

for (const [pathname, expectedDestination] of [
  ['/boards/free/4', '/boards/__g5_static__/0'],
  ['/free/4', '/boards/__g5_static__/0'],
  ['/free/seo-title', '/boards/__g5_static__/0'],
  ['/free/4.txt', '/boards/__g5_static__/0.txt'],
  ['/shop/unknown-product', '/shop/products/__g5_static__'],
  ['/shop/cart', null],
  ['/login', null],
]) {
  const destination = rewriteVercelPathname(pathname, vercelStaticFallbackRewrites);
  if (destination !== expectedDestination) {
    fail(
      `Vercel static fallback mismatch for ${pathname}: expected ` +
        `${expectedDestination ?? 'no rewrite'}, received ${destination ?? 'no rewrite'}`
    );
  }
}

for (const workflowPath of ciWorkflowPaths) {
  if (!existsSync(workflowPath)) continue;
  const source = read(workflowPath);
  if (!source.includes('build:vercel')) continue;

  for (const token of [
    'Check Vercel server env',
    '--mode vercel --require-env',
    'Check Vercel static env',
    '--mode static --require-env',
    'LIVE_SMOKE_POST_PATH',
    'LIVE_SMOKE_PRODUCT_PATH',
    'LIVE_SMOKE_REQUIRE_DETAILS',
    "|| 'post,product'",
  ]) {
    if (!source.includes(token)) {
      fail(`${normalizePath(relative(nextRoot, workflowPath))} must include ${token}`);
    }
  }
}

const serverSmokePath = join(nextRoot, 'scripts', 'check-server-runtime-smoke.mjs');
const serverSmoke = existsSync(serverSmokePath) ? read(serverSmokePath) : '';
for (const token of [
  'tests/post-detail.spec.ts',
  'tests/product-detail.spec.ts',
  'SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS',
]) {
  if (!serverSmoke.includes(token)) {
    fail(`check-server-runtime-smoke.mjs must include ${token}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[check-route-runtime-policy] ${message}`);
  }
  process.exit(1);
}

console.log('[check-route-runtime-policy] route runtime policy guards passed');
