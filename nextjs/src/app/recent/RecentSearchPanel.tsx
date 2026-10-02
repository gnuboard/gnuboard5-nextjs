"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { RecentGroup } from "@/lib/types";

interface RecentSearchPanelProps {
  groups: RecentGroup[];
  view: "" | "w" | "c";
  grId: string;
  mbId: string;
  /** 사이드뷰 "전체게시물"로 온 회원 공개 키(?mb=). 아이디 칸이 비어 있는 동안 검색해도 이 회원 조건을 지킨다. */
  mbKey: string;
}

/**
 * 새글 상세검색(그누보드 new.php 의 fnew 폼, 레퍼런스 skin/new/basic). 머리줄을 누르면 접고 편다.
 * 그룹 · 검색대상(전체게시물 · 원글만 · 코멘트만) · 회원 아이디를 고르고 [검색]을 누르면 주소가 바뀐다.
 * 레퍼런스는 회원 아이디가 필수라 그룹만으로는 거를 수 없었는데, 여기서는 빈 칸이면 그 조건을 뺀다.
 */
export function RecentSearchPanel({ groups, view, grId, mbId, mbKey }: RecentSearchPanelProps) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState({ grId, view, mbId });

  // 주소가 바뀌면(페이지 이동 · 뒤로 가기) 칸도 따라간다.
  useEffect(() => {
    setDraft({ grId, view, mbId });
  }, [grId, view, mbId]);

  const go = (keepMemberKey: boolean) => {
    const params = new URLSearchParams();
    if (draft.grId) params.set("gr_id", draft.grId);
    if (draft.view) params.set("view", draft.view);
    if (draft.mbId.trim()) params.set("mb_id", draft.mbId.trim());
    else if (keepMemberKey && mbKey) params.set("mb", mbKey);
    const qs = params.toString();
    runtimeRouterPush(router, qs ? `/recent?${qs}` : "/recent");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    go(true);
  };

  // 회원 키로 거른 목록이면 아이디 칸은 비어 있다 — 무엇으로 걸렀는지 알리고 풀 수 있게 한다.
  const showMemberKeyFilter = Boolean(mbKey) && !draft.mbId.trim();

  return (
    <fieldset className="recent-search rounded-lg border bg-card">
      <legend className="sr-only">상세검색</legend>
      <button
        type="button"
        className="recent-search-head flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="recent-search-title text-sm font-bold">상세검색</span>
        <span className="recent-search-aside flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="recent-search-hint">회원 아이디로 검색할 수 있습니다</span>
          <ChevronDown className="recent-search-chevron h-4 w-4" aria-hidden />
        </span>
      </button>
      <form
        id={formId}
        hidden={!open}
        onSubmit={submit}
        className="recent-search-form grid items-end gap-3 border-t px-4 pb-4 pt-2 sm:grid-cols-3"
      >
        <label className="recent-field flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">그룹</span>
          <select
            value={draft.grId}
            onChange={(event) => setDraft((prev) => ({ ...prev, grId: event.target.value }))}
            className="h-10 rounded-md border bg-background px-2.5 text-sm"
          >
            <option value="">전체그룹</option>
            {groups.map((group) => (
              <option key={group.gr_id} value={group.gr_id}>
                {group.gr_subject}
              </option>
            ))}
          </select>
        </label>
        <label className="recent-field flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">검색대상</span>
          <select
            value={draft.view}
            onChange={(event) => setDraft((prev) => ({ ...prev, view: event.target.value as "" | "w" | "c" }))}
            className="h-10 rounded-md border bg-background px-2.5 text-sm"
          >
            <option value="">전체게시물</option>
            <option value="w">원글만</option>
            <option value="c">코멘트만</option>
          </select>
        </label>
        <div className="recent-field flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${formId}-mb`} className="text-xs font-semibold text-muted-foreground">
            회원 아이디
          </label>
          <div className="recent-search-field flex min-w-0 gap-1.5">
            <input
              id={`${formId}-mb`}
              type="text"
              value={draft.mbId}
              onChange={(event) => setDraft((prev) => ({ ...prev, mbId: event.target.value }))}
              placeholder="회원 아이디"
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            />
            <button type="submit" className="recent-search-submit h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
              검색
            </button>
          </div>
          {showMemberKeyFilter ? (
            <p className="recent-search-member text-xs text-muted-foreground">
              선택한 회원의 글만 보는 중 ·{" "}
              <button type="button" className="font-semibold text-foreground underline" onClick={() => go(false)}>
                해제
              </button>
            </p>
          ) : null}
        </div>
      </form>
    </fieldset>
  );
}
