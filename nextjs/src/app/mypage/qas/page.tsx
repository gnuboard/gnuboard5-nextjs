"use client";

import { useCallback, useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { HelpCircle, PenSquare } from "lucide-react";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { ApiMeta } from "@/lib/api-response";
import type { QaItem } from "@/lib/types";
import { cn, formatDate, truncate } from "@/lib/utils";
import { getQas } from "@/services/qas";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast";
import { MypagePanel } from "../MypagePanel";

function statusLabel(status: number) {
  return status === 1 ? "답변완료" : "답변대기";
}

function qaSearchField(value: string | null) {
  return value === "qa_content" || value === "qa_name" || value === "mb_id"
    ? value
    : "qa_subject";
}

export default function MyQasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const statusParam = searchParams.get("status");
  const status = statusParam === "0" || statusParam === "1" ? Number(statusParam) : "all";
  const sca = searchParams.get("sca") || undefined;
  const stx = searchParams.get("stx") || searchParams.get("q") || undefined;
  const sfl = qaSearchField(searchParams.get("sfl"));

  const [items, setItems] = useState<QaItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);

  const loadQas = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getQas({
        page,
        perPage: 20,
        status: status as 0 | 1 | "all",
        sca,
        sfl,
        stx,
      });
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      setItems([]);
      setMeta(undefined);
      toastError(error instanceof Error ? error.message : "1:1 문의를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, sca, sfl, status, stx]);

  useEffect(() => {
    loadQas();
  }, [loadQas]);

  function updateStatus(nextStatus: "all" | 0 | 1) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (nextStatus !== "all") params.set("status", String(nextStatus));
    else params.delete("status");
    runtimeRouterPush(router, `/mypage/qas${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    runtimeRouterPush(router, `/mypage/qas${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const lastPage = meta?.last_page ?? 1;

  return (
    <MypagePanel
      title="1:1 문의"
      description="문의를 남기고 답변 상태를 확인합니다."
      actions={
        <Button asChild>
          <Link href="/mypage/qas/new">
            <PenSquare className="mr-2 size-4" />
            문의하기
          </Link>
        </Button>
      }
    >
      <div className="g5-tabs flex gap-2 border-b">
        {[
          { value: "all" as const, label: "전체" },
          { value: 0 as const, label: "답변대기" },
          { value: 1 as const, label: "답변완료" },
        ].map((item) => (
          <button
            key={String(item.value)}
            type="button"
            onClick={() => updateStatus(item.value)}
            aria-pressed={status === item.value}
            className={cn(
              "g5-tab border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              status === item.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
        {meta && (
          <span className="ml-auto self-center text-xs text-muted-foreground">
            총 {meta.total.toLocaleString()}건
          </span>
        )}
      </div>

      <div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-20 rounded-md" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <HelpCircle className="mb-3 size-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 문의가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {items.map((item) => (
                <Link
                  key={item.qa_id}
                  href={`/mypage/qas/${item.qa_id}`}
                  className="block p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        item.qa_status === 1
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {statusLabel(item.qa_status)}
                    </span>
                    {item.qa_category && (
                      <span className="text-xs text-muted-foreground">
                        {item.qa_category}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.qa_datetime)}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm font-medium">
                    {item.qa_subject}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {truncate(item.qa_content.replace(/\s+/g, " "), 120)}
                  </p>
                </Link>
              ))}
            </div>
          )}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            이전
          </Button>
          <span className="px-2 text-sm text-muted-foreground">
            {page} / {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => goToPage(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </MypagePanel>
  );
}
