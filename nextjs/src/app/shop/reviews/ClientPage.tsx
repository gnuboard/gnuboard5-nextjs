"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ShopReview } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import type { ApiMeta } from "@/lib/api-response";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { htmlToPlainText } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { getShopReviewOverallSummary, getShopReviews } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { SafeHtml } from "@/components/SafeHtml";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/*
 * 사용후기 전체 목록 — 그누보드 shop/itemuselist.php(레퍼런스 solune 스킨)과 같은 짜임.
 *   검색 줄(항목 고르기 · 검색어 · 검색) → "전체 N건 · 평균 N.N★ | 전체보기" → 후기 하나가 카드 하나인 격자
 *   (상품 · 별점 · 제목 · 두 줄 발췌 · 사진 셋과 +N · 작성자 · 날짜 · 후기 바로가기 · 내용보기) → 쪽 번호.
 *   "내용보기" 는 이 자리에서 본문 전체와 관리자 답변을 겹창으로 연다.
 */

/** 그누보드 itemuselist 의 검색 항목(sfl). API 가 같은 이름을 받는다. */
const SEARCH_FIELDS = [
  { value: "i.it_name", label: "상품명" },
  { value: "r.it_id", label: "상품코드" },
  { value: "r.is_subject", label: "후기제목" },
  { value: "r.is_content", label: "후기내용" },
  { value: "r.is_name", label: "작성자명" },
  { value: "r.mb_id", label: "작성자아이디" },
] as const;
const DEFAULT_SEARCH_FIELD = SEARCH_FIELDS[0].value;
const PER_PAGE = 15;
/** 카드에 보이는 후기 사진 수 — 넘치면 "+N" 칸 하나로 줄인다. */
const MAX_CARD_PHOTOS = 3;
/** 별 색 — 상품 상세의 별과 같은 금색(테마가 --ondam-star 로 바꿀 수 있다). */
const STAR_CLASS = "text-[var(--ondam-star,#c9a227)]";

/** 글자로 바꾼 본문에 남는 &nbsp; · &amp; 같은 이름 · 숫자 문자 참조를 푼다(서버 · 브라우저 어디서든). */
function decodeEntities(text: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key in named) return named[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return match;
  });
}

function reviewExcerpt(html: string): string {
  return decodeEntities(htmlToPlainText(html)).replace(/\s+/g, " ").trim();
}

/** 본문의 사진 주소 — http(s) 와 사이트 안 경로만, 같은 사진은 한 번. */
function reviewPhotos(html: string): string[] {
  const photos: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = decodeEntities(match[1].trim());
    if (!/^(https?:)?\/\//i.test(src) && !src.startsWith("/")) continue;
    if (!photos.includes(src)) photos.push(src);
  }
  return photos;
}

function reviewDate(value: string): string {
  return (value || "").slice(0, 10);
}

/** "후기 바로가기" — 상품 상세에서 이 후기로(레퍼런스 item.php?is_id= — 그 후기가 실린 쪽을 열고 그 줄로 데려가 잠깐 표시). */
function reviewHref(productHref: string, isId: string | number): string {
  return `${productHref}${productHref.includes("?") ? "&" : "?"}is_id=${encodeURIComponent(String(isId))}`;
}

function Rating({ score, className }: { score: number; className?: string }) {
  const value = Math.max(0, Math.min(5, Math.round(Number(score || 0))));
  return (
    <p className={cn("flex items-center gap-2", className)}>
      <span className={cn("text-[15px] leading-none tracking-[1px]", STAR_CLASS)} aria-label={`5점 만점에 ${value}점`}>
        {"★".repeat(value)}
        {"☆".repeat(5 - value)}
      </span>
      <span className="text-[13px] tabular-nums text-muted-foreground" aria-hidden="true">
        {value.toFixed(1)}
      </span>
    </p>
  );
}

function ProductThumb({ src, size }: { src?: string; size: number }) {
  return (
    <span
      className="block flex-none overflow-hidden rounded-lg bg-muted"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

/** 후기 사진 한 칸 — 읽지 못한 사진(지워진 외부 주소 등)은 깨진 그림 대신 칸째 감춘다. */
function ReviewPhoto({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span className="grid size-16 flex-none place-items-center overflow-hidden rounded-md border bg-muted">
      <img
        src={src}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function ReviewCard({
  item,
  productHref,
  onOpen,
}: {
  item: ShopReview;
  productHref: string;
  onOpen: () => void;
}) {
  const excerpt = reviewExcerpt(item.is_content);
  const photos = reviewPhotos(item.is_content);
  const shown = photos.slice(0, MAX_CARD_PHOTOS);
  const more = photos.length - shown.length;
  const writer = item.is_name || item.mb_nick;

  return (
    <li className="shop-review-card flex flex-col gap-3.5 rounded-xl border bg-card p-5">
      <Link href={productHref} className="group flex min-w-0 items-center gap-2.5">
        <ProductThumb src={item.product_image_url} size={44} />
        <span className="truncate text-[13px] text-muted-foreground group-hover:text-primary">
          {item.it_name || item.it_id}
        </span>
      </Link>

      <Rating score={item.is_score} />

      <h2 className="text-[17px] font-semibold leading-[1.45] text-pretty">{item.is_subject}</h2>
      {excerpt ? (
        <p className="line-clamp-2 text-sm leading-[1.65] text-foreground/75 [overflow-wrap:anywhere]">{excerpt}</p>
      ) : null}

      {shown.length > 0 ? (
        // 사진을 모두 읽지 못하면 칸이 비므로(empty) 줄째 감춰 빈 틈이 남지 않게 한다.
        <div className="flex items-center gap-1.5 empty:hidden" aria-hidden="true">
          {shown.map((src) => (
            <ReviewPhoto key={src} src={src} />
          ))}
          {more > 0 ? (
            <span className="grid size-16 flex-none place-items-center rounded-md border border-dashed bg-muted text-[13px] text-muted-foreground">
              +{more}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-[13px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {writer}
          <span className="mx-1.5" aria-hidden="true">·</span>
          {reviewDate(item.is_time)}
        </span>
        {/* 바로가기는 화면을 옮기고 내용보기는 이 자리에서 연다 — 무게를 달리 둔다. */}
        <span className="flex flex-none items-center gap-2.5">
          <Link
            href={reviewHref(productHref, item.is_id)}
            className="whitespace-nowrap text-foreground/75 underline underline-offset-[3px] hover:text-foreground"
          >
            후기 바로가기<span className="sr-only"> — {item.is_subject}</span>
          </Link>
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer whitespace-nowrap text-primary underline underline-offset-[3px] hover:opacity-80"
          >
            내용보기<span className="sr-only"> — {item.is_subject}</span>
          </button>
        </span>
      </div>
    </li>
  );
}

function ReviewDialog({
  item,
  productHref,
  onClose,
}: {
  item: ShopReview | null;
  productHref: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-48px)] max-w-[640px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-none border-b px-5 py-[18px]">
          <DialogTitle className="text-[13px] font-medium text-muted-foreground">사용후기</DialogTitle>
        </DialogHeader>
        {item ? (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-7 pt-[22px]">
            <Link
              href={productHref}
              onClick={onClose}
              className="flex min-w-0 items-center gap-3 rounded-[10px] border bg-muted/50 p-3"
            >
              <ProductThumb src={item.product_image_url} size={48} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{item.it_name || item.it_id}</span>
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  상품 보기 <ArrowRight className="size-3" aria-hidden="true" />
                </span>
              </span>
            </Link>

            <div className="flex flex-col gap-1.5">
              <Rating score={item.is_score} />
              <h3 className="text-lg font-semibold leading-snug">{item.is_subject}</h3>
              <p className="text-[13px] text-muted-foreground">
                {item.is_name || item.mb_nick}
                <span className="mx-1.5" aria-hidden="true">·</span>
                {reviewDate(item.is_time)}
              </p>
            </div>

            <SafeHtml
              html={item.is_content}
              policy="content"
              className="prose prose-sm max-w-none border-t pt-4 dark:prose-invert [&_img]:h-auto [&_img]:max-w-full"
            />

            {item.is_reply_content ? (
              <div className="flex flex-col gap-1.5 rounded-[10px] border bg-muted/50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">답변</span>
                  {item.is_reply_subject}
                </p>
                {item.is_reply_name ? <p className="text-xs text-muted-foreground">{item.is_reply_name}</p> : null}
                <SafeHtml
                  html={item.is_reply_content}
                  policy="content"
                  className="prose prose-sm max-w-none dark:prose-invert [&_img]:h-auto [&_img]:max-w-full"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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

export default function ShopReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const query = (searchParams.get("q") || searchParams.get("stx") || "").trim();
  const requestedField = searchParams.get("sfl") || "";
  const field = SEARCH_FIELDS.some((option) => option.value === requestedField) ? requestedField : DEFAULT_SEARCH_FIELD;

  const [items, setItems] = useState<ShopReview[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [average, setAverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState(query);
  const [searchField, setSearchField] = useState(field);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const [openReview, setOpenReview] = useState<ShopReview | null>(null);

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
    // 전체 평균은 검색과 상관없이 한 번 — 검색 중에는 보이지 않는다(레퍼런스와 같다).
    getShopReviewOverallSummary()
      .then((summary) => {
        if (alive && summary && summary.total > 0) setAverage(summary.average);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await getShopReviews({ page, perPage: PER_PAGE, q: query, sfl: query ? field : undefined });
      setItems(result.items);
      setMeta(result.meta);
    } catch (err: unknown) {
      setItems([]);
      setMeta(undefined);
      setErrorMessage(err instanceof Error ? err.message : "사용후기를 불러오지 못했습니다.");
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
    runtimeRouterPush(router, `/shop/reviews${params.toString() ? `?${params}` : ""}`);
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
  const hrefFor = (item: ShopReview) => shopProductHref(item, productRewriteMode);

  return (
    <div className="shop-reviews-page pt-6 md:pt-10">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">사용후기</h1>

      <form className="shop-reviews-search mb-3 flex flex-wrap items-center gap-2" role="search" onSubmit={submitSearch}>
        <label htmlFor="shop-review-sfl" className="sr-only">검색 항목</label>
        {/* 폰 폭: 항목 고르기는 한 줄을 다 쓰고, 검색어와 단추가 다음 줄에 나란히(레퍼런스와 같다). */}
        <span className="relative inline-flex max-sm:w-full">
          <select
            id="shop-review-sfl"
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
        <label htmlFor="shop-review-stx" className="sr-only">검색어</label>
        <input
          id="shop-review-stx"
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
          {query ? (
            <>
              검색 결과 <strong className="font-medium tabular-nums text-foreground">{total.toLocaleString()}</strong>건
            </>
          ) : meta ? (
            <>
              전체 <strong className="font-medium tabular-nums text-foreground">{total.toLocaleString()}</strong>건
              {average !== null ? (
                <>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  평균 <strong className="font-medium tabular-nums text-foreground">{average.toFixed(1)}</strong>
                  <span className={cn("ml-0.5", STAR_CLASS)} aria-hidden="true">★</span>
                </>
              ) : null}
            </>
          ) : null}
        </span>
        <Link href="/shop/reviews" className="underline underline-offset-[3px] hover:text-primary">
          전체보기
        </Link>
      </div>

      {/* 칸 수는 화면 폭이 아니라 이 목록이 받은 폭으로 정한다(셋 · 둘 · 하나). */}
      <div className="@container">
        {loading ? (
          <ul className="grid grid-cols-1 gap-3.5 @min-[620px]:grid-cols-2 @min-[900px]:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="skeleton h-64 rounded-xl border" />
            ))}
          </ul>
        ) : errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center text-sm text-destructive">
            {errorMessage}
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">자료가 없습니다.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3.5 @min-[620px]:grid-cols-2 @min-[900px]:grid-cols-3">
            {items.map((item) => (
              <ReviewCard key={item.is_id} item={item} productHref={hrefFor(item)} onOpen={() => setOpenReview(item)} />
            ))}
          </ul>
        )}
      </div>

      <Pagination page={page} lastPage={meta?.last_page ?? 1} onPageChange={goToPage} />

      <ReviewDialog
        item={openReview}
        productHref={openReview ? hrefFor(openReview) : "/shop"}
        onClose={() => setOpenReview(null)}
      />
    </div>
  );
}
