import { apiClient } from "@/lib/api";

export interface PostRevisionSummary {
  rev_id: number;
  rev_no: number;
  event: "baseline" | "created" | "updated" | "unknown_change" | string;
  source: "web" | "api" | "import" | "system" | string;
  actor_mb_id: string;
  actor_name: string;
  actor_role: "super" | "group" | "board" | "member" | "system" | string;
  note: string;
  content_hash: string;
  created_at: string;
}

export interface PostRevision extends PostRevisionSummary {
  wr_subject: string;
  wr_seo_title: string;
  ca_name: string;
  wr_option: string;
  wr_link1: string;
  wr_link2: string;
  wr_content: string;
}

export interface PostRevisionPage {
  revisions: PostRevisionSummary[];
  next_before: number | null;
  has_more: boolean;
}

function revisionsPath(boTable: string, wrId: string | number) {
  return `/posts/${encodeURIComponent(boTable)}/${encodeURIComponent(String(wrId))}/revisions`;
}

export async function getPostRevisionPage(
  boTable: string,
  wrId: string | number,
  before?: number | null
): Promise<PostRevisionPage> {
  const response = await apiClient.get<PostRevisionPage>(revisionsPath(boTable, wrId), {
    params: { limit: 20, before: before ?? undefined },
  });
  if (!response.data) throw new Error("게시글 이력을 불러오지 못했습니다.");
  return response.data;
}

export async function getPostRevision(
  boTable: string,
  wrId: string | number,
  revisionId: number
): Promise<PostRevision> {
  const response = await apiClient.get<PostRevision>(`${revisionsPath(boTable, wrId)}/${revisionId}`);
  if (!response.data || typeof response.data.wr_content !== "string") {
    throw new Error("선택한 버전을 불러오지 못했습니다.");
  }
  return response.data;
}

export async function comparePostRevisions(
  boTable: string,
  wrId: string | number,
  fromId: number,
  toId: number
): Promise<{ from: PostRevision; to: PostRevision }> {
  const response = await apiClient.get<{ from: PostRevision; to: PostRevision }>(
    `${revisionsPath(boTable, wrId)}/compare`,
    { params: { from: fromId, to: toId } }
  );
  if (!response.data?.from || !response.data?.to) {
    throw new Error("선택한 버전을 비교하지 못했습니다.");
  }
  return response.data;
}
