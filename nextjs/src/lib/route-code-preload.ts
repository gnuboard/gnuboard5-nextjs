"use client";

import { g5PathForRuntime, isG5AppRouteRoot } from "@/lib/config";

/**
 * 테마 설치본(정적 내보내기)에서 이동할 화면의 JS 조각을 미리 받아 실행해 둔다.
 *
 * 왜: 처음 가는 화면은 누른 뒤에야 그 화면의 코드를 받는다. 그동안 대체 화면(loading.tsx ·
 * Suspense)이 뜨고, React 는 대체 화면을 보인 뒤 300ms 동안 본 내용을 묶어 둔다
 * (FALLBACK_THROTTLE_MS). 그래서 데이터가 100ms 안에 와도 화면은 400~600ms 뒤에야 바뀐다.
 * 코드가 이미 실행돼 있으면(두 번째 방문처럼) 대체 화면 없이 바로 그린다.
 *
 * router.prefetch 로는 안 된다 — 이 정적 내보내기에서 Next 16 의 조각 단위 미리 받기는 경로
 * 나무(__next._tree.txt)까지만 받고 페이지 자신의 코드는 받지 않는다(실측).
 *
 * 그래서 화면의 RSC 페이로드(<경로>.txt, 정적 파일)를 받아 거기 적힌 클라이언트 조각
 * (`I[id,["/_next/static/chunks/….js",…]]`)을 페이지가 제 조각을 싣는 것과 같은 방식(script
 * 태그)으로 싣는다. Turbopack 은 조각이 실행되며 스스로 등록하므로 나중에 라우터가 같은 조각을
 * 찾으면 이미 있는 것으로 본다.
 *
 * 글 상세도 괜찮다 — 받는 것은 모든 글이 나눠 쓰는 화면 틀이지 글 API 가 아니라서 조회수·포인트에
 * 닿지 않는다.
 *
 * 같은 종류의 화면(모든 글, 모든 게시판 목록, 모든 상품 …)은 코드가 같으므로 종류마다 한 번만 받는다
 * (routeCodeShape). 그래서 PHP 브리지에 가는 요청도 종류 수만큼으로 그친다.
 */

/**
 * <경로>.txt 는 정적 내보내기에만 있다. 서버 실행(Vercel)은 RSC 를 ?_rsc= 로 주므로 .txt 를 받으면
 * 404 만 쌓인다 — 거기서는 Next 자신의 미리 받기에 맡긴다. (next.config 의 env 가 빌드 때 박아 넣는다.)
 */
const ROUTE_PAYLOAD_FILES = process.env.G5_NEXT_RUNTIME !== "server";

const preloadedShapes = new Set<string>();
const CHUNK_PATTERN = /"([^"\s]*\/_next\/static\/chunks\/[^"\s]+\.js)"/g;

function payloadUrl(clientPath: string): string {
  const pathname = clientPath.split(/[?#]/)[0] || "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return g5PathForRuntime(trimmed ? `${trimmed}.txt` : "/index.txt");
}

function loadedScriptUrls(): Set<string> {
  const urls = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((script) => {
    urls.add(script.src);
  });
  return urls;
}

function loadChunks(payload: string): void {
  const loaded = loadedScriptUrls();
  const wanted = new Set<string>();

  for (const match of payload.matchAll(CHUNK_PATTERN)) {
    const url = new URL(match[1], window.location.href);
    if (url.origin !== window.location.origin) continue;
    if (!loaded.has(url.href)) wanted.add(url.href);
  }

  wanted.forEach((src) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
  });
}

/** /shop/<이것> 이 상품이 아니라 상점의 다른 화면인 이름들(짧은 주소 규칙과 같은 목록). */
const SHOP_SCREEN_ROOTS = new Set([
  "cart", "categories", "compare", "content", "couponzone", "events", "largeimage", "login", "order",
  "orders", "payment", "personalpay", "products", "qas", "register", "reviews", "search", "wishlist",
]);

/**
 * 화면의 종류. 같은 종류면 같은 코드를 쓴다 — 게시판 목록(/free · /notice), 글(/free/4161),
 * 상품(/shop/123 · /shop/products/123), 상품 분류(/shop/list-10 · /shop/categories/10)는 주소가
 * 달라도 같은 화면이고, 나머지는 숫자만 묶은 주소 그대로다.
 */
export function routeCodeShape(clientPath: string): string {
  const pathname = clientPath.split(/[?#]/)[0] || "/";
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 0) return "home";

  if (parts[0] === "shop" && parts.length >= 2) {
    if (parts.length === 2 && /^list-/i.test(parts[1])) return "shop-category";
    if (parts.length === 3 && parts[1] === "categories") return "shop-category";
    if (parts.length === 3 && parts[1] === "products") return "shop-product";
    if (parts.length === 2 && !SHOP_SCREEN_ROOTS.has(parts[1]) && !/^type-/i.test(parts[1])) return "shop-product";
  }

  if (!isG5AppRouteRoot(parts[0]) && /^[0-9A-Za-z_]+$/.test(parts[0])) {
    if (parts.length === 1) return "board-list";
    if (parts.length === 2 && /^[0-9]+$/.test(parts[1])) return "post";
  }

  return parts.map((part) => (/^[0-9]+$/.test(part) ? ":n" : part)).join("/");
}

function prefersLightLoading(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType ?? "");
}

export function preloadRouteCode(clientPath: string): void {
  if (typeof window === "undefined" || !ROUTE_PAYLOAD_FILES || prefersLightLoading()) return;

  const shape = routeCodeShape(clientPath);
  if (preloadedShapes.has(shape)) return;
  preloadedShapes.add(shape);

  fetch(payloadUrl(clientPath), { credentials: "same-origin" })
    .then((response) => {
      // 404 · 500 같은 HTTP 오류도 실패다. 표시를 남겨 두면 그 화면 종류는 다시 시도하지 않는다.
      if (!response.ok) throw new Error("route payload " + response.status);
      return response.text();
    })
    .then((payload) => {
      if (payload) loadChunks(payload);
    })
    .catch(() => {
      // 미리 받기는 덤이다. 실패하면 다음 기회에 다시 시도하도록 표시를 지운다.
      preloadedShapes.delete(shape);
    });
}

/** 한 화면에서 미리 실을 화면 종류 수. 휴대폰 데이터와 PHP 브리지 부하를 생각해 작게 둔다. */
const IDLE_PRELOAD_LIMIT = 3;
/**
 * 한가해진 뒤 다시 살펴보는 때(ms). 정적 설치본의 화면은 먼저 빈 틀로 뜨고 목록·글은 API 가 온 뒤에야
 * 그려지므로, 첫 빈틈에는 링크가 아직 없을 수 있다.
 */
const IDLE_RETRY_DELAYS_MS = [0, 1500, 4000];
const IDLE_TIMEOUT_MS = 2000;

/**
 * 화면이 한가해지면 본문의 링크에서 화면 종류마다 하나씩 코드를 미리 싣는다 — 마우스가 머무는 일이
 * 없는 휴대폰에서도 처음 가는 화면이 대체 화면 없이 뜨도록. 이미 실은 종류는 건너뛴다.
 * 취소 함수를 돌려준다.
 */
export function scheduleIdleRouteCodePreload(resolveClientPath: (href: string) => string | null): () => void {
  if (typeof window === "undefined" || !ROUTE_PAYLOAD_FILES || prefersLightLoading()) return () => undefined;

  // 지금 화면의 코드는 이미 실행돼 있다 — 같은 종류(예: 이 목록의 2쪽)는 받을 것이 없다.
  try {
    const currentPath = resolveClientPath(window.location.href);
    if (currentPath) preloadedShapes.add(routeCodeShape(currentPath));
  } catch {
    // 지금 주소를 못 읽어도 미리 싣기에는 지장이 없다.
  }

  let preloadedHere = 0;
  let cancelled = false;
  const timers: number[] = [];
  const idleHandles: number[] = [];
  const idle = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  const run = () => {
    if (cancelled) return;
    const anchors = document.querySelectorAll<HTMLAnchorElement>("main a[href]");
    for (const anchor of anchors) {
      if (preloadedHere >= IDLE_PRELOAD_LIMIT) return;
      if (anchor.target && anchor.target !== "_self") continue;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#")) continue;

      let clientPath: string | null = null;
      try {
        clientPath = resolveClientPath(new URL(href, window.location.href).href);
      } catch {
        continue;
      }
      if (!clientPath || preloadedShapes.has(routeCodeShape(clientPath))) continue;

      preloadedHere += 1;
      preloadRouteCode(clientPath);
    }
  };

  const whenIdle = () => {
    if (idle.requestIdleCallback) {
      idleHandles.push(idle.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS }));
    } else {
      run();
    }
  };

  IDLE_RETRY_DELAYS_MS.forEach((delay) => {
    timers.push(window.setTimeout(whenIdle, delay));
  });

  return () => {
    cancelled = true;
    timers.forEach((timer) => window.clearTimeout(timer));
    idleHandles.forEach((handle) => idle.cancelIdleCallback?.(handle));
  };
}
