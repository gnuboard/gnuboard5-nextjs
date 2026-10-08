import { spawn } from 'node:child_process';
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertThemeSource, resolveThemePair } from './theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');

function fail(message) {
  console.error(`[dev-theme] ${message}`);
  console.error('Usage: node scripts/dev-theme.mjs [theme-source] [theme-name] [--webpack] -- [next dev args]');
  process.exit(1);
}

function readArgValue(args, shortName, longName) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === shortName || arg === longName) {
      return args[index + 1];
    }
    if (arg.startsWith(`${longName}=`)) {
      return arg.slice(longName.length + 1);
    }
  }
  return '';
}

function safeLocalUrlHost(host) {
  if (!host || host === '0.0.0.0' || host === '::') return '127.0.0.1';
  return host;
}

function nextBin() {
  return join(nextRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
}

const nextMetadataFiles = ['next-env.d.ts', 'tsconfig.json'].map((file) => join(nextRoot, file));
const nextMetadataSnapshots = new Map(
  nextMetadataFiles
    .filter((file) => existsSync(file))
    .map((file) => [file, readFileSync(file, 'utf8')])
);
const metadataGuardEnabled = process.env.G5_NEXT_METADATA_GUARD !== '0';
const metadataWatchers = [];
let metadataRestoreTimer = null;
let metadataRestoreInterval = null;

function restoreNextMetadata() {
  for (const [file, content] of nextMetadataSnapshots) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
      writeFileSync(file, content);
    }
  }
}

function scheduleNextMetadataRestore() {
  if (!metadataGuardEnabled || metadataRestoreTimer) return;
  metadataRestoreTimer = setTimeout(() => {
    metadataRestoreTimer = null;
    restoreNextMetadata();
  }, 250);
  metadataRestoreTimer.unref?.();
}

function startNextMetadataGuard() {
  if (!metadataGuardEnabled) return;

  for (const file of nextMetadataFiles) {
    if (!existsSync(file)) continue;
    try {
      metadataWatchers.push(watch(file, { persistent: false }, scheduleNextMetadataRestore));
    } catch {
      // File watching is best-effort; the periodic restore below is the fallback.
    }
  }

  metadataRestoreInterval = setInterval(restoreNextMetadata, 2000);
  metadataRestoreInterval.unref?.();
  scheduleNextMetadataRestore();
}

function stopNextMetadataGuard() {
  if (metadataRestoreTimer) {
    clearTimeout(metadataRestoreTimer);
    metadataRestoreTimer = null;
  }
  if (metadataRestoreInterval) {
    clearInterval(metadataRestoreInterval);
    metadataRestoreInterval = null;
  }
  while (metadataWatchers.length > 0) {
    metadataWatchers.pop()?.close?.();
  }
  restoreNextMetadata();
}

const separatorIndex = process.argv.indexOf('--', 2);
const ownArgs = separatorIndex === -1 ? process.argv.slice(2) : process.argv.slice(2, separatorIndex);
const nextArgs = separatorIndex === -1 ? [] : process.argv.slice(separatorIndex + 1);
let useTurbopack = true;
const positionalArgs = [];

for (const arg of ownArgs) {
  if (arg === '--webpack') {
    useTurbopack = false;
    continue;
  }
  if (arg === '--turbopack') {
    useTurbopack = true;
    continue;
  }
  positionalArgs.push(arg);
}

const [rawThemeSource, rawThemeName, extraArg] = positionalArgs;
let themeSource = '';
let themeName = '';

try {
  const pair = resolveThemePair({
    source: rawThemeSource || undefined,
    theme: rawThemeName || undefined,
  });
  themeSource = pair.source;
  themeName = pair.theme;
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (extraArg) {
  fail(`Unexpected argument "${extraArg}".`);
}

try {
  assertThemeSource(themeSource);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const host = safeLocalUrlHost(readArgValue(nextArgs, '-H', '--hostname') || '127.0.0.1');
const port = readArgValue(nextArgs, '-p', '--port') || '3000';

const childEnv = {
  ...process.env,
  G5_THEME_SOURCE: themeSource,
  G5_THEME_NAME: themeName,
  G5_NEXT_RUNTIME: process.env.G5_NEXT_RUNTIME || 'server',
  // 빌드 폴더에 포트를 붙인다 — Next 16 은 빌드 폴더 안의 lock 으로 개발 서버를 하나만 띄우게 막아, 같은 테마를
  // 다른 포트로 하나 더 띄우면(npm run dev 와 dev:nextjs_default) "Another next dev server is already running" 으로 멈췄다.
  G5_NEXT_DIST_DIR: process.env.G5_NEXT_DIST_DIR || `.next-dev-${themeName}-${port}`,
  G5_API_INTERNAL_URL:
    process.env.G5_API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/v1',
  NEXT_PUBLIC_G5_URL: process.env.NEXT_PUBLIC_G5_URL || 'http://localhost',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || `http://${host}:${port}`,
};

const devArgs = ['dev', ...(useTurbopack ? ['--turbopack'] : []), ...nextArgs];

console.log(
  `[dev-theme] source=${themeSource}; theme=${themeName}; dist=${childEnv.G5_NEXT_DIST_DIR}; ` +
    `engine=${useTurbopack ? 'turbopack' : 'webpack'}`
);

const child = spawn(process.execPath, [nextBin(), ...devArgs], {
  cwd: nextRoot,
  env: childEnv,
  shell: false,
  stdio: 'inherit',
});

startNextMetadataGuard();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    child.kill(signal);
  });
}

child.on('error', (error) => {
  stopNextMetadataGuard();
  console.error(`[dev-theme] ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  stopNextMetadataGuard();
  if (signal === 'SIGINT') process.exit(130);
  if (signal === 'SIGTERM') process.exit(143);
  process.exit(code ?? 1);
});

process.once('exit', stopNextMetadataGuard);
