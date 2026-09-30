import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allThemePairs, assertThemeSource, themeSourceDir } from './theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');

function read(path) {
  return readFileSync(path, 'utf8');
}

function assertIncludes(content, token, label) {
  if (!content.includes(token)) {
    failures.push({ check: label, detail: `missing ${token}` });
  } else {
    checks.push({ check: label, status: 'ok' });
  }
}

function assertExcludes(content, token, label) {
  if (content.includes(token)) {
    failures.push({ check: label, detail: `unexpected ${token}` });
  } else {
    checks.push({ check: label, status: 'ok' });
  }
}

const failures = [];
const checks = [];

function projectPath(path) {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

function assertExists(path, label) {
  if (existsSync(path)) {
    checks.push({ check: label, status: 'ok' });
  } else {
    failures.push({ check: label, detail: `missing ${projectPath(path)}` });
  }
}

function runGenericThemeChecks({ source, theme }) {
  try {
    assertThemeSource(source);
    checks.push({ check: `${source}->${theme} source has required theme files`, status: 'ok' });
  } catch (error) {
    failures.push({
      check: `${source}->${theme} source has required theme files`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const sourceConfig = join(themeSourceDir(source), 'theme.config.ts');
  if (existsSync(sourceConfig)) {
    assertIncludes(read(sourceConfig), `name: "${source}"`, `${source}->${theme} source config names source`);
  }

  const themeDir = join(repoRoot, 'overlay', 'theme', theme);
  const runtimeFiles = [
    'theme.php',
    'theme.config.php',
    'readme.txt',
    'head.php',
    'tail.php',
    'route.php',
    'bridge/config.php',
    'bridge/app-shell.php',
    `css/${theme}.css`,
  ];

  assertExists(themeDir, `${source}->${theme} runtime theme directory exists`);
  for (const file of runtimeFiles) {
    assertExists(join(themeDir, file), `${source}->${theme} runtime has ${file}`);
  }

  const canonicalRoutes = join(themeDir, 'theme.routes.json');
  const sourceRoutes = join(themeSourceDir(source), 'theme.routes.json');
  if (existsSync(canonicalRoutes) || existsSync(sourceRoutes)) {
    const routes = assertJsonObject(canonicalRoutes, `${source}->${theme} routes JSON is valid`);
    const routeMirror = assertJsonObject(sourceRoutes, `${source}->${theme} source route JSON mirror is valid`);
    if (JSON.stringify(routeMirror) === JSON.stringify(routes)) {
      checks.push({ check: `${source}->${theme} source route JSON mirrors runtime route JSON`, status: 'ok' });
    } else {
      failures.push({
        check: `${source}->${theme} source route JSON mirrors runtime route JSON`,
        detail: `${projectPath(sourceRoutes)} differs from ${projectPath(canonicalRoutes)}`,
      });
    }
  }

  const runtimeTokens = join(themeDir, 'theme.tokens.json');
  if (existsSync(runtimeTokens)) {
    assertJsonObject(runtimeTokens, `${source}->${theme} runtime tokens JSON is valid`);
    assertExists(join(themeDir, 'bridge/theme-tokens.php'), `${source}->${theme} runtime token bridge exists`);
  }
}

function assertJsonObject(path, label) {
  try {
    const value = JSON.parse(read(path));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      checks.push({ check: label, status: 'ok' });
      return value;
    }
    failures.push({ check: label, detail: 'not a JSON object' });
  } catch (error) {
    failures.push({ check: label, detail: error.message });
  }
  return {};
}

/* 테마와 상관없는 패키지 · 운영 스크립트 검사. 예전에는 greenhub 전용 검사 안에 섞여 있었다
   (2026-09-28 default · greenhub 테마 제거 때 공통으로 옮김). 운영 스크립트가 테마 이름을 박지 않고
   theme-name.mjs · theme-pair.mjs 로 지금 테마를 따르는지 본다. */
function runPackagingScriptChecks() {
  const scriptPath = (name) => join(nextRoot, 'scripts', name);
  const packageTheme = read(scriptPath('package-theme.mjs'));
  const packageLiveDeploy = read(scriptPath('package-live-deploy.mjs'));
  const checkLiveDeployment = read(scriptPath('check-live-deployment.mjs'));
  const checkLiveLegacyAdmin = read(scriptPath('check-live-legacy-admin.mjs'));
  const checkLiveNginxPlan = read(scriptPath('check-live-nginx-plan.mjs'));
  const checkLiveRootHandoff = read(scriptPath('check-live-root-handoff.mjs'));
  const checkLiveOps = read(scriptPath('check-live-ops.mjs'));

  assertIncludes(packageTheme, "'theme.tokens.json'", 'theme package includes runtime token JSON');
  assertIncludes(packageTheme, "'theme.routes.json'", 'theme package includes shared route JSON');
  assertIncludes(packageTheme, "'bridge/theme-tokens.php'", 'theme package includes runtime token bridge');
  assertIncludes(packageTheme, 'fileIntegrity', 'theme package manifest includes per-file integrity');
  assertIncludes(packageTheme, 'staticAppAudit', 'theme package manifest records static app audit');
  assertIncludes(packageTheme, 'G5_PACKAGE_STRICT_STATIC_AUDIT', 'theme package can fail strict static app audit');
  assertIncludes(packageLiveDeploy, "'theme.tokens.json'", 'live package requires runtime token JSON');
  assertIncludes(packageLiveDeploy, "'theme.routes.json'", 'live package requires shared route JSON');
  assertIncludes(packageLiveDeploy, "'bridge/theme-tokens.php'", 'live package requires runtime token bridge');
  assertIncludes(packageLiveDeploy, "from './theme-pair.mjs'", 'live package imports theme source resolver');
  assertIncludes(packageLiveDeploy, 'nextjs/themes/${THEME_SOURCE_NAME}/', 'live package snapshots active theme source');
  assertIncludes(packageLiveDeploy, "'nextjs/theme-map.json'", 'live package snapshots theme map');
  assertExcludes(packageLiveDeploy, 'G5 Next.js 25 Live Deploy Package', 'live package readme title is theme-neutral');
  assertExcludes(packageLiveDeploy, 'Next.js 25 theme', 'live package avoids legacy theme labels');
  assertIncludes(checkLiveDeployment, "from './theme-name.mjs'", 'live deployment check imports theme name');
  assertIncludes(checkLiveDeployment, 'theme/${THEME_NAME}', 'live deployment check hints active theme dynamically');
  assertIncludes(checkLiveDeployment, 'CONFIRM_APPLY=${THEME_NAME}', 'live deployment check confirms dynamic theme');
  assertIncludes(checkLiveDeployment, "'<!--g5_static-->'", 'live deployment check recognizes neutral static shell marker');
  assertIncludes(checkLiveDeployment, 'RUNTIME_CONFIG_KEY', 'live deployment check recognizes neutral runtime config key');
  assertExcludes(checkLiveDeployment, '/tmp/g5-nextjs25-live-deploy', 'live deployment check avoids legacy remote dir default');
  assertExcludes(checkLiveDeployment, 'theme/nextjs25', 'live deployment check avoids legacy theme path hints');
  assertIncludes(checkLiveLegacyAdmin, "from './theme-name.mjs'", 'live legacy admin check imports theme runtime key');
  assertIncludes(checkLiveLegacyAdmin, "'<!--g5_static-->'", 'live legacy admin check recognizes neutral static shell marker');
  assertIncludes(checkLiveLegacyAdmin, 'RUNTIME_CONFIG_KEY', 'live legacy admin check recognizes neutral runtime config key');
  assertIncludes(checkLiveNginxPlan, "from './theme-name.mjs'", 'live nginx plan imports theme name');
  assertIncludes(checkLiveNginxPlan, 'packageName()', 'live nginx plan uses dynamic package name');
  assertIncludes(checkLiveNginxPlan, 'CONFIRM_APPLY=${THEME_NAME}', 'live nginx plan confirms dynamic theme');
  assertExcludes(checkLiveNginxPlan, '/tmp/g5-nextjs25-live-deploy', 'live nginx plan avoids legacy remote dir default');
  assertIncludes(checkLiveRootHandoff, "from './theme-name.mjs'", 'live root handoff imports theme name');
  assertIncludes(checkLiveRootHandoff, "from './theme-pair.mjs'", 'live root handoff imports theme source resolver');
  assertIncludes(checkLiveRootHandoff, 'packageName as themePackageName', 'live root handoff uses dynamic package name');
  assertIncludes(checkLiveRootHandoff, 'nextjs/themes/${themeSourceName}/', 'live root handoff watches active theme source');
  assertIncludes(checkLiveRootHandoff, 'location = /theme/${THEME_NAME}/route.php', 'live root handoff checks active theme route dynamically');
  assertExcludes(checkLiveRootHandoff, 'nextjs25-live', 'live root handoff avoids legacy archive name');
  assertExcludes(checkLiveRootHandoff, 'theme/nextjs25', 'live root handoff avoids legacy theme path');
  assertExcludes(checkLiveRootHandoff, 'CONFIRM_APPLY=nextjs25', 'live root handoff avoids legacy confirm theme');
  assertIncludes(checkLiveOps, 'THEME_NAME', 'live ops report uses active theme name');
}

const checkedSources = new Set();

for (const pair of allThemePairs()) {
  runGenericThemeChecks(pair);

  if (checkedSources.has(pair.source)) {
    continue;
  }
  checkedSources.add(pair.source);
  checks.push({ check: `${pair.source} uses generic design invariants`, status: 'ok' });
}

runPackagingScriptChecks();

console.table([...checks, ...failures.map((failure) => ({ ...failure, status: 'fail' }))]);

if (failures.length > 0) {
  console.error(`[check-design-system] ${failures.length} design invariant(s) failed`);
  process.exit(1);
}

console.log(`[check-design-system] ${checkedSources.size} theme source(s) passed design invariants`);
