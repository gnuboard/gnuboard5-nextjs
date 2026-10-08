import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_NAME } from './theme-name.mjs';
import { zipArchive } from './lib/zip-archive.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const themeDir = join(repoRoot, 'theme', THEME_NAME);
const themeAppDir = join(themeDir, 'app');
const packageRoot = join(repoRoot, 'dist', 'themes');
const packageBaseName = `${THEME_NAME}-theme`;
const zipPath = join(packageRoot, `${packageBaseName}.zip`);
const manifestPath = join(packageRoot, `${packageBaseName}.manifest.json`);
const checksumPath = join(packageRoot, `${packageBaseName}.zip.sha256`);

// 테마 zip 은 theme/<이름>/ 만 담는다. 공용 브리지(plugin/webapp/)와 API 는 핵심 꾸러미
// (package-core.mjs)가 담는다 — 사이트에 한 번, 테마는 여러 개.
const optionalRootFiles = [];

const requiredThemeFiles = [
  'theme.php',
  'theme.config.php',
  'readme.txt',
  'head.php',
  'tail.php',
  'route.php',
  'bridge/config.php',
  'bridge/app-shell.php',
  'bridge/asset-responses.php',
  'bridge/legacy-routes.php',
  'bridge/metadata.php',
  'bridge/public-assets.php',
  'bridge/render.php',
  'bridge/security-headers.php',
  'bridge/static-paths.php',
  `css/${THEME_NAME}.css`,
  'app/index.html',
  'app/_next',
  'app/manifest.webmanifest',
  'app/manifest.json',
  'app/robots.txt',
  'app/sitemap.xml',
  'app/sitemap-posts.xml',
  'app/sw.js',
];

const notableThemeFiles = [
  'theme.routes.json',
  'theme.tokens.json',
  'screenshot.png',
  'bridge/theme-tokens.php',
];

function fail(message) {
  console.error(`[package-theme] ${message}`);
  process.exit(1);
}

function toArchivePath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/');
}

function requirePath(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`Missing ${label}: ${toArchivePath(filePath)}`);
  }
}

function shouldSkip(filePath) {
  const name = filePath.split(/[\\/]/).at(-1) || '';
  return (
    name === '.DS_Store' ||
    name.endsWith('.map') ||
    name.startsWith('.app.tmp-') ||
    name.startsWith('.app.backup-')
  );
}

function collectFiles(baseDir) {
  const files = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = join(currentDir, entry.name);
      if (shouldSkip(entryPath)) continue;

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.isFile()) {
        files.push({
          absolutePath: entryPath,
          archivePath: toArchivePath(entryPath),
        });
      }
    }
  }

  walk(baseDir);
  return files;
}

function collectPackageFiles() {
  const filesByArchivePath = new Map();

  for (const file of collectFiles(themeDir)) {
    filesByArchivePath.set(file.archivePath, file);
  }

  for (const rootFile of optionalRootFiles) {
    const absolutePath = join(repoRoot, rootFile);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    filesByArchivePath.set(rootFile, {
      absolutePath,
      archivePath: rootFile,
    });
  }

  return [...filesByArchivePath.values()].sort((a, b) => a.archivePath.localeCompare(b.archivePath));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function fileIntegrityEntry(file) {
  const buffer = readFileSync(file.absolutePath);

  return {
    path: file.archivePath,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

function isStaticAppTextFile(archivePath) {
  if (!archivePath.startsWith(`theme/${THEME_NAME}/app/`)) {
    return false;
  }

  return /\.(html|txt|json|webmanifest|xml|js|css|rsc)$/i.test(archivePath);
}

function uniqueSample(values, limit = 12) {
  return [...new Set(values)].slice(0, limit);
}

function auditStaticApp(files) {
  const textFiles = files.filter((file) => isStaticAppTextFile(file.archivePath));
  const localOriginPattern = /\bhttps?:\/\/(?:localhost|127(?:\.[0-9]{1,3}){3})(?::[0-9]+)?/g;
  const localOriginFiles = [];
  const localOrigins = [];
  const privateRouteFiles = [];

  for (const file of textFiles) {
    const source = readFileSync(file.absolutePath, 'utf8');
    const matches = source.match(localOriginPattern) || [];
    if (matches.length > 0) {
      localOriginFiles.push(file.archivePath);
      localOrigins.push(...matches);
    }

    if (/^theme\/[^/]+\/app\/(?:admin|mypage)\//.test(file.archivePath)) {
      privateRouteFiles.push(file.archivePath);
    }
  }

  return {
    scannedTextFileCount: textFiles.length,
    localOrigins: {
      count: localOrigins.length,
      values: uniqueSample(localOrigins),
      fileCount: new Set(localOriginFiles).size,
      sampleFiles: uniqueSample(localOriginFiles),
    },
    privateRouteStaticFiles: {
      count: privateRouteFiles.length,
      sampleFiles: uniqueSample(privateRouteFiles),
    },
  };
}

function validateThemePackageInputs() {
  requirePath(themeDir, 'theme directory');
  requirePath(themeAppDir, 'generated theme app directory');

  for (const requiredFile of requiredThemeFiles) {
    requirePath(join(themeDir, requiredFile), `theme package file ${requiredFile}`);
  }
}

validateThemePackageInputs();

const files = collectPackageFiles();
const hasStaticApp = files.some((file) => file.archivePath === `theme/${THEME_NAME}/app/index.html`);
const hasRuntimeChunks = files.some((file) => file.archivePath.startsWith(`theme/${THEME_NAME}/app/_next/`));

if (!hasStaticApp || !hasRuntimeChunks) {
  fail('The package is missing generated static app files. Run `npm run build:theme` first.');
}

const fileIntegrity = files.map((file) => fileIntegrityEntry(file));
const totalBytes = fileIntegrity.reduce((sum, file) => sum + file.bytes, 0);
const staticAppAudit = auditStaticApp(files);
const strictStaticAudit = process.env.G5_PACKAGE_STRICT_STATIC_AUDIT === '1';

if (staticAppAudit.localOrigins.count > 0) {
  console.warn(
    `[package-theme] static app audit: ${staticAppAudit.localOrigins.count} local URL marker(s) found in ` +
    `${staticAppAudit.localOrigins.fileCount} generated app file(s). Rebuild with public URLs before distributing.`
  );
  if (strictStaticAudit) {
    fail('Strict static app audit failed because generated app files contain localhost/127.x origins.');
  }
}

mkdirSync(packageRoot, { recursive: true });
rmSync(zipPath, { force: true });
rmSync(manifestPath, { force: true });
rmSync(checksumPath, { force: true });

const zipBuffer = zipArchive(files, { fail });
const zipHash = sha256(zipBuffer);
const manifest = {
  package: `${packageBaseName}.zip`,
  theme: THEME_NAME,
  createdAt: new Date().toISOString(),
  fileCount: files.length,
  sourceBytes: totalBytes,
  sha256: zipHash,
  staticAppAudit,
  includes: {
    generatedApp: true,
    corePackage: 'gnuboard5-webapp-core.zip',
    notableThemeFiles: notableThemeFiles.filter((file) => existsSync(join(themeDir, file))),
  },
  files: files.map((file) => file.archivePath),
  fileIntegrity,
};

writeFileSync(zipPath, zipBuffer);
writeFileSync(checksumPath, `${zipHash}  ${packageBaseName}.zip\n`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[package-theme] wrote ${toArchivePath(zipPath)}`);
console.log(`[package-theme] manifest ${toArchivePath(manifestPath)}`);
console.log(`[package-theme] sha256 ${zipHash}`);
console.log(`[package-theme] files ${files.length}`);
// 명령은 nextjs/ 에서 돌리지만 결과물은 저장소 맨 위의 dist/themes/ · theme/<이름>/ 에 생긴다 — nextjs/ 안을 찾다가
// "아무것도 안 생겼다"고 헷갈리지 않게 전체 경로로 한 번 더 알려 준다.
console.log(`[package-theme] zip:          ${zipPath}`);
console.log(`[package-theme] theme folder: ${themeDir}`);
