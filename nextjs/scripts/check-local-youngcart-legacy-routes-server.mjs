import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number.parseInt(process.env.LOCAL_YOUNGCART_ROUTE_SMOKE_PORT || '3075', 10);
const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || `http://localhost:${port}`);
const expectedG5Url =
  process.env.LOCAL_EXPECTED_G5_URL ||
  process.env.NEXT_PUBLIC_G5_URL ||
  process.env.G5_PUBLIC_URL ||
  'http://localhost';
const skipBuild = process.env.LOCAL_YOUNGCART_ROUTE_SMOKE_SKIP_BUILD === '1';

if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  fail(`Invalid LOCAL_YOUNGCART_ROUTE_SMOKE_PORT: ${process.env.LOCAL_YOUNGCART_ROUTE_SMOKE_PORT}`);
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function fail(message) {
  console.error(`[check-local-youngcart-legacy-routes-server] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    console.log(`\n>>> ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: root,
      env: {
        ...process.env,
        G5_NEXT_RUNTIME: 'server',
        ...(options.env || {}),
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
      reject(new Error(`${command} ${args.join(' ')} failed with ${reason}`));
    });
  });
}

function startNextServer() {
  const nextBin = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: root,
    env: {
      ...process.env,
      G5_NEXT_RUNTIME: 'server',
      LOCAL_APP_URL: appUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  return child;
}

async function waitForServer(child) {
  const deadline = Date.now() + Number.parseInt(process.env.LOCAL_YOUNGCART_ROUTE_SMOKE_START_TIMEOUT || '30000', 10);
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${appUrl}/`, { redirect: 'manual' });
      if (response.status > 0) {
        await response.arrayBuffer().catch(() => null);
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }

  throw new Error(
    `next start did not become ready at ${appUrl}: ${lastError?.message || 'timeout'}`
  );
}

async function stopNextServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise((resolveStop) => child.once('exit', () => resolveStop(true))),
    new Promise((resolveStop) => setTimeout(() => resolveStop(false), 5000)),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

let server = null;

try {
  if (!skipBuild) {
    await run('node', ['scripts/build-next.mjs']);
  } else {
    console.log('[check-local-youngcart-legacy-routes-server] skipping server build');
  }

  server = startNextServer();
  await waitForServer(server);

  await run('npm', ['run', 'check:local-youngcart-legacy-routes'], {
    env: {
      LOCAL_APP_URL: appUrl,
      LOCAL_EXPECTED_G5_URL: expectedG5Url,
    },
  });
} finally {
  await stopNextServer(server);
}

console.log('\n[check-local-youngcart-legacy-routes-server] server route smoke passed');
