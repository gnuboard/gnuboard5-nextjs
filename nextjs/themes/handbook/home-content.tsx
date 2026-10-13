"use client";

import { ArrowRight, BookOpen, ChevronRight, Clock, Search } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { g5ShortHref } from "@/lib/g5-short-url";
import { formatDate } from "@/lib/utils";
import { useHandbookDocs, useHandbookHomeTexts } from "./docs-context";
import { docsIndexPath, type DocsBook, type DocsChapter } from "./docs-nav";

const RECENT_COUNT = 5;

type RecentChapter = { book: DocsBook; part: string; chapter: DocsChapter };

/**
 * 최근에 추가한 장 — 모든 매뉴얼에서 작성 시각이 늦은 순. 목록 API 는 수정 시각(wr_last)을 주지 않아
 * "고친 장"은 알 수 없다(그래서 제목도 "추가한 장"이다).
 */
function recentlyAdded(books: DocsBook[]): RecentChapter[] {
  return books
    .flatMap((book) =>
      book.groups.flatMap((group) => group.items.map((chapter) => ({ book, part: group.label, chapter })))
    )
    .filter((entry) => entry.chapter.date)
    .sort((a, b) => (b.chapter.date ?? "").localeCompare(a.chapter.date ?? ""))
    .slice(0, RECENT_COUNT);
}

function Hero({
  name,
  description,
  first,
  indexPath,
}: {
  name: string;
  description: string;
  /** 첫 매뉴얼 목차의 첫 장 — 글 순서가 아니라 목차(분류) 순서의 첫 장. */
  first?: DocsChapter;
  indexPath: string;
}) {
  return (
    <section className="doc-hero" aria-labelledby="hero-heading">
      <span className="doc-eyebrow">
        <BookOpen size={13} aria-hidden />
        매뉴얼
      </span>
      {/* data-ts — 정적 빌드는 브리지가 관리자 문구로 바꿔 내보낸다(layout-shell.tsx ShellFooter 설명). */}
      <h1 id="hero-heading" className="doc-hero-title" data-ts="homeTitle">
        {name}
      </h1>
      <p className="doc-hero-lead" data-ts="homeDescription">
        {description}
      </p>
      <div className="doc-hero-actions">
        {first ? (
          <Link href={first.href} className="btn btn-primary gap-1.5 rounded-lg">
            <ArrowRight size={16} aria-hidden />
            {first.label}부터 읽기
          </Link>
        ) : null}
        <Link href={g5ShortHref(indexPath)} className="btn btn-outline gap-1.5 rounded-lg">
          전체 목차
          <ChevronRight size={15} aria-hidden />
        </Link>
        <Link href="/search" className="btn btn-ghost gap-1.5 rounded-lg">
          <Search size={15} aria-hidden />
          문서 검색
        </Link>
      </div>
    </section>
  );
}

/** 책 한 권이 카드 하나. 개수만 세지 않고 묶음 이름을 보여 준다 —
 *  독자가 "내가 읽을 쪽이 어느 것인지" 표지에서 바로 고를 수 있어야 한다. */
function BookSection({ books }: { books: DocsBook[] }) {
  if (books.length === 0) return null;

  return (
    <section className="doc-section" aria-labelledby="books-heading">
      <div className="doc-section-head">
        <span className="doc-section-eyebrow">CONTENTS</span>
        <h2 id="books-heading" className="doc-section-title">
          어느 쪽부터 읽을까요
        </h2>
        <p className="doc-section-desc">처음이라면 첫 권부터 차례로 보세요.</p>
      </div>

      <div className="doc-feature-grid">
        {books.map((book) => (
          <article key={book.table} className="doc-feature-card">
            <h3 className="doc-feature-title">
              {book.label}
              <span className="doc-guide-meta"> · {book.count}장</span>
            </h3>
            <p className="doc-feature-desc">{book.hint}</p>
            <ul className="doc-guide-list">
              {book.groups.map((group, groupIndex) => (
                <li key={`${group.label}:${groupIndex}`} className="doc-guide-row">
                  <Link href={group.items[0]?.href ?? "#"} className="doc-guide-title">
                    {group.label}
                  </Link>
                  <span className="doc-guide-meta"> {group.items.length}장</span>
                </li>
              ))}
            </ul>
            <Link href={g5ShortHref(`/boards/${book.table}`)} className="doc-guide-title">
              전체 목차 보기 →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

/** 목차를 받는 동안 보이는 빈 카드 수 — 넓은 화면 두 줄. */
const PLACEHOLDER_CARDS = 6;

/**
 * 목차를 받는 동안의 자리. 정적 빌드는 빌드 때 목차를 싣지 않아 화면에 붙은 뒤 받는데, 자리를 비워 두면 책 목록이 들어오며
 * 바닥글이 밀렸다(레이아웃 이동). 카드 모양으로 화면 높이만큼 자리를 잡아 바닥글을 처음부터 화면 아래에 둔다.
 * 서버 실행은 서버가 목차를 넘겨 이 자리를 그리지 않는다.
 */
function BooksPlaceholder() {
  return (
    <section className="doc-section doc-books-placeholder" aria-busy="true" aria-label="매뉴얼 목록을 불러오는 중">
      <div className="doc-feature-grid" aria-hidden>
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
          <div key={index} className="doc-placeholder-card" />
        ))}
      </div>
    </section>
  );
}

function RecentSection({ books }: { books: DocsBook[] }) {
  const recent = recentlyAdded(books);
  if (recent.length === 0) return null;

  return (
    <section className="doc-section" aria-labelledby="recent-heading">
      <div className="doc-section-head">
        <span className="doc-section-eyebrow">
          <Clock size={12} aria-hidden /> NEW
        </span>
        <h2 id="recent-heading" className="doc-section-title">
          최근 추가한 장
        </h2>
      </div>

      <div className="doc-panel doc-panel-pad">
        <ul className="doc-guide-list">
          {recent.map(({ book, part, chapter }, index) => (
            <li key={`${book.table}:${chapter.id}`} className="doc-guide-row">
              <span className="doc-guide-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="doc-guide-body">
                <Link href={chapter.href} className="doc-guide-title">
                  {chapter.label}
                </Link>
                <p className="doc-guide-meta">
                  {[book.label, part, formatDate(chapter.date ?? "")].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * 매뉴얼 표지. 읽을 거리는 전부 매뉴얼 게시판에서 오므로, 글을 더 쓰면 표지도 따라 바뀐다.
 * 책 · 장은 셸이 읽은 목차(useHandbookDocs)를 쓴다 — 사이드바와 같은 목차다. 정적 빌드는 빌드 때 목차를
 * 싣지 않아(설치마다 데이터가 다르다) 예전에는 표지가 늘 "아직 등록된 문서가 없습니다"였다. 이제 화면에 붙은 뒤
 * 셸이 받은 목차로 채운다. 그래서 목차를 다 받기 전(settled 전)에는 "없습니다"를 띄우지 않는다.
 */
export function HandbookHomeContent({ name, description }: { name: string; description: string }) {
  const { books, settled } = useHandbookDocs();
  // 관리자 › 테마 화면 설정의 첫 화면 제목 · 소개(없으면 서버가 넘긴 테마 기본값).
  const homeTexts = useHandbookHomeTexts();

  return (
    <div className="doc-content">
      <Hero
        name={homeTexts?.title ?? name}
        description={homeTexts?.description ?? description}
        first={books[0]?.groups[0]?.items[0]}
        indexPath={docsIndexPath(books)}
      />
      {books.length === 0 ? (
        settled ? <p className="doc-empty">아직 등록된 문서가 없습니다.</p> : <BooksPlaceholder />
      ) : (
        <>
          <BookSection books={books} />
          <RecentSection books={books} />
        </>
      )}
    </div>
  );
}
