import { create } from "zustand";
import type { HandbookThemeSettings } from "../theme-settings";

/** 편집 창의 탭 — 사이트 문구 · 사이드바 · 매뉴얼 목록 · 장 순서. */
export type EditorTab = "site" | "sidebar" | "docs" | "chapters";

type SettingsEditorState = {
  open: boolean;
  tab: EditorTab;
  /** 장 순서 탭에서 먼저 고를 매뉴얼(게시판). 없으면 첫 매뉴얼. */
  chapterTable: string | null;
  /**
   * 방금 저장한 설정 — 화면이 런타임 설정 · 서버 값보다 먼저 쓴다(새로고침 없이 바로 바뀌게).
   * 브라우저에서 저장한 뒤에만 생기므로 하이드레이션과 어긋나지 않는다.
   */
  live: HandbookThemeSettings | null;
  /** 잠깐 보이는 알림(저장했습니다 …). */
  notice: string | null;
  openEditor: (tab?: EditorTab, chapterTable?: string | null) => void;
  closeEditor: () => void;
  setTab: (tab: EditorTab) => void;
  applySaved: (settings: HandbookThemeSettings | null, notice?: string) => void;
  clearNotice: () => void;
};

export const useSettingsEditor = create<SettingsEditorState>((set) => ({
  open: false,
  tab: "site",
  chapterTable: null,
  live: null,
  notice: null,
  openEditor: (tab = "site", chapterTable = null) => set({ open: true, tab, chapterTable }),
  closeEditor: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
  applySaved: (settings, notice) => set((state) => ({ live: settings ?? state.live, notice: notice ?? null })),
  clearNotice: () => set({ notice: null }),
}));
