export function checkRuntimeOriginGuards({
  fail, nextConfigSource, staticSecurityHeadersSource,
  phpNextjsRuntimeExtendSource,
  phpApiIndexSource,
  phpApiHelpersSource,
  phpAuthHelpersSource,
  phpCertCommonSource,
  phpShopCommonSource,
  phpShopSessionHelpersSource,
  phpShopPaymentHelpersSource,
  phpGreenhubRuntimeCoreCheckSource,
  phpGreenhubAppShellCheckSource,
  phpNextjs25SecurityHeadersSource,
  phpNextjs25BridgeSource,
}) {
  for (const [label, source] of [
    ['next.config.ts', nextConfigSource],
    ['static-security-headers.mjs', staticSecurityHeadersSource],
  ]) {
    if (source.includes('http://t1.daumcdn.net')) {
      fail(`${label} must not allow the insecure Daum postcode source in production CSP headers`);
    }
  }

  for (const [label, source] of [
    ['plugin/webapp/bridge/runtime.php', phpNextjsRuntimeExtendSource],
    ['api/index.php', phpApiIndexSource],
    ['api/lib/helpers.php', phpApiHelpersSource],
    ['api/v1/auth_helpers.php', phpAuthHelpersSource],
    ['api/cert/_cert_common.php', phpCertCommonSource],
    ['api/v1/shop/common.php', phpShopCommonSource],
    ['api/v1/shop/common_session_helpers.php', phpShopSessionHelpersSource],
    ['theme/nextjs_default/bridge/runtime-core.php', phpGreenhubRuntimeCoreCheckSource],
    ['theme/nextjs_default/bridge/app-shell.php', phpGreenhubAppShellCheckSource],
    ['theme/nextjs_default/bridge/security-headers.php', phpNextjs25SecurityHeadersSource],
    ['theme/nextjs_default/bridge runtime files', phpNextjs25BridgeSource],
  ]) {
    if (source.includes('HTTP_X_FORWARDED_PROTO')) {
      fail(`${label} must use g5_nextjs_runtime_forwarded_proto() instead of trusting HTTP_X_FORWARDED_PROTO directly`);
    }
  }

  if (
    phpShopPaymentHelpersSource.includes('HTTP_X_FORWARDED_HOST')
    && !phpShopPaymentHelpersSource.includes('g5_nextjs_runtime_is_trusted_proxy_request()')
  ) {
    fail('api/v1/shop/payment_helpers.php must only use HTTP_X_FORWARDED_HOST after trusted proxy validation');
  }

  if (!phpShopSessionHelpersSource.includes('api_public_request_origin(false)')) {
    fail('api/v1/shop/common_session_helpers.php must derive current origin through api_public_request_origin(false)');
  }
}
