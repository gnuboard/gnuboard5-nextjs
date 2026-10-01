"use client";

import { useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useSearchParams } from "next/navigation";
import type { Board, WritePost } from "@/lib/types";
import { canWriteToBoard } from "@/lib/board-permissions";
import { useAuthStore } from "@/store/auth";
import { GALLERY_BOARDS } from "@/lib/config";
import { cn, formatDate } from "@/lib/utils";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { getBoard, getBoardPosts } from "@/services/boards";
import { getClientPublicSettings } from "@/services/settings";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { StaticFallbackNotice } from "@/components/StaticFallbackNotice";
import { ImageIcon, RssIcon, FolderX } from "lucide-react";
import { BatchPostList } from "./BatchActions";
import { GalleryThumbnail } from "./GalleryThumbnail";
import { InfinitePostList } from "./InfinitePostList";
import { SearchForm } from "./SearchForm";
import { g5ShortHref } from "@/lib/g5-short-url";
import { boardPostHref } from "@/lib/board-url";

interface ClientPageProps {
  boTable?: string;
  /**
   * 글보기 아래에 붙는 목록. 빵부스러기·머리띠·글쓰기·메타데이터는 빼고
   * 분류 칩 · 글 줄 · 쪽 · 검색만 그린다(그누보드 view 아래 list 와 같다).
   */
  embedded?: boolean;
  /** embedded 일 때 지금 읽고 있는 글 — 줄에 표시한다 */
  currentWrId?: number;
}

interface PostsState {
  list: WritePost[];
  total: number;
  totalPage: number;
  error?: string;
}

const EMPTY_POSTS: PostsState = {
  list: [],
  total: 0,
  totalPage: 1,
};

function toPage(value: string | null): number {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default function BoardPostListClient({ boTable, embedded = false, currentWrId }: ClientPageProps) {
  const bo_table = useRuntimeRouteParam("bo_table", ["/boards/:bo_table", "/:bo_table"], boTable);
  const routeReady = useRuntimeRouteReady();
  const isStaticFallbackShell = boTable === "__g5_static__";
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();

  const page = toPage(searchParams.get("page"));
  const sfl = searchParams.get("sfl") || undefined;
  const stx = searchParams.get("stx") || undefined;
  const sca = searchParams.get("sca") || undefined;

  const paginationSearchParams = useMemo(
    () => ({
      page: searchParams.get("page") || undefined,
      sfl,
      stx,
      sca,
    }),
    [sca, searchParams, sfl, stx]
  );

  const [board, setBoard] = useState<Board | null>(null);
  const authUser = useAuthStore((state) => state.user);
  const [postsData, setPostsData] = useState<PostsState>(EMPTY_POSTS);
  const [bbsRewriteMode, setBbsRewriteMode] = useState(0);
  const [infiniteScroll, setInfiniteScroll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!bo_table) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setBoard(null);
      setPostsData(EMPTY_POSTS);
      setMissing(true);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setMissing(false);

    async function load() {
      const nextBoard = await getBoard(bo_table);
      if (!alive) return;

      if (!nextBoard) {
        setBoard(null);
        setPostsData(EMPTY_POSTS);
        setMissing(true);
        setLoading(false);
        return;
      }

      setBoard(nextBoard);
      const perPage = nextBoard.bo_page_rows || 15;
      const [settings, nextPosts] = await Promise.all([
        getClientPublicSettings().catch(() => null),
        getBoardPosts({ boTable: bo_table, page, perPage, sfl, stx, sca }),
      ]);

      if (!alive) return;
      setBbsRewriteMode(Number(settings?.cf_bbs_rewrite ?? 0));
      setInfiniteScroll(!!settings?.infinite_scroll);
      setPostsData(nextPosts);
      setLoading(false);
    }

    load().catch((error: unknown) => {
      if (!alive) return;
      setPostsData({
        ...EMPTY_POSTS,
        error: error instanceof Error ? error.message : "Failed to load posts.",
      });
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [bo_table, page, queryKey, routeReady, sca, sfl, stx]);

  useEffect(() => {
    if (!board || !bo_table || embedded) return;

    applyClientPageMetadata({
      title: board.bo_subject,
      description: board.bo_content || `${board.bo_subject} 게시판`,
      path: `/boards/${bo_table}`,
    });
  }, [board, bo_table, embedded]);

  if (loading) {
    if (embedded) {
      return (
        <div className="board-list-page board-list-embedded mt-8" aria-busy="true">
          <div className="surface-panel space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="site-container px-4 py-8">
        <div className="page-hero mb-5">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton mt-3 h-8 w-48 rounded" />
          <div className="skeleton mt-2 h-4 w-72 max-w-full rounded" />
        </div>
        <div className="surface-panel space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton h-12 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (missing || !board) {
    // 글 아래 목록은 글이 이미 게시판을 확인했으니, 여기서 또 "없음" 을 말하지 않는다.
    if (embedded) return null;
    return (
      <div className="site-container px-4 py-20">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <FolderX className="size-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">게시판을 찾을 수 없습니다</h1>
            <p className="text-sm text-muted-foreground">
              존재하지 않거나 접근 권한이 없는 게시판입니다.
            </p>
            {isStaticFallbackShell ? <StaticFallbackNotice kind="board" className="text-left" /> : null}
          </div>
          <Button asChild>
            <Link href="/boards">게시판 목록으로</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { list: posts, total: totalCount, totalPage, error: postsError } = postsData;
  const categories = board.bo_category_list
    ? board.bo_category_list.split("|").filter(Boolean)
    : [];
  const notices = posts.filter((post) => post.is_notice);
  const noticeCount = notices.length;
  const regularPosts = posts.filter((post) => !post.is_notice);
  const perPage = board.bo_page_rows || 15;
  const listNumStart = totalCount - (page - 1) * perPage - noticeCount;
  const isGallery = GALLERY_BOARDS.includes(bo_table);
  const galleryCols = board.bo_gallery_cols || 4;

  return (
    <div className={cn("board-list-page", embedded ? "board-list-embedded mt-8" : "site-container px-4 py-8")}>
      {embedded ? null : (
      <Breadcrumb items={[{ label: "게시판", href: "/boards" }, { label: board.bo_subject }]} />
      )}

      {embedded ? null : (
      <section className="board-list-hero page-hero mb-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="section-eyebrow">커뮤니티 게시판</p>
            <h1 className="page-hero-title">{board.bo_subject}</h1>
            <p className="page-hero-desc">
              {board.bo_content || `총 ${totalCount.toLocaleString("ko-KR")}개의 게시글을 확인하세요.`}
            </p>
          </div>
          <div className="board-list-actions flex items-center gap-2">
            {canWriteToBoard(board, authUser) && (
              <Button className="board-list-write" asChild>
                <a href={g5ShortHref(`/boards/${bo_table}/write`)}>글쓰기</a>
              </Button>
            )}
          </div>
        </div>
      </section>
      )}

      {/* 글 수 · 쪽수와 RSS. 그누보드 list.skin 의 안내줄 — 테마는 이것을 목록 카드의 머리로 쓴다. */}
      <div className="board-list-summary mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <p className="board-list-summary-text">
          <b className="text-foreground">{totalCount.toLocaleString("ko-KR")}</b> 개의 글 · {page}페이지
        </p>
        <a
          href={`/rss/${bo_table}`}
          target="_blank"
          rel="noopener noreferrer"
          title="RSS feed"
          aria-label="RSS 피드"
          className="board-list-rss inline-flex h-8 w-8 items-center justify-center rounded-[4px] border text-[#b45309] transition-colors hover:bg-[#fff7e6]"
        >
          <RssIcon className="h-4 w-4" />
        </a>
      </div>

      {categories.length > 0 && (
        <div className="board-list-categories surface-toolbar mb-5">
          <a href={g5ShortHref(`/boards/${bo_table}`)} className={cn("filter-chip", !sca && "filter-chip-active")}>
            전체
            <span className="filter-chip-count">{totalCount.toLocaleString("ko-KR")}</span>
          </a>
          {categories.map((category) => {
            const count = board.category_counts?.[category];
            return (
              <a
                key={category}
                href={g5ShortHref(`/boards/${bo_table}?sca=${encodeURIComponent(category)}`)}
                className={cn("filter-chip", sca === category && "filter-chip-active")}
              >
                {category}
                {typeof count === "number" && (
                  <span className="filter-chip-count">{count.toLocaleString("ko-KR")}</span>
                )}
              </a>
            );
          })}
        </div>
      )}

      <div className="board-list-search surface-panel mb-5 p-4">
        <SearchForm boTable={bo_table} sfl={sfl} stx={stx} />
      </div>

      {postsError && (
        <ErrorState
          className="mb-6"
          title="게시글을 불러오지 못했습니다"
          description={postsError}
          actionHref={g5ShortHref(`/boards/${bo_table}`)}
        />
      )}

      {!postsError && isGallery ? (
        <>
          {notices.length > 0 && (
            <div className="mb-4 space-y-1">
              {notices.map((post) => (
                <div
                  key={`notice-${post.wr_id}`}
                  className="flex items-center gap-2 rounded bg-primary/5 px-2 py-1.5"
                >
                  <Badge variant="destructive" className="shrink-0 text-xs">
                    Notice
                  </Badge>
                  <a
                    href={boardPostHref(bo_table, post, bbsRewriteMode)}
                    className="truncate text-sm font-medium transition-colors hover:text-primary"
                  >
                    {post.wr_subject}
                  </a>
                </div>
              ))}
            </div>
          )}

          {regularPosts.length > 0 ? (
            <div className="gallery-grid grid grid-cols-2 gap-4 sm:grid-cols-3">
              <style>{`
                @media (min-width: 768px) {
                  .gallery-grid { grid-template-columns: repeat(${galleryCols}, minmax(0, 1fr)) !important; }
                }
              `}</style>
              {regularPosts.map((post, index) => (
                <a
                  key={post.wr_id}
                  href={boardPostHref(bo_table, post, bbsRewriteMode)}
                  className="group"
                >
                  <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
                    <div className="relative aspect-square bg-muted">
                      {post.thumbnail ? (
                        <GalleryThumbnail
                          src={post.thumbnail}
                          alt={post.wr_subject}
                          sizes={`(max-width: 768px) 50vw, ${Math.floor(100 / galleryCols)}vw`}
                          priority={index < galleryCols * 2}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <h3 className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                        {post.wr_subject}
                        {post.wr_comment > 0 && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">
                            {post.wr_comment}
                          </Badge>
                        )}
                      </h3>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{post.mb_nick || post.wr_name}</span>
                        <span>{formatDate(post.wr_datetime)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          ) : (
            posts.length === 0 && <EmptyState title="아직 등록된 게시글이 없습니다" />
          )}
        </>
      ) : !postsError && infiniteScroll ? (
        <InfinitePostList
          boTable={bo_table}
          initialPosts={regularPosts}
          notices={notices}
          totalCount={totalCount}
          totalPages={totalPage}
          perPage={perPage}
          sfl={sfl}
          stx={stx}
          sca={sca}
          bbsRewriteMode={bbsRewriteMode}
          boNew={board?.bo_new ?? 0}
          boHot={board?.bo_hot ?? 0}
          currentWrId={currentWrId}
        />
      ) : !postsError ? (
        <BatchPostList
          boTable={bo_table}
          notices={notices}
          posts={regularPosts}
          totalCount={totalCount}
          noticeCount={noticeCount}
          listNumStart={listNumStart}
          bbsRewriteMode={bbsRewriteMode}
          boNew={board?.bo_new ?? 0}
          boHot={board?.bo_hot ?? 0}
          currentWrId={currentWrId}
        />
      ) : null}

      {totalPage > 1 && !infiniteScroll && (
        <div className="board-list-pagination mt-6 flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPage}
            baseUrl={g5ShortHref(`/boards/${bo_table}`)}
            searchParams={paginationSearchParams}
          />
        </div>
      )}
    </div>
  );
}
