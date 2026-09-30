import { spawn } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const supportedArgs = new Set([
  '--include-actions',
  '--include-build',
  '--include-server-routes',
  '--skip-server-routes',
]);

for (const arg of args) {
  if (!supportedArgs.has(arg)) {
    console.error(`[check-release-local] Unknown argument: ${arg}`);
    console.error(
      '[check-release-local] Supported arguments: --include-actions, --include-build, --include-server-routes, --skip-server-routes'
    );
    process.exit(1);
  }
}

const includeActions = args.has('--include-actions');
const includeBuild = args.has('--include-build');
const includeServerRoutes = !args.has('--skip-server-routes');
const maxRetries = Number.parseInt(process.env.LOCAL_RELEASE_CHECK_RETRIES || '1', 10);

const releaseScripts = [
  'check',
  includeBuild ? 'build:theme' : 'check:theme-sync',
  'check:local-runtime',
  'check:local-social-redirects',
  'check:release:actions:safe',
  'check:local-ui-smoke',
  ...(includeServerRoutes ? ['check:local-youngcart-legacy-routes:server'] : []),
  'check:local-browser:all:seeded',
  'check:local-browser:all:seeded:mobile',
  ...(includeActions ? ['check:local-actions:all'] : []),
];

function runScript(script) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> npm run ${script}`);
    const child = spawn('npm', ['run', script], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${script} failed with ${reason}`));
    });
  });
}

function retryCount() {
  return Number.isFinite(maxRetries) && maxRetries > 0 ? maxRetries : 0;
}

console.log(
  `[check-release-local] includeBuild=${includeBuild ? 'yes' : 'no'} includeActions=${
    includeActions ? 'yes' : 'no'
  } includeServerRoutes=${includeServerRoutes ? 'yes' : 'no'}`
);

for (const script of releaseScripts) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await runScript(script);
      break;
    } catch (error) {
      if (attempt >= retryCount()) {
        throw error;
      }
      console.warn(
        `[check-release-local] ${script} failed; retrying (${attempt + 1}/${retryCount()})`
      );
    }
  }
}

console.log('\n[check-release-local] local release gate passed');
