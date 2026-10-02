"use client";

import type { CSSProperties } from "react";
import { Check, Copy, Eye, FolderInput, ImageIcon, Lock, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/MemberAvatar";
import { MemberSideview } from "@/components/MemberSideview";
import type { WritePost } from "@/lib/types";
import { boardPostHref, type BbsRewriteMode } from "@/lib/board-url";
import { g5ShortHref } from "@/lib/g5-short-url";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { BatchTransferDialog } from "./BatchTransferDialog";
import { GalleryThumbnail } from "./GalleryThumbnail";
import { isHotPost, isNewPost } from "./PostListRow";
import { useBatchSelection } from "./useBatchSelection";

/** 목록 API 가 갤러리 카드용으로 붙여 주는 두 줄 발췌(평문). 비밀글은 빈 값. */
type GalleryPost = WritePost & { wr_excerpt?: string };

/**
 * 칸 너비는 카드 최소 232px 를 지키며 스스로 접히고, 게시판 설정(bo_gallery_cols)은 "한 줄 최대 칸 수"로 쓴다.
 * 사이드 레일이 있는 본문(≈ 870px)에서 4칸이면 카드가 200px 아래로 줄어 제목 · 발췌가 뭉개진다.
 * 폰 폭은 2칸 — 한 칸으로 접으면 사진만 큰 목록이 되어 훑어보는 맛이 사라진다.
 */
const GRID_CLASS =
  "gallery-grid grid grid-cols-2 gap-3.5 md:gap-[1.375rem] " +
  "md:[grid-template-columns:repeat(auto-fill,minmax(max(232px,calc((100%_-_(var(--gallery-cols)_-_1)_*_1.375rem)_/_var(--gallery-cols))),1fr))]";

interface GalleryPostGridProps {
  boTable: string;
  notices: WritePost[];
  posts: WritePost[];
  /** 게시판 설정의 한 줄 칸 수(최대값으로 쓴다) */
  cols: number;
  bbsRewriteMode?: BbsRewriteMode;
  boNew?: number;
  boHot?: number;
  /** 글보기 아래 목록일 때 지금 읽고 있는 글 */
  currentWrId?: number;
}

/**
 * 갤러리 게시판 목록(레퍼런스 gallery list.skin 의 .cb-gallery).
 * 관리자에게는 늘 떠 있는 선택 작업바 + 사진 위 선택 상자, 공지는 격자 맨 앞에 "공지" 표식 카드로 선다.
 */
export function GalleryPostGrid({
  boTable,
  notices,
  posts,
  cols,
  bbsRewriteMode,
  boNew = 0,
  boHot = 0,
  currentWrId,
}: GalleryPostGridProps) {
  const cards = [...notices, ...posts];
  const selection = useBatchSelection(boTable, cards.map((p) => p.wr_id));
  const visibleCards = cards.filter((p) => !selection.deletedIds.has(p.wr_id));

  return (
    <>
      {selection.isAdmin && <GallerySelectionBar selection={selection} />}

      <div className={GRID_CLASS} style={{ "--gallery-cols": Math.max(1, cols) } as CSSProperties}>
        {visibleCards.map((post, index) => (
          <GalleryCard
            key={post.wr_id}
            post={post}
            boTable={boTable}
            href={boardPostHref(boTable, post, bbsRewriteMode)}
            isNotice={!!post.is_notice}
            isNew={!post.is_notice && isNewPost(post, boNew)}
            isHot={!post.is_notice && isHotPost(post, boHot)}
            isCurrent={post.wr_id === currentWrId}
            priority={index < 3}
            sizes={`(max-width: 768px) 50vw, ${Math.ceil(100 / Math.max(2, Math.min(cols, 3)))}vw`}
            selectable={selection.isAdmin}
            isSelected={selection.selected.has(post.wr_id)}
            onToggle={() => selection.toggleOne(post.wr_id)}
          />
        ))}
      </div>

      <BatchTransferDialog
        mode={selection.transferMode}
        boTable={boTable}
        wrIds={[...selection.selected]}
        onClose={() => selection.setTransferMode(null)}
        onDone={selection.handleTransferDone}
      />
    </>
  );
}

/** 늘 떠 있는 선택 작업바. 버튼이 나타났다 사라지면 줄 높이가 흔들리므로 고른 것이 없을 때는 끈다. */
function GallerySelectionBar({ selection }: { selection: ReturnType<typeof useBatchSelection> }) {
  const count = selection.selected.size;
  const busy = count === 0 || selection.deleting;

  return (
    <div
      role="region"
      aria-label="선택한 게시물 작업"
      className={cn(
        "gallery-selbar flex flex-wrap items-center justify-between gap-2 rounded-[14px] border bg-card px-4 py-2.5 shadow-sm transition-colors",
        count > 0 && "is-open border-primary bg-primary/5",
      )}
    >
      <label className="flex cursor-pointer items-center gap-2.5 text-[0.78rem] font-semibold text-muted-foreground">
        <input
          type="checkbox"
          checked={selection.allSelected}
          onChange={selection.toggleAll}
          className="h-4 w-4 cursor-pointer rounded accent-primary"
          aria-label="현재 페이지 게시물 전체선택"
        />
        {count > 0 ? (
          <span className="font-bold text-primary" aria-live="polite">{count}개 글을 선택했습니다</span>
        ) : (
          <span>전체선택</span>
        )}
      </label>
      <div className="gallery-selbar-actions flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={selection.handleBatchDelete} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" />
          {selection.deleting ? "삭제 중..." : "선택삭제"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => selection.setTransferMode("copy")} disabled={busy}>
          <Copy className="h-3.5 w-3.5" />
          선택복사
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => selection.setTransferMode("move")} disabled={busy}>
          <FolderInput className="h-3.5 w-3.5" />
          선택이동
        </Button>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={selection.clearSelection}>
            해제
          </Button>
        )}
      </div>
    </div>
  );
}

interface GalleryCardProps {
  post: GalleryPost;
  boTable: string;
  href: string;
  isNotice: boolean;
  isNew: boolean;
  isHot: boolean;
  isCurrent: boolean;
  priority: boolean;
  sizes: string;
  selectable: boolean;
  isSelected: boolean;
  onToggle: () => void;
}

function GalleryCard({
  post,
  boTable,
  href,
  isNotice,
  isNew,
  isHot,
  isCurrent,
  priority,
  sizes,
  selectable,
  isSelected,
  onToggle,
}: GalleryCardProps) {
  const name = post.mb_nick || post.wr_name || "";
  const flag = isNotice ? "공지" : isNew ? "NEW" : isHot ? "HOT" : null;

  return (
    <article
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "gallery-card group relative flex min-w-0 flex-col rounded-[14px] border bg-card text-card-foreground shadow-sm",
        "transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-within:-translate-y-0.5",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0",
        isNotice && "is-notice",
        isSelected && "is-selected border-primary",
        isCurrent && "is-current border-primary",
      )}
    >
      <div className="gallery-card-media relative aspect-[16/10] overflow-hidden rounded-t-[13px] bg-muted">
        {/* 사진과 제목이 같은 글로 간다 — 사진 링크는 탭 순서에서 빼 같은 곳을 두 번 지나지 않게 한다. */}
        <a href={href} tabIndex={-1} aria-hidden="true" className="block h-full w-full">
          {post.thumbnail ? (
            <GalleryThumbnail src={post.thumbnail} alt="" sizes={sizes} priority={priority} />
          ) : (
            <span className="gallery-card-noimg flex h-full w-full items-center justify-center text-muted-foreground/40">
              {post.is_secret ? <Lock className="h-7 w-7" /> : <ImageIcon className="h-8 w-8" />}
            </span>
          )}
        </a>

        {selectable && (
          <label className="gallery-card-check absolute left-2.5 top-2.5 z-[2] grid h-[22px] w-[22px] cursor-pointer place-items-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              aria-label={`${isNotice ? "공지 " : ""}선택: ${post.wr_subject}`}
              className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[7px] border-[1.6px] border-white bg-white/35 shadow-[0_1px_3px_rgba(16,24,40,0.25)] transition-colors hover:bg-white/60 checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Check className="pointer-events-none relative h-3.5 w-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
          </label>
        )}

        {(flag || post.wr_comment > 0) && (
          <span className="gallery-card-badges absolute bottom-2.5 right-2.5 z-[2] flex items-center gap-1.5">
            {flag && (
              <span
                className={cn(
                  "gallery-card-flag inline-flex h-5 items-center rounded-lg px-2 text-[10.5px] font-extrabold",
                  flag === "HOT" ? "is-hot bg-[#b42318] text-white" : "bg-primary text-primary-foreground",
                )}
              >
                {flag}
              </span>
            )}
            {post.wr_comment > 0 && (
              <span className="gallery-card-cmt inline-flex h-5 items-center gap-1 rounded-lg bg-[rgba(20,24,31,0.72)] px-2 text-[10.5px] font-bold text-white">
                <MessageCircle className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">댓글 </span>
                {post.wr_comment}
                <span className="sr-only">개</span>
              </span>
            )}
          </span>
        )}
      </div>

      <div className="gallery-card-body flex min-w-0 flex-1 flex-col gap-1.5 p-3 md:gap-2 md:px-4 md:pb-3.5 md:pt-4">
        {post.ca_name && (
          <a
            href={g5ShortHref(`/boards/${encodeURIComponent(boTable)}?sca=${encodeURIComponent(post.ca_name)}`)}
            className="gallery-card-cat self-start rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
          >
            {post.ca_name}
          </a>
        )}
        <h3 className="gallery-card-title text-[0.84rem] font-semibold leading-normal tracking-[-0.015em] md:text-[0.94rem]">
          <a href={href} className="line-clamp-2 transition-colors hover:text-primary focus-visible:text-primary">
            {post.is_secret && <Lock className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-muted-foreground" aria-label="비밀글" />}
            {post.wr_subject}
          </a>
        </h3>
        {post.wr_excerpt ? (
          <p className="gallery-card-excerpt hidden text-[0.8rem] leading-[1.65] text-muted-foreground md:line-clamp-2">
            {post.wr_excerpt}
          </p>
        ) : null}
        <GalleryCardFoot post={post} boTable={boTable} name={name} />
      </div>
    </article>
  );
}

/** 발자취 줄: [아바타 · 글쓴이] ······ [조회 · 날짜]. 얇은 선 하나로 본문과 뗀다. */
function GalleryCardFoot({ post, boTable, name }: { post: GalleryPost; boTable: string; name: string }) {
  return (
    <div className="gallery-card-foot mt-auto flex items-center justify-between gap-1.5 border-t pt-2 text-xs text-muted-foreground md:gap-2.5 md:pt-3">
      <span className="gallery-card-author flex min-w-0 items-center gap-1.5">
        <MemberAvatar
          name={name}
          member={post}
          size={20}
          className="gallery-card-avatar grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary md:h-5 md:w-5"
        />
        <MemberSideview
          mbId={post.mb_id}
          name={name}
          email={post.wr_email}
          homepage={post.wr_homepage}
          boTable={boTable}
          className="min-w-0 truncate"
        />
      </span>
      <span className="gallery-card-meta flex flex-none items-center gap-2.5 tabular-nums">
        {/* 좁은 칸에서는 글쓴이(회원 메뉴 손잡이)를 남기고 덜 쓰이는 조회 수를 접는다. */}
        <span className="gallery-card-hit hidden items-center gap-1 md:inline-flex">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">조회 </span>
          {formatNumber(post.wr_hit)}
        </span>
        <time dateTime={post.wr_datetime?.replace(" ", "T")}>{formatDate(post.wr_datetime)}</time>
      </span>
    </div>
  );
}
