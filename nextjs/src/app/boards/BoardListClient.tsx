"use client";

import { useEffect, useMemo, useState } from "react";
import type { Board } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/EmptyState";
import { g5ShortHref } from "@/lib/g5-short-url";

interface BoardListClientProps {
  boards: Board[];
}

function currentGroupFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("group")?.trim() ?? "";
}

export function BoardListClient({ boards }: BoardListClientProps) {
  const [group, setGroup] = useState("");

  useEffect(() => {
    const syncGroup = () => setGroup(currentGroupFromLocation());
    syncGroup();
    window.addEventListener("popstate", syncGroup);

    return () => window.removeEventListener("popstate", syncGroup);
  }, []);

  const filteredBoards = useMemo(
    () => (group ? boards.filter((board) => board.gr_id === group) : boards),
    [boards, group]
  );

  const grouped = useMemo(
    () =>
      filteredBoards.reduce<Record<string, Board[]>>((acc, board) => {
        const key = board.gr_id || "기타";
        if (!acc[key]) acc[key] = [];
        acc[key].push(board);
        return acc;
      }, {}),
    [filteredBoards]
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: "게시판" }]} />
      <h1 className="mb-8 text-3xl font-bold">게시판 목록</h1>

      {filteredBoards.length === 0 ? (
        <EmptyState
          title="등록된 게시판이 없습니다"
          description="게시판이 생성되면 이곳에 목록이 표시됩니다."
        />
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([groupId, groupBoards]) => (
            <section key={groupId}>
              <h2 className="mb-4 border-b pb-2 text-xl font-semibold">{groupId}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupBoards.map((board) => (
                  <a key={board.bo_table} href={g5ShortHref(`/boards/${board.bo_table}`)}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{board.bo_subject}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            게시글
                            <Badge variant="secondary">
                              {formatNumber(board.bo_count_write ?? 0)}
                            </Badge>
                          </span>
                          <span className="flex items-center gap-1">
                            댓글
                            <Badge variant="secondary">
                              {formatNumber(board.bo_count_comment ?? 0)}
                            </Badge>
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
