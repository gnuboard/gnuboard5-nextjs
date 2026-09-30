import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_THEME_NAME,
  DEFAULT_THEME_SOURCE,
  THEME_NAME_RE,
  THEME_SOURCE_RE,
  nextRoot,
} from './theme-pair.mjs';

export const vercelThemeMapPath = resolve(nextRoot, 'vercel-theme-map.json');

function normalizeName(value, label, pattern) {
  const name = String(value ?? '').trim();
  if (!pattern.test(name)) {
    throw new Error(
      `[vercel-theme-pair] Invalid ${label} "${value ?? ''}". ` +
        'Use 2-32 chars: a lowercase letter followed by [a-z0-9_-].'
    );
  }
  return name;
}

function normalizeDevPort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[vercel-theme-pair] Invalid devPort "${value ?? ''}". Use a TCP port from 1 to 65535.`);
  }
  return port;
}

function defaultAppUrlForSource(source) {
  return `https://gnuboard5-nextjs-${source}.vercel.app`;
}

function normalizeThemeEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`[vercel-theme-pair] themes[${index}] must be an object.`);
  }

  const source = normalizeName(entry.source, `themes[${index}].source`, THEME_SOURCE_RE);
  const theme = normalizeName(entry.theme ?? entry.name ?? source, `themes[${index}].theme`, THEME_NAME_RE);
  const devPort = normalizeDevPort(entry.devPort, 3001 + index);
  const appUrl = String(entry.appUrl ?? '').trim();
  const uiSmoke = entry.uiSmoke !== false;

  return { source, theme, devPort, appUrl, uiSmoke };
}

export function readVercelThemeMap() {
  if (!existsSync(vercelThemeMapPath)) {
    return {
      themes: [
        {
          source: DEFAULT_THEME_SOURCE,
          theme: DEFAULT_THEME_NAME,
          devPort: 3001,
          appUrl: '',
        },
      ],
    };
  }

  const parsed = JSON.parse(readFileSync(vercelThemeMapPath, 'utf8'));
  const rawThemes = Array.isArray(parsed?.themes) ? parsed.themes : [];
  if (rawThemes.length === 0) {
    throw new Error('[vercel-theme-pair] vercel-theme-map.json must contain a non-empty themes array.');
  }

  const seen = new Set();
  const sources = new Set();
  const themeNames = new Set();
  const ports = new Set();
  const themes = rawThemes.map((entry, index) => {
    const normalized = normalizeThemeEntry(entry, index);
    const key = `${normalized.source}:${normalized.theme}`;
    if (seen.has(key)) {
      throw new Error(`[vercel-theme-pair] Duplicate Vercel theme pair ${key}.`);
    }
    if (sources.has(normalized.source)) {
      throw new Error(`[vercel-theme-pair] Duplicate Vercel theme source ${normalized.source}.`);
    }
    if (themeNames.has(normalized.theme)) {
      throw new Error(`[vercel-theme-pair] Duplicate Vercel theme name ${normalized.theme}.`);
    }
    if (ports.has(normalized.devPort)) {
      throw new Error(`[vercel-theme-pair] Duplicate devPort ${normalized.devPort}.`);
    }
    seen.add(key);
    sources.add(normalized.source);
    themeNames.add(normalized.theme);
    ports.add(normalized.devPort);
    return normalized;
  });

  return { themes };
}

export function allVercelThemePairs() {
  return readVercelThemeMap().themes;
}

function nextAvailableDevPort(themes) {
  const used = new Set(themes.map((theme) => theme.devPort));
  let port = 3001;
  while (used.has(port)) port += 1;
  return port;
}

export function previewVercelThemePair({ source, theme, devPort, appUrl } = {}) {
  const currentThemes = readVercelThemeMap().themes;
  const normalizedSource = normalizeName(source, 'theme source', THEME_SOURCE_RE);
  const normalizedTheme = normalizeName(theme ?? source, 'theme name', THEME_NAME_RE);
  const existing = currentThemes.find(
    (entry) => entry.source === normalizedSource || entry.theme === normalizedTheme
  );
  const configuredAppUrl = String(appUrl ?? '').trim();

  return {
    source: normalizedSource,
    theme: normalizedTheme,
    devPort: devPort === undefined || devPort === ''
      ? existing?.devPort ?? nextAvailableDevPort(currentThemes)
      : normalizeDevPort(devPort),
    appUrl: configuredAppUrl || existing?.appUrl || defaultAppUrlForSource(normalizedSource),
  };
}

export function upsertVercelThemePair(options = {}) {
  const currentThemes = readVercelThemeMap().themes;
  const pair = previewVercelThemePair(options);
  const nextThemes = [...currentThemes];
  const existingIndex = nextThemes.findIndex(
    (entry) => entry.source === pair.source || entry.theme === pair.theme
  );

  if (existingIndex >= 0) {
    nextThemes[existingIndex] = pair;
  } else {
    nextThemes.push(pair);
  }

  const normalized = {
    themes: nextThemes.map((entry, index) => normalizeThemeEntry(entry, index)),
  };
  const sources = new Set();
  const themeNames = new Set();
  const ports = new Set();
  for (const entry of normalized.themes) {
    if (sources.has(entry.source)) {
      throw new Error(`[vercel-theme-pair] Duplicate Vercel theme source ${entry.source}.`);
    }
    if (themeNames.has(entry.theme)) {
      throw new Error(`[vercel-theme-pair] Duplicate Vercel theme name ${entry.theme}.`);
    }
    if (ports.has(entry.devPort)) {
      throw new Error(`[vercel-theme-pair] Duplicate devPort ${entry.devPort}.`);
    }
    sources.add(entry.source);
    themeNames.add(entry.theme);
    ports.add(entry.devPort);
  }

  writeFileSync(vercelThemeMapPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return pair;
}
