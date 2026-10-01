"use client";

import { createElement, Suspense, useEffect, useState } from "react";
import Image from "next/image";
import type { Board, PostFile } from "@/lib/types";
import { canWriteToBoard } from "@/lib/board-permissions";
import { useAuthStore } from "@/store/auth";
import type { PostDetail } from "@/services/boards";
import { getBoard, getPostDetailBySeoResult, getPostDetailResult } from "@/services/boards";
import { getClientPublicSettings } from "@/services/settings";
import {
  currentPathForRuntime,
  currentPathHasTrailingSlashForRuntime,
  g5BaseUrlForRuntime,
  g5PathForRuntime,
} from "@/lib/config";
import {
  applyClientJsonLd,
  applyClientPageMetadata,
  clientAbsoluteUrl,
  plainTextSummary,
} from "@/lib/client-metadata";
import { formatDate, formatNumber } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { SafeHtml } from "@/components/SafeHtml";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShareButtons } from "@/components/ShareButtons";
import { MemberSideview } from "@/components/MemberSideview";
import { StaticFallbackNotice } from "@/components/StaticFallbackNotice";
import { useThemeSlot } from "@/components/providers/ThemeSlotsProvider";
import { ChevronDown, ChevronUp, FileQuestion, Link2, MessageCircle } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast";
import { CommentSection } from "./CommentSection";
import { MarkVisited } from "./MarkVisited";
import { PostActions } from "./PostActions";
import { g5ShortHref } from "@/lib/g5-short-url";
import { boardPostHref, boardPostPath, isBbsSeoRewrite } from "@/lib/board-url";
import { themeConfig } from "@g5-theme/theme.config";
import type { G5ThemeConfig } from "@/lib/theme-types";
import BoardPostListClient from "../ClientPage";

interface ClientPageProps {
  boTable?: string;
  wrId?: string;
  initialPost?: PostDetail | null;
  initialBoardName?: string;
  initialBbsRewriteMode?: number;
  initialCommentEditorEnabled?: boolean;
  isStaticFallbackShell?: boolean;
}

function isImageFile(file: PostFile): boolean {
  return (
    file.bf_type === 2 ||
    file.bf_type === 3 ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.bf_source)
  );
}

function safePostLink(value?: string | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /[\u0000-\u001F\u007F]/.test(raw)) return "";

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  decoded = decoded.trim();
  if (!decoded || decoded.startsWith("//")) return "";

  const scheme = decoded.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "mailto", "tel"].includes(scheme)) return "";

  return raw;
}

export default function PostViewClient({
  boTable,
  wrId,
  initialPost = null,
  initialBoardName = "",
  initialBbsRewriteMode = 0,
  initialCommentEditorEnabled = false,
  isStaticFallbackShell = false,
}: ClientPageProps) {
  const routePatterns = ["/boards/:bo_table/:wr_id", "/:bo_table/:wr_id"];
  const bo_table = useRuntimeRouteParam("bo_table", routePatterns, boTable);
  const wr_id = useRuntimeRouteParam("wr_id", routePatterns, wrId);
  const routeReady = useRuntimeRouteReady();
  const [post, setPost] = useState<PostDetail | null>(initialPost);
  const [boardName, setBoardName] = useState(initialBoardName);
  // 글쓰기 · 답글 단추를 게시판 권한대로 보이려고 게시판 정보를 함께 둔다.
  const [board, setBoard] = useState<Board | null>(null);
  const authUser = useAuthStore((state) => state.user);
  const [bbsRewriteMode, setBbsRewriteMode] = useState(initialBbsRewriteMode);
  const [commentEditorEnabled, setCommentEditorEnabled] = useState(initialCommentEditorEnabled);
  const [loading, setLoading] = useState(!initialPost);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  // 테마가 글보기 헤더를 제공하면 그것으로 카드 머리를 바꾼다. 훅이라 early return 앞에 둔다.
  const themeBoardViewHeader = useThemeSlot("BoardViewHeader");

  useEffect(() => {
    if (initialPost && bo_table === boTable && wr_id === wrId) {
      setPost(initialPost);
      setBoardName(initialBoardName);
      setBbsRewriteMode(initialBbsRewriteMode);
      setCommentEditorEnabled(initialCommentEditorEnabled);
      setMissing(false);
      setLoadError(false);
      setAccessDenied(false);
      setLoading(false);
      return;
    }

    if (!bo_table || !wr_id) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setPost(null);
      setBoardName(bo_table || "");
      setMissing(true);
      setLoadError(false);
      setAccessDenied(false);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setMissing(false);
    setLoadError(false);
    setAccessDenied(false);

    async function load() {
      const runtimePath = currentPathForRuntime();
      const legacySeoPath =
        (!/^[0-9]+$/.test(wr_id) || currentPathHasTrailingSlashForRuntime()) &&
        new RegExp(`^/${bo_table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+$`).test(runtimePath);

      if (legacySeoPath) {
        const [seoPostResult, nextBoard, settings] = await Promise.all([
          getPostDetailBySeoResult({ boTable: bo_table, slug: wr_id }),
          getBoard(bo_table, 60),
          getClientPublicSettings().catch(() => null),
        ]);

        if (!alive) return;
        const nextRewriteMode = Number(settings?.cf_bbs_rewrite ?? 0);
        setBbsRewriteMode(nextRewriteMode);
        setBoardName(nextBoard?.bo_subject ?? bo_table);
      setBoard(nextBoard);
        setBoard(nextBoard);
        setCommentEditorEnabled(!!settings?.comment_editor);

        const seoPost = seoPostResult.ok ? seoPostResult.data : null;
        const seoAccessDenied = !seoPostResult.ok && (seoPostResult.status === 401 || seoPostResult.status === 403);

        if (seoPost?.wr_id) {
          if (isBbsSeoRewrite(nextRewriteMode)) {
            setPost(seoPost);
            setMissing(false);
            setLoadError(false);
            setAccessDenied(false);
            setLoading(false);
            return;
          }

          window.location.replace(g5PathForRuntime(`/${bo_table}/${seoPost.wr_id}`));
          return;
        }

        setPost(null);
        setMissing(!seoAccessDenied);
        setLoadError(false);
        setAccessDenied(seoAccessDenied);
        setLoading(false);
        return;
      }

      const [nextPostResult, nextBoard, settings] = await Promise.all([
        getPostDetailResult({ boTable: bo_table, wrId: wr_id }),
        getBoard(bo_table, 60),
        getClientPublicSettings().catch(() => null),
      ]);

      if (!alive) return;
      const nextPost = nextPostResult.ok ? nextPostResult.data : null;
      const nextAccessDenied = !nextPostResult.ok && (nextPostResult.status === 401 || nextPostResult.status === 403);
      setPost(nextPost);
      setBbsRewriteMode(Number(settings?.cf_bbs_rewrite ?? 0));
      setBoardName(nextBoard?.bo_subject ?? bo_table);
      setBoard(nextBoard);
      setCommentEditorEnabled(!!settings?.comment_editor);
      setMissing(!nextPost && !nextAccessDenied);
      setAccessDenied(nextAccessDenied);
      setLoadError(false);
      setLoading(false);
    }

    load().catch(() => {
      if (!alive) return;
      setPost(null);
      setBoardName(bo_table);
      setMissing(false);
      setLoadError(true);
      setAccessDenied(false);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [
    bo_table,
    boTable,
    initialBbsRewriteMode,
    initialBoardName,
    initialCommentEditorEnabled,
    initialPost,
    routeReady,
    wr_id,
    wrId,
  ]);

  useEffect(() => {
    if (!post || !bo_table) return;

    const image = post.files?.find(isImageFile)?.bf_url;
    const postPath = boardPostPath(bo_table, post, bbsRewriteMode);
    const canonical = new URL(g5ShortHref(postPath), window.location.origin).toString();
    const imageUrl = image ? clientAbsoluteUrl(image) : undefined;
    applyClientPageMetadata({
      title: post.wr_subject,
      description: post.wr_content,
      path: postPath,
      image,
      // 정적 셸은 noindex 로 구워져 있다. 실제 글을 찾았으니 색인을 연다 — 검색엔진 노출 설정이 허락할 때만.
      index: true,
      boTable: bo_table,
    });
    applyClientJsonLd("product", null);
    applyClientJsonLd("article", {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.wr_subject,
      description: plainTextSummary(post.wr_content, post.wr_subject),
      articleSection: boardName || bo_table,
      author: {
        "@type": "Person",
        name: post.mb_nick || post.wr_name || "익명",
      },
      datePublished: post.wr_datetime,
      dateModified: post.wr_last || post.wr_datetime,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonical,
      },
      url: canonical,
      ...(imageUrl ? { image: [imageUrl] } : {}),
    });
    applyClientJsonLd("breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: boardName || bo_table,
          item: new URL(g5ShortHref(`/boards/${bo_table}`), window.location.origin).toString(),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: post.wr_subject,
          item: canonical,
        },
      ],
    });
  }, [post, bo_table, boardName, bbsRewriteMode]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="skeleton mb-4 h-6 w-48 rounded" />
        <div className="space-y-4 rounded-lg border p-6">
          <div className="skeleton h-8 w-3/4 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-40 rounded" />
        </div>
      </div>
    );
  }

  if (loadError || accessDenied || missing || !post) {
    const listHref = bo_table ? g5ShortHref(`/boards/${bo_table}`) : "/boards";
    const originalHref =
      bo_table && wr_id
        ? new URL(
            `/bbs/board.php?bo_table=${encodeURIComponent(bo_table)}&wr_id=${encodeURIComponent(wr_id)}`,
            g5BaseUrlForRuntime()
          ).toString()
        : "";
    const title = accessDenied
      ? "게시글 접근 권한이 없습니다"
      : loadError
        ? "게시글을 불러오지 못했습니다"
        : "게시글을 찾을 수 없습니다";
    const description = accessDenied
      ? "비밀글이거나 로그인한 작성자와 관리자만 확인할 수 있는 글입니다."
      : loadError
        ? "일시적인 네트워크 문제이거나 API 서버 응답이 지연되고 있습니다."
        : "삭제되었거나 이동된 글일 수 있습니다.";

    return (
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="size-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            {!accessDenied && isStaticFallbackShell ? <StaticFallbackNotice kind="post" /> : null}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <a href={listHref}>목록으로 돌아가기</a>
            </Button>
            {originalHref && (
              <Button asChild variant="outline">
                <a href={originalHref}>원본 사이트에서 확인</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const comments = post.comments ?? [];
  const files = post.files ?? [];
  const imageFiles = files.filter((file) => isImageFile(file) && Boolean(file.bf_url));
  const otherFiles = files.filter((file) => !isImageFile(file) || !file.bf_url);
  const actualWrId = String(post.wr_id);
  const safeLink1 = safePostLink(post.wr_link1);
  const safeLink2 = safePostLink(post.wr_link2);

  const copyPostLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toastSuccess("링크가 복사되었습니다.");
    } catch {
      toastError("링크를 복사하지 못했습니다.");
    }
  };

  return (
    <div className="board-view-page container mx-auto px-4 py-8">
      <MarkVisited boTable={bo_table} wrId={actualWrId} />
      <Breadcrumb
        items={[
          { label: boardName, href: g5ShortHref(`/boards/${bo_table}`) },
          { label: post.wr_subject },
        ]}
      />

      <Card className="board-view-card">
        {themeBoardViewHeader ? (
          createElement(themeBoardViewHeader, {
            post,
            boTable: bo_table,
            boardName,
            listHref: g5ShortHref(`/boards/${bo_table}`),
            author: (
              <MemberSideview
                mbId={post.mb_id}
                name={post.mb_nick || post.wr_name}
                email={post.wr_email}
                homepage={post.wr_homepage}
                iconUrl={post.mb_icon_path}
                boTable={bo_table}
                className="font-medium text-foreground"
              />
            ),
            actions: <PostActions boTable={bo_table} wrId={actualWrId} post={post} />,
            share: <ShareButtons title={post.wr_subject} />,
          })
        ) : (
        <CardHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold leading-tight">{post.wr_subject}</h1>
            <PostActions boTable={bo_table} wrId={actualWrId} post={post} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <MemberSideview
              mbId={post.mb_id}
              name={post.mb_nick || post.wr_name}
              email={post.wr_email}
              homepage={post.wr_homepage}
              iconUrl={post.mb_icon_path}
              boTable={bo_table}
              className="font-medium text-foreground"
            />
            <span>{formatDate(post.wr_datetime)}</span>
            <span>Views {formatNumber(Number(post.wr_hit))}</span>
            {post.ca_name && <Badge variant="outline">{post.ca_name}</Badge>}
            <ShareButtons title={post.wr_subject} />
          </div>
        </CardHeader>
        )}

        <Separator />

        {imageFiles.length > 0 && (
          <>
            <CardContent className="space-y-4 py-4">
              {imageFiles.map((file) => (
                <div key={file.bf_no} className="overflow-hidden rounded border">
                  <Image
                    src={file.bf_url || ""}
                    alt={file.bf_source}
                    width={1200}
                    height={800}
                    sizes="100vw"
                    className="mx-auto h-auto max-w-full"
                    style={{ width: "100%", height: "auto" }}
                    unoptimized={shouldBypassImageOptimization(file.bf_url)}
                  />
                </div>
              ))}
            </CardContent>
            <Separator />
          </>
        )}

        <CardContent className="board-view-content py-6">
          <SafeHtml
            className="prose prose-sm max-w-none dark:prose-invert"
            html={post.wr_content}
            policy="content"
          />
        </CardContent>

        {otherFiles.length > 0 && (
          <>
            <Separator />
            <CardContent className="py-4">
              <h3 className="mb-2 text-sm font-medium">첨부파일</h3>
              <div className="space-y-2">
                {otherFiles.map((file) => (
                  <a
                    key={file.bf_no}
                    href={file.bf_download_url || file.bf_url}
                    className="flex items-center gap-1 break-all text-sm text-primary hover:underline"
                  >
                    {file.bf_source}
                    {file.bf_filesize > 0 && (
                      <span className="text-muted-foreground">
                        ({(file.bf_filesize / 1024).toFixed(1)}KB)
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </CardContent>
          </>
        )}

        {(safeLink1 || safeLink2) && (
          <>
            <Separator />
            <CardContent className="space-y-1 py-4">
              {safeLink1 && (
                <p className="text-sm">
                  <span className="mr-2 text-muted-foreground">링크 1:</span>
                  <a
                    href={safeLink1}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary hover:underline"
                  >
                    {safeLink1}
                  </a>
                </p>
              )}
              {safeLink2 && (
                <p className="text-sm">
                  <span className="mr-2 text-muted-foreground">링크 2:</span>
                  <a
                    href={safeLink2}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary hover:underline"
                  >
                    {safeLink2}
                  </a>
                </p>
              )}
            </CardContent>
          </>
        )}

        <Separator />

        <CardContent className="board-view-vote py-4">
          <div className="flex items-center justify-center gap-4">
            <PostActions boTable={bo_table} wrId={actualWrId} post={post} mode="vote" />
          </div>
        </CardContent>

        {/* 글 아래 도구줄 — 그누보드 view.skin 의 #bo_v_top/bot: 댓글 수 · 링크 복사 | 글쓰기 · 목록으로 */}
        <div className="board-view-toolbar flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <a href="#board-comments" className="board-view-toolbar-btn inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-3">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              댓글 {formatNumber(Number(post.wr_comment ?? 0))}
            </a>
            <button type="button" onClick={() => void copyPostLink()} className="board-view-toolbar-btn inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-3">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              링크 복사
            </button>
          </div>
          <div className="flex items-center gap-2">
            {canWriteToBoard(board, authUser, "reply") && (
              <Button asChild variant="outline" size="sm" className="board-view-toolbar-reply">
                <a href={g5ShortHref(`/boards/${bo_table}/write?reply_to=${post.wr_id}`)}>답글</a>
              </Button>
            )}
            {canWriteToBoard(board, authUser) && (
              <Button asChild variant="outline" size="sm" className="board-view-toolbar-write">
                <a href={g5ShortHref(`/boards/${bo_table}/write`)}>글쓰기</a>
              </Button>
            )}
            <Button asChild size="sm" className="board-view-toolbar-list">
              <a href={g5ShortHref(`/boards/${bo_table}`)}>목록으로</a>
            </Button>
          </div>
        </div>
      </Card>

      <div className="board-view-comments mt-6" id="board-comments">
        <CommentSection
          boTable={bo_table}
          wrId={actualWrId}
          initialComments={comments}
          useEditor={commentEditorEnabled}
        />
      </div>

      {(post.prev_post || post.next_post) && (
        <div className="board-view-siblings mt-6 divide-y rounded-lg border bg-card text-sm">
          {post.next_post && (
            <a
              href={boardPostHref(bo_table, post.next_post, bbsRewriteMode)}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">다음글</span>
              <span className="truncate">{post.next_post.wr_subject}</span>
            </a>
          )}
          {post.prev_post && (
            <a
              href={boardPostHref(bo_table, post.prev_post, bbsRewriteMode)}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">이전글</span>
              <span className="truncate">{post.prev_post.wr_subject}</span>
            </a>
          )}
        </div>
      )}

      <div className="board-view-footer mt-4 flex justify-between">
        <Button asChild variant="outline">
          <a href={g5ShortHref(`/boards/${bo_table}`)}>목록</a>
        </Button>
        {canWriteToBoard(board, authUser) && (
          <Button asChild>
            <a href={g5ShortHref(`/boards/${bo_table}/write`)}>글쓰기</a>
          </Button>
        )}
      </div>

      {/* 그누보드 기본 화면처럼 글 아래에 그 게시판의 목록. 테마가 features.listUnderPostView 로 켠다. */}
      {/* 목록은 useSearchParams 를 쓰므로 정적 빌드가 Suspense 경계를 요구한다. 경계를 글 전체가
          아니라 여기에만 둔다 — 글 전체를 감싸면 이동할 때 새 화면 코드를 받는 동안 대체 화면이 먼저
          뜨고, React 가 그 뒤 300ms 동안 본 내용을 묶어 두어(FALLBACK_THROTTLE_MS) 글 API 호출까지 늦어진다. */}
      {(themeConfig as G5ThemeConfig).features?.listUnderPostView && bo_table && post ? (
        <Suspense fallback={null}>
          <BoardPostListClient boTable={bo_table} embedded currentWrId={post.wr_id} />
        </Suspense>
      ) : null}
    </div>
  );
}
