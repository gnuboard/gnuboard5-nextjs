import { spawnSync } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const result = spawnSync(npmCmd, ['run', 'test:ui-smoke'], {
  env: {
    ...process.env,
    PLAYWRIGHT_MOBILE_ONLY: '1',
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[run-mobile-ui-smoke] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
