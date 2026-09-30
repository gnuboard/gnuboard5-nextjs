import { NextRequest } from "next/server";

const G5_SESSION_COOKIE_RE = /^G5[A-Za-z0-9_-]*PHPSESSID$/;
const FORWARDED_COOKIE_NAMES = new Set([
  "g5_token",
  "g5_refresh",
  "g5_auth_hint",
  "g5_auto_login",
  "PHPSESSID",
]);

export function forwardedLegacyCookieHeader(request: NextRequest): string {
  const cookies = request.cookies
    .getAll()
    .filter((cookie) => shouldForwardLegacyCookie(cookie.name))
    .map((cookie) => `${cookie.name}=${sanitizeCookieValue(cookie.value)}`);

  return cookies.join("; ");
}

function shouldForwardLegacyCookie(name: string): boolean {
  return FORWARDED_COOKIE_NAMES.has(name) || G5_SESSION_COOKIE_RE.test(name);
}

function sanitizeCookieValue(value: string): string {
  return value.replace(/[\r\n;]/g, "");
}
