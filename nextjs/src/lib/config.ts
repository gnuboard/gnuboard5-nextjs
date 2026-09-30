import { isReservedShopRouteRoot } from "@/lib/g5-short-url-rules";
import type { RuntimeSeoConfig } from "@/lib/seo-config";

// 개발용 기본 주소. 운영 빌드에서는 빈 문자열로 접어 번들에 남지 않게 한다 — NODE_ENV 가
// 빌드 때 상수로 박히므로 죽은 가지가 잘려 나간다. 운영은 어차피 env 가 없으면 publicUrl 이
// 던지고, 배포 패키지 감사(package-theme)가 127.x/localhost 흔적을 잡아내지 않게 된다.
const IS_DEV_BUILD = process.env.NODE_ENV !== "production";
const DEV_API_BASE_URL = IS_DEV_BUILD ? "http://localhost/api/v1" : "";
const DEV_G5_BASE_URL = IS_DEV_BUILD ? "http://localhost" : "";
const DEV_APP_BASE_URL = IS_DEV_BUILD ? "http://localhost:3000" : "";

export const CLIENT_API_BASE_URL = "/api/v1";

export interface G5NextRuntimeConfig {
  apiBaseUrl?: string;
  g5BaseUrl?: string;
  appBaseUrl?: string;
  assetBaseUrl?: string;
  themeUrl?: string;
  currentPath?: string;
  /** 검색엔진 노출 설정. 테마 브리지(요청 때 api/.env)나 Next 서버(환경변수)가 싣는다. 없으면 노출 안 함. */
  seo?: RuntimeSeoConfig;
  /** 설치본의 사이트 제목(cf_title). 테마 브리지나 Next 서버가 싣는다. 없으면 테마 기본값. */
  siteName?: string;
}

/**
 * Theme-NEUTRAL runtime-config contract. The gnuboard PHP bridge (app-shell.php) injects
 * this global populated from the ACTIVE theme's URLs, so one static export can serve
 * theme/nextjs25, theme/<your-name>, etc. without a rebuild. A legacy alias is read as a
 * fallback so a freshly built bundle still resolves URLs against not-yet-updated PHP.
 */
const RUNTIME_CONFIG_KEY = (process.env.NEXT_PUBLIC_RUNTIME_CONFIG_KEY || "__G5_APP_CONFIG__").trim();
const LEGACY_RUNTIME_CONFIG_KEY = "__G5_NEXTJS25_CONFIG__";

function runtimeConfig(): G5NextRuntimeConfig | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as Record<string, G5NextRuntimeConfig | undefined>;
  return scope[RUNTIME_CONFIG_KEY] ?? scope[LEGACY_RUNTIME_CONFIG_KEY];
}

/** 브라우저에서 본 사이트 이름 — 런타임 설정의 siteName(설치본의 cf_title), 없으면 fallback(테마 기본값). */
export function clientSiteName(fallback: string): string {
  const name = runtimeConfig()?.siteName;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

/** 브라우저에서 본 검색엔진 노출 설정. 런타임 설정에 없으면 노출하지 않는 쪽(G5_NEXTJS_SEO 기본값 off). */
export function clientSeoConfig(): RuntimeSeoConfig {
  const seo = runtimeConfig()?.seo;
  return {
    enabled: seo?.enabled === true,
    excludedBoards: Array.isArray(seo?.excludedBoards) ? seo.excludedBoards : [],
  };
}

type PublicEnvName =
  | "NEXT_PUBLIC_API_URL"
  | "NEXT_PUBLIC_G5_URL"
  | "NEXT_PUBLIC_APP_URL"
  | "NEXT_PUBLIC_API_PROXY_PATH"
  | "NEXT_PUBLIC_AUTH_MODE";

const PUBLIC_ENV: Record<PublicEnvName, string | undefined> = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_G5_URL: process.env.NEXT_PUBLIC_G5_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_API_PROXY_PATH: process.env.NEXT_PUBLIC_API_PROXY_PATH,
  NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function runtimeHttpUrl(
  value: string | undefined,
  options: { allowRelative?: boolean } = {}
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (options.allowRelative && trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimTrailingSlash(trimmed) || "/";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return undefined;
  }
}

function runtimeG5BaseUrl(value: string | undefined): string | undefined {
  const url = runtimeHttpUrl(value);
  if (!url) return undefined;

  try {
    return validatedG5BaseUrl(url);
  } catch {
    return undefined;
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function pathnameFromUrl(value: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    return new URL(value, base).pathname;
  } catch {
    return value.split(/[?#]/)[0] || "/";
  }
}

function normalizedPathname(value: string): string {
  const pathname = pathnameFromUrl(value);
  const trimmed = trimSlashes(pathname);
  return trimmed ? `/${trimmed}` : "/";
}

function originFromRuntimeUrl(value: string | undefined): string | undefined {
  if (!value || value.startsWith("/") || value.startsWith("//")) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(value: string | undefined): boolean {
  const hostname = (value || "").toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function relativeRuntimeApiBaseUrl(value: string | undefined): string | undefined {
  if (typeof window === "undefined") return undefined;

  const runtimeApi = runtimeHttpUrl(value, { allowRelative: true });
  if (!runtimeApi) return undefined;
  if (runtimeApi.startsWith("/") && !runtimeApi.startsWith("//")) {
    return trimTrailingSlash(runtimeApi);
  }

  try {
    const apiUrl = new URL(runtimeApi);
    const currentOrigin = window.location.origin;
    if (apiUrl.origin === currentOrigin) {
      return trimTrailingSlash(apiUrl.pathname || "/");
    }

    const config = runtimeConfig();
    const appOrigin = originFromRuntimeUrl(runtimeHttpUrl(config?.appBaseUrl));
    if (isLoopbackHostname(window.location.hostname) && appOrigin === currentOrigin) {
      return trimTrailingSlash(apiUrl.pathname || "/");
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function g5BasePathForRuntime(): string {
  const runtimeBase =
    typeof window !== "undefined" ? runtimeHttpUrl(runtimeConfig()?.appBaseUrl) : undefined;
  const configuredBase = runtimeBase || PUBLIC_ENV.NEXT_PUBLIC_APP_URL || APP_BASE_URL;
  const basePath = normalizedPathname(configuredBase);

  return basePath === "/" ? "" : basePath;
}

/**
 * gnuboard PHP 호스트의 절대 URL — `http://localhost` 형태.
 * 소셜 로그인 등 PHP 페이지로 직접 점프할 때 사용.
 */
export function g5BaseUrlForRuntime(): string {
  if (typeof window !== "undefined") {
    const runtimeBase = runtimeG5BaseUrl(runtimeConfig()?.g5BaseUrl);
    if (runtimeBase) return trimTrailingSlash(runtimeBase);
  }
  const configured = PUBLIC_ENV.NEXT_PUBLIC_G5_URL?.trim() || G5_BASE_URL;
  return trimTrailingSlash(configured);
}

export function isG5ThemeRuntime(): boolean {
  return typeof window !== "undefined" && !!runtimeConfig();
}

export function stripG5BasePath(pathname: string): string {
  const path = normalizedPathname(pathname);
  const basePath = g5BasePathForRuntime();

  if (!basePath) return path;
  if (path === basePath) return "/";
  if (path.startsWith(`${basePath}/`)) {
    return path.slice(basePath.length) || "/";
  }

  return path;
}

/**
 * Next 라우터(`<Link>`, `router.push`)에 넘길 경로.
 *
 * Next 는 basePath 를 스스로 붙이므로, `g5ShortHref()` 같은 헬퍼가 붙여 둔 설치 경로가 남아
 * 있으면 `/gnu5512/gnu5512/free` 가 된다. 경로 앞부분만 떼어 내고 쿼리·해시는 그대로 둔다.
 * 절대 URL 과 프로토콜 상대 URL 은 건드리지 않는다.
 */
export function hrefForNextRouter(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const match = href.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] || "/";
  const suffix = match?.[2] || "";
  return `${stripG5BasePath(pathname)}${suffix}`;
}

export function currentPathForRuntime(fallbackPathname?: string): string {
  if (typeof window === "undefined") {
    return stripG5BasePath(fallbackPathname || "/");
  }

  const pathname =
    window.location.pathname ||
    runtimeConfig()?.currentPath ||
    fallbackPathname ||
    "/";

  return stripG5BasePath(pathname);
}

export function currentPathHasTrailingSlashForRuntime(fallbackPathname?: string): boolean {
  const source =
    typeof window !== "undefined"
      ? window.location.pathname ||
        runtimeConfig()?.currentPath ||
        fallbackPathname ||
        "/"
      : fallbackPathname || "/";
  const pathname = pathnameFromUrl(source);

  return pathname.length > 1 && pathname.endsWith("/");
}

export function g5PathForRuntime(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const basePath = g5BasePathForRuntime();
  return `${basePath}${normalized === "/" ? "" : normalized}` || "/";
}

const G5_APP_ROUTE_ROOTS = new Set([
  "admin",
  "boards",
  "content",
  "faq",
  "forgot-password",
  "login",
  "mypage",
  "offline",
  "polls",
  "recent",
  "register",
  "search",
  "shop",
]);

const G5_NON_ROUTE_ROOTS = new Set([
  "_next",
  "adm",
  "api",
  "bbs",
  "css",
  "data",
  "img",
  "install",
  "js",
  "lib",
  "mobile",
  "plugin",
  "theme",
]);

export function shouldRouteThroughG5(pathname: string): boolean {
  const path = normalizedPathname(pathname);
  if (path === "/") return true;

  const parts = trimSlashes(path).split("/");
  const root = parts[0] || "";

  if (G5_APP_ROUTE_ROOTS.has(root)) return true;
  if (G5_NON_ROUTE_ROOTS.has(root) || root.includes(".")) return false;

  return /^\/[0-9A-Za-z_]+(?:\/(?:write|[0-9]+|[^/]+))?$/.test(path);
}

export function shouldUseG5DocumentNavigation(pathname: string): boolean {
  const path = normalizedPathname(pathname).replace(/\/+$/, "") || "/";
  const parts = trimSlashes(path).split("/");
  const root = parts[0] || "";

  if (root && !G5_APP_ROUTE_ROOTS.has(root) && !G5_NON_ROUTE_ROOTS.has(root) && !root.includes(".")) {
    if (/^\/[0-9A-Za-z_]+(?:\/(?:write|rss|[0-9]+|[^/]+))?$/.test(path)) {
      return true;
    }
  }

  return [
    /^\/boards\/[^/]+$/,
    /^\/boards\/[^/]+\/(?:[^/]+|write|rss)$/,
    /^\/content\/[^/]+$/,
    /^\/members\/[^/]+$/,
    /^\/mypage\/(?:memos|qas)\/[^/]+$/,
    /^\/shop\/categories\/[^/]+$/,
    /^\/shop\/content\/[^/]+$/,
    /^\/shop\/events\/[^/]+$/,
    /^\/shop\/orders\/[^/]+$/,
    /^\/shop\/personalpay\/[^/]+(?:\/pay)?$/,
    /^\/shop\/products\/[^/]+$/,
    /^\/shop\/list-[0-9a-z]+$/i,
    /^\/shop\/type-[1-5]$/i,
    /^\/shop\/(?!cart$|categories$|compare$|couponzone$|events$|largeimage$|login$|order$|orders$|payment$|personalpay$|products$|qas$|register$|reviews$|search$|wishlist$)[^/]+$/i,
  ].some((pattern) => pattern.test(path));
}

/**
 * src/app 아래 최상위 앱 경로 중 G5_APP_ROUTE_ROOTS 에 없는 것. 게시판 짧은 주소(/free/4161)와 모양이
 * 같아서, 빼 두지 않으면 /members/123 같은 주소가 게시판으로 잘못 분류된다.
 */
const G5_NON_BOARD_APP_ROOTS = new Set(["__g5", "baby", "community", "g5-runtime", "members", "organic"]);

/** 긴 주소도 받는다 — g5ClientNavigationPath 는 짧은 주소로 바꿔 부르지만, 이 함수를 직접 부를 수도 있다. */
const G5_CLIENT_NAVIGABLE_PATTERNS = [
  /^\/boards\/[0-9A-Za-z_]+$/,
  /^\/boards\/[0-9A-Za-z_]+\/[0-9]+$/,
  /^\/content\/[^/]+$/,
  /^\/shop\/content\/[^/]+$/,
  /^\/shop\/categories\/[^/]+$/,
  /^\/shop\/events\/[^/]+$/,
  /^\/shop\/products\/[^/]+$/,
  /^\/shop\/list-[0-9a-z]+$/i,
  /^\/shop\/type-[1-5]$/i,
];

/**
 * 테마가 features.clientNavigation 을 켰을 때 문서 새로고침 대신 Next 라우터로 보내도 되는 주소.
 * 앱이 주소창에서 id 를 읽어 스스로 데이터를 부르는 화면만 고른다 — 게시판 목록·글 보기(숫자 id),
 * 상품 상세, 분류·유형 목록, 안내 페이지, 기획전.
 *
 * 빼는 것: 글쓰기·RSS, 제목 주소(끝 슬래시, 비숫자 글 주소 — 브리지가 풀어야 한다), 회원·쪽지·주문·
 * 개인결제, 결제 복귀 경로, 옛 PHP 주소(점이 들어간 이름).
 */
/** 게시판 이름이 아니라 앱 화면·그누보드 폴더를 뜻하는 첫 경로 조각인가(/faq, /mypage, /bbs …). */
export function isG5AppRouteRoot(root: string): boolean {
  return G5_APP_ROUTE_ROOTS.has(root) || G5_NON_ROUTE_ROOTS.has(root) || G5_NON_BOARD_APP_ROOTS.has(root);
}

export function isG5ClientNavigablePath(pathname: string): boolean {
  if (pathname.length > 1 && pathname.endsWith("/")) return false;

  const path = normalizedPathname(pathname);
  const parts = trimSlashes(path).split("/");
  const root = parts[0] || "";
  if (!root || root.includes(".")) return false;

  if (G5_NON_BOARD_APP_ROOTS.has(root)) return false;

  if (!G5_APP_ROUTE_ROOTS.has(root) && !G5_NON_ROUTE_ROOTS.has(root)) {
    // 짧은 게시판 주소: /free, /free/4161
    return /^\/[0-9A-Za-z_]+(?:\/[0-9]+)?$/.test(path);
  }

  if (G5_CLIENT_NAVIGABLE_PATTERNS.some((pattern) => pattern.test(path))) return true;

  // 짧은 상품 주소: /shop/1446772772. 상점 화면·결제 복귀·옛 PHP 이름은 toG5ShortPath 와 같은 목록으로 거른다.
  const segment = parts[1] || "";
  return (
    root === "shop" &&
    parts.length === 2 &&
    /^[0-9A-Za-z_-]+$/.test(segment) &&
    segment.toLowerCase() !== "content" &&
    !isReservedShopRouteRoot(segment)
  );
}

function publicUrl(
  name: PublicEnvName,
  developmentFallback: string,
  options: { requiredInProduction?: boolean } = {}
): string {
  const value = PUBLIC_ENV[name]?.trim();
  if (value) return trimTrailingSlash(value);

  if (
    options.requiredInProduction !== false &&
    process.env.NODE_ENV === "production" &&
    typeof window === "undefined"
  ) {
    throw new Error(`Missing ${name}. Add it to the Next.js environment variables.`);
  }

  return developmentFallback;
}


function validatedG5BaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_G5_URL must be an absolute http(s) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_G5_URL must use http or https.");
  }

  if (
    process.env.NODE_ENV === "production"
    && typeof window === "undefined"
    && url.protocol !== "https:"
    && !isLoopbackHostname(url.hostname)
  ) {
    throw new Error("NEXT_PUBLIC_G5_URL must use https in production.");
  }

  return trimTrailingSlash(url.toString());
}

export const API_BASE_URL = publicUrl("NEXT_PUBLIC_API_URL", DEV_API_BASE_URL, {
  requiredInProduction: true,
});
export const G5_BASE_URL = validatedG5BaseUrl(
  publicUrl("NEXT_PUBLIC_G5_URL", DEV_G5_BASE_URL, {
    requiredInProduction: true,
  })
);
export const APP_BASE_URL = publicUrl("NEXT_PUBLIC_APP_URL", DEV_APP_BASE_URL, {
  requiredInProduction: true,
});

export const GALLERY_BOARDS = (process.env.NEXT_PUBLIC_GALLERY_BOARDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export type AuthMode = "g5-jwt" | "authjs";

export const AUTH_MODE: AuthMode =
  PUBLIC_ENV.NEXT_PUBLIC_AUTH_MODE === "authjs" ? "authjs" : "g5-jwt";

export function serverApiBaseUrlForRuntime(): string {
  const internalApi = process.env.G5_API_INTERNAL_URL?.trim();
  if (!internalApi) return API_BASE_URL;

  const normalized = runtimeHttpUrl(internalApi);
  if (!normalized) {
    throw new Error("G5_API_INTERNAL_URL must be an absolute http(s) URL.");
  }

  return normalized;
}

export function apiBaseUrlForRuntime(): string {
  if (typeof window === "undefined") {
    return serverApiBaseUrlForRuntime();
  }

  const proxyPath = runtimeHttpUrl(PUBLIC_ENV.NEXT_PUBLIC_API_PROXY_PATH, {
    allowRelative: true,
  });
  if (proxyPath) return trimTrailingSlash(proxyPath);

  const runtimeHostname = window.location?.hostname?.toLowerCase() || "";
  if (runtimeHostname.endsWith(".vercel.app")) {
    return CLIENT_API_BASE_URL;
  }

  const runtimeApi = runtimeHttpUrl(runtimeConfig()?.apiBaseUrl, { allowRelative: true });
  const relativeRuntimeApi = relativeRuntimeApiBaseUrl(runtimeApi);
  if (relativeRuntimeApi) return relativeRuntimeApi;
  if (runtimeApi) return trimTrailingSlash(runtimeApi);

  const publicApi = PUBLIC_ENV.NEXT_PUBLIC_API_URL?.trim();
  if (publicApi && publicApi.startsWith("/") && !publicApi.startsWith("//")) {
    return trimTrailingSlash(publicApi);
  }

  if (publicApi) return trimTrailingSlash(publicApi);

  return CLIENT_API_BASE_URL;
}

export function apiUrl(path: string): string {
  const baseUrl = apiBaseUrlForRuntime();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function appBaseUrlForRuntime(): string {
  if (typeof window !== "undefined") {
    const runtimeApp = runtimeHttpUrl(runtimeConfig()?.appBaseUrl);
    if (runtimeApp) return trimTrailingSlash(runtimeApp);

    const publicApp = PUBLIC_ENV.NEXT_PUBLIC_APP_URL?.trim();
    if (publicApp) return trimTrailingSlash(publicApp);

    return window.location.origin;
  }

  return APP_BASE_URL;
}

export function assetBaseUrlForRuntime(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const runtimeAssetBase = runtimeHttpUrl(runtimeConfig()?.assetBaseUrl, { allowRelative: true });
  if (runtimeAssetBase) return trimTrailingSlash(runtimeAssetBase);

  const runtimeThemeUrl = runtimeHttpUrl(runtimeConfig()?.themeUrl, { allowRelative: true });
  if (runtimeThemeUrl) return `${trimTrailingSlash(runtimeThemeUrl)}/app`;

  return "";
}

export function staticAssetUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = assetBaseUrlForRuntime();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function rootPublicAssetUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return g5PathForRuntime(normalizedPath);
}

export function appUrl(path: string): string {
  const baseUrl = appBaseUrlForRuntime();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
