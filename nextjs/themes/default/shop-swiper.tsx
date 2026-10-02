"use client";

import type { Swiper as SwiperInstance } from "swiper";

/**
 * 쇼핑 홈 캐러셀의 공통 조각. 레퍼런스(theme/solune)와 같은 Swiper 11 을 쓴다 —
 * 배너(shop-banner) · 분류 칩 줄 · 진열 줄(shop-row) · 후기가 여기서 도우미를 받는다.
 * Swiper 기본 CSS 는 theme.shop.css 가 싣는다.
 */

/** 움직임을 줄여 달라고 한 사람인지 — 앱 공용 훅(src/hooks). 테마 안에서 여기서 가져다 쓰던 이름을 그대로 둔다. */
export { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/** 키보드로 옮긴 초점인가. 마우스로 단추를 누를 때 생기는 초점은 :focus-visible 이 아니다. */
function isKeyboardFocus(target: Element): boolean {
  try {
    return target.matches(":focus-visible");
  } catch {
    return true; // :focus-visible 을 모르는 브라우저 — 예전처럼 끌어온다.
  }
}

/** 칸이 캐러셀 창 안에 다 들어와 있는가(가장자리 1px 은 반올림 오차로 본다). */
function isSlideFullyVisible(swiper: SwiperInstance, slide: Element): boolean {
  const view = swiper.el.getBoundingClientRect();
  const rect = slide.getBoundingClientRect();
  return rect.left >= view.left - 1 && rect.right <= view.right + 1;
}

/**
 * 탭으로 화면 밖 칸에 초점이 가면 그 칸을 보이는 자리로 끌어온다. Swiper 는 이걸 해 주지 않아
 * 초점은 갔는데 화면에는 아무 변화가 없는 상태가 된다(레퍼런스 shop/index.php 와 같은 처리).
 * 쪽 단위로 넘기는 줄은 그 칸이 든 쪽의 첫 장으로 맞춘다.
 *
 * 키보드 초점이고 그 칸이 덜 보일 때만 움직인다. 전에는 마우스로 카드의 "담기"를 눌러도(단추가 초점을
 * 받는다) 그 카드가 줄 맨 앞으로 끌려가 줄이 왼쪽으로 미끄러졌다 — 이미 보이는 칸은 옮길 까닭이 없다.
 */
export function slideToFocusedSlide(swiper: SwiperInstance, target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const slide = target.closest(".swiper-slide");
  if (!slide || !slide.parentElement) return;
  if (!isKeyboardFocus(target) || isSlideFullyVisible(swiper, slide)) return;
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
