/**
 * 검색엔진 노출 설정 — G5_NEXTJS_SEO*.
 *
 * 설치하는 사람이 켜야 노출된다(기본은 전부 off). 오픈소스로 여러 사람이 여러 환경·콘텐츠로 쓰므로
 * 개발 서버·회원 전용 사이트가 모르고 색인되는 일이 없게 한다.
 *
 *   G5_NEXTJS_SEO=on                  off: 모든 화면 noindex, robots.txt 전체 차단, 사이트맵 비움
 *   G5_NEXTJS_SEO_SITEMAP=on          off: 사이트맵에 고정 페이지만(DB·API 를 읽지 않음). SEO 가 off 면 무시
 *   G5_NEXTJS_SEO_EXCLUDE_BOARDS=qa   사이트맵과 색인에서 뺄 게시판(쉼표로 구분)
 *   G5_NEXTJS_SEO_SITEMAP_LIMIT=5000  사이트맵 최대 주소 수(1~50000)
 *
 * 읽는 곳은 산출물마다 다르다 — Vercel 은 Next 서버가 process.env 로, 테마 설치본은 테마 브리지(PHP)가
 * api/.env 로 요청 때 읽는다(theme/nextjs_default/bridge/seo.php, 같은 규칙). 정적 빌드에는 이 판단을 굽지 않는다.
 */

export const DEFAULT_SEO_SITEMAP_LIMIT = 5000;
export const MAX_SEO_SITEMAP_LIMIT = 50000;

export interface SeoSettings {
  enabled: boolean;
  sitemap: boolean;
  excludedBoards: string[];
  sitemapLimit: number;
}

/** 브라우저 런타임 설정(window.__G5_APP_CONFIG__.seo)에 싣는 부분 — 상세 화면이 robots 를 정할 때 쓴다. */
export interface RuntimeSeoConfig {
  enabled: boolean;
  excludedBoards: string[];
}

type EnvLike = Record<string, string | undefined>;

function isOn(value: string | undefined): boolean {
  return ["on", "true", "1", "yes"].includes((value ?? "").trim().toLowerCase());
}

function boardList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[0-9a-z_]+$/.test(item));
}

function sitemapLimit(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_SEO_SITEMAP_LIMIT;
  return Math.min(parsed, MAX_SEO_SITEMAP_LIMIT);
}

export function parseSeoSettings(env: EnvLike): SeoSettings {
  const enabled = isOn(env.G5_NEXTJS_SEO);
  return {
    enabled,
    sitemap: enabled && isOn(env.G5_NEXTJS_SEO_SITEMAP),
    excludedBoards: boardList(env.G5_NEXTJS_SEO_EXCLUDE_BOARDS),
    sitemapLimit: sitemapLimit(env.G5_NEXTJS_SEO_SITEMAP_LIMIT),
  };
}

/** Next 서버(Vercel·server runtime)용. 정적 빌드에서는 빌드 때 값이라 테마 브리지가 요청 때 덮어쓴다. */
export function serverSeoSettings(): SeoSettings {
  return parseSeoSettings({
    G5_NEXTJS_SEO: process.env.G5_NEXTJS_SEO,
    G5_NEXTJS_SEO_SITEMAP: process.env.G5_NEXTJS_SEO_SITEMAP,
    G5_NEXTJS_SEO_EXCLUDE_BOARDS: process.env.G5_NEXTJS_SEO_EXCLUDE_BOARDS,
    G5_NEXTJS_SEO_SITEMAP_LIMIT: process.env.G5_NEXTJS_SEO_SITEMAP_LIMIT,
  });
}

export function isSeoIndexableBoard(settings: Pick<SeoSettings, "enabled" | "excludedBoards">, boTable: string): boolean {
  return settings.enabled && !settings.excludedBoards.includes(boTable.trim().toLowerCase());
}

export function runtimeSeoConfig(settings: SeoSettings): RuntimeSeoConfig {
  return { enabled: settings.enabled, excludedBoards: settings.excludedBoards };
}
