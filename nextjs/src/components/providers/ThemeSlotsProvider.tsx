"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { G5ThemeClientSlots } from "@/lib/theme-types";

/**
 * 테마의 클라이언트 프레젠테이션 슬롯(상품 카드, 글보기 헤더 …)을 클라이언트
 * 컴포넌트에 전달하는 컨텍스트.
 *
 * `@/lib/theme` 의 themeComponents 는 서버 컴포넌트(비동기 홈 등)까지 담고 있어
 * 클라이언트 번들에서 직접 import 할 수 없다. 루트 레이아웃(서버)이 여기 담긴
 * 클라이언트 참조만 골라 넘기고, 소비자는 useThemeSlot() 으로 꺼낸다.
 * 슬롯이 없으면 undefined 가 오고, 호출한 쪽이 기본 UI 를 그린다.
 */
const ThemeSlotsContext = createContext<G5ThemeClientSlots>({});

export function ThemeSlotsProvider({
  slots,
  children,
}: {
  slots: G5ThemeClientSlots;
  children: ReactNode;
}) {
  return <ThemeSlotsContext.Provider value={slots}>{children}</ThemeSlotsContext.Provider>;
}

export function useThemeSlot<K extends keyof G5ThemeClientSlots>(name: K): G5ThemeClientSlots[K] {
  return useContext(ThemeSlotsContext)[name];
}
