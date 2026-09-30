import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPublicPackageRoot } from './lib/public-package-root.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const sourceRoot = resolve(nextRoot, '..');
const args = new Set(process.argv.slice(2));
const check = args.has('--check');

function fail(message) {
  console.error(`[sync-public-package] ${message}`);
  process.exit(1);
}

function resolvePublicPackageDir() {
  const { root: dir, candidates } = findPublicPackageRoot({
    repoRoot: sourceRoot,
    nextRoot,
  });

  if (dir === sourceRoot) {
    if (check && existsSync(join(sourceRoot, 'scripts', 'sync-from-gnuboard.mjs'))) {
      console.log('[sync-public-package] public package repository; skipping source sync guard');
      process.exit(0);
    }

    fail(
      'Refusing to sync a repository into itself. Run this helper from the source checkout, ' +
        'or set G5_PUBLIC_PACKAGE_DIR to the public package checkout.'
    );
  }

  if (!dir) {
    fail(
      'public package checkout not found. Checked:\n' +
        candidates.map((candidate) => `- ${candidate}`).join('\n') +
        '\nSet G5_PUBLIC_PACKAGE_DIR or release-policy.json publicPackageDir.'
    );
  }

  return dir;
}

function run(command, commandArgs, cwd, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    shell: process.platform === 'win32',
    encoding: options.encoding,
    stdio: options.stdio || 'inherit',
  });

  if (result.error) {
    fail(result.error.message);
  }

  const status = result.status ?? 1;
  if (status !== 0) {
    process.exit(status);
  }

  return result;
}

function gitStatus(publicPackageDir) {
  const result = run('git', ['status', '--short'], publicPackageDir, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return String(result.stdout || '').trim();
}

const publicPackageDir = resolvePublicPackageDir();

if (!existsSync(join(publicPackageDir, 'package.json'))) {
  fail(`public package checkout not found: ${publicPackageDir}`);
}

if (!existsSync(join(publicPackageDir, 'scripts', 'sync-from-gnuboard.mjs'))) {
  fail(`public package sync script not found: ${join(publicPackageDir, 'scripts', 'sync-from-gnuboard.mjs')}`);
}

if (check) {
  const before = gitStatus(publicPackageDir);
  if (before) {
    fail(`public package checkout must be clean before sync check:\n${before}`);
  }
}

console.log(`[sync-public-package] syncing ${publicPackageDir}`);
console.log(`[sync-public-package] source ${sourceRoot}`);
run('npm', ['run', 'sync', '--', sourceRoot], publicPackageDir);

const after = gitStatus(publicPackageDir);

if (check && after) {
  fail(
    'public package is out of sync with the source checkout. Review and commit the generated changes:\n' +
      after
  );
}

if (after) {
  console.log(`[sync-public-package] public package has changes:\n${after}`);
} else {
  console.log('[sync-public-package] public package is up to date');
}
