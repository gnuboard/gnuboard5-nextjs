"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { MemberSideview } from "@/components/MemberSideview";
import { apiClient } from "@/lib/api";
import { g5ShortHref } from "@/lib/g5-short-url";
import { toastError, toastSuccess } from "@/lib/toast";
import type { RecentItem } from "@/lib/types";

interface RecentListProps {
  items: RecentItem[];
  /** 관리자(mb_level 10)면 전체선택 · 선택 삭제 줄을 낸다(그누보드 new.php 와 같다). */
  isAdmin: boolean;
  /** 로그인한 회원 아이디 — 내가 쓴 글에 "내 글" 표를 단다. */
  myMbId: string;
  filtered: boolean;
  /** 삭제한 뒤 목록을 다시 받는다. */
  onDeleted: () => void;
  /** 카드 맨 아래(페이지 넘김) */
  footer?: React.ReactNode;
}

function formatRecentDate(datetime: string): string {
  if (!datetime) return "";
  const date = datetime.substring(0, 10);
  const today = new Date().toISOString().substring(0, 10);
  return date === today ? datetime.substring(11, 16) : datetime.substring(5, 10);
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0] : "·";
}

/**
 * 새글 목록. 레퍼런스(skin/new/basic)처럼 도구 줄 · 표 · 페이지 넘김을 테두리 하나 안에 둔다.
 * 표는 그룹 · 게시판 · 제목 · 이름 · 일시. 댓글은 "댓글", 내가 쓴 것은 "내 글" 표를 단다.
 * 좁은 칸에서는 CSS(컨테이너 질의)가 같은 마크업을 카드 목록으로 다시 앉힌다.
 */
export function RecentList({ items, isAdmin, myMbId, filtered, onDeleted, footer }: RecentListProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const allChecked = items.length > 0 && selected.size === items.length;

  const toggle = (bnId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bnId)) next.delete(bnId);
      else next.add(bnId);
      return next;
    });

  const deleteSelected = async () => {
    const targets = items.filter((item) => selected.has(item.bn_id));
    if (targets.length === 0) return;
    if (!confirm(`선택한 ${targets.length}개의 게시물을 정말 삭제하시겠습니까?\n\n한번 삭제한 자료는 복구할 수 없습니다.`)) return;
    setDeleting(true);
    let count = 0;
    for (const item of targets) {
      try {
        // 댓글은 댓글 API, 글은 글 API 로 지운다(글을 지우면 딸린 댓글도 함께 지워진다).
        await apiClient.delete(item.is_comment ? `/comments/${item.bo_table}/${item.wr_id}` : `/posts/${item.bo_table}/${item.wr_id}`);
        count++;
      } catch {
        // 이미 지워졌거나 권한이 없는 것은 건너뛰고 나머지를 지운다.
      }
    }
    setDeleting(false);
    setSelected(new Set());
    if (count > 0) toastSuccess(`${count}개의 게시물을 삭제했습니다.`);
    else toastError("삭제하지 못했습니다.");
    onDeleted();
  };

  return (
    <div className={`recent-card overflow-hidden rounded-lg border bg-card${isAdmin ? " has-tools" : ""}`}>
      {isAdmin && (
        <div className="recent-tools flex items-center justify-between gap-3 border-b px-4 py-3">
          <label className="recent-checkall flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="recent-chk"
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && !allChecked;
              }}
              onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((item) => item.bn_id)))}
            />
            <span>전체선택</span>
          </label>
          <button
            type="button"
            className="recent-del inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold text-destructive disabled:cursor-default disabled:opacity-60"
            disabled={selected.size === 0 || deleting}
            onClick={deleteSelected}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {deleting ? "삭제 중..." : "선택 삭제"}
          </button>
        </div>
      )}
      <table className="recent-table w-full text-sm">
        <thead>
          <tr>
            {isAdmin && (
              <th scope="col" className="recent-th-chk">
                <span className="sr-only">선택</span>
              </th>
            )}
            <th scope="col" className="recent-th-group">그룹</th>
            <th scope="col" className="recent-th-board">게시판</th>
            <th scope="col" className="recent-th-subject">제목</th>
            <th scope="col" className="recent-th-name">이름</th>
            <th scope="col" className="recent-th-date">일시</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={isAdmin ? 6 : 5} className="recent-empty py-14 text-center text-muted-foreground">
                {filtered ? "조건에 맞는 게시물이 없습니다." : "게시물이 없습니다."}
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.bn_id}>
                {isAdmin && (
                  <td className="recent-td-chk">
                    <input
                      type="checkbox"
                      className="recent-chk"
                      checked={selected.has(item.bn_id)}
                      onChange={() => toggle(item.bn_id)}
                      aria-label={`${item.wr_subject} 선택`}
                    />
                  </td>
                )}
                <td className="recent-td-group">
                  <a href={g5ShortHref(`/recent?gr_id=${encodeURIComponent(item.gr_id)}`)}>{item.gr_subject}</a>
                </td>
                <td className="recent-td-board">
                  <a href={g5ShortHref(`/boards/${item.bo_table}`)}>{item.bo_subject}</a>
                </td>
                <td className="recent-td-subject">
                  {item.is_comment && <span className="recent-tag recent-tag-comment">댓글</span>}
                  <a href={g5ShortHref(item.href)} className="recent-title">
                    {item.wr_subject}
                  </a>
                  {myMbId && item.mb_id === myMbId && <span className="recent-tag recent-tag-mine">내 글</span>}
                </td>
                <td className="recent-td-name">
                  {/* 레퍼런스 new.php 처럼 이름을 누르면 회원 사이드뷰(쪽지 · 자기소개 · 전체게시물 …)가 열린다. */}
                  <MemberSideview
                    mbId={item.mb_id}
                    name={item.wr_name}
                    email={item.wr_email}
                    homepage={item.wr_homepage}
                    className="recent-writer"
                  >
                    <span className="recent-initial" aria-hidden>
                      {initialOf(item.wr_name)}
                    </span>
                    <span className="recent-name">{item.wr_name}</span>
                  </MemberSideview>
                </td>
                <td className="recent-td-date">
                  <time dateTime={item.wr_datetime} title={item.wr_datetime}>
                    {formatRecentDate(item.wr_datetime)}
                  </time>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
