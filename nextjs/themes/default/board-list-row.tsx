"use client";

import Image from "next/image";
import type { G5ThemeBoardListRowProps } from "@/lib/theme-types";
import { shouldBypassImageOptimization } from "@/lib/image";
import { cn, formatDate, formatNumber } from "@/lib/utils";

/**
 * 레퍼런스 list.skin 의 .cb-row: [번호 레일] [분류 칩 · 제목 · 댓글 수 · 표식] [아바타 · 이름] [조회] [날짜].
 * 앱의 <table> 안에 서는 <tr> 이라 머리글 칸 수(5, 선택 칸이 있으면 6)를 그대로 맞춘다.
 * 새글/인기 표식과 방문 여부는 앱이 판정해서 넘기고, 여기서는 그리기만 한다.
 * 폰 폭에서는 theme.internal.css 가 이 줄을 격자로 바꿔 글쓴이·조회·날짜를 제목 아래로 접는다.
 */
export function SoluneBoardListRow({
  post,
  href,
  number,
  isNotice,
  isNew,
  isHot,
  isVisited,
  isCurrent,
  replyDepth,
  categoryHref,
  author,
  leading,
  rowProps,
}: G5ThemeBoardListRowProps) {
  const name = post.mb_nick || post.wr_name || "";
  const initial = name.trim().charAt(0) || "?";

  return (
    <tr
      {...rowProps}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "solune-blr",
        leading !== undefined && "has-check",
        isNotice && "is-notice",
        isVisited && "is-visited",
        isCurrent && "is-current"
      )}
    >
      {leading !== undefined ? <td className="solune-blr-check">{leading}</td> : null}
      <td className="solune-blr-rail">
        {isNotice ? (
          <span className="solune-blr-flag is-new">공지</span>
        ) : isCurrent ? (
          <span className="solune-blr-no is-current">열람중</span>
        ) : (
          <span className="solune-blr-no">{number}</span>
        )}
      </td>
      <td className="solune-blr-body">
        <span className="solune-blr-title-line">
          {post.ca_name ? (
            categoryHref ? (
              <a href={categoryHref} className="solune-blr-cat">{post.ca_name}</a>
            ) : (
              <span className="solune-blr-cat">{post.ca_name}</span>
            )
          ) : null}
          <a
            href={href}
            className="solune-blr-title"
            style={replyDepth ? { paddingLeft: `${replyDepth * 0.9}rem` } : undefined}
          >
            {replyDepth ? (
              <span className="solune-blr-reply" aria-label="답글">↳</span>
            ) : null}
            {post.wr_subject}
          </a>
          {post.wr_comment > 0 ? (
            <span className="solune-blr-cmt">
              <span className="sr-only">댓글 </span>
              {post.wr_comment}
              <span className="sr-only">개</span>
            </span>
          ) : null}
          {isNew ? (
            <span className="solune-blr-flag is-new">NEW</span>
          ) : isHot ? (
            <span className="solune-blr-flag is-hot">HOT</span>
          ) : null}
        </span>
      </td>
      <td className="solune-blr-author">
        <span className="solune-blr-avatar" aria-hidden="true">
          {post.mb_icon_path ? (
            <Image
              src={post.mb_icon_path}
              alt=""
              width={24}
              height={24}
              unoptimized={shouldBypassImageOptimization(post.mb_icon_path)}
            />
          ) : (
            initial
          )}
        </span>
        <span className="solune-blr-name">{author}</span>
      </td>
      <td className="solune-blr-hit">
        <span className="sr-only">조회 </span>
        {formatNumber(post.wr_hit)}
      </td>
      <td className="solune-blr-date">{formatDate(post.wr_datetime)}</td>
    </tr>
  );
}
