import { apiClient } from "@/lib/api";
import { apiUrl } from "@/lib/config";
import { fetchApiResult } from "@/lib/api-response";
import { pollSchema } from "@/lib/schemas";
import type { Poll } from "@/lib/types";

export interface PollCommentPayload {
  pc_name?: string;
  pc_idea: string;
}

function parsePoll(data: unknown): Poll {
  const parsed = pollSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("투표 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export function getCurrentPoll(revalidate = 30) {
  return fetchApiResult<Poll>(apiUrl("/polls/current"), pollSchema, {
    next: { revalidate },
  });
}

export function getPoll(poId: number, revalidate = 30) {
  return fetchApiResult<Poll>(apiUrl(`/polls/${poId}`), pollSchema, {
    next: { revalidate },
  });
}

export async function getPollClient(poId: number): Promise<Poll> {
  const response = await apiClient.get<unknown>(`/polls/${poId}`);
  return parsePoll(response.data);
}

export async function votePoll(poId: number, option: number): Promise<Poll> {
  const response = await apiClient.post<unknown>(`/polls/${poId}/vote`, {
    option,
  });
  return parsePoll(response.data);
}

export async function addPollComment(
  poId: number,
  payload: PollCommentPayload
): Promise<Poll> {
  const response = await apiClient.post<unknown>(`/polls/${poId}/comments`, payload);
  return parsePoll(response.data);
}

export async function deletePollComment(poId: number, pcId: number): Promise<Poll> {
  const response = await apiClient.delete<unknown>(`/polls/${poId}/comments/${pcId}`);
  return parsePoll(response.data);
}
