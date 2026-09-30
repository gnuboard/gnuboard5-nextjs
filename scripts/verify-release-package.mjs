import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicInstallThemeName } from './lib/public-theme-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const distRoot = join(repoRoot, 'dist');
// 설치 zip 에 넣는 테마 이름(theme/<이름>) — 공개판 매니페스트에서 읽는다(원본의 publicPackage 테마).
const PUBLIC_THEME = publicInstallThemeName(
  JSON.parse(readFileSync(join(repoRoot, 'nextjs', 'theme-manifest.json'), 'utf8'))
);
const version =
  process.argv.slice(2).find((arg) => !arg.startsWith('-')) ||
  process.env.GITHUB_REF_NAME ||
  `v${JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version}`;
const zipPath = join(repoRoot, `gnuboard5-nextjs-${version}.zip`);

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function normalize(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function listFiles(root) {
  const files = [];
  const stack = [''];

  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = join(root, current);
    if (!existsSync(absolute)) continue;

    for (const entry of readdirSync(absolute)) {
      const relPath = current ? join(current, entry) : entry;
      const entryPath = join(root, relPath);
      const stat = statSync(entryPath);
      if (stat.isDirectory()) {
        stack.push(relPath);
      } else if (stat.isFile()) {
        files.push(normalize(relPath));
      }
    }
  }

  return files.sort();
}

function listZipEntries(path) {
  const attempts = [
    ['tar', ['-tf', path]],
    ['unzip', ['-Z', '-1', path]],
  ];

  for (const [command, args] of attempts) {
    try {
      return execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8' })
        .split(/\r?\n/)
        .map((entry) => normalize(entry.trim()))
        .filter(Boolean);
    } catch {
      // Try the next archive reader.
    }
  }

  return null;
}

function assertDistPath(path, label = path) {
  if (!existsSync(join(distRoot, path))) {
    fail(`Missing ${label}: ${path}`);
  }
}

function assertZipPath(entries, path, label = path) {
  if (!entries.includes(path)) {
    fail(`Zip is missing ${label}: ${path}`);
  }
}

if (!existsSync(distRoot)) {
  fail('Missing dist/. Run `npm run package -- <version>` first.');
}

const requiredFiles = [
  ['api/index.php', 'API router'],
  ['api/.htaccess', 'API Apache rewrite rules'],
  ['api/social/signup.php', 'social signup bridge'],
  ['api/v1/settings.php', 'settings API'],
  ['plugin/webapp/bridge/common.php', 'theme-neutral runtime helpers'],
  ['plugin/webapp/bridge/route.php', 'theme-neutral route front controller'],
  ['plugin/webapp/bridge/runtime.php', 'runtime bootstrap'],
  ['plugin/webapp/bridge/social.php', 'social login bridge'],
  ['plugin/webapp/notify/tables.php', 'table registration and admin dbupgrade migrations'],
  ['extend/webapp.extend.php', 'the one Gnuboard extend loader'],
  [`theme/${PUBLIC_THEME}/route.php`, 'theme route bridge'],
  [`theme/${PUBLIC_THEME}/bridge/app-shell.php`, 'app shell bridge'],
  [`theme/${PUBLIC_THEME}/bridge/asset-responses.php`, 'asset response bridge helpers'],
  [`theme/${PUBLIC_THEME}/bridge/legacy-routes.php`, 'legacy route bridge helpers'],
  [`theme/${PUBLIC_THEME}/bridge/metadata.php`, 'metadata bridge helpers'],
  [`theme/${PUBLIC_THEME}/bridge/public-assets.php`, 'public asset bridge helpers'],
  [`theme/${PUBLIC_THEME}/bridge/render.php`, 'render bridge helpers'],
  [`theme/${PUBLIC_THEME}/bridge/security-headers.php`, 'security header bridge helpers'],
  [`theme/${PUBLIC_THEME}/bridge/static-paths.php`, 'static app path bridge helpers'],
  [`theme/${PUBLIC_THEME}/app/index.html`, 'static index'],
  [`theme/${PUBLIC_THEME}/app/.htaccess`, 'Apache app cache rules'],
  [`theme/${PUBLIC_THEME}/app/_next/static/.htaccess`, 'Apache static chunk cache rules'],
  ['nextjs-install/check.php', 'install diagnostic'],
  ['nextjs-install/tables.sql', 'install SQL'],
  ['nextjs-install/apache-htaccess-rules.txt', 'Apache rewrite install guide'],
  [`nextjs-install/nginx/${PUBLIC_THEME}-theme-locations.conf`, 'nginx theme locations'],
  ['INSTALL.md', 'install guide'],
  ['LICENSE', 'license'],
  ['LICENSE.gnuboard.txt', 'Gnuboard license notice'],
  ['MANIFEST.json', 'manifest'],
];

const requiredDirs = [
  [`theme/${PUBLIC_THEME}/app/_next/static`, 'Next.js static chunks'],
  [`theme/${PUBLIC_THEME}/bridge`, 'theme bridge'],
  ['api/v1/shop', 'shop API'],
];

for (const [path, label] of requiredFiles) {
  assertDistPath(path, label);
}

for (const [path, label] of requiredDirs) {
  assertDistPath(path, label);
}

const forbiddenTopLevel = [
  '.git',
  '.github',
  '.next',
  'dist',
  'nextjs',
  'node_modules',
  'out',
  'scripts',
];

for (const path of forbiddenTopLevel) {
  if (existsSync(join(distRoot, path))) {
    fail(`Forbidden top-level path found in dist/: ${path}`);
  }
}

const distFiles = existsSync(distRoot) ? listFiles(distRoot) : [];
const textExtensions = new Set([
  '.conf',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.php',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
  '.xml',
]);

const forbiddenText = [
  [/nextjs\.thisgun\.net/i, 'private live domain'],
  [/127\.0\.0\.(?:9|20)/, 'local development IP'],
  [/LIVE_DEPLOY_|deploy-live-ssh|package-live-deploy|nextjs25-live/i, 'live deployment tooling'],
  [/[A-Za-z]:\\xampp/i, 'local Windows path'],
];

for (const file of distFiles) {
  if (/(^|\/)(node_modules|\.next|out|\.git)(\/|$)/.test(file)) {
    fail(`Forbidden generated dependency/build path in dist/: ${file}`);
  }

  if (/(^|\/)\.env($|\.)/.test(file)) {
    fail(`Forbidden env file in dist/: ${file}`);
  }
  if (
    file === 'extend/nextjs25-migrations.extend.php' ||
    file === 'extend/nextjs25-runtime.extend.php' ||
    file === 'extend/nextjs25-social.extend.php'
  ) {
    fail(`Deprecated theme-specific extension found in dist/: ${file}`);
  }

  const extension = extname(file);
  if (!textExtensions.has(extension)) continue;

  const text = readFileSync(join(distRoot, file), 'utf8');
  for (const [pattern, label] of forbiddenText) {
    if (pattern.test(text)) {
      fail(`Found ${label} in ${file}`);
    }
  }
}

const manifestPath = join(distRoot, 'MANIFEST.json');
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const manifestFiles = new Set((manifest.files || []).map((entry) => entry.path));
    const expectedFiles = distFiles.filter((file) => file !== 'MANIFEST.json');

    if (manifest.version !== version) {
      fail(`MANIFEST.json version is ${manifest.version}, expected ${version}`);
    }

    if (manifestFiles.size !== expectedFiles.length) {
      fail(`MANIFEST.json lists ${manifestFiles.size} files, expected ${expectedFiles.length}`);
    }

    for (const file of expectedFiles) {
      if (!manifestFiles.has(file)) {
        fail(`MANIFEST.json does not list ${file}`);
      }
    }
  } catch (error) {
    fail(`Could not parse MANIFEST.json: ${error.message}`);
  }
}

if (existsSync(zipPath)) {
  const zipEntries = listZipEntries(zipPath);
  if (!zipEntries) {
    warn(`Could not inspect ${relative(repoRoot, zipPath)}; install tar or unzip to verify archive contents.`);
  } else {
    for (const [path, label] of requiredFiles) {
      assertZipPath(zipEntries, path, label);
    }

    for (const forbidden of forbiddenTopLevel) {
      if (zipEntries.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))) {
        fail(`Forbidden top-level path found in zip: ${forbidden}`);
      }
    }

    if (zipEntries.includes('extend/nextjs25-migrations.extend.php')) {
      fail('Deprecated split migration extension found in zip: extend/nextjs25-migrations.extend.php');
    }
  }
} else {
  warn(`Zip not found: ${relative(repoRoot, zipPath)}`);
}

for (const message of warnings) {
  console.warn(`[verify-release-package] warning: ${message}`);
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`[verify-release-package] ${message}`);
  }
  process.exit(1);
}

console.log(`[verify-release-package] verified ${distFiles.length} dist file(s) for ${version}`);
