"use client";

import { useCallback, useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, PenSquare, Trash2 } from "lucide-react";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { ApiMeta } from "@/lib/api-response";
import type { Memo } from "@/lib/types";
import { cn, formatDate, truncate } from "@/lib/utils";
import { deleteMemo, getMemos, type MemoBoxType } from "@/services/memos";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/toast";

const BOXES: { type: MemoBoxType; label: string }[] = [
  { type: "recv", label: "받은 쪽지" },
  { type: "send", label: "보낸 쪽지" },
];

function isUnread(memo: Memo) {
  return (
    memo.me_type === "recv" &&
    (!memo.me_read_datetime ||
      memo.me_read_datetime === "0000-00-00 00:00:00" ||
      memo.me_read_datetime === "1000-01-01 00:00:00")
  );
}

export default function MemoListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") === "send" ? "send" : "recv";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  const [items, setItems] = useState<Memo[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);

  const updateParams = useCallback(
    (nextType: MemoBoxType, nextPage = 1) => {
      const params = new URLSearchParams();
      params.set("type", nextType);
      if (nextPage > 1) params.set("page", String(nextPage));
      runtimeRouterPush(router, `/mypage/memos?${params.toString()}`);
    },
    [router]
  );

  const loadMemos = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMemos(type, page, 20);
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      setItems([]);
      setMeta(undefined);
      toastError(error instanceof Error ? error.message : "쪽지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [type, page]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  const handleDelete = async (memoId: number) => {
    if (!confirm("쪽지를 삭제하시겠습니까?")) return;

    try {
      await deleteMemo(memoId);
      toastSuccess("쪽지를 삭제했습니다.");
      loadMemos();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "쪽지 삭제에 실패했습니다.");
    }
  };

  const lastPage = meta?.last_page ?? 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">쪽지함</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            그누보드 쪽지를 확인하고 새 쪽지를 보낼 수 있습니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/mypage/memos/new">
            <PenSquare className="mr-2 h-4 w-4" />
            쪽지 쓰기
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        {BOXES.map((box) => (
          <button
            key={box.type}
            type="button"
            onClick={() => updateParams(box.type)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              type === box.type
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {box.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-20 text-center">
          <Mail className="mb-4 h-14 w-14 text-muted-foreground/50" />
          <p className="text-lg font-medium">쪽지가 없습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {type === "recv" ? "받은 쪽지가 없습니다." : "보낸 쪽지가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((memo) => {
            const unread = isUnread(memo);
            return (
              <div
                key={memo.me_id}
                className={cn(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
                  unread && "bg-primary/5"
                )}
              >
                <Link href={`/mypage/memos/${memo.me_id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {unread && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        새 쪽지
                      </span>
                    )}
                    <span className="text-sm font-medium">
                      {type === "recv" ? memo.me_send_mb_id : memo.me_recv_mb_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(memo.me_send_datetime)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {truncate(memo.me_memo.replace(/\s+/g, " "), 120)}
                  </p>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(memo.me_id)}
                  aria-label="쪽지 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
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
            onClick={() => updateParams(type, page - 1)}
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
            onClick={() => updateParams(type, page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
