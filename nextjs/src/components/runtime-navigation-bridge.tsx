"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  g5BasePathForRuntime,
  g5PathForRuntime,
  isG5ThemeRuntime,
  shouldRouteThroughG5,
  shouldUseG5DocumentNavigation,
  stripG5BasePath,
} from "@/lib/config";
import { toG5ShortPath } from "@/lib/g5-short-url";
import { g5ClientNavigationPath, isThemeClientNavigationEnabled } from "@/lib/runtime-router";
import { installRouteDataPrefetch } from "@/lib/route-data-prefetch";
import { preloadRouteCode, scheduleIdleRouteCodePreload } from "@/lib/route-code-preload";
import { requestShare } from "@/lib/request-share";
import { useAuthStore } from "@/store/auth";
import { useRouteScrollReset } from "@/hooks/use-route-scroll-reset";

function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function closestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
}

function isIgnoredHref(href: string): boolean {
  const normalized = href.trim().toLowerCase();
  return (
    !normalized ||
    normalized.startsWith("#") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("javascript:")
  );
}

function splitPathSuffix(path: string): [string, string] {
  const match = path.match(/^([^?#]*)(.*)$/);
  return [match?.[1] || "/", match?.[2] || ""];
}

type RuntimeTarget = {
  href: string;
  forceDocumentNavigation: boolean;
};

export function RuntimeNavigationBridge() {
  const router = useRouter();
  const pathname = usePathname();
  // 셸을 나눠 쓰는 화면끼리 옮겨 가면 Next 가 스크롤을 올리지 않는다 — 대신 올린다.
  useRouteScrollReset(pathname);

  useEffect(() => {
    const basePath = g5BasePathForRuntime();
    const shouldShorten = isG5ThemeRuntime();
    if (!basePath && !shouldShorten) return;

    function runtimeTargetFor(url: URL): RuntimeTarget | null {
      if (url.origin !== window.location.origin) return null;

      const [pathname, suffix] = splitPathSuffix(`${url.pathname}${url.search}${url.hash}`);
      const runtimePath = `${stripG5BasePath(pathname)}${suffix}`;
      const targetPath = shouldShorten ? toG5ShortPath(runtimePath) : runtimePath;
      const targetRoute = targetPath.split(/[?#]/)[0] || "/";
      const forceDocumentNavigation = shouldShorten && shouldUseG5DocumentNavigation(targetRoute);

      if (targetPath === runtimePath && !basePath && !forceDocumentNavigation) return null;
      if (!shouldRouteThroughG5(targetRoute) && targetPath === runtimePath && !forceDocumentNavigation) return null;

      return {
        href: g5PathForRuntime(targetPath),
        forceDocumentNavigation,
      };
    }

    function rewriteAnchorHref(anchor: HTMLAnchorElement) {
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") || "";
      if (isIgnoredHref(href)) return;

      const target = runtimeTargetFor(new URL(href, window.location.href));
      if (target && anchor.getAttribute("href") !== target.href) {
        anchor.setAttribute("href", target.href);
      }
    }

    function rewriteAnchors(root: ParentNode = document) {
      root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(rewriteAnchorHref);
    }

    function handleClick(event: MouseEvent) {
      if (!isPlainClick(event)) return;

      const anchor = closestAnchor(event.target);
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") || "";
      if (isIgnoredHref(href)) return;

      const url = new URL(href, window.location.href);
      // 클라이언트 이동 대상은 아래 버블 단계 처리기(와 Next Link)에 맡긴다.
      if (g5ClientNavigationPath(url.href)) return;

      const target = runtimeTargetFor(url);
      if (!target) return;
      if (!target.forceDocumentNavigation && `${url.pathname}${url.search}${url.hash}` === target.href) return;

      event.preventDefault();
      window.location.assign(target.href);
    }

    /**
     * 테마가 features.clientNavigation 을 켰을 때, 일반 <a> 링크(게시판 목록 줄 등)도 Next 라우터로 보낸다.
     * 버블 단계라서 Next Link 나 링크 자체의 onClick 이 먼저 처리하고, 그쪽이 preventDefault 했으면
     * (isPlainClick 의 defaultPrevented) 손대지 않는다 — 팝오버를 여는 링크 같은 것을 가로채지 않는다.
     */
    function handleClientNavigationClick(event: MouseEvent) {
      if (!isPlainClick(event)) return;

      const anchor = closestAnchor(event.target);
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") || "";
      if (isIgnoredHref(href)) return;

      const clientPath = g5ClientNavigationPath(new URL(href, window.location.href).href);
      if (!clientPath) return;

      event.preventDefault();
      router.push(clientPath);
    }

    rewriteAnchors();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof HTMLAnchorElement) {
          rewriteAnchorHref(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLAnchorElement) {
            rewriteAnchorHref(node);
          } else if (node instanceof Element) {
            rewriteAnchors(node);
          }
        });
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["href"],
      childList: true,
      subtree: true,
    });

    document.addEventListener("click", handleClick, true);
    document.addEventListener("click", handleClientNavigationClick);
    // 이동하려는 기색이 보이면 그 화면의 코드와 읽기 전용 데이터를 미리 부른다(클라이언트 이동을 켠 테마만).
    // 테마 설치본(정적 내보내기)이면 화면 코드도 미리 싣는다(route-code-preload.ts 참고).
    // 서버 실행에는 <경로>.txt 정적 파일이 없다.
    const removeRouteDataPrefetch = isThemeClientNavigationEnabled()
      ? installRouteDataPrefetch(g5ClientNavigationPath, shouldShorten ? preloadRouteCode : undefined)
      : () => undefined;

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("click", handleClientNavigationClick);
      removeRouteDataPrefetch();
    };
  }, [router]);

  // 화면이 뜨고 한가해지면 본문 링크의 화면 종류마다 하나씩 코드를 미리 싣는다 — 마우스가 머무는 일이
  // 없는 휴대폰에서도 처음 가는 화면이 대체 화면 없이 뜨도록(route-code-preload.ts). 테마 설치본만.
  useEffect(() => {
    if (!isThemeClientNavigationEnabled() || !isG5ThemeRuntime()) return;
    return scheduleIdleRouteCodePreload(g5ClientNavigationPath);
  }, [pathname]);

  // 나눠 쓰던 응답(request-share)은 로그인한 사람 기준이었을 수 있다 — 로그인 상태가 바뀌면 버린다.
  // 정적 배포본이든 서버 런타임이든 브라우저에서는 늘 나눠 쓰므로 위 effect 의 조기 return 밖에 둔다.
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (state.user?.mb_id !== previous.user?.mb_id) requestShare.clear();
      }),
    []
  );

  return null;
}
