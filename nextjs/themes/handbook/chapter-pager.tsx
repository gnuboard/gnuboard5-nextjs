"use client";

import { ArrowLeft, ArrowRight, ListTree } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { DocsBook } from "./docs-nav";
import { chapterPositionByPath } from "./book-nav";
import { bookIndexHref } from "./book-selector";

/**
 * 글 아래의 앞뒤 장 이동. 부 경계를 넘어 매뉴얼 전체 순서로 잇고, 마지막 장의 "다음"
 * 자리에는 이 매뉴얼 목차로 가는 링크를 둔다. 지금 주소가 매뉴얼의 장이 아니면 그리지 않는다.
 */
export function ChapterPager({ book, path }: { book?: DocsBook; path: string }) {
  if (!book) return null;
  const position = chapterPositionByPath(book, path);
  if (!position) return null;

  return (
    <nav className="doc-pager container mx-auto px-4" aria-label="앞뒤 장">
      {position.prev ? (
        <Link href={position.prev.href} className="doc-pager-link">
          <span className="doc-pager-dir">
            <ArrowLeft size={14} aria-hidden />
            이전 장
          </span>
          <span className="doc-pager-title" title={position.prev.label}>
            {position.prev.label}
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
      {position.next ? (
        <Link href={position.next.href} className="doc-pager-link is-next">
          <span className="doc-pager-dir">
            다음 장
            <ArrowRight size={14} aria-hidden />
          </span>
          <span className="doc-pager-title" title={position.next.label}>
            {position.next.label}
          </span>
        </Link>
      ) : (
        <Link href={bookIndexHref(book)} className="doc-pager-link is-next">
          <span className="doc-pager-dir">
            마지막 장입니다
            <ListTree size={14} aria-hidden />
          </span>
          <span className="doc-pager-title">{book.label} 목차로</span>
        </Link>
      )}
    </nav>
  );
}
