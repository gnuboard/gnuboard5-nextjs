import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const outRoot = resolve(process.cwd(), 'out');
const pageJsBudget = Number(process.env.MAX_STATIC_PAGE_JS_BYTES || 1760 * 1024);
const totalJsBudget = Number(process.env.MAX_STATIC_TOTAL_JS_BYTES || 8 * 1024 * 1024);
const htmlFiles = [];

function fail(message) {
  console.error(`[check-static-build-budget] ${message}`);
  process.exit(1);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  }
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function assetPathFromSrc(src, htmlFile) {
  let pathname = src;
  try {
    pathname = new URL(src, 'https://static-smoke.local').pathname;
  } catch {
    pathname = src.split('?')[0].split('#')[0];
  }

  pathname = decodeURIComponent(pathname);
  if (pathname.startsWith('/')) {
    return resolve(outRoot, pathname.slice(1));
  }

  return resolve(dirname(htmlFile), pathname);
}

function isInsideOutRoot(path) {
  return path === outRoot || path.startsWith(outRoot + sep);
}

function jsAssetsForHtml(html, htmlFile) {
  const assets = new Set();
  const scriptSrcPattern = /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
  let match;

  while ((match = scriptSrcPattern.exec(html))) {
    const asset = assetPathFromSrc(match[1], htmlFile);
    if (isInsideOutRoot(asset) && existsSync(asset) && statSync(asset).isFile()) {
      assets.add(asset);
    }
  }

  return assets;
}

if (!existsSync(outRoot)) {
  fail('out directory is missing. Run npm run build:vercel first.');
}

walk(outRoot);

if (htmlFiles.length === 0) {
  fail('no HTML files found in out directory');
}

const pageResults = [];
const allJsAssets = new Set();

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, 'utf8');
  const assets = jsAssetsForHtml(html, htmlFile);
  let bytes = 0;

  for (const asset of assets) {
    allJsAssets.add(asset);
    bytes += statSync(asset).size;
  }

  pageResults.push({
    page: relative(outRoot, htmlFile).replace(/\\/g, '/'),
    bytes,
    assets: assets.size,
  });
}

let totalJsBytes = 0;
for (const asset of allJsAssets) {
  totalJsBytes += statSync(asset).size;
}

const oversizedPages = pageResults.filter((page) => page.bytes > pageJsBudget);
if (oversizedPages.length > 0) {
  for (const page of oversizedPages.sort((a, b) => b.bytes - a.bytes)) {
    console.error(
      `[check-static-build-budget] page JS over budget ${page.page}: ${formatBytes(page.bytes)} ` +
        `(${page.assets} assets, budget ${formatBytes(pageJsBudget)})`
    );
  }
  process.exit(1);
}

if (totalJsBytes > totalJsBudget) {
  fail(`total JS over budget: ${formatBytes(totalJsBytes)} (budget ${formatBytes(totalJsBudget)})`);
}

const largestPages = pageResults
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 5)
  .map((page) => `${page.page}=${formatBytes(page.bytes)}`)
  .join(', ');

console.log(
  `[check-static-build-budget] ok; total JS ${formatBytes(totalJsBytes)}, largest pages: ${largestPages}`
);
