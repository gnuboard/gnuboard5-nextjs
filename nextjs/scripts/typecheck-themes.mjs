import { spawnSync } from 'node:child_process';
import { allThemePairs, assertThemeSource, nextRoot } from './theme-pair.mjs';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';

const pairs = [];
const seen = new Set();
for (const pair of [...allThemePairs(), ...allVercelThemePairs()]) {
  const key = `${pair.source}:${pair.theme}`;
  if (seen.has(key)) continue;
  seen.add(key);
  pairs.push(pair);
}
let failed = false;

for (const pair of pairs) {
  try {
    assertThemeSource(pair.source);
  } catch (error) {
    console.error(`[typecheck-themes] ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
    continue;
  }

  console.log(`[typecheck-themes] source=${pair.source}; theme=${pair.theme}`);

  const result = spawnSync(process.execPath, ['scripts/typecheck-theme.mjs'], {
    cwd: nextRoot,
    env: {
      ...process.env,
      G5_THEME_SOURCE: pair.source,
      G5_THEME_NAME: pair.theme,
    },
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[typecheck-themes] ${pair.theme}: ${result.error.message}`);
    failed = true;
    continue;
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`[typecheck-themes] ${pair.theme} failed with exit code ${result.status ?? 1}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`[typecheck-themes] ${pairs.length} theme pair(s) passed`);
