"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORAGE_KEY = "handbook-theme";
const ATTRIBUTE = "data-handbook-theme";

type ThemeMode = "light" | "dark";

/**
 * 상단 바의 라이트/다크 전환 — 기본 테마(Next.js Default)의 전환 버튼과 같은 방식.
 *
 * 앱 전역 next-themes 는 forcedTheme="light" 로 고정돼 있어(src/app/layout.tsx) `.dark` 클래스가
 * 붙지 않는다. 그래서 뿌리 요소의 data-handbook-theme 속성만 바꾸고, theme.tokens.css 가 그
 * 속성에서 다크 토큰을 켠다.
 */
/** 저장해 둔 테마. storageGet 은 저장이 막힌 브라우저에서도 던지지 않고 null 을 준다. */
function readStoredTheme(): ThemeMode | null {
  const saved = storageGet(STORAGE_KEY);
  return saved === "dark" || saved === "light" ? saved : null;
}

/**
 * 첫 페인트 전에 저장된 테마(없으면 운영체제 설정)를 적용한다. 셸 최상단에서 한 번 렌더한다.
 * HTML 에 그대로 실리는 문자열이라 모듈 함수(storageGet 등)를 부를 수 없다 — 저장소는 직접 읽고 try 로 감싼다.
 */
export const handbookThemeBootScript = `(function(){try{var s=window.localStorage.getItem('${STORAGE_KEY}');var t=(s==='dark'||s==='light')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('${ATTRIBUTE}',t);}catch(e){}})();`;

export function HandbookThemeSwap() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute(ATTRIBUTE) as ThemeMode | null) ||
      readStoredTheme() ||
      "light";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute(ATTRIBUTE, next);
    // 저장이 막힌 브라우저에서는 storageSet 이 false 를 줄 뿐 — 화면 전환은 그대로 동작한다.
    storageSet(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      className="doc-icon-btn doc-theme-swap"
      onClick={toggle}
      // 켜고 끄는 단추라 이름은 고정하고 상태는 aria-pressed 로 — 이름까지 바꾸면 "밝은 모드로 전환, 눌림"처럼 모순되게 읽힌다.
      aria-label="어두운 모드"
      aria-pressed={mounted ? theme === "dark" : undefined}
      title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
    >
      {mounted && theme === "dark" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
    </button>
  );
}
