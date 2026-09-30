import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const policyPath = resolve(nextRoot, 'release-policy.json');

function fail(message, details = undefined) {
  console.error(`[check-source-release-branch] ${message}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    fail(`git ${args.join(' ')} failed: ${result.error.message}`);
  }
  return result;
}

function gitOutput(args) {
  const result = runGit(args);
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed`, {
      status: result.status,
      stderr: result.stderr.trim(),
      stdout: result.stdout.trim(),
    });
  }
  return result.stdout.trim();
}

function optionalGitOutput(args) {
  const result = runGit(args);
  return result.status === 0 ? result.stdout.trim() : '';
}

function rootPackageName() {
  try {
    const json = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    return String(json.name || '');
  } catch {
    return '';
  }
}

if (rootPackageName() === 'gnuboard5-nextjs25-theme') {
  console.log('[check-source-release-branch] public package repository; skipping source branch guard');
  process.exit(0);
}

let policy = {};
try {
  policy = JSON.parse(readFileSync(policyPath, 'utf8'));
} catch (error) {
  fail(`could not read release policy: ${error.message}`);
}

const allowedBranches = new Set(
  String(process.env.G5_SOURCE_RELEASE_BRANCHES || '')
    .split(',')
    .map((branch) => branch.trim())
    .filter(Boolean)
);
for (const branch of policy.sourceBranches || []) {
  if (branch) allowedBranches.add(String(branch));
}

const currentBranch = optionalGitOutput(['branch', '--show-current']);
if (!currentBranch) {
  fail('source release checks must run on a named branch, not a detached HEAD');
}

const dirty = optionalGitOutput(['status', '--porcelain']);
if (dirty) {
  const changed = dirty.split('\n');
  fail('source release branch has uncommitted changes; commit or stash them before release checks', {
    currentBranch,
    changed: changed.slice(0, 20),
    omitted: Math.max(0, changed.length - 20),
  });
}

if (allowedBranches.size > 0 && !allowedBranches.has(currentBranch)) {
  fail('current source branch is not allowed for Next.js release checks', {
    currentBranch,
    allowedBranches: [...allowedBranches],
  });
}

const upstream = optionalGitOutput(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
if (!upstream) {
  fail('current source branch has no upstream; push it and set upstream before release checks', {
    currentBranch,
  });
}

const [remoteName, ...remoteBranchParts] = upstream.split('/');
const remoteBranch = remoteBranchParts.join('/');
if (!remoteName || !remoteBranch) {
  fail('could not parse upstream branch', { upstream });
}

const fetchResult = runGit(
  ['fetch', '--no-tags', remoteName, `+refs/heads/${remoteBranch}:refs/remotes/${remoteName}/${remoteBranch}`],
  { stdio: 'pipe' }
);
if (fetchResult.status !== 0) {
  fail('could not fetch source release upstream', {
    upstream,
    status: fetchResult.status,
    stderr: fetchResult.stderr.trim(),
    stdout: fetchResult.stdout.trim(),
  });
}

const head = gitOutput(['rev-parse', '--verify', 'HEAD^{commit}']);
const upstreamHead = gitOutput(['rev-parse', '--verify', `${upstream}^{commit}`]);
if (head !== upstreamHead) {
  fail('source release branch has unpushed or unpulled commits', {
    currentBranch,
    upstream,
    head,
    upstreamHead,
  });
}

console.log(`[check-source-release-branch] ${currentBranch} matches ${upstream} at ${head.slice(0, 9)}`);
