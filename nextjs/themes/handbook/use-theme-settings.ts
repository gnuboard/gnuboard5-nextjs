"use client";

import { useSyncExternalStore } from "react";
import { clientHandbookThemeSettings, type HandbookThemeSettings } from "./theme-settings";

const subscribeNothing = () => () => {};
const isStaticBuild = () => process.env.G5_NEXT_RUNTIME === "static";

/**
 * 화면이 쓸 관리자 › 테마 화면 설정.
 *
 * 서버 실행은 서버가 읽어 넘긴 값(serverValue) 그대로라 서버 HTML 과 첫 렌더가 같다.
 * 정적 빌드는 브리지가 요청 때 실은 런타임 설정을 쓴다. 빌드한 HTML 에는 설정이 없으므로 하이드레이션 동안은
 * null(테마 기본값)로 그리고, 붙은 뒤 바로 설정 값으로 바꾼다 — 서버 값과 브라우저 값이 어긋나 하이드레이션
 * 오류가 나지 않게(useSyncExternalStore 의 서버 값 → 브라우저 값, layout-shell.tsx 의 useHighlightPath 와 같은 방식).
 */
export function useHandbookThemeSettings(serverValue: HandbookThemeSettings | null): HandbookThemeSettings | null {
  return useSyncExternalStore(
    subscribeNothing,
    () => (isStaticBuild() ? clientHandbookThemeSettings() : serverValue),
    () => (isStaticBuild() ? null : serverValue)
  );
}
