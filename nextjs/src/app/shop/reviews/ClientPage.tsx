"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Star } from "lucide-react";
import type { ShopReview } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import type { ApiMeta } from "@/lib/api-response";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { cn, formatDate, truncate } from "@/lib/utils";
import { getShopReviews } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function plainText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function RatingDisplay({ score }: { score: number }) {
  const normalized = Math.max(0, Math.min(5, Number(score || 0)));

  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${normalized}점`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-3.5",
            index < normalized ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
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

export default function ShopReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const query = searchParams.get("q") || "";

  const [items, setItems] = useState<ShopReview[]>([]);
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
      const result = await getShopReviews({ page, perPage: 20, q: query });
      setItems(result.items);
      setMeta(result.meta);
    } catch (err: unknown) {
      setItems([]);
      setMeta(undefined);
      setErrorMessage(err instanceof Error ? err.message : "사용후기를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    return params;
  }, [query]);

  function moveTo(params: URLSearchParams) {
    runtimeRouterPush(router, `/shop/reviews${params.toString() ? `?${params}` : ""}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const nextQuery = searchText.trim();
    if (nextQuery) params.set("q", nextQuery);
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
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "사용후기" }]} />
      <div className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">사용후기</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            영카트 상품 사용후기 전체 목록입니다.
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

      <div className="min-h-5 text-sm text-muted-foreground">
        {totalLabel}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-28 rounded-[4px] border" />
          ))}
        </div>
      ) : errorMessage ? (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 py-16 text-center text-sm text-destructive">
          {errorMessage}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[4px] border py-16 text-center text-muted-foreground">
          등록된 사용후기가 없습니다.
        </div>
      ) : (
        <div className="divide-y rounded-[4px] border">
          {items.map((item) => (
            <article key={item.is_id} className="p-4 md:p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <Link
                    href={shopProductHref(item, productRewriteMode)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {item.it_name || item.it_id}
                  </Link>
                  <h2 className="mt-1 line-clamp-1 text-base font-bold">{item.is_subject}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <RatingDisplay score={Number(item.is_score || 0)} />
                  <span>{formatDate(item.is_time)}</span>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {truncate(plainText(item.is_content), 180)}
              </p>
              <div className="mt-3 text-xs text-muted-foreground">
                작성자 {item.mb_nick || item.is_name}
              </div>
            </article>
          ))}
        </div>
      )}

      <Pagination page={page} lastPage={meta?.last_page ?? 1} onPageChange={goToPage} />
    </div>
  );
}
