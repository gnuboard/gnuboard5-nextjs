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
const policy = readReleasePolicy(nextRoot);

function fail(message, detail = undefined) {
  console.error(`[check-release-setup] ${message}`);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

function git(args, cwd = repoRoot) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed`, {
      cwd,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }

  return result.stdout.trim();
}

function ensureStringList(name, values, envName) {
  if (!Array.isArray(values) || values.length === 0 || values.some((item) => !String(item || '').trim())) {
    fail(`release-policy.json must define a non-empty ${name} array or set ${envName}`);
  }
  return values.map((item) => String(item).trim());
}

const sourceBranches = ensureStringList(
  'sourceBranches',
  releasePolicyList({
    policy,
    envName: 'G5_SOURCE_RELEASE_BRANCHES',
    policyName: 'sourceBranches',
  }),
  'G5_SOURCE_RELEASE_BRANCHES'
);
const publicPackageBranches = ensureStringList(
  'publicPackageBranches',
  releasePolicyList({
    policy,
    envName: 'G5_PUBLIC_PACKAGE_BRANCHES',
    policyName: 'publicPackageBranches',
  }),
  'G5_PUBLIC_PACKAGE_BRANCHES'
);
const currentBranch = git(['branch', '--show-current']);

if (!sourceBranches.includes(currentBranch)) {
  fail(`current source branch ${currentBranch || '(detached)'} is not allowed for release`, {
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

const missingPublicBranches = publicPackageBranches.filter((branch) => {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    cwd: publicPackage.root,
    shell: process.platform === 'win32',
  });
  return result.status !== 0;
});

if (missingPublicBranches.length > 0) {
  fail('public package checkout is missing required local branches', {
    root: publicPackage.root,
    missing: missingPublicBranches,
  });
}

const sourceDirty = git(['status', '--porcelain']);
if (sourceDirty) {
  const changed = sourceDirty.split('\n').filter(Boolean);
  fail('source checkout has uncommitted changes; commit or stash them before release checks', {
    changed: changed.slice(0, 30),
    omitted: Math.max(0, changed.length - 30),
  });
}

console.log('[check-release-setup] release setup passed', {
  sourceBranch: currentBranch,
  publicPackageRoot: publicPackage.root,
  publicPackageBranches,
});
