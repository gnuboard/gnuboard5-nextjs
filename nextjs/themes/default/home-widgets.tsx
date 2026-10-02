import { ArrowRight, ChevronDown, ChevronRight, Search } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { MemberSideview } from "@/components/MemberSideview";
import dynamic from "next/dynamic";
import { GalleryThumbnail } from "@/app/boards/[bo_table]/GalleryThumbnail";
import { boardPostHref } from "@/lib/board-url";
import { formatDate, formatNumber, truncate } from "@/lib/utils";
import type { FaqItem, RecentItem } from "@/lib/types";
import type { PopularKeyword, VisitStats } from "@/lib/schemas";
import type { SoluneGallery } from "./home-data";
import { SoluneCommentRowsSkeleton, SolunePopularRowsSkeleton } from "./home-skeletons";
import { SoluneAuthor, soluneListDate } from "./home-meta";

/* FAQ 답은 HTML 정화기(sanitize-html, 약 180KB)를 거친다. 이 파일은 사이드 레일을 거쳐 모든 화면에
   들어가므로 FAQ 를 그릴 때 받는다 — 답은 접혀 있어 처음부터 보이지 않는다. */
// loading 을 꼭 준다 — next/dynamic 은 SSR 을 켜 두고 loading 이 없으면 제 Suspense 경계를 만들지 않아,
// 이 조각을 받는 동안 페이지 전체(게시판 · 갤러리까지)가 함께 기다렸다(정화기만 5초 늦추자 홈이 5.6초에 떴다).
const SafeHtml = dynamic(() => import("@/components/SafeHtml").then((m) => m.SafeHtml), {
  loading: () => null,
});

const GALLERY_PANEL_LIMIT = 8;
/*
 * 갤러리 첫 줄(4단 중 한 줄)은 홈에서 가장 큰 그림이라 LCP 요소가 여기서 나온다. 기본값인
 * lazy 로 두면 브라우저가 배치를 마친 뒤에야 받기 시작해 늦는다 — 첫 줄만 eager +
 * fetchPriority=high 로 올린다(GalleryThumbnail 의 priority). 둘째 줄은 화면 밖이라 그대로 둔다.
 */
const GALLERY_PANEL_PRIORITY = 4;

/**
 * FAQ 본문은 관리자가 에디터로 넣은 HTML 인데, 이 설치의 데이터처럼 한 번 더
 * 이스케이프돼 저장된 행이 섞여 있다. 그대로 정제기에 넘기면 태그가 글자로
 * 그려져 패널이 소스 코드 덩어리가 된다. `&lt;` 가 보이면 한 번만 되돌린다.
 * (`&amp;` 를 마지막에 처리해야 이중 복원이 생기지 않는다.)
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function faqHtml(content: string): string {
  return content.includes("&lt;") ? decodeEntities(content) : content;
}

/** 질문 줄은 한 줄 텍스트 자리다. 태그가 들어 있으면 벗겨서 글만 남긴다. */
function faqSubject(subject: string): string {
  const decoded = faqHtml(subject);
  if (!decoded.includes("<")) return decoded;
  return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** 레퍼런스는 댓글 목록에서 날짜를 MM-DD 로만 보여 준다. */
function shortDate(value: string): string {
  const formatted = formatDate(value);
  const match = formatted.match(/(\d{1,2})[-./](\d{1,2})\s*$/);
  return match ? `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : formatted;
}

export function SoluneCommentWidget({
  comments,
  loading = false,
}: {
  comments: RecentItem[];
  loading?: boolean;
}) {
  return (
    <section className="solune-sidebar-widget solune-comment-widget" aria-labelledby="solune-comment-title">
      <header className="solune-sidebar-widget-head">
        <h2 id="solune-comment-title">최근 댓글</h2>
        <Link href="/recent?view=c" className="solune-sidebar-head-link">
          전체 <ChevronRight size={12} aria-hidden />
        </Link>
      </header>
      <div className="solune-sidebar-widget-body">
        {comments.length > 0 ? (
          <ul className="solune-comment-list">
            {comments.map((comment) => (
              <li key={comment.bn_id || `${comment.bo_table}-${comment.wr_id}`}>
                {/* 작성자는 댓글 링크 밖 — 누르면 회원 사이드뷰가 열린다. */}
                <div className="solune-comment-link">
                  {/* 레퍼런스처럼 댓글 본문을 보인다. 비밀댓글·읽을 수 없는 게시판이면 API 가 요약을 주지 않아
                      글 제목으로 대신한다. 링크의 #c_번호 로 글 보기 화면이 그 댓글로 옮겨 간다. */}
                  <Link href={comment.href} className="solune-comment-excerpt">
                    {truncate(comment.comment_excerpt || comment.wr_subject || "내용 없음", 46)}
                  </Link>
                  <span className="solune-comment-meta">
                    <span className="solune-comment-board">{comment.bo_subject}</span>
                    <MemberSideview
                      mbId={comment.mb_id}
                      name={comment.wr_name || comment.mb_id}
                      email={comment.wr_email}
                      homepage={comment.wr_homepage}
                      className="solune-comment-name"
                    >
                      {comment.wr_name || comment.mb_id}
                    </MemberSideview>
                    <time dateTime={comment.wr_datetime}>{shortDate(comment.wr_datetime)}</time>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : loading ? (
          <SoluneCommentRowsSkeleton rows={6} />
        ) : (
          <p className="solune-empty">아직 등록된 댓글이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

export function SolunePopularKeywordWidget({
  keywords,
  loading = false,
}: {
  keywords: PopularKeyword[];
  loading?: boolean;
}) {
  return (
    <section className="solune-sidebar-widget solune-popular-widget" aria-labelledby="solune-popular-title">
      <header className="solune-sidebar-widget-head">
        <h2 id="solune-popular-title">인기검색어</h2>
        <Link href="/search" className="solune-sidebar-head-link" aria-label="통합 검색">
          <Search size={12} aria-hidden />
          <span className="solune-sidebar-head-label">검색</span>
        </Link>
      </header>
      <div className="solune-sidebar-widget-body">
        {keywords.length > 0 ? (
          <ol className="solune-popular-list">
            {keywords.map((keyword, index) => (
              <li key={keyword.pp_word}>
                <Link
                  href={`/search?q=${encodeURIComponent(keyword.pp_word)}`}
                  className="solune-popular-item"
                >
                  <span className="solune-popular-rank" aria-hidden>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="solune-popular-word">{keyword.pp_word}</span>
                  <ChevronRight size={13} aria-hidden className="solune-popular-caret" />
                </Link>
              </li>
            ))}
          </ol>
        ) : loading ? (
          <SolunePopularRowsSkeleton rows={5} />
        ) : (
          <p className="solune-empty">최근 검색 기록이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

export function SoluneVisitWidget({ visit }: { visit: VisitStats }) {
  const ratio = visit.max > 0 ? Math.round((visit.today / visit.max) * 100) : 0;

  return (
    <section className="solune-sidebar-widget solune-visit-widget" aria-labelledby="solune-visit-title">
      <header className="solune-sidebar-widget-head">
        <h2 id="solune-visit-title">접속자집계</h2>
        <span className="solune-sidebar-status">
          <i aria-hidden />
          실시간
        </span>
      </header>
      <div className="solune-sidebar-widget-body">
        <dl className="solune-visit-stats">
          <div className="solune-visit-lead">
            <dt>오늘</dt>
            <dd>
              <strong className="solune-visit-figure">{formatNumber(visit.today)}</strong>
            </dd>
          </div>
          <div className="solune-visit-peak">
            <dt>최대</dt>
            <dd>
              <span className="solune-visit-peak-value">{formatNumber(visit.max)}</span>
              <span
                className="solune-visit-bar"
                role="img"
                aria-label={`오늘 접속자는 최고 기록 대비 ${ratio}%`}
              >
                <span style={{ width: `${Math.min(100, ratio)}%` }} />
              </span>
              <span className="solune-visit-caption">
                오늘은 최고 기록의 <b>{ratio}%</b>
              </span>
            </dd>
          </div>
          <div className="solune-visit-cell">
            <dt>어제</dt>
            <dd>{formatNumber(visit.yesterday)}</dd>
          </div>
          <div className="solune-visit-cell">
            <dt>전체</dt>
            <dd>{formatNumber(visit.total)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function SoluneFaqPanel({ faqs }: { faqs: FaqItem[] }) {
  return (
    <section className="solune-reference-panel solune-faq-panel" aria-labelledby="solune-faq-heading">
      <div className="solune-panel-head">
        <h2 id="solune-faq-heading" className="solune-panel-title">
          자주 묻는 질문
        </h2>
        <Link href="/faq" className="solune-panel-more">
          더보기
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
      <div className="solune-faq-list">
        {faqs.map((faq, index) => (
          // name 을 공유하는 <details> 라 아코디언처럼 하나만 열린다 (레퍼런스와 같다).
          <details key={faq.fa_id} name="solune-faq" className="solune-faq-item" open={index === 0}>
            <summary className="solune-faq-q">
              <span className="solune-faq-badge" aria-hidden>
                Q
              </span>
              <span className="solune-faq-subject">{faqSubject(faq.fa_subject)}</span>
              <ChevronDown size={15} className="solune-faq-chevron" aria-hidden />
            </summary>
            {/* 앱의 /faq 페이지와 같은 정책으로 정제한다. */}
            <SafeHtml className="solune-faq-a" html={faqHtml(faq.fa_content)} policy="commerce" />
          </details>
        ))}
      </div>
    </section>
  );
}

export function SoluneGalleryPanel({
  gallery,
  rewriteMode,
}: {
  gallery: SoluneGallery;
  rewriteMode?: number | string | null;
}) {
  const table = gallery.board.bo_table;

  return (
    <section className="solune-reference-panel solune-gallery-panel" aria-labelledby="solune-gallery-heading">
      <div className="solune-panel-head">
        <h2 id="solune-gallery-heading" className="solune-panel-title">
          {gallery.board.bo_subject || "갤러리"}
        </h2>
        <Link href={`/${table}`} className="solune-panel-more">
          <span className="sr-only">{gallery.board.bo_subject || "갤러리"} </span>더보기
          <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
        </Link>
      </div>
      <div className="solune-panel-body">
        <ul className="solune-gallery-grid">
          {/* 레퍼런스처럼 4단 두 줄(8장). 공지가 섞여 오면 줄이 하나 더 생겨 칸이 빈다. */}
          {gallery.posts.slice(0, GALLERY_PANEL_LIMIT).map((post, index) => {
            const comments = Number(post.wr_comment) || 0;
            const thumbnail = post.thumbnail || post.images?.[0] || "";
            return (
              <li className="solune-gallery-item" key={`${table}-${post.wr_id}`}>
                <Link href={boardPostHref(table, post, rewriteMode)} className="solune-gallery-link">
                  <span className="solune-gallery-thumb">
                    {/* 게시판 갤러리와 같은 컴포넌트 — 깨진 썸네일은 아이콘으로 대체된다. */}
                    <GalleryThumbnail
                      src={thumbnail}
                      alt={post.wr_subject || ""}
                      sizes="(max-width: 48rem) 45vw, 200px"
                      priority={index < GALLERY_PANEL_PRIORITY}
                    />
                  </span>
                  <span className="solune-gallery-subject">
                    {truncate(post.wr_subject || "제목 없음", 60)}
                    {comments > 0 ? (
                      <span className="solune-gallery-comment">
                        <span className="sr-only">댓글 </span>
                        {formatNumber(comments)}
                      </span>
                    ) : null}
                  </span>
                </Link>
                {/* 레퍼런스 갤러리 카드: 사진(없으면 회색 기본 얼굴) · 이름 · 날짜.
                    작성자는 글 링크 밖에 두어 누르면 회원 사이드뷰가 열린다. */}
                <span className="solune-gallery-meta">
                  <SoluneAuthor
                    className="solune-gallery-writer"
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
          })}
        </ul>
      </div>
    </section>
  );
}
