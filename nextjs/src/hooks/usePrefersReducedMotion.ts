"use client";

import { useEffect, useState } from "react";

/**
 * 움직임을 줄여 달라고 한 사람인지(prefers-reduced-motion). 설정이 바뀌면 따라 바뀐다.
 * 앱(상품 이미지 크게 보기)과 테마(쇼핑 캐러셀 · 배너)가 같이 쓴다.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduced;
}
