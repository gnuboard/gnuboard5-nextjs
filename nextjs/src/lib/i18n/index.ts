"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeLocalStateStorage } from "@/lib/safe-storage";
import {
  DEFAULT_LOCALE,
  MESSAGES,
  SUPPORTED_LOCALES,
  type Locale,
} from "./messages";

export type { Locale } from "./messages";
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./messages";

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

/**
 * 가벼운 로케일 store — localStorage 영속.
 * SSR 에선 DEFAULT_LOCALE 로 시작 → hydration 후 사용자 선호로 전환.
 *
 * NEXT_PUBLIC_DEFAULT_LOCALE 환경변수로 운영자가 기본값 변경 가능.
 */
const ENV_DEFAULT =
  (typeof process !== "undefined" && (process.env?.NEXT_PUBLIC_DEFAULT_LOCALE as Locale)) ||
  DEFAULT_LOCALE;

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: ENV_DEFAULT,
      setLocale: (locale) => {
        if (SUPPORTED_LOCALES.includes(locale)) set({ locale });
      },
    }),
    // 저장소가 막히거나 가득 차도 언어 바꾸기가 예외로 끝나지 않게(lib/safe-storage.ts).
    { name: "shop-locale", storage: createJSONStorage(() => safeLocalStateStorage) }
  )
);

/**
 * 번역 헬퍼 — t(key) 가 현재 locale 의 번역을 반환. 누락 시 ko 폴백 → key 그대로.
 *
 *   const t = useT();
 *   <span>{t('cart.add')}</span>
 */
export function useT(): (key: string) => string {
  const locale = useLocaleStore((s) => s.locale);
  const messages = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return (key: string) =>
    messages[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
}
