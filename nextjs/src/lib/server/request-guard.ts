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
  // 샌드박스 iframe · data: 문서 · 일부 리다이렉트는 Origin 을 문자열 "null" 로 보낸다. 출처를 모르는 요청이므로 막는다.
  if (origin && (origin.trim().toLowerCase() === "null" || originOf(origin) !== requestOrigin)) {
    return "Request origin is not allowed.";
  }

  const referer = request.headers.get("referer");
  const refererOrigin = referer ? originOf(referer) : null;
  if (refererOrigin && refererOrigin !== requestOrigin) {
    return "Request referer is not allowed.";
  }

  return null;
}

// GET/HEAD/OPTIONS 는 여기서 빠진다. GET 으로도 상태를 바꾸는 레거시 라우트는 runLegacyYoungcartAction 에 guardMutation: true 를 넘겨야 한다.
export function shouldGuardMutation(request: NextRequest): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
}
