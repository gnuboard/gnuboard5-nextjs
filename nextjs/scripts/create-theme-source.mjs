/**
 * Scaffold editable Next.js theme source under nextjs/themes/<name>.
 *
 *   npm run create-theme-source -- -- --name myshop [--theme-name myshop] [--label "My Shop"] [--from default] [--dry-run] [--force] [--persist]
 *
 * G5_THEME_SOURCE selects this source at build/dev time.
 * G5_THEME_NAME still selects the Gnuboard output folder under theme/<name>/app.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activateThemeSource } from './activate-theme-source.mjs';
import { THEME_NAME_RE, THEME_SOURCE_RE } from './theme-pair.mjs';
import { previewThemeManifestEntry, upsertThemeManifestEntry } from './theme-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const themesRoot = join(nextRoot, 'themes');

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : fallback;
};

const name = getOpt('name').trim();
const themeName = (getOpt('theme-name', name) || name).trim();
const from = (getOpt('from', 'default') || 'default').trim();
const label = getOpt('label').trim();
const dryRun = hasFlag('dry-run');
const force = hasFlag('force');
const persist = hasFlag('persist');
const skipVercelPreview = hasFlag('skip-vercel-preview');
const vercelAppUrl = getOpt('vercel-app-url').trim();
const vercelDevPort = getOpt('vercel-dev-port').trim();

function die(message) {
  console.error(`[create-theme-source] ${message}`);
  process.exit(1);
}

function escapeTsString(value) {
  return JSON.stringify(value);
}

function themeLabel() {
  return label || `${name} theme source`;
}

function writeEnvLocal() {
  const envPath = join(nextRoot, '.env.local');
  const line = `G5_THEME_SOURCE=${name}`;
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${line}\n`);
    return;
  }
  const kept = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*G5_THEME_SOURCE\s*=/.test(l));
  const body = kept.join('\n').replace(/\n+$/, '');
  writeFileSync(envPath, `${body ? body + '\n' : ''}${line}\n`);
}

function rewriteConfig() {
  const configPath = join(destThemeSource, 'theme.config.ts');
  if (!existsSync(configPath)) return;

  const content = readFileSync(configPath, 'utf8');
  const next = content
    .replace(/name:\s*"[^"]*"/, `name: ${escapeTsString(name)}`)
    .replace(/label:\s*"[^"]*"/, `label: ${escapeTsString(themeLabel())}`);

  writeFileSync(configPath, next);
}

// 테마 CSS 는 body[data-g5-theme-source="<소스 이름>"] 아래로 묶여 있다(src/app/layout.tsx 가 theme.config.ts 의
// name 을 그 속성에 넣는다). 이름을 바꿔 복사하면 그 묶음도 새 이름으로 바꿔야 디자인이 붙는다 — 안 바꾸면 새 테마는
// 테마 CSS 가 하나도 걸리지 않은 맨 화면이 된다.
const SCOPED_EXT = /\.(?:css|ts|tsx|js|mjs)$/i;

function rescopeThemeSelectors(dir) {
  let changed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      changed += rescopeThemeSelectors(abs);
      continue;
    }
    if (!entry.isFile() || !SCOPED_EXT.test(entry.name)) continue;
    const content = readFileSync(abs, 'utf8');
    const next = content
      .split(`data-g5-theme-source="${from}"`).join(`data-g5-theme-source="${name}"`)
      .split(`data-g5-theme-source='${from}'`).join(`data-g5-theme-source='${name}'`);
    if (next !== content) {
      writeFileSync(abs, next);
      changed += 1;
    }
  }
  return changed;
}

function resolveVercelPreviewPair() {
  try {
    const entry = previewThemeManifestEntry({
      source: name,
      theme: themeName,
      installable: true,
      publicPackage: false,
      vercel: skipVercelPreview
        ? false
        : {
            appUrl: vercelAppUrl,
            devPort: vercelDevPort,
          },
    });
    return entry.vercel ? { source: entry.source, theme: entry.theme, ...entry.vercel } : null;
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
}

if (!name) {
  die('Missing --name. Usage: npm run create-theme-source -- -- --name <name> [--theme-name <theme>] [--label "..."] [--dry-run] [--persist] [--vercel-app-url <url>] [--vercel-dev-port <port>] [--skip-vercel-preview]');
}
if (!THEME_SOURCE_RE.test(name)) {
  die(`Invalid --name "${name}". Use 2-32 chars: a lowercase letter then [a-z0-9-].`);
}
if (!THEME_NAME_RE.test(themeName)) {
  die(`Invalid --theme-name "${themeName}". Use 2-32 chars: a lowercase letter then [a-z0-9_-].`);
}
if (!THEME_SOURCE_RE.test(from)) {
  die(`Invalid --from "${from}". Use 2-32 chars: a lowercase letter then [a-z0-9-].`);
}
if (name === from) {
  die(`--name must differ from --from ("${from}").`);
}

const srcThemeSource = join(themesRoot, from);
const destThemeSource = join(themesRoot, name);

if (!existsSync(srcThemeSource)) die(`Source theme source not found: nextjs/themes/${from}`);
if (existsSync(destThemeSource) && !force) {
  die(`Target theme source already exists: nextjs/themes/${name} (use --force to overwrite).`);
}

const vercelPreview = resolveVercelPreviewPair();

if (dryRun) {
  console.log('[create-theme-source] DRY RUN - no files written.');
  console.log(`  from source : nextjs/themes/${from}`);
  console.log(`  new source  : nextjs/themes/${name}${existsSync(destThemeSource) ? ' (exists - would overwrite)' : ''}`);
  console.log(`  manifest    : theme/${themeName} -> nextjs/themes/${name} (installable=true, publicPackage=false)`);
  if (vercelPreview) {
    console.log(`  preview map : ${vercelPreview.source}->${vercelPreview.theme} dev=:${vercelPreview.devPort} app=${vercelPreview.appUrl}`);
    console.log(`  local URL   : http://127.0.0.1:${vercelPreview.devPort}/`);
    console.log(`  Vercel URL  : ${vercelPreview.appUrl}`);
  } else {
    console.log('  preview map : skipped');
  }
  console.log(`  label       : ${themeLabel()}`);
  console.log(`  persist     : ${persist ? `nextjs/.env.local G5_THEME_SOURCE=${name}` : 'no local env or .active changes'}`);
  process.exit(0);
}

mkdirSync(themesRoot, { recursive: true });
if (existsSync(destThemeSource) && force) {
  rmSync(destThemeSource, { recursive: true, force: true });
}

cpSync(srcThemeSource, destThemeSource, { recursive: true });
rewriteConfig();
const rescoped = rescopeThemeSelectors(destThemeSource);
const writtenManifestEntry = upsertThemeManifestEntry({
  source: name,
  theme: themeName,
  installable: true,
  publicPackage: false,
  vercel: skipVercelPreview
    ? false
    : {
        appUrl: vercelAppUrl,
        devPort: vercelDevPort,
      },
});
const writtenVercelPreview = writtenManifestEntry.vercel
  ? { source: writtenManifestEntry.source, theme: writtenManifestEntry.theme, ...writtenManifestEntry.vercel }
  : null;

if (persist) {
  writeEnvLocal();
  process.env.G5_THEME_SOURCE = name;
  activateThemeSource({ quiet: true });
}

console.log(`[create-theme-source] Created nextjs/themes/${name} from nextjs/themes/${from}.`);
console.log(`  css scope: data-g5-theme-source="${from}" -> "${name}" in ${rescoped} file(s)`);
console.log(`  manifest: theme/${themeName} -> nextjs/themes/${name}`);
if (writtenVercelPreview) {
  console.log(`  preview: ${writtenVercelPreview.appUrl} (dev :${writtenVercelPreview.devPort})`);
  console.log(`  local: http://127.0.0.1:${writtenVercelPreview.devPort}/ via npm run dev:themes`);
  console.log(`  Vercel: create a separate root project for ${writtenVercelPreview.appUrl}`);
} else {
  console.log('  preview: skipped');
}
if (persist) {
  console.log(`  env: nextjs/.env.local G5_THEME_SOURCE=${name}`);
  console.log(`  active: nextjs/themes/.active -> nextjs/themes/${name}`);
} else {
  console.log('  env: unchanged (use --persist to update nextjs/.env.local)');
  console.log('  active: unchanged (use npm run activate-theme-source or explicit dev scripts when needed)');
}
console.log('');
console.log('Next steps:');
console.log(`  1) Edit nextjs/themes/${name}/theme.config.ts and theme.css.`);
console.log(`  2) node scripts/with-theme.mjs --source ${name} --name ${themeName} -- npm run build:theme`);
