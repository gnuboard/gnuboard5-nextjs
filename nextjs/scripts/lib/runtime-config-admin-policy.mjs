import { existsSync } from 'node:fs';

export function checkRuntimeAdminPolicy({
  fail,
  adminAppPath,
  nextConfigSource,
  phpThemeCommonSource,
  phpApiIndexSource,
  phpShopRouterSource,
}) {
  if (existsSync(adminAppPath)) {
    fail('src/app/admin must stay out of the user-facing Next.js application');
  }

  for (const token of ["source: '/admin'", "source: '/admin/:path*'", '/adm']) {
    if (!nextConfigSource.includes(token)) {
      fail(`next.config.ts is missing the legacy admin redirect token ${token}`);
    }
  }

  if (!phpThemeCommonSource.includes('function g5_nextjs_redirect_legacy_admin_request')) {
    fail('plugin/webapp/bridge/common.php must redirect reserved /admin requests to the Gnuboard /adm console');
  }

  if (/['\"]admin['\"]\s*=>/.test(phpApiIndexSource)) {
    fail('api/index.php must not expose a Next.js admin API handler');
  }

  if (/['\"]admin['\"]\s*=>/.test(phpShopRouterSource)) {
    fail('api/v1/shop/router.php must not expose a Next.js shop admin API handler');
  }
}
