import { apiClient } from "@/lib/api";
import type { ApiMeta } from "@/lib/api-response";
import { validateApiData } from "@/lib/api-response";
import { memoListSchema, memoSchema } from "@/lib/schemas";
import type { Memo } from "@/lib/types";

export type MemoBoxType = "recv" | "send";

export interface MemoListResult {
  items: Memo[];
  meta?: ApiMeta;
}

export interface SendMemoPayload {
  me_recv_mb_id: string;
  me_memo: string;
}

export async function getMemos(
  type: MemoBoxType = "recv",
  page = 1,
  limit = 20
): Promise<MemoListResult> {
  const response = await apiClient.get<unknown>("/memos", {
    params: { type, page, limit },
  });

  return {
    items: validateApiData(response.data, memoListSchema, []),
    meta: response.meta,
  };
}

export async function getMemo(memoId: number): Promise<Memo | null> {
  const response = await apiClient.get<unknown>(`/memos/${memoId}`);
  const parsed = memoSchema.safeParse(response.data);
  return parsed.success ? parsed.data : null;
}

export function sendMemo(payload: SendMemoPayload) {
  return apiClient.post("/memos", payload);
}

export function deleteMemo(memoId: number) {
  return apiClient.delete(`/memos/${memoId}`);
}
