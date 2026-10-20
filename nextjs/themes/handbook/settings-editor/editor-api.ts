import { api } from "@/lib/api";
import type { EditorChapters, EditorPayload, EditorState } from "./editor-model";

/**
 * 화면 편집 창 ↔ GET/PUT /v1/theme-settings(최고관리자만, api/v1/theme-settings.php). 실패하면 ApiError 를 던진다 —
 * 다른 곳에서 먼저 저장했으면 status 409 · code REVISION_CONFLICT.
 */
function required<T>(data: T | undefined): T {
  if (data === undefined || data === null) throw new Error("빈 응답을 받았습니다.");
  return data;
}

export async function loadEditorState(): Promise<EditorState> {
  return required((await api.get<EditorState>("/theme-settings")).data);
}

/**
 * 저장 — 응답의 public 은 /v1/settings 의 theme_settings 와 같은 모양(화면에 바로 쓴다). warning 이 있으면 설정은 저장했지만
 * 게시판 일부를 못 고친 것(응답의 값 · 변경 번호는 실제로 저장된 것).
 */
export type SavedEditorState = EditorState & { public: unknown; warning?: string; failed_boards?: string[] };

export async function saveEditorState(payload: EditorPayload): Promise<SavedEditorState> {
  return required((await api.put<SavedEditorState>("/theme-settings", payload)).data);
}

export async function loadEditorChapters(table: string): Promise<EditorChapters> {
  return required((await api.get<EditorChapters>(`/theme-settings/chapters/${encodeURIComponent(table)}`)).data);
}

export async function saveEditorChapters(
  table: string,
  order: Record<string, number>,
  revision: number
): Promise<EditorChapters & { public: unknown }> {
  return required(
    (
      await api.put<EditorChapters & { public: unknown }>(`/theme-settings/chapters/${encodeURIComponent(table)}`, {
        order,
        revision,
      })
    ).data
  );
}
