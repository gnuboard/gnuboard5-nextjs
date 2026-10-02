"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Edit3,
  ExternalLink,
  HelpCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { ShopQA } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import type { ApiMeta } from "@/lib/api-response";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { cn, formatDate, formatPrice, truncate } from "@/lib/utils";
import { htmlToText } from "@/lib/html-text";
import { MypagePanel } from "../MypagePanel";
import { deleteShopQa, getMyShopQas, updateShopQa } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toastError, toastSuccess } from "@/lib/toast";

type StatusFilter = "all" | "answered" | "unanswered";

interface EditingState {
  iq_id: string;
  iq_subject: string;
  iq_question: string;
  iq_secret: boolean;
  iq_email: string;
  iq_hp: string;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "unanswered", label: "답변대기" },
  { value: "answered", label: "답변완료" },
];

function isAnswered(item: ShopQA) {
  return item.is_answered ?? item.iq_answer.trim() !== "";
}

function statusLabel(item: ShopQA) {
  return isAnswered(item) ? "답변완료" : "답변대기";
}

export default function MyShopQasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const statusParam = searchParams.get("status");
  const status: StatusFilter =
    statusParam === "answered" || statusParam === "unanswered" ? statusParam : "all";
  const query = searchParams.get("q") || "";

  const [items, setItems] = useState<ShopQA[]>([]);
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
      const result = await getMyShopQas({
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
      toastError(error instanceof Error ? error.message : "상품문의를 불러오지 못했습니다.");
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
    runtimeRouterPush(router, `/mypage/shop-qas${params.toString() ? `?${params}` : ""}`);
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

  function startEdit(item: ShopQA) {
    setEditing({
      iq_id: item.iq_id,
      iq_subject: item.iq_subject,
      iq_question: item.iq_question,
      iq_secret: Number(item.iq_secret || 0) === 1,
      iq_email: item.iq_email || "",
      iq_hp: item.iq_hp || "",
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const subject = editing.iq_subject.trim();
    const question = editing.iq_question.trim();
    if (subject.length < 2 || question.length < 5) {
      toastError("제목은 2자 이상, 내용은 5자 이상 입력해 주세요.");
      return;
    }

    setProcessingId(editing.iq_id);
    try {
      const updated = await updateShopQa(editing.iq_id, {
        iq_subject: subject,
        iq_question: question,
        iq_secret: editing.iq_secret,
        iq_email: editing.iq_email.trim(),
        iq_hp: editing.iq_hp.trim(),
      });
      setItems((prev) =>
        prev.map((item) => (item.iq_id === updated.iq_id ? { ...item, ...updated } : item))
      );
      setEditing(null);
      toastSuccess("상품문의가 수정되었습니다.");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "상품문의 수정에 실패했습니다.");
    } finally {
      setProcessingId("");
    }
  }

  async function removeItem(item: ShopQA) {
    if (!confirm("상품문의를 삭제하시겠습니까?")) return;

    setProcessingId(item.iq_id);
    try {
      await deleteShopQa(item.iq_id);
      setItems((prev) => prev.filter((entry) => entry.iq_id !== item.iq_id));
      toastSuccess("상품문의가 삭제되었습니다.");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "상품문의 삭제에 실패했습니다.");
    } finally {
      setProcessingId("");
    }
  }

  return (
    <MypagePanel
      title={`상품문의${meta ? ` (${meta.total.toLocaleString()}건)` : ""}`}
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
          <HelpCircle className="mb-3 size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">등록된 상품문의가 없습니다.</p>
        </div>
      ) : (
        <div className="divide-y rounded-[4px] border">
          {items.map((item) => {
            const answered = isAnswered(item);
            const editable = item.can_edit ?? !answered;
            const deletable = item.can_delete ?? !answered;
            const isEditing = editing?.iq_id === item.iq_id;
            const productName = item.it_name || item.it_id;
            const productHref = shopProductHref(item, productRewriteMode);

            return (
              <article key={item.iq_id} className="p-4">
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
                        <HelpCircle className="size-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            answered
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {statusLabel(item)}
                        </span>
                        {Number(item.iq_secret || 0) === 1 && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            비밀글
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(item.iq_time)}
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
                    {(editable || deletable) && (
                      <>
                        {editable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={processingId === item.iq_id}
                            onClick={() => startEdit(item)}
                          >
                            <Edit3 className="size-4" />
                            수정
                          </Button>
                        )}
                        {deletable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={processingId === item.iq_id}
                            onClick={() => removeItem(item)}
                          >
                            <Trash2 className="size-4" />
                            삭제
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <form className="mt-4 space-y-3" onSubmit={saveEdit}>
                    <Input
                      value={editing.iq_subject}
                      onChange={(event) =>
                        setEditing((prev) =>
                          prev ? { ...prev, iq_subject: event.target.value } : prev
                        )
                      }
                      maxLength={255}
                    />
                    <Textarea
                      value={editing.iq_question}
                      onChange={(event) =>
                        setEditing((prev) =>
                          prev ? { ...prev, iq_question: event.target.value } : prev
                        )
                      }
                      rows={5}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          이메일
                        </label>
                        <Input
                          type="email"
                          value={editing.iq_email}
                          onChange={(event) =>
                            setEditing((prev) =>
                              prev ? { ...prev, iq_email: event.target.value } : prev
                            )
                          }
                          maxLength={100}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          휴대폰
                        </label>
                        <Input
                          type="tel"
                          value={editing.iq_hp}
                          onChange={(event) =>
                            setEditing((prev) =>
                              prev ? { ...prev, iq_hp: event.target.value } : prev
                            )
                          }
                          maxLength={30}
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={editing.iq_secret}
                        onChange={(event) =>
                          setEditing((prev) =>
                            prev ? { ...prev, iq_secret: event.target.checked } : prev
                          )
                        }
                        className="size-4 accent-primary"
                      />
                      비밀글
                    </label>
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
                      <Button type="submit" size="sm" disabled={processingId === item.iq_id}>
                        <Check className="size-4" />
                        저장
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="break-words text-sm font-semibold">{item.iq_subject}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {/* 문의 · 답변은 에디터 HTML 일 수 있다 — 태그를 글자로 찍지 않고 글만 보인다. */}
                        {truncate(htmlToText(item.iq_question), 260)}
                      </p>
                    </div>
                    {answered && (
                      <div className="rounded-[4px] bg-muted p-3">
                        <p className="mb-1 text-xs font-medium text-primary">답변</p>
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {htmlToText(item.iq_answer)}
                        </p>
                      </div>
                    )}
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
