"use client";

import { useCallback, useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Reply, Trash2 } from "lucide-react";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { Memo } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { deleteMemo, getMemo } from "@/services/memos";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/toast";

export default function MemoDetailPage() {
  const router = useRouter();
  const memoId = Number(useRuntimeRouteParam("me_id", "/mypage/memos/:me_id"));
  const routeReady = useRuntimeRouteReady();
  const [memo, setMemo] = useState<Memo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const loadMemo = useCallback(async () => {
    setLoading(true);
    try {
      const loadedMemo = await getMemo(memoId);
      setMemo(loadedMemo);
      if (!loadedMemo) {
        toastError("쪽지를 찾을 수 없습니다.");
      }
    } catch (error) {
      setMemo(null);
      toastError(error instanceof Error ? error.message : "쪽지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [memoId]);

  useEffect(() => {
    if (!Number.isFinite(memoId) || memoId <= 0) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setLoading(false);
      setMemo(null);
      return;
    }
    loadMemo();
  }, [loadMemo, memoId, routeReady]);

  const handleDelete = async () => {
    if (!memo || !confirm("쪽지를 삭제하시겠습니까?")) return;

    setDeleting(true);
    try {
      await deleteMemo(memo.me_id);
      toastSuccess("쪽지를 삭제했습니다.");
      runtimeRouterPush(router, `/mypage/memos?type=${memo.me_type}`);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "쪽지 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        <div className="skeleton h-56 rounded-lg" />
      </div>
    );
  }

  if (!memo) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border py-20">
        <p className="text-lg font-medium">쪽지를 찾을 수 없습니다</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/mypage/memos">쪽지함으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const otherMemberId =
    memo.me_type === "recv" ? memo.me_send_mb_id : memo.me_recv_mb_id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/mypage/memos?type=${memo.me_type}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold">
              {memo.me_type === "recv" ? "받은 쪽지" : "보낸 쪽지"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(memo.me_send_datetime)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {memo.me_type === "recv" && (
            <Button variant="outline" asChild>
              <Link href={`/mypage/memos/new?recv=${encodeURIComponent(otherMemberId)}`}>
                <Reply className="mr-2 h-4 w-4" />
                답장
              </Link>
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        </div>
      </div>

      <section className="rounded-lg border">
        <dl className="grid gap-3 border-b p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">보낸 회원</dt>
            <dd className="mt-1 font-medium">{memo.me_send_mb_id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">받는 회원</dt>
            <dd className="mt-1 font-medium">{memo.me_recv_mb_id}</dd>
          </div>
        </dl>
        <div className="whitespace-pre-wrap break-words p-5 text-sm leading-7">
          {memo.me_memo}
        </div>
      </section>
    </div>
  );
}
