import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findPublicPackageRoot,
  readReleasePolicy,
  releasePolicyList,
} from './lib/public-package-root.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipPreflight = args.includes('--skip-preflight');
const skipChecks = args.includes('--skip-checks') || process.env.G5_RELEASE_PUBLISH_SKIP_CHECKS === '1';
const includeActions = args.includes('--include-actions') || process.env.G5_RELEASE_PUBLISH_ACTIONS === '1';
const breakGlassReason =
  option('break-glass-reason') || process.env.G5_RELEASE_BREAK_GLASS_REASON || '';
const policy = readReleasePolicy(nextRoot);

function fail(message, detail = undefined) {
  console.error(`[release-publish] ${message}`);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

function run(command, commandArgs, cwd) {
  const printable = `${command} ${commandArgs.join(' ')}`.trim();
  if (dryRun) {
    console.log(`[release-publish] dry-run ${printable} (${cwd})`);
    return '';
  }

  console.log(`[release-publish] ${printable}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(`${printable} failed with exit ${result.status}`);
  }

  return result.stdout.trim();
}

function git(commandArgs, cwd = repoRoot) {
  return run('git', commandArgs, cwd);
}

function option(name) {
  const key = `--${name}`;
  const index = args.indexOf(key);
  if (index >= 0) return args[index + 1] || '';

  const prefix = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

function gitOutput(commandArgs, cwd = repoRoot) {
  const result = spawnSync('git', commandArgs, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(`git ${commandArgs.join(' ')} failed`, {
      cwd,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }

  return result.stdout.trim();
}

function gitMaybeOutput(commandArgs, cwd = repoRoot) {
  const result = spawnSync('git', commandArgs, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    fail(result.error.message);
  }

  return result.status === 0 ? result.stdout.trim() : '';
}

function ensureClean(cwd, label) {
  const status = gitOutput(['status', '--porcelain'], cwd);
  if (status) {
    fail(`${label} checkout must be clean before publishing`, {
      cwd,
      changed: status.split(/\r?\n/),
    });
  }
}

function requiredList({ name, envName }) {
  const value = releasePolicyList({ policy, envName, policyName: name });
  if (value.length === 0) {
    fail(`release-policy.json must define ${name} or set ${envName}`);
  }
  return value;
}

function currentBranch(cwd) {
  return gitOutput(['branch', '--show-current'], cwd);
}

function currentCommit(cwd) {
  return gitOutput(['rev-parse', '--short=12', 'HEAD'], cwd);
}

function remoteUrl(cwd) {
  return gitMaybeOutput(['remote', 'get-url', 'origin'], cwd);
}

function publishSummary({ upstream }) {
  return {
    source: {
      root: repoRoot,
      remote: remoteUrl(repoRoot),
      branch: sourceBranch,
      upstream: upstream || `origin/${sourceBranch}`,
      commit: currentCommit(repoRoot),
    },
    publicPackage: {
      root: publicPackage.root,
      remote: remoteUrl(publicPackage.root),
      branches: publicBranches,
      commit: currentCommit(publicPackage.root),
    },
    checks: {
      dryRun,
      skippedPrePushChecks: skipChecks,
      skippedPostPushPreflight: skipPreflight,
      includedStatefulActions: includeActions,
    },
  };
}

function runPrePushChecks() {
  if (skipChecks) {
    console.warn('[release-publish] skipping pre-push release checks (--skip-checks)');
    console.warn(`[release-publish] break-glass reason: ${breakGlassReason}`);
    return;
  }

  run('npm', ['run', 'check:release:deploy', '--', '--skip=preflight'], nextRoot);
  if (includeActions) {
    run('npm', ['run', 'check:release:actions'], nextRoot);
  }
}

if (!dryRun && (skipChecks || skipPreflight) && !breakGlassReason.trim()) {
  fail(
    'Skipping release checks requires --break-glass-reason or G5_RELEASE_BREAK_GLASS_REASON'
  );
}

const sourceBranches = requiredList({
  name: 'sourceBranches',
  envName: 'G5_SOURCE_RELEASE_BRANCHES',
});
const publicBranches = requiredList({
  name: 'publicPackageBranches',
  envName: 'G5_PUBLIC_PACKAGE_BRANCHES',
});
const sourceBranch = currentBranch(repoRoot);

if (!sourceBranches.includes(sourceBranch)) {
  fail(`current source branch ${sourceBranch || '(detached)'} is not allowed for release`, {
    allowed: sourceBranches,
  });
}

const publicPackage = findPublicPackageRoot({ repoRoot, nextRoot });
if (!publicPackage.root) {
  fail('public package checkout could not be found', {
    candidates: publicPackage.candidates,
    hint: 'Set G5_PUBLIC_PACKAGE_DIR or release-policy.json publicPackageDir.',
  });
}

ensureClean(repoRoot, 'source');
ensureClean(publicPackage.root, 'public package');

const publicBranch = currentBranch(publicPackage.root);
if (publicBranch !== publicBranches[0]) {
  fail(`public package checkout must be on ${publicBranches[0]} before publishing`, {
    current: publicBranch,
  });
}

runPrePushChecks();
ensureClean(repoRoot, 'source');
ensureClean(publicPackage.root, 'public package');

for (const branch of publicBranches.slice(1)) {
  git(['branch', '-f', branch, 'HEAD'], publicPackage.root);
}

const upstream = gitMaybeOutput(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).trim();
if (upstream) {
  git(['push'], repoRoot);
} else {
  git(['push', '-u', 'origin', sourceBranch], repoRoot);
}

git(['push', 'origin', ...publicBranches], publicPackage.root);

if (!skipPreflight) {
  run('npm', ['run', 'check:release:preflight'], nextRoot);
} else {
  console.warn('[release-publish] skipping post-push preflight (--skip-preflight)');
  console.warn(`[release-publish] break-glass reason: ${breakGlassReason}`);
}

console.log(`[release-publish] summary ${JSON.stringify(publishSummary({ upstream }))}`);
console.log('[release-publish] publish completed');
