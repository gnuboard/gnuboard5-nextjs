"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient } from "@/lib/api";
import type { WritePost } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { BbsRewriteMode } from "@/lib/board-url";
import { PostListRow } from "./PostListRow";

interface InfinitePostListProps {
  boTable: string;
  initialPosts: WritePost[];
  notices: WritePost[];
  totalCount: number;
  totalPages: number;
  perPage: number;
  sfl?: string;
  stx?: string;
  sca?: string;
  bbsRewriteMode?: BbsRewriteMode;
  boNew?: number;
  boHot?: number;
  /** 글보기 아래 목록일 때 지금 읽고 있는 글 */
  currentWrId?: number;
}

export function InfinitePostList({
  boTable,
  initialPosts,
  notices,
  totalCount,
  totalPages,
  perPage,
  sfl,
  stx,
  sca,
  bbsRewriteMode,
  boNew,
  boHot,
  currentWrId,
}: InfinitePostListProps) {
  const [posts, setPosts] = useState<WritePost[]>(initialPosts);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(totalPages > 1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const noticeCount = notices.length;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setLoading(true);
    try {
      const res = await apiClient.get(`/boards/${boTable}/posts`, {
        params: { page: nextPage, per_page: perPage, sfl, stx, sca },
      });
      const newPosts = (Array.isArray(res.data) ? res.data : []) as WritePost[];
      const filtered = newPosts.filter((p: WritePost) => !p.is_notice);
      setPosts((prev) => [...prev, ...filtered]);
      setPage(nextPage);
      if (nextPage >= totalPages || filtered.length === 0) {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, boTable, perPage, sfl, stx, sca, totalPages]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <Card className="board-list-card">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="board-list-table w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="board-col-num px-4 py-3 text-left w-16">번호</th>
                <th className="board-col-subject px-4 py-3 text-left">제목</th>
                <th className="board-col-author px-4 py-3 text-left w-24 hidden md:table-cell">글쓴이</th>
                <th className="board-col-hit px-4 py-3 text-center w-16 hidden lg:table-cell">조회</th>
                <th className="board-col-date px-4 py-3 text-center w-28 hidden md:table-cell whitespace-nowrap">날짜</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((post) => (
                <PostListRow
                  key={`notice-${post.wr_id}`}
                  post={post}
                  boTable={boTable}
                  boNew={boNew}
                  boHot={boHot}
                  isCurrent={post.wr_id === currentWrId}
                  bbsRewriteMode={bbsRewriteMode}
                />
              ))}

              {posts.map((post, idx) => (
                <PostListRow
                  key={post.wr_id}
                  post={post}
                  boTable={boTable}
                  number={totalCount - noticeCount - idx}
                  boNew={boNew}
                  boHot={boHot}
                  isCurrent={post.wr_id === currentWrId}
                  bbsRewriteMode={bbsRewriteMode}
                />
              ))}

              {posts.length === 0 && notices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    게시글이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Sentinel + Loading */}
      <div ref={sentinelRef} className="py-4 text-center">
        {loading && (
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        )}
        {!hasMore && posts.length > 0 && (
          <p className="text-sm text-muted-foreground">모든 게시글을 불러왔습니다.</p>
        )}
      </div>
    </Card>
  );
}
