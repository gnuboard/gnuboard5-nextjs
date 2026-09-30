import { appendFileSync } from 'node:fs';
import { allVercelThemePairs } from './vercel-theme-pair.mjs';

const themeSourceFilter = String(process.env.THEME_SOURCE_FILTER || '').trim();
const liveAppUrlOverride = String(process.env.LIVE_APP_URL_OVERRIDE || '').trim();

if (liveAppUrlOverride && !themeSourceFilter) {
  console.error('[print-vercel-theme-matrix] live_app_url requires theme_source so one override cannot mask every theme.');
  process.exit(1);
}

let pairs = allVercelThemePairs();
if (themeSourceFilter) {
  pairs = pairs.filter((pair) => pair.source === themeSourceFilter || pair.theme === themeSourceFilter);
}

if (pairs.length === 0) {
  console.error(
    `[print-vercel-theme-matrix] No Vercel theme matches ${themeSourceFilter || '(all themes)'}.`
  );
  process.exit(1);
}

const include = pairs.map((pair) => ({
  theme_source: pair.source,
  theme_name: pair.theme,
  app_url: liveAppUrlOverride || pair.appUrl,
}));

for (const entry of include) {
  if (!entry.app_url) {
    console.error(`[print-vercel-theme-matrix] Missing appUrl for ${entry.theme_source}->${entry.theme_name}.`);
    process.exit(1);
  }
}

const matrix = { include };
const serialized = JSON.stringify(matrix);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${serialized}\n`);
}

console.log(`[print-vercel-theme-matrix] ${include.length} theme(s)`);
if (!process.env.GITHUB_OUTPUT) {
  console.log(JSON.stringify(matrix, null, 2));
}
