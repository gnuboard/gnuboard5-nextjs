"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * 다른 화면으로 옮겨 갔는데 본문 머리가 화면 위로 밀려나 있으면 맨 위로 올린다.
 *
 * Next 는 바뀐 세그먼트를 보고 스크롤을 올린다. 그런데 정적 설치본은 글보기 · 목록 같은 화면을
 * 셸 하나(`/boards/__g5_static__/0` 등)가 나눠 쓰므로, 글에서 다른 글로 가도 세그먼트가 그대로라
 * 스크롤이 남는다 — 글 아래 목록 끝에서 다른 글을 누르면 새 글의 댓글 근처가 뜬다.
 * Next 가 이미 올렸으면 본문 머리가 화면 안에 있으므로 여기서는 아무것도 하지 않는다.
 *
 * 뒤로 · 앞으로(popstate)는 브라우저가 자리를 되찾으므로, #해시 이동은 해시 대상이 자리를 잡으므로 건드리지 않는다.
 */
export function useRouteScrollReset(pathname: string): void {
  const previousPathRef = useRef(pathname);
  const traversalPathRef = useRef<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      traversalPathRef.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 새 화면이 그려진 그 커밋에서 맞춘다 — useEffect 면 아래쪽 자리가 한 번 보였다가 튄다.
  useLayoutEffect(() => {
    if (previousPathRef.current === pathname) return;
    previousPathRef.current = pathname;

    const traversalPath = traversalPathRef.current;
    traversalPathRef.current = null;
    if (traversalPath === window.location.pathname) return;
    if (window.location.hash) return;

    const main = document.getElementById("main-content");
    if (main && main.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [pathname]);
}
