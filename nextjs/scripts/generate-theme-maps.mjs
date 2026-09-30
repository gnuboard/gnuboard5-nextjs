import { readFileSync } from 'node:fs';
import {
  mapsFromThemeManifest,
  readThemeManifest,
  themeMapPath,
  vercelThemeMapPath,
  writeThemeMapsFromManifest,
} from './theme-manifest.mjs';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const check = args.has('--check') || !write;

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertSame(path, actual, expected) {
  const actualText = stableJson(actual);
  const expectedText = stableJson(expected);
  if (actualText !== expectedText) {
    console.error(`[generate-theme-maps] ${path} is out of sync with theme-manifest.json.`);
    console.error('[generate-theme-maps] Do not edit generated map files directly.');
    console.error('[generate-theme-maps] Update theme-manifest.json, then run npm run generate:theme-maps.');
    process.exit(1);
  }
}

const manifest = readThemeManifest();

if (write) {
  writeThemeMapsFromManifest(manifest);
  console.log('[generate-theme-maps] wrote generated theme-map.json and vercel-theme-map.json from theme-manifest.json');
  process.exit(0);
}

if (check) {
  const generated = mapsFromThemeManifest(manifest);
  assertSame(themeMapPath, readJson(themeMapPath), generated.themeMap);
  assertSame(vercelThemeMapPath, readJson(vercelThemeMapPath), generated.vercelThemeMap);
  console.log('[generate-theme-maps] theme maps are in sync');
}
