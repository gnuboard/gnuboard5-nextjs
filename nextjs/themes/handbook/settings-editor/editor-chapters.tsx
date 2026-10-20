"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ApiError } from "@/lib/api";
import { loadEditorChapters, saveEditorChapters } from "./editor-api";
import {
  canMoveChapter,
  chapterOrderPayload,
  chapterParts,
  moveChapter,
  type EditorBoard,
  type EditorChapter,
} from "./editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 장 순서 탭 — 매뉴얼을 고르면 그 매뉴얼의 장이 목차 차례로 나온다. 같은 부 안에서만 위아래로 옮긴다(부는 게시판 분류).
 * 저장은 설정 저장과 따로 한다(PUT /v1/theme-settings/chapters/{표}). 저장하면 변경 번호가 올라 화면이 목차를 다시 받는다.
 */
export function ChaptersPanel({
  boards,
  initialTable,
  revision,
  onSaved,
  onRetryRevision,
  onDirtyChange,
}: {
  boards: EditorBoard[];
  initialTable: string | null;
  revision: number;
  onSaved: (revision: number, publicSettings: unknown) => void;
  onRetryRevision: (revision: number) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const firstTable = boards.find((board) => board.bo_table === initialTable)?.bo_table ?? boards[0]?.bo_table ?? "";
  const [picked, setTable] = useState(firstTable);
  // 매뉴얼 탭에서 그룹을 바꿔 저장하면 게시판 목록이 바뀐다 — 고른 매뉴얼이 목록에 없으면 첫 매뉴얼로.
  const table = boards.some((board) => board.bo_table === picked) ? picked : (boards[0]?.bo_table ?? "");
  const [saved, setSaved] = useState<EditorChapter[] | null>(null);
  const [list, setList] = useState<EditorChapter[]>([]);
  const [tooMany, setTooMany] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: "loading" | "saving" | "error" | "done" | "idle"; text?: string }>({ kind: "idle" });
  const dirty = saved !== null && JSON.stringify(list) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!table) return;
    let alive = true;
    setStatus({ kind: "loading" });
    loadEditorChapters(table)
      .then((data) => {
        if (!alive) return;
        if (data.chapters === false) {
          setTooMany(data.max);
          setSaved([]);
          setList([]);
        } else {
          setTooMany(null);
          setSaved(data.chapters);
          setList(data.chapters);
        }
        setStatus({ kind: "idle" });
      })
      .catch((error: unknown) => alive && setStatus({ kind: "error", text: errorText(error, "장 목록을 읽지 못했습니다.") }));
    return () => {
      alive = false;
    };
  }, [table]);

  if (boards.length === 0) {
    return <p className="doc-editor-help">매뉴얼 그룹에 게시판이 없습니다. 「매뉴얼」 탭에서 그룹을 먼저 정해 주세요.</p>;
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const result = await saveEditorChapters(table, chapterOrderPayload(list), revision);
      const chapters = result.chapters === false ? [] : result.chapters;
      setSaved(chapters);
      setList(chapters);
      setStatus({ kind: "done", text: "장 순서를 저장했습니다." });
      onSaved(result.revision, result.public);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setStatus({ kind: "error", text: "다른 곳에서 먼저 설정을 저장했습니다. 창을 닫았다가 다시 열어 주세요." });
        return;
      }
      // 422 응답의 번호는 이 요청이 올린 번호다. 임의로 최신 번호를 읽으면 다른 관리자의 저장까지 통과시킬 수 있다.
      const retryRevision = error instanceof ApiError && error.status === 422 && error.code === "CHAPTER_SAVE_FAILED"
        ? Number(error.rawErrors?.revision)
        : NaN;
      if (Number.isSafeInteger(retryRevision) && retryRevision === revision + 1) {
        onRetryRevision(retryRevision);
        setStatus({ kind: "error", text: `${errorText(error, "장 순서를 저장하지 못했습니다.")} 다시 저장해 보세요.` });
        return;
      }
      setStatus({ kind: "error", text: `${errorText(error, "장 순서를 저장하지 못했습니다.")} 창을 닫았다가 다시 열어 주세요.` });
    }
  }

  return (
    <div className="doc-editor-fields">
      <div className="doc-editor-field">
        <label htmlFor="doc-editor-chapter-book">매뉴얼</label>
        <select
          id="doc-editor-chapter-book"
          className="select select-bordered w-full"
          value={table}
          disabled={dirty || status.kind === "saving"}
          onChange={(event) => setTable(event.target.value)}
        >
          {boards.map((board) => (
            <option key={board.bo_table} value={board.bo_table}>
              {board.bo_subject}
            </option>
          ))}
        </select>
        {dirty ? <span className="doc-editor-where">저장하거나 되돌린 뒤 다른 매뉴얼을 고를 수 있습니다.</span> : null}
      </div>
      <p className="doc-editor-help">같은 부 안에서 ↑ ↓ 로 옮깁니다. 부의 순서는 게시판 분류 순서를 따릅니다. 답글 · 댓글은 원글을 따라갑니다.</p>

      {status.kind === "loading" ? <p className="doc-editor-help">장 목록을 읽는 중…</p> : null}
      {tooMany !== null ? <p className="doc-editor-note">장이 너무 많아({tooMany}개 초과) 여기서 순서를 정할 수 없습니다.</p> : null}

      {status.kind !== "loading" && tooMany === null ? (
        <ol className="doc-editor-chapters" aria-label="장 순서">
          {chapterParts(list).map((part) => (
            <li key={`${part.part}:${part.items[0]?.index ?? 0}`} className="doc-editor-part">
              <span className="doc-editor-part-name">{part.part}</span>
              <ol>
                {part.items.map(({ index, chapter }) => (
                  <li key={chapter.wr_id} className="doc-editor-chapter">
                    <span className="doc-editor-chapter-no" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="doc-editor-chapter-title">{chapter.wr_subject}</span>
                    <button
                      type="button"
                      className="doc-icon-btn doc-editor-move"
                      aria-label={`${chapter.wr_subject} 위로`}
                      disabled={!canMoveChapter(list, index, -1) || status.kind === "saving"}
                      onClick={() => setList((current) => moveChapter(current, index, -1))}
                    >
                      <ArrowUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="doc-icon-btn doc-editor-move"
                      aria-label={`${chapter.wr_subject} 아래로`}
                      disabled={!canMoveChapter(list, index, 1) || status.kind === "saving"}
                      onClick={() => setList((current) => moveChapter(current, index, 1))}
                    >
                      <ArrowDown size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : null}

      {status.kind === "error" || status.kind === "done" ? (
        <p className={status.kind === "error" ? "doc-editor-error" : "doc-editor-done"} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      ) : null}

      <div className="doc-editor-inline-actions">
        <button type="button" className="btn btn-sm" disabled={!dirty || status.kind === "saving"} onClick={() => saved && setList(saved)}>
          되돌리기
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!dirty || status.kind === "saving"} onClick={() => void save()}>
          {status.kind === "saving" ? "저장하는 중…" : "장 순서 저장"}
        </button>
      </div>
    </div>
  );
}
