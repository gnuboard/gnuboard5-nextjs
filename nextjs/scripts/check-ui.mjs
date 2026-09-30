import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';
import { resolveStrictSmokeSamples } from './lib/vercel-smoke-samples.mjs';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
loadLocalEnv(nextRoot);
const host = process.env.G5_DEV_THEMES_HOST || '127.0.0.1';
const hasBasePortOverride = process.env.G5_DEV_THEMES_BASE_PORT !== undefined;
const basePort = Number.parseInt(process.env.G5_DEV_THEMES_BASE_PORT || '3001', 10);
const serverTimeoutMs = Number.parseInt(process.env.G5_UI_CHECK_SERVER_TIMEOUT_MS || '180000', 10);
const rawArgs = process.argv.slice(2).filter(Boolean);
const requireDetails = rawArgs.includes('--require-details');
const tasks = rawArgs.filter((arg) => arg !== '--require-details');
const uiTasks = tasks.length > 0 ? tasks : ['test:ui-smoke', 'check:a11y'];
const sampleTimeoutMs = Number.parseInt(process.env.UI_SMOKE_SAMPLE_TIMEOUT_MS || '10000', 10);

if (!Number.isInteger(basePort) || basePort < 1 || basePort > 65535) {
  fail('Invalid G5_DEV_THEMES_BASE_PORT. Use a TCP port from 1 to 65535.');
}

if (!Number.isInteger(serverTimeoutMs) || serverTimeoutMs < 1000) {
  fail('Invalid G5_UI_CHECK_SERVER_TIMEOUT_MS. Use milliseconds >= 1000.');
}

if (!Number.isInteger(sampleTimeoutMs) || sampleTimeoutMs < 1000) {
  fail('Invalid UI_SMOKE_SAMPLE_TIMEOUT_MS. Use milliseconds >= 1000.');
}

// uiSmoke:false 인 테마(문서 사이트)는 서버도 띄우지 않는다 — playwright.config.ts 와 같은 목록.
const themeUrls = allVercelThemePairs().filter((pair) => pair.uiSmoke !== false).map((pair, index) => {
  const port = hasBasePortOverride ? basePort + index : pair.devPort;
  return {
    label: pair.source === pair.theme ? pair.theme : `${pair.source}->${pair.theme}`,
    url: `http://${host}:${port}/`,
  };
});

function fail(message) {
  console.error(`[check-ui] ${message}`);
  process.exit(1);
}

function prefixStream(stream, label, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line) target.write(`[${label}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) target.write(`[${label}] ${buffer}\n`);
  });
}

function spawnChecked(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: nextRoot,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
      },
      shell: process.platform === 'win32',
      stdio: 'inherit',
      ...options,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal || code}`));
    });
  });
}

async function waitForTheme({ label, url }, deadline) {
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status < 500) {
        console.log(`[check-ui] ${label} ready at ${url} (${response.status})`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1000);
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError || 'timeout'}`);
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
}

async function prepareRequiredDetailSmoke() {
  if (!requireDetails) return;

  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (!apiUrl) {
    fail('Release UI smoke requires NEXT_PUBLIC_API_URL so real post/product detail samples can be resolved.');
  }

  await resolveStrictSmokeSamples({
    apiUrl,
    requiredDetails: ['post', 'product'],
    env: process.env,
    timeoutMs: sampleTimeoutMs,
    log: (message) => console.log(`[check-ui] ${message}`),
  });
}

await prepareRequiredDetailSmoke();

console.log(`[check-ui] starting local theme servers for ${themeUrls.length} theme(s)`);
const devServer = spawn(process.execPath, ['scripts/dev-themes.mjs'], {
  cwd: nextRoot,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
  },
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});

prefixStream(devServer.stdout, 'dev-themes', process.stdout);
prefixStream(devServer.stderr, 'dev-themes', process.stderr);

let devServerExit = null;
devServer.once('exit', (code, signal) => {
  devServerExit = signal || code || 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopProcessTree(devServer);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

try {
  const deadline = Date.now() + serverTimeoutMs;
  await Promise.all(themeUrls.map((theme) => waitForTheme(theme, deadline)));

  if (devServerExit !== null) {
    throw new Error(`dev theme server exited before UI checks completed: ${devServerExit}`);
  }

  for (const task of uiTasks) {
    console.log(`[check-ui] npm run ${task}`);
    await spawnChecked('npm', ['run', task]);
  }

  console.log('[check-ui] UI checks passed');
} catch (error) {
  console.error(`[check-ui] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  stopProcessTree(devServer);
}
