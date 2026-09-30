import { liveAppUrl } from './lib/live-env.mjs';

process.env.RUNTIME_CHECK_TARGET ||= 'live';
process.env.RUNTIME_CHECK_LABEL ||= 'check-live-youngcart-legacy-routes';
process.env.LIVE_APP_URL ||= liveAppUrl('check-live-youngcart-legacy-routes');

await import('./check-local-youngcart-legacy-routes.mjs');
