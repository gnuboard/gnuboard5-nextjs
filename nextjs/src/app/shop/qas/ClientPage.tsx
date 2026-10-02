"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import type { ShopQA } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import type { ApiMeta } from "@/lib/api-response";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { cn } from "@/lib/utils";
import { getShopQas } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { SafeHtml } from "@/components/SafeHtml";
import { Button } from "@/components/ui/button";

/*
 * 상품문의 전체 목록 — 그누보드 shop/itemqalist.php(레퍼런스 solune 스킨)과 같은 짜임.
 *   검색 줄(항목 고르기 · 검색어 · 검색) → "전체 N건 | 전체보기" → 문의 하나가 한 줄인 접는 목록
 *   (상품 사진 · 상품명 · 제목 · 비밀글 자물쇠 · 답변대기/답변완료 · 작성자 · 날짜, 오른쪽 펴기 단추)
 *   → 펴면 Q 문의 내용 · A 답변 · 문의 바로가기 · 상품 보기 → 쪽 번호.
 *   비밀글은 글쓴이 · 관리자만 내용을 보고(API 의 can_view), 그 밖에는 안내 한 줄만 두고 답변 칸은 내지 않는다.
 */

/** 그누보드 itemqalist 의 검색 항목(sfl). API 가 같은 이름을 받는다. */
const SEARCH_FIELDS = [
  { value: "i.it_name", label: "상품명" },
  { value: "q.it_id", label: "상품코드" },
  { value: "q.iq_subject", label: "문의제목" },
  { value: "q.iq_question", label: "문의내용" },
  { value: "q.iq_name", label: "작성자명" },
  { value: "q.mb_id", label: "작성자아이디" },
] as const;
const DEFAULT_SEARCH_FIELD = SEARCH_FIELDS[0].value;
const PER_PAGE = 15;

function qaDate(value: string): string {
  return (value || "").slice(0, 10);
}

/** "문의 바로가기" — 상품 상세에서 이 문의로(레퍼런스 item.php?iq_id= — 그 문의가 실린 쪽을 열고 그 줄로 데려가 잠깐 표시). */
function qaHref(productHref: string, iqId: string | number): string {
  return `${productHref}${productHref.includes("?") ? "&" : "?"}iq_id=${encodeURIComponent(String(iqId))}`;
}

function ProductThumb({ src }: { src?: string }) {
  return (
    <span className="block size-12 flex-none overflow-hidden rounded-lg bg-muted" aria-hidden="true">
      {src ? (
        <img src={src} alt="" width={48} height={48} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

function QaMark({ kind }: { kind: "Q" | "A" }) {
  return (
    <span
      className={cn(
        "grid size-6 flex-none place-items-center rounded-full text-xs font-bold",
        kind === "A" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"
      )}
      aria-hidden="true"
    >
      {kind}
    </span>
  );
}

function QaItem({ item, productHref }: { item: ShopQA; productHref: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-qa`;
  const secret = Number(item.iq_secret || 0) === 1;
  const canView = item.can_view !== false;
  const answered = Boolean(item.is_answered ?? item.iq_answer);

  return (
    <li className={cn("shop-qa-item overflow-hidden rounded-xl border bg-card", open && "is-open")}>
      <button
        type="button"
        className="flex w-full items-center gap-3.5 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:px-5"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <ProductThumb src={item.product_image_url} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs text-muted-foreground">{item.it_name || item.it_id}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium leading-snug text-pretty">
              {item.iq_subject}
              {secret ? (
                <>
                  <Lock className="ml-1 inline size-3 -translate-y-px text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only"> 비밀글</span>
                </>
              ) : null}
            </span>
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                answered ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {answered ? "답변완료" : "답변대기"}
            </span>
          </span>
          <span className="mt-1.5 text-xs text-muted-foreground">
            <span className="sr-only">작성자 </span>
            {item.iq_name || item.mb_nick}
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="sr-only">작성일 </span>
            {qaDate(item.iq_time)}
          </span>
        </span>
        <span
          className="grid size-7 flex-none place-items-center rounded-full border text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </span>
      </button>

      <div id={panelId} hidden={!open} className="flex flex-col gap-4 border-t bg-muted/30 px-4 pb-5 pt-4 md:px-5">
        <div className="flex gap-3">
          <QaMark kind="Q" />
          <span className="sr-only">문의내용</span>
          {canView ? (
            <SafeHtml
              html={item.iq_question}
              policy="content"
              className="prose prose-sm min-w-0 flex-1 max-w-none dark:prose-invert [&_img]:h-auto [&_img]:max-w-full [&_p]:my-0"
            />
          ) : (
            <p className="text-sm text-muted-foreground">비밀글로 보호된 문의입니다.</p>
          )}
        </div>
        {canView ? (
          <div className="flex gap-3">
            <QaMark kind="A" />
            <span className="sr-only">답변</span>
            {answered ? (
              <SafeHtml
                html={item.iq_answer || ""}
                policy="content"
                className="prose prose-sm min-w-0 flex-1 max-w-none dark:prose-invert [&_img]:h-auto [&_img]:max-w-full [&_p]:my-0"
              />
            ) : (
              <p className="text-sm text-muted-foreground">답변이 등록되지 않았습니다.</p>
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 pl-9 text-[13px]">
          <Link href={qaHref(productHref, item.iq_id)} className="text-foreground/75 underline underline-offset-[3px] hover:text-primary">
            문의 바로가기<span className="sr-only"> — {item.iq_subject}</span>
          </Link>
          <Link href={productHref} className="text-foreground/75 underline underline-offset-[3px] hover:text-primary">
            상품 보기
          </Link>
        </div>
      </div>
    </li>
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
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="쪽 번호">
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
          aria-current={next === page ? "page" : undefined}
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
    </nav>
  );
}

export default function ShopQasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const query = (searchParams.get("q") || searchParams.get("stx") || "").trim();
  const requestedField = searchParams.get("sfl") || "";
  const field = SEARCH_FIELDS.some((option) => option.value === requestedField) ? requestedField : DEFAULT_SEARCH_FIELD;

  const [items, setItems] = useState<ShopQA[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState(query);
  const [searchField, setSearchField] = useState(field);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);

  useEffect(() => {
    setSearchText(query);
    setSearchField(field);
  }, [query, field]);

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
      const result = await getShopQas({ page, perPage: PER_PAGE, q: query, sfl: query ? field : undefined });
      setItems(result.items);
      setMeta(result.meta);
    } catch (err: unknown) {
      setItems([]);
      setMeta(undefined);
      setErrorMessage(err instanceof Error ? err.message : "상품문의를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, query, field]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) {
      params.set("sfl", field);
      params.set("q", query);
    }
    return params;
  }, [field, query]);

  function moveTo(params: URLSearchParams) {
    runtimeRouterPush(router, `/shop/qas${params.toString() ? `?${params}` : ""}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const nextQuery = searchText.trim();
    if (nextQuery) {
      params.set("sfl", searchField);
      params.set("q", nextQuery);
    }
    moveTo(params);
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(baseParams.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    moveTo(params);
  }

  const total = meta?.total ?? 0;

  return (
    <div className="shop-qas-page pt-6 md:pt-10">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">상품문의</h1>

      <form className="shop-qas-search mb-3 flex flex-wrap items-center gap-2" role="search" onSubmit={submitSearch}>
        <label htmlFor="shop-qa-sfl" className="sr-only">검색 항목</label>
        {/* 폰 폭: 항목 고르기는 한 줄을 다 쓰고, 검색어와 단추가 다음 줄에 나란히(레퍼런스와 같다). */}
        <span className="relative inline-flex max-sm:w-full">
          <select
            id="shop-qa-sfl"
            value={searchField}
            onChange={(event) => setSearchField(event.target.value)}
            className="h-11 cursor-pointer appearance-none rounded-lg border bg-background py-0 pl-3.5 pr-9 text-sm max-sm:w-full"
          >
            {SEARCH_FIELDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
        <label htmlFor="shop-qa-stx" className="sr-only">검색어</label>
        <input
          id="shop-qa-stx"
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="검색어를 입력하세요"
          className="h-11 min-w-0 flex-[1_1_200px] rounded-lg border bg-background px-3.5 text-sm placeholder:text-muted-foreground"
        />
        <Button type="submit" className="h-11 rounded-lg px-[22px]">
          검색
        </Button>
      </form>

      <div className="mb-4 flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span>
          {meta ? (
            <>
              {query ? "검색 결과" : "전체"}{" "}
              <strong className="font-medium tabular-nums text-foreground">{total.toLocaleString()}</strong>건
            </>
          ) : null}
        </span>
        <Link href="/shop/qas" className="underline underline-offset-[3px] hover:text-primary">
          전체보기
        </Link>
      </div>

      {loading ? (
        <ul className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="skeleton h-20 rounded-xl border" />
          ))}
        </ul>
      ) : errorMessage ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center text-sm text-destructive">
          {errorMessage}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-muted-foreground">자료가 없습니다.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {items.map((item) => (
            <QaItem key={item.iq_id} item={item} productHref={shopProductHref(item, productRewriteMode)} />
          ))}
        </ol>
      )}

      <Pagination page={page} lastPage={meta?.last_page ?? 1} onPageChange={goToPage} />
    </div>
  );
}
