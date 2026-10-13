import { clientThemeSettings, isG5AppRouteRoot, stripG5BasePath } from "@/lib/config";
import type { G5ThemeConfig } from "@/lib/theme-types";

/**
 * 관리자 › 환경설정 › 테마 화면 설정(plugin/webapp/theme-settings)의 값을 handbook 화면에 쓰는 순수 함수.
 * 값은 두 길로 온다 — 정적 빌드는 브리지가 런타임 설정(themeSettings)에 싣고, 서버 실행은 /v1/settings 의
 * theme_settings 를 서버가 읽는다(theme-settings.server.ts). 한 번도 저장하지 않은 설정(변경 번호 0)은 없는 것으로
 * 본다 — 그때는 예전처럼 환경변수(NEXT_PUBLIC_DOCS_GROUP)와 theme.config.ts 의 문구를 쓴다.
 */

/** 설정 행의 이름 — 다른 테마의 설정(/v1/settings 는 지금 적용한 테마의 값)을 자기 것으로 쓰지 않게. */
const THEME_NAME = "handbook";
/** 게시판 그룹 · 게시판 이름 모양(그누보드 gr_id · bo_table). */
const GROUP_PATTERN = /^[A-Za-z0-9_]{1,10}$/;
const TABLE_PATTERN = /^[A-Za-z0-9_]{1,20}$/;
/** 화면에 넣는 글의 길이 상한 — 저장할 때 PHP 가 이미 자르지만, 받은 값을 그대로 믿지 않는다. */
const MAX_TEXT_LENGTH = 300;
const MAX_CUSTOMER_CENTER_LINES = 5;

export type SidebarScreen = "home" | "docs" | "board" | "other";
export type SidebarMode = "auto" | "hidden";

const SIDEBAR_SCREENS: readonly SidebarScreen[] = ["home", "docs", "board", "other"];
const SITE_TEXT_KEYS = [
  "name",
  "logoText",
  "description",
  "homeTitle",
  "homeDescription",
  "footerDescription",
  "customerCenterTitle",
  "copyrightName",
] as const;

type SiteTextKey = (typeof SITE_TEXT_KEYS)[number];

/** 관리자가 적은 사이트 문구 — 비운 칸은 빠진다(테마 기본 문구를 쓴다). */
export type HandbookSiteTexts = Partial<Record<SiteTextKey, string>> & { customerCenterLines?: string[] };

export type HandbookThemeSettings = {
  revision: number;
  docs: { group: string; hints: Record<string, string> };
  sidebar: Record<SidebarScreen, SidebarMode>;
  site: HandbookSiteTexts;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 글자 단위(코드 포인트)로 자른다 — PHP 의 mb_substr 와 같은 셈이라, 정적 빌드에서 브리지가 HTML 에 미리 넣은 글자와
 * 하이드레이션 때 그리는 글자가 같다(settings-html.php handbook_settings_html_text).
 */
function cleanText(value: unknown): string {
  return typeof value === "string" ? Array.from(value.trim()).slice(0, MAX_TEXT_LENGTH).join("") : "";
}

/** 게시판 이름 → 안내 문구. 빈 문구와 게시판 이름 모양이 아닌 열쇠는 뺀다(PHP 는 빈 맵을 [] 로 보내기도 한다). */
function cleanHints(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([table, hint]) => [table, cleanText(hint)] as const)
      .filter(([table, hint]) => TABLE_PATTERN.test(table) && hint !== "")
  );
}

function cleanSiteTexts(value: unknown): HandbookSiteTexts {
  const site = isRecord(value) ? value : {};
  const texts = Object.fromEntries(
    SITE_TEXT_KEYS.map((key) => [key, cleanText(site[key])] as const).filter(([, text]) => text !== "")
  ) as HandbookSiteTexts;
  const lines = Array.isArray(site.customerCenterLines)
    ? site.customerCenterLines.map(cleanText).filter(Boolean).slice(0, MAX_CUSTOMER_CENTER_LINES)
    : [];
  return lines.length > 0 ? { ...texts, customerCenterLines: lines } : texts;
}

/**
 * 받은 값(런타임 설정 · /v1/settings)을 검사해 화면이 쓸 모양으로. 쓸 설정이 없으면 null —
 * 모양이 아니거나, 한 번도 저장하지 않았거나(변경 번호 0), 다른 테마의 설정일 때.
 */
export function parseHandbookThemeSettings(value: unknown, themeName: string = THEME_NAME): HandbookThemeSettings | null {
  if (!isRecord(value)) return null;
  const revision = Number(value.revision);
  if (!Number.isInteger(revision) || revision <= 0) return null;
  if (typeof value.theme === "string" && value.theme !== themeName) return null;

  const docs = isRecord(value.docs) ? value.docs : {};
  const group = cleanText(docs.group);
  const sidebar = isRecord(value.sidebar) ? value.sidebar : {};

  return {
    revision,
    docs: { group: GROUP_PATTERN.test(group) ? group : "", hints: cleanHints(docs.hints) },
    sidebar: Object.fromEntries(
      SIDEBAR_SCREENS.map((screen) => [screen, sidebar[screen] === "hidden" ? "hidden" : "auto"])
    ) as Record<SidebarScreen, SidebarMode>,
    site: cleanSiteTexts(value.site),
  };
}

/** 게시판 하나의 안내 문구. 게시판 이름이 constructor 같은 이름이어도 Object 의 속성을 집지 않는다. */
export function hintForTable(hints: Record<string, string>, table: string): string {
  return Object.prototype.hasOwnProperty.call(hints, table) ? hints[table] : "";
}

/** 테마 기본 문구(theme.config.ts)에 관리자가 적은 문구를 덮은 새 설정. 설정이 없으면 받은 것 그대로. */
export function withSiteTexts(config: G5ThemeConfig, settings: HandbookThemeSettings | null): G5ThemeConfig {
  if (!settings) return config;
  return { ...config, site: { ...config.site, ...settings.site } };
}

/**
 * 첫 화면 머리의 제목 · 소개. 관리자의 "첫 화면 제목 · 소개"가 먼저, 없으면 사이트 이름 · 소개(설정 → 테마 기본값).
 * 설정이 없으면 null — 첫 화면은 서버가 넘긴 테마 기본값을 그대로 쓴다.
 */
export function handbookHomeTexts(
  config: G5ThemeConfig,
  settings: HandbookThemeSettings | null
): { title: string; description: string } | null {
  if (!settings) return null;
  const site = withSiteTexts(config, settings).site;
  return {
    title: settings.site.homeTitle || site.name,
    description: settings.site.homeDescription || site.description,
  };
}

/** 게시판 화면 주소인가 — /boards/… 이거나, 첫 조각이 앱 화면 · 그누보드 폴더가 아닌 짧은 주소(/free, /free/12). */
function isBoardPath(path: string): boolean {
  const root = path.split("/").filter(Boolean)[0] ?? "";
  return root === "boards" || (root !== "" && !root.includes(".") && !isG5AppRouteRoot(root));
}

/**
 * 관리자 설정의 화면 종류 — 첫 화면(/ · /community) · 매뉴얼(목록 · 장) · 게시판(목록 · 글) · 그 밖(쇼핑몰 · 마이페이지 · FAQ …).
 * 주소로만 정한다 — 관리자 메뉴 묶음에 들었는지로 정하면 쇼핑몰 메뉴에 든 /shop 이 "게시판"이 되어 관리자 화면의
 * 설명과 어긋났다. inBook: 주소가 매뉴얼을 가리킨다.
 */
export function sidebarScreen(path: string, where: { inBook: boolean }): SidebarScreen {
  const stripped = stripG5BasePath(path.split(/[?#]/, 1)[0] || "/").replace(/\/+$/, "") || "/";
  // /community 도 첫 화면 컴포넌트(CommunityPage 슬롯 = 매뉴얼 표지)를 그린다.
  if (stripped === "/" || stripped === "/community") return "home";
  if (where.inBook) return "docs";
  return isBoardPath(stripped) ? "board" : "other";
}

/** 사이드바를 숨기는지 — 아직 정할 수 없으면 unknown(그동안은 브리지가 정한 값 · 예전 모양을 둔다). */
export type SidebarState = "hidden" | "shown" | "unknown";

/**
 * 이 화면에서 왼쪽 사이드바를 숨기는가(넓은 화면의 왼쪽 열 — 좁은 화면의 메뉴 서랍은 그대로 둔다).
 *
 * unknown: 정적 빌드가 아직 주소를 모를 때(하이드레이션 중, pathReady), 목차를 다 받기 전이라 게시판 주소가 매뉴얼인지
 * 모르는데 두 화면의 설정이 다를 때(booksSettled). 그동안은 브리지가 요청 때 정해 둔 값(<html data-doc-sidebar>)이 쓰인다
 * (theme/handbook/bridge/settings-html.php · theme.shell.css). 설정이 없으면 늘 보인다.
 */
export function sidebarState(
  settings: HandbookThemeSettings | null,
  state: { path: string; pathReady: boolean; booksSettled: boolean; inBook: boolean }
): SidebarState {
  // 주소를 모르면 설정과 상관없이 unknown — 정적 빌드는 빌드 때(설정 없음)와 하이드레이션 때(설정 있음) 모두 주소를 몰라
  // 같은 속성(data-sidebar 없음)으로 그려야 한다. 그래야 브리지의 <html data-doc-sidebar> 가 첫 그림에 쓰인다.
  if (!state.pathReady) return "unknown";
  if (!settings) return "shown";
  const screen = sidebarScreen(state.path, state);
  if (screen === "board" && !state.booksSettled && settings.sidebar.board !== settings.sidebar.docs) return "unknown";
  return settings.sidebar[screen] === "hidden" ? "hidden" : "shown";
}

let clientSettingsCache: { raw: unknown; value: HandbookThemeSettings | null } | null = null;

/**
 * 브라우저에서 본 설정(브리지가 실은 런타임 설정). 같은 값이면 같은 객체를 돌려준다 — useSyncExternalStore 가
 * 부를 때마다 새 객체를 받으면 끝없이 다시 그린다.
 */
export function clientHandbookThemeSettings(): HandbookThemeSettings | null {
  const raw = clientThemeSettings();
  if (clientSettingsCache === null || clientSettingsCache.raw !== raw) {
    clientSettingsCache = { raw, value: parseHandbookThemeSettings(raw) };
  }
  return clientSettingsCache.value;
}
