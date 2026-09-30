import { cpSync, existsSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertThemeSource, themeSourceDir } from './theme-source-name.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const activeThemeSourceDir = resolve(nextRoot, 'themes', '.active');

function currentLinkTarget() {
  try {
    return resolve(readlinkSync(activeThemeSourceDir));
  } catch {
    return '';
  }
}

export function activateThemeSource({ quiet = false } = {}) {
  const source = assertThemeSource();
  const sourceDir = themeSourceDir(source);

  if (existsSync(activeThemeSourceDir) && currentLinkTarget() === sourceDir) {
    if (!quiet) {
      console.log(`[activate-theme-source] nextjs/themes/.active -> nextjs/themes/${source}`);
    }
    return { activeThemeSourceDir, mode: 'link', source, sourceDir };
  }

  rmSync(activeThemeSourceDir, { recursive: true, force: true });

  let mode = 'link';
  try {
    symlinkSync(sourceDir, activeThemeSourceDir, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    mode = 'copy';
    cpSync(sourceDir, activeThemeSourceDir, { recursive: true });
  }

  if (!quiet) {
    console.log(
      `[activate-theme-source] nextjs/themes/.active -> nextjs/themes/${source}` +
        (mode === 'copy' ? ' (copied fallback)' : '')
    );
  }

  return { activeThemeSourceDir, mode, source, sourceDir };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  activateThemeSource({ quiet: process.argv.includes('--quiet') });
}
