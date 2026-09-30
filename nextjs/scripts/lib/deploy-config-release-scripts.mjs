import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkReleaseScriptContracts({ scripts, nextRoot, requireScript, fail }) {
  requireScript(scripts, 'check:offline', 'npm run check:release:offline');
  requireScript(scripts, 'check:full', 'npm run check:release:full');

  const vercelStaticScript = requireScript(scripts, 'check:vercel-static', 'build:vercel:static');
  for (const token of ['check:static-build-budget', 'check:static-ui-smoke']) {
    if (!vercelStaticScript.includes(token)) {
      fail(`package.json script check:vercel-static must include ${token}`);
    }
  }

  requireScript(scripts, 'check:vercel-static:fixture', 'check-vercel-static-fixture.mjs');
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-vercel-static-fixture.mjs'),
    label: 'check-vercel-static-fixture.mjs',
    tokens: ['optionValue', 'THEME_SOURCE_FILTER', 'themeNameFilter'],
    fail,
  });

  const uiCheckScript = requireScript(scripts, 'check:ui', 'test:ui-smoke');
  for (const token of ['test:ui-smoke', 'check:a11y']) {
    if (!uiCheckScript.includes(token)) {
      fail(`package.json script check:ui must include ${token}`);
    }
  }
  const releaseUiCheckScript = requireScript(scripts, 'check:ui:release', '--require-details');
  for (const token of ['test:ui-smoke', 'test:ui-smoke:mobile', 'check:a11y', 'test:ui-smoke:auth', 'check:shop-smoke-fixtures', 'test:ui-smoke:shop']) {
    if (!releaseUiCheckScript.includes(token)) {
      fail(`package.json script check:ui:release must include ${token}`);
    }
  }
  requireScript(scripts, 'test:ui-smoke:mobile', 'scripts/run-mobile-ui-smoke.mjs');
  requireScript(scripts, 'check:shop-smoke-fixtures', 'scripts/require-shop-smoke-env.mjs');
  requireScript(scripts, 'check:shop-smoke-fixtures:live', 'scripts/check-shop-smoke-fixtures-live.mjs');
  const shopUiSmokeScript = requireScript(scripts, 'test:ui-smoke:shop', 'tests/shop-ui-flow.spec.ts');
  if (!shopUiSmokeScript.includes('tests/shop-checkout.spec.ts')) {
    fail('package.json script test:ui-smoke:shop must include tests/shop-checkout.spec.ts');
  }
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'run-mobile-ui-smoke.mjs'),
    label: 'run-mobile-ui-smoke.mjs',
    tokens: ['PLAYWRIGHT_MOBILE_ONLY', 'test:ui-smoke'],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'require-shop-smoke-env.mjs'),
    label: 'require-shop-smoke-env.mjs',
    tokens: [
      'RUN_SHOP_E2E',
      'SHOP_E2E_FIXTURE_READY',
      'LOCAL_SMOKE_SHOP_PRODUCT_ID',
      'SHOP_E2E_PRODUCT_ID',
      'SHOP_E2E_OPTION_PRODUCT_ID',
      'SHOP_E2E_REQUIRE_OPTION_PRODUCT',
      'SHOP_E2E_ALLOW_SINGLE_TARGET',
      'SHOP_E2E_ALLOW_OPTION_PRODUCT_SKIP',
      'SHOP_E2E_SINGLE_TARGET_REASON',
      'SHOP_E2E_OPTION_PRODUCT_SKIP_REASON',
      'allVercelThemePairs',
      '/shop/products/',
      '/auth/login',
      '/shop/points/summary',
      'SHOP_E2E_MIN_POINT_BALANCE',
      'productFixtureProblems',
    ],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-shop-smoke-fixtures-live.mjs'),
    label: 'check-shop-smoke-fixtures-live.mjs',
    tokens: [
      'LIVE_API_URL',
      'SHOP_E2E_API_URL',
      'SHOP_E2E_ALLOW_SINGLE_TARGET',
      'SHOP_E2E_SINGLE_TARGET_REASON',
      'require-shop-smoke-env.mjs',
    ],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'tests', 'shop-checkout.spec.ts'),
    label: 'tests/shop-checkout.spec.ts',
    tokens: ['OPTION_PRODUCT_ID', 'firstUsableBaseOption', 'ct_option', 'clearCart'],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-ui.mjs'),
    label: 'check-ui.mjs',
    tokens: ['--require-details', 'resolveStrictSmokeSamples', 'NEXT_PUBLIC_API_URL', 'UI_SMOKE_SAMPLE_TIMEOUT_MS'],
    fail,
  });

  const offlineReleaseScript = requireScript(scripts, 'check:release:offline', 'npm run check:code');
  for (const token of ['check:source-branch', 'check:vercel-static:fixture']) {
    if (!offlineReleaseScript.includes(token)) {
      fail(`package.json script check:release:offline must include ${token}`);
    }
  }

  requireScript(scripts, 'check:release', 'npm run check:release:deploy');
  requireScript(scripts, 'verify:release', 'npm run check:release:deploy');
  requireScript(scripts, 'verify:release:stateful', 'scripts/check-release-deploy.mjs --include-actions');
  requireScript(scripts, 'verify:release:offline', 'npm run check:release:offline');
  requireScript(scripts, 'verify:vercel-static', 'npm run check:vercel-static');
  requireScript(scripts, 'check:release:setup', 'scripts/check-release-setup.mjs');
  requireScript(scripts, 'check:release:preflight', 'scripts/check-release-deploy.mjs --only=preflight');
  requireScript(scripts, 'check:release:quality', 'scripts/check-release-deploy.mjs --only=quality');
  requireScript(scripts, 'check:release:smoke', 'scripts/check-release-deploy.mjs --only=ui,vercel');
  requireScript(scripts, 'check:release:actions:safe', 'scripts/check-local-actions-safe.mjs');
  requireScript(scripts, 'check:release:actions', 'check:local-actions:all');
  const releaseBuildsScript = requireScript(scripts, 'check:release:builds', 'check:release:vercel:server:build');
  if (!releaseBuildsScript.includes('check:release:vercel:static:build')) {
    fail('package.json script check:release:builds must include check:release:vercel:static:build');
  }
  const deployReleaseScript = requireScript(scripts, 'check:release:deploy', 'scripts/check-release-deploy.mjs');
  requireScript(scripts, 'release:publish', 'scripts/release-publish.mjs');
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-release-setup.mjs'),
    label: 'check-release-setup.mjs',
    tokens: [
      'sourceBranches',
      'publicPackageBranches',
      'findPublicPackageRoot',
      'G5_SOURCE_RELEASE_BRANCHES',
      'G5_PUBLIC_PACKAGE_BRANCHES',
      'status',
      '--porcelain',
    ],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'release-publish.mjs'),
    label: 'release-publish.mjs',
    tokens: [
      'check:release:deploy',
      '--skip=preflight',
      'check:release:actions',
      'publicPackageBranches',
      'G5_SOURCE_RELEASE_BRANCHES',
      'G5_PUBLIC_PACKAGE_BRANCHES',
      'G5_RELEASE_PUBLISH_ACTIONS',
      'G5_RELEASE_BREAK_GLASS_REASON',
      '--break-glass-reason',
      '--include-actions',
      '--skip-checks',
      'publishSummary',
      'git',
      'push',
      '--dry-run',
    ],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-release-deploy.mjs'),
    label: 'check-release-deploy.mjs',
    tokens: [
      'preflight',
      'quality',
      'ui',
      'vercel',
      'actions-safe',
      'actions',
      'check:release:setup',
      'check:source-branch',
      'check:public-branches:strict',
      'check:public-package-sync',
      'check:code',
      'check:release:vercel:strict',
      'check:release:actions:safe',
      'check:release:actions',
      'G5_RELEASE_INCLUDE_ACTIONS',
    ],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-local-actions-safe.mjs'),
    label: 'check-local-actions-safe.mjs',
    tokens: ['actionScripts', 'scriptToActionFile', 'check:local-actions:all'],
    fail,
  });
  for (const token of [
    'check-release-deploy.mjs',
  ]) {
    if (!deployReleaseScript.includes(token)) {
      fail(`package.json script check:release:deploy must include ${token}`);
    }
  }

  requireScript(scripts, 'check:release:full', 'scripts/check-release-deploy.mjs --include-actions');
  requireScript(scripts, 'check:full:offline', 'npm run check:release:offline');
  requireScript(scripts, 'check:full:static', 'npm run check:code');
  requireScript(scripts, 'check:full:static:fixture', 'npm run check:release:offline');
  requireScript(scripts, 'check:release:vercel', 'scripts/check-release-vercel.mjs');
  requireScript(
    scripts,
    'check:release:vercel:server',
    'scripts/check-release-vercel.mjs --skip-base --skip-audit --skip-static'
  );
  requireScript(
    scripts,
    'check:release:vercel:server:build',
    'scripts/check-release-vercel.mjs --skip-base --skip-audit --skip-static --skip-server-smoke'
  );
  requireScript(
    scripts,
    'check:release:vercel:static',
    'scripts/check-release-vercel.mjs --skip-base --skip-audit --skip-server'
  );
  requireScript(
    scripts,
    'check:release:vercel:static:build',
    'scripts/check-release-vercel.mjs --skip-base --skip-audit --skip-server --skip-static-smoke'
  );
  requireScript(scripts, 'check:release:vercel:strict', 'scripts/check-release-vercel.mjs --strict-smoke');

  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'check-release-vercel.mjs'),
    label: 'check-release-vercel.mjs',
    tokens: [
      'SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS',
      'LIVE_SMOKE_POST_PATH',
      'LIVE_SMOKE_POST_TEXT',
      'LIVE_SMOKE_PRODUCT_PATH',
      'LIVE_SMOKE_PRODUCT_TEXT',
      'requireStrictSmokeSamples',
      'resolveStrictSmokeSamples',
      'vercel-smoke-samples.mjs',
      '.env.vercel.local',
      'G5_RELEASE_ENV_FILE',
    ],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'lib', 'vercel-smoke-samples.mjs'),
    label: 'vercel-smoke-samples.mjs',
    tokens: ['discoverPostSample', 'discoverProductSample', 'resolveStrictSmokeSamples'],
    fail,
  });
  checkScriptFileTokens({
    path: join(nextRoot, 'scripts', 'lib', 'vercel-smoke-samples.mjs'),
    label: 'vercel-smoke-samples.mjs',
    tokens: ['VERCEL_RELEASE_REQUIRE_EXPLICIT_SMOKE', '(configured)'],
    fail,
  });
}

function checkScriptFileTokens({ path, label, tokens, fail }) {
  if (!existsSync(path)) {
    fail(`scripts/${label === 'vercel-smoke-samples.mjs' ? 'lib/' : ''}${label} is missing`);
  }

  const source = readFileSync(path, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) {
      fail(`${label} is missing strict live detail smoke token ${token}`);
    }
  }
}
