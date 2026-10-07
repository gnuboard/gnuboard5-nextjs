import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function runtimeConfigPaths(repoRoot) {
  const projectRoot = join(repoRoot, '..');
  const publicPackage = existsSync(join(projectRoot, 'overlay'));
  const installRoot = publicPackage ? join(projectRoot, 'nextjs25-install') : projectRoot;
  const nginxRoot = publicPackage ? join(installRoot, 'nginx') : join(projectRoot, 'docs/nginx');
  const apiRoot = publicPackage ? join(projectRoot, 'overlay/api') : join(projectRoot, 'api');
  const extendRoot = publicPackage ? join(projectRoot, 'overlay/extend') : join(projectRoot, 'extend');
  const themeRoot = publicPackage ? join(projectRoot, 'overlay/theme') : join(projectRoot, 'theme');
  const rootFile = (...segments) => join(projectRoot, ...segments);
  const apiFile = (...segments) => join(apiRoot, ...segments);
  const themeFile = (theme, ...segments) => join(themeRoot, theme, ...segments);
  // 2026-09-28: default(nextjs25) · greenhub 테마를 지우고 nextjs_default 을 기본 테마로 삼았다. 두 역할 모두
  // nextjs_default 브리지를 본다. greenhub 만 쓰던 runtime-core · metadata-rewrite 는 없으므로 app-shell 로 대신한다.
  const greenhubRuntimeFile = () => themeFile('nextjs_default', 'bridge/app-shell.php');

  return {
    publicPackage,
    packageJsonPath: join(repoRoot, 'package.json'),
    vercelJsonPath: join(repoRoot, 'vercel.json'),
    sourcePath: join(repoRoot, 'src/lib/config.ts'),
    nextConfigPath: join(repoRoot, 'next.config.ts'),
    adminAppPath: join(repoRoot, 'src/app/admin'),
    apiClientPath: join(repoRoot, 'src/lib/api.ts'),
    authServerPath: join(repoRoot, 'src/lib/auth-server.ts'),
    authStorePath: join(repoRoot, 'src/store/auth.ts'),
    authProviderPath: join(repoRoot, 'src/components/providers/AuthProvider.tsx'),
    shareButtonsPath: join(repoRoot, 'src/components/ShareButtons.tsx'),
    orderDataActionsPath: join(repoRoot, 'src/app/shop/order/orderDataActions.ts'),
    legacyShopActionPath: join(repoRoot, 'src/app/shop/_legacy-action.ts'),
    legacyReviewListPath: join(repoRoot, 'src/app/shop/_legacy-review-list.ts'),
    sanitizePath: join(repoRoot, 'src/lib/sanitize.ts'),
    serviceWorkerPath: join(repoRoot, 'public/sw.js'),
    apacheHeaderWriterPath: join(repoRoot, 'scripts/write-apache-static-headers.mjs'),
    staticSecurityHeadersPath: join(repoRoot, 'scripts/static-security-headers.mjs'),
    nginxSecurityMapPath: join(nginxRoot, 'nextjs25-security-map.conf'),
    nginxGreenhubSecurityHeadersPath: join(
      nginxRoot,
      publicPackage ? 'nextjs25-security-headers.conf' : 'nextjs_default-security-headers.conf'
    ),
    nginxNextjs25SecurityHeadersPath: join(nginxRoot, 'nextjs25-security-headers.conf'),
    packageLiveDeployPath: join(repoRoot, 'scripts/package-live-deploy.mjs'),
    checkReleaseLivePath: join(repoRoot, 'scripts/check-release-live.mjs'),
    checkLiveYoungcartLegacyRoutesPath: join(repoRoot, 'scripts/check-live-youngcart-legacy-routes.mjs'),
    checkLocalYoungcartLegacyRoutesPath: join(repoRoot, 'scripts/check-local-youngcart-legacy-routes.mjs'),
    rootHtaccessPath: publicPackage ? join(installRoot, 'apache-htaccess-rules.txt') : rootFile('.htaccess'),
    phpApiIndexPath: apiFile('index.php'),
    phpShopRouterPath: apiFile('v1/shop/router.php'),
    phpAuthPath: apiFile('v1/auth.php'),
    phpAuthAccountRoutesPath: apiFile('v1/auth_account_routes.php'),
    phpAuthHelpersPath: apiFile('v1/auth_helpers.php'),
    phpAuthSessionRoutesPath: apiFile('v1/auth_session_routes.php'),
    phpAuthSocialRoutesPath: apiFile('v1/auth_social_routes.php'),
    phpAuthLibPath: apiFile('lib/Auth.php'),
    phpPaymentPath: apiFile('v1/shop/payment.php'),
    phpStatusPath: apiFile('v1/status.php'),
    phpSocialBridgePath: apiFile('social/_bridge_common.php'),
    phpSocialStartPath: apiFile('social/start.php'),
    phpSocialPopupPath: apiFile('social/popup.php'),
    phpSocialFinishPath: apiFile('social/finish.php'),
    phpThemeCommonPath: publicPackage
      ? rootFile('overlay/plugin/webapp/bridge/common.php')
      : rootFile('plugin/webapp/bridge/common.php'),
    phpNextjsRuntimeExtendPath: publicPackage
      ? rootFile('overlay/plugin/webapp/bridge/runtime.php')
      : rootFile('plugin/webapp/bridge/runtime.php'),
    phpApiHelpersPath: apiFile('lib/helpers.php'),
    phpCertCommonPath: apiFile('cert/_cert_common.php'),
    phpKcpStartPath: apiFile('cert/kcp_start.php'),
    phpShopCommonPath: apiFile('v1/shop/common.php'),
    phpShopSessionHelpersPath: apiFile('v1/shop/common_session_helpers.php'),
    phpShopPaymentHelpersPath: apiFile('v1/shop/payment_helpers.php'),
    phpGreenhubRuntimeCorePath: greenhubRuntimeFile('runtime-core.php'),
    phpGreenhubMetadataRewritePath: greenhubRuntimeFile('metadata-rewrite.php'),
    phpGreenhubAppShellPath: greenhubRuntimeFile('app-shell.php'),
    phpNextjs25AppShellPath: themeFile('nextjs_default', 'bridge/app-shell.php'),
    phpNextjs25AssetResponsesPath: themeFile('nextjs_default', 'bridge/asset-responses.php'),
    phpNextjs25LegacyRouteResolversPath: themeFile('nextjs_default', 'bridge/legacy-route-resolvers.php'),
    phpNextjs25LegacyRoutesPath: themeFile('nextjs_default', 'bridge/legacy-routes.php'),
    phpNextjs25MetadataPath: themeFile('nextjs_default', 'bridge/metadata.php'),
    phpNextjs25RenderPath: themeFile('nextjs_default', 'bridge/render.php'),
    phpNextjs25SecurityHeadersPath: themeFile('nextjs_default', 'bridge/security-headers.php'),
  };
}
