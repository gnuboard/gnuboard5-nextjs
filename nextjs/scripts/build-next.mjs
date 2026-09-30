import { spawnSync } from 'node:child_process';
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertThemeSource } from './theme-source-name.mjs';
import {
  normalizeGeneratedWorkspaceReferences,
  normalizeWorkspacePath,
} from './lib/build-workspace-normalizer.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_LOCK_PATH = join(ROOT, '.g5-next-build.lock');
const BUILD_WORK_ROOT = join(ROOT, '.g5-next-build-work');
const BUILD_TEMP_ROOT = join(BUILD_WORK_ROOT, String(process.pid));
const BUILD_TEMP_RELATIVE = relative(ROOT, BUILD_TEMP_ROOT);
const DYNAMIC_PARAMS_RE = /export const dynamicParams = (true|false);/g;
const DYNAMIC_MODE_RE = /export const dynamic = ["'](force-static|force-dynamic)["'];/g;
const DYNAMIC_EXPORT_RE = /export const dynamic\s*=/;
const ROUTE_SEGMENT_FILE_RE = /(?:^|[\\/])(page|layout|route|sitemap|robots|manifest)\.(ts|tsx)$/;
const USE_CLIENT_RE = /^\s*["']use client["'];?/;
const SERVER_RUNTIME_ONLY_RE = /@g5-server-runtime-only/;
const SERVER_RUNTIME = process.env.G5_NEXT_RUNTIME === 'server';

// 휴대용 정적 빌드: 설치 주소를 모르므로 공개 URL 세 개를 자리표시자로 박는다. next.config.ts 가
// 같은 자리표시자를 basePath 로 쓰고, PHP 브리지(plugin/webapp/bridge/common.php)가 응답 시점에 실제
// 주소로 바꾼다. 셸 env 는 .env 파일보다 먼저 읽히므로 여기서 정한 값이 파일의 값을 이긴다.
// 사이트 하나에 고정된 예전 방식이 필요하면 G5_PORTABLE_BUILD=0 으로 끈다.
const PORTABLE_STATIC_BUILD = !SERVER_RUNTIME && process.env.G5_PORTABLE_BUILD !== '0';
const PORTABLE_SITE_URL = 'https://__g5host__/__g5base__';

function buildEnv() {
  const env = { ...process.env };
  if (!PORTABLE_STATIC_BUILD) return env;

  env.NEXT_PUBLIC_APP_URL = PORTABLE_SITE_URL;
  env.NEXT_PUBLIC_G5_URL = PORTABLE_SITE_URL;
  env.NEXT_PUBLIC_API_URL = `${PORTABLE_SITE_URL}/api/v1`;
  // 프리렌더가 특정 사이트의 글을 구워 넣지 않도록 내부 API 는 닿지 않는 주소로 둔다. .env 파일의
  // G5_API_INTERNAL_URL 은 무시한다(다른 스크립트가 미리 process.env 에 올려 두기도 한다).
  // 한 사이트용으로 글을 미리 구워 넣고 싶을 때만 G5_PORTABLE_PRERENDER_API_URL 을 준다.
  env.G5_API_INTERNAL_URL = process.env.G5_PORTABLE_PRERENDER_API_URL || env.NEXT_PUBLIC_API_URL;
  return env;
}
const VERCEL_SERVER_IN_PLACE_BUILD = SERVER_RUNTIME && process.env.VERCEL === '1';
const DESIRED_DYNAMIC_PARAMS = SERVER_RUNTIME ? 'true' : 'false';
const DESIRED_DYNAMIC_MODE = SERVER_RUNTIME ? 'force-dynamic' : 'force-static';
const THEME_SOURCE = assertThemeSource();
const GENERATED_ARTIFACTS = ['.next', 'out'];
const SERVER_RUNTIME_TRACE_PACKAGE_RE = /(?:^|\/)node_modules\/(?:next|react|react-dom|styled-jsx)(?:\/|$)/;
const COPY_EXCLUDED_DIRS = new Set([
  '.dev-logs',
  '.g5-next-build-work',
  '.git',
  '.next',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
]);
const COPY_EXCLUDED_FILES = new Set(['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

const WORKSPACE_NORMALIZER_OPTIONS = {
  root: ROOT,
  workspaceRoot: BUILD_TEMP_ROOT,
  workspaceRelative: BUILD_TEMP_RELATIVE,
};

let buildLockFd = null;
let buildLockOwned = false;
let cleaned = false;
let inPlaceSnapshot = null;

function shouldInjectDynamicMode(file, content) {
  return (
    SERVER_RUNTIME &&
    ROUTE_SEGMENT_FILE_RE.test(file) &&
    !DYNAMIC_EXPORT_RE.test(content) &&
    !USE_CLIENT_RE.test(content)
  );
}

function collectRouteFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;

    const content = readFileSync(fullPath, 'utf8');
    if (DYNAMIC_PARAMS_RE.test(content)) {
      files.push(fullPath);
    } else if (DYNAMIC_MODE_RE.test(content)) {
      files.push(fullPath);
    } else if (shouldInjectDynamicMode(fullPath, content)) {
      files.push(fullPath);
    }
    DYNAMIC_PARAMS_RE.lastIndex = 0;
    DYNAMIC_MODE_RE.lastIndex = 0;
  }

  return files;
}

function collectServerRuntimeOnlyRouteFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectServerRuntimeOnlyRouteFiles(fullPath));
      continue;
    }

    if (entry.name !== 'route.ts' && entry.name !== 'route.tsx') continue;

    const content = readFileSync(fullPath, 'utf8');
    if (SERVER_RUNTIME_ONLY_RE.test(content)) {
      files.push(fullPath);
    }
  }

  return files;
}

function nextBin() {
  return join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
}

function applyThemeTsconfigPath(buildRoot) {
  const tsconfigPath = join(buildRoot, 'tsconfig.json');
  const original = readFileSync(tsconfigPath, 'utf8');
  const config = JSON.parse(original);
  config.compilerOptions = config.compilerOptions ?? {};
  config.compilerOptions.paths = {
    ...(config.compilerOptions.paths ?? {}),
    '@g5-theme/*': [`./themes/${THEME_SOURCE}/*`],
  };

  const updated = `${JSON.stringify(config, null, 2)}\n`;
  if (updated !== original) {
    writeFileSync(tsconfigPath, updated);
  }
}

function acquireBuildLock() {
  try {
    buildLockFd = openSync(BUILD_LOCK_PATH, 'wx');
    buildLockOwned = true;
    writeFileSync(
      buildLockFd,
      JSON.stringify(
        {
          pid: process.pid,
          workspace: BUILD_TEMP_ROOT,
          startedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (error) {
    if (buildLockFd !== null) {
      releaseBuildLock();
    }

    if (error?.code === 'EEXIST') {
      throw new Error(
        `Build lock exists at ${BUILD_LOCK_PATH}. Another build may be running; remove it only after confirming no build is active.`
      );
    }
    throw error;
  }
}

function releaseBuildLock() {
  if (buildLockFd !== null) {
    closeSync(buildLockFd);
    buildLockFd = null;
  }

  if (buildLockOwned && existsSync(BUILD_LOCK_PATH)) {
    rmSync(BUILD_LOCK_PATH, { force: true });
  }
  buildLockOwned = false;
}

function shouldCopyRootEntry(name) {
  if (COPY_EXCLUDED_DIRS.has(name)) return false;
  if (COPY_EXCLUDED_FILES.has(name)) return false;
  if (name.startsWith('.next-dev-')) return false;
  return true;
}

function shouldCopyWorkspacePath(source) {
  const relativePath = source.slice(ROOT.length + 1).replaceAll('\\', '/');
  if (relativePath === 'themes/.active') return false;
  return true;
}

function createBuildWorkspace() {
  rmSync(BUILD_TEMP_ROOT, { recursive: true, force: true });
  mkdirSync(BUILD_TEMP_ROOT, { recursive: true });

  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!shouldCopyRootEntry(entry.name)) continue;
    cpSync(join(ROOT, entry.name), join(BUILD_TEMP_ROOT, entry.name), {
      recursive: true,
      dereference: false,
      filter: shouldCopyWorkspacePath,
    });
  }

  // Keep node_modules outside the patched workspace so traces point at the real install.
  // Node resolves dependencies from ROOT/node_modules because BUILD_TEMP_ROOT is under ROOT.
}

function patchBuildRoot(buildRoot) {
  const appDir = join(buildRoot, 'src', 'app');
  applyThemeTsconfigPath(buildRoot);

  if (!SERVER_RUNTIME) {
    for (const file of collectServerRuntimeOnlyRouteFiles(appDir)) {
      const disabledPath = `${file}.g5-static-disabled`;
      if (existsSync(disabledPath)) {
        throw new Error(`Refusing to hide server-only route because ${disabledPath} already exists`);
      }
      renameSync(file, disabledPath);
    }
  }

  for (const file of collectRouteFiles(appDir)) {
    const original = readFileSync(file, 'utf8');
    const updated = original
      .replace(DYNAMIC_PARAMS_RE, `export const dynamicParams = ${DESIRED_DYNAMIC_PARAMS};`)
      .replace(DYNAMIC_MODE_RE, `export const dynamic = "${DESIRED_DYNAMIC_MODE}";`);
    const nextContent = shouldInjectDynamicMode(file, updated)
      ? `export const dynamic = "${DESIRED_DYNAMIC_MODE}";\n${updated}`
      : updated;

    if (nextContent !== original) {
      writeFileSync(file, nextContent);
    }
    DYNAMIC_PARAMS_RE.lastIndex = 0;
    DYNAMIC_MODE_RE.lastIndex = 0;
  }
}

function prepareInPlaceBuild() {
  const tsconfigPath = join(ROOT, 'tsconfig.json');
  const nextEnvPath = join(ROOT, 'next-env.d.ts');
  const routeFiles = collectRouteFiles(join(ROOT, 'src', 'app'));
  inPlaceSnapshot = {
    tsconfigPath,
    tsconfig: readFileSync(tsconfigPath),
    nextEnvPath,
    nextEnv: readFileSync(nextEnvPath),
    routes: new Map(routeFiles.map((file) => [file, readFileSync(file)])),
  };
  patchBuildRoot(ROOT);
}

function restoreInPlaceBuild() {
  if (!inPlaceSnapshot) return;

  writeFileSync(inPlaceSnapshot.tsconfigPath, inPlaceSnapshot.tsconfig);
  writeFileSync(inPlaceSnapshot.nextEnvPath, inPlaceSnapshot.nextEnv);
  for (const [file, content] of inPlaceSnapshot.routes) {
    writeFileSync(file, content);
  }
  inPlaceSnapshot = null;
}

function normalizeRequiredServerFiles() {
  const manifestPath = join(BUILD_TEMP_ROOT, '.next', 'required-server-files.json');
  if (!existsSync(manifestPath)) return;

  const original = readFileSync(manifestPath, 'utf8');
  const normalized = `${JSON.stringify(
    normalizeWorkspacePath(JSON.parse(original), WORKSPACE_NORMALIZER_OPTIONS),
    null,
    2
  )}\n`;
  if (normalized.includes('.g5-next-build-work') || normalized.includes('g5-next-build')) {
    throw new Error('required-server-files.json still points at the temporary build workspace after normalization.');
  }
  if (normalized !== original) {
    writeFileSync(manifestPath, normalized);
  }
}

function toTracePath(value) {
  return value.replaceAll('\\', '/');
}

function isInsidePath(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function finalBuildPath(workspacePath) {
  return isInsidePath(BUILD_TEMP_ROOT, workspacePath)
    ? join(ROOT, relative(BUILD_TEMP_ROOT, workspacePath))
    : workspacePath;
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

function normalizeTraceEntry(manifestPath, entry) {
  const sourceManifestDir = dirname(manifestPath);
  const finalManifestDir = dirname(finalBuildPath(manifestPath));
  const sourcePath = resolve(sourceManifestDir, entry);
  const targetPath = finalBuildPath(sourcePath);
  return toTracePath(relative(finalManifestDir, targetPath) || '.');
}

function uniqueTraceEntries(entries) {
  return [...new Set(entries)].sort((left, right) => left.localeCompare(right));
}

function collectSharedRuntimeTraceFiles(normalizedManifests) {
  const sharedFiles = new Set();

  for (const manifestName of ['next-server.js.nft.json', 'next-minimal-server.js.nft.json']) {
    const manifestPath = join(BUILD_TEMP_ROOT, '.next', manifestName);
    const manifest = normalizedManifests.get(manifestPath);
    if (!manifest) continue;

    const finalManifestDir = dirname(finalBuildPath(manifestPath));
    for (const file of manifest.files ?? []) {
      const finalPath = resolve(finalManifestDir, file);
      const rootRelative = toTracePath(relative(ROOT, finalPath));
      if (SERVER_RUNTIME_TRACE_PACKAGE_RE.test(rootRelative)) {
        sharedFiles.add(finalPath);
      }
    }
  }

  return [...sharedFiles].sort((left, right) => left.localeCompare(right));
}

function normalizeNftManifests() {
  const manifestPaths = collectNftManifests(join(BUILD_TEMP_ROOT, '.next'));
  const normalizedManifests = new Map();

  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files = uniqueTraceEntries(
      (manifest.files ?? []).map((entry) => normalizeTraceEntry(manifestPath, entry))
    );
    normalizedManifests.set(manifestPath, manifest);
  }

  const sharedRuntimeFiles = collectSharedRuntimeTraceFiles(normalizedManifests);
  for (const [manifestPath, manifest] of normalizedManifests) {
    const finalManifestRelative = toTracePath(relative(ROOT, finalBuildPath(manifestPath)));
    if (finalManifestRelative.startsWith('.next/server/app/') && finalManifestRelative.endsWith('.nft.json')) {
      const finalManifestDir = dirname(finalBuildPath(manifestPath));
      manifest.files = uniqueTraceEntries([
        ...(manifest.files ?? []),
        ...sharedRuntimeFiles.map((file) => toTracePath(relative(finalManifestDir, file))),
      ]);
    }

    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  }
}

function copyGeneratedArtifact(source, target) {
  try {
    cpSync(source, target, { recursive: true, dereference: false });
  } catch (error) {
    if (process.platform !== 'win32' || error?.code !== 'EPERM') {
      throw error;
    }

    rmSync(target, { recursive: true, force: true });
    console.warn(
      `[build-next] Retrying ${relative(ROOT, target)} copy with dereferenced symlinks after Windows EPERM.`
    );
    cpSync(source, target, { recursive: true, dereference: true });
  }
}

function publishGeneratedArtifacts() {
  normalizeRequiredServerFiles();
  normalizeNftManifests();
  normalizeGeneratedWorkspaceReferences(join(BUILD_TEMP_ROOT, '.next'), WORKSPACE_NORMALIZER_OPTIONS);

  for (const artifact of GENERATED_ARTIFACTS) {
    const source = join(BUILD_TEMP_ROOT, artifact);
    if (!existsSync(source)) continue;

    const target = join(ROOT, artifact);
    rmSync(target, { recursive: true, force: true });
    copyGeneratedArtifact(source, target);
  }
}

function cleanupWorkspace() {
  if (cleaned) return;
  cleaned = true;
  restoreInPlaceBuild();
  rmSync(BUILD_TEMP_ROOT, { recursive: true, force: true });
}

function cleanupAndExit(reason, exitCode) {
  console.error(`[build-next] Interrupted by ${reason}; cleaning temporary build workspace.`);
  try {
    cleanupWorkspace();
  } finally {
    releaseBuildLock();
  }
  process.exit(exitCode);
}

process.once('SIGINT', () => cleanupAndExit('SIGINT', 130));
process.once('SIGTERM', () => cleanupAndExit('SIGTERM', 143));
process.once('uncaughtException', (error) => {
  console.error(error);
  cleanupAndExit('uncaughtException', 1);
});
process.once('unhandledRejection', (error) => {
  console.error(error);
  cleanupAndExit('unhandledRejection', 1);
});

try {
  acquireBuildLock();
  const buildRoot = VERCEL_SERVER_IN_PLACE_BUILD ? ROOT : BUILD_TEMP_ROOT;
  if (VERCEL_SERVER_IN_PLACE_BUILD) {
    prepareInPlaceBuild();
  } else {
    createBuildWorkspace();
    patchBuildRoot(BUILD_TEMP_ROOT);
  }

  console.log(
    `[build-next] G5_NEXT_RUNTIME=${SERVER_RUNTIME ? 'server' : 'static'}; ` +
      `G5_THEME_SOURCE=${THEME_SOURCE}; dynamicParams=${DESIRED_DYNAMIC_PARAMS}; ` +
      `dynamic=${DESIRED_DYNAMIC_MODE}; workspace=${buildRoot}; ` +
      `vercelInPlace=${VERCEL_SERVER_IN_PLACE_BUILD}`
  );

  if (PORTABLE_STATIC_BUILD) {
    console.log(
      `[build-next] portable static build: basePath=/__g5base__ public=${PORTABLE_SITE_URL} ` +
        `prerenderApi=${buildEnv().G5_API_INTERNAL_URL}`
    );
  }

  const result = spawnSync(process.execPath, [nextBin(), 'build'], {
    cwd: buildRoot,
    env: buildEnv(),
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[build-next] ${result.error.message}`);
  }

  const status = result.status ?? 1;
  if (status === 0 && !VERCEL_SERVER_IN_PLACE_BUILD) {
    publishGeneratedArtifacts();
  }
  process.exitCode = status;
} finally {
  try {
    cleanupWorkspace();
  } finally {
    releaseBuildLock();
  }
}
