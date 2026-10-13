/**
 * 관리자 › 환경설정 › 테마 화면 설정(plugin/webapp/theme-settings)의 사이트 문구 중 문서 머리(<title> · 설명)에 쓰는 것.
 *
 * /v1/settings 의 theme_settings 는 지금 적용한 테마의 값이다 — 이 빌드의 테마(themeName)와 같고 한 번이라도 저장했을
 * 때(변경 번호 > 0)만 쓴다. 비운 칸은 테마 기본값(theme.config.ts). 화면 글자(로고 · 바닥글)는 테마가 따로 읽는다.
 */

const DOCUMENT_TEXT_KEYS = ["name", "description", "homeTitle", "homeDescription"] as const;
/** 받은 값을 그대로 믿지 않는다 — 저장할 때 PHP 가 자르는 길이와 같다. */
const MAX_TEXT_LENGTH = 300;

export type ThemeSiteTexts = Partial<Record<(typeof DOCUMENT_TEXT_KEYS)[number], string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** theme_settings 값에서 이 테마의 문서 머리 문구만 — 비운 칸 · 다른 테마 · 한 번도 저장하지 않은 값은 빠진다. */
export function themeSiteTextsFrom(value: unknown, themeName: string): ThemeSiteTexts {
  if (!isRecord(value) || value.theme !== themeName) return {};
  const revision = Number(value.revision);
  if (!Number.isInteger(revision) || revision <= 0) return {};
  const site = isRecord(value.site) ? value.site : {};
  return Object.fromEntries(
    DOCUMENT_TEXT_KEYS.map((key) => [key, typeof site[key] === "string" ? site[key].trim().slice(0, MAX_TEXT_LENGTH) : ""] as const).filter(
      ([, text]) => text !== ""
    )
  );
}

export type DocumentSiteTexts = { homeTitle?: string; homeDescription?: string; description: string };

/**
 * 첫 화면 제목 · 설명과 사이트 설명 — 관리자 문구가 먼저, 없으면 테마 기본값. 첫 화면은 화면의 첫 화면 머리와 같은 규칙
 * (첫 화면 제목 → 사이트 이름, 첫 화면 소개 → 사이트 소개)이라 탭 제목과 화면 제목이 어긋나지 않는다.
 */
export function documentSiteTexts(base: DocumentSiteTexts, texts: ThemeSiteTexts): DocumentSiteTexts {
  return {
    homeTitle: texts.homeTitle || texts.name || base.homeTitle,
    homeDescription: texts.homeDescription || texts.description || base.homeDescription,
    description: texts.description || base.description,
  };
}
