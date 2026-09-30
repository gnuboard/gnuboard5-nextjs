// Shared browser-auth seeding for local smoke checks.
//
// Authenticating a Playwright context for the static-export app requires more
// than the g5_token cookie:
//   1. g5_auth_hint cookie  — AuthProvider only calls initialize() (the client
//      auth bootstrap) when api.hasAuthHint() is true, which reads this cookie.
//   2. localStorage g5_token — the API client migrates the token from
//      localStorage into memory and sends it as a Bearer header, cross-origin
//      to the API host. The cookie alone never reaches the API host, so without
//      this the authed pages fall back to the login screen.
//
// This mirrors exactly what the real login flow and check-local-browser do.
export async function seedBrowserAuth(context, credentials, appUrl) {
  const token = credentials && credentials.token;
  if (!token) {
    throw new Error('seedBrowserAuth: credentials.token is required');
  }

  const cookies = [
    { name: 'g5_auth_hint', value: '1', url: appUrl, sameSite: 'Lax' },
    { name: 'g5_token', value: token, url: appUrl, sameSite: 'Lax' },
  ];
  if (credentials.refreshToken) {
    cookies.push({ name: 'g5_refresh', value: credentials.refreshToken, url: appUrl, sameSite: 'Lax' });
  }

  await context.addCookies(cookies);
  await context.addInitScript(
    ({ accessToken }) => {
      window.localStorage.setItem('g5_token', accessToken);
    },
    { accessToken: token }
  );
}
