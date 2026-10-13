import type { G5ThemeLayoutShellProps } from "@/lib/theme-types";
import { docsSourceFrom, loadDocsLibrary } from "./docs-nav";
import { HandbookRootLayoutShell, HandbookShopLayoutShell } from "./layout-shell";
import { loadHandbookThemeSettings } from "./theme-settings.server";

/**
 * LayoutShell 슬롯의 서버 진입점.
 *
 * 문서 목차를 서버에서 읽어 클라이언트 껍데기에 넘긴다. 정적 빌드로 배포된
 * 화면에서는 클라이언트 효과가 늦게 돌아서, 이렇게 하지 않으면 사이드바가
 * 잠시(또는 끝까지) 비어 보인다. 빠짐없이 읽었는지(complete)도 넘겨, 일부를 못 읽었으면
 * 브라우저가 다시 읽게 한다. 관리자 › 테마 화면 설정(매뉴얼 그룹 · 사이드바 · 문구)도 서버 실행이면 여기서 읽는다
 * (정적 빌드는 null — 브리지가 요청 때 런타임 설정에 싣는다).
 */
export async function HandbookServerLayoutShell(props: G5ThemeLayoutShellProps) {
  const themeSettings = await loadHandbookThemeSettings();
  const { books, complete } = await loadDocsLibrary(docsSourceFrom(themeSettings));
  return <HandbookRootLayoutShell {...props} books={books} booksComplete={complete} themeSettings={themeSettings} />;
}

/** ShopLayoutShell 슬롯의 서버 진입점 — 쇼핑 화면도 같은 문구 · 사이드바 설정을 쓴다(목차는 예전처럼 브라우저가 읽는다). */
export async function HandbookServerShopLayoutShell(props: G5ThemeLayoutShellProps) {
  const themeSettings = await loadHandbookThemeSettings();
  return <HandbookShopLayoutShell {...props} themeSettings={themeSettings} />;
}
