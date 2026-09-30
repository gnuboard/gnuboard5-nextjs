import { spawnSync } from 'node:child_process';
import { allThemePairs, assertThemeSource, nextRoot } from './theme-pair.mjs';

const separatorIndex = process.argv.indexOf('--', 2);
const commandArgs = separatorIndex === -1 ? process.argv.slice(2) : process.argv.slice(separatorIndex + 1);

function fail(message) {
  console.error(`[run-theme-command] ${message}`);
  console.error('Usage: node scripts/run-theme-command.mjs -- <command> [...args]');
  process.exit(1);
}

if (commandArgs.length === 0) {
  fail('Missing command.');
}

let failed = false;

for (const pair of allThemePairs()) {
  try {
    assertThemeSource(pair.source);
  } catch (error) {
    console.error(`[run-theme-command] ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
    continue;
  }

  console.log(`[run-theme-command] source=${pair.source}; theme=${pair.theme}; command=${commandArgs.join(' ')}`);

  const result = spawnSync(
    process.execPath,
    ['scripts/with-theme.mjs', '--source', pair.source, '--name', pair.theme, '--', ...commandArgs],
    {
      cwd: nextRoot,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    }
  );

  if (result.error) {
    console.error(`[run-theme-command] ${pair.theme}: ${result.error.message}`);
    failed = true;
    continue;
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`[run-theme-command] ${pair.theme} failed with exit code ${result.status ?? 1}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`[run-theme-command] ${allThemePairs().length} theme pair(s) completed`);
