"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import type { G5ThemeConfig } from "@/lib/theme-types";
import { useSettingsEditor, type EditorTab } from "./editor-store";

/**
 * 편집 창 코드(입력 칸 · 장 순서 · API)는 최고관리자일 때만 받는다 — 손님 화면의 첫 묶음에 넣지 않는다.
 * 연필을 눌러 열기(open)가 먼저 와도, 창이 붙으면 그 값을 보고 연다.
 */
const SettingsEditor = dynamic(() => import("./settings-editor").then((module) => module.SettingsEditor), { ssr: false });

export function SettingsEditorLoader({ defaults }: { defaults: G5ThemeConfig["site"] }) {
  const canEdit = useCanEditScreen();
  return canEdit ? <SettingsEditor defaults={defaults} /> : null;
}

/** 저장한 뒤 잠깐 보이는 알림(화면 아래). 화면 읽기 프로그램에도 읽힌다. */
export function SettingsEditorNotice() {
  const notice = useSettingsEditor((state) => state.notice);
  const clearNotice = useSettingsEditor((state) => state.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 4000);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);
  return (
    <div className="doc-editor-notice" role="status" aria-live="polite">
      {notice}
    </div>
  );
}

/**
 * 최고관리자에게만 보이는 화면 편집 단추. 로그인 상태가 정해지기 전(서버 HTML · 하이드레이션)에는 그리지 않는다 —
 * 정적 빌드 HTML 은 손님 화면이라 누구에게나 같고, 하이드레이션과 어긋나지 않는다.
 */
export function useCanEditScreen(): boolean {
  return useAuthStore((state) => state.isInitialized && state.user?.is_super_admin === true);
}

/** 위쪽 바의 "화면 설정" 단추 — 편집 창을 사이트 문구 탭으로 연다. */
export function SettingsEditorButton() {
  const canEdit = useCanEditScreen();
  const openEditor = useSettingsEditor((state) => state.openEditor);
  if (!canEdit) return null;
  return (
    <button
      type="button"
      className="doc-icon-btn doc-edit-topbar"
      onClick={() => openEditor("site")}
      aria-label="화면 설정 열기"
      aria-haspopup="dialog"
      title="화면 설정"
    >
      <SlidersHorizontal size={16} aria-hidden />
      <span className="doc-edit-topbar-text">화면 설정</span>
    </button>
  );
}

/** 사이드바 아래의 글자 단추(연필 + 이름) — 좁은 칸에서도 무엇을 고치는지 바로 읽힌다. 최고관리자가 아니면 아무것도 그리지 않는다. */
export function EditLinks({ items }: { items: ReadonlyArray<{ tab: EditorTab; label: string; chapterTable?: string | null }> }) {
  const canEdit = useCanEditScreen();
  const openEditor = useSettingsEditor((state) => state.openEditor);
  if (!canEdit || items.length === 0) return null;
  return (
    <div className="doc-edit-links" aria-label="화면 설정">
      {items.map((item) => (
        <button
          key={`${item.tab}:${item.label}`}
          type="button"
          className="doc-edit-link"
          aria-haspopup="dialog"
          onClick={() => openEditor(item.tab, item.chapterTable ?? null)}
        >
          <Pencil size={13} aria-hidden />
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 고칠 수 있는 영역 옆의 작은 연필 — 누르면 그 영역의 탭으로 편집 창을 연다.
 * label 은 화면 읽기 프로그램이 읽는 이름("첫 화면 문구 수정" 처럼 무엇을 고치는지).
 */
export function EditPencil({
  tab,
  label,
  chapterTable = null,
  className = "",
}: {
  tab: EditorTab;
  label: string;
  chapterTable?: string | null;
  className?: string;
}) {
  const canEdit = useCanEditScreen();
  const openEditor = useSettingsEditor((state) => state.openEditor);
  if (!canEdit) return null;
  return (
    <button
      type="button"
      className={`doc-edit-pencil ${className}`.trim()}
      onClick={(event) => {
        // 링크(로고) · 접기 단추 안에 놓여도 그쪽 동작을 하지 않게.
        event.preventDefault();
        event.stopPropagation();
        openEditor(tab, chapterTable);
      }}
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
    >
      <Pencil size={13} aria-hidden />
    </button>
  );
}
