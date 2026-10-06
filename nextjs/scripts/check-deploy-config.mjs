import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  allThemePairs,
  assertThemeSource,
  nextRoot,
  resolveThemePair,
  themeSourceDir,
} from './theme-pair.mjs';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';
import { createVercelConfig } from './vercel-config.mjs';
import { checkBuildNextScript, checkLiveOpsWorkflow } from './lib/deploy-config-source-guards.mjs';
import { checkThemeCreationScripts } from './lib/deploy-config-theme-creation-guards.mjs';
import { checkPackageScriptContracts } from './lib/deploy-config-package-scripts.mjs';
import { checkReleaseScriptContracts } from './lib/deploy-config-release-scripts.mjs';
import { checkVercelDashboardDocs } from './lib/deploy-config-doc-guards.mjs';
import {
  checkLiveQaWorkflow,
  checkVercelCiWorkflows,
  checkVercelThemeMatrixScript,
} from './lib/deploy-config-workflow-guards.mjs';

const args = process.argv.slice(2);
const allowedModes = new Set(['repository', 'static', 'server', 'vercel']);
const mode = option('mode') || process.env.G5_DEPLOY_CHECK_MODE || 'repository';
const requireEnv = hasFlag('require-env') || process.env.G5_DEPLOY_CHECK_REQUIRE_ENV === '1';
const allowGenericVercelUrl =
  hasFlag('allow-generic-vercel-url') || process.env.G5_ALLOW_GENERIC_VERCEL_URL === '1';

const packageJsonPath = join(nextRoot, 'package.json');
const npmrcPath = join(nextRoot, '.npmrc');
const rootPackageJsonPath = join(nextRoot, '..', 'package.json');
const vercelJsonPath = join(nextRoot, 'vercel.json');
const vercelServerJsonPath = join(nextRoot, 'vercel.server.json');
const vercelStaticJsonPath = join(nextRoot, 'vercel.static.json');
const themeMapPath = join(nextRoot, 'theme-map.json');
const vercelThemeMapPath = join(nextRoot, 'vercel-theme-map.json');
const liveQaWorkflowPath = join(nextRoot, '..', '.github', 'workflows', 'live-qa.yml');
const vercelCiWorkflowPaths = [join(nextRoot, '..', '.github', 'workflows', 'ci.yml'), join(nextRoot, '..', '.github', 'workflows', 'nextjs25-ci.yml')];
const buildVercelThemePath = join(nextRoot, 'scripts', 'build-vercel-theme.mjs');
const printVercelThemeMatrixPath = join(nextRoot, 'scripts', 'print-vercel-theme-matrix.mjs');
const checkRouteRuntimePolicyPath = join(nextRoot, 'scripts', 'check-route-runtime-policy.mjs');
const checkSafeHtmlUsagePath = join(nextRoot, 'scripts', 'check-safe-html-usage.mjs');
const checkSourceFileSizePath = join(nextRoot, 'scripts', 'check-source-file-size.mjs');
const sourceFileSizeLibPath = join(nextRoot, 'scripts', 'lib', 'source-file-size.mjs');
const smokePathsPath = join(nextRoot, 'tests', 'smoke-paths.ts');
const postDetailSpecPath = join(nextRoot, 'tests', 'post-detail.spec.ts');
const productDetailSpecPath = join(nextRoot, 'tests', 'product-detail.spec.ts');
const createThemeSourcePath = join(nextRoot, 'scripts', 'create-theme-source.mjs');
const createThemePath = join(nextRoot, 'scripts', 'create-theme.mjs');
const generateVercelConfigPath = join(nextRoot, 'scripts', 'generate-vercel-config.mjs');
const writeApacheHeadersPath = join(nextRoot, 'scripts', 'write-apache-static-headers.mjs');
const liveEnvPath = join(nextRoot, 'scripts', 'lib', 'live-env.mjs');
const vercelDashboardDocPaths = [
  join(nextRoot, 'README.md'),
  join(nextRoot, '..', 'docs', 'DEPLOY_CHECKLIST.md'),
  join(nextRoot, '..', 'docs', 'NEXTJS-THEME-PREVIEW-VERCEL.md'),
];

const errors = [];

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function option(name) {
  const key = `--${name}`;
  const index = args.indexOf(key);
  if (index >= 0) return args[index + 1] || '';

  const prefix = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

function fail(message) {
  errors.push(message);
}

function readJson(path, label) {
  if (!existsSync(path)) {
    fail(`${label} is missing`);
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function env(name) {
  return String(process.env[name] || '').trim();
}

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function requireEnvValue(name) {
  const value = env(name);
  if (!value) fail(`Missing ${name}`);
  return value;
}

function requireScript(scripts, name, expectedPart) {
  const value = scripts?.[name];
  if (!value) {
    fail(`package.json is missing script ${name}`);
    return '';
  }

  if (expectedPart && !value.includes(expectedPart)) {
    fail(`package.json script ${name} must include ${expectedPart}`);
  }

  return value;
}

function checkThemeSources() {
  for (const pair of allThemePairs()) {
    try {
      assertThemeSource(pair.source);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}

function checkVercelBuildScripts(scripts) {
  for (const [name, command] of Object.entries(scripts || {})) {
    if (!name.startsWith('build:vercel:')) continue;

    const source = command.match(/--source\s+([^\s]+)/)?.[1];
    if (source && !existsSync(themeSourceDir(source))) {
      fail(`package.json script ${name} references missing theme source ${source}`);
    }
  }
}

function checkVercelThemeMap(scripts) {
  let pairs;
  try {
    pairs = allVercelThemePairs();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  for (const pair of pairs) {
    try {
      assertThemeSource(pair.source);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }

    if (!Number.isInteger(pair.devPort) || pair.devPort < 1 || pair.devPort > 65535) {
      fail(`vercel-theme-map.json has invalid devPort for ${pair.source}->${pair.theme}`);
    }

    if (pair.appUrl && !isHttpsUrl(pair.appUrl)) {
      fail(`vercel-theme-map.json appUrl for ${pair.source}->${pair.theme} must be an absolute HTTPS URL`);
    }

    const appHost = hostOf(pair.appUrl);
    const expectedToken = pair.source === 'default' ? 'default' : pair.source;
    if (appHost.endsWith('.vercel.app') && !appHost.includes(expectedToken)) {
      fail(`vercel-theme-map.json appUrl host ${appHost} must include theme source token ${expectedToken}`);
    }

    const scriptName = `build:vercel:${pair.source}`;
    const command = scripts?.[scriptName] || '';
    if (command && (!command.includes(`--source ${pair.source}`) || !command.includes(`--name ${pair.theme}`))) {
      fail(`package.json script ${scriptName} must build ${pair.source}->${pair.theme}`);
    }
  }
}

function checkLiveTargetGuards(scripts = {}) {
  if (!existsSync(liveEnvPath)) {
    fail('scripts/lib/live-env.mjs is missing');
  }

  const liveEnvSource = readFileSync(liveEnvPath, 'utf8');
  for (const token of ['requireLiveEnv', 'LIVE_APP_URL', 'LIVE_DEPLOY_HOST', 'LIVE_DEPLOY_WEB_ROOT']) {
    if (!liveEnvSource.includes(token)) {
      fail(`scripts/lib/live-env.mjs is missing explicit live target guard ${token}`);
    }
  }

  const guardedLiveScripts = [
    'check-live-browser.mjs',
    'check-live-runtime.mjs',
    'check-live-deployment.mjs',
    'check-live-migration-counts.mjs',
    'check-live-migration-sample.mjs',
    'check-live-legacy-admin.mjs',
    'check-live-nginx-plan.mjs',
    'check-live-root-handoff.mjs',
    'check-live-rsc-payloads.mjs',
    'check-live-social-redirects.mjs',
    'check-live-youngcart-legacy-routes.mjs',
    'check-live-youngcart-order-flow.mjs',
    'deploy-live-ssh.mjs',
    'package-live-deploy.mjs',
  ];
  const forbiddenDefaults = [
    'https://nextjs.thisgun.net',
    '/home/nextjs/www/study-gnuboard',
    '/etc/nginx/sites-enabled/nextjs.thisgun.net',
  ];
  const scriptCommandSource = Object.values(scripts).join('\n');

  for (const scriptName of guardedLiveScripts) {
    const scriptPath = join(nextRoot, 'scripts', scriptName);
    if (!existsSync(scriptPath)) {
      if (scriptCommandSource.includes(`scripts/${scriptName}`)) {
        fail(`${scriptName} is referenced by package.json but missing`);
      }
      continue;
    }

    const source = readFileSync(scriptPath, 'utf8');
    if (!source.includes('./lib/live-env.mjs')) {
      fail(`${scriptName} must use scripts/lib/live-env.mjs for explicit live target defaults`);
    }

    if (scriptName === 'check-live-runtime.mjs') {
      for (const token of [
        'RUNTIME_EXPECTED_CSP_SCRIPT_MODE',
        'LIVE_EXPECTED_CSP_SCRIPT_MODE',
        'inline-compatible',
        'RUNTIME_EXPECTED_ADMIN_SCOPE',
        'LIVE_EXPECTED_ADMIN_SCOPE',
        'RUNTIME_EXPECTED_API_URL',
        'LIVE_EXPECTED_RUNTIME_API_URL',
        'RUNTIME_RSC_TRANSPORT',
        'server-request',
      ]) {
        if (!source.includes(token)) {
          fail(`${scriptName} must configure the Vercel-compatible CSP smoke mode ${token}`);
        }
      }
    }

    for (const forbidden of forbiddenDefaults) {
      if (source.includes(forbidden)) {
        fail(`${scriptName} must not default to ${forbidden}; require explicit live env instead`);
      }
    }
  }
}

function checkDetailSmokeTests() {
  if (!existsSync(smokePathsPath)) {
    fail('tests/smoke-paths.ts is missing');
  } else {
    const smokePathSource = readFileSync(smokePathsPath, 'utf8');
    for (const token of [
      'UI_SMOKE_EXTRA_PATHS',
      'UI_SMOKE_POST_PATH',
      'SERVER_RUNTIME_SMOKE_POST_PATH',
      'LIVE_SMOKE_POST_PATH',
      'UI_SMOKE_PRODUCT_PATH',
      'SERVER_RUNTIME_SMOKE_PRODUCT_PATH',
      'LIVE_SMOKE_PRODUCT_PATH',
    ]) {
      if (!smokePathSource.includes(token)) {
        fail(`tests/smoke-paths.ts must support configured detail smoke path token ${token}`);
      }
    }
  }

  for (const [specPath, label] of [
    [postDetailSpecPath, 'post detail'],
    [productDetailSpecPath, 'product detail'],
  ]) {
    if (!existsSync(specPath)) {
      fail(`${label} smoke spec is missing`);
    }

    const source = readFileSync(specPath, 'utf8');
    for (const token of [
      'detailSmokeRequired',
      'UI_SMOKE_REQUIRE_DETAILS',
      'SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS',
      'LIVE_SMOKE_REQUIRE_DETAILS',
    ]) {
      if (!source.includes(token)) {
        fail(`${label} smoke spec must fail instead of skip when required details are configured: ${token}`);
      }
    }
  }
}

function checkPublicPackagePolicy() {
  if (!existsSync(rootPackageJsonPath)) return;

  const rootPackageJson = readJson(rootPackageJsonPath, 'root package.json');
  if (rootPackageJson.name !== 'gnuboard5-nextjs25-theme') return;

  // 공개 배포판은 nextjs_default 테마 하나를 싣는다(2026-09-28, default · greenhub 테마 제거).
  const themeMap = readJson(themeMapPath, 'theme-map.json');
  const vercelThemeMap = readJson(vercelThemeMapPath, 'vercel-theme-map.json');
  const installThemes =
    themeMap.themes && typeof themeMap.themes === 'object' && !Array.isArray(themeMap.themes)
      ? themeMap.themes
      : {};
  const installThemeNames = Object.keys(installThemes).sort();

  if (installThemeNames.length !== 1 || installThemeNames[0] !== 'nextjs_default') {
    fail('public package theme-map.json must only package nextjs_default');
  }

  if (installThemes.nextjs_default?.source !== 'default') {
    fail('public package theme-map.json must map nextjs_default <- default');
  }

  const previewThemes = Array.isArray(vercelThemeMap.themes) ? vercelThemeMap.themes : [];
  const hasSolunePreview = previewThemes.some(
    (pair) => pair?.source === 'default' && pair?.theme === 'nextjs_default'
  );

  if (!hasSolunePreview) {
    fail('public package vercel-theme-map.json must keep the nextjs_default preview project');
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function checkRepositoryContracts() {
  const packageJson = readJson(packageJsonPath, 'package.json');
  const vercelJson = readJson(vercelJsonPath, 'vercel.json');
  const vercelServerJson = readJson(vercelServerJsonPath, 'vercel.server.json');
  const vercelStaticJson = readJson(vercelStaticJsonPath, 'vercel.static.json');
  const scripts = packageJson.scripts || {};

  requireScript(scripts, 'build', 'scripts/build-next.mjs');
  requireScript(scripts, 'build:vercel', 'scripts/build-vercel-theme.mjs');
  requireScript(scripts, 'build:vercel:static', 'scripts/build-vercel-theme.mjs --runtime static');
  requireScript(scripts, 'generate:vercel-config', 'scripts/generate-vercel-config.mjs');
  requireScript(scripts, 'generate:vercel-config:server', '--runtime server --output vercel.server.json');
  requireScript(scripts, 'generate:vercel-config:static', '--runtime static --output vercel.static.json');
  requireScript(scripts, 'generate:theme-maps', 'scripts/generate-theme-maps.mjs --write');
  requireScript(scripts, 'check:deploy-config', 'scripts/check-deploy-config.mjs');
  const vercelConfigsCheck = requireScript(scripts, 'check:vercel-configs', 'scripts/generate-vercel-config.mjs');
  for (const token of ['--runtime server --check', '--output vercel.server.json --check', '--runtime static --output vercel.static.json --check']) {
    if (!vercelConfigsCheck.includes(token)) {
      fail(`package.json script check:vercel-configs must include ${token}`);
    }
  }
  requireScript(scripts, 'check:runtime-config', 'scripts/check-runtime-config.mjs');
  requireScript(scripts, 'check:route-runtime-policy', 'scripts/check-route-runtime-policy.mjs');
  requireScript(scripts, 'check:safe-html', 'scripts/check-safe-html-usage.mjs');
  requireScript(scripts, 'check:theme-manifest', 'scripts/generate-theme-maps.mjs --check');
  requireScript(scripts, 'check:php-vendors', 'scripts/check-php-vendor-inventory.mjs');
  requireScript(scripts, 'check:php-syntax', 'scripts/check-php-syntax.mjs');
  requireScript(scripts, 'check:static-export-guards', 'scripts/check-static-export-guards.mjs');
  requireScript(scripts, 'check:dependency-ranges', 'scripts/check-dependency-ranges.mjs');
  requireScript(scripts, 'check:secret-scan', 'scripts/check-secret-scan.mjs');
  requireScript(scripts, 'check:static-build-budget', 'scripts/check-static-build-budget.mjs');
  requireScript(scripts, 'check:static-ui-smoke', 'scripts/check-static-ui-smoke.mjs');
  requireScript(scripts, 'check:static-ui-smoke:fixture', 'scripts/check-static-ui-smoke.mjs --fixture-api');
  requireScript(scripts, 'check:server-runtime-smoke', 'scripts/check-server-runtime-smoke.mjs');
  requireScript(scripts, 'check:file-size', 'scripts/check-source-file-size.mjs');
  requireScript(scripts, 'report:file-size', 'scripts/report-source-file-hotspots.mjs');
  requireScript(scripts, 'check:a11y', 'playwright test tests/a11y.spec.ts');
  requireScript(scripts, 'check:audit', 'npm audit --omit=dev --audit-level=moderate');
  requireScript(scripts, 'check:code', 'npm run check');
  requireScript(scripts, 'check:public-branches', 'scripts/check-public-package-branches.mjs');
  requireScript(
    scripts,
    'check:public-branches:strict',
    'scripts/check-public-package-branches.mjs --require-pushed'
  );
  requireScript(scripts, 'sync:public-package', 'scripts/sync-public-package.mjs');
  requireScript(scripts, 'check:public-package-sync', 'scripts/sync-public-package.mjs --check');
  const syncPublicPackagePath = join(nextRoot, 'scripts', 'sync-public-package.mjs');
  if (!existsSync(syncPublicPackagePath)) {
    fail('scripts/sync-public-package.mjs is missing');
  } else {
    const source = readFileSync(syncPublicPackagePath, 'utf8');
    for (const token of [
      'findPublicPackageRoot',
      'npm',
      'sync',
      '--check',
      'git',
      'status',
      'public package checkout not found',
    ]) {
      if (!source.includes(token)) {
        fail(`sync-public-package.mjs is missing source repository sync guard ${token}`);
      }
    }
  }
  const publicBranchesPath = join(nextRoot, 'scripts', 'check-public-package-branches.mjs');
  if (!existsSync(publicBranchesPath)) {
    fail('scripts/check-public-package-branches.mjs is missing');
  } else {
    const source = readFileSync(publicBranchesPath, 'utf8');
    for (const token of [
      'findPublicPackageRoot',
      'G5_PUBLIC_PACKAGE_BRANCHES',
      'publicPackageBranches',
      'public package checkout not found',
      'strict public branch guard requires a local public package checkout',
      'public package checkout is not at the pushed Vercel branch commit',
    ]) {
      if (!source.includes(token)) {
        fail(`check-public-package-branches.mjs is missing source repository public package guard ${token}`);
      }
    }
  }
  const publicPackageRootPath = join(nextRoot, 'scripts', 'lib', 'public-package-root.mjs');
  if (!existsSync(publicPackageRootPath)) {
    fail('scripts/lib/public-package-root.mjs is missing');
  } else {
    const source = readFileSync(publicPackageRootPath, 'utf8');
    for (const token of [
      'G5_PUBLIC_PACKAGE_DIR',
      'G5_PUBLIC_PACKAGE_DIRS',
      'gnuboard5-nextjs25-theme',
      'publicPackageDir',
      'publicPackageDirs',
      'publicPackageCandidates',
      'releasePolicyList',
    ]) {
      if (!source.includes(token)) {
        fail(`public-package-root.mjs is missing public package discovery token ${token}`);
      }
    }
  }
  checkReleaseScriptContracts({ scripts, nextRoot, requireScript, fail });
  requireScript(scripts, 'check:api-vercel-env', 'scripts/check-api-vercel-env.mjs');
  requireScript(scripts, 'check:browser-auth', 'scripts/check-local-browser.mjs --require-auth');
  requireScript(scripts, 'print:vercel-theme-matrix', 'scripts/print-vercel-theme-matrix.mjs');
  checkVercelBuildScripts(scripts);
  checkVercelThemeMap(scripts);
  checkLiveQaWorkflow({ workflowPath: liveQaWorkflowPath, fail });
  checkVercelCiWorkflows({ workflowPaths: vercelCiWorkflowPaths, fail });
  checkVercelThemeMatrixScript({ scriptPath: printVercelThemeMatrixPath, fail });
  checkLiveTargetGuards(scripts);
  checkLiveOpsWorkflow({
    workflowPath: join(nextRoot, '..', '.github', 'workflows', 'nextjs25-live-ops.yml'),
    fail,
  });
  checkDetailSmokeTests();
  checkThemeCreationScripts({ createThemeSourcePath, createThemePath, fail });
  checkVercelDashboardDocs({ docPaths: vercelDashboardDocPaths, fail });
  checkPublicPackagePolicy();

  if (!existsSync(buildVercelThemePath)) {
    fail('scripts/build-vercel-theme.mjs is missing');
  } else {
    const source = readFileSync(buildVercelThemePath, 'utf8');
    for (const token of ['resolveRuntime', 'G5_NEXT_RUNTIME: runtime', 'G5_THEME_SOURCE: pair.source', 'G5_THEME_NAME: pair.theme']) {
      if (!source.includes(token)) {
        fail(`build-vercel-theme.mjs is missing deploy token ${token}`);
      }
    }
  }

  checkBuildNextScript({
    scriptPath: join(nextRoot, 'scripts', 'build-next.mjs'),
    fail,
  });

  if (!existsSync(checkRouteRuntimePolicyPath)) {
    fail('scripts/check-route-runtime-policy.mjs is missing');
  }

  if (!existsSync(checkSafeHtmlUsagePath)) {
    fail('scripts/check-safe-html-usage.mjs is missing');
  } else {
    const source = readFileSync(checkSafeHtmlUsagePath, 'utf8');
    for (const token of ['components/SafeHtml.tsx', 'dangerouslySetInnerHTML', 'src/components/seo/JsonLd.tsx']) {
      if (!source.includes(token)) {
        fail(`check-safe-html-usage.mjs is missing guard token ${token}`);
      }
    }
  }

  if (!existsSync(checkSourceFileSizePath)) {
    fail('scripts/check-source-file-size.mjs is missing');
  } else {
    const source = readFileSync(checkSourceFileSizePath, 'utf8');
    for (const token of ['inspectSourceFileSizes', 'loadSourceFileSizeBaseline', 'SOURCE_FILE_SIZE_BASELINE']) {
      if (!source.includes(token)) {
        fail(`check-source-file-size.mjs is missing source size guard token ${token}`);
      }
    }
  }

  if (!existsSync(sourceFileSizeLibPath)) {
    fail('scripts/lib/source-file-size.mjs is missing');
  } else {
    const source = readFileSync(sourceFileSizeLibPath, 'utf8');
    for (const requirement of [
      {
        label: 'PHP API source or public overlay path',
        tokens: ['join(root, "..", "api")', 'join(root, "..", "overlay", "api")'],
      },
      {
        label: 'theme bridge source or public overlay path',
        tokens: [
          'join(root, "..", "theme", "nextjs_default", "bridge")',
          // 공개 배포판: 동기화가 설치 테마를 overlay/theme/ 아래로 옮긴다.
          'join(root, "..", "overlay", "theme", "nextjs_default", "bridge")',
        ],
      },
    ]) {
      if (!requirement.tokens.some((token) => source.includes(token))) {
        fail(`scripts/lib/source-file-size.mjs is missing source size guard token ${requirement.label}`);
      }
    }

    for (const token of [
      'MAX_PHP_FILE_LINES',
      'WARN_PHP_FILE_LINES',
      'const PHP_EXTENSIONS',
      'join(root, "scripts")',
      'MAX_SCRIPT_FILE_LINES',
      'WARN_SCRIPT_FILE_LINES',
      'const SCRIPT_EXTENSIONS',
    ]) {
      if (!source.includes(token)) {
        fail(`scripts/lib/source-file-size.mjs is missing source size guard token ${token}`);
      }
    }
  }

  checkPackageScriptContracts({ scripts, nextRoot, requireScript, fail });

  if (!existsSync(generateVercelConfigPath)) {
    fail('scripts/generate-vercel-config.mjs is missing');
  }

  if (!existsSync(writeApacheHeadersPath)) {
    fail('scripts/write-apache-static-headers.mjs is missing');
  } else {
    const source = readFileSync(writeApacheHeadersPath, 'utf8');
    if (!source.includes('./static-security-headers.mjs')) {
      fail('write-apache-static-headers.mjs must import static-security-headers.mjs');
    }
  }

  const expectedVercelJson = createVercelConfig({ runtime: 'server' });
  const expectedStaticVercelJson = createVercelConfig({ runtime: 'static' });
  // Vercel CLI 로 올린 배포는 빌드 서버의 vercel.json 에 name · version 을 덧붙인다. 그 둘은 빼고 비교한다.
  const { name: _cliName, version: _cliVersion, ...vercelJsonAsCommitted } = vercelJson;
  if (stableJson(vercelJsonAsCommitted) !== stableJson(expectedVercelJson)) {
    fail('vercel.json must match scripts/vercel-config.mjs. Run npm run generate:vercel-config.');
  }
  if (stableJson(vercelServerJson) !== stableJson(expectedVercelJson)) {
    fail('vercel.server.json must match the server runtime config. Run npm run generate:vercel-config:server.');
  }
  if (stableJson(vercelStaticJson) !== stableJson(expectedStaticVercelJson)) {
    fail('vercel.static.json must match the static runtime config. Run npm run generate:vercel-config:static.');
  }

  if (vercelJson.framework !== 'nextjs') fail('vercel.json framework must be nextjs for server runtime');
  if (vercelJson.installCommand !== 'npm ci') fail('vercel.json installCommand must be npm ci');
  if (vercelJson.buildCommand !== 'npm run build:vercel') {
    fail('vercel.json buildCommand must be npm run build:vercel');
  }
  if ('outputDirectory' in vercelJson) fail('vercel.json must not set outputDirectory for server runtime');
  if ('routes' in vercelJson) fail('vercel.json must not use static API routes for server runtime');
  if ('rewrites' in vercelJson) fail('vercel.json must not use static fallback rewrites for server runtime');

  if (!existsSync(npmrcPath)) {
    fail('nextjs/.npmrc is missing');
  } else {
    const npmrc = readFileSync(npmrcPath, 'utf8');
    if (!npmrc.includes('save-exact=true')) {
      fail('nextjs/.npmrc must keep save-exact=true for deterministic dependency updates');
    }
    if (!npmrc.includes('audit-level=moderate')) {
      fail('nextjs/.npmrc must keep audit-level=moderate');
    }
  }

  checkThemeSources();
}

function checkEnvContracts() {
  const pair = resolveThemePair({
    source: option('source') || undefined,
    theme: option('name') || option('theme') || undefined,
  });

  try {
    assertThemeSource(pair.source);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const appUrl = requireEnvValue('NEXT_PUBLIC_APP_URL');
  const apiUrl = requireEnvValue('NEXT_PUBLIC_API_URL');
  const g5Url = requireEnvValue('NEXT_PUBLIC_G5_URL');

  if (appUrl && !isAbsoluteHttpUrl(appUrl)) fail('NEXT_PUBLIC_APP_URL must be an absolute HTTP(S) URL');
  if (g5Url && !isAbsoluteHttpUrl(g5Url)) fail('NEXT_PUBLIC_G5_URL must be an absolute HTTP(S) URL');

  if (mode === 'static') {
    if (process.env.G5_NEXT_RUNTIME && process.env.G5_NEXT_RUNTIME !== 'static') {
      fail('Static builds must use G5_NEXT_RUNTIME=static');
    }
    if (apiUrl && !isHttpsUrl(apiUrl)) {
      fail('NEXT_PUBLIC_API_URL must be an absolute HTTPS API URL for static builds');
    }
  }

  if (mode === 'server' || mode === 'vercel') {
    const internalApiUrl = env('G5_API_INTERNAL_URL');
    if (process.env.G5_NEXT_RUNTIME && process.env.G5_NEXT_RUNTIME !== 'server') {
      fail('Server runtime builds must use G5_NEXT_RUNTIME=server');
    }
    if (apiUrl && !isHttpsUrl(apiUrl)) {
      fail('NEXT_PUBLIC_API_URL must be an absolute HTTPS API URL in server runtime');
    }
    if (internalApiUrl && !isHttpsUrl(internalApiUrl)) {
      fail('G5_API_INTERNAL_URL must be an absolute HTTPS API URL in server runtime');
    }
  }

  const appHost = hostOf(appUrl);
  if (mode === 'vercel' && appHost.endsWith('.vercel.app') && !allowGenericVercelUrl) {
    const expectedToken = pair.source === 'default' ? 'default' : pair.source;
    if (!appHost.includes(expectedToken)) {
      fail(
        `NEXT_PUBLIC_APP_URL host ${appHost} does not include theme source token ${expectedToken}. ` +
          'Use one Vercel project/domain per theme or set G5_ALLOW_GENERIC_VERCEL_URL=1 intentionally.'
      );
    }
  }
}

if (!allowedModes.has(mode)) {
  fail(`Unsupported deploy check mode ${mode}. Use repository, static, server, or vercel.`);
}

checkRepositoryContracts();
if (requireEnv) {
  checkEnvContracts();
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[check-deploy-config] ${message}`);
  }
  process.exit(1);
}

console.log(
  `[check-deploy-config] deploy config guards passed (mode=${mode}, env=${requireEnv ? 'required' : 'not-required'})`
);
