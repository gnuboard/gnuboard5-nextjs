"use client";

import { useEffect, useRef } from "react";
import { qaFocusIdFromSearch, reviewFocusIdFromSearch } from "@/components/shop/productDetailHelpers";

const PRODUCT_DETAIL_TABLIST_SELECTOR = '[role="tablist"][aria-label="상품 상세 정보"]';

/** 상품 상세 탭 띠로 올라간다 — 떠 있는 머리(쇼핑 헤더) 높이만큼 덜 내려가 머리에 가리지 않게 한다. */
export function scrollToProductDetailTabs(): void {
  const tablist = document.querySelector<HTMLElement>(PRODUCT_DETAIL_TABLIST_SELECTOR);
  if (!tablist) return;
  const header = document.querySelector<HTMLElement>("header");
  const offset = (header?.getBoundingClientRect().height ?? 0) + 16;
  window.scrollTo({ top: tablist.getBoundingClientRect().top + window.scrollY - offset, behavior: "instant" });
}

/**
 * 탭을 골라 들어오면(?tab= · ?form= — 사용후기 목록의 "후기 바로가기" 등) 그 탭 자리로 내려간다.
 * 탭은 상품 사진 · 구매 상자 아래 멀리 있어 맨 위에 머무르면 고른 탭이 보이지 않는다. 같은 주소에는 한 번만.
 */
export function useProductDetailFocusScroll(productId: string | undefined, productQueryString: string): void {
  const scrolledTabKeyRef = useRef("");
  useEffect(() => {
    if (!productId) return;
    const params = new URLSearchParams(productQueryString);
    // ?is_id= 면 탭이 아니라 그 후기로 간다(레퍼런스 item.php?is_id= — 그 줄로 데려가 잠깐 표시).
    // ?iq_id= 면 그 문의로(레퍼런스와 같이 후기와 문의를 둘 다 달고 오면 후기를 앞세운다).
    const reviewFocusId = reviewFocusIdFromSearch(productQueryString);
    const qaFocusId = reviewFocusId ? 0 : qaFocusIdFromSearch(productQueryString);
    const focusId = reviewFocusId || qaFocusId;
    const focusSelector = reviewFocusId
      ? `[data-review-id="${reviewFocusId}"]`
      : `[data-qa-id="${qaFocusId}"]`;
    if (!params.get("tab") && !params.get("form") && !focusId) return;
    const key = `${productId}?${productQueryString}`;
    if (scrolledTabKeyRef.current === key) return;

    // 탭은 상품 정보보다 늦게 그려지고, 위의 사진이 늦게 읽히면 아래로 밀린다 — 탭이 생길 때까지 잠깐 기다렸다가
    // 내려가고, 밀리면 두 번 더 맞춘다. 그사이 사용자가 스크롤 · 누르기 · 키 입력을 하면 그만둔다.
    let stopped = false;
    const timers: number[] = [];
    const stopEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const stop = () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      stopEvents.forEach((type) => window.removeEventListener(type, stop));
    };
    // 찾아갈 자리 — 후기 · 문의를 가리켰으면 그 카드, 아니면 탭 띠. 이 상품 것이 아니어서 끝내 안 나오면 탭 띠로.
    let useTabs = !focusId;
    const findTarget = () =>
      useTabs
        ? document.querySelector<HTMLElement>(PRODUCT_DETAIL_TABLIST_SELECTOR)
        : document.querySelector<HTMLElement>(focusSelector);
    const scrollToTarget = (): HTMLElement | null => {
      const target = findTarget();
      if (!target) return null;
      // 떠 있는 머리(쇼핑 헤더) 높이만큼 덜 내려가 머리에 가리지 않게 한다.
      const header = document.querySelector<HTMLElement>("header");
      const offset = (header?.getBoundingClientRect().height ?? 0) + (useTabs ? 16 : 24);
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: "instant" });
      return target;
    };
    const TARGET_WAIT_MS = 100;
    const TARGET_WAIT_TRIES = 50;
    /** 찾아간 후기 표시를 걷는 때(레퍼런스와 같이 5초 — 어느 줄인지 알렸으면 할 일을 다 했다). */
    const FOCUS_MARK_MS = 5000;
    let tries = 0;
    const attempt = () => {
      if (stopped) return;
      const target = scrollToTarget();
      if (target) {
        scrolledTabKeyRef.current = key;
        if (!useTabs) {
          target.dataset.focused = "true";
          target.focus({ preventScroll: true });
          window.setTimeout(() => {
            target.dataset.focused = "false";
          }, FOCUS_MARK_MS);
        }
        stopEvents.forEach((type) => window.addEventListener(type, stop, { passive: true }));
        [500, 1500].forEach((delay) => timers.push(window.setTimeout(() => !stopped && scrollToTarget(), delay)));
        timers.push(window.setTimeout(stop, 1600));
        return;
      }
      if (++tries < TARGET_WAIT_TRIES) {
        timers.push(window.setTimeout(attempt, TARGET_WAIT_MS));
      } else if (!useTabs) {
        useTabs = true;
        tries = 0;
        timers.push(window.setTimeout(attempt, 0));
      }
    };
    timers.push(window.setTimeout(attempt, 0));
    return stop;
  }, [productId, productQueryString]);
}
