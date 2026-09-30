import { spawn } from 'node:child_process';

const appUrl = trimTrailingSlash(
  process.env.PLAYWRIGHT_BASE_URL || process.env.LOCAL_APP_URL || 'http://localhost'
);

const tests = [
  'tests/pages.spec.ts',
  'tests/header-menu.spec.ts',
  'tests/post-detail.spec.ts',
  'tests/product-detail.spec.ts',
];

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}


function run() {
  return new Promise((resolve, reject) => {
    console.log(`[check-local-ui-smoke] app=${appUrl}`);
    const env = {
      ...process.env,
      PLAYWRIGHT_BASE_URL: appUrl,
    };

    const child = spawn('npx', ['playwright', 'test', ...tests], {
      env,
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
      reject(new Error(`playwright ui smoke failed with ${reason}`));
    });
  });
}

await run();
console.log('\n[check-local-ui-smoke] ui smoke passed');
