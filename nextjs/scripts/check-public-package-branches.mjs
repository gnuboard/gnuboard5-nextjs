import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  findPublicPackageRoot,
  PUBLIC_PACKAGE_NAME,
  readReleasePolicy,
  releasePolicyList,
} from './lib/public-package-root.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');

function fail(message, details = undefined) {
  console.error(`[check-public-package-branches] ${message}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function warn(message, details = undefined) {
  console.warn(`[check-public-package-branches] ${message}`);
  if (details) console.warn(JSON.stringify(details, null, 2));
}

function handleBranchIssue(message, details = undefined) {
  if (requirePushed) {
    fail(message, details);
  }

  warn(`${message}; advisory check only, strict release checks will fail until this is fixed`, details);
  process.exit(0);
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'cwd')),
  });
  if (result.error) {
    fail(`git ${args.join(' ')} failed: ${result.error.message}`);
  }
  return result;
}

function optionalGitOutput(args, cwd) {
  const result = runGit(args, { cwd });
  return result.status === 0 ? result.stdout.trim() : '';
}

const args = new Set(process.argv.slice(2));
const requirePushed =
  args.has('--require-pushed') || process.env.G5_PUBLIC_BRANCHES_REQUIRE_PUSHED === '1';
const releasePolicy = readReleasePolicy(nextRoot);
const requiredBranches = releasePolicyList({
  policy: releasePolicy,
  envName: 'G5_PUBLIC_PACKAGE_BRANCHES',
  policyName: 'publicPackageBranches',
});
if (requiredBranches.length === 0) {
  requiredBranches.push('main', 'main2');
}

const { root: publicRoot, candidates: publicPackageCandidates } = findPublicPackageRoot({
  repoRoot,
  nextRoot,
});
if (!publicRoot) {
  if (requirePushed) {
    fail('strict public branch guard requires a local public package checkout', {
      expectedPackage: PUBLIC_PACKAGE_NAME,
      checked: publicPackageCandidates,
      requiredBranches,
    });
  }

  console.log(
    '[check-public-package-branches] source repository; public package checkout not found, skipping public branch guard'
  );
  process.exit(0);
}

const publicDirty = optionalGitOutput(['status', '--porcelain'], publicRoot);
if (publicDirty) {
  const changed = publicDirty.split('\n');
  handleBranchIssue('public package checkout has uncommitted changes; commit or stash them before release checks', {
    changed: changed.slice(0, 20),
    omitted: Math.max(0, changed.length - 20),
  });
}

const fetchResult = runGit(
  [
    'fetch',
    '--no-tags',
    'origin',
    ...requiredBranches.map((branch) => `+refs/heads/${branch}:refs/remotes/origin/${branch}`),
  ],
  { cwd: publicRoot, stdio: 'pipe' }
);

if (fetchResult.status !== 0) {
  handleBranchIssue(`could not fetch public package branches: ${requiredBranches.join(', ')}`, {
    status: fetchResult.status,
    stderr: fetchResult.stderr.trim(),
    stdout: fetchResult.stdout.trim(),
  });
}

function commitFor(ref) {
  return optionalGitOutput(['rev-parse', '--verify', `${ref}^{commit}`], publicRoot);
}

const remoteBranches = Object.fromEntries(
  requiredBranches.map((branch) => [branch, commitFor(`origin/${branch}`)])
);
const missingRemote = requiredBranches.filter((branch) => !remoteBranches[branch]);
if (missingRemote.length > 0) {
  handleBranchIssue('public package Vercel branches are missing from origin', {
    missing: missingRemote,
  });
}

if (new Set(Object.values(remoteBranches)).size !== 1) {
  handleBranchIssue(`public package Vercel branches diverged; push the same commit to ${requiredBranches.join(' and ')}`, {
    remote: remoteBranches,
  });
}

const headCommit = commitFor('HEAD');
const expectedCommit = remoteBranches[requiredBranches[0]];
if (!headCommit || headCommit !== expectedCommit) {
  handleBranchIssue('public package checkout is not at the pushed Vercel branch commit', {
    head: headCommit,
    remote: remoteBranches,
  });
}

console.log(
  `[check-public-package-branches] ${requiredBranches.join('/')} synced at ${remoteBranches[requiredBranches[0]].slice(0, 9)}${
    requirePushed ? ' and pushed' : ''
  }`
);
