"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { g5ShortHref } from "@/lib/g5-short-url";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ErrorState";
import { useAuthStore } from "@/store/auth";
import { RecentList } from "./RecentList";
import { RecentSearchPanel } from "./RecentSearchPanel";
import { getRecentGroups, getRecentItems, type RecentResult } from "@/services/recent";
import type { RecentGroup } from "@/lib/types";

const PAGE_SIZE = 15;

/**
 * 새글(그누보드 bbs/new.php). 레퍼런스 skin/new/basic 처럼 제목 옆 건수 한 줄, 접히는 상세검색,
 * 그룹 · 게시판 · 제목 · 이름 · 일시 표와 페이지 넘김을 한 카드에 둔다. 관리자는 선택 삭제를 쓴다.
 */
export default function ClientPage() {
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const view: "" | "w" | "c" = rawView === "w" || rawView === "c" ? rawView : "";
  const grId = searchParams.get("gr_id") || "";
  const mbId = searchParams.get("mb_id") || "";
  // 사이드뷰 "전체게시물"은 아이디 대신 회원 공개 키(?mb=)로 온다(services/member memberRecentPath).
  const mbKey = mbId ? "" : searchParams.get("mb") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<RecentGroup[]>([]);
  const [result, setResult] = useState<RecentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getRecentItems({ view, grId, mbId, mbKey, page, limit: PAGE_SIZE }), getRecentGroups()])
      .then(([items, groupList]) => {
        if (cancelled) return;
        setResult(items);
        setGroups(groupList);
      })
      .catch((err) => {
        if (cancelled) return;
        setResult(null);
        setError(err instanceof Error ? err.message : "새글을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, grId, mbId, mbKey, page, reloadKey]);

  const items = result?.items ?? [];
  const displayError = error || result?.error || "";
  const lastPage = Math.max(1, result?.lastPage ?? 1);

  return (
    <div className="recent-page container mx-auto space-y-5 px-4 py-6">
      <Breadcrumb items={[{ label: "새글" }]} />
      <div className="recent-head flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <h1 className="text-2xl font-bold">새글</h1>
        {result && (
          <p className="recent-summary text-sm text-muted-foreground">
            전체 <strong className="font-bold text-foreground">{result.total.toLocaleString()}</strong>건 ·{" "}
            {page.toLocaleString()} / {lastPage.toLocaleString()} 페이지
          </p>
        )}
      </div>

      <RecentSearchPanel groups={groups} view={view} grId={grId} mbId={mbId} mbKey={mbKey} />

      {displayError && <ErrorState title="새글을 불러오지 못했습니다" description={displayError} actionHref="/recent" />}

      {loading && !result && (
        <div role="status" aria-label="새글 로딩 중" className="overflow-hidden rounded-lg border">
          <span className="sr-only">새글 로딩 중</span>
          <div aria-hidden="true" className="divide-y">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-3.5">
                <div className="skeleton hidden h-4 w-16 rounded md:block" />
                <div className="skeleton hidden h-4 w-20 rounded md:block" />
                <div className="skeleton h-4 min-w-0 flex-1 rounded" />
                <div className="skeleton h-4 w-20 shrink-0 rounded" />
                <div className="skeleton h-4 w-10 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <RecentList
          items={items}
          isAdmin={!!user && user.mb_level >= 10}
          myMbId={user?.mb_id ?? ""}
          filtered={Boolean(view || grId || mbId || mbKey)}
          onDeleted={reload}
          footer={
            lastPage > 1 ? (
              <div className="recent-pagination flex justify-center border-t px-4 py-4">
                <Pagination
                  currentPage={Math.min(page, lastPage)}
                  totalPages={lastPage}
                  baseUrl={g5ShortHref("/recent")}
                  searchParams={{ gr_id: grId || undefined, view: view || undefined, mb_id: mbId || undefined, mb: mbKey || undefined }}
                />
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}
