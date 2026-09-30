import { serverSiteName } from "@/lib/site-name";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Suspense } from "react";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { ChevronRight, Flame, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, truncate } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image";
import { buildPageMetadata } from "@/lib/seo";
import { buildCommunityHomeData } from "@/lib/community-home";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { themeComponents, themeConfig } from "@/lib/theme";
import { HomeCommunityHighlights } from "../HomeCommunityHighlights";
import { HomeShopSections } from "../HomeShopSections";
import type {
  G5ThemeBoardPreview as BoardPreview,
  G5ThemeHomePost as HomePost,
} from "@/lib/theme-types";
import type { Board, WritePost } from "@/lib/types";

const HOME_TITLE = themeConfig.site.homeTitle ?? "커뮤니티";

/** 사이트 이름은 설치본마다 다르다(cf_title) — site-name.ts 참고. */
export async function generateMetadata() {
  const siteName = await serverSiteName();
  const title = HOME_TITLE === siteName ? HOME_TITLE : `${HOME_TITLE} — ${siteName}`;

  return {
    ...buildPageMetadata({
      title,
      description:
        themeConfig.site.homeDescription
        ?? `${siteName} 커뮤니티의 최신글, 인기글, 게시판 소식을 빠르게 확인하세요.`,
      path: "/",
    }),
    // 사이트명을 이미 넣었으므로 루트 틀(`%s — 사이트명`)을 거치지 않는다 — 거치면 "커뮤니티 — 사이트명 — 사이트명".
    // 공유용 og · twitter 제목에는 틀이 붙지 않아 위 문자열 그대로가 맞다.
    title: { absolute: title },
  };
}

function postAuthor(post: HomePost | WritePost) {
  return post.mb_nick || post.wr_name || "작성자";
}

const HOME_CACHE_SCOPE = [
  process.env.G5_THEME_SOURCE || themeConfig.name,
  process.env.G5_NEXT_BASE_PATH || process.env.NEXT_PUBLIC_APP_URL || "",
].join(":");

const getHomeData = unstable_cache(
  () => buildCommunityHomeData(),
  ["home-page-data", HOME_CACHE_SCOPE],
  { revalidate: 30 }
);

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

function BoardPostRow({
  board,
  post,
  bbsRewriteMode,
}: {
  board: Board;
  post: WritePost;
  bbsRewriteMode?: BbsRewriteMode;
}) {
  const href = boardPostHref(board.bo_table, post, bbsRewriteMode);

  return (
    <Link href={href} className="group board-post-row">
      {(post.thumbnail || post.images?.[0]) && (
        <Thumb post={post} className="size-12 shrink-0 rounded-[6px]" sizes="48px" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#2d3540] group-hover:text-primary">
          {truncate(post.wr_subject, 48)}
          {Number(post.wr_comment) > 0 && (
            <Badge variant="secondary" className="ml-1 align-middle">
              {post.wr_comment}
            </Badge>
          )}
        </span>
        <span className="naver-meta mt-1 block truncate">
          {postAuthor(post)} · {formatDate(post.wr_datetime)}
        </span>
      </span>
    </Link>
  );
}

function BoardPreviewCard({
  board,
  posts,
  bbsRewriteMode,
}: BoardPreview & { bbsRewriteMode?: BbsRewriteMode }) {
  return (
    <section className="board-preview-card">
      <SectionHeader title={board.bo_subject} href={`/${board.bo_table}`} />

      {posts.length === 0 ? (
        <div className="empty-soft">등록된 게시글이 없습니다.</div>
      ) : (
        <div className="divide-y divide-[#edf0ee]">
          {posts.slice(0, 8).map((post) => (
            <BoardPostRow key={post.wr_id} board={board} post={post} bbsRewriteMode={bbsRewriteMode} />
          ))}
        </div>
      )}
    </section>
  );
}

function BoardPreviewGrid({
  boardPosts,
  bbsRewriteMode,
}: {
  boardPosts: BoardPreview[];
  bbsRewriteMode?: BbsRewriteMode;
}) {
  return (
    <section className="site-container px-4 pt-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="text-xl font-black text-[#1f2933]">게시판 모아보기</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {boardPosts.map(({ board, posts }) => (
          <BoardPreviewCard
            key={board.bo_table}
            board={board}
            posts={posts}
            bbsRewriteMode={bbsRewriteMode}
          />
        ))}
      </div>
    </section>
  );
}

function CommunityQuickBand() {
  const links = [
    { href: "/boards", label: "전체 게시판", desc: "게시판 목록" },
    { href: "/recent", label: "최신글", desc: "새 글 모아보기" },
    { href: "/polls", label: "투표", desc: "진행 중인 투표" },
    { href: "/faq", label: "FAQ", desc: "자주 묻는 질문" },
  ];

  return (
    <section className="site-container px-4 pt-5">
      <div className="quick-band">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[6px] bg-[#eafaf1] text-primary">
            <Flame className="size-5" />
          </span>
          <div>
            <p className="text-sm font-black text-[#1f2933]">그누보드 바로가기</p>
            <p className="text-xs text-[#5f6872]">커뮤니티 핵심 메뉴를 빠르게 이동합니다.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="quick-link">
              <span>
                <strong>{link.label}</strong>
                <small>{link.desc}</small>
              </span>
              <ChevronRight className="size-4" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

async function DefaultHomePage() {
  const { boardPosts, latestPosts, popularPosts, bbsRewriteMode } = await getHomeData();

  return (
    <div className="naver-shell pb-12">
      <HomeCommunityHighlights initialLatestPosts={latestPosts} initialPopularPosts={popularPosts} />
      <CommunityQuickBand />
      <BoardPreviewGrid boardPosts={boardPosts} bbsRewriteMode={bbsRewriteMode} />
      <HomeShopSections />
    </div>
  );
}

async function ThemedHomeContent() {
  const communityHome = await getHomeData();
  const ThemeHomePage = themeComponents.HomePage;

  if (!ThemeHomePage) return null;
  return <ThemeHomePage config={themeConfig} communityHome={communityHome} />;
}

export default function HomePage() {
  if (themeComponents.HomePage) {
    const content = <ThemedHomeContent />;
    const Loading = themeComponents.HomePageLoading;

    return Loading ? <Suspense fallback={<Loading />}>{content}</Suspense> : content;
  }

  return <DefaultHomePage />;
}
