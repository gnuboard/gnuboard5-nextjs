// @g5-static-fallback
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSeoIndexableBoard, serverSeoSettings } from "@/lib/seo-config";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { boardPostPath } from "@/lib/board-url";
import { buildPageMetadata, plainTextSummary } from "@/lib/seo";
import { usesServerRuntime } from "@/lib/next-runtime";
import { getPublicSettings } from "@/services/settings";
import {
  getBoard,
  getBoards,
  getBoardPosts,
  getPostDetailResult,
  getPostDetailBySeoResult,
  type PostDetail,
} from "@/services/boards";
import PostViewClient from "./ClientPage";

export const dynamicParams = true;
export const dynamic = "force-static";

function positiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function staticSegment(value: string | null | undefined): string {
  const segment = String(value || "").trim();
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    return "";
  }
  return segment;
}

export async function generateStaticParams() {
  const params = [{ bo_table: "__g5_static__", wr_id: "0" }];
  const seen = new Set(params.map((item) => `${item.bo_table}:${item.wr_id}`));
  const perPage = positiveIntEnv("G5_STATIC_POST_PARAM_LIMIT", 200);
  const boardLimit = positiveIntEnv("G5_STATIC_POST_BOARD_LIMIT", 20);
  const totalLimit = positiveIntEnv("G5_STATIC_POST_TOTAL_LIMIT", 1000);

  try {
    const boards = (await getBoards(300)).slice(0, boardLimit);
    const postLists = await Promise.all(
      boards.map((board) =>
        getBoardPosts({
          boTable: board.bo_table,
          page: 1,
          perPage,
          revalidate: 300,
        }).catch(() => ({ list: [], total: 0, totalPage: 1 }))
      )
    );

    for (const [index, board] of boards.entries()) {
      for (const post of postLists[index]?.list || []) {
        if (params.length > totalLimit) break;
        if (post.is_secret) continue;

        for (const wrId of [
          staticSegment(String(post.wr_id || "")),
          staticSegment(post.wr_seo_title),
        ]) {
          if (!wrId) continue;
          const key = `${board.bo_table}:${wrId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          params.push({ bo_table: board.bo_table, wr_id: wrId });
        }
      }
      if (params.length > totalLimit) break;
    }
  } catch {
    // Keep the placeholder route for static installs when the API is unavailable at build time.
  }

  return params;
}

interface PageProps {
  params: Promise<{ bo_table: string; wr_id: string }>;
}

interface PostLookup {
  post: PostDetail | null;
  /** API 가 "없는 글"(404)이라고 답했다 — 권한·네트워크 문제는 여기에 넣지 않는다. */
  missing: boolean;
}

async function lookupPostForPage(boTable: string, wrId: string): Promise<PostLookup> {
  if (boTable === "__g5_static__" || wrId === "0") return { post: null, missing: false };

  const result = await (/^[0-9]+$/.test(wrId)
    ? getPostDetailResult({ boTable, wrId })
    : getPostDetailBySeoResult({ boTable, slug: wrId })
  ).catch(() => null);

  if (result?.ok) return { post: result.data, missing: false };
  return { post: null, missing: result?.status === 404 };
}

/**
 * 서버 실행(Vercel)에서는 없는 글을 404 로 응답한다. 이 페이지 위에 loading.tsx(Suspense)가 있으면
 * 응답이 먼저 200 으로 흘러 나가 404 를 못 붙이므로, 상세 페이지 위에는 loading.tsx 를 두지 않는다.
 * 정적 빌드는 셸 하나를 모든 글이 나눠 쓰므로 여기서 404 를 내지 않고 테마 브리지가 판단한다.
 */
function notFoundOnServerRuntime(lookup: PostLookup): void {
  if (lookup.missing && usesServerRuntime()) notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bo_table, wr_id } = await params;
  const isStaticFallbackShell = bo_table === "__g5_static__" || wr_id === "0";
  const [lookup, board, settings] = await Promise.all([
    lookupPostForPage(bo_table, wr_id),
    bo_table === "__g5_static__" ? Promise.resolve(null) : getBoard(bo_table, 3600).catch(() => null),
    getPublicSettings(3600).catch(() => null),
  ]);
  notFoundOnServerRuntime(lookup);
  const post = lookup.post;
  const postPath = post
    ? boardPostPath(bo_table, post, settings?.cf_bbs_rewrite)
    : isStaticFallbackShell
      ? "/boards"
      : `/boards/${bo_table}/${wr_id}`;

  return buildPageMetadata({
    title: post?.wr_subject || (isStaticFallbackShell ? "게시글" : `${bo_table} #${wr_id}`),
    description: post ? plainTextSummary(post.wr_content, post.wr_subject) : board?.bo_subject,
    path: postPath,
    image: post?.thumbnail,
    type: post ? "article" : "website",
    noindex: isStaticFallbackShell || !post || !isSeoIndexableBoard(serverSeoSettings(), bo_table),
  });
}

export default async function PostViewPage({ params }: PageProps) {
  const { bo_table, wr_id } = await params;
  const [lookup, board, settings] = await Promise.all([
    lookupPostForPage(bo_table, wr_id),
    bo_table === "__g5_static__" ? Promise.resolve(null) : getBoard(bo_table, 3600).catch(() => null),
    getPublicSettings(3600).catch(() => null),
  ]);
  notFoundOnServerRuntime(lookup);
  const initialPost = lookup.post;
  const bbsRewriteMode = Number(settings?.cf_bbs_rewrite ?? 0);
  const boardName = board?.bo_subject ?? initialPost?.bo_subject ?? "";
  const postPath = initialPost
    ? boardPostPath(bo_table, initialPost, bbsRewriteMode)
    : "";
  const breadcrumbItems = initialPost
    ? [
        { name: boardName || bo_table, url: `/boards/${encodeURIComponent(bo_table)}` },
        { name: initialPost.wr_subject, url: postPath },
      ]
    : [];

  return (
    <>
      {initialPost ? (
        <>
          <ArticleJsonLd
            post={initialPost}
            boTable={bo_table}
            boardName={boardName}
            path={postPath}
          />
          <BreadcrumbJsonLd items={breadcrumbItems} />
        </>
      ) : null}
      <PostViewClient
        boTable={bo_table}
        wrId={wr_id}
        initialPost={initialPost}
        initialBoardName={board?.bo_subject ?? ""}
        initialBbsRewriteMode={bbsRewriteMode}
        initialCommentEditorEnabled={!!settings?.comment_editor}
        isStaticFallbackShell={bo_table === "__g5_static__" || wr_id === "0"}
      />
    </>
  );
}
