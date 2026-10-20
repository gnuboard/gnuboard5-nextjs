/**
 * 화면 편집 창의 값 — 서버 값(GET /v1/theme-settings) ↔ 입력 칸 ↔ 저장 요청. 화면 없이 테스트할 수 있게 순수 함수로 둔다.
 * 글자 수 상한은 PHP(plugin/webapp/theme-settings/settings.php webapp_theme_settings_normalize)와 같다 — 넘치면 서버가 자른다.
 */
import type { SidebarMode, SidebarScreen } from "../theme-settings";

export const SITE_FIELDS = [
  { key: "logoText", label: "로고 글자", max: 30, where: "왼쪽 위 로고 옆" },
  { key: "name", label: "사이트 이름", max: 60, where: "바닥글 · 첫 화면 제목이 비었을 때" },
  { key: "description", label: "사이트 소개", max: 200, where: "첫 화면 소개가 비었을 때" },
  { key: "homeTitle", label: "첫 화면 제목", max: 60, where: "첫 화면 큰 제목" },
  { key: "homeDescription", label: "첫 화면 소개", max: 300, where: "첫 화면 제목 아래", multiline: true },
  { key: "footerDescription", label: "바닥글 설명", max: 300, where: "맨 아래 사이트 이름 밑", multiline: true },
  { key: "customerCenterTitle", label: "고객센터 제목", max: 40, where: "바닥글 가운데 칸 제목" },
  { key: "copyrightName", label: "저작권 이름", max: 60, where: "맨 아래 © 다음" },
] as const;

export type SiteFieldKey = (typeof SITE_FIELDS)[number]["key"];

export const CUSTOMER_CENTER_LINE_MAX = 120;
export const CUSTOMER_CENTER_LINES = 5;
export const HINT_MAX = 100;
export const BOARD_SUBJECT_MAX = 255;

export const SIDEBAR_SCREENS: ReadonlyArray<{ key: SidebarScreen; label: string; detail: string }> = [
  { key: "home", label: "첫 화면", detail: "사이트 첫 화면" },
  { key: "docs", label: "매뉴얼 화면", detail: "매뉴얼 목차와 각 장" },
  { key: "board", label: "게시판 화면", detail: "매뉴얼이 아닌 게시판의 목록 · 글" },
  { key: "other", label: "그 밖의 화면", detail: "쇼핑몰 · 마이페이지 · 자주 묻는 질문 …" },
];

export type EditorBoard = { bo_table: string; bo_subject: string; bo_order: number; bo_count_write: number };
export type EditorGroup = { gr_id: string; gr_subject: string };

/** GET /v1/theme-settings 의 data. */
export type EditorState = {
  theme: string;
  revision: number;
  settings: {
    docs: { group: string; hints: Record<string, string> };
    sidebar: Record<SidebarScreen, SidebarMode>;
    site: Record<SiteFieldKey, string> & { customerCenterLines: string[] };
  };
  groups: EditorGroup[];
  boards: EditorBoard[];
};

/** 입력 칸 — 모두 글자(숫자 칸도 입력 중에는 글자다). */
export type EditorForm = {
  site: Record<SiteFieldKey, string>;
  /** 고객센터 안내 — 한 줄에 하나. */
  customerCenterLines: string;
  sidebar: Record<SidebarScreen, SidebarMode>;
  group: string;
  hints: Record<string, string>;
  boards: Record<string, { order: string; subject: string }>;
};

/** PUT /v1/theme-settings 본문. */
export type EditorPayload = {
  revision: number;
  docs: { group: string; hints: Record<string, string> };
  sidebar: Record<SidebarScreen, SidebarMode>;
  site: Record<SiteFieldKey, string> & { customerCenterLines: string[] };
  /** 바꾼 게시판만 — orig_* 는 편집 창을 열 때 본 값(서버는 그 값과 같은 칸은 쓰지 않는다). */
  boards: Record<string, { order: number; subject: string; orig_order?: number; orig_subject?: string }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function formFromState(state: EditorState): EditorForm {
  const site = Object.fromEntries(SITE_FIELDS.map(({ key }) => [key, text(state.settings.site[key])])) as Record<
    SiteFieldKey,
    string
  >;
  const hints = state.settings.docs.hints && typeof state.settings.docs.hints === "object" ? state.settings.docs.hints : {};
  return {
    site,
    customerCenterLines: (state.settings.site.customerCenterLines ?? []).join("\n"),
    sidebar: Object.fromEntries(
      SIDEBAR_SCREENS.map(({ key }) => [key, state.settings.sidebar[key] === "hidden" ? "hidden" : "auto"])
    ) as Record<SidebarScreen, SidebarMode>,
    group: text(state.settings.docs.group),
    hints: Object.fromEntries(state.boards.map((board) => [board.bo_table, text(hints[board.bo_table])])),
    boards: Object.fromEntries(
      state.boards.map((board) => [board.bo_table, { order: String(board.bo_order), subject: board.bo_subject }])
    ),
  };
}

/** 출력 순서 칸 — 숫자가 아니면 0, 0~9999 로 자른다(PHP 와 같다). */
function orderNumber(value: string): number {
  const number = Number.parseInt(value.trim(), 10);
  return Number.isFinite(number) ? Math.max(0, Math.min(9999, number)) : 0;
}

/** 게시판 한 줄을 저장 값으로 — 순서는 0~9999 정수, 이름은 앞뒤 공백을 뗀다. */
function boardValue(row: { order: string; subject: string }): { order: number; subject: string } {
  return { order: orderNumber(row.order), subject: row.subject.trim() };
}

/**
 * 저장 요청. 안내 문구는 지금 그룹의 게시판 것만 보낸다 — 다른 그룹(예전 그룹)의 문구는 서버에 그대로 남지 않고
 * 지워지지만, 그 게시판은 이 화면에 없으니 고칠 길도 없다(관리자 화면과 같다).
 *
 * baseline(편집 창을 열 때의 값)을 주면 게시판은 바꾼 것만, 처음 값(orig_*)과 함께 보낸다 — 사이트 문구만 고쳐 저장했는데
 * 창을 연 사이 다른 곳에서 고친 게시판 제목 · 순서가 예전 값으로 돌아가지 않게.
 */
export function payloadFromForm(form: EditorForm, revision: number, baseline?: EditorForm): EditorPayload {
  const lines = form.customerCenterLines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, CUSTOMER_CENTER_LINES);
  return {
    revision,
    docs: {
      group: form.group.trim(),
      hints: Object.fromEntries(
        Object.entries(form.hints)
          .map(([table, hint]) => [table, hint.trim()] as const)
          .filter(([, hint]) => hint !== "")
      ),
    },
    sidebar: form.sidebar,
    // 앞뒤 공백은 서버도 걷는다 — 공백만 바꾼 것이 "저장하지 않은 변경"으로 잡히지 않게 여기서도 걷는다.
    site: {
      ...(Object.fromEntries(Object.entries(form.site).map(([key, value]) => [key, value.trim()])) as Record<SiteFieldKey, string>),
      customerCenterLines: lines,
    },
    boards: Object.fromEntries(
      Object.entries(form.boards).flatMap(([table, row]) => {
        const value = boardValue(row);
        const before = baseline?.boards[table];
        if (!baseline) return [[table, value]];
        if (!before) return [];
        const original = boardValue(before);
        if (value.order === original.order && value.subject === original.subject) return [];
        return [[table, { ...value, orig_order: original.order, orig_subject: original.subject }]];
      })
    ),
  };
}

/**
 * 게시판 일부만 저장하지 못했을 때 편집 창에 남길 값. 처음 값(baseline)과 비교해 사용자가 고친 칸만 유지한다.
 * 같은 게시판의 다른 칸을 게시판관리에서 고쳤다면 서버 값(serverForm)을 그대로 써서 재시도 때 되돌리지 않는다.
 */
export function formAfterPartialSave(
  serverForm: EditorForm,
  attempted: EditorForm,
  baseline: EditorForm,
  failed: readonly string[]
): EditorForm {
  const boards = { ...serverForm.boards };
  let kept = false;
  for (const table of failed) {
    const current = serverForm.boards[table];
    const entered = attempted.boards[table];
    const original = baseline.boards[table];
    if (!current || !entered || !original) continue;
    const wanted = boardValue(entered);
    const before = boardValue(original);
    const orderChanged = wanted.order !== before.order;
    const subjectChanged = wanted.subject !== before.subject;
    if (!orderChanged && !subjectChanged) continue;
    boards[table] = {
      order: orderChanged ? entered.order : current.order,
      subject: subjectChanged ? entered.subject : current.subject,
    };
    kept = true;
  }
  if (!kept) return serverForm;
  return {
    ...serverForm,
    boards,
  };
}

/** 저장할 것이 있는가 — 입력 칸을 저장 요청 모양으로 바꿔 비교한다(공백만 다른 것은 같은 값). */
export function isFormDirty(form: EditorForm, saved: EditorForm): boolean {
  return JSON.stringify(payloadFromForm(form, 0)) !== JSON.stringify(payloadFromForm(saved, 0));
}

/* ---------------------------------------------------------------- 장 순서 */

export type EditorChapter = { wr_id: number; wr_subject: string; part: string };

/** GET /v1/theme-settings/chapters/{표} 의 data. chapters 가 false 면 장이 너무 많다(max 초과). */
export type EditorChapters = {
  table: string;
  subject: string;
  chapters: EditorChapter[] | false;
  max: number;
  revision: number;
};

/**
 * 같은 부 안에서 한 칸 옮긴 새 목록 — 장의 부는 분류로 정해져 번호로 다른 부로 가지 않는다(서버도 부마다 나눠 준다).
 * 옮길 수 없으면(맨 끝 · 이웃이 다른 부) 받은 목록 그대로.
 */
export function moveChapter(list: readonly EditorChapter[], index: number, delta: -1 | 1): EditorChapter[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  if (list[index].part !== list[target].part) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** 옮길 수 있는가 — 단추를 끄는 데 쓴다. */
export function canMoveChapter(list: readonly EditorChapter[], index: number, delta: -1 | 1): boolean {
  const target = index + delta;
  return target >= 0 && target < list.length && list[index]?.part === list[target]?.part;
}

/** PUT 본문의 order — 보인 차례대로 1, 2, 3 … */
export function chapterOrderPayload(list: readonly EditorChapter[]): Record<string, number> {
  return Object.fromEntries(list.map((chapter, index) => [String(chapter.wr_id), index + 1]));
}

/** 부별로 묶어 보이기 — 부 이름과 그 부의 (목록 안 위치, 장). */
export function chapterParts(
  list: readonly EditorChapter[]
): Array<{ part: string; items: Array<{ index: number; chapter: EditorChapter }> }> {
  const parts: Array<{ part: string; items: Array<{ index: number; chapter: EditorChapter }> }> = [];
  list.forEach((chapter, index) => {
    const last = parts[parts.length - 1];
    if (last && last.part === chapter.part) last.items.push({ index, chapter });
    else parts.push({ part: chapter.part, items: [{ index, chapter }] });
  });
  return parts;
}
