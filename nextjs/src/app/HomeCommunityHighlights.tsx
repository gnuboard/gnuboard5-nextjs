"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import {
  ChevronRight,
  Clock3,
  Eye,
  MessageCircle,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { shouldBypassImageOptimization } from "@/lib/image";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { formatDate, truncate } from "@/lib/utils";
import { getBoards, getBoardPosts } from "@/services/boards";
import { getClientPublicSettings } from "@/services/settings";
import type { Board, WritePost } from "@/lib/types";

export type HomePost = WritePost & {
  boardHref: string;
  boardSubject: string;
  href: string;
};

type HomeCommunityHighlightsProps = {
  initialLatestPosts: HomePost[];
  initialPopularPosts: HomePost[];
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const HOME_BOARD_FETCH_LIMIT = positiveInt(process.env.NEXT_PUBLIC_HOME_BOARD_FETCH_LIMIT, 12);

function postScore(post: HomePost) {
  return Number(post.wr_hit) + Number(post.wr_comment) * 12 + Number(post.wr_good) * 20;
}

function postTime(post: HomePost) {
  const time = new Date(String(post.wr_datetime).replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatMetric(value: number | string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (num >= 10000) {
    return `${(num / 10000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}만`;
  }
  return num.toLocaleString("ko-KR");
}

function postAuthor(post: HomePost | WritePost) {
  return post.mb_nick || post.wr_name || "작성자";
}

function isPublicHomePost(post: WritePost) {
  return !post.is_secret && !String(post.wr_option || "").split(",").includes("secret");
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity: string) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITIES[normalized] ?? match;
  });
}

function postExcerpt(post: HomePost | WritePost, length = 86) {
  const source = post.wr_content || post.wr_subject || "";
  const text = decodeHtmlEntities(source.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  return text ? truncate(text, length) : "";
}

function SectionHeader({
  eyebrow,
  title,
  href,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
}) {
  return (
    <div className="section-header">
      <div className="min-w-0">
        {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="section-more">
          더보기
          <ChevronRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function Thumb({
  post,
  className,
  sizes = "(max-width: 768px) 35vw, 180px",
}: {
  post: HomePost | WritePost;
  className: string;
  sizes?: string;
}) {
  const thumbnail = post.thumbnail || post.images?.[0] || "";
  const boardSubject = "boardSubject" in post ? post.boardSubject : post.bo_subject || post.ca_name || "G5";

  if (!thumbnail) {
    return (
      <span className={`${className} g5-thumb-fallback`}>
        <span className="g5-thumb-mark">G5</span>
        <span className="g5-thumb-label">{boardSubject}</span>
      </span>
    );
  }

  return (
    <span className={`${className} relative overflow-hidden bg-muted`}>
      <Image
        src={thumbnail}
        alt={post.wr_subject || ""}
        fill
        sizes={sizes}
        className="object-cover transition-transform duration-200 group-hover:scale-105"
        unoptimized={shouldBypassImageOptimization(thumbnail)}
      />
    </span>
  );
}

function PostStats({ post }: { post: HomePost }) {
  return (
    <span className="flex flex-wrap items-center gap-3 text-xs text-[#5f6872]">
      <span className="inline-flex items-center gap-1">
        <MessageCircle className="size-3.5" />
        {formatMetric(post.wr_comment)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Eye className="size-3.5" />
        {formatMetric(post.wr_hit)}
      </span>
      <span className="inline-flex items-center gap-1">
        <ThumbsUp className="size-3.5" />
        {formatMetric(post.wr_good)}
      </span>
    </span>
  );
}

function FeaturedPostCard({ post }: { post: HomePost }) {
  const excerpt = postExcerpt(post);

  return (
    <Link href={post.href} className="group featured-post">
      <Thumb post={post} className="featured-post-thumb" sizes="(max-width: 768px) 100vw, 440px" />
      <span className="featured-post-copy">
        <span className="mb-2 inline-flex rounded-[4px] bg-[#eafaf1] px-2 py-1 text-xs font-bold text-[#0c8040]">
          {post.boardSubject}
        </span>
        <span className="block text-[22px] font-black leading-snug text-[#1f2933] md:text-[26px]">
          {truncate(post.wr_subject, 64)}
        </span>
        {excerpt && (
          <span className="mt-2 block line-clamp-2 text-sm leading-6 text-[#5f6872]">
            {excerpt}
          </span>
        )}
        <span className="naver-meta mt-3 block">
          {postAuthor(post)} · {formatDate(post.wr_datetime)}
        </span>
        <span className="mt-3 block">
          <PostStats post={post} />
        </span>
      </span>
    </Link>
  );
}

function CompactTrendPost({ post, index }: { post: HomePost; index: number }) {
  return (
    <Link href={post.href} className="group compact-trend-post">
      <span className={index < 3 ? "trend-rank text-primary" : "trend-rank text-[#5f6872]"}>
        {index + 1}
      </span>
      <Thumb post={post} className="size-14 shrink-0 rounded-[6px]" sizes="56px" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[#27313c] group-hover:text-primary">
          {post.wr_subject}
          {Number(post.wr_comment) > 0 && (
            <Badge variant="secondary" className="ml-1 align-middle">
              {post.wr_comment}
            </Badge>
          )}
        </span>
        <span className="naver-meta mt-1 block truncate">
          {post.boardSubject} · {postAuthor(post)} · {formatDate(post.wr_datetime)}
        </span>
      </span>
    </Link>
  );
}

function LatestPostRow({ post }: { post: HomePost }) {
  return (
    <Link href={post.href} className="group latest-post-row">
      <span className="latest-dot" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#27313c] group-hover:text-primary">
          {post.wr_subject}
          {Number(post.wr_comment) > 0 && (
            <Badge variant="secondary" className="ml-1 align-middle">
              {post.wr_comment}
            </Badge>
          )}
        </span>
        <span className="naver-meta mt-1 block truncate">
          {post.boardSubject} · {postAuthor(post)}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-xs text-[#5f6872] sm:inline-flex">
        <Clock3 className="size-3.5" />
        {formatDate(post.wr_datetime)}
      </span>
    </Link>
  );
}

function toHomePosts(boards: Board[], postsByBoard: Array<{ board: Board; posts: WritePost[] }>, rewriteMode: BbsRewriteMode) {
  return postsByBoard.flatMap(({ board, posts }) =>
    posts.map((post) => ({
      ...post,
      bo_table: board.bo_table,
      bo_subject: board.bo_subject,
      boardHref: `/${board.bo_table}`,
      boardSubject: board.bo_subject,
      href: boardPostHref(board.bo_table, post, rewriteMode),
    }))
  );
}

async function fetchRuntimeHomePosts() {
  const [boards, settings] = await Promise.all([getBoards(), getClientPublicSettings()]);
  const rewriteMode = settings.cf_bbs_rewrite ?? 0;
  const boardsForPostFetch = boards.slice(0, HOME_BOARD_FETCH_LIMIT);
  const postsByBoard = await Promise.all(
    boardsForPostFetch.map(async (board) => ({
      board,
      posts: (await getBoardPosts({ boTable: board.bo_table, perPage: 10, revalidate: 0 })).list.filter(
        isPublicHomePost
      ),
    }))
  );
  const allPosts = toHomePosts(boardsForPostFetch, postsByBoard, rewriteMode);

  return {
    popularPosts: [...allPosts].sort((a, b) => postScore(b) - postScore(a)).slice(0, 7),
    latestPosts: [...allPosts].sort((a, b) => postTime(b) - postTime(a)).slice(0, 10),
  };
}

export function HomeCommunityHighlights({
  initialLatestPosts,
  initialPopularPosts,
}: HomeCommunityHighlightsProps) {
  const [latestPosts, setLatestPosts] = useState(initialLatestPosts);
  const [popularPosts, setPopularPosts] = useState(initialPopularPosts);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    let alive = true;

    fetchRuntimeHomePosts()
      .then((result) => {
        if (!alive) return;
        setLatestPosts(result.latestPosts);
        setPopularPosts(result.popularPosts);
      })
      .catch((error: unknown) => {
        // Keep the static build data when the live API is temporarily unavailable,
        // but report so the outage is observable instead of silently swallowed.
        console.error("[home:refresh-posts]", error);
      })
      .finally(() => {
        if (alive) setRefreshed(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const [leadPost, ...secondaryPosts] = popularPosts;

  if (popularPosts.length === 0 && latestPosts.length === 0) return null;

  return (
    <section className="site-container px-4 pt-6">
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="section-eyebrow">오늘의 그누보드</p>
          <h1 className="mt-1 text-[26px] font-black leading-[1.12] tracking-[-0.02em] text-[#18212c] md:text-[36px]">
            인기글과 최신글을 먼저 보여주는
            <br className="hidden sm:block" />
            <span className="text-primary"> 커뮤니티 홈</span>
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#5f6872] md:w-[360px]">
          <span className="metric-chip">
            <strong>{popularPosts.length}</strong>
            인기글
          </span>
          <span className="metric-chip">
            <strong>{latestPosts.length}</strong>
            최신글
          </span>
          <span className="metric-chip">
            <strong>{refreshed ? "실시간" : "빌드"}</strong>
            데이터
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="home-panel overflow-hidden">
          <SectionHeader eyebrow="조회 · 댓글 · 추천" title="인기글" href="/recent" />
          {leadPost && <FeaturedPostCard post={leadPost} />}
          <div className="grid border-t border-[#e7ece9] md:grid-cols-2">
            {secondaryPosts.slice(0, 4).map((post, index) => (
              <CompactTrendPost key={`${post.bo_table}-${post.wr_id}`} post={post} index={index} />
            ))}
          </div>
        </div>

        <div className="home-panel overflow-hidden">
          <SectionHeader eyebrow="최근 등록순" title="최신글" href="/recent" />
          <div className="divide-y divide-[#e7ece9]">
            {latestPosts.slice(0, 8).map((post) => (
              <LatestPostRow key={`${post.bo_table}-${post.wr_id}`} post={post} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
