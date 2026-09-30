import { themeConfig } from "@g5-theme/theme.config";
import {
  g5BasePathForRuntime,
  g5PathForRuntime,
  hrefForNextRouter,
  isG5ClientNavigablePath,
  isG5ThemeRuntime,
  shouldRouteThroughG5,
  shouldUseG5DocumentNavigation,
  stripG5BasePath,
} from "@/lib/config";
import { toG5ShortPath } from "@/lib/g5-short-url";
import type { G5ThemeConfig } from "@/lib/theme-types";

// features 를 안 적은 테마는 좁게 추론되므로 공용 타입으로 넓혀 읽는다.
const THEME_CLIENT_NAVIGATION = (themeConfig as G5ThemeConfig).features?.clientNavigation === true;

/** 이 빌드의 테마가 features.clientNavigation 을 켰는가. 끈 테마에서는 관련 처리기를 달지 않는다. */
export function isThemeClientNavigationEnabled(): boolean {
  return THEME_CLIENT_NAVIGATION;
}

type RouterLike = {
  push(href: string): void;
  replace(href: string): void;
};

type NavigationMode = "push" | "replace";

function sameOriginRuntimePath(href: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function splitPathSuffix(path: string): [string, string] {
  const match = path.match(/^([^?#]*)(.*)$/);
  return [match?.[1] || "/", match?.[2] || ""];
}

/**
 * 테마가 features.clientNavigation 을 켰고 목적지가 클라이언트 이동해도 되는 주소(isG5ClientNavigablePath)면,
 * Next 라우터에 넘길 주소를 돌려준다 — 짧은 주소로 바꾸고 설치 경로는 뗀 것(라우터가 basePath 를 붙인다).
 * 아니면 null 이고, 부르는 쪽은 예전 규칙(문서 이동 여부 판단)을 따른다.
 *
 * 정적 배포본에서 속 데이터(주소.txt)는 브리지가 대표 껍데기의 것으로 내준다. 그걸 못 받는 호스트에서는
 * Next 가 스스로 문서 이동으로 물러나므로 켜서 나빠지는 환경은 없다.
 */
export function g5ClientNavigationPath(href: string): string | null {
  if (!THEME_CLIENT_NAVIGATION || !isG5ThemeRuntime()) return null;

  const path = sameOriginRuntimePath(href);
  if (!path) return null;

  const [pathname, suffix] = splitPathSuffix(path);
  const runtimePath = `${stripG5BasePath(pathname || "/")}${suffix}`;
  const targetPath = toG5ShortPath(runtimePath);
  const targetRoute = targetPath.split(/[?#]/)[0] || "/";

  return isG5ClientNavigablePath(targetRoute) ? targetPath : null;
}

function shouldUseDocumentNavigation(href: string): boolean {
  const path = sameOriginRuntimePath(href);
  if (!path) return false;

  const [pathname, suffix] = splitPathSuffix(path);
  const runtimePath = `${stripG5BasePath(pathname || "/")}${suffix}`;
  const hasBasePath = !!g5BasePathForRuntime();
  const shouldShorten = isG5ThemeRuntime();
  if (!hasBasePath && !shouldShorten) return false;

  const targetPath = shouldShorten ? toG5ShortPath(runtimePath) : runtimePath;
  const targetRoute = targetPath.split(/[?#]/)[0] || "/";

  return (
    targetPath !== runtimePath ||
    (hasBasePath && shouldRouteThroughG5(targetRoute)) ||
    (shouldShorten && shouldUseG5DocumentNavigation(targetRoute))
  );
}

function navigate(router: RouterLike, href: string, mode: NavigationMode) {
  const clientPath = g5ClientNavigationPath(href);
  if (clientPath) {
    router[mode](clientPath);
    return;
  }

  if (shouldUseDocumentNavigation(href)) {
    const path = sameOriginRuntimePath(href) || href;
    const [pathname, suffix] = splitPathSuffix(path);
    const runtimePath = `${stripG5BasePath(pathname || "/")}${suffix}`;
    const targetPath = isG5ThemeRuntime() ? toG5ShortPath(runtimePath) : runtimePath;
    const target = g5PathForRuntime(targetPath);

    if (mode === "replace") {
      window.location.replace(target);
    } else {
      window.location.assign(target);
    }
    return;
  }

  // Next 라우터는 basePath 를 스스로 붙이므로 헬퍼가 붙여 둔 설치 경로는 떼고 넘긴다.
  router[mode](hrefForNextRouter(href));
}

export function runtimeRouterPush(router: RouterLike, href: string) {
  navigate(router, href, "push");
}

export function runtimeRouterReplace(router: RouterLike, href: string) {
  navigate(router, href, "replace");
}
