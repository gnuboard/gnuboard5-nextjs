import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_NAME } from './theme-name.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const outDir = join(nextRoot, 'out');
const themeRootDir = join(repoRoot, 'theme', THEME_NAME);
const themeAppDir = join(themeRootDir, 'app');
const parentDir = dirname(themeAppDir);
const tempDir = join(parentDir, `.app.tmp-${process.pid}-${Date.now()}`);
const backupDir = join(parentDir, `.app.backup-${process.pid}-${Date.now()}`);

function assertInside(parentPath, targetPath, label) {
  const parent = resolve(parentPath);
  const target = resolve(targetPath);
  const pathFromParent = relative(parent, target);

  if (
    pathFromParent === '' ||
    pathFromParent === '..' ||
    pathFromParent.startsWith(`..${sep}`) ||
    isAbsolute(pathFromParent)
  ) {
    throw new Error(`[sync-static-theme] Refusing to operate outside ${parent}: ${label}=${target}`);
  }
}

function runRobocopyMirror(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });

  const result = spawnSync(
    'robocopy',
    [sourceDir, targetDir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'],
    { encoding: 'utf8' },
  );

  if (result.error) {
    throw result.error;
  }

  // Robocopy uses 0-3 for successful copy states.
  if (result.status > 3) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`[sync-static-theme] robocopy failed with exit code ${result.status}${detail ? `\n${detail}` : ''}`);
  }
}

function alignDestinationCasing(sourceDir, targetDir) {
  if (!existsSync(sourceDir) || !existsSync(targetDir)) {
    return;
  }

  const targetEntries = readdirSync(targetDir, { withFileTypes: true });
  const targetNameByLowercase = new Map(
    targetEntries.map((entry) => [entry.name.toLocaleLowerCase('en-US'), entry.name]),
  );

  for (const sourceEntry of readdirSync(sourceDir, { withFileTypes: true })) {
    const existingName = targetNameByLowercase.get(sourceEntry.name.toLocaleLowerCase('en-US'));

    if (!existingName) {
      continue;
    }

    let destinationPath = join(targetDir, existingName);
    const desiredPath = join(targetDir, sourceEntry.name);

    if (existingName !== sourceEntry.name) {
      const caseFixPath = join(
        targetDir,
        `.casefix-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      );

      renameSync(destinationPath, caseFixPath);
      renameSync(caseFixPath, desiredPath);
      destinationPath = desiredPath;
    }

    if (sourceEntry.isDirectory()) {
      alignDestinationCasing(join(sourceDir, sourceEntry.name), destinationPath);
    }
  }
}

function syncInPlace(sourceDir, targetDir) {
  assertInside(parentDir, targetDir, 'targetDir');

  if (process.platform === 'win32') {
    runRobocopyMirror(sourceDir, targetDir);
    alignDestinationCasing(sourceDir, targetDir);
    return;
  }

  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

function copyOutToTemp() {
  if (process.platform === 'win32') {
    runRobocopyMirror(outDir, tempDir);
    alignDestinationCasing(outDir, tempDir);
    return;
  }

  cpSync(outDir, tempDir, { recursive: true });
}

assertInside(nextRoot, outDir, 'outDir');
assertInside(join(repoRoot, 'theme'), themeAppDir, 'themeAppDir');
assertInside(parentDir, tempDir, 'tempDir');
assertInside(parentDir, backupDir, 'backupDir');

if (!existsSync(outDir)) {
  console.error('[sync-static-theme] Missing nextjs/out. Run `npm run build` first.');
  process.exit(1);
}

mkdirSync(parentDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
rmSync(backupDir, { recursive: true, force: true });

let backedUp = false;
let restoreError = null;
let restoreAttempted = false;

function restorePartialSync() {
  if (restoreAttempted) return;
  restoreAttempted = true;

  rmSync(tempDir, { recursive: true, force: true });

  if (backedUp && !existsSync(themeAppDir) && existsSync(backupDir)) {
    renameSync(backupDir, themeAppDir);
    return;
  }

  if (existsSync(themeAppDir) && existsSync(backupDir)) {
    rmSync(backupDir, { recursive: true, force: true });
  }
}

function exitAfterSignal(signal) {
  console.error(`[sync-static-theme] Interrupted by ${signal}; restoring static theme output.`);
  try {
    restorePartialSync();
  } catch (error) {
    console.error('[sync-static-theme] Failed to restore after interruption.');
    console.error(error);
  }
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.once('SIGINT', () => exitAfterSignal('SIGINT'));
process.once('SIGTERM', () => exitAfterSignal('SIGTERM'));

try {
  copyOutToTemp();

  if (existsSync(themeAppDir)) {
    renameSync(themeAppDir, backupDir);
    backedUp = true;
  }

  renameSync(tempDir, themeAppDir);
  rmSync(backupDir, { recursive: true, force: true });

  console.log(`[sync-static-theme] Synced ${outDir} -> ${themeAppDir}`);
} catch (atomicError) {
  try {
    restorePartialSync();
  } catch (error) {
    restoreError = error;
  }

  try {
    syncInPlace(outDir, themeAppDir);
    rmSync(backupDir, { recursive: true, force: true });
    console.log(`[sync-static-theme] Synced ${outDir} -> ${themeAppDir} (in-place fallback)`);
  } catch (fallbackError) {
    console.error('[sync-static-theme] Failed to sync static theme.');
    console.error('[sync-static-theme] Atomic replace error:');
    console.error(atomicError);
    if (restoreError) {
      console.error('[sync-static-theme] Backup restore error:');
      console.error(restoreError);
    }
    console.error('[sync-static-theme] In-place fallback error:');
    console.error(fallbackError);
    process.exit(1);
  }
}
