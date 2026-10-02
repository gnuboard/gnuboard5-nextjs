"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Edit3,
  ExternalLink,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { ShopReview } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import type { ApiMeta } from "@/lib/api-response";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { cn, formatDate, formatPrice, truncate } from "@/lib/utils";
import { htmlToText } from "@/lib/html-text";
import { MypagePanel } from "../MypagePanel";
import { deleteShopReview, getMyShopReviews, updateShopReview } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toastError, toastSuccess } from "@/lib/toast";

type StatusFilter = "all" | "confirmed" | "pending";

interface EditingState {
  is_id: string;
  is_subject: string;
  is_content: string;
  is_score: number;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "confirmed", label: "노출중" },
  { value: "pending", label: "승인대기" },
];

function isConfirmed(item: ShopReview) {
  return String(item.is_confirm || "0") === "1";
}

function statusLabel(item: ShopReview) {
  return isConfirmed(item) ? "노출중" : "승인대기";
}

function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => {
        const score = index + 1;
        const active = score <= value;
        return (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className="rounded-[4px] p-1 text-amber-400 transition-colors hover:bg-muted"
            aria-label={`${score}점`}
          >
            <Star
              className={cn(
                "size-5",
                active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function RatingDisplay({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-3.5",
            index < score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export default function MyShopReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const statusParam = searchParams.get("status");
  const status: StatusFilter =
    statusParam === "confirmed" || statusParam === "pending" ? statusParam : "all";
  const query = searchParams.get("q") || "";

  const [items, setItems] = useState<ShopReview[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState(query);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [processingId, setProcessingId] = useState<string>("");
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
    try {
      const result = await getMyShopReviews({
        page,
        perPage: 20,
        status,
        q: query,
      });
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      setItems([]);
      setMeta(undefined);
      toastError(error instanceof Error ? error.message : "상품후기를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const lastPage = meta?.last_page ?? 1;

  const currentQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (query) params.set("q", query);
    return params;
  }, [query, status]);

  function moveTo(params: URLSearchParams) {
    runtimeRouterPush(router, `/mypage/reviews${params.toString() ? `?${params}` : ""}`);
  }

  function updateStatus(nextStatus: StatusFilter) {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (query) params.set("q", query);
    moveTo(params);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    const nextQuery = searchText.trim();
    if (nextQuery) params.set("q", nextQuery);
    moveTo(params);
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(currentQuery.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    moveTo(params);
  }

  function startEdit(item: ShopReview) {
    setEditing({
      is_id: item.is_id,
      is_subject: item.is_subject,
      is_content: item.is_content,
      is_score: Math.min(5, Math.max(1, Number(item.is_score || 5))),
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const subject = editing.is_subject.trim();
    const content = editing.is_content.trim();
    const score = Math.min(5, Math.max(1, Number(editing.is_score || 0)));

    if (!subject || !content) {
      toastError("제목과 내용을 입력해주세요.");
      return;
    }

    setProcessingId(editing.is_id);
    try {
      const updated = await updateShopReview(editing.is_id, {
        is_subject: subject,
        is_content: content,
        is_score: score,
      });
      setItems((prev) =>
        prev.map((item) => (item.is_id === updated.is_id ? { ...item, ...updated } : item))
      );
      setEditing(null);
      toastSuccess("상품후기가 수정되었습니다.");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "상품후기 수정에 실패했습니다.");
    } finally {
      setProcessingId("");
    }
  }

  async function removeItem(item: ShopReview) {
    if (!confirm("상품후기를 삭제하시겠습니까?")) return;

    setProcessingId(item.is_id);
    try {
      await deleteShopReview(item.is_id);
      setItems((prev) => prev.filter((entry) => entry.is_id !== item.is_id));
      toastSuccess("상품후기가 삭제되었습니다.");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "상품후기 삭제에 실패했습니다.");
    } finally {
      setProcessingId("");
    }
  }

  return (
    <MypagePanel
      title={`상품후기${meta ? ` (${meta.total.toLocaleString()}건)` : ""}`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/shop/products">
            <ExternalLink className="size-4" />
            상품 보기
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => updateStatus(item.value)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                status === item.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form className="flex gap-2" onSubmit={submitSearch}>
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="상품명, 제목, 내용"
            className="h-9 w-full md:w-64"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="size-4" />
            검색
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-32 rounded-[4px] border" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Star className="mb-3 size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">등록한 상품후기가 없습니다.</p>
        </div>
      ) : (
        <div className="divide-y rounded-[4px] border">
          {items.map((item) => {
            const confirmed = isConfirmed(item);
            const isEditing = editing?.is_id === item.is_id;
            const productName = item.it_name || item.it_id;
            const productHref = shopProductHref(item, productRewriteMode);

            return (
              <article key={item.is_id} className="p-4">
                <div className="flex flex-col gap-4 md:flex-row">
                  <a
                    href={productHref}
                    className="flex min-w-0 flex-1 gap-3 rounded-[4px] transition-colors hover:bg-muted/40"
                  >
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted">
                      {item.product_image_url ? (
                        <img
                          src={item.product_image_url}
                          alt={productName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Star className="size-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            confirmed
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {statusLabel(item)}
                        </span>
                        <RatingDisplay score={item.is_score} />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(item.is_time)}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold">{productName}</p>
                      {typeof item.it_price === "number" && item.it_price > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatPrice(item.it_price)}
                        </p>
                      )}
                    </div>
                  </a>

                  <div className="flex shrink-0 gap-2 md:self-start">
                    <Button variant="outline" size="sm" asChild>
                      <a href={productHref}>
                        <ExternalLink className="size-4" />
                        보기
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={processingId === item.is_id}
                      onClick={() => startEdit(item)}
                    >
                      <Edit3 className="size-4" />
                      수정
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={processingId === item.is_id}
                      onClick={() => removeItem(item)}
                    >
                      <Trash2 className="size-4" />
                      삭제
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <form className="mt-4 space-y-3" onSubmit={saveEdit}>
                    <Input
                      value={editing.is_subject}
                      onChange={(event) =>
                        setEditing((prev) =>
                          prev ? { ...prev, is_subject: event.target.value } : prev
                        )
                      }
                      maxLength={255}
                    />
                    <RatingInput
                      value={editing.is_score}
                      onChange={(score) =>
                        setEditing((prev) => (prev ? { ...prev, is_score: score } : prev))
                      }
                    />
                    <Textarea
                      value={editing.is_content}
                      onChange={(event) =>
                        setEditing((prev) =>
                          prev ? { ...prev, is_content: event.target.value } : prev
                        )
                      }
                      rows={5}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(null)}
                      >
                        <X className="size-4" />
                        취소
                      </Button>
                      <Button type="submit" size="sm" disabled={processingId === item.is_id}>
                        <Check className="size-4" />
                        저장
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-4 space-y-2">
                    <p className="break-words text-sm font-semibold">{item.is_subject}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {/* 후기 본문은 에디터 HTML 이다 — 태그를 글자로 찍지 않고 글만 요약한다. */}
                      {truncate(htmlToText(item.is_content), 320)}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

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
