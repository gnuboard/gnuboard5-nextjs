"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { getMyPoints } from "@/services/member";
import type { ApiMeta } from "@/lib/api-response";
import type { PointItem } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";

function formatDateTime(dt: string): string {
  if (!dt) return "-";
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function getPointChange(item: PointItem): number {
  // po_point > 0 means earned, po_use_point > 0 means consumed
  if (item.po_point > 0) return item.po_point;
  if (item.po_use_point > 0) return -item.po_use_point;
  // Negative po_point (e.g., admin deduction)
  if (item.po_point < 0) return item.po_point;
  return 0;
}

export default function MyPointsPage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<PointItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadPoints = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await getMyPoints(p, 15);
      setItems(result.items);
      setMeta(result.meta ?? null);
    } catch {
      setItems([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPoints(page);
  }, [page, loadPoints]);

  const handlePageChange = (newPage: number) => {
    if (meta && newPage >= 1 && newPage <= meta.last_page) {
      setPage(newPage);
    }
  };

  const totalPages = meta?.last_page ?? 1;

  return (
    <div className="space-y-6">
      {/* Point Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-yellow-600" />
            보유 포인트
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-primary">
            {(user?.mb_point ?? 0).toLocaleString()}
            <span className="ml-1 text-base font-normal text-muted-foreground">
              점
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Point History Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>포인트 내역</CardTitle>
            {meta && meta.total > 0 && (
              <span className="text-sm text-muted-foreground">
                총 {meta.total.toLocaleString()}건
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className="skeleton h-12 rounded-lg"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Coins className="mb-4 h-16 w-16 text-muted-foreground/40" />
              <p className="text-muted-foreground">포인트 내역이 없습니다</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="hidden rounded-t-lg bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground sm:grid sm:grid-cols-[1fr_2fr_auto_auto]">
                <span>날짜</span>
                <span>내용</span>
                <span className="text-right">변동</span>
                <span className="w-24 text-right">잔여</span>
              </div>

              {/* Table rows */}
              <div className="divide-y">
                {items.map((item) => {
                  const change = getPointChange(item);
                  const isPositive = change > 0;
                  const isNegative = change < 0;

                  return (
                    <div
                      key={item.po_id}
                      className="grid grid-cols-1 gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_2fr_auto_auto] sm:items-center sm:gap-0"
                    >
                      {/* Date */}
                      <span className="text-xs text-muted-foreground sm:text-sm">
                        {formatDateTime(item.po_datetime)}
                      </span>

                      {/* Content */}
                      <span className="font-medium leading-snug">
                        {item.po_content}
                      </span>

                      {/* Change */}
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-right font-semibold tabular-nums sm:justify-end",
                          isPositive && "text-blue-600",
                          isNegative && "text-red-700"
                        )}
                      >
                        {isPositive && (
                          <Plus className="h-3 w-3 flex-shrink-0" />
                        )}
                        {isNegative && (
                          <Minus className="h-3 w-3 flex-shrink-0" />
                        )}
                        {Math.abs(change).toLocaleString()}
                      </span>

                      {/* Balance */}
                      <span className="w-24 text-right text-muted-foreground tabular-nums">
                        {item.po_mb_point.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => handlePageChange(page - 1)}
                    aria-label="이전 페이지"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {generatePageNumbers(page, totalPages).map((p, i) =>
                    p === "ellipsis" ? (
                      <span
                        key={`e-${i}`}
                        className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground"
                      >
                        ...
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8 text-xs"
                        onClick={() => handlePageChange(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => handlePageChange(page + 1)}
                    aria-label="다음 페이지"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("ellipsis");
  }

  pages.push(total);
  return pages;
}
