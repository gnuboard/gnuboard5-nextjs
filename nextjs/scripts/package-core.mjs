import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipArchive } from './lib/zip-archive.mjs';

/**
 * 핵심 꾸러미 — 테마와 무관하게 사이트에 한 번 올리는 것.
 *
 *   api/                       데이터 창구
 *   plugin/webapp/             공용 브리지(정문 route.php, 연장통, 부팅, 소셜 다리, 표 등록)
 *   extend/webapp.extend.php   그누보드가 매 요청 자동 실행하는 유일한 훅(plugin/webapp 로더)
 *
 * api/ 만 올리면 로그인이 "Internal server error." 로 죽는다. 인증이 쓰는 표를
 * plugin/webapp/notify/tables.php 가 등록·생성하기 때문이다. 그누보드 루트에 그대로 풀면 자리가
 * 맞는다. 사이트별 값(api/.env)은 담지 않고 env.example 만 넣는다 — 같은 주소에서 돌리는
 * 보통 설치는 .env 없이도 된다.
 */

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const packageRoot = join(repoRoot, 'dist', 'core');
const packageBaseName = 'gnuboard5-webapp-core';
const zipPath = join(packageRoot, `${packageBaseName}.zip`);
const manifestPath = join(packageRoot, `${packageBaseName}.manifest.json`);
const checksumPath = join(packageRoot, `${packageBaseName}.zip.sha256`);

// api/ 밖에서 함께 가야 하는 것. package-live-deploy.mjs 의 rootPatchFiles 와 같은 목록.
const rootFiles = ['extend/webapp.extend.php'];
const rootDirs = ['plugin/webapp'];

// 사이트별 값이나 로컬 산출물은 싣지 않는다.
const skipNames = new Set(['.env', '.DS_Store', 'Thumbs.db']);
const skipPrefixes = ['api/.env.'];

function fail(message) {
  console.error(`[package-core] ${message}`);
  process.exit(1);
}

function toArchivePath(filePath) {
  return relative(repoRoot, filePath).split('\\').join('/');
}

function collect(baseDir) {
  const out = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    const absolutePath = join(baseDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collect(absolutePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const archivePath = toArchivePath(absolutePath);
    if (skipNames.has(entry.name) || skipPrefixes.some((prefix) => archivePath.startsWith(prefix))) {
      continue;
    }
    out.push({ absolutePath, archivePath });
  }
  return out;
}

const files = collect(join(repoRoot, 'api'));
for (const rootDir of rootDirs) {
  if (!existsSync(join(repoRoot, rootDir))) fail(`Missing ${rootDir}/`);
  files.push(...collect(join(repoRoot, rootDir)));
}
for (const rootFile of rootFiles) {
  const absolutePath = join(repoRoot, rootFile);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    fail(`Missing ${rootFile}`);
  }
  files.push({ absolutePath, archivePath: rootFile });
}
files.sort((a, b) => a.archivePath.localeCompare(b.archivePath));

for (const required of ['api/index.php', 'api/.htaccess', 'api/env.example', 'api/lib/Schema.php', 'plugin/webapp/bridge/route.php', 'plugin/webapp/bridge/common.php', 'plugin/webapp/bridge/runtime.php', 'plugin/webapp/notify/tables.php', 'plugin/webapp/notify/Notify.php', 'plugin/webapp/cron/process_push_queue.php']) {
  if (!files.some((file) => file.archivePath === required)) {
    fail(`Missing ${required}`);
  }
}
if (files.some((file) => file.archivePath === 'api/.env')) {
  fail('api/.env must not be packaged');
}

const zipBuffer = zipArchive(files, { fail });
const sha256 = createHash('sha256').update(zipBuffer).digest('hex');

mkdirSync(packageRoot, { recursive: true });
rmSync(zipPath, { force: true });
writeFileSync(zipPath, zipBuffer);
writeFileSync(checksumPath, `${sha256}  ${packageBaseName}.zip\n`);
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      package: `${packageBaseName}.zip`,
      generatedAt: new Date().toISOString(),
      sha256,
      install: [
        'Extract at the Gnuboard root so api/, plugin/webapp/ and extend/ sit next to common.php.',
        'api/.env is optional for a same-origin install; copy api/env.example when the app or a mobile client runs on another origin.',
        'Open /api/v1/status: database.ok and schema.ok must both be true.',
        'Then unzip a theme package and select the theme in Gnuboard admin.',
      ],
      files: files.map((file) => file.archivePath),
    },
    null,
    2
  )}\n`
);

console.log(`[package-core] wrote ${toArchivePath(zipPath)} (${files.length} files, ${(zipBuffer.length / 1024).toFixed(0)} KB)`);
console.log(`[package-core] sha256 ${sha256}`);
