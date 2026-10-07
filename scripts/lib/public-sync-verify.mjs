import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPublicPackageThemeMaps, publicInstallThemeName } from './public-theme-manifest.mjs';

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`);
  }
}

function assertPath(path, label = path) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function assertTextIncludes(path, token, label = token) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes(token)) {
    throw new Error(`${path} is missing ${label}`);
  }
}

function assertTextExcludes(path, pattern, label = String(pattern)) {
  const text = readFileSync(path, 'utf8');
  if (pattern.test(text)) {
    throw new Error(`${path} still contains ${label}`);
  }
}

export function verifySyncedPublicNextjsTree(repoRoot) {
  const nextjsRoot = join(repoRoot, 'nextjs');
  const themeManifest = readJson(join(nextjsRoot, 'theme-manifest.json'), 'nextjs/theme-manifest.json');
  const themeMap = readJson(join(nextjsRoot, 'theme-map.json'), 'nextjs/theme-map.json');
  const nextPackageJson = readJson(join(nextjsRoot, 'package.json'), 'nextjs/package.json');

  assertPublicPackageThemeMaps(themeManifest, themeMap);
  const publicTheme = publicInstallThemeName(themeManifest);

  // 기본 테마는 overlay/ 에 있어 theme/ 으로 넣지 않는다. --if-present 는 create-theme 로 만든 내 테마(theme/<이름>)가
  // 있을 때만 그 app/ 에 넣으므로 기본 테마 꾸러미는 그대로 안전하다.
  const packageSafeBuildTheme = ['npm run build', 'npm run build && node scripts/sync-static-theme.mjs --if-present'];
  if (!packageSafeBuildTheme.includes(nextPackageJson.scripts?.['build:theme'])) {
    throw new Error('nextjs/package.json build:theme must stay package-safe and avoid syncing theme/app');
  }
  if (!nextPackageJson.scripts?.['check:release:vercel:strict']) {
    throw new Error('nextjs/package.json must keep the strict Vercel release gate script');
  }

  assertPath(join(nextjsRoot, 'vercel.json'), 'sanitized Vercel config');
  assertPath(join(nextjsRoot, '.env.vercel.example'), 'Vercel env example');
  if (existsSync(join(nextjsRoot, 'vercel.mjs')) || existsSync(join(nextjsRoot, 'vercel.base.json'))) {
    throw new Error('public nextjs tree must not ship source-only generated Vercel config files');
  }

  assertTextIncludes(
    join(nextjsRoot, 'scripts', 'check-design-system.mjs'),
    "join(repoRoot, 'overlay', 'theme', theme)",
    'overlay theme check path'
  );
  assertTextIncludes(
    join(nextjsRoot, 'scripts', 'lib', 'source-file-size.mjs'),
    'join(root, "..", "overlay", "api")',
    'overlay API file-size path'
  );
  assertTextIncludes(
    join(nextjsRoot, 'scripts', 'lib', 'source-file-size.mjs'),
    `join(root, "..", "overlay", "theme", "${publicTheme}", "bridge")`,
    'overlay theme bridge file-size path'
  );
  assertTextExcludes(
    join(nextjsRoot, 'README.md'),
    /nextjs\.thisgun\.net|127\.0\.0\.(?:9|20)/i,
    'private source host'
  );
  assertTextExcludes(
    join(repoRoot, 'overlay', 'api', 'index.php'),
    /nextjs\.thisgun\.net|127\.0\.0\.(?:9|20)/i,
    'private source host'
  );
}
