import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';
import { readThemeManifest } from './theme-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const npmCmd = 'npm';
const rawArgs = process.argv.slice(2);

loadLocalEnv(nextRoot);

const fixtureApiUrl = 'https://example.com/api/v1';
const fixtureG5Url = 'https://example.com';
const fixtureAppUrl = 'https://example.com';

const fixtureEnv = {
  NEXT_PUBLIC_API_URL: fixtureApiUrl,
  G5_API_INTERNAL_URL: fixtureApiUrl,
  NEXT_PUBLIC_G5_URL: fixtureG5Url,
  NEXT_PUBLIC_APP_URL: fixtureAppUrl,
  NEXT_IMAGE_EXTRA_HOSTS: 'example.com',
  STATIC_SMOKE_API_URL: fixtureApiUrl,
  STATIC_SMOKE_FIXTURE_API: '1',
};

function optionValue(name) {
  const longName = `--${name}`;
  const index = rawArgs.indexOf(longName);
  if (index >= 0) return rawArgs[index + 1] ?? '';

  const prefix = `${longName}=`;
  const inline = rawArgs.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

const themeSourceFilter = String(
  optionValue('source') ||
    rawArgs.find((arg) => arg && !arg.startsWith('-') && !arg.includes('=')) ||
    process.env.THEME_SOURCE_FILTER ||
    ''
).trim();
const themeNameFilter = String(
  optionValue('name') || optionValue('theme') || process.env.THEME_NAME_FILTER || ''
).trim();

function vercelThemePairs() {
  const pairs = readThemeManifest().themes
    .filter((entry) => entry.vercel !== false)
    .filter((entry) => !themeSourceFilter || entry.source === themeSourceFilter)
    .filter((entry) => !themeNameFilter || entry.theme === themeNameFilter)
    .map((entry) => ({
      source: entry.source,
      theme: entry.theme,
    }));

  if (pairs.length === 0) {
    console.error(
      `[check-vercel-static-fixture] No Vercel theme matches source=${themeSourceFilter || '(any)'}, theme=${themeNameFilter || '(any)'}.`
    );
    process.exit(1);
  }

  return pairs;
}

function run(label, args, env = {}) {
  console.log(`\n[check-vercel-static-fixture] ${label}`);
  const result = spawnSync(npmCmd, args, {
    cwd: nextRoot,
    env: {
      ...process.env,
      ...fixtureEnv,
      ...env,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  const status = result.status ?? 1;
  if (status !== 0) process.exit(status);
}

for (const pair of vercelThemePairs()) {
  const themeEnv = {
    G5_THEME_SOURCE: pair.source,
    G5_THEME_NAME: pair.theme,
  };

  run(
    `static Vercel fixture build (${pair.source}/${pair.theme})`,
    ['run', 'build:vercel:static', '--', '--source', pair.source, '--name', pair.theme],
    themeEnv
  );
  run(`static build budget (${pair.source}/${pair.theme})`, ['run', 'check:static-build-budget'], themeEnv);
  run(
    `static UI fixture smoke (${pair.source}/${pair.theme})`,
    ['run', 'check:static-ui-smoke:fixture'],
    themeEnv
  );
}

console.log('\n[check-vercel-static-fixture] static fixture release gate passed');
