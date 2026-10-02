import { apiUrl } from "@/lib/config";
import { requestShare } from "@/lib/request-share";
import { fetchApiData, fetchApiResult } from "@/lib/api-response";
import type { ApiResult } from "@/lib/api-response";
import {
  boardCategoryCountsSchema,
  boardListSchema,
  boardSchema,
  postDetailSchema,
  writePostListSchema,
} from "@/lib/schemas";
import type { Board, BoardCategoryCounts, Comment, PostFile, WritePost } from "@/lib/types";

export interface PostNavItem {
  wr_id: number;
  wr_subject: string;
  wr_seo_title?: string;
}

export interface PostDetail extends WritePost {
  files?: PostFile[];
  comments?: Comment[];
  prev_post?: PostNavItem | null;
  next_post?: PostNavItem | null;
}

export type PostDetailResult = ApiResult<PostDetail>;

export interface GetBoardsOptions {
  revalidate?: number;
  group?: string;
}

export function getBoards(options: number | GetBoardsOptions = 30): Promise<Board[]> {
  const revalidate = typeof options === "number" ? options : options.revalidate ?? 30;
  const group = typeof options === "number" ? "" : options.group?.trim() ?? "";
  const params = new URLSearchParams();
  if (group) params.set("group", group);

  const suffix = params.toString() ? `?${params.toString()}` : "";

  // 홈에서 두 번 나갔다 — 테마 홈의 갤러리 패널(themes/default/home-data.ts)과 본문
  // 묶음(lib/community-home.ts)이 각자 부른다. 게시판 목록은 사람마다 다르지 않다.
  // 빈 목록은 fetchApiData 의 실패 대체값일 수 있으므로 담아 두지 않는다.
  return requestShare.get(
    `boards${suffix}`,
    SHARED_BOARD_TTL_MS,
    () =>
      fetchApiData(apiUrl(`/boards${suffix}`), boardListSchema, [], {
        next: { revalidate },
      }),
    (list) => list.length === 0
  );
}

/** 게시판 정보는 글 보기와 그 아래 목록이 거의 동시에 부른다 — 브라우저에서 잠깐 나눠 쓴다. */
const SHARED_BOARD_TTL_MS = 30_000;

export function getBoard(boTable: string, revalidate = 30): Promise<Board | null> {
  return requestShare.get(
    `board:${boTable}`,
    SHARED_BOARD_TTL_MS,
    async () => {
      const result = await fetchApiResult(apiUrl(`/boards/${boTable}`), boardSchema, {
        next: { revalidate },
      });

      return result.ok ? result.data : null;
    },
    (board) => board === null
  );
}

/**
 * 분류별 글 수 — 목록의 분류 칩에만 쓴다. 게시판 정보(getBoard)와 떼어 둔 것은 글 테이블 전체를 세는
 * 일이라 글보기 · RSS 까지 함께 부르지 않게 하려는 것이다. 서버가 세지 않으면(끔 · 큰 게시판) counts 가 null.
 */
export function getBoardCategoryCounts(boTable: string): Promise<BoardCategoryCounts | null> {
  return requestShare.get(
    `board-category-counts:${boTable}`,
    SHARED_BOARD_TTL_MS,
    async () => {
      const result = await fetchApiResult(
        apiUrl(`/boards/${boTable}/category-counts`),
        boardCategoryCountsSchema,
        { next: { revalidate: 300 } }
      );
      return result.ok ? result.data : null;
    },
    (counts) => counts === null
  );
}

export async function getBoardPosts({
  boTable,
  page,
  perPage,
  sfl,
  stx,
  sca,
  withExcerpt = false,
  revalidate = 30,
}: {
  boTable: string;
  page?: number;
  perPage?: number;
  sfl?: string;
  stx?: string;
  sca?: string;
  /** 카드에 본문 발췌(wr_excerpt)를 보이는 목록(갤러리)만 켠다 — API ?with=excerpt. */
  withExcerpt?: boolean;
  revalidate?: number;
}): Promise<{ list: WritePost[]; total: number; totalPage: number; error?: string }> {
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (perPage) params.set("per_page", String(perPage));
  if (sfl) params.set("sfl", sfl);
  if (stx) params.set("stx", stx);
  if (sca) params.set("sca", sca);
  if (withExcerpt) params.set("with", "excerpt");

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const result = await fetchApiResult(
    apiUrl(`/boards/${boTable}/posts${suffix}`),
    writePostListSchema,
    { next: { revalidate } }
  );

  if (!result.ok) {
    return {
      list: [],
      total: 0,
      totalPage: 1,
      error: result.error,
    };
  }

  return {
    list: result.data,
    total: result.meta?.total ?? 0,
    totalPage: result.meta?.last_page ?? 1,
  };
}

export async function getPostDetailResult({
  boTable,
  wrId,
  token,
}: {
  boTable: string;
  wrId: string;
  token?: string;
}): Promise<PostDetailResult> {
  const result = await fetchApiResult(
    apiUrl(`/posts/${boTable}/${wrId}`),
    postDetailSchema,
    {
      ...(token ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  return result.ok ? { ...result, data: result.data as unknown as PostDetail } : result;
}

export async function getPostDetail({
  boTable,
  wrId,
  token,
}: {
  boTable: string;
  wrId: string;
  token?: string;
}): Promise<PostDetail | null> {
  const result = await getPostDetailResult({ boTable, wrId, token });

  return result.ok ? result.data : null;
}

export async function getPostDetailBySeoResult({
  boTable,
  slug,
}: {
  boTable: string;
  slug: string;
}): Promise<PostDetailResult> {
  const result = await fetchApiResult(
    apiUrl(`/posts/${boTable}/seo/${encodeURIComponent(slug)}`),
    postDetailSchema,
    { next: { revalidate: 30 } }
  );

  return result.ok ? { ...result, data: result.data as unknown as PostDetail } : result;
}

export async function getPostDetailBySeo({
  boTable,
  slug,
}: {
  boTable: string;
  slug: string;
}): Promise<PostDetail | null> {
  const result = await getPostDetailBySeoResult({ boTable, slug });

  return result.ok ? result.data : null;
}
