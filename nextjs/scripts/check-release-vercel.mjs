import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';
import { loadLocalEnv } from './load-local-env.mjs';
import { resolveStrictSmokeSamples as resolveStrictSmokeSampleEnv } from './lib/vercel-smoke-samples.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const releaseEnvFile = String(process.env.G5_RELEASE_ENV_FILE || '').trim();

loadLocalEnv(nextRoot, {
  files: [
    '.env',
    '.env.production',
    '.env.local',
    '.env.production.local',
    '.env.vercel.local',
    ...(releaseEnvFile ? [releaseEnvFile] : []),
  ],
});

const args = new Set(process.argv.slice(2));
const npmCmd = 'npm';
const nodeCmd = process.execPath;
const pairs = allVercelThemePairs();
const strictSmoke = hasFlag('--strict-smoke');
const smokeRetries = parseNonNegativeInt(
  strictSmoke
    ? '0'
    : process.env.VERCEL_RELEASE_SMOKE_RETRIES || process.env.VERCEL_RELEASE_CHECK_RETRIES,
  1
);
const apiTimeoutMs = parseNonNegativeInt(process.env.VERCEL_RELEASE_SAMPLE_TIMEOUT_MS, 10000);

process.env.SERVER_RUNTIME_SMOKE_POST_PATH ||= process.env.LIVE_SMOKE_POST_PATH || '';
process.env.SERVER_RUNTIME_SMOKE_POST_TEXT ||= process.env.LIVE_SMOKE_POST_TEXT || '';
process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH ||= process.env.LIVE_SMOKE_PRODUCT_PATH || '';
process.env.SERVER_RUNTIME_SMOKE_PRODUCT_TEXT ||= process.env.LIVE_SMOKE_PRODUCT_TEXT || '';
if (strictSmoke) {
  process.env.SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS ||= process.env.LIVE_SMOKE_REQUIRE_DETAILS || 'post,product';
}

function hasFlag(name) {
  return args.has(name);
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function fail(message) {
  console.error(`[check-release-vercel] ${message}`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    fail(
      `Missing ${name}. Set it in .env.vercel.local, .env.local, or the shell before running this release gate.`
    );
  }
  return value;
}

function detailRequirements() {
  const value = String(process.env.SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS || '').trim().toLowerCase();
  if (!value || value === '0' || value === 'false' || value === 'no') return [];
  if (value === '1' || value === 'true' || value === 'yes' || value === 'all') {
    return ['post', 'product'];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item === 'post' || item === 'product');
}

async function resolveStrictSmokeSamples() {
  if (!strictSmoke || hasFlag('--skip-server') || hasFlag('--skip-server-smoke')) return;

  const requiredDetails = detailRequirements();
  if (requiredDetails.length === 0) return;

  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (!apiUrl) return;

  try {
    await resolveStrictSmokeSampleEnv({
      apiUrl,
      requiredDetails,
      env: process.env,
      timeoutMs: apiTimeoutMs,
      log: (message) => console.log(`[check-release-vercel] ${message}`),
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function requireStrictSmokeSamples() {
  if (!strictSmoke || hasFlag('--skip-server') || hasFlag('--skip-server-smoke')) return;

  const requiredDetails = detailRequirements();
  const samples = {
    post: [
      ['SERVER_RUNTIME_SMOKE_POST_PATH', process.env.SERVER_RUNTIME_SMOKE_POST_PATH],
      ['SERVER_RUNTIME_SMOKE_POST_TEXT', process.env.SERVER_RUNTIME_SMOKE_POST_TEXT],
    ],
    product: [
      ['SERVER_RUNTIME_SMOKE_PRODUCT_PATH', process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH],
      ['SERVER_RUNTIME_SMOKE_PRODUCT_TEXT', process.env.SERVER_RUNTIME_SMOKE_PRODUCT_TEXT],
    ],
  };

  for (const detail of requiredDetails) {
    for (const [name, value] of samples[detail]) {
      if (!String(value || '').trim()) {
        fail(
          `Strict Vercel smoke requires ${name}. ` +
            `Set SERVER_RUNTIME_SMOKE_* or the matching LIVE_SMOKE_* variable, ` +
            `or keep NEXT_PUBLIC_API_URL reachable so the gate can discover a public sample.`
        );
      }
    }
  }
}

function run(label, command, commandArgs, env = {}, options = {}) {
  const retries = options.retries ?? 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    console.log(`\n[check-release-vercel] ${label}`);
    const result = spawnSync(command, commandArgs, {
      cwd: nextRoot,
      env: {
        ...process.env,
        ...env,
      },
      shell: process.platform === 'win32' && command === npmCmd,
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }

    const status = result.status ?? 1;
    if (status === 0) return;

    if (attempt < retries) {
      console.warn(`[check-release-vercel] ${label} failed; retrying (${attempt + 1}/${retries})`);
      continue;
    }

    process.exit(status);
  }
}

function themeEnv(pair, runtime) {
  const appUrl = String(pair.appUrl || '').trim();
  if (!appUrl) {
    fail(`vercel-theme-map.json is missing appUrl for ${pair.source}->${pair.theme}`);
  }

  const apiUrl = requiredEnv('NEXT_PUBLIC_API_URL');
  const g5Url = requiredEnv('NEXT_PUBLIC_G5_URL');

  return {
    G5_NEXT_RUNTIME: runtime,
    G5_THEME_SOURCE: pair.source,
    G5_THEME_NAME: pair.theme,
    NEXT_PUBLIC_APP_URL: appUrl,
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_G5_URL: g5Url,
    G5_API_INTERNAL_URL: process.env.G5_API_INTERNAL_URL || apiUrl,
    STATIC_SMOKE_API_URL: process.env.STATIC_SMOKE_API_URL || apiUrl,
  };
}

function deployConfig(mode, pair, env) {
  run(
    `check ${mode} env ${pair.source}->${pair.theme}`,
    nodeCmd,
    [
      join(nextRoot, 'scripts', 'check-deploy-config.mjs'),
      '--mode',
      mode,
      '--require-env',
      '--source',
      pair.source,
      '--name',
      pair.theme,
    ],
    env
  );
}

function build(runtime, pair, env) {
  run(
    `build ${runtime} ${pair.source}->${pair.theme}`,
    nodeCmd,
    [
      join(nextRoot, 'scripts', 'build-vercel-theme.mjs'),
      '--runtime',
      runtime,
      '--source',
      pair.source,
      '--name',
      pair.theme,
    ],
    env
  );
}

if (!hasFlag('--skip-base')) {
  run('repository checks', npmCmd, ['run', 'check']);
}

if (!hasFlag('--skip-audit')) {
  run('dependency audit', npmCmd, ['audit', '--audit-level=moderate']);
}

await resolveStrictSmokeSamples();
requireStrictSmokeSamples();

if (!hasFlag('--skip-server')) {
  for (const pair of pairs) {
    const env = themeEnv(pair, 'server');
    deployConfig('vercel', pair, env);
    build('server', pair, env);
    if (!hasFlag('--skip-server-smoke')) {
      run(
        `server runtime smoke ${pair.source}->${pair.theme}`,
        npmCmd,
        ['run', 'check:server-runtime-smoke'],
        env,
        { retries: smokeRetries }
      );
    }
  }
}

if (!hasFlag('--skip-static')) {
  for (const pair of pairs) {
    const env = themeEnv(pair, 'static');
    deployConfig('static', pair, env);
    build('static', pair, env);
    run(`static budget ${pair.source}->${pair.theme}`, npmCmd, ['run', 'check:static-build-budget'], env);
    if (!hasFlag('--skip-static-smoke')) {
      run(
        `static UI smoke ${pair.source}->${pair.theme}`,
        npmCmd,
        ['run', 'check:static-ui-smoke'],
        env,
        { retries: smokeRetries }
      );
    }
  }
}

console.log('\n[check-release-vercel] Vercel release gate passed');
