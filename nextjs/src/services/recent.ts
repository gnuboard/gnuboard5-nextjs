import { apiUrl } from "@/lib/config";
import { fetchApiData, fetchApiResult } from "@/lib/api-response";
import { recentGroupListSchema, recentItemListSchema } from "@/lib/schemas";
import type { RecentGroup, RecentItem } from "@/lib/types";

export interface RecentQuery {
  view?: "" | "w" | "c";
  grId?: string;
  mbId?: string;
  /** 작성자 공개 키(사이드뷰 "전체게시물" — 주소에 아이디를 남기지 않는다). */
  mbKey?: string;
  /** "latest": 새글 표에 맞는 줄이 없으면 게시판 글 표에서 채운다(홈 위젯 — 원본 latest() 처럼). 새글 화면은 쓰지 않는다. */
  fallback?: "latest";
  page?: number;
  limit?: number;
}

export interface RecentResult {
  items: RecentItem[];
  total: number;
  page: number;
  lastPage: number;
  error?: string;
}

function recentParams(query: RecentQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.view) params.set("view", query.view);
  if (query.grId) params.set("gr_id", query.grId);
  if (query.mbId) params.set("mb_id", query.mbId);
  else if (query.mbKey) params.set("mb_key", query.mbKey);
  if (query.fallback) params.set("fallback", query.fallback);
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 20));
  return params;
}

export async function getRecentItems(query: RecentQuery): Promise<RecentResult> {
  const result = await fetchApiResult(
    apiUrl(`/recent?${recentParams(query).toString()}`),
    recentItemListSchema,
    { cache: "no-store" }
  );

  if (!result.ok) {
    return {
      items: [],
      total: 0,
      page: query.page ?? 1,
      lastPage: 1,
      error: result.error,
    };
  }

  return {
    items: result.data,
    total: result.meta?.total ?? 0,
    page: result.meta?.current_page ?? query.page ?? 1,
    lastPage: result.meta?.last_page ?? 1,
  };
}

export function getRecentGroups(): Promise<RecentGroup[]> {
  return fetchApiData(apiUrl("/recent/groups"), recentGroupListSchema, [], {
    next: { revalidate: 300 },
  });
}
