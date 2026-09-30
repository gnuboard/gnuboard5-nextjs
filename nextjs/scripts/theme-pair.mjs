import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const nextRoot = resolve(scriptDir, '..');
export const repoRoot = resolve(nextRoot, '..');
loadLocalEnv(nextRoot);

export const DEFAULT_THEME_SOURCE = 'default';
export const DEFAULT_THEME_NAME = 'nextjs_default';
export const THEME_NAME_RE = /^[a-z][a-z0-9_-]{1,31}$/;
export const THEME_SOURCE_RE = THEME_NAME_RE;
export const REQUIRED_THEME_SOURCE_FILES = ['theme.config.ts', 'theme.css', 'components.tsx'];

const themeMapPath = resolve(nextRoot, 'theme-map.json');

function normalizeName(value, label) {
  const name = String(value ?? '').trim();
  if (!THEME_NAME_RE.test(name)) {
    throw new Error(
      `[theme-pair] Invalid ${label} "${value ?? ''}". ` +
        'Use 2-32 chars: a lowercase letter followed by [a-z0-9_-].'
    );
  }
  return name;
}

export function readThemeMap() {
  if (!existsSync(themeMapPath)) {
    return { themes: {} };
  }

  const parsed = JSON.parse(readFileSync(themeMapPath, 'utf8'));
  const themes = parsed && typeof parsed === 'object' && parsed.themes && typeof parsed.themes === 'object'
    ? parsed.themes
    : {};
  const normalized = {};

  for (const [themeName, config] of Object.entries(themes)) {
    const theme = normalizeName(themeName, 'theme name');
    const source = normalizeName(config?.source ?? themeName, `source for theme ${theme}`);
    normalized[theme] = { source };
  }

  return { themes: normalized };
}

export function sourceForTheme(themeName) {
  const theme = normalizeName(themeName, 'theme name');
  const mapped = readThemeMap().themes[theme]?.source;
  if (mapped) return mapped;
  return theme === DEFAULT_THEME_NAME ? DEFAULT_THEME_SOURCE : theme;
}

export function themeForSource(sourceName) {
  const source = normalizeName(sourceName, 'theme source');
  const entries = Object.entries(readThemeMap().themes);
  const mapped = entries.find(([, config]) => config.source === source)?.[0];
  if (mapped) return mapped;
  return source === DEFAULT_THEME_SOURCE ? DEFAULT_THEME_NAME : source;
}

export function resolveThemePair({ source, theme } = {}) {
  const explicitSource = source !== undefined && String(source).trim() !== '';
  const explicitTheme = theme !== undefined && String(theme).trim() !== '';
  const rawSource = explicitSource
    ? source
    : !explicitTheme
      ? process.env.G5_THEME_SOURCE ?? ''
      : '';
  const rawTheme = explicitTheme
    ? theme
    : !explicitSource
      ? process.env.G5_THEME_NAME ?? ''
      : '';

  if (rawSource && rawTheme) {
    return {
      source: normalizeName(rawSource, 'theme source'),
      theme: normalizeName(rawTheme, 'theme name'),
    };
  }

  if (rawSource) {
    const resolvedSource = normalizeName(rawSource, 'theme source');
    return {
      source: resolvedSource,
      theme: themeForSource(resolvedSource),
    };
  }

  if (rawTheme) {
    const resolvedTheme = normalizeName(rawTheme, 'theme name');
    return {
      source: sourceForTheme(resolvedTheme),
      theme: resolvedTheme,
    };
  }

  return {
    source: DEFAULT_THEME_SOURCE,
    theme: DEFAULT_THEME_NAME,
  };
}

export function configuredThemePairs() {
  return Object.entries(readThemeMap().themes).map(([theme, config]) => ({
    source: config.source,
    theme,
  }));
}

export function allThemePairs() {
  const pairs = configuredThemePairs();
  if (pairs.length > 0) return pairs;

  return [
    {
      source: DEFAULT_THEME_SOURCE,
      theme: DEFAULT_THEME_NAME,
    },
  ];
}

export function resolveThemeSourceName() {
  return resolveThemePair().source;
}

export function resolveThemeName() {
  return resolveThemePair().theme;
}

export function themeSourceDir(source = resolveThemeSourceName()) {
  return resolve(nextRoot, 'themes', source);
}

export function assertThemeSource(source = resolveThemeSourceName()) {
  const dir = themeSourceDir(source);
  if (!existsSync(dir)) {
    throw new Error(`[theme-source] Missing nextjs/themes/${source}. Run npm run create-theme-source first.`);
  }

  for (const file of REQUIRED_THEME_SOURCE_FILES) {
    if (!existsSync(resolve(dir, file))) {
      throw new Error(`[theme-source] Missing nextjs/themes/${source}/${file}.`);
    }
  }

  return source;
}
