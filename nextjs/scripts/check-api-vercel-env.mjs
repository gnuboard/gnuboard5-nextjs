import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');

const envExampleCandidates = [
  join(repoRoot, 'api', 'env.example'),
  join(repoRoot, 'overlay', 'api', 'env.example'),
];

const envExamplePath = envExampleCandidates.find((path) => existsSync(path));
const errors = [];

function fail(message) {
  errors.push(message);
}

function parseEnvLine(source, name) {
  const line = source
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!line) return [];

  return line
    .slice(name.length + 1)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function originFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

if (!envExamplePath) {
  fail('api/env.example or overlay/api/env.example is missing');
} else {
  const source = readFileSync(envExamplePath, 'utf8');
  const corsOrigins = new Set(parseEnvLine(source, 'G5_CORS_ALLOWED_ORIGINS'));
  const socialHosts = new Set(parseEnvLine(source, 'G5_SOCIAL_WEB_HOSTS'));
  const pairs = allVercelThemePairs();

  for (const pair of pairs) {
    const origin = originFromUrl(pair.appUrl);
    if (!origin) {
      fail(`vercel-theme-map.json has invalid appUrl for ${pair.source}->${pair.theme}`);
      continue;
    }

    const host = new URL(origin).host;
    if (!corsOrigins.has(origin)) {
      fail(`${envExamplePath} G5_CORS_ALLOWED_ORIGINS must include ${origin}`);
    }
    if (!socialHosts.has(host)) {
      fail(`${envExamplePath} G5_SOCIAL_WEB_HOSTS must include ${host}`);
    }
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[check-api-vercel-env] ${message}`);
  }
  process.exit(1);
}

console.log('[check-api-vercel-env] Vercel theme API env examples passed');
