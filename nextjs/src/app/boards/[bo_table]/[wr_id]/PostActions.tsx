"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { apiClient } from "@/lib/api";
import { g5ShortHref } from "@/lib/g5-short-url";
import { useAuthStore } from "@/store/auth";
import { addScrap, deleteScrapByPost } from "@/services/scraps";
import type { WritePost } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PostActionsProps {
  boTable: string;
  wrId: string;
  post: WritePost;
  mode?: "buttons" | "vote";
}

export function PostActions({ boTable, wrId, post, mode = "buttons" }: PostActionsProps) {
  const { user } = useAuthStore();
  const [scrapped, setScrapped] = useState(!!post.is_scrapped);
  const [scrapLoading, setScrapLoading] = useState(false);
  const [good, setGood] = useState(post.wr_good ?? 0);
  const [nogood, setNogood] = useState(post.wr_nogood ?? 0);
  const [voting, setVoting] = useState(false);
  const canUseGood = Number(post.bo_use_good ?? 1) === 1;
  const canUseNogood = Number(post.bo_use_nogood ?? 1) === 1;

  // 권한은 서버가 그누보드 표준(cf_admin/gr_admin/bo_admin/owner)으로 계산해 내려준다.
  // 비로그인 시 user는 null이라 명시적으로 false 가드.
  const canManage = !!user && !!post.can_manage;
  const toggleScrap = async () => {
    if (!user) {
      toastError("로그인 후 스크랩할 수 있습니다.");
      return;
    }
    if (scrapLoading) return;

    setScrapLoading(true);
    try {
      if (scrapped) {
        await deleteScrapByPost(boTable, wrId);
        setScrapped(false);
        toastSuccess("스크랩을 삭제했습니다.");
      } else {
        await addScrap({ bo_table: boTable, wr_id: wrId });
        setScrapped(true);
        toastSuccess("스크랩했습니다.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "스크랩 처리에 실패했습니다.";
      toastError(message);
    } finally {
      setScrapLoading(false);
    }
  };

  const handleVote = async (type: "good" | "nogood") => {
    // 그누보드처럼 추천 · 비추천은 회원만 할 수 있다. 비회원이면 API 를 부르지 않고 바로 알린다.
    if (!user) {
      toastError(type === "good" ? "로그인 후 추천할 수 있습니다." : "로그인 후 비추천할 수 있습니다.");
      return;
    }
    if (voting) return;
    setVoting(true);
    try {
      const res = await apiClient.post<{ wr_good?: number; wr_nogood?: number }>(
        `/posts/${boTable}/${wrId}/${type}`
      );
      if (typeof res.data?.wr_good === "number") {
        setGood(res.data.wr_good);
      } else if (type === "good") {
        setGood((prev) => prev + 1);
      }
      if (typeof res.data?.wr_nogood === "number") {
        setNogood(res.data.wr_nogood);
      } else if (type === "nogood") {
        setNogood((prev) => prev + 1);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "이미 추천/비추천 하셨습니다.";
      toastError(message);
    } finally {
      setVoting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/posts/${boTable}/${wrId}`);
      window.location.href = g5ShortHref(`/boards/${boTable}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "삭제에 실패했습니다.";
      toastError(message);
    }
  };

  if (mode === "vote") {
    if (!canUseGood && !canUseNogood) {
      return null;
    }

    return (
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          className={canUseGood ? "post-vote-good" : "post-vote-good hidden"}
          onClick={() => handleVote("good")}
          disabled={voting}
        >
          추천 {formatNumber(good)}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={canUseNogood ? "post-vote-nogood" : "post-vote-nogood hidden"}
          onClick={() => handleVote("nogood")}
          disabled={voting}
        >
          비추천 {formatNumber(nogood)}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleScrap}
        disabled={scrapLoading}
        title={scrapped ? "스크랩 삭제" : "스크랩"}
        aria-label={scrapped ? "스크랩 삭제" : "스크랩"}
      >
        <Bookmark
          className={`h-4 w-4 ${scrapped ? "fill-current text-primary" : ""}`}
        />
      </Button>
      {canManage && (
        <>
          <Button asChild variant="outline" size="sm">
            <a href={g5ShortHref(`/boards/${boTable}/write?wr_id=${wrId}`)}>수정</a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                삭제
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>게시글 삭제</AlertDialogTitle>
                <AlertDialogDescription>
                  이 게시글을 삭제하시겠습니까? 삭제된 게시글은 복구할 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
