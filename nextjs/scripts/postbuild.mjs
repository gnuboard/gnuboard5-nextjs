import { spawnSync } from 'node:child_process';

const isServerRuntime = process.env.G5_NEXT_RUNTIME === 'server';

if (isServerRuntime) {
  console.log('[postbuild] G5_NEXT_RUNTIME=server; skipping static export postbuild helpers.');
  process.exit(0);
}

for (const script of ['scripts/inject-sw-version.mjs', 'scripts/write-apache-static-headers.mjs']) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
