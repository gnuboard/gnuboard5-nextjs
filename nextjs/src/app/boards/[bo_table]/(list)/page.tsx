// @g5-static-fallback
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { isSeoIndexableBoard, serverSeoSettings } from "@/lib/seo-config";
import { getBoard } from "@/services/boards";
import BoardPostListClient from "../ClientPage";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ bo_table: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ bo_table: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bo_table } = await params;
  const isStaticFallbackShell = bo_table === "__g5_static__";
  // 로그인 없이 부르므로 비회원이 목록을 못 보는 게시판은 null — 그런 게시판은 색인하지 않는다.
  const board = isStaticFallbackShell ? null : await getBoard(bo_table, 3600).catch(() => null);

  return buildPageMetadata({
    title: board?.bo_subject || (isStaticFallbackShell ? "게시판" : bo_table),
    ...(board?.bo_subject ? { description: `${board.bo_subject} 게시판의 글 목록입니다.` } : {}),
    path: isStaticFallbackShell ? "/boards" : `/boards/${bo_table}`,
    noindex: isStaticFallbackShell || !board || !isSeoIndexableBoard(serverSeoSettings(), bo_table),
  });
}

export default async function BoardPostListPage({ params }: PageProps) {
  const { bo_table } = await params;

  return <BoardPostListClient boTable={bo_table} />;
}
