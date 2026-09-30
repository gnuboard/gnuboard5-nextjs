import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PUBLIC_PACKAGE_NAME = 'gnuboard5-nextjs25-theme';

export function rootPackageName(root) {
  try {
    const json = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    return String(json.name || '');
  } catch {
    return '';
  }
}

export function readReleasePolicy(nextRoot) {
  try {
    return JSON.parse(readFileSync(resolve(nextRoot, 'release-policy.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function policyStringList(policy, name) {
  const value = policy?.[name];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return csv(value);
}

export function releasePolicyList({ policy, env = process.env, envName, policyName, fallback = [] }) {
  return unique([
    ...csv(env[envName]),
    ...policyStringList(policy, policyName),
    ...fallback.map((item) => String(item).trim()).filter(Boolean),
  ]);
}

export function publicPackageCandidates({ repoRoot, nextRoot, env = process.env }) {
  const policy = readReleasePolicy(nextRoot);
  return unique([
    ...releasePolicyList({
      policy,
      env,
      envName: 'G5_PUBLIC_PACKAGE_DIR',
      policyName: 'publicPackageDir',
    }),
    ...releasePolicyList({
      policy,
      env,
      envName: 'G5_PUBLIC_PACKAGE_DIRS',
      policyName: 'publicPackageDirs',
    }),
    resolve(repoRoot, '..', PUBLIC_PACKAGE_NAME),
    resolve(repoRoot, '..', '..', PUBLIC_PACKAGE_NAME),
  ]).map((candidate) => resolve(repoRoot, candidate));
}

export function findPublicPackageRoot({ repoRoot, nextRoot, env = process.env }) {
  if (rootPackageName(repoRoot) === PUBLIC_PACKAGE_NAME) {
    return { root: repoRoot, candidates: [repoRoot] };
  }

  const candidates = publicPackageCandidates({ repoRoot, nextRoot, env });
  const root = candidates.find(
    (candidate) => existsSync(candidate) && rootPackageName(candidate) === PUBLIC_PACKAGE_NAME
  );

  return { root: root || '', candidates };
}
