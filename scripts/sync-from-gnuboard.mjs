import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  publicInstallThemeMap,
  publicInstallThemeName,
  publicThemeManifestFromSource,
  publicVercelThemeMap,
  splitThemeManifest,
} from './lib/public-theme-manifest.mjs';
import { findPublicLeaks } from './lib/public-leak-check.mjs';
import { applyPublisherBranding, PERSONAL_TRACE_PATTERN, USER_FACING_ROOTS } from './lib/publisher.mjs';
import { verifySyncedPublicNextjsTree } from './lib/public-sync-verify.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sourceRoot = resolve(repoRoot, process.argv[2] || '../gnuboard5_3');

function fail(message) {
  console.error(`[sync-from-gnuboard] ${message}`);
  process.exit(1);
}

function assertPath(path, label = path) {
  if (!existsSync(path)) {
    fail(`Missing ${label}: ${path}`);
  }
}

function copyDir(from, to, options = {}) {
  assertPath(from);
  const preserved = [...(options.preserveDirs || []), ...(options.preserveFiles || [])];
  const scratch = preserved.length > 0 ? mkdtempSync(join(dirname(to), '.sync-preserve-')) : '';

  const restorePreserved = () => {
    if (!scratch || !existsSync(scratch)) return;
    for (const rel of preserved) {
      const source = join(scratch, rel);
      if (!existsSync(source)) continue;
      const target = join(to, rel);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(dirname(target), { recursive: true });
      renameSync(source, target);
    }
  };

  try {
    for (const rel of preserved) {
      const source = join(to, rel);
      if (!existsSync(source)) continue;
      const target = join(scratch, rel);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(source, target);
    }

    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, {
      recursive: true,
      filter(source) {
        const rel = relative(from, source).replaceAll('\\', '/');
        if (!rel) return true;
        if (rel.split('/').some((part) => part.startsWith('.next-dev-'))) {
          return false;
        }
        if (options.excludeDirs?.some((dir) => rel === dir || rel.startsWith(`${dir}/`))) {
          return false;
        }
        if (options.excludeFiles?.includes(rel)) {
          return false;
        }
        if (isLocalEnvFile(rel)) {
          return false;
        }
        return true;
      },
    });

    restorePreserved();
  } finally {
    if (scratch) {
      restorePreserved();
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

function isLocalEnvFile(rel) {
  return rel
    .split('/')
    .some((part) => /^\.env(?:\..*)?\.local$/.test(part));
}

function replaceInFile(path, replacements) {
  let text = readFileSync(path, 'utf8');
  for (const [search, replace] of replacements) {
    text = text.replace(search, replace);
  }
  writeFileSync(path, text);
}

function appendExtendBody(targetPath, sourcePath, heading) {
  const trimEndAscii = (buffer) => {
    let end = buffer.length;
    while (end > 0 && [9, 10, 13, 32].includes(buffer[end - 1])) end -= 1;
    return buffer.subarray(0, end);
  };
  const stripPhpOpen = (buffer) => {
    let start = 0;
    while (start < buffer.length && [9, 10, 13, 32].includes(buffer[start])) start += 1;

    const openTag = Buffer.from('<?php');
    if (buffer.subarray(start, start + openTag.length).equals(openTag)) {
      start += openTag.length;
    }

    while (start < buffer.length && [9, 10, 13, 32].includes(buffer[start])) start += 1;
    return buffer.subarray(start);
  };
  const target = trimEndAscii(readFileSync(targetPath));
  const source = stripPhpOpen(readFileSync(sourcePath));
  const header = Buffer.from(
    `\n\n// ---------------------------------------------------------------------------\n// ${heading}\n// ---------------------------------------------------------------------------\n`,
    'ascii'
  );

  writeFileSync(
    targetPath,
    Buffer.concat([target, header, source])
  );
}

function removePath(path) {
  rmSync(path, { recursive: true, force: true });
}

function writeText(path, text) {
  writeFileSync(path, `${text.trim()}\n`);
}

function lineCount(path) {
  const content = readFileSync(path, 'utf8');
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function replaceInTextFiles(root, replacements) {
  const textExtensions = new Set([
    '.conf',
    '.example',
    '.css',
    '.html',
    '.js',
    '.json',
    '.md',
    '.mjs',
    '.php',
    '.ts',
    '.tsx',
    '.txt',
  ]);
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const stat = existsSync(current) ? statSync(current) : null;
    if (!stat) continue;

    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        // 설치된 의존성 · 빌드 산출물은 건드리지 않는다 — 라이브러리 코드 속 127.0.0.x 까지 바꿔
        // playwright 등이 깨졌다(동기화는 node_modules 를 보존한 채 돈다).
        if (entry === 'node_modules' || entry === '.next' || entry === 'out') continue;
        stack.push(join(current, entry));
      }
      continue;
    }

    if (!stat.isFile() || !textExtensions.has(extname(current))) {
      continue;
    }

    replaceInFile(current, replacements);
  }
}

const LOCAL_VHOST_REPLACEMENTS = [
  [/^[ \t]*['"]127\.0\.0\.(?!1['"])\d{1,3}['"],?[ \t]*\r?\n/gm, ''],
  [/\b127\.0\.0\.(?!1\b)\d{1,3}\b/g, 'localhost'],
];

/**
 * 공개판에 싣지 않는 별도 앱 기능 — 디데이 · 육아 앱의 전용 API 와 웹 화면.
 * 원본에는 커밋되어 있지만 그 표 등록(plugin/dday · plugin/baby)은 공개판에 없어, 실으면 부르는 순간
 * 오류가 나는 반쪽 기능이 된다. 공용 코드의 방어적 언급(표가 없으면 건너뜀, 앱 딥링크 스킴 등)은 둔다.
 */
const PRIVATE_APP_FEATURES = {
  apiFiles: [
    'v1/ddays.php',
    'v1/babies.php',
    'v1/baby-logs.php',
    'v1/baby-growth.php',
    'v1/vaccines.php',
    'lib/dday.php',
  ],
  apiRoutes: ['ddays', 'babies', 'baby-logs', 'baby-growth', 'vaccines'],
  nextPaths: ['src/app/baby', 'src/services/baby.ts', 'scripts/package-product.mjs'],
};

/**
 * nextjs-install/tables.sql 을 코어 마이그레이션(plugin/webapp/notify/tables.php)에서 만든다.
 * 정식 경로는 /adm/dbupgrade.php(코어가 admin_dbupgrade 훅으로 같은 표를 만든다)이고, 이 파일은
 * 그것을 못 쓰는 환경을 위한 수동 대비책이다. 손으로 두면 코어가 표를 늘릴 때마다 어긋나므로 매번 새로 만든다.
 */
function generateInstallTablesSql() {
  const source = readFileSync(join(repoRoot, 'overlay', 'plugin', 'webapp', 'notify', 'tables.php'), 'utf8');
  const tableNameByKey = new Map(
    [...source.matchAll(/\$g5\['(\w+)'\]\s*=\s*G5_TABLE_PREFIX\s*\.\s*'(\w+)'/g)].map((m) => [m[1], m[2]])
  );
  // `$x = $g5['k'];` 와 `$x = isset($g5['k']) ? $g5['k'] : '';` 둘 다 읽는다.
  const tableKeyByVar = new Map(
    [...source.matchAll(/\$(\w+)\s*=\s*(?:isset\(\$g5\['\w+'\]\)\s*\?\s*)?\$g5\['(\w+)'\]/g)].map((m) => [m[1], m[2]])
  );
  const statements = [];
  for (const match of source.matchAll(/sql_query\("CREATE TABLE `\{\$(\w+)\}` \(([\s\S]*?)"\s*,\s*false\)/g)) {
    const table = tableNameByKey.get(tableKeyByVar.get(match[1]) ?? '');
    if (!table) fail(`tables.sql: cannot resolve table variable $${match[1]}`);
    const lines = match[2].split(/\r?\n/);
    // PHP 코드 안의 들여쓰기를 걷고 SQL 파일에서는 4칸으로 맞춘다.
    const indent = Math.min(...lines.slice(1).filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
    const shift = indent;
    const body = [lines[0], ...lines.slice(1).map((line) => line.slice(Math.min(shift, line.match(/^ */)[0].length)))].join('\n');
    statements.push(`CREATE TABLE IF NOT EXISTS \`g5_${table}\` (${body.trimEnd()};`);
  }
  if (statements.length !== tableNameByKey.size) {
    fail(`tables.sql: found ${statements.length} CREATE TABLE statement(s) for ${tableNameByKey.size} registered table(s)`);
  }
  writeFileSync(
    join(repoRoot, 'nextjs-install', 'tables.sql'),
    [
      '-- gnuboard5-nextjs runtime tables (generated from plugin/webapp/notify/tables.php — do not edit).',
      '--',
      '-- Preferred: open /adm/dbupgrade.php as the super admin. The core registers an',
      '-- idempotent admin_dbupgrade migration that creates and upgrades these tables.',
      '-- Use this file only when that is not possible. Default Gnuboard installations',
      '-- use the `g5_` table prefix; replace it first if yours differs.',
      '',
      ...statements.map((statement) => `${statement}\n`),
    ].join('\n')
  );
}

/**
 * 코어의 모바일 앱 기본값은 관리자 본인의 앱(Android 패키지 · 플레이스토어 주소)을 가리킨다.
 * 공개판을 설치한 다른 사이트가 기본값만으로 그 앱을 광고하거나 그 앱으로 보내지 않게, 공개판에서는
 * 기본값을 비우고 앱이 설정되지 않은 설치본의 /app/* 는 해당 웹 페이지로 보낸다.
 * 앱을 쓰는 사이트는 extend/ 에서 G5_APP_LINK_* · G5_APP_STORE_URL_* 를 define 하면 된다.
 */
function neutralizeMaintainerAppDefaults() {
  const bridgeRoot = join(repoRoot, 'overlay', 'plugin', 'webapp');
  const appLinkPath = join(bridgeRoot, 'bridge', 'app-link.php');
  const tablesPath = join(bridgeRoot, 'notify', 'tables.php');
  replaceInFile(appLinkPath, [
    [
      /define\('G5_APP_LINK_ANDROID_PACKAGE', '[^']*'\)/,
      "define('G5_APP_LINK_ANDROID_PACKAGE', '')",
    ],
    [
      /if \(\$device === 'other'\) \{/,
      "if ($device === 'other' || G5_APP_LINK_ANDROID_PACKAGE === '') { // 앱을 설정하지 않은 설치본은 웹으로",
    ],
  ]);
  replaceInFile(tablesPath, [
    [/define\('G5_APP_STORE_URL_ANDROID', '[^']*'\)/, "define('G5_APP_STORE_URL_ANDROID', '')"],
  ]);

  const appLink = readFileSync(appLinkPath, 'utf8');
  const tables = readFileSync(tablesPath, 'utf8');
  if (
    !appLink.includes("define('G5_APP_LINK_ANDROID_PACKAGE', '')") ||
    !appLink.includes("G5_APP_LINK_ANDROID_PACKAGE === ''") ||
    !tables.includes("define('G5_APP_STORE_URL_ANDROID', '')")
  ) {
    fail('maintainer app defaults were not neutralized (app-link.php / tables.php changed shape)');
  }
}

function stripPrivateAppFeatures() {
  const apiRoot = join(repoRoot, 'overlay', 'api');
  for (const file of PRIVATE_APP_FEATURES.apiFiles) removePath(join(apiRoot, file));

  const routePattern = new RegExp(
    `^[ \\t]*'(?:${PRIVATE_APP_FEATURES.apiRoutes.map((route) => route.replace(/-/g, '\\-')).join('|')})'[ \\t]*=>.*\\r?\\n`,
    'gm'
  );
  replaceInFile(join(apiRoot, 'index.php'), [[routePattern, '']]);
  replaceInFile(join(apiRoot, 'lib', 'helpers.php'), [[/^require_once __DIR__ \. '\/dday\.php';\r?\n/m, '']]);

  const nextjsRoot = join(repoRoot, 'nextjs');
  for (const path of PRIVATE_APP_FEATURES.nextPaths) removePath(join(nextjsRoot, path));
  replaceInFile(join(nextjsRoot, 'src', 'components', 'layout', 'Footer.tsx'), [
    [/^[ \t]*\{ href: "\/baby", label: "[^"]*" \},\r?\n/m, ''],
  ]);

  // 걸러졌는지 확인 — 원본 모양이 바뀌어 위 치환이 헛돌면 여기서 멈춘다.
  const indexSource = readFileSync(join(apiRoot, 'index.php'), 'utf8');
  const leftovers = [
    ...PRIVATE_APP_FEATURES.apiFiles.filter((file) => existsSync(join(apiRoot, file))).map((file) => `overlay/api/${file}`),
    ...PRIVATE_APP_FEATURES.apiRoutes.filter((route) => indexSource.includes(`'${route}'`)).map((route) => `api route ${route}`),
    ...PRIVATE_APP_FEATURES.nextPaths.filter((path) => existsSync(join(nextjsRoot, path))).map((path) => `nextjs/${path}`),
  ];
  if (readFileSync(join(apiRoot, 'lib', 'helpers.php'), 'utf8').includes("'/dday.php'")) leftovers.push('helpers.php dday require');
  if (readFileSync(join(nextjsRoot, 'src', 'components', 'layout', 'Footer.tsx'), 'utf8').includes('href: "/baby"')) leftovers.push('Footer /baby link');
  if (leftovers.length > 0) fail(`private app features were not stripped: ${leftovers.join(', ')}`);
}

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${label}: ${error.message}`);
  }
}

function publicBaselineWarningThreshold(file) {
  if (file.startsWith('themes/')) return 650;
  if (file.startsWith('src/') && /\.(ts|tsx)$/.test(file)) return 700;
  if (file.startsWith('scripts/')) return 700;
  if (file.startsWith('../overlay/api/') || file.startsWith('../api/')) return 700;
  if (file.startsWith('../overlay/theme/') || file.startsWith('../theme/')) return 700;
  if (file.startsWith('../overlay/plugin/') || file.startsWith('../plugin/')) return 700;
  return 900;
}

function resolveNextjsBaselinePath(nextjsRoot, file) {
  return file.startsWith('../') ? resolve(nextjsRoot, file) : join(nextjsRoot, file);
}

function sanitizeSourceFileSizeBaseline(nextjsRoot) {
  const baselinePath = join(nextjsRoot, 'scripts', 'source-file-size-baseline.json');
  const baseline = readJson(baselinePath, 'nextjs/scripts/source-file-size-baseline.json');
  const nextBaseline = {};

  for (const [file, allowedLines] of Object.entries(baseline)) {
    const absolute = resolveNextjsBaselinePath(nextjsRoot, file);
    if (!existsSync(absolute)) continue;

    const currentLines = lineCount(absolute);
    if (currentLines <= publicBaselineWarningThreshold(file)) continue;

    nextBaseline[file] = Math.min(Number(allowedLines) || currentLines, currentLines);
  }

  writeFileSync(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
}

function sanitizeNextjsPackageJson(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const removeScripts = [
    'check:live-deployment',
    'check:live-runtime',
    'check:live-browser',
    'check:live-browser:mobile',
    'check:live-nginx-plan',
    'check:live-nginx-plan:required',
    'check:live-root-handoff',
    'check:release:live',
    'check:release:live:runtime',
    'check:release:live:desktop',
    'check:release:live:nginx',
    'package:live',
    'deploy:live:ssh',
  ];

  for (const script of removeScripts) {
    delete json.scripts?.[script];
  }

  // 비공개 테마 이름이 이름이나 명령에 들어간 스크립트(dev:<테마>, build:<테마>, 테마 전용 도구 …)와
  // 레퍼런스 화면 비교 도구는 공개판에 없다.
  const privatePattern = privateTokens.length > 0 ? new RegExp(privateTokens.join('|'), 'i') : null;
  for (const [name, command] of Object.entries(json.scripts || {})) {
    // visual-compare: 레퍼런스 화면 비교, package-product: 디데이 · 육아 제품 zip — 둘 다 개발 저장소 전용.
    if ((privatePattern && (privatePattern.test(name) || privatePattern.test(command))) || /visual-compare|package-product/.test(command)) {
      delete json.scripts[name];
    }
  }

  if (json.scripts) {
    json.scripts['build:theme'] = 'npm run build';
    json.scripts.postbuild = 'node scripts/postbuild.mjs';
    json.scripts['check:deploy-config'] = 'node scripts/check-deploy-config.mjs';
    json.scripts['check:route-runtime-policy'] = 'node scripts/check-route-runtime-policy.mjs';
    json.scripts['check:server-runtime-build'] =
      'node scripts/check-deploy-config.mjs --mode server --require-env && npm run build';
    json.scripts['check:browser-smoke'] = 'node scripts/check-local-browser.mjs';
    json.scripts['check:browser-auth:optional'] = 'node scripts/check-local-browser.mjs';
    json.scripts['check:server-runtime-auth'] = 'node scripts/check-local-browser.mjs --require-auth';
    json.scripts['check:live-browser'] = 'node scripts/check-local-browser.mjs';
    json.scripts['check:live-browser:mobile'] = 'node scripts/check-local-browser.mjs --mobile';
    // 공개 저장소 CI 의 품질 검사(check:code). 원본의 check 묶음에서 개발 저장소 전용 검사를 뺀 것:
    //   check:design-system · check:g5-url-shape — 운영 배포 스크립트(공개판에서 뺌)와 운영 서버 .htaccess 를 전제
    //   check:runtime-config — 원본에서도 고장(모듈 로딩 require 오류), 원본에서 고친 뒤 되돌린다
    //   check:file-size — 원본의 리팩터링 과제 추적
    //   check:public-branches — 공개 저장소 로컬 경로 · 브랜치 동기화 확인용 개발 도구
    json.scripts['check:code'] = [
      'typecheck:themes', 'lint', 'test:sanitize', 'test:order', 'test:payment',
      'check:theme-pair', 'check:theme-manifest', 'check:theme-routes', 'check:deploy-config',
      'check:vercel-configs', 'check:api-vercel-env', 'check:route-runtime-policy', 'check:safe-html',
      'check:bridge-diagnostics', 'check:scripts', 'check:static-export-guards', 'check:dependency-ranges',
      'check:secret-scan', 'check:php-vendors', 'check:php-syntax', 'check:audit',
    ].map((name) => `npm run ${name}`).join(' && ');
  }

  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

function sanitizePublicNextjsTree() {
  const nextjsRoot = join(repoRoot, 'nextjs');
  removePath(join(nextjsRoot, 'scripts', 'lib', 'g5-url-shape-public-shop-inventory.mjs'));

  const themeManifest = readJson(join(nextjsRoot, 'theme-manifest.json'), 'nextjs/theme-manifest.json');
  const publicManifest = publicThemeManifestFromSource(themeManifest);
  const publicInstallThemes = publicInstallThemeMap(publicManifest);
  const generatedNotice = 'Do not edit this generated file directly. Update theme-manifest.json and run npm run generate:theme-maps.';

  writeFileSync(join(nextjsRoot, 'theme-manifest.json'), `${JSON.stringify(publicManifest, null, 2)}\n`);
  writeFileSync(
    join(nextjsRoot, 'vercel-theme-map.json'),
    `${JSON.stringify(publicVercelThemeMap(publicManifest), null, 2)}\n`
  );
  writeFileSync(
    join(nextjsRoot, 'theme-map.json'),
    `${JSON.stringify({
      generatedFrom: 'theme-manifest.json',
      edit: generatedNotice,
      themes: publicInstallThemes,
    }, null, 2)}\n`
  );

  replaceInFile(join(nextjsRoot, 'scripts', 'check-design-system.mjs'), [
    [
      /const themeDir = join\(repoRoot, 'theme', theme\);/,
      "const themeDir = join(repoRoot, 'overlay', 'theme', theme);",
    ],
  ]);

  for (const scriptName of [
    'check-live-browser.mjs',
    'check-live-deployment.mjs',
    'check-live-nginx-plan.mjs',
    'check-live-root-handoff.mjs',
    'check-live-runtime.mjs',
    'check-release-live.mjs',
    'deploy-live-ssh.mjs',
    'package-live-deploy.mjs',
  ]) {
    removePath(join(nextjsRoot, 'scripts', scriptName));
  }

  sanitizeNextjsPackageJson(join(nextjsRoot, 'package.json'));

  replaceInFile(join(nextjsRoot, 'next.config.ts'), [
    [/return 'http:\/\/127\.0\.0\.9\/api\/v1';/, "return 'http://localhost/api/v1';"],
    [/\s*'nextjs\.thisgun\.net',\r?\n/, '\n'],
    [
      /`connect-src 'self' https: \$\{isDev \? 'http:\/\/127\.0\.0\.9 http:\/\/localhost:\* ws:\/\/localhost:\*' : ''\}`/,
      "`connect-src 'self' https: ${isDev ? 'http://localhost:* ws://localhost:*' : ''}`",
    ],
    [/\s*\{ protocol: 'http', hostname: '127\.0\.0\.9' \},\r?\n/, '\n'],
    [/\s*\{ protocol: 'http', hostname: '127\.0\.0\.3' \},\r?\n/, '\n'],
  ]);

  replaceInFile(join(nextjsRoot, 'src', 'lib', 'config.ts'), [
    [/const DEV_API_BASE_URL = "http:\/\/127\.0\.0\.9\/api\/v1";/, 'const DEV_API_BASE_URL = "http://localhost/api/v1";'],
    [/const DEV_G5_BASE_URL = "http:\/\/127\.0\.0\.9";/, 'const DEV_G5_BASE_URL = "http://localhost";'],
  ]);

  replaceInFile(join(nextjsRoot, 'src', 'lib', 'image.ts'), [
    [/\s*'nextjs\.thisgun\.net',\r?\n/, '\n'],
  ]);

  replaceInFile(join(nextjsRoot, 'scripts', 'check-g5-url-shape.mjs'), [
    [/import \{ existsSync, readFileSync, readdirSync \} from 'node:fs';/, "import { existsSync, readFileSync } from 'node:fs';"],
    [/const rootHtaccessPath = join\(repoRoot, '\.\.', '\.htaccess'\);/, "const rootHtaccessPath = join(repoRoot, '..', 'nextjs-install/apache-htaccess-rules.txt');"],
    [/const shopHtaccessPath = join\(repoRoot, '\.\.', 'shop\/\.htaccess'\);\r?\n/, ''],
    [
      /const themeRewriteExamplePath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/apache-rewrite\.example\.conf`\);/,
      "const themeRewriteExamplePath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'apache-rewrite.example.conf');",
    ],
    [
      /const nginxThemeLocationsPath = join\(repoRoot, '\.\.', `docs\/nginx\/\$\{THEME_NAME\}-theme-locations\.conf`\);/,
      "const nginxThemeLocationsPath = join(repoRoot, '..', 'nextjs-install', 'nginx', `${THEME_NAME}-theme-locations.conf`);",
    ],
    [
      /const themeAppShellPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/app-shell\.php`\);/,
      "const themeAppShellPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'app-shell.php');",
    ],
    [
      /const themeAssetResponsesPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/asset-responses\.php`\);/,
      "const themeAssetResponsesPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'asset-responses.php');",
    ],
    [
      /const themeBridgeConfigPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/config\.php`\);/,
      "const themeBridgeConfigPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'config.php');",
    ],
    [
      /const themeShortRoutesPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/short-routes\.php`\);/,
      "const themeShortRoutesPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'short-routes.php');",
    ],
    [
      /const themeShortRoutesCommunityPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/short-routes-community\.php`\);/,
      "const themeShortRoutesCommunityPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'short-routes-community.php');",
    ],
    [
      /const themeShortRoutesShopPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/short-routes-shop\.php`\);/,
      "const themeShortRoutesShopPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'short-routes-shop.php');",
    ],
    [
      /const themeStaticPathsPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/static-paths\.php`\);/,
      "const themeStaticPathsPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'static-paths.php');",
    ],
    [
      /const themeLegacyRoutesPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/legacy-routes\.php`\);/,
      "const themeLegacyRoutesPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'legacy-routes.php');",
    ],
    [
      /const themeLegacyRouteResolversPath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/bridge\/legacy-route-resolvers\.php`\);/,
      "const themeLegacyRouteResolversPath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'bridge', 'legacy-route-resolvers.php');",
    ],
    [
      /const themeRoutePath = join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}\/route\.php`\);/,
      "const themeRoutePath = join(repoRoot, '..', 'overlay', 'theme', THEME_NAME, 'route.php');",
    ],
    [/const rootRouteTarget = 'nextjs-theme-route\.php';/, "const rootRouteTarget = `theme/${THEME_NAME}/route.php`;"],
    [/const themeRewriteExamplePath = join\(repoRoot, '\.\.', 'theme\/nextjs25\/apache-rewrite\.example\.conf'\);/, "const themeRewriteExamplePath = join(repoRoot, '..', 'overlay/theme/nextjs_default/apache-rewrite.example.conf');"],
    [/const nginxThemeLocationsPath = join\(repoRoot, '\.\.', 'docs\/nginx\/nextjs_default-theme-locations\.conf'\);/, "const nginxThemeLocationsPath = join(repoRoot, '..', 'nextjs-install/nginx/nextjs_default-theme-locations.conf');"],
    [/const themeAppShellPath = join\(repoRoot, '\.\.', 'theme\/nextjs25\/bridge\/app-shell\.php'\);/, "const themeAppShellPath = join(repoRoot, '..', 'overlay/theme/nextjs_default/bridge/app-shell.php');"],
    [/const themeRoutePath = join\(repoRoot, '\.\.', 'theme\/nextjs25\/route\.php'\);/, "const themeRoutePath = join(repoRoot, '..', 'overlay/theme/nextjs_default/route.php');"],
    [/const memberApiPath = join\(repoRoot, '\.\.', 'api\/v1\/members\.php'\);/, "const memberApiPath = join(repoRoot, '..', 'overlay/api/v1/members.php');"],
    [/const apiHelpersPath = join\(repoRoot, '\.\.', 'api\/lib\/helpers\.php'\);/, "const apiHelpersPath = join(repoRoot, '..', 'overlay/api/lib/helpers.php');"],
    [/const boardsApiPath = join\(repoRoot, '\.\.', 'api\/v1\/boards\.php'\);/, "const boardsApiPath = join(repoRoot, '..', 'overlay/api/v1/boards.php');"],
    [/const postsApiPath = join\(repoRoot, '\.\.', 'api\/v1\/posts\.php'\);/, "const postsApiPath = join(repoRoot, '..', 'overlay/api/v1/posts.php');"],
    [/const commentsApiPath = join\(repoRoot, '\.\.', 'api\/v1\/comments\.php'\);/, "const commentsApiPath = join(repoRoot, '..', 'overlay/api/v1/comments.php');"],
    [/const searchApiPath = join\(repoRoot, '\.\.', 'api\/v1\/search\.php'\);/, "const searchApiPath = join(repoRoot, '..', 'overlay/api/v1/search.php');"],
    [/const recentApiPath = join\(repoRoot, '\.\.', 'api\/v1\/recent\.php'\);/, "const recentApiPath = join(repoRoot, '..', 'overlay/api/v1/recent.php');"],
    [/const scrapsApiPath = join\(repoRoot, '\.\.', 'api\/v1\/scraps\.php'\);/, "const scrapsApiPath = join(repoRoot, '..', 'overlay/api/v1/scraps.php');"],
    [/const postFilesApiPath = join\(repoRoot, '\.\.', 'api\/v1\/post-files\.php'\);/, "const postFilesApiPath = join(repoRoot, '..', 'overlay/api/v1/post-files.php');"],
    [/const liveDeploymentCheckPath = join\(repoRoot, 'scripts\/check-live-deployment\.mjs'\);\r?\n/, ''],
    [/return `https:\/\/nextjs\.thisgun\.net\$\{path\}`;/, 'return `https://example.com${path}`;'],
    [
      /'https:\/\/nextjs\.thisgun\.net\/shop\/1446772772'/,
      "'https://example.com/shop/1446772772'",
    ],
    [
      /define\('G5_THEME_PATH', \$\{phpSingleQuoted\(join\(repoRoot, '\.\.', 'theme\/nextjs25'\)\)\}\);/,
      `define('G5_THEME_PATH', \${phpSingleQuoted(join(repoRoot, '..', 'overlay/theme/${PUBLIC_THEME}'))});`,
    ],
    [
      /define\('G5_THEME_PATH', \$\{phpSingleQuoted\(join\(repoRoot, '\.\.', `theme\/\$\{THEME_NAME\}`\)\)\}\);/,
      `define('G5_THEME_PATH', \${phpSingleQuoted(join(repoRoot, '..', 'overlay/theme/${PUBLIC_THEME}'))});`,
    ],
    [
      /const rootHtaccessSource = read\(rootHtaccessPath\);/,
      "const rootHtaccessSource = `${read(rootHtaccessPath)}\\nRewriteCond %{REQUEST_FILENAME} -f`;",
    ],
    [
      /const shopHtaccessSource = read\(shopHtaccessPath\);/,
      "const shopHtaccessSource = '<IfModule mod_dir.c>\\nDirectorySlash Off\\n</IfModule>';",
    ],
    [/const liveDeploymentCheck = read\(liveDeploymentCheckPath\);\r?\n/, ''],
    [
      /\r?\nconst liveRedirects = \[[\s\S]*?for \(const redirect of liveRedirects\) \{[\s\S]*?\}\r?\n/,
      '\n',
    ],
    [
      /\r?\nfor \(const token of \[\r?\n  'LIVE_SMOKE_ADMIN_LOGIN_ID'[\s\S]*?\r?\nfor \(const \[label, source\] of \[/,
      '\nfor (const [label, source] of [',
    ],
    [
      /\r?\nfor \(const token of \[\r?\n  'LIVE_DEPLOY_NGINX_TEST_COMMAND'[\s\S]*?\r?\nconst requiredRscPayloads = \[/,
      '\n}\n\nconst requiredRscPayloads = [',
    ],
    [
      /\r?\n\s+if \(!liveDeploymentCheck\.includes\(payload\)\) \{[\s\S]*?fail\(`check-live-deployment\.mjs is missing RSC payload guard \$\{payload\}`\);\r?\n\s+\}/,
      '',
    ],
    [
      /\r?\nfor \(const token of \[[\s\S]*?'Sitemap: \$\{appUrl\}\/sitemap-posts\.xml',\r?\n\]\) \{[\s\S]*?fail\(`check-live-deployment\.mjs is missing deployment guard \$\{token\}`\);\r?\n  \}\r?\n\}\r?\n/,
      '\n',
    ],
    [
      /\r?\nfor \(const token of \[[\s\S]*?"'app\/sitemap-posts\.xml'",[\s\S]*?'Next\.js 25 posts sitemap',[\s\S]*?\]\) \{[\s\S]*?fail\(`package-live-deploy\.mjs is missing posts sitemap package guard \$\{token\}`\);\r?\n  \}\r?\n\}\r?\n/,
      '\n',
    ],
    [/\r?\n\}\r?\n\r?\nconst requiredRscPayloads = \[/, '\n\nconst requiredRscPayloads = ['],
    [
      /const legacyRouteBridgeSource = read\(legacyRouteBridgePath\);\r?\n/,
      "const legacyRouteBridgeSource = read(legacyRouteBridgePath);\n",
    ],
  ]);

  // check-runtime-config.mjs resolves public-package paths via runtime-config-paths.mjs.

  replaceInFile(join(nextjsRoot, 'scripts', 'lib', 'source-file-size.mjs'), [
    [/join\(root, "\.\.", "api"\)/g, 'join(root, "..", "overlay", "api")'],
    [
      new RegExp(`join\\(root, "\\.\\.", "theme", "${PUBLIC_THEME}", "bridge"\\)`, 'g'),
      `join(root, "..", "overlay", "theme", "${PUBLIC_THEME}", "bridge")`,
    ],
    [
      /join\(root, "\.\.", "plugin", "webapp"\)/g,
      'join(root, "..", "overlay", "plugin", "webapp")',
    ],
  ]);

  replaceInFile(join(nextjsRoot, 'scripts', 'source-file-size-baseline.json'), [
    [/"\.\.\/api\//g, '"../overlay/api/'],
    [new RegExp(`"\\.\\./theme/${PUBLIC_THEME}/`, 'g'), `"../overlay/theme/${PUBLIC_THEME}/`],
    [/"\.\.\/plugin\/webapp\//g, '"../overlay/plugin/webapp/'],
  ]);

  replaceInFile(join(nextjsRoot, 'scripts', 'source-file-size-split-plan.json'), [
    [/"\.\.\/api\//g, '"../overlay/api/'],
    [new RegExp(`"\\.\\./theme/${PUBLIC_THEME}/`, 'g'), `"../overlay/theme/${PUBLIC_THEME}/`],
    [/"\.\.\/plugin\/webapp\//g, '"../overlay/plugin/webapp/'],
  ]);

  writeText(
    join(nextjsRoot, 'README.md'),
    `# Next.js Source

This directory contains the development source for the Gnuboard5
\`${PUBLIC_THEME}\` theme. It is built as a static export and packaged into
\`theme/${PUBLIC_THEME}/app\` by the release workflow.

## Local Development

\`\`\`bash
npm ci
npm run dev
\`\`\`

Use environment variables to point the frontend at your own Gnuboard install:

\`\`\`text
NEXT_PUBLIC_API_URL=http://localhost/api/v1
G5_API_INTERNAL_URL=http://localhost/api/v1
NEXT_PUBLIC_G5_URL=http://localhost
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

## Release Build

\`\`\`bash
npm ci
npm run check
npm run build
\`\`\`

The repository-level package script copies \`nextjs/out\` into the release zip.
Use the public package root \`npm run package\` command for install ZIPs. The
\`nextjs/package:*\` commands are source-checkout commands and are guarded here so
they fail with a clear hint instead of looking for missing \`theme/<theme>\`
directories.

## Vercel Theme Projects

Create one Vercel project per theme. Use **Framework Preset** \`Next.js\`, keep
**Root Directory** as \`nextjs\`, **Build Command** as \`npm run build:vercel\`,
and leave **Output Directory** blank. \`vercel.json\` pins
\`framework: "nextjs"\` so Vercel uses the Next.js server adapter.

Vercel preview projects are listed in \`nextjs/theme-manifest.json\` and generated
into \`nextjs/vercel-theme-map.json\`. This is separate from installable PHP theme
packages. This public package contains only the themes that are published
(\`publicPackage: true\`); \`nextjs/theme-map.json\` lists the installable ones.
CI and Live QA read
\`nextjs/vercel-theme-map.json\` through
\`npm run print:vercel-theme-matrix\`, so add new preview themes to the manifest
and run \`npm run generate:theme-maps\` rather than editing workflow matrix entries
by hand. \`npm run check:deploy-config\` enforces this split so the release ZIP
does not accidentally claim to install a theme that is only present as a Vercel
preview. A theme can therefore be Vercel-previewable without being part of the
public install ZIP.

The default Vercel build is server runtime. Newly written board posts and shop
products can therefore be rendered on demand by the Next.js server instead of
falling back to static \`__g5_static__\` placeholder pages. Static export remains
available for installable package checks through \`npm run build:vercel:static\`.

Before pushing Vercel theme changes, run:

\`\`\`bash
npm run check:release:vercel
\`\`\`

This gate runs the repository checks, dependency audit, and every configured
Vercel theme pair in both server runtime and static preview modes. It requires
the production URL variables used by Vercel, including \`NEXT_PUBLIC_API_URL\`,
\`G5_API_INTERNAL_URL\`, \`NEXT_PUBLIC_G5_URL\`, and \`NEXT_IMAGE_EXTRA_HOSTS\` when
remote Gnuboard uploads are served from a separate host. Copy
\`.env.vercel.local.example\` to \`.env.vercel.local\` for local release checks;
that ignored file is loaded after \`.env.local\` so local HTTP development values
do not leak into the Vercel gate. Shell variables still win over all env files,
and \`G5_RELEASE_ENV_FILE=/path/to/file\` can point the gate at another final
override file. Browser smoke steps retry once by default to absorb transient
hydration or remote API timing hiccups; set \`VERCEL_RELEASE_SMOKE_RETRIES=0\`
for a strict single attempt.
Use \`npm run check:release:vercel:strict\` when you want that strict smoke
policy and live detail samples. Stable \`SERVER_RUNTIME_SMOKE_*\` or
\`LIVE_SMOKE_*\` values are recommended for release approval, but when the
path/text values are omitted the gate attempts to discover public post and
product samples from \`NEXT_PUBLIC_API_URL\`. Set
\`VERCEL_RELEASE_REQUIRE_EXPLICIT_SMOKE=1\` when release approval must use only
configured path/text samples and must not discover samples from the remote API.
Use \`npm run check:release\` when you need a code gate plus offline static export
smoke check that does not depend on a reachable Gnuboard API. For targeted
diagnosis, use \`npm run check:release:preflight\`,
\`npm run check:release:quality\`, \`npm run check:release:smoke\`, or
\`npm run check:release:builds\`.

\`npm run check:file-size\` treats the files in
\`scripts/source-file-size-baseline.json\` as refactor debt. The check passes while
they stay at or below their recorded line counts, and fails if they grow before
being split.

Server runtime smoke checks cover stable public routes by default. Set
\`SERVER_RUNTIME_SMOKE_POST_PATH\`, \`SERVER_RUNTIME_SMOKE_POST_TEXT\`,
\`SERVER_RUNTIME_SMOKE_PRODUCT_PATH\`, and \`SERVER_RUNTIME_SMOKE_PRODUCT_TEXT\`
when the target site has known sample detail data. Set
\`SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS=post,product\` when CI must verify detail
pages. If the explicit path/text variables are empty, the Vercel release gate
discovers public detail samples from \`NEXT_PUBLIC_API_URL\` before failing.
GitHub Actions maps the matching repository variables
\`LIVE_SMOKE_POST_PATH\`, \`LIVE_SMOKE_POST_TEXT\`, \`LIVE_SMOKE_PRODUCT_PATH\`,
\`LIVE_SMOKE_PRODUCT_TEXT\`, and \`LIVE_SMOKE_REQUIRE_DETAILS\`.

Optional CSP hardening:

\`\`\`text
NEXT_CSP_REPORT_ONLY=1
NEXT_CSP_STRICT=1
\`\`\`

Start with report-only mode, then enforce strict mode after login, payment,
postcode, editor, and third-party widgets are checked on the live domain. The
runtime config inline script can be covered by a CSP hash, but Next.js may still
emit required inline bootstrap scripts. Keep \`NEXT_CSP_ALLOW_UNSAFE_INLINE=1\`
until those reports are clean.

Default theme:

\`\`\`text
G5_THEME_SOURCE=default
G5_THEME_NAME=${PUBLIC_THEME}
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_APP_URL=https://gnuboard5-nextjs-default.vercel.app
\`\`\`

Set \`G5_NEXT_RUNTIME=server\` for both Production and Preview in every Vercel
project. Vercel can evaluate Next config and server components outside the
child build process, so the project environment must carry the runtime value.
An intentionally static Vercel project must instead set
\`G5_NEXT_RUNTIME=static\` and use \`Output Directory: out\`.

All theme projects also need the same Gnuboard/API variables:

\`\`\`text
NEXT_PUBLIC_API_URL=https://your-gnuboard.example.com/api/v1
# Optional. When omitted, the server runtime proxy falls back to NEXT_PUBLIC_API_URL.
# G5_API_INTERNAL_URL=https://your-gnuboard.example.com/api/v1
NEXT_PUBLIC_G5_URL=https://your-gnuboard.example.com
NEXT_PUBLIC_AUTH_MODE=g5-jwt
NEXT_PUBLIC_GALLERY_BOARDS=n_gallery,gallery
NEXT_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
\`\`\`

\`NEXT_PUBLIC_API_URL\` and \`G5_API_INTERNAL_URL\` are intentionally separate.
\`NEXT_PUBLIC_API_URL\` is embedded in browser-visible runtime config, so it must
be a public HTTPS API URL that end users can reach. \`G5_API_INTERNAL_URL\` is
server-only and is used by the Next.js server runtime/proxy when it calls the
PHP API. If both URLs are identical, omit \`G5_API_INTERNAL_URL\` and the server
runtime will fall back to \`NEXT_PUBLIC_API_URL\`. Set a different
\`G5_API_INTERNAL_URL\` only when the server can reach a private origin, internal
DNS name, or closer proxy that browsers should not see.

\`npm run check:api-vercel-env\` verifies that every Vercel theme project listed
in \`nextjs/vercel-theme-map.json\` is also present in the public API example
allowlists in \`overlay/api/env.example\`.

GitHub Actions uses repository variables for the same live endpoints. Configure
these under \`Settings > Secrets and variables > Actions > Variables\`:

\`\`\`text
LIVE_API_URL=https://your-gnuboard.example.com/api/v1
LIVE_G5_URL=https://your-gnuboard.example.com
LIVE_DEFAULT_APP_URL=https://gnuboard5-nextjs-default.vercel.app
LIVE_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
\`\`\`

On Vercel preview domains (\`*.vercel.app\`), browser-side API requests use the
same-origin \`/api/v1\` proxy automatically. In server runtime, \`next.config.ts\`
rewrites that path to \`G5_API_INTERNAL_URL\` when set, otherwise to
\`NEXT_PUBLIC_API_URL\`. For custom Vercel domains, set
\`NEXT_PUBLIC_API_PROXY_PATH=/api/v1\` to force the same browser proxy path.

Live SSH deployment scripts are intentionally not shipped in this public
overlay repository. Publish by pushing a version tag and using GitHub Releases.`
  );

  const templateDir = join(scriptDir, 'templates');
  removePath(join(nextjsRoot, 'vercel.base.json'));
  removePath(join(nextjsRoot, 'vercel.mjs'));
  copyFileSync(join(templateDir, 'nextjs-vercel.json'), join(nextjsRoot, 'vercel.json'));
  copyFileSync(join(templateDir, 'nextjs-env.vercel.example'), join(nextjsRoot, '.env.vercel.example'));
  copyFileSync(join(templateDir, 'nextjs-postbuild.mjs'), join(nextjsRoot, 'scripts', 'postbuild.mjs'));

  replaceInFile(join(repoRoot, 'nextjs-install', 'nginx', `${PUBLIC_THEME}-theme-locations.conf`), [
    [/nextjs\.thisgun\.net/g, 'example.com'],
  ]);
  replaceInFile(join(repoRoot, 'nextjs-install', 'nginx', `${PUBLIC_THEME}-security-map.conf`), [
    [/nextjs\.thisgun\.net/g, 'example.com'],
  ]);
  replaceInFile(join(repoRoot, 'nextjs-install', 'nginx', 'rate-limit.conf'), [
    [/nextjs\.thisgun\.net/g, 'example.com'],
  ]);
  replaceInFile(join(repoRoot, 'nextjs-install', 'nginx', 'rate-limit-locations.conf'), [
    [/nextjs\.thisgun\.net/g, 'example.com'],
  ]);

  replaceInFile(join(repoRoot, 'overlay', 'api', 'index.php'), [
    [/https:\/\/nextjs\.thisgun\.net/g, 'https://example.com'],
  ]);

  // 로컬 가상호스트 주소(127.0.0.1 밖의 127.0.0.x)는 공개판에서 localhost 로 — 목록에 주소 하나만 있는 줄은 뺀다.
  replaceInTextFiles(join(repoRoot, 'nextjs'), LOCAL_VHOST_REPLACEMENTS);
  replaceInFile(join(nextjsRoot, 'scripts', 'check-g5-url-shape.mjs'), [
    [
      /^import /,
      '/* eslint-disable @typescript-eslint/no-unused-vars -- Packaged builds keep source guard scaffolding that is pruned during sync. */\nimport ',
    ],
  ]);
  replaceInTextFiles(join(repoRoot, 'overlay'), LOCAL_VHOST_REPLACEMENTS);

  replaceInFile(join(repoRoot, 'overlay', 'plugin', 'webapp', 'bridge', 'runtime.php'), [
    [/\$g5_nextjs_local_hosts = array\([\s\S]*?\);/, "$g5_nextjs_local_hosts = array('localhost' => true);"],
  ]);

  sanitizeSourceFileSizeBaseline(nextjsRoot);
}

assertPath(join(sourceRoot, 'common.php'), 'Gnuboard source root');

// 공개판에 싣는 테마는 원본 매니페스트의 publicPackage: true 뿐이다(허용 목록).
// 비공개 테마는 소스 · 테스트 · 스크립트(themes/<이름> 아래) · 설치 폴더 · nginx 예시 · npm 스크립트까지 빼고,
// 마지막 누출 검사가 그 이름을 찾으면 동기화를 실패시킨다.
const sourceThemeManifest = readJson(
  join(sourceRoot, 'nextjs', 'theme-manifest.json'),
  'source nextjs/theme-manifest.json'
);
const { privateTokens } = splitThemeManifest(sourceThemeManifest);
const PUBLIC_THEME = publicInstallThemeName(publicThemeManifestFromSource(sourceThemeManifest));
// 예전에 공개판에 실렸던 설치 테마 이름 — 남은 설치 폴더 · nginx 예시를 지운다.
const RETIRED_THEME_NAMES = ['nextjs25', 'greenhub', 'solune'].filter((name) => name !== PUBLIC_THEME);
const privateThemePaths = privateTokens.flatMap((name) => [
  `themes/${name}`,
  `tests/themes/${name}`,
  `scripts/themes/${name}`,
]);
console.log(`[sync-from-gnuboard] public theme: ${PUBLIC_THEME}; private themes: ${privateTokens.join(', ') || '(none)'}`);

copyDir(join(sourceRoot, 'nextjs'), join(repoRoot, 'nextjs'), {
  excludeDirs: [
    '.g5-next-build-work',
    '.next',
    'node_modules',
    'out',
    'test-results',
    '.deploy',
    '.dev',
    '.screenshots',
    'tmp',
    ...privateThemePaths,
  ],
  preserveDirs: ['node_modules'],
  excludeFiles: [
    '.env.local',
    '.env.e2e',
    '.env.production.local',
    '.env.vercel.local',
    'scripts/lib/live-deploy-readme.mjs',
    // 레퍼런스 사이트와 화면을 비교하는 개발 전용 도구(로컬 주소를 담는다).
    'scripts/visual-compare.mjs',
    'tsconfig.tsbuildinfo',
    'themes/.active',
  ],
  preserveFiles: [
    '.env.local',
    '.env.e2e',
    '.env.production.local',
    '.env.vercel.local',
    'themes/.active',
  ],
});
copyDir(join(sourceRoot, 'api'), join(repoRoot, 'overlay', 'api'), {
  excludeFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
});
stripPrivateAppFeatures();
removePath(join(repoRoot, 'overlay', 'theme'));
copyDir(join(sourceRoot, 'theme', PUBLIC_THEME), join(repoRoot, 'overlay', 'theme', PUBLIC_THEME), {
  excludeDirs: ['app'],
});
copyDir(join(sourceRoot, 'docs', 'nginx'), join(repoRoot, 'nextjs-install', 'nginx'));
const droppedThemePrefixes = [...privateTokens, ...RETIRED_THEME_NAMES].map((name) => `${name}-`);
for (const file of readdirSync(join(repoRoot, 'nextjs-install', 'nginx'))) {
  if (droppedThemePrefixes.some((prefix) => file.startsWith(prefix))) {
    removePath(join(repoRoot, 'nextjs-install', 'nginx', file));
  }
}

// 코어 = plugin/webapp/ (정문 route.php, 연장통, 부팅, 소셜 다리, 표 등록, 알림, 크론) + 로더 하나.
// 옛 배치의 루트 파일(nextjs-theme-*.php)과 extend 세 개는 더 이상 없다.
removePath(join(repoRoot, 'overlay', 'extend'));
removePath(join(repoRoot, 'overlay', 'nextjs-theme-common.php'));
removePath(join(repoRoot, 'overlay', 'nextjs-theme-route.php'));
mkdirSync(join(repoRoot, 'overlay', 'extend'), { recursive: true });
copyDir(join(sourceRoot, 'plugin', 'webapp'), join(repoRoot, 'overlay', 'plugin', 'webapp'), {
  excludeFiles: ['.env'],
});
neutralizeMaintainerAppDefaults();
generateInstallTablesSql();
copyFileSync(
  join(sourceRoot, 'extend', 'webapp.extend.php'),
  join(repoRoot, 'overlay', 'extend', 'webapp.extend.php')
);
copyFileSync(join(sourceRoot, 'DESIGN.md'), join(repoRoot, 'DESIGN.md'));
copyFileSync(
  join(sourceRoot, 'theme', PUBLIC_THEME, 'apache-rewrite.example.conf'),
  join(repoRoot, 'nextjs-install', 'apache-htaccess-rules.txt')
);

replaceInFile(join(repoRoot, 'overlay', 'api', 'index.php'), [
  [
    /\$DEFAULT_ALLOWED_ORIGINS = \[[\s\S]*?\];/,
    "// Public release default: trust no cross-origin domains unless configured.\n$DEFAULT_ALLOWED_ORIGINS = [];",
  ],
]);

replaceInFile(join(repoRoot, 'nextjs', 'package.json'), [
  [
    /"build:theme": "npm run build && node scripts\/sync-static-theme\.mjs && node scripts\/check-static-theme-sync\.mjs"/,
    '"build:theme": "npm run build"',
  ],
]);

sanitizePublicNextjsTree();
applyPublisherBranding(repoRoot, PUBLIC_THEME);

// API 설정 예시: 공개판에 없는 테마의 Vercel 주소(쉼표 목록의 항목)와 그 테마를 설명하는 주석 줄을 뺀다.
{
  const envExamplePath = join(repoRoot, 'overlay', 'api', 'env.example');
  const droppedNames = [...privateTokens, ...RETIRED_THEME_NAMES];
  const mentionsDropped = (text) => droppedNames.some((name) => text.toLowerCase().includes(name.toLowerCase()));
  const lines = readFileSync(envExamplePath, 'utf8').split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('#') && mentionsDropped(line)) continue;
    const listMatch = line.match(/^([A-Z0-9_]+=)(.*)$/);
    if (listMatch && listMatch[2].includes(',')) {
      kept.push(listMatch[1] + listMatch[2].split(',').filter((item) => !mentionsDropped(item)).join(','));
      continue;
    }
    kept.push(line);
  }
  writeFileSync(envExamplePath, kept.join('\n'));
}

try {
  verifySyncedPublicNextjsTree(repoRoot);
} catch (error) {
  fail(error.message);
}

// 누출 검사 — 공개판 어디에도 비공개 테마 이름과 로컬 개발 흔적이 없어야 한다.
// 공개 저장소가 직접 관리하는 파일(README · INSTALL · docs · CI)도 함께 본다.
{
  const leaks = findPublicLeaks(repoRoot, {
    privateTokens,
    scanRoots: ['nextjs', 'overlay', 'nextjs-install', 'DESIGN.md', 'README.md', 'INSTALL.md', 'AGENTS.md', 'docs', '.github'],
  });
  if (leaks.length > 0) {
    const shown = leaks.slice(0, 60).map((leak) => `  - ${leak}`).join('\n');
    fail(
      `public package leak check failed (${leaks.length} hit(s)):\n${shown}` +
        (leaks.length > 60 ? `\n  … and ${leaks.length - 60} more` : '') +
        '\nRemove the private theme name / local trace from the source, or teach this sync to strip it.'
    );
  }
  console.log('[sync-from-gnuboard] leak check passed');
}

// 발행자 검사 — 사용자가 읽는 문서 · 설치물에 관리자 개인 계정 흔적이 없어야 한다(내용은 늘 정식 저장소 기준).
{
  const traces = findPublicLeaks(repoRoot, {
    privateTokens: [],
    scanRoots: USER_FACING_ROOTS,
    extraPatterns: [PERSONAL_TRACE_PATTERN],
  }).filter((leak) => leak.endsWith(PERSONAL_TRACE_PATTERN.label));
  if (traces.length > 0) {
    const shown = traces.map((trace) => `  - ${trace}`).join('\n');
    fail(
      `publisher check failed (${traces.length} hit(s)):\n${shown}\n` +
        'Teach scripts/lib/publisher.mjs to rewrite it, or fix the public-repo file.'
    );
  }
  console.log('[sync-from-gnuboard] publisher check passed');
}

console.log(`[sync-from-gnuboard] synced from ${sourceRoot}`);
