"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, FolderInput, Trash2 } from "lucide-react";
import { useVisitedPosts } from "@/hooks/useVisitedPosts";
import { KeyboardNav } from "./KeyboardNav";
import type { WritePost } from "@/lib/types";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { PostListRow } from "./PostListRow";
import { BatchTransferDialog } from "./BatchTransferDialog";
import { useBatchSelection } from "./useBatchSelection";

interface BatchPostListProps {
  boTable: string;
  notices: WritePost[];
  posts: WritePost[];
  totalCount: number;
  noticeCount: number;
  listNumStart: number;
  bbsRewriteMode?: BbsRewriteMode;
  boNew?: number;
  boHot?: number;
  /** 글보기 아래 목록일 때 지금 읽고 있는 글 */
  currentWrId?: number;
}

export function BatchPostList({
  boTable,
  notices,
  posts,
  listNumStart,
  bbsRewriteMode,
  boNew,
  boHot,
  currentWrId,
}: BatchPostListProps) {
  const { isVisited } = useVisitedPosts();
  // 공지도 고를 수 있다(선택 삭제 · 복사 · 이동). 공지는 목록 위에 따로 나오고 일반 글 목록에는 없다.
  const {
    isAdmin,
    selected,
    deletedIds,
    deleting,
    allSelected,
    transferMode,
    setTransferMode,
    toggleOne,
    toggleAll,
    clearSelection,
    handleBatchDelete,
    handleTransferDone,
  } = useBatchSelection(boTable, [...notices, ...posts].map((p) => p.wr_id));

  const postLinks = posts
    .filter((p) => !deletedIds.has(p.wr_id))
    .map((p) => ({ wrId: p.wr_id, boTable, href: boardPostHref(boTable, p, bbsRewriteMode) }));

  return (
    <>
      {/* Keyboard navigation hint */}
      <KeyboardNav postLinks={postLinks} />

      {/* Batch toolbar */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 rounded-lg bg-primary/5 border">
          <span className="text-sm font-medium">{selected.size}개 선택됨</span>
          <Button variant="destructive" size="sm" onClick={handleBatchDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-1" />
            {deleting ? "삭제 중..." : "선택 삭제"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferMode("copy")} disabled={deleting}>
            <Copy className="h-4 w-4 mr-1" />
            선택 복사
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferMode("move")} disabled={deleting}>
            <FolderInput className="h-4 w-4 mr-1" />
            선택 이동
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            선택 해제
          </Button>
        </div>
      )}

      <BatchTransferDialog
        mode={transferMode}
        boTable={boTable}
        wrIds={[...selected]}
        onClose={() => setTransferMode(null)}
        onDone={handleTransferDone}
      />

      <Card className="board-list-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="board-list-table w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {isAdmin && (
                    <th className="px-2 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                  )}
                  <th className="board-col-num px-4 py-3 text-left w-16">번호</th>
                  <th className="board-col-subject px-4 py-3 text-left">제목</th>
                  <th className="board-col-author px-4 py-3 text-left w-24 hidden md:table-cell">글쓴이</th>
                  <th className="board-col-hit px-4 py-3 text-center w-16 hidden lg:table-cell">조회</th>
                  <th className="board-col-date px-4 py-3 text-center w-28 hidden md:table-cell whitespace-nowrap">날짜</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((post) =>
                  deletedIds.has(post.wr_id) ? null : (
                    <PostListRow
                      key={`notice-${post.wr_id}`}
                      post={post}
                      boTable={boTable}
                      boNew={boNew}
                      boHot={boHot}
                      isVisited={isVisited(boTable, post.wr_id)}
                      isCurrent={post.wr_id === currentWrId}
                      bbsRewriteMode={bbsRewriteMode}
                      leading={
                        isAdmin ? (
                          <input
                            type="checkbox"
                            checked={selected.has(post.wr_id)}
                            onChange={() => toggleOne(post.wr_id)}
                            className="rounded"
                            aria-label={`공지 선택: ${post.wr_subject}`}
                          />
                        ) : undefined
                      }
                    />
                  )
                )}

                {posts.map((post, idx) =>
                  deletedIds.has(post.wr_id) ? null : (
                    <PostListRow
                      key={post.wr_id}
                      post={post}
                      boTable={boTable}
                      number={listNumStart - idx}
                      boNew={boNew}
                      boHot={boHot}
                      isVisited={isVisited(boTable, post.wr_id)}
                      isCurrent={post.wr_id === currentWrId}
                      bbsRewriteMode={bbsRewriteMode}
                      keyboardNavRow
                      leading={
                        isAdmin ? (
                          <input
                            type="checkbox"
                            checked={selected.has(post.wr_id)}
                            onChange={() => toggleOne(post.wr_id)}
                            className="rounded"
                          />
                        ) : undefined
                      }
                    />
                  )
                )}

                {posts.length === 0 && notices.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground">
                      게시글이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
