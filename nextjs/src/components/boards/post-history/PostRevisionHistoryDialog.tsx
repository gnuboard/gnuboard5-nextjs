"use client";

import { useEffect, useMemo, useState } from "react";
import { History, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { diffPostRevisionLines } from "@/lib/post-revision-diff";
import {
  comparePostRevisions,
  getPostRevision,
  getPostRevisionPage,
  type PostRevision,
  type PostRevisionSummary,
} from "@/services/post-history";

interface PostRevisionHistoryDialogProps {
  boTable: string;
  wrId: string;
}

const eventLabels: Record<string, string> = {
  baseline: "이력 시작 기준",
  created: "게시글 작성",
  updated: "게시글 수정",
  unknown_change: "기록되지 않은 변경",
};

const sourceLabels: Record<string, string> = {
  web: "그누보드 화면",
  api: "Next.js 화면",
  import: "매뉴얼 가져오기",
  system: "시스템 기록",
};

const roleLabels: Record<string, string> = {
  super: "최고관리자",
  group: "그룹관리자",
  board: "게시판관리자",
  member: "회원",
  system: "시스템",
};

function formatDate(value: string) {
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function changedFields(before: PostRevision, after: PostRevision) {
  const fields: Array<[keyof PostRevision, string]> = [
    ["wr_subject", "제목"],
    ["ca_name", "분류"],
    ["wr_option", "게시글 옵션"],
    ["wr_seo_title", "검색 제목"],
    ["wr_link1", "링크 1"],
    ["wr_link2", "링크 2"],
  ];
  return fields.filter(([key]) => before[key] !== after[key]);
}

export function PostRevisionHistoryDialog({ boTable, wrId }: PostRevisionHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<PostRevisionSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [comparison, setComparison] = useState<{ from: PostRevision; to: PostRevision } | null>(null);
  const [singleRevision, setSingleRevision] = useState<PostRevision | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setListLoading(true);
    setError("");
    setRevisions([]);
    setComparison(null);
    setFromId(null);
    setToId(null);
    getPostRevisionPage(boTable, wrId)
      .then((page) => {
        if (!active) return;
        setRevisions(page.revisions);
        setNextBefore(page.next_before);
        setHasMore(page.has_more);
        if (page.revisions.length > 0) {
          setToId(page.revisions[0].rev_id);
          if (page.revisions.length > 1) setFromId(page.revisions[1].rev_id);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "이력을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, boTable, wrId]);

  useEffect(() => {
    if (!open || fromId === null || toId === null || fromId === toId) {
      setComparison(null);
      return;
    }
    let active = true;
    setSingleRevision(null);
    setCompareLoading(true);
    setError("");
    comparePostRevisions(boTable, wrId, fromId, toId)
      .then((result) => {
        if (active) setComparison(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "버전을 비교하지 못했습니다.");
      })
      .finally(() => {
        if (active) setCompareLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, boTable, wrId, fromId, toId]);

  useEffect(() => {
    if (!open || toId === null || (fromId !== null && fromId !== toId)) {
      setSingleRevision(null);
      return;
    }
    let active = true;
    setSingleLoading(true);
    getPostRevision(boTable, wrId, toId)
      .then((revision) => {
        if (active) setSingleRevision(revision);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "버전을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setSingleLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, boTable, wrId, fromId, toId]);

  const diffLines = useMemo(() => {
    if (!comparison) return null;
    return diffPostRevisionLines(comparison.from.wr_content, comparison.to.wr_content);
  }, [comparison]);

  const loadMore = async () => {
    if (moreLoading || !hasMore || nextBefore === null) return;
    setMoreLoading(true);
    setError("");
    try {
      const page = await getPostRevisionPage(boTable, wrId, nextBefore);
      setRevisions((current) => [...current, ...page.revisions]);
      setNextBefore(page.next_before);
      setHasMore(page.has_more);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "이전 이력을 불러오지 못했습니다.");
    } finally {
      setMoreLoading(false);
    }
  };

  const chooseTarget = (revisionId: number) => {
    setToId(revisionId);
    if (fromId === revisionId) {
      const nextBase = revisions.find((item) => item.rev_id !== revisionId);
      setFromId(nextBase?.rev_id ?? null);
    }
  };

  const chooseBase = (revisionId: number | null) => {
    setFromId(revisionId);
    if (toId === revisionId) {
      const nextTarget = revisions.find((item) => item.rev_id !== revisionId);
      setToId(nextTarget?.rev_id ?? null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="게시글 수정 이력 보기">
          <History aria-hidden="true" />
          이력
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle>게시글 수정 이력</DialogTitle>
          <DialogDescription>
            매뉴얼 게시글의 저장된 버전과 변경 내용을 비교합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="max-h-40 overflow-y-auto border-b border-border bg-muted/30 p-3 md:max-h-none md:border-r md:border-b-0">
            <h3 className="mb-2 px-1 text-sm font-semibold">버전 기록</h3>
            {listLoading && revisions.length === 0 ? (
              <div className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> 불러오는 중
              </div>
            ) : revisions.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">
                기능 적용 전 변경 이력은 복구할 수 없습니다. 기존 글은 첫 이력 조회 시점의 현재 내용부터 기록됩니다.
              </p>
            ) : (
              <div className="space-y-1">
                {revisions.map((revision) => (
                  <button
                    key={revision.rev_id}
                    type="button"
                    onClick={() => chooseTarget(revision.rev_id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      toId === revision.rev_id
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-accent"
                    }`}
                    aria-pressed={toId === revision.rev_id}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span>v{revision.rev_no} · {eventLabels[revision.event] ?? revision.event}</span>
                      {toId === revision.rev_id && <span className="text-xs text-primary">비교 대상</span>}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDate(revision.created_at)}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {revision.actor_name || "작업자 미상"} · {roleLabels[revision.actor_role] ?? revision.actor_role}
                    </span>
                  </button>
                ))}
                {hasMore && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={loadMore} disabled={moreLoading}>
                    {moreLoading && <LoaderCircle className="animate-spin" />}
                    이전 버전 더 보기
                  </Button>
                )}
              </div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden">
            {error && (
              <div role="alert" className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">기준 버전</span>
                <select
                  className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-foreground"
                  value={fromId ?? ""}
                  onChange={(event) => chooseBase(event.target.value ? Number(event.target.value) : null)}
                  disabled={revisions.length < 2}
                >
                  <option value="">선택 안 함</option>
                  {revisions.map((revision) => (
                    <option key={revision.rev_id} value={revision.rev_id}>
                      v{revision.rev_no} · {formatDate(revision.created_at)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">비교 버전</span>
                <select
                  className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-foreground"
                  value={toId ?? ""}
                  onChange={(event) => chooseTarget(Number(event.target.value))}
                  disabled={revisions.length === 0}
                >
                  {revisions.map((revision) => (
                    <option key={revision.rev_id} value={revision.rev_id}>
                      v{revision.rev_no} · {formatDate(revision.created_at)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {compareLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> 버전 비교 중
                </div>
              ) : comparison ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold">v{comparison.from.rev_no} → v{comparison.to.rev_no}</span>
                    <span className="text-muted-foreground">
                      {comparison.to.actor_name || "작업자 미상"} · {roleLabels[comparison.to.actor_role] ?? comparison.to.actor_role}
                    </span>
                    <span className="text-muted-foreground">{sourceLabels[comparison.to.source] ?? comparison.to.source}</span>
                    <span className="text-muted-foreground">{formatDate(comparison.to.created_at)}</span>
                  </div>
                  {comparison.to.note && (
                    <p className="mb-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{comparison.to.note}</p>
                  )}
                  {changedFields(comparison.from, comparison.to).length > 0 && (
                    <div className="mb-3 rounded-md border border-border p-3 text-sm">
                      <h3 className="mb-2 font-semibold">본문 외 변경</h3>
                      <ul className="space-y-2">
                        {changedFields(comparison.from, comparison.to).map(([key, label]) => (
                          <li key={key} className="grid gap-1 sm:grid-cols-[100px_minmax(0,1fr)]">
                            <span className="font-medium">{label}</span>
                            <span className="break-words text-muted-foreground">
                              <span className="line-through">{String(comparison.from[key] || "(없음)")}</span>
                              <span className="mx-2">→</span>
                              <span>{String(comparison.to[key] || "(없음)")}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diffLines === null ? (
                    <div className="space-y-3">
                      <div className="alert alert-info text-sm">
                        본문이 길어 줄 단위 비교 한도를 넘었습니다. 두 버전의 원문을 펼쳐 확인할 수 있습니다.
                      </div>
                      <details className="rounded-md border border-border p-3">
                        <summary className="cursor-pointer text-sm font-semibold">기준 버전 원문 v{comparison.from.rev_no}</summary>
                        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">{comparison.from.wr_content}</pre>
                      </details>
                      <details className="rounded-md border border-border p-3">
                        <summary className="cursor-pointer text-sm font-semibold">비교 버전 원문 v{comparison.to.rev_no}</summary>
                        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">{comparison.to.wr_content}</pre>
                      </details>
                    </div>
                  ) : diffLines.every((line) => line.kind === "same") ? (
                    <p className="rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">본문 변경이 없습니다.</p>
                  ) : (
                    <div className="overflow-auto rounded-md border border-border bg-background font-mono text-xs leading-5">
                      {diffLines.map((line, index) => (
                        <div
                          key={`${index}-${line.kind}`}
                          className={`flex min-w-max px-3 ${
                            line.kind === "removed"
                              ? "bg-error/10 text-error"
                              : line.kind === "added"
                                ? "bg-success/10 text-success"
                                : "text-base-content"
                          }`}
                        >
                          <span className="mr-3 w-4 shrink-0 select-none opacity-70">
                            {line.kind === "removed" ? "−" : line.kind === "added" ? "+" : " "}
                          </span>
                          <span className="whitespace-pre">
                            {line.segments
                              ? line.segments.map((segment, segmentIndex) => (
                                  <span
                                    key={segmentIndex}
                                    className={
                                      segment.kind === "removed"
                                        ? "rounded-sm bg-error/20 font-semibold"
                                        : segment.kind === "added"
                                          ? "rounded-sm bg-success/20 font-semibold"
                                          : undefined
                                    }
                                  >
                                    {segment.text}
                                  </span>
                                ))
                              : line.text || " "}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : revisions.length > 0 && fromId === null ? (
                singleLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" /> 버전 불러오는 중
                  </div>
                ) : singleRevision ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-semibold">v{singleRevision.rev_no} · {eventLabels[singleRevision.event] ?? singleRevision.event}</span>
                      <span className="text-muted-foreground">{singleRevision.actor_name || "작업자 미상"} · {roleLabels[singleRevision.actor_role] ?? singleRevision.actor_role}</span>
                      <span className="text-muted-foreground">{sourceLabels[singleRevision.source] ?? singleRevision.source}</span>
                      <span className="text-muted-foreground">{formatDate(singleRevision.created_at)}</span>
                    </div>
                    {singleRevision.note && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{singleRevision.note}</p>}
                    <div className="rounded-md border border-border p-3">
                      <h3 className="mb-2 text-sm font-semibold">{singleRevision.wr_subject}</h3>
                      <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">{singleRevision.wr_content}</pre>
                    </div>
                  </div>
                ) : null
              ) : null}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
