"use client";

import * as React from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import {
  BarChart3,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Trash2,
  Vote,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Poll } from "@/lib/types";
import {
  addPollComment,
  deletePollComment,
  getPollClient,
  votePoll,
} from "@/services/polls";
import { useAuthStore } from "@/store/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PollClientProps {
  initialPoll: Poll;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(1)}%`;
}

export function PollClient({ initialPoll }: PollClientProps) {
  const { user, isInitialized } = useAuthStore();
  const [poll, setPoll] = React.useState(initialPoll);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [guestName, setGuestName] = React.useState("");
  const [idea, setIdea] = React.useState("");
  const [pending, setPending] = React.useState<"refresh" | "vote" | "comment" | "delete" | null>(
    null
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPoll(initialPoll);
    setSelected(null);
    setMessage(null);
    setError(null);
  }, [initialPoll]);

  const refreshPoll = React.useCallback(async () => {
    setPending("refresh");
    setError(null);
    try {
      const next = await getPollClient(initialPoll.po_id);
      setPoll(next);
    } catch (err) {
      setError(errorMessage(err, "설문조사를 새로고침하지 못했습니다."));
    } finally {
      setPending(null);
    }
  }, [initialPoll.po_id]);

  React.useEffect(() => {
    if (isInitialized) {
      void refreshPoll();
    }
  }, [isInitialized, refreshPoll, user?.mb_id]);

  const handleVote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError("투표할 항목을 선택해 주세요.");
      return;
    }

    setPending("vote");
    setError(null);
    setMessage(null);

    try {
      const next = await votePoll(poll.po_id, selected);
      setPoll(next);
      setSelected(null);
      setMessage("투표가 반영되었습니다.");
    } catch (err) {
      setError(errorMessage(err, "투표 처리 중 문제가 발생했습니다."));
      if (err instanceof ApiError && err.status === 409) {
        void refreshPoll();
      }
    } finally {
      setPending(null);
    }
  };

  const handleComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedIdea = idea.trim();
    const trimmedName = guestName.trim();

    if (!trimmedIdea) {
      setError("의견 내용을 입력해 주세요.");
      return;
    }
    if (!user && !trimmedName) {
      setError("이름을 입력해 주세요.");
      return;
    }

    setPending("comment");
    setError(null);
    setMessage(null);

    try {
      const next = await addPollComment(poll.po_id, {
        pc_name: user ? undefined : trimmedName,
        pc_idea: trimmedIdea,
      });
      setPoll(next);
      setIdea("");
      setMessage("의견이 등록되었습니다.");
    } catch (err) {
      setError(errorMessage(err, "의견 등록 중 문제가 발생했습니다."));
    } finally {
      setPending(null);
    }
  };

  const handleDeleteComment = async (pcId: number) => {
    setPending("delete");
    setError(null);
    setMessage(null);

    try {
      const next = await deletePollComment(poll.po_id, pcId);
      setPoll(next);
      setMessage("의견이 삭제되었습니다.");
    } catch (err) {
      setError(errorMessage(err, "의견 삭제 중 문제가 발생했습니다."));
    } finally {
      setPending(null);
    }
  };

  const showResults = poll.can_view_result;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={poll.is_active ? "default" : "secondary"}>
                {poll.is_active ? "진행중" : "종료"}
              </Badge>
              {poll.has_voted && (
                <Badge variant="outline">
                  <CheckCircle2 className="mr-1 size-3" />
                  참여 완료
                </Badge>
              )}
              {poll.po_point !== 0 && (
                <Badge variant="outline">{poll.po_point.toLocaleString()}P</Badge>
              )}
              {poll.po_date && (
                <span className="text-xs text-muted-foreground">{poll.po_date}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={refreshPoll}
                disabled={pending === "refresh"}
              >
                <RefreshCw className={cn("size-4", pending === "refresh" && "animate-spin")} />
                새로고침
              </Button>
            </div>
            <CardTitle className="text-xl leading-tight">{poll.po_subject}</CardTitle>
          </CardHeader>
          <CardContent>
            {!poll.can_view_result && (
              <Alert className="mb-4">
                <AlertDescription>
                  권한 {poll.po_level} 이상 회원만 이 설문에 참여하거나 결과를 볼 수 있습니다.
                </AlertDescription>
              </Alert>
            )}

            {message && (
              <Alert className="mb-4">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleVote} className="space-y-4">
              <div className="space-y-3">
                {poll.options.map((option) => {
                  const inputId = `poll-${poll.po_id}-${option.num}`;
                  return (
                    <div key={option.num} className="rounded-md border p-3">
                      <div className="flex items-start gap-3">
                        <input
                          id={inputId}
                          type="radio"
                          name="poll-option"
                          value={option.num}
                          checked={selected === option.num}
                          disabled={!poll.can_vote || pending === "vote"}
                          onChange={() => setSelected(option.num)}
                          className="mt-1 size-4 accent-primary"
                        />
                        <Label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                          <span className="break-words text-sm font-medium">
                            {option.content}
                          </span>
                        </Label>
                      </div>

                      {showResults && (
                        <div className="mt-3 space-y-1">
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(0, Math.min(100, option.rate))}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{option.count.toLocaleString()}표</span>
                            <span>{formatRate(option.rate)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="size-4" />
                  총 {poll.total_count.toLocaleString()}표
                </div>
                <Button type="submit" disabled={!poll.can_vote || pending === "vote"}>
                  <Vote className="size-4" />
                  {pending === "vote" ? "처리 중" : "투표하기"}
                </Button>
              </div>

              {poll.has_voted && (
                <p className="text-sm text-muted-foreground">이미 참여한 설문조사입니다.</p>
              )}
              {!poll.is_active && (
                <p className="text-sm text-muted-foreground">종료된 설문조사입니다.</p>
              )}
            </form>
          </CardContent>
        </Card>

        {poll.po_etc && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="size-5" />
                기타의견
              </CardTitle>
              <p className="text-sm text-muted-foreground">{poll.po_etc}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {poll.can_comment ? (
                <form onSubmit={handleComment} className="space-y-3">
                  {!user && (
                    <div className="space-y-2">
                      <Label htmlFor="poll-guest-name">이름</Label>
                      <Input
                        id="poll-guest-name"
                        value={guestName}
                        onChange={(event) => setGuestName(event.target.value)}
                        maxLength={255}
                        placeholder="이름"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="poll-idea">의견</Label>
                    <Textarea
                      id="poll-idea"
                      value={idea}
                      onChange={(event) => setIdea(event.target.value)}
                      maxLength={255}
                      rows={3}
                      placeholder="의견을 입력해 주세요"
                    />
                  </div>
                  <Button type="submit" disabled={pending === "comment"}>
                    <MessageSquare className="size-4" />
                    {pending === "comment" ? "등록 중" : "의견 등록"}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  이 설문조사에 의견을 등록할 권한이 없습니다.
                </p>
              )}

              <div className="divide-y rounded-md border">
                {poll.etc_comments.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">등록된 의견이 없습니다.</p>
                ) : (
                  poll.etc_comments.map((comment) => (
                    <div key={comment.pc_id} className="flex gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{comment.pc_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {comment.pc_datetime}
                          </span>
                        </div>
                        <p className="break-words text-sm text-muted-foreground">
                          {comment.pc_idea}
                        </p>
                      </div>
                      {comment.can_delete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteComment(comment.pc_id)}
                          disabled={pending === "delete"}
                          aria-label="의견 삭제"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <aside>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">다른 설문조사</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {poll.other_polls.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">다른 설문조사가 없습니다.</p>
              ) : (
                poll.other_polls.map((item) => (
                  <Link
                    key={item.po_id}
                    href={`/polls?po_id=${item.po_id}`}
                    className={cn(
                      "block px-4 py-3 text-sm transition-colors hover:bg-muted/50",
                      item.is_current && "bg-muted font-medium"
                    )}
                  >
                    <span className="line-clamp-2">{item.po_subject}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.po_date || "날짜 없음"}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
