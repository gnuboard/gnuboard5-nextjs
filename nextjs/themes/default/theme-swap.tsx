"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORAGE_KEY = "solune-theme";

/**
 * 헤더의 라이트/다크 스왑.
 *
 * 앱 전역 next-themes 는 forcedTheme="light" 로 고정돼 있어(src/app/layout.tsx)
 * `.dark` 클래스가 붙지 않는다. 그래서 이 테마는 뿌리 요소의
 * data-solune-theme 속성만 바꾸고, theme.tokens.css 가 그 속성에서 다크
 * 토큰을 켠다. 저장 키는 레퍼런스 사이트와 같은 'solune-theme' 이다.
 */
function readStoredTheme(): "light" | "dark" | null {
  try {
    const saved = storageGet(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : null;
  } catch {
    return null;
  }
}

/**
 * 첫 페인트 전에 저장된 테마를 적용한다. 셸 최상단에서 한 번 렌더한다.
 * HTML 에 그대로 실리는 문자열이라 모듈 함수(storageGet 등)를 부를 수 없다 — 저장소는 직접 읽고 try 로 감싼다.
 */
export const soluneThemeBootScript = `(function(){try{var k='${STORAGE_KEY}';var s=window.localStorage.getItem(k);var t=(s==='dark'||s==='light')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-solune-theme',t);}catch(e){}})();`;

export function SoluneThemeSwap() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-solune-theme") as "light" | "dark" | null) ||
      readStoredTheme() ||
      "light";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-solune-theme", next);
    try {
      storageSet(STORAGE_KEY, next);
    } catch {
      /* 저장이 막힌 브라우저에서도 화면 전환은 그대로 동작한다. */
    }
  }

  return (
    <button
      type="button"
      className="solune-theme-swap"
      onClick={toggle}
      aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
      aria-pressed={mounted ? theme === "dark" : undefined}
    >
      {mounted && theme === "dark" ? (
        <Moon size={17} aria-hidden />
      ) : (
        <Sun size={17} aria-hidden />
      )}
    </button>
  );
}
