import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_THEME_NAME,
  DEFAULT_THEME_SOURCE,
  THEME_NAME_RE,
  THEME_SOURCE_RE,
  nextRoot,
} from './theme-pair.mjs';

export const themeManifestPath = resolve(nextRoot, 'theme-manifest.json');
export const themeMapPath = resolve(nextRoot, 'theme-map.json');
export const vercelThemeMapPath = resolve(nextRoot, 'vercel-theme-map.json');

function normalizeName(value, label, pattern) {
  const name = String(value ?? '').trim();
  if (!pattern.test(name)) {
    throw new Error(
      `[theme-manifest] Invalid ${label} "${value ?? ''}". ` +
        'Use 2-32 chars: a lowercase letter followed by [a-z0-9_-].'
    );
  }
  return name;
}

function normalizeDevPort(value, index) {
  const port = Number(value ?? 3001 + index);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[theme-manifest] Invalid devPort "${value ?? ''}".`);
  }
  return port;
}

function defaultAppUrlForSource(source) {
  return `https://gnuboard5-nextjs-${source}.vercel.app`;
}

function nextAvailableDevPort(themes) {
  const used = new Set(themes.map((theme) => theme.vercel?.devPort).filter(Boolean));
  let port = 3001;
  while (used.has(port)) port += 1;
  return port;
}

function defaultManifest() {
  return {
    themes: [
      {
        source: DEFAULT_THEME_SOURCE,
        theme: DEFAULT_THEME_NAME,
        installable: true,
        publicPackage: true,
        vercel: {
          devPort: 3001,
          appUrl: '',
        },
      },
    ],
  };
}

function normalizeManifestEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`[theme-manifest] themes[${index}] must be an object.`);
  }

  if (typeof entry.installable !== 'boolean') {
    throw new Error(`[theme-manifest] themes[${index}].installable must be an explicit boolean.`);
  }

  if (typeof entry.publicPackage !== 'boolean') {
    throw new Error(`[theme-manifest] themes[${index}].publicPackage must be an explicit boolean.`);
  }

  const source = normalizeName(entry.source, `themes[${index}].source`, THEME_SOURCE_RE);
  const theme = normalizeName(entry.theme ?? source, `themes[${index}].theme`, THEME_NAME_RE);
  const vercel = entry.vercel === false ? false : {
    devPort: normalizeDevPort(entry.vercel?.devPort, index),
    appUrl: String(entry.vercel?.appUrl ?? '').trim(),
  };

  // UI 스모크(pages/a11y/mobile)를 이 테마의 개발 서버에도 돌릴지. 기본은 켬 — 게시판·상점
  // 경로가 없는 테마(문서 사이트 등)만 false 로 뺀다. playwright.config.ts 가 이 값으로 프로젝트를 만든다.
  if (entry.uiSmoke !== undefined && typeof entry.uiSmoke !== 'boolean') {
    throw new Error(`[theme-manifest] themes[${index}].uiSmoke must be a boolean when present.`);
  }

  return {
    source,
    theme,
    installable: entry.installable,
    publicPackage: entry.publicPackage,
    uiSmoke: entry.uiSmoke !== false,
    vercel,
  };
}

export function readThemeManifest() {
  const parsed = existsSync(themeManifestPath)
    ? JSON.parse(readFileSync(themeManifestPath, 'utf8'))
    : defaultManifest();
  const rawThemes = Array.isArray(parsed?.themes) ? parsed.themes : [];
  if (rawThemes.length === 0) {
    throw new Error('[theme-manifest] theme-manifest.json must contain a non-empty themes array.');
  }

  const seenVercelSources = new Set();
  const seenThemes = new Set();
  const seenPorts = new Set();
  const themes = rawThemes.map((entry, index) => {
    const normalized = normalizeManifestEntry(entry, index);
    if (seenThemes.has(normalized.theme)) {
      throw new Error(`[theme-manifest] Duplicate theme name ${normalized.theme}.`);
    }
    if (normalized.vercel && seenVercelSources.has(normalized.source)) {
      throw new Error(`[theme-manifest] Duplicate Vercel theme source ${normalized.source}.`);
    }
    if (normalized.vercel && seenPorts.has(normalized.vercel.devPort)) {
      throw new Error(`[theme-manifest] Duplicate Vercel devPort ${normalized.vercel.devPort}.`);
    }
    seenThemes.add(normalized.theme);
    if (normalized.vercel) {
      seenVercelSources.add(normalized.source);
      seenPorts.add(normalized.vercel.devPort);
    }
    return normalized;
  });

  return { themes };
}

export function writeThemeManifest(manifest) {
  const normalized = readThemeManifestFromValue(manifest);
  writeFileSync(themeManifestPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function readThemeManifestFromValue(value) {
  const rawThemes = Array.isArray(value?.themes) ? value.themes : [];
  if (rawThemes.length === 0) {
    throw new Error('[theme-manifest] theme-manifest.json must contain a non-empty themes array.');
  }

  const seenVercelSources = new Set();
  const seenThemes = new Set();
  const seenPorts = new Set();
  const themes = rawThemes.map((entry, index) => {
    const normalized = normalizeManifestEntry(entry, index);
    if (seenThemes.has(normalized.theme)) {
      throw new Error(`[theme-manifest] Duplicate theme name ${normalized.theme}.`);
    }
    if (normalized.vercel && seenVercelSources.has(normalized.source)) {
      throw new Error(`[theme-manifest] Duplicate Vercel theme source ${normalized.source}.`);
    }
    if (normalized.vercel && seenPorts.has(normalized.vercel.devPort)) {
      throw new Error(`[theme-manifest] Duplicate Vercel devPort ${normalized.vercel.devPort}.`);
    }
    seenThemes.add(normalized.theme);
    if (normalized.vercel) {
      seenVercelSources.add(normalized.source);
      seenPorts.add(normalized.vercel.devPort);
    }
    return normalized;
  });

  return { themes };
}

export function previewThemeManifestEntry({
  source,
  theme,
  installable = true,
  publicPackage = false,
  vercel = {},
} = {}) {
  const current = readThemeManifest();
  const normalizedSource = normalizeName(source, 'theme source', THEME_SOURCE_RE);
  const normalizedTheme = normalizeName(theme ?? source, 'theme name', THEME_NAME_RE);
  const existing = current.themes.find((entry) => entry.theme === normalizedTheme);
  const wantsVercel = vercel !== false;

  return normalizeManifestEntry(
    {
      source: normalizedSource,
      theme: normalizedTheme,
      installable: typeof existing?.installable === 'boolean' ? existing.installable : installable,
      publicPackage: typeof existing?.publicPackage === 'boolean' ? existing.publicPackage : publicPackage,
      vercel: wantsVercel
        ? {
            devPort:
              vercel?.devPort === undefined || vercel?.devPort === ''
                ? existing?.vercel?.devPort ?? nextAvailableDevPort(current.themes)
                : vercel.devPort,
            appUrl: String(vercel?.appUrl ?? '').trim()
              || existing?.vercel?.appUrl
              || defaultAppUrlForSource(normalizedSource),
          }
        : false,
    },
    current.themes.length
  );
}

export function upsertThemeManifestEntry(options = {}) {
  const current = readThemeManifest();
  const entry = previewThemeManifestEntry(options);
  const themes = [...current.themes];
  const existingIndex = themes.findIndex((item) => item.theme === entry.theme);

  if (existingIndex >= 0) {
    themes[existingIndex] = entry;
  } else {
    themes.push(entry);
  }

  const manifest = writeThemeManifest({ themes });
  writeThemeMapsFromManifest(manifest);
  return entry;
}

export function mapsFromThemeManifest(manifest = readThemeManifest()) {
  const installThemes = {};
  const vercelThemes = [];

  for (const entry of manifest.themes) {
    if (entry.installable) {
      installThemes[entry.theme] = { source: entry.source };
    }

    if (entry.vercel) {
      vercelThemes.push({
        source: entry.source,
        theme: entry.theme,
        devPort: entry.vercel.devPort,
        appUrl: entry.vercel.appUrl,
        uiSmoke: entry.uiSmoke,
      });
    }
  }

  return {
    themeMap: {
      generatedFrom: 'theme-manifest.json',
      edit: 'Do not edit this generated file directly. Update theme-manifest.json and run npm run generate:theme-maps.',
      themes: installThemes,
    },
    vercelThemeMap: {
      generatedFrom: 'theme-manifest.json',
      edit: 'Do not edit this generated file directly. Update theme-manifest.json and run npm run generate:theme-maps.',
      themes: vercelThemes,
    },
  };
}

export function writeThemeMapsFromManifest(manifest = readThemeManifest()) {
  const { themeMap, vercelThemeMap } = mapsFromThemeManifest(manifest);
  writeFileSync(themeMapPath, `${JSON.stringify(themeMap, null, 2)}\n`);
  writeFileSync(vercelThemeMapPath, `${JSON.stringify(vercelThemeMap, null, 2)}\n`);
}
