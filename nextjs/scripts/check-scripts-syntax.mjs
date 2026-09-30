import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

const scripts = readdirSync(scriptDir)
  .filter((file) => file.endsWith('.mjs'))
  .sort()
  .map((file) => join(scriptDir, file));

const rows = [];

for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = !result.error && result.status === 0;

  rows.push({
    script: relative(repoRoot, script).replaceAll('\\', '/'),
    status: ok ? 'ok' : 'fail',
    detail: ok ? 'syntax valid' : result.stderr.trim() || result.error?.message || `exit ${result.status}`,
  });
}

console.table(rows);

const failed = rows.filter((row) => row.status === 'fail');
if (failed.length > 0) {
  console.error(`[check-scripts-syntax] ${failed.length} script syntax check(s) failed`);
  process.exit(1);
}

console.log(`[check-scripts-syntax] ${rows.length} script(s) passed`);
