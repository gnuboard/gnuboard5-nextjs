"use client";

import { MemberAvatar } from "@/components/MemberAvatar";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { G5ThemeBoardViewHeaderProps } from "@/lib/theme-types";
import { formatNumber } from "@/lib/utils";

/** 레퍼런스 view.skin 의 시각 표기 — "2026. 09. 02. 18:24". */
function formatViewDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}. ${pad(date.getMonth() + 1)}. ${pad(date.getDate())}. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 레퍼런스 #bo_v 의 머리: 분류 칩 + 글 번호 눈썹, 큰 제목, 그 아래 작성자 바
 * (아바타 · 이름 · 시각 | 조회 · 댓글 · 공유 · 글 동작). 데이터와 동작은 앱이
 * 넘기고(author/actions/share), 여기서는 자리만 잡는다.
 */
export function SoluneBoardViewHeader({ post, boTable, boardName, listHref, author, actions, share }: G5ThemeBoardViewHeaderProps) {
  const name = (post.mb_nick || post.wr_name || "").trim();

  return (
    <>
      {/* 레퍼런스처럼 카드 위 줄: 게시판 이름과 목록 단추. */}
      <div className="solune-view-boardbar">
        <Link href={listHref || `/${boTable}`} className="solune-view-boardname">
          {boardName || boTable}
        </Link>
        <Link href={listHref || `/${boTable}`} className="solune-view-listbtn">
          목록
        </Link>
      </div>
      <header className="solune-view-head">
        <div className="solune-view-kicker-row">
          {post.ca_name ? <span className="solune-view-cate">{post.ca_name}</span> : null}
          <span className="solune-view-kicker">#{post.wr_id}</span>
        </div>
        <h1 className="solune-view-title">{post.wr_subject}</h1>
      </header>
      <div className="solune-view-info">
        <div className="solune-view-author">
          {/* 회원이미지(프로필 사진) → 회원아이콘 → 이니셜 — 앱 공용 아바타. 레퍼런스 view.skin 의 solune_member_avatar. */}
          <MemberAvatar name={name} member={post} className="solune-avatar solune-view-avatar" size={40} />
          <div className="solune-view-author-body">
            <strong>{author}</strong>
            <time dateTime={post.wr_datetime}>{formatViewDateTime(post.wr_datetime)}</time>
          </div>
        </div>
        <div className="solune-view-tools">
          <span className="solune-view-stat">
            조회 <b>{formatNumber(Number(post.wr_hit))}</b>
          </span>
          <span className="solune-view-stat">
            댓글 <b>{formatNumber(Number(post.wr_comment ?? 0))}</b>
          </span>
          {share}
          {actions}
        </div>
      </div>
    </>
  );
}
