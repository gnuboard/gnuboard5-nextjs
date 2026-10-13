import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
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
import { execFileSync } from 'node:child_process';
import { publicInstallThemeNames } from './lib/public-theme-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const distRoot = join(repoRoot, 'dist');
// 설치 zip 에 넣는 테마 이름들(theme/<이름>) — 공개판 매니페스트에서 읽는다(원본의 publicPackage 테마).
const PUBLIC_THEMES = publicInstallThemeNames(
  JSON.parse(readFileSync(join(repoRoot, 'nextjs', 'theme-manifest.json'), 'utf8'))
);
// 테마마다 빌드한 정적 화면 — scripts/build-release-themes.mjs 가 만든다.
const releaseBuildRoot = join(repoRoot, '.release-build');

const version =
  process.argv.slice(2).find((arg) => !arg.startsWith('-')) ||
  process.env.GITHUB_REF_NAME ||
  `v${JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version}`;

function fail(message) {
  console.error(`[package-release] ${message}`);
  process.exit(1);
}

function assertPath(path, label = path) {
  if (!existsSync(path)) {
    fail(`Missing ${label}: ${relative(repoRoot, path)}`);
  }
}

function listFiles(root) {
  const files = [];
  const stack = [''];
  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = join(root, current);
    for (const entry of readdirSync(absolute)) {
      const relPath = current ? join(current, entry) : entry;
      const entryPath = join(root, relPath);
      const stat = statSync(entryPath);
      if (stat.isDirectory()) {
        stack.push(relPath);
      } else if (stat.isFile()) {
        files.push(relPath.replaceAll('\\', '/'));
      }
    }
  }
  return files.sort();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function tryCreateZipWith(command, args, options) {
  try {
    execFileSync(command, args, options);
    return true;
  } catch {
    return false;
  }
}

const required = [
  ['overlay/api/index.php', 'API router'],
  ['overlay/api/.htaccess', 'API rewrite rules'],
  ...PUBLIC_THEMES.flatMap((theme) => [
    [`overlay/theme/${theme}/route.php`, `${theme} theme route bridge`],
    [`overlay/theme/${theme}/apache-rewrite.example.conf`, `${theme} Apache rewrite rules`],
    [`.release-build/${theme}/index.html`, `${theme} static export (node scripts/build-release-themes.mjs)`],
    [`.release-build/${theme}/.htaccess`, `${theme} Apache app cache rules`],
    [`.release-build/${theme}/_next/static/.htaccess`, `${theme} Apache static chunk cache rules`],
  ]),
  ['overlay/plugin/webapp/bridge/common.php', 'theme-neutral runtime helpers'],
  ['overlay/plugin/webapp/bridge/route.php', 'theme-neutral route front controller'],
  ['overlay/plugin/webapp/bridge/runtime.php', 'runtime bootstrap (URL, rewrite hooks, .htaccess sync)'],
  ['overlay/plugin/webapp/bridge/social.php', 'social login bridge'],
  ['overlay/plugin/webapp/notify/tables.php', 'table registration and admin dbupgrade migrations'],
  ['overlay/plugin/webapp/notify/Notify.php', 'notification door'],
  ['overlay/extend/webapp.extend.php', 'the one Gnuboard extend loader'],
  ['nextjs-install/check.php', 'install diagnostic'],
  ['nextjs-install/tables.sql', 'runtime table SQL'],
  ['nextjs-install/apache-htaccess-rules.txt', 'Apache install rules'],
  ['INSTALL.md', 'install guide'],
  ['LICENSE', 'license notice'],
];

for (const [path, label] of required) {
  assertPath(join(repoRoot, path), label);
}

// 테마마다 빌드한 화면이 그 테마의 것인가. create-theme 로 만든 내 테마를 빌드한 화면이 섞이면 theme/<공개 테마>/app 에
// 엉뚱한 화면이 들어간다. 빌드한 화면의 <body data-g5-theme-source="…"> 로 확인한다(속성이 없는 예전 빌드는 넘어간다).
{
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'nextjs', 'theme-manifest.json'), 'utf8'));
  for (const theme of PUBLIC_THEMES) {
    const expectedSource = (manifest.themes || []).find((entry) => entry.theme === theme)?.source || '';
    const builtSource =
      readFileSync(join(releaseBuildRoot, theme, 'index.html'), 'utf8').match(/data-g5-theme-source="([^"]+)"/)?.[1] || '';
    if (expectedSource && builtSource && builtSource !== expectedSource) {
      fail(
        `.release-build/${theme} was built from theme source "${builtSource}", but the install zip ships theme/${theme} ` +
          `(source "${expectedSource}"). Rebuild it: node scripts/build-release-themes.mjs ${theme}`
      );
    }
  }
}

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

cpSync(join(repoRoot, 'overlay'), distRoot, { recursive: true });
for (const theme of PUBLIC_THEMES) {
  cpSync(join(releaseBuildRoot, theme), join(distRoot, 'theme', theme, 'app'), {
    recursive: true,
  });
}
cpSync(join(repoRoot, 'nextjs-install'), join(distRoot, 'nextjs-install'), {
  recursive: true,
});
copyFileSync(join(repoRoot, 'INSTALL.md'), join(distRoot, 'INSTALL.md'));
copyFileSync(join(repoRoot, 'LICENSE'), join(distRoot, 'LICENSE'));
copyFileSync(join(repoRoot, 'LICENSE.gnuboard.txt'), join(distRoot, 'LICENSE.gnuboard.txt'));

const files = listFiles(distRoot);
const manifest = {
  package: `gnuboard5-nextjs-${version}`,
  version,
  generatedAt: new Date().toISOString(),
  installRoot: 'gnuboard5 root',
  files: files.map((file) => ({
    path: file,
    sha256: sha256(join(distRoot, file)),
  })),
};
writeFileSync(join(distRoot, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const zipName = `gnuboard5-nextjs-${version}.zip`;
const zipPath = join(repoRoot, zipName);
rmSync(zipPath, { force: true });

const createdWithZip = tryCreateZipWith('zip', ['-r', `../${zipName}`, '.'], {
  cwd: distRoot,
  stdio: 'inherit',
});

const createdWithTar =
  createdWithZip ||
  tryCreateZipWith('tar', ['-a', '-cf', zipPath, '-C', distRoot, '.'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

if (!createdWithTar) {
  fail('Could not create zip. Install zip or bsdtar, or run this in GitHub Actions.');
}

console.log(`[package-release] wrote ${relative(repoRoot, zipPath)}`);
console.log(`[package-release] staged ${files.length + 1} file(s) in ${relative(repoRoot, distRoot)}`);
