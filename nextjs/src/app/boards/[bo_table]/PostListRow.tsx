"use client";

import { createElement, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { MemberSideview } from "@/components/MemberSideview";
import { useThemeSlot } from "@/components/providers/ThemeSlotsProvider";
import type { WritePost } from "@/lib/types";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { g5ShortHref } from "@/lib/g5-short-url";
import { cn, formatDate, formatNumber } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;

/** 그누보드의 새글 표식: 등록 뒤 bo_new 시간 안. 0 이면 끈 것. */
export function isNewPost(post: WritePost, boNew: number): boolean {
  if (!boNew || !post.wr_datetime) return false;
  const written = new Date(post.wr_datetime.replace(" ", "T")).getTime();
  return Number.isFinite(written) && Date.now() - written < boNew * HOUR_MS;
}

/** 인기글 표식: 조회가 bo_hot 이상. 0 이면 끈 것. */
export function isHotPost(post: WritePost, boHot: number): boolean {
  return boHot > 0 && post.wr_hit >= boHot;
}

export type PostListRowProps = {
  post: WritePost;
  boTable: string;
  /** 번호 칸. 공지는 undefined. */
  number?: number;
  boNew?: number;
  boHot?: number;
  isVisited?: boolean;
  /** 글보기 아래 목록에서 지금 읽고 있는 글 */
  isCurrent?: boolean;
  bbsRewriteMode?: BbsRewriteMode;
  /** 관리자 일괄 선택 칸(체크박스). 있으면 첫 칸. */
  leading?: ReactNode;
  /** 키보드 이동(KeyboardNav)이 줄을 찾는 표식 */
  keyboardNavRow?: boolean;
};

/**
 * 목록의 글 한 줄. 무한 목록과 일괄 선택 목록이 같은 줄을 쓴다.
 * 테마가 BoardListRow 슬롯을 내면 데이터와 글쓴이 노드를 넘기고 <tr> 은 테마가 그린다.
 */
export function PostListRow({
  post,
  boTable,
  number,
  boNew = 0,
  boHot = 0,
  isVisited = false,
  isCurrent = false,
  bbsRewriteMode,
  leading,
  keyboardNavRow,
}: PostListRowProps) {
  const themeRow = useThemeSlot("BoardListRow");
  const isNotice = number === undefined;
  const href = boardPostHref(boTable, post, bbsRewriteMode);
  const replyDepth = post.wr_reply ? Math.min(post.wr_reply.length, 5) : 0;
  const categoryHref = post.ca_name
    ? g5ShortHref(`/boards/${encodeURIComponent(boTable)}?sca=${encodeURIComponent(post.ca_name)}`)
    : undefined;
  const author = (
    <MemberSideview
      mbId={post.mb_id}
      name={post.mb_nick || post.wr_name}
      email={post.wr_email}
      homepage={post.wr_homepage}
      iconUrl={post.mb_icon_path}
      boTable={boTable}
    />
  );

  if (themeRow) {
    return createElement(themeRow, {
      post,
      boTable,
      href,
      number,
      isNotice,
      isNew: !isNotice && isNewPost(post, boNew),
      isHot: !isNotice && isHotPost(post, boHot),
      isVisited,
      isCurrent,
      replyDepth,
      categoryHref,
      author,
      leading,
      rowProps: keyboardNavRow ? { "data-keyboard-nav-row": "" } : undefined,
    });
  }

  return (
    <tr
      data-keyboard-nav-row={keyboardNavRow ? "" : undefined}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "border-b transition-colors",
        isNotice ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50",
        isCurrent && "bg-muted/60"
      )}
    >
      {leading !== undefined ? <td className="px-2 py-3 text-center">{leading}</td> : null}
      <td className="px-4 py-3 text-muted-foreground">
        {isNotice ? (
          <Badge variant="destructive" className="text-xs">공지</Badge>
        ) : (
          number
        )}
      </td>
      <td className="px-4 py-3">
        <a
          href={href}
          className={cn(
            "hover:text-primary transition-colors",
            isNotice && "font-medium",
            isVisited && "text-muted-foreground"
          )}
          style={replyDepth ? { paddingLeft: `${replyDepth * 0.9}rem` } : undefined}
        >
          {replyDepth ? (
            <span className="board-reply-mark mr-1 text-muted-foreground" aria-label="답글">↳</span>
          ) : null}
          {post.wr_subject}
          {post.wr_comment > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">{post.wr_comment}</Badge>
          )}
          {post.ca_name ? <span className="board-row-category">{post.ca_name}</span> : null}
        </a>
      </td>
      <td className="board-col-author px-4 py-3 text-muted-foreground hidden md:table-cell">{author}</td>
      <td className="board-col-hit px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">
        {formatNumber(post.wr_hit)}
      </td>
      <td className="board-col-date px-4 py-3 text-center text-muted-foreground hidden md:table-cell whitespace-nowrap">
        {formatDate(post.wr_datetime)}
      </td>
    </tr>
  );
}
