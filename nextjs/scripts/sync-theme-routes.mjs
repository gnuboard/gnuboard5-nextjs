import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  THEME_NAME_RE,
  configuredThemePairs,
  nextRoot,
  repoRoot,
  resolveThemePair,
  sourceForTheme,
} from './theme-pair.mjs';

const args = process.argv.slice(2);

function fail(message) {
  console.error(`[sync-theme-routes] ${message}`);
  process.exit(1);
}

function optionValue(name) {
  const longName = `--${name}`;
  const index = args.indexOf(longName);
  if (index >= 0) return args[index + 1] ?? '';

  const prefix = `${longName}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

function formatJsonFile(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  return `${JSON.stringify(value, null, 2)}\n`;
}

function pairForCurrentEnv() {
  try {
    return resolveThemePair({
      source: optionValue('source') || undefined,
      theme: optionValue('theme') || optionValue('name') || undefined,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function allRoutePairs() {
  const themeRoot = join(repoRoot, 'theme');
  if (!existsSync(themeRoot)) return [];

  const pairs = [];
  const seen = new Set();

  function pushPair(pair) {
    const key = `${pair.source}->${pair.theme}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(pair);
    }
  }

  for (const pair of configuredThemePairs()) {
    pushPair(pair);
  }

  for (const entry of readdirSync(themeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !THEME_NAME_RE.test(entry.name)) continue;

    const canonical = join(themeRoot, entry.name, 'theme.routes.json');
    if (!existsSync(canonical)) continue;

    pushPair({ source: sourceForTheme(entry.name), theme: entry.name });
  }

  return pairs;
}

function syncPair({ source, theme }, { checkOnly }) {
  const canonical = join(repoRoot, 'theme', theme, 'theme.routes.json');
  const mirrorDir = join(nextRoot, 'themes', source);
  const mirror = join(mirrorDir, 'theme.routes.json');

  if (!existsSync(canonical)) {
    console.log(`[sync-theme-routes] skip ${source}->${theme}: no theme/${theme}/theme.routes.json`);
    return true;
  }

  if (!existsSync(mirrorDir)) {
    fail(`Missing nextjs/themes/${source}.`);
  }

  const canonicalJson = formatJsonFile(canonical);
  const mirrorJson = existsSync(mirror) ? formatJsonFile(mirror) : '';
  const inSync = canonicalJson === mirrorJson;

  if (checkOnly) {
    if (!inSync) {
      console.error(`[sync-theme-routes] stale ${mirror}; run npm run sync:theme-routes`);
      return false;
    }
    console.log(`[sync-theme-routes] ok ${source}->${theme}`);
    return true;
  }

  if (!inSync) {
    writeFileSync(mirror, canonicalJson);
    console.log(`[sync-theme-routes] wrote nextjs/themes/${source}/theme.routes.json from theme/${theme}/theme.routes.json`);
  } else {
    console.log(`[sync-theme-routes] ok ${source}->${theme}`);
  }

  return true;
}

const checkOnly = args.includes('--check');
const pairs = args.includes('--all') ? allRoutePairs() : [pairForCurrentEnv()];

let ok = true;
for (const pair of pairs) {
  ok = syncPair(pair, { checkOnly }) && ok;
}

if (!ok) {
  process.exit(1);
}
