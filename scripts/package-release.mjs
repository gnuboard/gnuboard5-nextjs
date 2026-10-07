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
  [`overlay/theme/${PUBLIC_THEME}/route.php`, 'theme route bridge'],
  [`overlay/theme/${PUBLIC_THEME}/apache-rewrite.example.conf`, 'Apache rewrite rules'],
  ['overlay/plugin/webapp/bridge/common.php', 'theme-neutral runtime helpers'],
  ['overlay/plugin/webapp/bridge/route.php', 'theme-neutral route front controller'],
  ['overlay/plugin/webapp/bridge/runtime.php', 'runtime bootstrap (URL, rewrite hooks, .htaccess sync)'],
  ['overlay/plugin/webapp/bridge/social.php', 'social login bridge'],
  ['overlay/plugin/webapp/notify/tables.php', 'table registration and admin dbupgrade migrations'],
  ['overlay/plugin/webapp/notify/Notify.php', 'notification door'],
  ['overlay/extend/webapp.extend.php', 'the one Gnuboard extend loader'],
  ['nextjs/out/index.html', 'Next.js static export'],
  ['nextjs/out/.htaccess', 'Apache app cache rules'],
  ['nextjs/out/_next/static/.htaccess', 'Apache static chunk cache rules'],
  ['nextjs-install/check.php', 'install diagnostic'],
  ['nextjs-install/tables.sql', 'runtime table SQL'],
  ['nextjs-install/apache-htaccess-rules.txt', 'Apache install rules'],
  ['INSTALL.md', 'install guide'],
  ['LICENSE', 'license notice'],
];

for (const [path, label] of required) {
  assertPath(join(repoRoot, path), label);
}

// nextjs/out 이 설치 zip 의 테마(공개 테마의 소스)로 빌드한 화면인가. create-theme 로 만든 내 테마를 마지막에
// 빌드했다면(.env.local 이 내 테마를 가리키면 그냥 npm run build 도 그렇다) 그 화면이 theme/<공개 테마>/app 에
// 들어가 버린다. 빌드한 화면의 <body data-g5-theme-source="…"> 로 확인한다(속성이 없는 예전 빌드는 넘어간다).
{
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'nextjs', 'theme-manifest.json'), 'utf8'));
  const expectedSource = (manifest.themes || []).find((entry) => entry.theme === PUBLIC_THEME)?.source || '';
  const builtSource =
    readFileSync(join(repoRoot, 'nextjs', 'out', 'index.html'), 'utf8').match(/data-g5-theme-source="([^"]+)"/)?.[1] || '';
  if (expectedSource && builtSource && builtSource !== expectedSource) {
    fail(
      `nextjs/out was built from theme source "${builtSource}", but the install zip ships theme/${PUBLIC_THEME} ` +
        `(source "${expectedSource}"). Build it first: cd nextjs && npm run build:${PUBLIC_THEME}`
    );
  }
}

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

cpSync(join(repoRoot, 'overlay'), distRoot, { recursive: true });
cpSync(join(repoRoot, 'nextjs', 'out'), join(distRoot, 'theme', PUBLIC_THEME, 'app'), {
  recursive: true,
});
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
