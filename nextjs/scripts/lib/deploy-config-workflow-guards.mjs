import { existsSync, readFileSync } from 'node:fs';

export function checkLiveQaWorkflow({ workflowPath, fail }) {
  if (!existsSync(workflowPath)) return;

  const source = readFileSync(workflowPath, 'utf8');
  for (const token of [
    'theme-matrix:',
    'node nextjs/scripts/print-vercel-theme-matrix.mjs',
    'fromJson(needs.theme-matrix.outputs.matrix)',
    'THEME_SOURCE_FILTER',
    'LIVE_APP_URL_OVERRIDE',
    'matrix.theme_source',
    'matrix.theme_name',
    'matrix.app_url',
    'LOCAL_SMOKE_LOGIN_ID',
    'LOCAL_SMOKE_LOGIN_PASSWORD',
    'npm run check:browser-auth',
  ]) {
    if (!source.includes(token)) {
      fail(`live-qa.yml is missing multi-theme live QA token ${token}`);
    }
  }

  if (source.includes('check:browser-auth:optional')) {
    fail('live-qa.yml must not use optional auth smoke for the authenticated QA step');
  }
}

export function checkVercelThemeMatrixScript({ scriptPath, fail }) {
  if (!existsSync(scriptPath)) {
    fail('scripts/print-vercel-theme-matrix.mjs is missing');
    return;
  }

  const source = readFileSync(scriptPath, 'utf8');
  for (const token of [
    'allVercelThemePairs',
    'THEME_SOURCE_FILTER',
    'LIVE_APP_URL_OVERRIDE',
    'GITHUB_OUTPUT',
    'live_app_url requires theme_source',
  ]) {
    if (!source.includes(token)) {
      fail(`print-vercel-theme-matrix.mjs is missing token ${token}`);
    }
  }
}

export function checkVercelCiWorkflows({ workflowPaths, fail }) {
  for (const workflowPath of workflowPaths) {
    if (!existsSync(workflowPath)) continue;

    const source = readFileSync(workflowPath, 'utf8');
    if (!source.includes('build:vercel')) continue;

    for (const token of [
      'vercel-theme-matrix:',
      'node nextjs/scripts/print-vercel-theme-matrix.mjs',
      'fromJson(needs.vercel-theme-matrix.outputs.matrix)',
      'matrix.theme_source',
      'matrix.theme_name',
      'matrix.app_url',
    ]) {
      if (!source.includes(token)) {
        fail(`${workflowPath} is missing dynamic Vercel CI matrix token ${token}`);
      }
    }

    if (!source.includes('npm run check:code')) {
      fail(`${workflowPath} must run npm run check:code in the main verify job`);
    }

    for (const token of [
      'vercel-static-fixture:',
      'Check static export with fixture API',
      'npm run check:vercel-static:fixture',
    ]) {
      if (!source.includes(token)) {
        fail(`${workflowPath} must run offline Vercel fixture quality gate ${token}`);
      }
    }

    for (const token of ['theme_source: default', 'theme_source: greenhub']) {
      if (source.includes(token)) {
        fail(`${workflowPath} must derive Vercel CI themes from vercel-theme-map.json, not hardcode ${token}`);
      }
    }

    for (const token of ['vars.LIVE_API_URL', 'vars.LIVE_G5_URL', 'vars.LIVE_IMAGE_EXTRA_HOSTS']) {
      if (!source.includes(token)) {
        fail(`${workflowPath} must use GitHub repository variable ${token} for live build configuration`);
      }
    }

    for (const token of [
      'Build Vercel server runtime',
      'Check Vercel server env',
      '--mode vercel --require-env',
      '--runtime server',
      'G5_NEXT_RUNTIME: server',
      'G5_API_INTERNAL_URL',
      'npm run check:server-runtime-smoke',
      'LIVE_SMOKE_POST_PATH',
      'LIVE_SMOKE_POST_TEXT',
      'LIVE_SMOKE_PRODUCT_PATH',
      'LIVE_SMOKE_PRODUCT_TEXT',
      'LIVE_SMOKE_REQUIRE_DETAILS',
      "|| 'post,product'",
    ]) {
      if (!source.includes(token)) {
        fail(`${workflowPath} must run Vercel server build quality gate ${token}`);
      }
    }

    for (const token of [
      'vercel-release-env-required:',
      'Check live Vercel smoke variables',
      'vercel-release-strict:',
      "github.event_name == 'workflow_dispatch'",
      "github.event_name == 'push'",
      "vars.LIVE_API_URL != ''",
      "vars.LIVE_G5_URL != ''",
      "vars.LIVE_SMOKE_POST_PATH != ''",
      "vars.LIVE_SMOKE_POST_TEXT != ''",
      "vars.LIVE_SMOKE_PRODUCT_PATH != ''",
      "vars.LIVE_SMOKE_PRODUCT_TEXT != ''",
      'npm run check:release:vercel:strict',
    ]) {
      if (!source.includes(token)) {
        fail(`${workflowPath} must protect Vercel release strict gate with token ${token}`);
      }
    }

    for (const token of [
      'Check Vercel static export preview',
      'Check Vercel static env',
      '--mode static --require-env',
      'G5_NEXT_RUNTIME: static',
      'npm audit --omit=dev --audit-level=moderate',
      'npx playwright install --with-deps chromium',
      'npm run check:vercel-static',
    ]) {
      if (!source.includes(token)) {
        fail(`${workflowPath} must run Vercel static preview quality gate ${token}`);
      }
    }

    if (source.includes('Build static export') && !source.includes('vars.LIVE_DEFAULT_APP_URL')) {
      fail(`${workflowPath} must use vars.LIVE_DEFAULT_APP_URL for the default static build app URL`);
    }

    if (source.includes('release-ui-smoke:')) {
      for (const token of [
        'Stateful UI release smoke',
        "github.event_name == 'workflow_dispatch'",
        "github.event_name == 'push'",
        'SHOP_E2E_OPTION_PRODUCT_ID',
        'npm run check:ui:release',
      ]) {
        if (!source.includes(token)) {
          fail(`${workflowPath} must run stateful UI release smoke with token ${token}`);
        }
      }

      if (source.includes('RELEASE_UI_SMOKE_ON_PUSH')) {
        fail(`${workflowPath} must not gate release-ui-smoke push coverage behind RELEASE_UI_SMOKE_ON_PUSH`);
      }
    }

    if (source.includes('thisgun4.gnuboard.net')) {
      fail(`${workflowPath} must not hardcode the live Gnuboard host; use GitHub repository variables`);
    }
  }
}
