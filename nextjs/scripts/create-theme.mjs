/**
 * create-theme — scaffold a new gnuboard theme from the Next.js webapp skeleton.
 *
 *   npm run create-theme -- -- --name foonext [--label "My Shop"] [--from nextjs25] [--dry-run] [--force]
 *
 * It copies theme/<from> -> theme/<name> (excluding the built app/ folder), then does a
 * case-sensitive token rewrite of the theme name so the new theme has its OWN disjoint PHP
 * function prefix (<name>_*), constant family (G5_<NAME>_*), CSS classes, query params and
 * KCP identifiers. That lets it coexist in one PHP process with the original theme/nextjs25
 * (no function_exists() first-wins collision). The runtime-config global stays the neutral
 * __G5_APP_CONFIG__ key, so the SAME static build serves any generated theme.
 *
 * After scaffolding:
 *   1) node scripts/with-theme.mjs --source <source> --name <name> -- npm run build:theme
 *      This builds theme/<name>/app from either an existing source or a new --with-source source.
 *   2) set g5_config.cf_theme = <name> in the gnuboard admin theme picker (adm/theme_update.php)
 *   3) keep the front controller pointed at plugin/webapp/bridge/route.php. The shared
 *      extend/nextjs-*.extend.php files bootstrap whichever Next.js theme is active.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewThemeManifestEntry, upsertThemeManifestEntry } from './theme-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');

// ---- args --------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : fallback;
};

const name = getOpt('name').trim();
const from = (getOpt('from', 'nextjs_default') || 'nextjs_default').trim();
const label = getOpt('label').trim();
const dryRun = hasFlag('dry-run');
const force = hasFlag('force');
const withSource = hasFlag('with-source');
const sourceFrom = (getOpt('source-from', 'default') || 'default').trim();
const skipVercelPreview = hasFlag('skip-vercel-preview');
const vercelAppUrl = getOpt('vercel-app-url').trim();
const vercelDevPort = getOpt('vercel-dev-port').trim();

// No hyphens: the name doubles as a PHP function prefix and an UPPER_SNAKE constant token.
// 밑줄은 된다(nextjs_default) — PHP 함수 접두어 · 상수 토큰에 그대로 쓸 수 있다. 하이픈만 안 된다.
const NAME_RE = /^[a-z][a-z0-9_]{1,31}$/;
const SOURCE_NAME_RE = /^[a-z][a-z0-9-]{1,31}$/;

function die(message) {
  console.error(`[create-theme] ${message}`);
  process.exit(1);
}

if (!name) {
  die('Missing --name. Usage: npm run create-theme -- -- --name <name> [--label "..."] [--dry-run] [--with-source] [--vercel-app-url <url>] [--vercel-dev-port <port>] [--skip-vercel-preview]');
}
if (!NAME_RE.test(name)) {
  die(`Invalid --name "${name}". Use 2-32 chars: a lowercase letter then [a-z0-9_] (no hyphen; it becomes a PHP identifier prefix).`);
}
if (name === from) {
  die(`--name must differ from --from ("${from}").`);
}
if (name.includes(from) || from.includes(name)) {
  die(`--name "${name}" and --from "${from}" must not contain each other (token rewrite would be ambiguous).`);
}
if (!SOURCE_NAME_RE.test(sourceFrom)) {
  die(`Invalid --source-from "${sourceFrom}". Use 2-32 chars: a lowercase letter then [a-z0-9-].`);
}

const NAME = name.toUpperCase();
const FROM_LOWER = from;
const FROM_UPPER = from.toUpperCase();

// 본뜰 그누보드 테마 — 그누보드 전체 소스는 theme/<from>, 공개 저장소(gnuboard5-nextjs)는 overlay/theme/<from> 에 둔다.
// 새 테마는 어느 쪽이든 theme/<name> 에 만든다(빌드 결과를 넣는 곳 · package:theme 이 묶는 곳).
const srcTheme = [join(repoRoot, 'theme', from), join(repoRoot, 'overlay', 'theme', from)].find((dir) => existsSync(dir))
  ?? join(repoRoot, 'theme', from);
const destTheme = join(repoRoot, 'theme', name);
const srcThemeLabel = relative(repoRoot, srcTheme).split('\\').join('/');
const srcThemeSource = join(nextRoot, 'themes', sourceFrom);
const destThemeSource = join(nextRoot, 'themes', name);

if (!existsSync(srcTheme)) die(`Source theme not found: ${srcTheme}`);
if (existsSync(destTheme) && !force) {
  die(`Target theme already exists: ${destTheme} (use --force to overwrite).`);
}
if (withSource && !existsSync(srcThemeSource)) {
  die(`Source theme source not found: ${srcThemeSource}`);
}
if (!withSource && !existsSync(srcThemeSource)) {
  die(`Mapped theme source not found: ${srcThemeSource}`);
}
if (withSource && existsSync(destThemeSource) && !force) {
  die(`Target theme source already exists: ${destThemeSource} (use --force to overwrite).`);
}

const outputThemeSource = withSource ? name : sourceFrom;

function resolvePreviewPair() {
  if (!withSource || skipVercelPreview) return null;

  try {
    const entry = previewThemeManifestEntry({
      source: name,
      theme: name,
      installable: true,
      publicPackage: false,
      vercel: {
        appUrl: vercelAppUrl,
        devPort: vercelDevPort,
      },
    });
    return entry.vercel ? { source: entry.source, theme: entry.theme, ...entry.vercel } : null;
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
}

const previewPair = resolvePreviewPair();

// ---- token rewrite -----------------------------------------------------------------------
const TEXT_EXT = new Set([
  '.php', '.css', '.js', '.mjs', '.ts', '.tsx', '.json', '.html', '.htm',
  '.txt', '.conf', '.md', '.webmanifest', '.map', '.xml', '.svg',
]);

// Skip the built static export and any transient sync dirs that live under theme/<from>.
const skipTopEntry = (entry) => entry === 'app' || entry.startsWith('.app.');

function rewrite(text) {
  // Case-sensitive, single-pass. UPPER first then lower; the tokens are disjoint so order
  // does not matter, but keeping both explicit documents intent.
  return text.split(FROM_UPPER).join(NAME).split(FROM_LOWER).join(name);
}

function isTextFile(file) {
  return TEXT_EXT.has(extname(file).toLowerCase());
}

// Walk a tree, returning [{ abs, rel }] for files, honoring the top-level skip rules.
function walkFiles(root, baseForSkip = root) {
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, entry.name);
    if (root === baseForSkip && skipTopEntry(entry.name)) continue;
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs, baseForSkip));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

// ---- plan reporting (dry-run reads from the source tree) ---------------------------------
const nginxDir = join(repoRoot, 'docs', 'nginx');
const nginxFiles = existsSync(nginxDir)
  ? readdirSync(nginxDir).filter((f) => f.startsWith(`${from}-`) && f.endsWith('.conf'))
  : [];

function reportPlan() {
  const srcFiles = walkFiles(srcTheme);
  const rewritable = srcFiles.filter(
    (f) => isTextFile(f) && rewrite(readFileSync(f, 'utf8')) !== readFileSync(f, 'utf8')
  );
  const renames = srcFiles.filter((f) => basename(f) !== rewrite(basename(f)));

  console.log(`[create-theme] DRY RUN — no files written.`);
  console.log(`  from theme : ${srcThemeLabel}`);
  console.log(`  new theme  : theme/${name}${existsSync(destTheme) ? ' (exists — would overwrite)' : ''}`);
  console.log(`  copy       : ${srcFiles.length} files (excluding app/ + transient sync dirs)`);
  console.log(`  rewrite    : ${rewritable.length} text files ("${from}"->"${name}", "${FROM_UPPER}"->"${NAME}")`);
  for (const r of renames) console.log(`  rename     : ${basename(r)} -> ${rewrite(basename(r))}`);
  console.log('  extend     : shared extend/nextjs-*.extend.php (no per-theme files)');
  for (const f of nginxFiles) console.log(`  nginx      : docs/nginx/${f} -> docs/nginx/${rewrite(f)}`);
  console.log(`  label      : theme.php/readme.txt name -> "${themeLabel()}"`);
  console.log(`  env        : nextjs/.env.local G5_THEME_NAME=${name}`);
  console.log(`  manifest   : theme/${name} -> nextjs/themes/${outputThemeSource} (installable=true, publicPackage=false)`);
  if (withSource) {
    console.log(`  source     : nextjs/themes/${sourceFrom} -> nextjs/themes/${name}`);
    console.log(`  source env : nextjs/.env.local G5_THEME_SOURCE=${name}`);
    if (previewPair) {
      console.log(`  preview map: nextjs/vercel-theme-map.json ${previewPair.source}->${previewPair.theme}`);
      console.log(`  local URL  : http://127.0.0.1:${previewPair.devPort}/`);
      console.log(`  Vercel URL : ${previewPair.appUrl}`);
    } else {
      console.log('  preview map: skipped');
    }
  } else {
    console.log(`  source env : nextjs/.env.local G5_THEME_SOURCE=${sourceFrom}`);
    console.log('  preview map: unchanged (use --with-source for a separate Vercel preview theme)');
  }
}

function themeLabel() {
  return label || `${name} (Next.js)`;
}

function escapePhpSingleQuoted(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- apply -------------------------------------------------------------------------------
function copyTheme() {
  if (existsSync(destTheme) && force) rmSync(destTheme, { recursive: true, force: true });
  cpSync(srcTheme, destTheme, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(srcTheme.length + 1);
      if (rel === '') return true;
      const top = rel.split(/[\\/]/)[0];
      return !skipTopEntry(top);
    },
  });
}

function rewriteTree(root) {
  let rewritten = 0;
  let renamed = 0;
  for (const abs of walkFiles(root)) {
    if (isTextFile(abs)) {
      const content = readFileSync(abs, 'utf8');
      const next = rewrite(content);
      if (next !== content) {
        writeFileSync(abs, next);
        rewritten += 1;
      }
    }
    const base = basename(abs);
    const nextBase = rewrite(base);
    if (nextBase !== base) {
      renameSync(abs, join(dirname(abs), nextBase));
      renamed += 1;
    }
  }
  return { rewritten, renamed };
}

function applyLabel() {
  const themePhp = join(destTheme, 'theme.php');
  if (!existsSync(themePhp)) return;
  const content = readFileSync(themePhp, 'utf8');
  const next = content.replace(
    /('name'\s*=>\s*)'(?:[^'\\]|\\.)*'/,
    `$1'${escapePhpSingleQuoted(themeLabel())}'`
  );
  if (next !== content) writeFileSync(themePhp, next);
}

function replaceReadmeField(content, field, value) {
  const pattern = new RegExp(`^(${escapeRegExp(field)}:\\s*).*$`, 'm');
  if (!pattern.test(content)) {
    return `${field}: ${value}\n${content}`;
  }

  return content.replace(pattern, (_match, prefix) => `${prefix}${value}`);
}

function applyReadmeMetadata() {
  const readme = join(destTheme, 'readme.txt');
  if (!existsSync(readme)) return;

  const displayName = themeLabel();
  let content = readFileSync(readme, 'utf8');
  content = replaceReadmeField(content, 'Theme Name', displayName);
  content = replaceReadmeField(content, 'Theme URI', `https://example.com/${name}`);
  content = replaceReadmeField(content, 'Maker', displayName);
  content = replaceReadmeField(
    content,
    'Detail',
    `${displayName} static Next.js compatibility theme for Gnuboard5 and YoungCart5.`
  );
  content = content.replace(
    /Add the rules from theme\/[^/]+\/apache-rewrite\.example\.conf[\s\S]*?Gnuboard short-url rules\./,
    'Keep the Gnuboard root .htaccess pointed at plugin/webapp/bridge/route.php so the active administrator theme selects the matching Next.js bridge.'
  );

  writeFileSync(readme, content);
}

function copyNginx() {
  for (const f of nginxFiles) {
    const dest = join(nginxDir, rewrite(f));
    writeFileSync(dest, rewrite(readFileSync(join(nginxDir, f), 'utf8')));
  }
}

function writeEnvLocal() {
  const envPath = join(nextRoot, '.env.local');
  const lines = [`G5_THEME_NAME=${name}`, `G5_THEME_SOURCE=${outputThemeSource}`];
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${lines.join('\n')}\n`);
    return;
  }
  const kept = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*G5_THEME_(?:NAME|SOURCE)\s*=/.test(l));
  const body = kept.join('\n').replace(/\n+$/, '');
  writeFileSync(envPath, `${body ? body + '\n' : ''}${lines.join('\n')}\n`);
}

function writeManifestEntry() {
  upsertThemeManifestEntry({
    source: outputThemeSource,
    theme: name,
    installable: true,
    publicPackage: false,
    vercel: withSource
      ? {
          appUrl: vercelAppUrl,
          devPort: vercelDevPort,
        }
      : false,
  });
}

function createThemeSource() {
  if (!withSource) return;

  const args = [
    join(scriptDir, 'create-theme-source.mjs'),
    '--name',
    name,
    '--theme-name',
    name,
    '--from',
    sourceFrom,
    ...(label ? ['--label', label] : []),
    ...(dryRun ? ['--dry-run'] : []),
    ...(force ? ['--force'] : []),
    ...(skipVercelPreview ? ['--skip-vercel-preview'] : []),
    ...(vercelAppUrl ? ['--vercel-app-url', vercelAppUrl] : []),
    ...(vercelDevPort ? ['--vercel-dev-port', vercelDevPort] : []),
    '--persist',
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: nextRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    die(result.error.message);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

// ---- run ---------------------------------------------------------------------------------
if (dryRun) {
  reportPlan();
  createThemeSource();
  process.exit(0);
}

copyTheme();
const { rewritten, renamed } = rewriteTree(destTheme);
applyLabel();
applyReadmeMetadata();
copyNginx();
writeEnvLocal();
createThemeSource();
if (!withSource) {
  writeManifestEntry();
}

console.log(`[create-theme] Created theme/${name} from ${srcThemeLabel}.`);
console.log(`  rewrote ${rewritten} text files, renamed ${renamed} files inside theme/${name}`);
console.log('  extend : shared plugin/webapp/bridge/runtime.php + plugin/webapp/bridge/social.php');
console.log(`  nginx  : ${nginxFiles.length} conf(s) under docs/nginx`);
console.log(`  env    : nextjs/.env.local G5_THEME_NAME=${name}`);
console.log(`  manifest: theme/${name} -> nextjs/themes/${outputThemeSource}`);
console.log('');
console.log('Next steps:');
if (withSource) {
  console.log(`  1) Edit nextjs/themes/${name}/theme.config.ts and theme.css.`);
  console.log(`  2) cd nextjs && node scripts/with-theme.mjs --source ${name} --name ${name} -- npm run build:theme`);
  console.log(`  3) gnuboard admin -> theme picker: set active theme to "${name}" (cf_theme)`);
  console.log('  4) keep .htaccess/nginx pointed at plugin/webapp/bridge/route.php for admin-driven theme switching.');
  if (previewPair) {
    console.log(`  5) Local preview: npm run dev:themes -> http://127.0.0.1:${previewPair.devPort}/`);
    console.log(`  6) Vercel project: ${previewPair.appUrl} with G5_THEME_SOURCE=${name}, G5_THEME_NAME=${name}.`);
  } else {
    console.log('  5) Vercel preview map was skipped; add this theme to nextjs/vercel-theme-map.json before running npm run dev:themes.');
  }
} else {
  console.log(`  1) cd nextjs && node scripts/with-theme.mjs --source ${outputThemeSource} --name ${name} -- npm run build:theme`);
  console.log(`  2) gnuboard admin -> theme picker: set active theme to "${name}" (cf_theme)`);
  console.log('  3) keep .htaccess/nginx pointed at plugin/webapp/bridge/route.php for admin-driven theme switching.');
}
