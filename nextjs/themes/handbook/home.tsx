import type { G5ThemeComponentProps } from "@/lib/theme-types";
import { HandbookHomeContent } from "./home-content";

/**
 * 매뉴얼 표지(첫 화면 · 커뮤니티 첫 화면). 본문은 셸이 읽은 목차를 쓰는 클라이언트 부분(home-content.tsx)이고,
 * 여기서는 사이트 이름 · 설명만 건넨다 — 앱이 넘기는 다른 데이터(communityHome 등)를 브라우저로 보내지 않게.
 */
export function HandbookHomePage({ config }: G5ThemeComponentProps) {
  return <HandbookHomeContent name={config.site.name} description={config.site.description} />;
}
