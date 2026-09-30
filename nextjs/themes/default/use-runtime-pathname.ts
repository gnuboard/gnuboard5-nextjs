"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { currentPathForRuntime } from "@/lib/config";

/**
 * 셸이 보는 현재 경로.
 *
 * currentPathForRuntime 은 브라우저에서 window.location 을 읽는다 (정적
 * 내보내기가 theme/<name>/app 아래에 얹혀 서빙될 때 usePathname 만으로는
 * 실제 주소를 알 수 없기 때문이다). 그런데 클라이언트 이동에서는 새 트리가
 * 그려지는 시점과 주소창이 바뀌는 시점이 어긋난다 — 렌더 중에 읽으면 직전
 * 경로가 잡히고, 그 뒤로는 usePathname 이 더 바뀌지 않아 다시 그릴 일이 없어
 * 낡은 값이 그대로 남는다. (실제로 /content/… 에서 로고로 홈에 돌아오면
 * 내부 페이지용 레일이 남아 사이드바가 둘로 보였다.)
 *
 * 그래서 history 변경을 구독해 주소가 실제로 바뀐 뒤 한 번 더 읽는다.
 * greenhub 의 useRuntimePathname 과 같은 방식이다.
 */
const RUNTIME_LOCATION_EVENT = "solune:runtime-location-change";

let historyPatched = false;
let notifyTimer: number | null = null;

function notifyRuntimeLocationChange() {
  if (notifyTimer) window.clearTimeout(notifyTimer);
  notifyTimer = window.setTimeout(() => {
    notifyTimer = null;
    window.dispatchEvent(new Event(RUNTIME_LOCATION_EVENT));
  }, 0);
}

/** pushState/replaceState 는 이벤트를 내지 않으므로 한 번만 감싸 둔다. */
function ensureHistoryEvents() {
  if (typeof window === "undefined" || historyPatched) return;

  historyPatched = true;
  (["pushState", "replaceState"] as const).forEach((methodName) => {
    const original = window.history[methodName];
    window.history[methodName] = function patchedHistoryMethod(
      this: History,
      ...args: Parameters<History[typeof methodName]>
    ) {
      const result = original.apply(this, args);
      notifyRuntimeLocationChange();
      return result;
    } as History[typeof methodName];
  });
}

function subscribeRuntimeLocation(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  ensureHistoryEvents();
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  window.addEventListener(RUNTIME_LOCATION_EVENT, onChange);

  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(RUNTIME_LOCATION_EVENT, onChange);
  };
}

export function useRuntimePathname(): string {
  const routerPathname = usePathname() || "/";

  return useSyncExternalStore(
    subscribeRuntimeLocation,
    () => currentPathForRuntime(routerPathname),
    () => routerPathname
  );
}

/**
 * 셸이 보는 현재 주소 — 경로 + 쿼리 + 해시(설치 경로는 뗀다). useRuntimePathname 과 같은 구독을 써서
 * 쿼리만 바뀌는 이동(`/board?page=2` -> `?page=3`)에도 따라 바뀐다. 로그인 뒤 돌아올 주소에 쓴다.
 */
export function useRuntimeLocation(): string {
  const routerPathname = usePathname() || "/";

  return useSyncExternalStore(
    subscribeRuntimeLocation,
    () => `${currentPathForRuntime(routerPathname)}${window.location.search}${window.location.hash}`,
    () => routerPathname
  );
}

/** 로그인 · 가입 · 찾기 화면과 홈에서는 돌아올 주소를 달지 않는다(로그인 뒤 다시 로그인 화면으로 오지 않게). */
const NO_RETURN_PATHS = ["/login", "/register", "/forgot-password", "/shop/login"];

/** 로그인 링크. 지금 보던 곳을 `?redirect=` 로 달아 로그인 뒤 그리로 돌아오게 한다(/login 이 읽는다). */
export function loginHrefFor(location: string): string {
  const path = location.split(/[?#]/)[0] || "/";
  if (path === "/" || NO_RETURN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return "/login";
  return `/login?redirect=${encodeURIComponent(location)}`;
}

/**
 * 지금 주소로 만든 로그인 링크. 첫 그림(정적 셸의 경로, 예: /shop/products/__g5_static__)과 실제 주소가 다른
 * 화면이 있어 붙은 뒤(effect)에 실제 주소로 다시 적는다 — 그래야 링크의 href 속성도 바뀐다(새 탭 · 주소 복사).
 */
export function useLoginHref(): string {
  const location = useRuntimeLocation();
  const [href, setHref] = useState("/login");
  useEffect(() => {
    setHref(loginHrefFor(location));
  }, [location]);
  return href;
}
