import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const hasOverlay = existsSync(join(repoRoot, 'overlay'));

const excludedDirs = new Set([
  '.git',
  '.next',
  'data',
  'dist',
  'node_modules',
  'out',
  'theme',
  'vendor',
]);

// plugin/ 은 제품 폴더(webapp, dday, baby, print)의 PHP 가 사는 곳이다. 그누보드 원래
// 플러그인(htmlpurifier 등 수만 줄)까지 훑지 않도록 우리 폴더만 지정한다.
// theme/*/bridge 는 테마가 늘거나 이름이 바뀌어도 빠지지 않게 아래에서 훑는다.
const sourceTargets = [
  'api',
  'extend',
  'plugin/webapp',
  'plugin/dday',
  'plugin/baby',
  'plugin/print',
  'adm/push_broadcast.php',
  'common.php',
  'tests/smoke',
];

const publicTargets = [
  'overlay/api',
  'overlay/extend',
  'overlay/plugin/webapp',
];

function normalized(path) {
  return relative(repoRoot, path).replace(/\\/g, '/');
}

function walk(path) {
  if (!existsSync(path)) return [];
  const stats = statSync(path);
  if (stats.isFile()) return extname(path) === '.php' ? [path] : [];
  if (!stats.isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) continue;
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.php') {
      files.push(fullPath);
    }
  }
  return files;
}

/** theme/<name>/bridge 를 전부 모은다 — 테마가 늘거나 이름이 바뀌어도 목록을 고칠 필요가 없게. */
function themeBridgeTargets(themeRoot) {
  const root = join(repoRoot, themeRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'bridge')))
    .map((entry) => `${themeRoot}/${entry.name}/bridge`);
}

const targets = hasOverlay
  ? [...publicTargets, ...themeBridgeTargets('overlay/theme')]
  : [...sourceTargets, ...themeBridgeTargets('theme')];
const files = [...new Set(targets.flatMap((target) => walk(join(repoRoot, target))))].sort();

if (files.length === 0) {
  console.error('[check-php-syntax] no PHP files found');
  process.exit(1);
}

const failures = [];

for (const file of files) {
  const result = spawnSync('php', ['-l', file], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    failures.push({
      file: normalized(file),
      output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[check-php-syntax] ${failure.file}`);
    if (failure.output) console.error(failure.output);
  }
  process.exit(1);
}

console.log(`[check-php-syntax] ${files.length} PHP file(s) passed`);
