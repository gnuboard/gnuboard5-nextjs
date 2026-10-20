"use client";

import type { G5ThemeConfig } from "@/lib/theme-types";
import { DOCS_GROUP } from "../docs-nav";
import {
  BOARD_SUBJECT_MAX,
  CUSTOMER_CENTER_LINE_MAX,
  CUSTOMER_CENTER_LINES,
  HINT_MAX,
  SIDEBAR_SCREENS,
  SITE_FIELDS,
  type EditorBoard,
  type EditorForm,
  type EditorGroup,
  type SiteFieldKey,
} from "./editor-model";

type Update = (change: (form: EditorForm) => EditorForm) => void;

/** 비운 칸에 보일 테마 기본 문구 — 첫 화면 제목 · 소개는 비면 사이트 이름 · 소개를 쓴다(theme-settings.ts handbookHomeTexts). */
function placeholderFor(key: SiteFieldKey, defaults: G5ThemeConfig["site"], form: EditorForm): string {
  if (key === "homeTitle") return form.site.name || defaults.homeTitle || defaults.name;
  if (key === "homeDescription") return form.site.description || defaults.homeDescription || defaults.description;
  const value = defaults[key];
  return typeof value === "string" ? value : "";
}

export function SitePanel({ form, update, defaults }: { form: EditorForm; update: Update; defaults: G5ThemeConfig["site"] }) {
  return (
    <div className="doc-editor-fields">
      <p className="doc-editor-help">비워 둔 칸은 흐린 글씨의 테마 기본 문구가 나옵니다.</p>
      {SITE_FIELDS.map((field) => {
        const id = `doc-editor-site-${field.key}`;
        const common = {
          id,
          value: form.site[field.key],
          maxLength: field.max,
          placeholder: placeholderFor(field.key, defaults, form),
          onChange: (event: { target: { value: string } }) => {
            const value = event.target.value;
            update((current) => ({ ...current, site: { ...current.site, [field.key]: value } }));
          },
        };
        return (
          <div key={field.key} className="doc-editor-field">
            <label htmlFor={id}>
              {field.label} <span className="doc-editor-where">{field.where}</span>
            </label>
            {"multiline" in field && field.multiline ? (
              <textarea {...common} rows={2} className="textarea textarea-bordered w-full" />
            ) : (
              <input {...common} type="text" className="input input-bordered w-full" />
            )}
          </div>
        );
      })}
      <div className="doc-editor-field">
        <label htmlFor="doc-editor-site-lines">
          고객센터 안내 <span className="doc-editor-where">한 줄에 하나, {CUSTOMER_CENTER_LINES}줄까지</span>
        </label>
        <textarea
          id="doc-editor-site-lines"
          rows={4}
          className="textarea textarea-bordered w-full"
          value={form.customerCenterLines}
          maxLength={(CUSTOMER_CENTER_LINE_MAX + 1) * CUSTOMER_CENTER_LINES}
          placeholder={defaults.customerCenterLines.join("\n")}
          onChange={(event) => {
            const value = event.target.value;
            update((current) => ({ ...current, customerCenterLines: value }));
          }}
        />
      </div>
    </div>
  );
}

export function SidebarPanel({ form, update }: { form: EditorForm; update: Update }) {
  return (
    <div className="doc-editor-fields">
      <p className="doc-editor-help">
        숨기면 넓은 화면(가로 1280px 이상)에서 왼쪽 칸이 사라지고 본문이 넓어집니다. 휴대폰처럼 좁은 화면은 늘 ☰ 메뉴로 엽니다.
      </p>
      {SIDEBAR_SCREENS.map((screen) => (
        <fieldset key={screen.key} className="doc-editor-row">
          <legend>
            {screen.label} <span className="doc-editor-where">{screen.detail}</span>
          </legend>
          <div className="join" role="radiogroup" aria-label={`${screen.label} 사이드바`}>
            {(["auto", "hidden"] as const).map((mode) => (
              <label key={mode} className={`btn btn-sm join-item ${form.sidebar[screen.key] === mode ? "btn-primary" : ""}`}>
                <input
                  type="radio"
                  className="sr-only"
                  name={`doc-editor-sidebar-${screen.key}`}
                  value={mode}
                  checked={form.sidebar[screen.key] === mode}
                  onChange={() => update((current) => ({ ...current, sidebar: { ...current.sidebar, [screen.key]: mode } }))}
                />
                {mode === "auto" ? "보이기" : "숨기기"}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function DocsPanel({
  form,
  update,
  groups,
  boards,
  savedGroup,
}: {
  form: EditorForm;
  update: Update;
  groups: EditorGroup[];
  boards: EditorBoard[];
  savedGroup: string;
}) {
  const groupChanged = form.group !== savedGroup;
  return (
    <div className="doc-editor-fields">
      <div className="doc-editor-field">
        <label htmlFor="doc-editor-group">
          매뉴얼 게시판 그룹 <span className="doc-editor-where">이 그룹의 게시판 하나가 매뉴얼 한 권</span>
        </label>
        <select
          id="doc-editor-group"
          className="select select-bordered w-full"
          value={form.group}
          onChange={(event) => {
            const value = event.target.value;
            update((current) => ({ ...current, group: value }));
          }}
        >
          {/* 비우면 빌드 때 정한 그룹(NEXT_PUBLIC_DOCS_GROUP)을 쓴다 — 없는 빌드(배포 zip)는 매뉴얼이 없다(docs-nav.ts docsSourceFrom). */}
          <option value="">{DOCS_GROUP ? `정하지 않음 (빌드 때 정한 그룹: ${DOCS_GROUP})` : "정하지 않음 (매뉴얼 없음)"}</option>
          {groups.map((group) => (
            <option key={group.gr_id} value={group.gr_id}>
              {group.gr_subject} ({group.gr_id})
            </option>
          ))}
        </select>
      </div>
      {groupChanged ? (
        <p className="doc-editor-note" role="status">
          그룹을 바꾸면 저장한 뒤 새 그룹의 매뉴얼 목록이 나옵니다. 아래 목록은 저장 전 그룹의 것이라 이번 저장에서는 고치지 않습니다.
        </p>
      ) : null}
      {boards.length === 0 ? (
        <p className="doc-editor-help">이 그룹에 게시판이 없습니다. 게시판관리에서 게시판을 만들고 이 그룹에 넣어 주세요.</p>
      ) : (
        <div className="doc-editor-table-wrap">
          <table className="doc-editor-table">
            <caption className="sr-only">매뉴얼 목록</caption>
            <thead>
              <tr>
                <th scope="col">순서</th>
                <th scope="col">매뉴얼 이름</th>
                <th scope="col">안내 문구</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((board) => {
                const row = form.boards[board.bo_table] ?? { order: String(board.bo_order), subject: board.bo_subject };
                const setRow = (patch: Partial<{ order: string; subject: string }>) =>
                  update((current) => ({
                    ...current,
                    boards: { ...current.boards, [board.bo_table]: { ...row, ...current.boards[board.bo_table], ...patch } },
                  }));
                return (
                  <tr key={board.bo_table}>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        className="input input-bordered input-sm w-16"
                        aria-label={`${board.bo_subject} 순서`}
                        value={row.order}
                        disabled={groupChanged}
                        onChange={(event) => setRow({ order: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full"
                        aria-label={`${board.bo_table} 매뉴얼 이름`}
                        maxLength={BOARD_SUBJECT_MAX}
                        value={row.subject}
                        disabled={groupChanged}
                        onChange={(event) => setRow({ subject: event.target.value })}
                      />
                      <span className="doc-editor-where">
                        {board.bo_table} · 글 {board.bo_count_write}
                      </span>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full"
                        aria-label={`${board.bo_subject} 안내 문구`}
                        maxLength={HINT_MAX}
                        placeholder="예: 1권"
                        value={form.hints[board.bo_table] ?? ""}
                        disabled={groupChanged}
                        onChange={(event) => {
                          const value = event.target.value;
                          update((current) => ({ ...current, hints: { ...current.hints, [board.bo_table]: value } }));
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="doc-editor-help">
            순서는 작은 숫자가 앞입니다. 이름은 게시판 제목이라 게시판관리에도 같이 바뀝니다. 안내 문구를 비우면 제목의 「1권 · 시작하기」
            앞쪽을 씁니다.
          </p>
        </div>
      )}
    </div>
  );
}
