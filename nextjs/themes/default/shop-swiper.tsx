"use client";

import { useEffect, useState } from "react";
import type { Swiper as SwiperInstance } from "swiper";

/**
 * 쇼핑 홈 캐러셀의 공통 조각. 레퍼런스(theme/solune)와 같은 Swiper 11 을 쓴다 —
 * 배너(shop-banner) · 분류 칩 줄 · 진열 줄(shop-row) · 후기가 여기서 도우미를 받는다.
 * Swiper 기본 CSS 는 theme.shop.css 가 싣는다.
 */

/** 움직임을 줄여 달라고 한 사람인지. 바뀌면 따라 바뀐다. */
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

/**
 * 탭으로 화면 밖 칸에 초점이 가면 그 칸을 보이는 자리로 끌어온다. Swiper 는 이걸 해 주지 않아
 * 초점은 갔는데 화면에는 아무 변화가 없는 상태가 된다(레퍼런스 shop/index.php 와 같은 처리).
 * 쪽 단위로 넘기는 줄은 그 칸이 든 쪽의 첫 장으로 맞춘다.
 */
export function slideToFocusedSlide(swiper: SwiperInstance, target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const slide = target.closest(".swiper-slide");
  if (!slide || !slide.parentElement) return;
  const index = Array.prototype.indexOf.call(slide.parentElement.children, slide) as number;
  if (index < 0) return;
  const group = Number(swiper.params.slidesPerGroup) || 1;
  swiper.slideTo(Math.floor(index / group) * group);
}

/** Swiper 가 세워지기 전에 바깥 단추 · 표시 요소를 물려 준다(onBeforeInit 에서 부른다). */
export function attachSwiperControls(
  swiper: SwiperInstance,
  controls: {
    prevEl?: HTMLElement | null;
    nextEl?: HTMLElement | null;
    paginationEl?: HTMLElement | null;
    scrollbarEl?: HTMLElement | null;
  }
): void {
  const { navigation, pagination, scrollbar } = swiper.params;
  if (navigation && typeof navigation === "object") {
    navigation.prevEl = controls.prevEl ?? null;
    navigation.nextEl = controls.nextEl ?? null;
  }
  if (pagination && typeof pagination === "object" && controls.paginationEl) pagination.el = controls.paginationEl;
  if (scrollbar && typeof scrollbar === "object" && controls.scrollbarEl) scrollbar.el = controls.scrollbarEl;
}

/**
 * attachSwiperControls 의 늦은 판. Swiper 는 자기 레이아웃 이펙트에서 세워지는데, 그 뒤에 오는 형제
 * 요소(분류 줄 아래 막대 · 후기 아래 점)의 ref 는 그때 아직 비어 있다. 부모의 useEffect 에서 불러
 * 요소를 물리고 해당 모듈을 다시 세운다.
 */
export function bindSwiperControlsAfterMount(
  swiper: SwiperInstance,
  controls: Parameters<typeof attachSwiperControls>[1]
): void {
  attachSwiperControls(swiper, controls);
  if (controls.prevEl || controls.nextEl) {
    swiper.navigation?.destroy();
    swiper.navigation?.init();
    swiper.navigation?.update();
  }
  if (controls.paginationEl && swiper.pagination) {
    swiper.pagination.destroy();
    swiper.pagination.init();
    swiper.pagination.render();
    swiper.pagination.update();
  }
  if (controls.scrollbarEl && swiper.scrollbar) {
    swiper.scrollbar.destroy();
    swiper.scrollbar.init();
    swiper.scrollbar.updateSize();
    swiper.scrollbar.setTranslate();
  }
}
