import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const inventoryPath = join(scriptDir, 'php-vendor-inventory.json');

function fail(message) {
  console.error(`[check-php-vendor-inventory] ${message}`);
  process.exitCode = 1;
}

function repoPath(path) {
  return join(repoRoot, path);
}

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const hasCoreVendorTree = existsSync(repoPath('plugin')) || existsSync(repoPath('lib'));

if (!hasCoreVendorTree) {
  console.log('[check-php-vendor-inventory] core Gnuboard vendor tree is not packaged here; skipping');
  process.exit(0);
}

for (const vendor of inventory.vendors || []) {
  const path = repoPath(vendor.path);
  if (!existsSync(path)) {
    fail(`${vendor.name} is missing at ${vendor.path}`);
    continue;
  }

  const source = readFileSync(path, 'utf8');
  const match = source.match(new RegExp(vendor.versionPattern));
  if (!match) {
    fail(`${vendor.name} version marker was not found in ${vendor.path}`);
    continue;
  }

  const version = match[1] || vendor.expectedVersion;
  if (version !== vendor.expectedVersion) {
    fail(
      `${vendor.name} version changed from ${vendor.expectedVersion} to ${version}. ` +
        'Update scripts/php-vendor-inventory.json and docs/PHP_VENDOR_SECURITY.md intentionally.'
    );
    continue;
  }

  console.log(`[check-php-vendor-inventory] ${vendor.name} ${version}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('[check-php-vendor-inventory] vendor inventory matches baseline');
