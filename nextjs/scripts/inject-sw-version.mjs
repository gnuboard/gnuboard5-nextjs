/**
 * Replace the service worker CACHE_VERSION emitted to out/sw.js with a build
 * specific value. This must fail closed: shipping the placeholder keeps stale
 * chunks alive for users.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SW_TEMPLATE_PATH = join(ROOT, 'public', 'sw.js');
const OUT_SW_PATH = join(ROOT, 'out', 'sw.js');
const BUILD_DIR = process.env.G5_NEXT_DIST_DIR || '.next';
const BUILD_ID_PATH = join(ROOT, BUILD_DIR, 'BUILD_ID');
const OUT_STATIC_PATH = join(ROOT, 'out', '_next', 'static');
const OUT_WEBMANIFEST_PATH = join(ROOT, 'out', 'manifest.webmanifest');
const OUT_MANIFEST_JSON_PATH = join(ROOT, 'out', 'manifest.json');

function fail(message) {
  console.error(`[inject-sw-version] ${message}`);
  process.exit(1);
}

if (!existsSync(BUILD_ID_PATH)) {
  fail('.next/BUILD_ID not found. Run `next build` before postbuild.');
}
if (!existsSync(SW_TEMPLATE_PATH)) {
  fail('public/sw.js not found.');
}
if (!existsSync(OUT_SW_PATH)) {
  fail('out/sw.js not found. Static export service worker was not emitted.');
}
if (!existsSync(OUT_WEBMANIFEST_PATH)) {
  fail('out/manifest.webmanifest not found. Static export manifest was not emitted.');
}

const buildId = readFileSync(BUILD_ID_PATH, 'utf8').trim();
const sw = readFileSync(SW_TEMPLATE_PATH, 'utf8');

writeFileSync(OUT_MANIFEST_JSON_PATH, readFileSync(OUT_WEBMANIFEST_PATH, 'utf8'), 'utf8');

function collectFiles(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    })
    .sort();
}

function cacheVersionForExport() {
  const hash = createHash('sha256');
  const files = [
    ...collectFiles(OUT_STATIC_PATH),
    OUT_WEBMANIFEST_PATH,
    OUT_MANIFEST_JSON_PATH,
    join(ROOT, 'out', 'favicon.ico'),
  ].filter((path) => existsSync(path) && statSync(path).isFile());

  hash.update(`build:${buildId}\n`);
  for (const file of files) {
    hash.update(`${file.slice(ROOT.length + 1)}\0`);
    hash.update(readFileSync(file));
    hash.update('\0');
  }

  return `static-${hash.digest('hex').slice(0, 16)}`;
}

const PATTERN = /const CACHE_VERSION = ['"][^'"]+['"];/;
if (!PATTERN.test(sw)) {
  fail('CACHE_VERSION line not found in public/sw.js.');
}

const cacheVersion = process.env.G5_SW_CACHE_VERSION?.trim() || cacheVersionForExport();
const next = sw.replace(PATTERN, `const CACHE_VERSION = '${cacheVersion}';`);
if (next === sw) {
  console.log(`[inject-sw-version] sw.js template already at CACHE_VERSION=${cacheVersion}`);
  process.exit(0);
}

writeFileSync(OUT_SW_PATH, next, 'utf8');
console.log(`[inject-sw-version] out/sw.js CACHE_NAME = gnuboard-${cacheVersion} (BUILD_ID=${buildId})`);
