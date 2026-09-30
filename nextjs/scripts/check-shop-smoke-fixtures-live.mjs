import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
loadLocalEnv(nextRoot);

const liveApiUrl =
  process.env.SHOP_E2E_API_URL ||
  process.env.LIVE_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  '';

if (!liveApiUrl) {
  console.error(
    '[check-shop-smoke-fixtures-live] Set SHOP_E2E_API_URL, LIVE_API_URL, or NEXT_PUBLIC_API_URL.'
  );
  process.exit(1);
}

process.env.SHOP_E2E_API_URL = liveApiUrl;
process.env.SHOP_E2E_ALLOW_SINGLE_TARGET ||= '1';
process.env.SHOP_E2E_SINGLE_TARGET_REASON ||= 'live fixture health check';
process.env.RUN_SHOP_E2E ||= '1';
process.env.SHOP_E2E_FIXTURE_READY ||= '1';

await import('./require-shop-smoke-env.mjs');
