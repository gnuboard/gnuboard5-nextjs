import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_NAME } from './theme-name.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');

const args = new Set(process.argv.slice(2));
const supportedArgs = new Set([
  '--continue-on-failure',
  '--full',
  '--include-browser',
  '--include-mutating',
  '--skip-credentials',
  '--skip-mobile',
  '--skip-ssh',
  '--strict',
]);

for (const arg of args) {
  if (!supportedArgs.has(arg)) {
    console.error(`[check-live-ops] Unknown argument: ${arg}`);
    console.error(
      '[check-live-ops] Supported arguments: --continue-on-failure, --full, --include-browser, --include-mutating, --skip-credentials, --skip-mobile, --skip-ssh, --strict'
    );
    process.exit(1);
  }
}

function envFlag(name) {
  return process.env[name] === '1' || process.env[name] === 'true';
}

function env(name) {
  return String(process.env[name] || '').trim();
}

const continueOnFailure = args.has('--continue-on-failure') || envFlag('LIVE_OPS_CONTINUE_ON_FAILURE');
const full = args.has('--full') || envFlag('LIVE_OPS_FULL');
const includeBrowser = full || args.has('--include-browser') || envFlag('LIVE_OPS_INCLUDE_BROWSER');
const includeMutating = full || args.has('--include-mutating') || envFlag('LIVE_OPS_INCLUDE_MUTATING');
const skipCredentials = args.has('--skip-credentials') || envFlag('LIVE_OPS_SKIP_CREDENTIALS');
const skipMobile = args.has('--skip-mobile') || envFlag('LIVE_OPS_SKIP_MOBILE');
const skipSsh = args.has('--skip-ssh') || envFlag('LIVE_OPS_SKIP_SSH');
const strict = args.has('--strict') || envFlag('LIVE_OPS_STRICT');
const maxRetries = Number.parseInt(process.env.LIVE_OPS_CHECK_RETRIES || '0', 10);

const sshEnv = ['LIVE_DEPLOY_HOST', 'LIVE_DEPLOY_USER', 'LIVE_DEPLOY_WEB_ROOT'];
const adminEnv = ['LIVE_SMOKE_ADMIN_LOGIN_ID', 'LIVE_SMOKE_ADMIN_LOGIN_PASSWORD'];

const checks = [
  { category: 'public', script: 'check:live-deployment' },
  { category: 'public', script: 'check:live-runtime' },
  { category: 'public', script: 'check:live-rsc-payloads' },
  { category: 'public', script: 'check:live-social-redirects' },
  { category: 'public', script: 'check:live-youngcart-legacy-routes' },
  { category: 'migration', script: 'check:live-migration-sample' },
  {
    category: 'ssh',
    script: 'check:live-root-handoff',
    requiredEnv: sshEnv,
    env: {
      LIVE_ROOT_HANDOFF_IGNORE_SOURCE_DRIFT:
        process.env.LIVE_ROOT_HANDOFF_IGNORE_SOURCE_DRIFT || '1',
      LIVE_ROOT_HANDOFF_LIVE_ONLY: process.env.LIVE_ROOT_HANDOFF_LIVE_ONLY || '1',
    },
    skipWhen: () => skipSsh,
    skipReason: 'skipped by --skip-ssh',
  },
  {
    category: 'ssh',
    script: 'check:live-nginx-plan:required',
    requiredEnv: sshEnv,
    skipWhen: () => skipSsh,
    skipReason: 'skipped by --skip-ssh',
  },
  {
    category: 'admin',
    script: 'check:live-legacy-admin',
    requiredEnv: adminEnv,
    skipWhen: () => skipCredentials,
    skipReason: 'skipped by --skip-credentials',
  },
  {
    category: 'migration',
    script: 'check:live-migration-counts',
    requiredEnv: sshEnv,
    skipWhen: () => skipSsh,
    skipReason: 'skipped by --skip-ssh',
  },
  {
    category: 'browser',
    script: 'check:live-browser',
    selected: () => includeBrowser,
    skipReason: 'not selected; pass --include-browser or --full',
  },
  {
    category: 'browser',
    script: 'check:live-browser:mobile',
    selected: () => includeBrowser && !skipMobile,
    skipReason: 'not selected; pass --include-browser/--full without --skip-mobile',
  },
  {
    category: 'mutating',
    script: 'check:live-youngcart-order-flow',
    selected: () => includeMutating,
    skipReason: 'not selected; pass --include-mutating or --full',
  },
];

function missingEnv(names = []) {
  return names.filter((name) => !env(name));
}

function retryLimit() {
  return Number.isFinite(maxRetries) && maxRetries > 0 ? maxRetries : 0;
}

function lastOutputLines(...chunks) {
  const lines = chunks
    .join('\n')
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const signalLines = lines.filter((line) =>
    /\b(error|failed|fail|missing|denied|permission|ssh:|no such file|could not|exit)\b/i.test(line)
  );
  const selected = (signalLines.length > 0 ? signalLines : lines).slice(-4);
  const detail = selected.join(' / ');
  return detail.length > 360 ? `${detail.slice(0, 357)}...` : detail;
}

function runNpmScript(check) {
  const started = Date.now();
  const result = spawnSync('npm', ['run', check.script], {
    cwd: nextRoot,
    env: { ...process.env, ...(check.env || {}) },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const durationSeconds = ((Date.now() - started) / 1000).toFixed(1);

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    return {
      ok: false,
      durationSeconds,
      detail: result.error.message,
    };
  }

  return {
    ok: result.status === 0,
    durationSeconds,
    detail:
      result.status === 0
        ? 'passed'
        : `exit ${result.status}: ${lastOutputLines(result.stdout || '', result.stderr || '')}`,
  };
}

function tableDetail(detail) {
  return String(detail).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function markdownTable(rows) {
  const header = '| Category | Check | Status | Detail | Duration |\n|---|---|---|---|---|\n';
  const body = rows
    .map(
      (row) =>
        `| ${row.category} | ${row.script} | ${row.status} | ${tableDetail(row.detail)} | ${
          row.duration || ''
        } |`
    )
    .join('\n');
  return `${header}${body}\n`;
}

function writeGithubSummary(rows) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  appendFileSync(
    summaryPath,
    [
      `## ${THEME_NAME} live ops check`,
      '',
      markdownTable(rows),
      '',
      `Mode: strict=${strict ? 'yes' : 'no'}, browser=${includeBrowser ? 'yes' : 'no'}, mutating=${
        includeMutating ? 'yes' : 'no'
      }`,
      '',
    ].join('\n'),
    'utf8'
  );
}

console.log(
  `[check-live-ops] strict=${strict ? 'yes' : 'no'} browser=${
    includeBrowser ? 'yes' : 'no'
  } mobile=${includeBrowser && !skipMobile ? 'yes' : 'no'} mutating=${
    includeMutating ? 'yes' : 'no'
  } continueOnFailure=${continueOnFailure ? 'yes' : 'no'}`
);

const rows = [];

for (const check of checks) {
  if (check.selected && !check.selected()) {
    rows.push({
      category: check.category,
      script: check.script,
      status: 'skip',
      detail: check.skipReason,
      duration: '',
    });
    continue;
  }

  if (check.skipWhen?.()) {
    rows.push({
      category: check.category,
      script: check.script,
      status: strict ? 'fail' : 'skip',
      detail: check.skipReason,
      duration: '',
    });
    if (strict && !continueOnFailure) break;
    continue;
  }

  const missing = missingEnv(check.requiredEnv);
  if (missing.length > 0) {
    rows.push({
      category: check.category,
      script: check.script,
      status: strict ? 'fail' : 'skip',
      detail: `missing env: ${missing.join(', ')}`,
      duration: '',
    });
    if (strict && !continueOnFailure) break;
    continue;
  }

  let result = null;
  for (let attempt = 0; ; attempt += 1) {
    console.log(`\n>>> npm run ${check.script}`);
    result = runNpmScript(check);
    if (result.ok || attempt >= retryLimit()) break;
    console.warn(
      `[check-live-ops] ${check.script} failed; retrying (${attempt + 1}/${retryLimit()})`
    );
  }

  rows.push({
    category: check.category,
    script: check.script,
    status: result.ok ? 'ok' : 'fail',
    detail: result.detail,
    duration: `${result.durationSeconds}s`,
  });

  if (!result.ok && !continueOnFailure) break;
}

console.log('\n[check-live-ops] summary');
console.table(rows);
writeGithubSummary(rows);

const failures = rows.filter((row) => row.status === 'fail');
if (failures.length > 0) {
  console.error(`[check-live-ops] ${failures.length} live ops check(s) failed`);
  process.exit(1);
}

console.log('[check-live-ops] live ops checks passed');
