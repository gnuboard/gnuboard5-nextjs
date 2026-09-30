import { existsSync, readFileSync } from 'node:fs';

export function checkBuildNextScript({ scriptPath, fail }) {
  if (!existsSync(scriptPath)) {
    fail('scripts/build-next.mjs is missing');
    return;
  }

  const source = readFileSync(scriptPath, 'utf8');
  for (const token of [
    'normalizeRequiredServerFiles',
    'required-server-files.json',
    'normalizeWorkspacePath',
    'build-workspace-normalizer.mjs',
    'VERCEL_SERVER_IN_PLACE_BUILD',
    'restoreInPlaceBuild',
  ]) {
    if (!source.includes(token)) {
      fail(`build-next.mjs is missing Vercel trace normalization token ${token}`);
    }
  }
}

export function checkLiveOpsWorkflow({ workflowPath, fail }) {
  if (!existsSync(workflowPath)) return;

  const source = readFileSync(workflowPath, 'utf8');
  const required = [
    'Validate required live ops variables',
    'LIVE_APP_URL LIVE_EXPECTED_API_URL LIVE_DEPLOY_HOST LIVE_DEPLOY_USER LIVE_DEPLOY_WEB_ROOT',
    'LIVE_APP_URL: ${{ vars.LIVE_APP_URL }}',
    'LIVE_EXPECTED_API_URL: ${{ vars.LIVE_EXPECTED_API_URL }}',
    'LIVE_DEPLOY_HOST: ${{ vars.LIVE_DEPLOY_HOST }}',
    'LIVE_DEPLOY_WEB_ROOT: ${{ vars.LIVE_DEPLOY_WEB_ROOT }}',
    'SSH_HOST: ${{ vars.LIVE_DEPLOY_HOST }}',
  ];

  for (const token of required) {
    if (!source.includes(token)) {
      fail(`nextjs25-live-ops.yml is missing explicit live ops variable token ${token}`);
    }
  }

  for (const forbidden of ['nextjs.thisgun.net', '/home/nextjs/www/study-gnuboard']) {
    if (source.includes(forbidden)) {
      fail(`nextjs25-live-ops.yml must not fall back to site-specific target ${forbidden}`);
    }
  }
}
