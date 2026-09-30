import type { NextRequest } from "next/server";

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function crossSiteRequestMessage(request: NextRequest): string | null {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return "Cross-site request blocked.";
  }

  const requestOrigin = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin && originOf(origin) !== requestOrigin) {
    return "Request origin is not allowed.";
  }

  const referer = request.headers.get("referer");
  const refererOrigin = referer ? originOf(referer) : null;
  if (refererOrigin && refererOrigin !== requestOrigin) {
    return "Request referer is not allowed.";
  }

  return null;
}

export function shouldGuardMutation(request: NextRequest): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
}
