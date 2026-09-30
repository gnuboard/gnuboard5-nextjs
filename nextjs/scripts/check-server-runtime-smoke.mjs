import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
loadLocalEnv(nextRoot);

const host = process.env.SERVER_RUNTIME_SMOKE_HOST || '127.0.0.1';
const startupTimeoutMs = Number(process.env.SERVER_RUNTIME_SMOKE_STARTUP_TIMEOUT_MS || 45000);
const requestTimeoutMs = Number(process.env.SERVER_RUNTIME_SMOKE_REQUEST_TIMEOUT_MS || 5000);
const postPath = process.env.SERVER_RUNTIME_SMOKE_POST_PATH?.trim() || '';
const productPath = process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH?.trim() || '';
const tests = [
  'tests/pages.spec.ts',
  'tests/server-runtime.spec.ts',
  'tests/a11y.spec.ts',
];

const defaultSmokePaths = ['/','/boards','/shop'];
if (postPath) {
  defaultSmokePaths.push(postPath);
  tests.push('tests/post-detail.spec.ts');
}
if (productPath) {
  defaultSmokePaths.push(productPath);
  tests.push('tests/product-detail.spec.ts');
}

process.env.SERVER_RUNTIME_SMOKE_PATHS ||= [...new Set(defaultSmokePaths)].join(',');
process.env.SERVER_RUNTIME_SMOKE_API_PATH ||= '/api/v1/status';
if (process.env.SERVER_RUNTIME_SMOKE_POST_PATH) {
  process.env.LOCAL_SMOKE_POST_PATH ||= process.env.SERVER_RUNTIME_SMOKE_POST_PATH;
}
if (process.env.SERVER_RUNTIME_SMOKE_POST_TEXT) {
  process.env.LOCAL_SMOKE_POST_TITLE ||= process.env.SERVER_RUNTIME_SMOKE_POST_TEXT;
  process.env.LOCAL_SMOKE_POST_H1 ||= process.env.SERVER_RUNTIME_SMOKE_POST_TEXT;
}
if (process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH) {
  process.env.LOCAL_SMOKE_PRODUCT_PATH ||= process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH;
}
if (process.env.SERVER_RUNTIME_SMOKE_PRODUCT_TEXT) {
  process.env.LOCAL_SMOKE_PRODUCT_NAME ||= process.env.SERVER_RUNTIME_SMOKE_PRODUCT_TEXT;
}

function fail(message) {
  console.error(`[check-server-runtime-smoke] ${message}`);
  process.exit(1);
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

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('free port probe did not return a TCP address')));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

function startNext(port) {
  const nextBin = join(nextRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-H', host, '-p', String(port)], {
    cwd: nextRoot,
    env: {
      ...process.env,
      G5_NEXT_RUNTIME: 'server',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[next-start] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[next-start] ${chunk}`);
  });

  return child;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReady(appUrl, child) {
  const startedAt = Date.now();
  let childExit = null;
  child.once('exit', (code, signal) => {
    childExit = signal ? `signal ${signal}` : `exit code ${code}`;
  });

  while (Date.now() - startedAt < startupTimeoutMs) {
    if (childExit) {
      throw new Error(`next start exited before becoming ready (${childExit})`);
    }

    try {
      const response = await fetchWithTimeout(appUrl);
      if (response.status < 500) return;
    } catch {
      // Retry until startup timeout.
    }

    await new Promise((resolveRetry) => setTimeout(resolveRetry, 1000));
  }

  throw new Error(`next start did not become ready within ${startupTimeoutMs}ms`);
}

function runPlaywright(appUrl) {
  return new Promise((resolveRun, reject) => {
    console.log(`[check-server-runtime-smoke] app=${appUrl}`);
    console.log(`[check-server-runtime-smoke] tests=${tests.join(', ')}`);

    const child = spawn('npx', ['playwright', 'test', ...tests], {
      cwd: nextRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: appUrl,
        PLAYWRIGHT_FAIL_ON_CONSOLE_ERROR: process.env.PLAYWRIGHT_FAIL_ON_CONSOLE_ERROR || '1',
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`playwright server runtime smoke failed with ${reason}`));
    });
  });
}

function stopProcess(child) {
  return new Promise((resolveStop) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveStop();
      return;
    }

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolveStop();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill('SIGTERM');
  });
}

function relativeDisplayPath(file) {
  return relative(nextRoot, file).replaceAll('\\', '/');
}

function collectNftManifests(dir, manifests = []) {
  if (!existsSync(dir)) return manifests;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNftManifests(fullPath, manifests);
    } else if (entry.isFile() && entry.name.endsWith('.nft.json')) {
      manifests.push(fullPath);
    }
  }

  return manifests;
}

function readTraceManifest(file) {
  try {
    const text = readFileSync(file, 'utf8');
    return { text, json: JSON.parse(text) };
  } catch (error) {
    fail(`Could not read ${relativeDisplayPath(file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertServerTraceManifests() {
  const manifests = collectNftManifests(join(nextRoot, '.next'));
  const tempPathTokens = [
    '.g5-next-build-work/',
    '.g5-next-build-work\\',
    '.g5-next-build/',
    '.g5-next-build\\',
  ];

  for (const manifest of manifests) {
    const { text, json } = readTraceManifest(manifest);
    const displayPath = relativeDisplayPath(manifest);

    for (const token of tempPathTokens) {
      if (text.includes(token)) {
        fail(`${displayPath} still points at the temporary build workspace.`);
      }
    }

    for (const file of json.files ?? []) {
      const normalized = String(file).replaceAll('\\', '/');
      if (normalized === 'node_modules' || normalized.endsWith('/node_modules')) {
        fail(`${displayPath} traces the node_modules directory instead of concrete runtime files.`);
      }
    }
  }

  const rootPageTrace = join(nextRoot, '.next', 'server', 'app', 'page.js.nft.json');
  if (!existsSync(rootPageTrace)) return;

  const { json } = readTraceManifest(rootPageTrace);
  const files = (json.files ?? []).map((file) => String(file).replaceAll('\\', '/'));
  const requiredTraceGroups = [
    [
      'node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js',
      'node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js',
      'node_modules/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js',
    ],
    ['node_modules/react/jsx-runtime.js'],
  ];

  for (const required of requiredTraceGroups) {
    if (!required.some((candidate) => files.some((file) => file.endsWith(candidate)))) {
      fail(`${relativeDisplayPath(rootPageTrace)} is missing one of: ${required.join(', ')}.`);
    }
  }
}

if (!existsSync(join(nextRoot, '.next', 'BUILD_ID'))) {
  fail('.next/BUILD_ID is missing. Run npm run build:vercel before server runtime smoke.');
}

const requiredServerFilesPath = join(nextRoot, '.next', 'required-server-files.json');
if (existsSync(requiredServerFilesPath)) {
  const requiredServerFiles = readFileSync(requiredServerFilesPath, 'utf8');
  if (requiredServerFiles.includes('g5-next-build')) {
    fail('required-server-files.json still points at the temporary build workspace.');
  }
}

assertServerTraceManifests();

for (const requirement of detailRequirements()) {
  if (requirement === 'post' && !postPath) {
    fail('SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS requires SERVER_RUNTIME_SMOKE_POST_PATH.');
  }
  if (requirement === 'product' && !productPath) {
    fail('SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS requires SERVER_RUNTIME_SMOKE_PRODUCT_PATH.');
  }
}

const port = Number(process.env.SERVER_RUNTIME_SMOKE_PORT || await freePort());
const appUrl = `http://${host}:${port}`;
const next = startNext(port);

try {
  await waitForReady(appUrl, next);
  await runPlaywright(appUrl);
  console.log('\n[check-server-runtime-smoke] server runtime smoke passed');
} finally {
  await stopProcess(next);
}
