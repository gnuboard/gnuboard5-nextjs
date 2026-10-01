"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";

// 화면 위 얇은 진행 막대. 왼쪽에서 시작해 오른쪽으로 "조금씩" 차오르다(trickle) 도착하면
// 100% 로 채우고 사라진다 — 무한 왕복 애니메이션이 아니라 한 방향으로만 움직인다.
// trickleRate 기본값(0.02)은 1초에 1~2% 만 움직여서, 개발 서버처럼 이동에 2초쯤 걸리면
// 12% 에 멈춘 것처럼 보인다. 0.08 이면 1초에 20% 안팎으로 차오르고 3~4초 뒤 99% 에서 멈춘다.
// trickleRate 는 nprogress 0.2.0 이 실제로 읽는 옵션인데 @types/nprogress 에는 빠져 있어 타입을 넓힌다.
// 기본 템플릿은 막대에 role="bar" 를 붙이는데 그런 ARIA 역할은 없다(axe: aria-roles, critical).
// 장식용 막대라 역할 없이 aria-hidden 으로 두고, 막대를 찾는 선택자도 클래스로 바꾼다.
NProgress.configure({
  template: '<div class="bar" aria-hidden="true"><div class="peg"></div></div>',
  barSelector: ".bar",
  showSpinner: false,
  minimum: 0.1,
  trickleRate: 0.08,
  trickleSpeed: 200,
  easing: "ease",
  speed: 320,
} as Partial<NProgress.NProgressOptions> & { trickleRate: number });

/*
 * 누른 자리에서 이만큼 넘게 움직인 뒤 놓았으면 끌기로 본다. 손가락·마우스가 링크를 누를 때
 * 몇 픽셀 흔들리는 것은 클릭이므로 문턱을 아주 낮게 두면 진짜 클릭을 놓친다.
 */
const DRAG_THRESHOLD_PX = 10;

/** 눌린 자리를 끌기 판정에 쓰는 유효 시간. 이보다 오래된 것은 지금 클릭과 무관하다. */
const POINTER_DOWN_STALE_MS = 2_000;

/*
 * 클릭이 실제 이동으로 이어지기를 기다리는 시간. 클라이언트 이동은 재보면 90~105ms 에
 * pushState 를 부르고, 문서 이동은 beforeunload 가 온다. 둘 다 없으면 이동하지 않는 클릭이다.
 */
const NAVIGATION_WATCHDOG_MS = 700;

function getUrl(value: string | URL | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value.toString(), window.location.href);
  } catch {
    return null;
  }
}

function shouldShowForUrl(url: URL) {
  if (url.origin !== window.location.origin) {
    return false;
  }

  const current = window.location;
  return url.pathname !== current.pathname || url.search !== current.search;
}

function submitterAttribute(submitter: HTMLElement | null, name: string) {
  return submitter?.getAttribute(name) || "";
}

function formSubmitMethod(form: HTMLFormElement, submitter: HTMLElement | null) {
  return (submitterAttribute(submitter, "formmethod") || form.method || "get").toLowerCase();
}

function formSubmitUrl(form: HTMLFormElement, submitter: HTMLElement | null) {
  const url = getUrl(submitterAttribute(submitter, "formaction") || form.action || window.location.href);
  if (!url) {
    return null;
  }

  try {
    const params = new URLSearchParams(url.search);
    const formData = submitter ? new FormData(form, submitter) : new FormData(form);
    for (const [key, value] of formData) {
      params.append(key, typeof value === "string" ? value : value.name);
    }
    url.search = params.toString();
  } catch {
    // If FormData cannot be built for an unusual form, fall back to the action URL.
  }

  return url;
}

export function PageLoadingProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loadingRef = useRef(false);
  // React 가 마지막으로 커밋한 경로. popstate 가 이미 끝난 이동인지 가리는 데 쓴다.
  const committedPathRef = useRef<string | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const finishTimer = useRef<number | null>(null);
  const historyTimer = useRef<number | null>(null);
  const submitTimer = useRef<number | null>(null);
  // 클릭으로 시작한 막대가 정말 이동으로 이어졌는지 지켜보는 타이머와 그 신호.
  const watchdogTimer = useRef<number | null>(null);
  const navigatedRef = useRef(false);
  // 누른 자리. 여기서 멀리 끌고 간 뒤 놓은 클릭은 이동 의도가 아니다(캐러셀 끌기).
  const pointerDownAt = useRef<{ x: number; y: number; at: number } | null>(null);

  const clearTimers = useCallback(() => {
    if (fallbackTimer.current) {
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
    if (finishTimer.current) {
      window.clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
    if (historyTimer.current) {
      window.clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    if (watchdogTimer.current) {
      window.clearTimeout(watchdogTimer.current);
      watchdogTimer.current = null;
    }
    if (submitTimer.current) {
      window.clearTimeout(submitTimer.current);
      submitTimer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    loadingRef.current = false;
    clearTimers();
    NProgress.done();
  }, [clearTimers]);

  const start = useCallback(
    (options?: { watchdogMs?: number }) => {
      clearTimers();
      // 이미 차오르는 중이면 다시 0 으로 돌리지 않는다 — 클릭·pushState·beforeunload 가
      // 한 번의 이동에 연달아 오면 막대가 "나왔다 안 나왔다" 하는 원인이 된다.
      if (!loadingRef.current) {
        loadingRef.current = true;
        NProgress.start();
      }
      fallbackTimer.current = window.setTimeout(() => {
        fallbackTimer.current = null;
        stop();
      }, 8000);

      // 클릭으로 시작했을 때만: 이동이 시작되지 않으면 곧 접는다.
      // 링크를 눌러도 이동하지 않는 경우가 있다 — 팝오버를 여는 링크, 그리고 캐러셀을
      // 끌고 놓았을 때 나는 클릭. 우리는 document 의 capture 단계에서 듣기 때문에 그런
      // 처리기가 preventDefault/stopPropagation 하기 *전에* 먼저 본다. 그대로 두면 더
      // 바뀔 주소가 없어 8 초 폴백까지 막대가 남는다.
      if (options?.watchdogMs) {
        navigatedRef.current = false;
        watchdogTimer.current = window.setTimeout(() => {
          watchdogTimer.current = null;
          if (!navigatedRef.current) stop();
        }, options.watchdogMs);
      }
    },
    [clearTimers, stop],
  );

  const scheduleStart = useCallback(
    (url: URL) => {
      if (historyTimer.current) {
        window.clearTimeout(historyTimer.current);
      }

      historyTimer.current = window.setTimeout(() => {
        historyTimer.current = null;
        // 0ms 로 예약해도 실제 실행은 메인 스레드가 빈 뒤다. 무거운 라우트(/shop 은 청크
        // 평가 + 렌더 + API 수십 개)에서는 0.5 초쯤 밀리고, 그 사이 이동이 끝나 finish() 가
        // 종료를 예약해 둔다. 그때 start() 를 부르면 clearTimers() 가 그 종료 예약까지
        // 지워서 막대를 끝내는 것이 8 초 폴백뿐이 된다 — 이동은 0.5 초에 끝났는데 9 초 남았다.
        // 목적지에 이미 도착했다면 이 시작은 철 지난 것이므로 건너뛴다.
        if (!shouldShowForUrl(url)) {
          return;
        }
        start();
      }, 0);
    },
    [start],
  );

  const finish = useCallback(() => {
    if (!loadingRef.current) {
      clearTimers();
      return;
    }

    if (finishTimer.current) {
      window.clearTimeout(finishTimer.current);
    }
    finishTimer.current = window.setTimeout(() => {
      finishTimer.current = null;
      stop();
    }, 180);
  }, [clearTimers, stop]);

  useEffect(() => {
    committedPathRef.current = pathname;
    finish();
    // `searchParams` changes identity when the query string changes.
  }, [finish, pathname, searchParams]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      pointerDownAt.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    };

    const wasDragged = (event: MouseEvent) => {
      const from = pointerDownAt.current;
      pointerDownAt.current = null;
      // 키보드(Enter·Space)로 활성화한 클릭과 스크립트가 만든 클릭은 detail 이 0 이고 좌표도
      // 0,0 이다. 눌린 자리와 비교하면 멀리 떨어져 보여 끌기로 오판하니 여기서 걸러 낸다.
      if (event.detail === 0) return false;
      // 링크 밖에서 끝난 끌기는 클릭을 만들지 않아 눌린 자리가 남는다. 오래된 것은 버린다.
      if (!from || Date.now() - from.at > POINTER_DOWN_STALE_MS) return false;
      return Math.abs(event.clientX - from.x) > DRAG_THRESHOLD_PX
        || Math.abs(event.clientY - from.y) > DRAG_THRESHOLD_PX;
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target && anchor.target !== "_self" || anchor.download) {
        return;
      }

      const url = getUrl(anchor.href);
      if (!url || url.hash && url.pathname === location.pathname && url.search === location.search) {
        return;
      }

      // 끌고 간 끝에 나는 클릭은 이동 의도가 아니다. 쇼핑 홈의 분류 줄·진열·후기는 모두
      // Swiper 이고 슬라이드가 링크라, 끌어서 넘기면 놓는 순간 링크 클릭이 발생한다.
      if (wasDragged(event)) {
        return;
      }

      if (shouldShowForUrl(url)) {
        start({ watchdogMs: NAVIGATION_WATCHDOG_MS });
      }
    };

    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) {
        return;
      }

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      if (submitTimer.current) {
        window.clearTimeout(submitTimer.current);
      }

      submitTimer.current = window.setTimeout(() => {
        submitTimer.current = null;

        if (event.defaultPrevented || !form.isConnected || formSubmitMethod(form, submitter) !== "get") {
          return;
        }

        const url = formSubmitUrl(form, submitter);
        if (url && shouldShowForUrl(url)) {
          // 검색 폼도 이동으로 이어지지 않을 수 있다(스크립트가 막는 경우).
          start({ watchdogMs: NAVIGATION_WATCHDOG_MS });
        }
      }, 0);
    };

    const onPopState = () => {
      navigatedRef.current = true;
      // popstate 는 브라우저가 주소를 이미 바꾼 뒤에 온다. 게다가 React 라우터의 리스너가
      // 우리보다 먼저 등록돼 있어 그 안에서 새 라우트를 동기 커밋해 버린다. 그러면 finish()
      // 가 "진행 중 아님"으로 먼저 빠져나가고, 뒤늦게 start() 한 막대는 더 바뀔 주소가 없어
      // 8 초 폴백까지 남는다(뒤로가기 한 번에 8.8 초). 이미 커밋된 주소면 시작하지 않는다.
      if (committedPathRef.current === window.location.pathname) {
        return;
      }
      start();
    };
    const onBeforeUnload = () => {
      navigatedRef.current = true;
      start();
    };
    const onPageShow = () => stop();
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(data, unused, url) {
      const nextUrl = getUrl(url);
      if (nextUrl && shouldShowForUrl(nextUrl)) {
        navigatedRef.current = true;
        scheduleStart(nextUrl);
      }
      return originalPushState.call(this, data, unused, url);
    };

    window.history.replaceState = function replaceState(data, unused, url) {
      const nextUrl = getUrl(url);
      if (nextUrl && shouldShowForUrl(nextUrl)) {
        navigatedRef.current = true;
        scheduleStart(nextUrl);
      }
      return originalReplaceState.call(this, data, unused, url);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      clearTimers();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pageshow", onPageShow);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [clearTimers, scheduleStart, start, stop]);

  // 막대 자체는 NProgress 가 <body> 끝에 #nprogress 로 그린다(스타일은 globals.css).
  return null;
}

export default PageLoadingProvider;
