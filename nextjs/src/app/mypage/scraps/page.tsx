"use client";

import { useCallback, useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Bookmark, Trash2 } from "lucide-react";
import type { ApiMeta } from "@/lib/api-response";
import type { Scrap } from "@/lib/types";
import { g5ShortHref } from "@/lib/g5-short-url";
import { formatDate } from "@/lib/utils";
import { deleteScrap, getScraps } from "@/services/scraps";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toastError, toastSuccess } from "@/lib/toast";

export default function MyScrapsPage() {
  const [items, setItems] = useState<Scrap[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadScraps = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getScraps(page, 20);
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      setItems([]);
      setMeta(undefined);
      toastError(error instanceof Error ? error.message : "스크랩을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadScraps();
  }, [loadScraps]);

  const handleDelete = async (scrapId: number) => {
    if (!confirm("스크랩을 삭제하시겠습니까?")) return;

    setDeletingId(scrapId);
    try {
      await deleteScrap(scrapId);
      toastSuccess("스크랩을 삭제했습니다.");
      if (items.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
        return;
      }
      await loadScraps();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "스크랩 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const lastPage = meta?.last_page ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>스크랩</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-16 rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bookmark className="mb-4 h-14 w-14 text-muted-foreground/50" />
            <p className="text-lg font-medium">스크랩한 글이 없습니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              글 상세 화면에서 스크랩을 추가할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div
                key={item.ms_id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link href={g5ShortHref(item.href)} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium transition-colors hover:text-primary">
                    {item.wr_subject}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.bo_subject || item.bo_table}</span>
                    <span>{formatDate(item.ms_datetime)}</span>
                  </div>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={deletingId === item.ms_id}
                  onClick={() => handleDelete(item.ms_id)}
                  aria-label="스크랩 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {lastPage > 1 && (
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
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
              onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
            >
              다음
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
