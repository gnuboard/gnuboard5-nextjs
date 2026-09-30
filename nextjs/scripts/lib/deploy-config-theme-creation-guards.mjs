import { existsSync, readFileSync } from 'node:fs';

export function checkThemeCreationScripts({ createThemeSourcePath, createThemePath, fail }) {
  if (!existsSync(createThemeSourcePath)) {
    fail('scripts/create-theme-source.mjs is missing');
    return;
  }

  const createThemeSource = readFileSync(createThemeSourcePath, 'utf8');
  for (const token of [
    'previewThemeManifestEntry',
    'upsertThemeManifestEntry',
    'installable: true',
    'publicPackage: false',
    'skip-vercel-preview',
    'vercel-app-url',
    'vercel-dev-port',
  ]) {
    if (!createThemeSource.includes(token)) {
      fail(`create-theme-source.mjs is missing manifest-backed theme creation token ${token}`);
    }
  }

  if (!existsSync(createThemePath)) {
    fail('scripts/create-theme.mjs is missing');
    return;
  }

  const createTheme = readFileSync(createThemePath, 'utf8');
  for (const token of ['--skip-vercel-preview', '--vercel-app-url', '--vercel-dev-port', 'upsertThemeManifestEntry']) {
    if (!createTheme.includes(token)) {
      fail(`create-theme.mjs must keep manifest-backed theme creation token ${token}`);
    }
  }
}
