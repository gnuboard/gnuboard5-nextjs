"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toastSuccess, toastError } from "@/lib/toast";
import type { TransferMode } from "./BatchTransferDialog";

/**
 * 관리자 일괄 선택(선택 삭제 · 복사 · 이동). 목록형 표와 갤러리 격자가 같은 상태를 쓴다.
 * 지운 글은 다시 불러오지 않고 deletedIds 로 화면에서만 걷는다.
 */
export function useBatchSelection(boTable: string, ids: number[]) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const isAdmin = !!user && user.mb_level >= 10;
  const visibleIds = ids.filter((id) => !deletedIds.has(id));
  const allSelected = visibleIds.length > 0 && selected.size === visibleIds.length;

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  };

  const clearSelection = () => setSelected(new Set());

  const handleBatchDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개의 게시글을 삭제하시겠습니까?`)) return;

    setDeleting(true);
    let count = 0;
    for (const wrId of selected) {
      try {
        await apiClient.delete(`/posts/${boTable}/${wrId}`);
        count++;
        setDeletedIds((prev) => new Set(prev).add(wrId));
      } catch {
        // 한 건이 실패해도 나머지는 계속 지운다. 결과는 아래 건수로 알린다.
      }
    }
    setSelected(new Set());
    if (count > 0) {
      toastSuccess(`${count}개의 게시글이 삭제되었습니다.`);
    } else {
      toastError("삭제에 실패했습니다.");
    }
    setDeleting(false);
  }, [selected, boTable]);

  /** BatchTransferDialog 의 onDone. 옮긴 글은 이 게시판에서 사라진다. */
  const handleTransferDone = (mode: TransferMode, movedIds: number[]) => {
    if (mode === "move" && movedIds.length > 0) {
      setDeletedIds((prev) => new Set([...prev, ...movedIds]));
    }
    setSelected(new Set());
    router.refresh();
  };

  return {
    isAdmin,
    selected,
    deletedIds,
    deleting,
    allSelected,
    transferMode,
    setTransferMode,
    toggleOne,
    toggleAll,
    clearSelection,
    handleBatchDelete,
    handleTransferDone,
  };
}
