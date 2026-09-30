import { themeConfig } from "@g5-theme/theme.config";
import { usesServerRuntime } from "@/lib/next-runtime";
import { getPublicSettings } from "@/services/settings";

/** 테마에 적힌 기본 사이트 이름. 설치본의 사이트 제목(cf_title)이 비어 있을 때만 쓴다. */
export const THEME_SITE_NAME = themeConfig.site.name || "그누보드5";

/**
 * 제목·공유 카드·구조화 데이터에 쓸 사이트 이름 — 설치본마다 다르다(그누보드 관리자의 사이트 제목, cf_title).
 *
 * 서버 실행(Vercel)이면 공개 설정 API 의 cf_title 을 읽는다. 정적 빌드는 어느 사이트에 설치될지 모르므로
 * 테마 기본값을 굽고, 테마 브리지(theme/nextjs_default/bridge/seo.php)가 요청 때 설치본의 cf_title 로 바꾼다.
 */
export async function serverSiteName(): Promise<string> {
  if (!usesServerRuntime()) return THEME_SITE_NAME;

  const settings = await getPublicSettings(3600).catch(() => null);
  const title = typeof settings?.cf_title === "string" ? settings.cf_title.trim() : "";

  return title || THEME_SITE_NAME;
}
