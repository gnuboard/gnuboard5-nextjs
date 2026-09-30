"use client";

import { routeDataPrefetchTarget } from "@/lib/route-data-prefetch-target";
import { getBoard } from "@/services/boards";
import { getShopCategoryProductPage, getShopNaverPayConfig, getShopPolicy, getShopProductResult } from "@/services/shop";

/** 마우스가 링크 위에 이만큼 머물면 미리 부른다. 스쳐 지나가는 링크까지 부르지 않도록. */
const HOVER_INTENT_DELAY_MS = 65;

type ResolveClientPath = (href: string) => string | null;
/** 그 주소의 화면 코드(JS 조각)를 미리 싣는다 — route-code-preload.ts 의 preloadRouteCode. */
type PrefetchRoute = (clientPath: string) => void;

function prefersSavingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * 링크의 짧은 주소에 맞춰, 그 화면이 처음에 부를 읽기 전용 API 를 미리 부른다.
 * 결과는 services 가 쓰는 requestShare 에 잠깐 남고, 이동한 화면이 같은 키로 그대로 받아 쓴다.
 * 글 상세는 부르지 않는다(route-data-prefetch-target.ts 참고).
 */
export function prefetchRouteData(clientPath: string): void {
  const target = routeDataPrefetchTarget(clientPath);
  if (!target) return;

  switch (target.kind) {
    case "product":
      void getShopProductResult(target.itId);
      void getShopPolicy().catch(() => null);
      void getShopNaverPayConfig();
      return;
    case "category":
      void getShopCategoryProductPage(target.caId, target.params).catch(() => null);
      return;
    case "board":
      void getBoard(target.boTable).catch(() => null);
      return;
  }
}

/**
 * 문서에 "이동하려는 기색" 처리기를 단다 — 마우스가 머물 때, 누르기 시작할 때(터치 포함), 키보드 초점.
 * resolveClientPath 가 주소를 주는 링크(클라이언트 이동 대상)만 미리 부른다. 데이터 절약 모드면 아무것도 안 한다.
 *
 * prefetchRoute 를 주면 그 화면의 코드도 미리 싣는다(route-code-preload.ts — 처음 가는 화면의
 * 대체 화면과 React 의 300ms 묶임을 없앤다).
 *
 * 화면 코드는 마우스가 머물 때와 키보드 초점(:focus-visible)에서만 싣는다. 누르는 순간(pointerdown,
 * 그리고 클릭이 일으키는 초점)에 부르면 곧바로 이어지는 이동 요청과 겹쳐 PHP 브리지에 요청이 한꺼번에
 * 몰리고 오히려 늦어진다(실측: 첫 이동 160ms → 480ms). 누를 때는 읽기 전용 데이터만 부른다.
 * 떼어 내는 함수를 돌려준다.
 */
export function installRouteDataPrefetch(
  resolveClientPath: ResolveClientPath,
  prefetchRoute?: PrefetchRoute
): () => void {
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverAnchor: HTMLAnchorElement | null = null;

  function anchorFrom(target: EventTarget | null): HTMLAnchorElement | null {
    return target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
  }

  function prefetchAnchor(anchor: HTMLAnchorElement, withRoute: boolean) {
    if (prefersSavingData()) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;

    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;

    let clientPath: string | null = null;
    try {
      clientPath = resolveClientPath(new URL(href, window.location.href).href);
    } catch {
      return;
    }
    if (!clientPath) return;
    try {
      if (withRoute) prefetchRoute?.(clientPath);
    } catch {
      // 미리 받기는 덤이다 — 실패해도 이동은 평소대로 된다.
    }
    prefetchRouteData(clientPath);
  }

  function cancelHover() {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverAnchor = null;
  }

  function handlePointerOver(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const anchor = anchorFrom(event.target);
    if (!anchor || anchor === hoverAnchor) return;

    cancelHover();
    hoverAnchor = anchor;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      prefetchAnchor(anchor, true);
    }, HOVER_INTENT_DELAY_MS);
  }

  function handlePointerOut(event: PointerEvent) {
    if (!hoverAnchor) return;
    const next = event.relatedTarget;
    if (next instanceof Node && hoverAnchor.contains(next)) return;
    cancelHover();
  }

  function handlePointerDown(event: PointerEvent) {
    const anchor = anchorFrom(event.target);
    if (anchor) prefetchAnchor(anchor, false);
  }

  function handleFocusIn(event: FocusEvent) {
    const anchor = anchorFrom(event.target);
    // 마우스·터치로 누르면 그 링크에 초점도 온다 — 그때는 누르기 처리기가 이미 맡았다.
    if (anchor) prefetchAnchor(anchor, anchor.matches(":focus-visible"));
  }

  document.addEventListener("pointerover", handlePointerOver, { passive: true });
  document.addEventListener("pointerout", handlePointerOut, { passive: true });
  document.addEventListener("pointerdown", handlePointerDown, { passive: true });
  document.addEventListener("focusin", handleFocusIn);

  return () => {
    cancelHover();
    document.removeEventListener("pointerover", handlePointerOver);
    document.removeEventListener("pointerout", handlePointerOut);
    document.removeEventListener("pointerdown", handlePointerDown);
    document.removeEventListener("focusin", handleFocusIn);
  };
}
