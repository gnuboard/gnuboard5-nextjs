import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_NAME } from './theme-name.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const themeDir = join(repoRoot, 'theme', THEME_NAME);
const overlayThemeDir = join(repoRoot, 'overlay', 'theme', THEME_NAME);
const publicPackageMarker = join(repoRoot, 'overlay');

function fail(message) {
  console.error(`[check-install-theme-package-context] ${message}`);
  process.exit(1);
}

function rel(path) {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

if (existsSync(themeDir)) {
  process.exit(0);
}

if (existsSync(publicPackageMarker)) {
  const overlayHint = existsSync(overlayThemeDir)
    ? `This checkout has ${rel(overlayThemeDir)}, but nextjs/package:* commands expect generated source theme output under ${rel(themeDir)}.`
    : `This checkout does not include ${rel(themeDir)}.`;

  fail(
    `${overlayHint} Use the public package root \`npm run package\` command instead, or use ` +
      '`npm run build:vercel:<theme>` for Vercel-only theme builds.'
  );
}

fail(
  `Missing ${rel(themeDir)}. Run this command from the full Gnuboard source checkout ` +
    'after building the selected theme.'
);
