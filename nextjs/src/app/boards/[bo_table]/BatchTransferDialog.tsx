"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import type { Board } from "@/lib/types";
import { getBoards } from "@/services/boards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/toast";

export type TransferMode = "copy" | "move";

interface BatchTransferDialogProps {
  mode: TransferMode | null;
  boTable: string;
  wrIds: number[];
  onClose: () => void;
  /** 끝난 뒤 목록을 고친다. 이동이면 옮긴 글 번호를 넘긴다. */
  onDone: (mode: TransferMode, movedIds: number[]) => void;
}

const MODE_LABEL: Record<TransferMode, string> = { copy: "복사", move: "이동" };

/**
 * 그누보드 bbs/move.php 의 게시판 고르기 창. 대상 게시판을 여러 개 고를 수 있고, 이동이면 지금 게시판은 뺀다.
 * 권한(대상 게시판의 관리자인지)은 서버(POST /post-transfer/{bo_table})가 다시 확인한다.
 */
export function BatchTransferDialog({ mode, boTable, wrIds, onClose, onDone }: BatchTransferDialogProps) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setTargets(new Set());
    let cancelled = false;
    void getBoards(0).then((list) => {
      if (!cancelled) setBoards(list);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!mode) return null;
  const label = MODE_LABEL[mode];
  const choices = (boards ?? []).filter((board) => mode === "copy" || board.bo_table !== boTable);

  const toggle = (name: string) => {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const submit = async () => {
    if (targets.size === 0) return;
    setSubmitting(true);
    try {
      await apiClient.post(`/post-transfer/${boTable}`, { mode, wr_ids: wrIds, targets: [...targets] });
      toastSuccess(`선택한 ${wrIds.length}개의 게시글을 ${targets.size}개 게시판으로 ${label}했습니다.`);
      onDone(mode, mode === "move" ? wrIds : []);
      onClose();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : `${label}에 실패했습니다.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="batch-transfer-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>게시글 {label}</DialogTitle>
          <DialogDescription>
            선택한 {wrIds.length}개의 게시글(댓글 · 첨부 포함)을 {label}할 게시판을 고르세요.
            {mode === "move" ? " 이동하면 이 게시판에서는 지워집니다." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto rounded-md border" role="group" aria-label={`${label}할 게시판`}>
          {boards === null ? (
            <p className="p-4 text-sm text-muted-foreground">게시판 목록을 불러오는 중…</p>
          ) : choices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">고를 수 있는 게시판이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {choices.map((board) => (
                <li key={board.bo_table}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={targets.has(board.bo_table)}
                      onChange={() => toggle(board.bo_table)}
                      className="rounded"
                    />
                    <span className="font-medium">{board.bo_subject}</span>
                    <span className="text-xs text-muted-foreground">
                      {board.bo_table}
                      {board.bo_table === boTable ? " · 지금 게시판" : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting || targets.size === 0}>
            {submitting ? `${label} 중...` : `${targets.size || ""}개 게시판으로 ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
