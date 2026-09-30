export function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function requireLiveEnv(name, scriptName, hint = '') {
  const value = env(name);
  if (value) return value;

  console.error(
    `[${scriptName}] ${name} is required for live checks; set it explicitly so live commands cannot target the wrong server.${hint ? ` ${hint}` : ''}`
  );
  process.exit(1);
}

export function liveAppUrl(scriptName) {
  return trimTrailingSlash(
    env('LIVE_APP_URL') ||
      env('NEXT_PUBLIC_APP_URL') ||
      requireLiveEnv('LIVE_APP_URL', scriptName, 'NEXT_PUBLIC_APP_URL may be used as a fallback.')
  );
}

export function liveExpectedApiUrl(appUrl) {
  return trimTrailingSlash(env('LIVE_EXPECTED_API_URL') || env('NEXT_PUBLIC_API_URL') || `${appUrl}/api/v1`);
}

export function liveDeployHost(scriptName) {
  return requireLiveEnv('LIVE_DEPLOY_HOST', scriptName);
}

export function liveDeployWebRoot(scriptName) {
  return requireLiveEnv('LIVE_DEPLOY_WEB_ROOT', scriptName);
}

export function liveDeploySiteConf(appUrlOrHost) {
  const configured = env('LIVE_DEPLOY_NGINX_SITE_CONF');
  if (configured) return configured;

  const host = String(appUrlOrHost || '').includes('://')
    ? new URL(appUrlOrHost).hostname
    : String(appUrlOrHost || '').replace(/^.*@/, '');
  return `/etc/nginx/sites-enabled/${host}`;
}
