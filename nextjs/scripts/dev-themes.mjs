import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertThemeSource } from './theme-pair.mjs';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const devThemeScript = join(scriptDir, 'dev-theme.mjs');

const host = process.env.G5_DEV_THEMES_HOST || '127.0.0.1';
const hasBasePortOverride = process.env.G5_DEV_THEMES_BASE_PORT !== undefined;
const basePort = Number.parseInt(process.env.G5_DEV_THEMES_BASE_PORT || '3001', 10);

if (!Number.isInteger(basePort) || basePort < 1 || basePort > 65535) {
  console.error('[dev-themes] Invalid G5_DEV_THEMES_BASE_PORT. Use a TCP port from 1 to 65535.');
  process.exit(1);
}

const themes = allVercelThemePairs().map((pair, index) => {
  assertThemeSource(pair.source);
  const port = hasBasePortOverride ? basePort + index : pair.devPort;
  if (port > 65535) {
    console.error(`[dev-themes] Too many themes for base port ${basePort}; ${pair.theme} would exceed 65535.`);
    process.exit(1);
  }

  return {
    label: pair.source === pair.theme ? pair.theme : `${pair.source}->${pair.theme}`,
    source: pair.source,
    name: pair.theme,
    port: String(port),
  };
});

const children = new Set();
let shuttingDown = false;

function prefixStream(stream, label, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      target.write(line ? `[${label}] ${line}\n` : '\n');
    }
  });
  stream.on('end', () => {
    if (buffer) {
      target.write(`[${label}] ${buffer}\n`);
    }
  });
}

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill(signal);
  }
}

for (const theme of themes) {
  const child = spawn(
    process.execPath,
    [
      devThemeScript,
      theme.source,
      theme.name,
      '--',
      '-H',
      host,
      '-p',
      theme.port,
    ],
    {
      cwd: nextRoot,
      env: {
        ...process.env,
        G5_NEXT_DIST_DIR: `.next-dev-${theme.name}`,
        NEXT_PUBLIC_APP_URL: `http://${host}:${theme.port}`,
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  children.add(child);
  prefixStream(child.stdout, theme.label, process.stdout);
  prefixStream(child.stderr, theme.label, process.stderr);

  child.on('error', (error) => {
    console.error(`[dev-themes] ${theme.label}: ${error.message}`);
    stopAll();
  });

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[dev-themes] ${theme.label} exited with ${signal || code}.`);
      stopAll();
      process.exitCode = code ?? 1;
    }
    if (children.size === 0) {
      process.exit(process.exitCode ?? 0);
    }
  });
}

for (const theme of themes) {
  console.log(`[dev-themes] ${theme.label}: http://${host}:${theme.port}/`);
}

process.once('SIGINT', () => stopAll('SIGINT'));
process.once('SIGTERM', () => stopAll('SIGTERM'));
