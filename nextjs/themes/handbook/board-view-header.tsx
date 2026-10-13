"use client";

import { Badge } from "@/components/ui/badge";
import { CardHeader } from "@/components/ui/card";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { G5ThemeBoardViewHeaderProps } from "@/lib/theme-types";
import { formatDate, formatNumber } from "@/lib/utils";
import { chapterNumberLabel, chapterPositionById } from "./book-nav";
import { bookIndexHref } from "./book-selector";
import { useHandbookDocs } from "./docs-context";

/**
 * 글 보기 머리. 배치는 슬롯이 없을 때 앱이 그리는 머리(boards/[bo_table]/[wr_id]/ClientPage.tsx)와
 * 같고, 글이 매뉴얼의 장이면 제목 위에 "매뉴얼 / 부 · 02 / 24장" 한 줄을 더한다. 장은 주소가 아니라
 * 글 번호로 찾으므로 정적 빌드의 주소 꼴과 상관없이 서버 · 브라우저가 같은 줄을 그린다.
 */
export function HandbookBoardViewHeader({ post, boTable, author, actions, share }: G5ThemeBoardViewHeaderProps) {
  const { books } = useHandbookDocs();
  const book = books.find((candidate) => candidate.table === boTable);
  const position = book ? chapterPositionById(book, Number(post.wr_id)) : null;

  return (
    <CardHeader className="space-y-4">
      {position ? (
        <p className="doc-chapter-position">
          <Link href={bookIndexHref(position.book)}>{position.book.label}</Link>
          <span aria-hidden>/</span>
          <span>{position.part}</span>
          <span className="doc-chapter-position-count">
            {chapterNumberLabel(position.number)} / {position.total}장
          </span>
        </p>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold leading-tight">{post.wr_subject}</h1>
        {actions}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {author}
        <span>{formatDate(post.wr_datetime)}</span>
        <span>조회 {formatNumber(Number(post.wr_hit))}</span>
        {post.ca_name ? <Badge variant="outline">{post.ca_name}</Badge> : null}
        {share}
      </div>
    </CardHeader>
  );
}
