"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LockKeyhole,
  MessageCircleQuestion,
  Search,
} from "lucide-react";
import type { ShopQA } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import type { ApiMeta } from "@/lib/api-response";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { cn, formatDate, truncate } from "@/lib/utils";
import { getShopQas } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function plainText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function StatusBadge({ answered }: { answered: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[4px] border px-2 text-xs font-semibold",
        answered
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {answered ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}
      {answered ? "답변완료" : "답변대기"}
    </span>
  );
}

function Pagination({
  page,
  lastPage,
  onPageChange,
}: {
  page: number;
  lastPage: number;
  onPageChange: (page: number) => void;
}) {
  if (lastPage <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(lastPage, page + 2);
  for (let next = start; next <= end; next++) pages.push(next);

  return (
    <div className="mt-8 flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="icon"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="이전 페이지"
      >
        <ChevronLeft className="size-4" />
      </Button>
      {start > 1 && (
        <>
          <Button variant="outline" size="sm" onClick={() => onPageChange(1)}>
            1
          </Button>
          {start > 2 && <span className="px-1 text-muted-foreground">...</span>}
        </>
      )}
      {pages.map((next) => (
        <Button
          key={next}
          variant={next === page ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(next)}
        >
          {next}
        </Button>
      ))}
      {end < lastPage && (
        <>
          {end < lastPage - 1 && <span className="px-1 text-muted-foreground">...</span>}
          <Button variant="outline" size="sm" onClick={() => onPageChange(lastPage)}>
            {lastPage}
          </Button>
        </>
      )}
      <Button
        variant="outline"
        size="icon"
        disabled={page >= lastPage}
        onClick={() => onPageChange(page + 1)}
        aria-label="다음 페이지"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export default function ShopQasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const query = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";

  const [items, setItems] = useState<ShopQA[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState(query);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);

  useEffect(() => {
    setSearchText(query);
  }, [query]);

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (alive) setProductRewriteMode(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const normalizedStatus =
        status === "answered" || status === "unanswered" ? status : "all";
      const result = await getShopQas({
        page,
        perPage: 20,
        q: query,
        status: normalizedStatus,
      });
      setItems(result.items);
      setMeta(result.meta);
    } catch (err: unknown) {
      setItems([]);
      setMeta(undefined);
      setErrorMessage(err instanceof Error ? err.message : "상품문의 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    return params;
  }, [query, status]);

  function moveTo(params: URLSearchParams) {
    runtimeRouterPush(router, `/shop/qas${params.toString() ? `?${params}` : ""}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const nextQuery = searchText.trim();
    if (nextQuery) params.set("q", nextQuery);
    if (status !== "all") params.set("status", status);
    moveTo(params);
  }

  function setStatus(nextStatus: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextStatus !== "all") params.set("status", nextStatus);
    moveTo(params);
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(baseParams.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    moveTo(params);
  }

  const totalLabel = meta
    ? `총 ${meta.total?.toLocaleString() ?? 0}건`
    : loading
      ? ""
      : "총 0건";

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "상품문의" }]} />
      <div className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">상품문의</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            영카트 상품문의 전체 목록입니다.
          </p>
        </div>
        <form className="flex gap-2" onSubmit={submitSearch}>
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="상품명, 제목, 내용"
            className="h-9 w-full md:w-72"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="size-4" />
            검색
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-h-5 text-sm text-muted-foreground">
          {totalLabel}
        </div>
        <div className="flex gap-2">
          {[
            ["all", "전체"],
            ["unanswered", "답변대기"],
            ["answered", "답변완료"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={status === value ? "default" : "outline"}
              onClick={() => setStatus(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-32 rounded-[4px] border" />
          ))}
        </div>
      ) : errorMessage ? (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 py-16 text-center text-sm text-destructive">
          {errorMessage}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[4px] border py-16 text-center text-muted-foreground">
          등록된 상품문의가 없습니다.
        </div>
      ) : (
        <div className="divide-y rounded-[4px] border">
          {items.map((item) => {
            const canView = item.can_view !== false;
            const answered = Boolean(item.is_answered || item.iq_answer);
            const question = canView
              ? truncate(plainText(item.iq_question), 180)
              : "비밀글은 작성자와 관리자만 확인할 수 있습니다.";
            const answer = canView ? truncate(plainText(item.iq_answer || ""), 160) : "";

            return (
              <article key={item.iq_id} className="p-4 md:p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={shopProductHref(item, productRewriteMode)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {item.it_name || item.it_id}
                    </Link>
                    <h2 className="mt-1 flex items-center gap-2 text-base font-bold">
                      {item.iq_secret ? <LockKeyhole className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="line-clamp-1">{item.iq_subject}</span>
                    </h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge answered={answered} />
                    <span className="text-xs text-muted-foreground">{formatDate(item.iq_time)}</span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {question}
                </p>
                {answer ? (
                  <div className="mt-3 rounded-[4px] border border-emerald-100 bg-emerald-50/60 p-3 text-sm leading-6 text-emerald-900">
                    <div className="mb-1 flex items-center gap-1.5 font-semibold">
                      <MessageCircleQuestion className="size-4" />
                      답변
                    </div>
                    {answer}
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-muted-foreground">
                  작성자 {item.mb_nick || item.iq_name}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination page={page} lastPage={meta?.last_page ?? 1} onPageChange={goToPage} />
    </div>
  );
}
