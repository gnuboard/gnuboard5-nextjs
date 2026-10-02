import { ArrowRight } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { boardPostHref } from "@/lib/board-url";
import { formatNumber, truncate } from "@/lib/utils";
import type { WritePost } from "@/lib/types";
import type { G5ThemeComponentProps } from "@/lib/theme-types";
import { SolunePostRowsSkeleton } from "./home-skeletons";
import { SoluneAuthor, soluneListDate } from "./home-meta";
import { isSecretPost } from "@/lib/post-flags";

type SoluneCommunityHome = NonNullable<G5ThemeComponentProps["communityHome"]>;
export type SolunePost = SoluneCommunityHome["latestPosts"][number];
export type SoluneBoardColumn = SoluneCommunityHome["boardPosts"][number];
export type SoluneRewriteMode = SoluneCommunityHome["bbsRewriteMode"];

export const BOARD_PANEL_LIMIT = 3;
export const BOARD_ROW_LIMIT = 5;

function boardHref(boardTable: string): string {
  return boardTable ? `/${boardTable}` : "/boards";
}

/* 레퍼런스 latest 스킨의 한 줄: [비밀 · 제목 · 댓글수] ………… [사진 · 이름 · 날짜]. 댓글수는 접두사
   없는 파란 숫자, 날짜는 오늘이면 시:분 아니면 월-일. 글쓴이는 제목 링크 밖에 두어 누르면 회원
   사이드뷰(쪽지 · 자기소개 · 전체게시물 …)가 열린다 — 링크 안에 단추를 넣을 수 없어서다. */
type PostRowPost = Pick<
  WritePost,
  "wr_subject" | "wr_comment" | "wr_datetime" | "wr_option" | "mb_id" | "mb_nick" | "wr_name" | "wr_email" | "wr_homepage" | "mb_icon_path"
>;

function PostRow({ href, post }: { href: string; post: PostRowPost }) {
  const comments = Number(post.wr_comment) || 0;
  const isSecret = isSecretPost(post);

  return (
    <li className="solune-latest-row">
      <Link href={href} className="solune-latest-subject">
        {isSecret ? <span className="solune-latest-badge">비밀</span> : null}
        <span className="solune-latest-text">{truncate(post.wr_subject || "제목 없음", 60)}</span>
        {comments > 0 ? (
          <span className="solune-latest-comment">{formatNumber(comments)}</span>
        ) : null}
      </Link>
      <span className="solune-latest-meta">
        <SoluneAuthor
          className="solune-latest-author"
          author={{
            mbId: post.mb_id,
            name: post.mb_nick || post.wr_name || "",
            email: post.wr_email,
            homepage: post.wr_homepage,
            iconUrl: post.mb_icon_path,
          }}
        />
        <time dateTime={post.wr_datetime}>{soluneListDate(post.wr_datetime)}</time>
      </span>
    </li>
  );
}

/* 정적 빌드처럼 초기 글이 비어 있는 동안에는 빈 상태 문구 대신 행 모양을 유지한다.
   첫 요청이 끝난 뒤 실제로 글이 없으면 아래의 빈 상태 문구를 보여 준다. */
export function BoardPanel({
  column,
  rewriteMode,
  loading = false,
}: {
  column: SoluneBoardColumn;
  rewriteMode?: SoluneRewriteMode;
  loading?: boolean;
}) {
  const table = column.board.bo_table;
  const posts = column.posts.slice(0, BOARD_ROW_LIMIT);

  return (
    <section className="solune-reference-panel" aria-labelledby={`solune-board-${table}`}>
      <div className="solune-panel-head">
        <h2 id={`solune-board-${table}`} className="solune-panel-title">
          {column.board.bo_subject || table}
        </h2>
        {/* 같은 글자의 링크가 패널마다 있어 글자 자체에 게시판을 넣는다(Lighthouse link-text 는
            aria-label 이 아니라 링크 글자를 본다). 보이는 글자는 그대로. */}
        <Link href={boardHref(table)} className="solune-panel-more">
          <span className="sr-only">{column.board.bo_subject || table} </span>더보기
          <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
        </Link>
      </div>
      <div className="solune-panel-body">
        {posts.length > 0 ? (
          <ul className="solune-latest-list">
            {posts.map((post) => (
              <PostRow key={`${table}-${post.wr_id}`} href={boardPostHref(table, post, rewriteMode)} post={post} />
            ))}
          </ul>
        ) : loading ? (
          <SolunePostRowsSkeleton rows={BOARD_ROW_LIMIT} />
        ) : (
          <p className="solune-empty">아직 등록된 글이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

export function LatestPanel({ posts, loading = false }: { posts: SolunePost[]; loading?: boolean }) {
  return (
    <section className="solune-reference-panel" aria-labelledby="solune-latest-heading">
      <div className="solune-panel-head">
        <h2 id="solune-latest-heading" className="solune-panel-title">
          최근 게시글
        </h2>
        <Link href="/recent" className="solune-panel-more">
          <span className="sr-only">최근 게시글 </span>더보기
          <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
        </Link>
      </div>
      <div className="solune-panel-body">
        {posts.length > 0 ? (
          <ul className="solune-latest-list">
            {posts.map((post) => (
              <PostRow key={`${post.bo_table}-${post.wr_id}`} href={post.href} post={post} />
            ))}
          </ul>
        ) : loading ? (
          <SolunePostRowsSkeleton rows={BOARD_ROW_LIMIT} />
        ) : (
          <p className="solune-empty">표시할 최근 글이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
