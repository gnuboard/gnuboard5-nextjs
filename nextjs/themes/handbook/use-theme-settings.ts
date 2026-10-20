"use client";

import { useSyncExternalStore } from "react";
import { clientThemeSettingsApplied } from "@/lib/config";
import { useSettingsEditor } from "./settings-editor/editor-store";
import { clientHandbookThemeSettings, type HandbookThemeSettings } from "./theme-settings";

const subscribeNothing = () => () => {};
const isStaticBuild = () => process.env.G5_NEXT_RUNTIME === "static";

/**
 * 화면이 쓸 관리자 › 테마 화면 설정.
 *
 * 서버 실행은 서버가 읽어 넘긴 값(serverValue) 그대로라 서버 HTML 과 첫 렌더가 같다.
 * 정적 빌드는 브리지가 요청 때 실은 런타임 설정을 쓴다. 브리지가 HTML 의 data-ts 글자를 같은 설정으로 이미 바꿔
 * 내보냈으면(themeSettingsApplied, theme/handbook/bridge/settings-html.php) 하이드레이션부터 설정을 써 기본 문구가 잠깐
 * 보였다 바뀌지 않는다. 아니면(예전 브리지 · 바꾸기 실패) 하이드레이션 동안은 null(빌드 HTML 의 테마 기본값)로 그리고 붙은 뒤
 * 바꾼다 — 글자가 어긋나 하이드레이션 오류가 나지 않게. 빌드 중(서버)에는 window 가 없어 null 이다.
 *
 * 최고관리자가 화면 편집 창에서 저장하면 그 값(live)이 먼저다 — 새로고침 없이 바로 바뀐다. 저장은 브라우저에서
 * 붙은 뒤에만 일어나므로 하이드레이션과 어긋나지 않는다.
 */
export function useHandbookThemeSettings(serverValue: HandbookThemeSettings | null): HandbookThemeSettings | null {
  const live = useSettingsEditor((state) => state.live);
  const base = useSyncExternalStore(
    subscribeNothing,
    () => (isStaticBuild() ? clientHandbookThemeSettings() : serverValue),
    () => {
      if (!isStaticBuild()) return serverValue;
      return clientThemeSettingsApplied() ? clientHandbookThemeSettings() : null;
    }
  );
  return live ?? base;
}
