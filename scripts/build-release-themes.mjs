/**
 * 공개 테마를 하나씩 정적 빌드해 .release-build/<테마> 에 둔다 — package-release.mjs 가 그것을
 * 설치 zip 의 theme/<테마>/app 으로 싣는다. nextjs/out 은 빌드마다 덮이므로 테마마다 따로 옮겨 둔다.
 *
 * 사용: node scripts/build-release-themes.mjs [테마 …]   (테마를 주지 않으면 공개 테마 전부)
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicInstallThemeNames } from './lib/public-theme-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const nextRoot = join(repoRoot, 'nextjs');
const buildRoot = join(repoRoot, '.release-build');

function fail(message) {
  console.error(`[build-release-themes] ${message}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(nextRoot, 'theme-manifest.json'), 'utf8'));
const publicThemes = publicInstallThemeNames(manifest);
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const unknown = requested.filter((theme) => !publicThemes.includes(theme));
if (unknown.length > 0) {
  fail(`not a public theme: ${unknown.join(', ')} (public themes: ${publicThemes.join(', ')})`);
}
const themes = requested.length > 0 ? requested : publicThemes;

mkdirSync(buildRoot, { recursive: true });

for (const theme of themes) {
  const source = (manifest.themes || []).find((entry) => entry.theme === theme)?.source || '';
  console.log(`[build-release-themes] ${theme} (source ${source}) …`);

  const result = spawnSync('npm', ['run', `build:${theme}`], {
    cwd: nextRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    fail(`npm run build:${theme} failed (exit ${result.status ?? 'signal'})`);
  }

  // 빌드한 화면이 그 테마의 것인가 — <body data-g5-theme-source="…"> 로 확인한다.
  const indexPath = join(nextRoot, 'out', 'index.html');
  if (!existsSync(indexPath)) {
    fail(`npm run build:${theme} did not write nextjs/out/index.html`);
  }
  const builtSource = readFileSync(indexPath, 'utf8').match(/data-g5-theme-source="([^"]+)"/)?.[1] || '';
  if (source && builtSource && builtSource !== source) {
    fail(`nextjs/out was built from theme source "${builtSource}", expected "${source}" for ${theme}`);
  }

  const target = join(buildRoot, theme);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(nextRoot, 'out'), target, { recursive: true });
  console.log(`[build-release-themes] ${theme} -> ${relative(repoRoot, target)}`);
}
