import { getPublicSettings } from "@/services/settings";
import { parseHandbookThemeSettings, type HandbookThemeSettings } from "./theme-settings";

/** 서버 실행이 관리자 설정을 다시 읽는 간격(초) — 저장한 값이 이만큼 안에 화면에 보인다. 목차 캐시(30초)와 같다. */
const SETTINGS_REVALIDATE_SECONDS = 30;

/**
 * 서버 실행(next start · 개발 서버 · Vercel)에서 관리자 › 테마 화면 설정을 읽는다(/v1/settings 의 theme_settings).
 * 정적 빌드는 읽지 않는다 — 빌드한 곳의 설정이 결과물에 박히면 안 되고, 브리지가 요청 때 런타임 설정에 싣는다.
 * 못 읽으면 null(테마 기본값 · 환경변수) — 화면을 멈추지 않는다.
 */
export async function loadHandbookThemeSettings(): Promise<HandbookThemeSettings | null> {
  if (process.env.G5_NEXT_RUNTIME === "static") return null;
  const settings = await getPublicSettings(SETTINGS_REVALIDATE_SECONDS).catch(() => null);
  return parseHandbookThemeSettings(settings?.theme_settings);
}
