"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { g5PhpUrlForRuntime } from "@/lib/config";
import type { G5ThemeConfig } from "@/lib/theme-types";
import { parseHandbookThemeSettings } from "../theme-settings";
import { useCanEditScreen } from "./edit-buttons";
import { loadEditorState, saveEditorState } from "./editor-api";
import { ChaptersPanel } from "./editor-chapters";
import {
  formAfterPartialSave,
  formFromState,
  isFormDirty,
  payloadFromForm,
  type EditorForm,
  type EditorState,
} from "./editor-model";
import { DocsPanel, SidebarPanel, SitePanel } from "./editor-panels";
import { useSettingsEditor, type EditorTab } from "./editor-store";

const TABS: ReadonlyArray<{ key: EditorTab; label: string }> = [
  { key: "site", label: "사이트 문구" },
  { key: "sidebar", label: "사이드바" },
  { key: "docs", label: "매뉴얼" },
  { key: "chapters", label: "장 순서" },
];

type Status = { kind: "idle" | "loading" | "saving" | "error"; text?: string };

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 409) {
    return "다른 곳에서 먼저 설정을 저장했습니다. 창을 닫았다가 다시 열어 주세요.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 저장한 뒤 알림 — 서버 실행(Vercel 등)은 다른 화면 · 새로고침에 설정 캐시(30초)만큼 늦게 보인다. */
function savedNotice(): string {
  return process.env.G5_NEXT_RUNTIME === "static"
    ? "화면 설정을 저장했습니다."
    : "화면 설정을 저장했습니다. 새로고침한 화면에는 30초 안에 반영됩니다.";
}

/**
 * 화면 설정 편집 창 — 최고관리자만. 관리자 › 환경설정 › 테마 화면 설정과 같은 값을 화면에서 고친다
 * (GET/PUT /v1/theme-settings). 저장하면 화면이 새로고침 없이 바로 바뀐다(editor-store live).
 * 장 순서는 탭 안에서 따로 저장한다. 저장하지 않은 변경이 있으면 닫기 전에 한 번 묻는다.
 */
export function SettingsEditor({ defaults }: { defaults: G5ThemeConfig["site"] }) {
  const canEdit = useCanEditScreen();
  const { open, tab, chapterTable, closeEditor, setTab, applySaved } = useSettingsEditor();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Partial<Record<EditorTab, HTMLButtonElement | null>>>({});
  const [session, setSession] = useState(0);
  const [state, setState] = useState<EditorState | null>(null);
  const [form, setForm] = useState<EditorForm | null>(null);
  const [savedForm, setSavedForm] = useState<EditorForm | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [chaptersDirty, setChaptersDirty] = useState(false);
  const [chaptersVisited, setChaptersVisited] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const formDirty = form !== null && savedForm !== null && isFormDirty(form, savedForm);
  const dirty = formDirty || chaptersDirty;

  useEffect(() => {
    if (tab === "chapters") setChaptersVisited(true);
  }, [tab]);

  // 열어 둔 채 로그인이 끊기면(토큰 만료 · 로그아웃) 닫는다 — 다음에 로그인했을 때 저절로 다시 열리지 않게.
  useEffect(() => {
    if (!canEdit && open) closeEditor();
  }, [canEdit, open, closeEditor]);

  // 열고 닫기 — <dialog> 의 showModal 이 포커스를 가두고 뒤 화면을 막는다. 닫으면 연 단추로 포커스를 돌려준다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      setSession((value) => value + 1);
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
    }
  }, [open, canEdit]);

  // 열 때마다 서버 값을 새로 읽는다(다른 곳에서 고쳤을 수 있다).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    // 지난번 값을 지운다 — 다시 읽기가 실패했을 때 예전 값으로 고치게 두지 않는다.
    setState(null);
    setForm(null);
    setSavedForm(null);
    setStatus({ kind: "loading" });
    setConfirmClose(false);
    setChaptersDirty(false);
    setChaptersVisited(tab === "chapters");
    loadEditorState()
      .then((data) => {
        if (!alive) return;
        const loaded = formFromState(data);
        setState(data);
        setForm(loaded);
        setSavedForm(loaded);
        setStatus({ kind: "idle" });
      })
      .catch((error: unknown) => alive && setStatus({ kind: "error", text: errorText(error, "설정을 읽지 못했습니다.") }));
    return () => {
      alive = false;
    };
    // tab 은 여는 순간의 값만 본다 — 탭을 바꿀 때마다 다시 읽지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else closeEditor();
  }, [dirty, closeEditor]);

  const update = useCallback((change: (current: EditorForm) => EditorForm) => {
    setForm((current) => (current ? change(current) : current));
    setConfirmClose(false);
  }, []);

  const onChaptersSaved = useCallback(
    (revision: number, publicSettings: unknown) => {
      setState((current) => (current ? { ...current, revision } : current));
      applySaved(parseHandbookThemeSettings(publicSettings));
    },
    [applySaved]
  );

  const onChapterRetryRevision = useCallback((revision: number) => {
    setState((current) => (current && revision === current.revision + 1 ? { ...current, revision } : current));
  }, []);

  async function save() {
    if (!form || !state) return;
    setStatus({ kind: "saving" });
    try {
      const baseline = savedForm ?? formFromState(state);
      // 게시판은 이 창에서 바꾼 것만 보낸다(savedForm 과 비교) — 그사이 다른 곳에서 고친 제목 · 순서를 되돌리지 않게.
      const result = await saveEditorState(payloadFromForm(form, state.revision, baseline));
      const saved = formFromState(result);
      setState(result);
      setSavedForm(saved);
      if (result.warning) {
        // 설정은 저장했지만 게시판 일부를 못 고쳤다 — 창을 닫지 않고 실제로 저장된 값 · 새 변경 번호로 채우되, 못 고친
        // 게시판에서 사용자가 고친 칸만 입력값으로 남긴다. 그사이 게시판관리에서 바뀐 다른 칸은 서버 값을 쓴다.
        setForm(formAfterPartialSave(saved, form, baseline, result.failed_boards ?? []));
        applySaved(parseHandbookThemeSettings(result.public));
        setStatus({ kind: "error", text: result.warning });
        return;
      }
      setForm(saved);
      setStatus({ kind: "idle" });
      applySaved(parseHandbookThemeSettings(result.public), savedNotice());
      if (!chaptersDirty) closeEditor();
    } catch (error) {
      setStatus({ kind: "error", text: errorText(error, "저장하지 못했습니다.") });
    }
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((item) => item.key === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length].key;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  if (!canEdit) return null;

  return (
    <dialog
      ref={dialogRef}
      className="doc-editor"
      aria-labelledby="doc-editor-title"
      onCancel={(event) => {
        // Escape — 저장하지 않은 변경이 있으면 바로 닫지 않고 묻는다.
        event.preventDefault();
        requestClose();
      }}
      onClose={() => {
        if (!useSettingsEditor.getState().open) return;
        // 브라우저가 cancel 없이 닫았을 때(Escape 를 연달아 누르면 Chrome 은 두 번째 cancel 을 건너뛴다) —
        // 저장하지 않은 변경이 있으면 다시 열고 묻는다.
        if (dirty) {
          dialogRef.current?.showModal();
          setConfirmClose(true);
          return;
        }
        closeEditor();
      }}
    >
      <div className="doc-editor-box">
        <header className="doc-editor-head">
          <h2 id="doc-editor-title">화면 설정</h2>
          <button type="button" className="doc-icon-btn" aria-label="화면 설정 닫기" onClick={requestClose}>
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="doc-editor-tabs" role="tablist" aria-label="설정 종류">
          {TABS.map((item) => (
            <button
              key={item.key}
              ref={(element) => {
                tabRefs.current[item.key] = element;
              }}
              type="button"
              role="tab"
              id={`doc-editor-tab-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls={`doc-editor-panel-${item.key}`}
              tabIndex={tab === item.key ? 0 : -1}
              className="doc-editor-tab"
              onClick={() => setTab(item.key)}
              onKeyDown={onTabKeyDown}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="doc-editor-body">
          {status.kind === "loading" ? <p className="doc-editor-help">설정을 읽는 중…</p> : null}
          {state && form ? (
            <>
              <div role="tabpanel" id="doc-editor-panel-site" aria-labelledby="doc-editor-tab-site" hidden={tab !== "site"}>
                <SitePanel form={form} update={update} defaults={defaults} />
              </div>
              <div role="tabpanel" id="doc-editor-panel-sidebar" aria-labelledby="doc-editor-tab-sidebar" hidden={tab !== "sidebar"}>
                <SidebarPanel form={form} update={update} />
              </div>
              <div role="tabpanel" id="doc-editor-panel-docs" aria-labelledby="doc-editor-tab-docs" hidden={tab !== "docs"}>
                <DocsPanel
                  form={form}
                  update={update}
                  groups={state.groups}
                  boards={state.boards}
                  savedGroup={state.settings.docs.group}
                />
              </div>
              <div role="tabpanel" id="doc-editor-panel-chapters" aria-labelledby="doc-editor-tab-chapters" hidden={tab !== "chapters"}>
                {chaptersVisited ? (
                  <ChaptersPanel
                    key={session}
                    boards={state.boards}
                    initialTable={chapterTable}
                    revision={state.revision}
                    onSaved={onChaptersSaved}
                    onRetryRevision={onChapterRetryRevision}
                    onDirtyChange={setChaptersDirty}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {status.kind === "error" ? (
          <p className="doc-editor-error" role="alert">
            {status.text}
          </p>
        ) : null}

        {confirmClose ? (
          <div className="doc-editor-confirm" role="alert">
            <span>저장하지 않은 변경이 있습니다. 버리고 닫을까요?</span>
            <button type="button" className="btn btn-sm" onClick={() => setConfirmClose(false)}>
              계속 고치기
            </button>
            <button type="button" className="btn btn-sm btn-error" onClick={closeEditor}>
              버리고 닫기
            </button>
          </div>
        ) : null}

        <footer className="doc-editor-foot">
          <a className="doc-editor-adminlink" href={g5PhpUrlForRuntime("/adm/view.php?call=theme_settings")}>
            관리자 화면에서 열기
          </a>
          <span className="doc-editor-spacer" />
          <button type="button" className="btn btn-sm" onClick={requestClose}>
            닫기
          </button>
          {tab !== "chapters" ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!formDirty || status.kind === "saving" || status.kind === "loading"}
              onClick={() => void save()}
            >
              {status.kind === "saving" ? "저장하는 중…" : "저장"}
            </button>
          ) : null}
        </footer>
      </div>
    </dialog>
  );
}
