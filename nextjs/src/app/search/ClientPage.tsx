"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { g5ShortHref } from "@/lib/g5-short-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { formatDate } from "@/lib/utils";
import { searchSite } from "@/services/search";
import { getClientPublicSettings } from "@/services/settings";
import type { SearchResult } from "@/lib/schemas";
import { boardPostHref } from "@/lib/board-url";
import { g5PathForRuntime } from "@/lib/config";

function toPage(value: string | null): number {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** 검색어와 겹치는 부분만 <mark> 로 감싼다. 문자열을 조각내 React 요소로 그리므로
 *  본문에 태그가 섞여 있어도 그대로 글자로 나온다(HTML 주입이 아니다). */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let cursor = 0;

  for (;;) {
    const hit = lowerText.indexOf(lowerNeedle, cursor);
    if (hit === -1) break;
    if (hit > cursor) parts.push(text.slice(cursor, hit));
    parts.push(
      <mark key={hit} className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-500/30">
        {text.slice(hit, hit + needle.length)}
      </mark>
    );
    cursor = hit + needle.length;
  }

  if (cursor === 0) return <>{text}</>;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function ClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") || searchParams.get("stx") || "").trim();
  const sfl = searchParams.get("sfl") || undefined;
  const boTable = searchParams.get("bo_table") || undefined;
  const page = toPage(searchParams.get("page"));
  const [input, setInput] = useState(query);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [bbsRewriteMode, setBbsRewriteMode] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(query);
    if (!query) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      searchSite({ query, sfl, boTable, page }),
      getClientPublicSettings().catch(() => null),
    ])
      .then(([result, settings]) => {
        if (cancelled) return;
        setBbsRewriteMode(Number(settings?.cf_bbs_rewrite ?? 0));
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setResults([]);
          setError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setError("검색 결과를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boTable, page, query, sfl]);

  return (
    <div className="search-page container mx-auto max-w-3xl px-4 py-8">
      <Breadcrumb items={[{ label: "검색" }]} />
      <h1 className="search-title mb-8 text-3xl font-bold">검색</h1>

      <form
        action="/search"
        className="search-form mb-8 flex gap-2"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const next = input.trim();
          const params = new URLSearchParams();
          if (next) params.set("q", next);
          if (sfl) params.set("sfl", sfl);
          if (boTable) params.set("bo_table", boTable);
          const target = params.toString();
          runtimeRouterPush(router, target ? `/search?${target}` : "/search");
        }}
      >
        <label htmlFor="site-search-query" className="sr-only">
          검색어
        </label>
        <Input
          id="site-search-query"
          name="q"
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="검색어"
          className="h-11"
        />
        <Button type="submit" className="h-11 px-5">검색</Button>
      </form>

      {loading && (
        <div role="status" aria-label="검색 결과 로딩 중" className="space-y-4">
          <span className="sr-only">검색 결과 로딩 중</span>
          {[0, 1, 2].map((group) => (
            <section key={group} aria-hidden="true" className="space-y-4 rounded-lg border p-5">
              <div className="skeleton h-5 w-36 rounded" />
              {[0, 1, 2].map((item) => (
                <div key={item} className="space-y-2 border-t pt-3">
                  <div className="skeleton h-4 w-full max-w-xl rounded" />
                  <div className="skeleton h-3 w-4/5 max-w-lg rounded" />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {error && <ErrorState title="검색 결과를 불러오지 못했습니다" description={error} />}

      {!loading && !error && !query && (
        <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
          <h2 className="text-base font-semibold">무엇을 찾고 계신가요?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            게시글 제목, 작성자, 내용에 포함된 단어를 입력하면 커뮤니티 전체에서 찾아볼 수 있습니다.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a href={g5PathForRuntime("/boards")} className="rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              전체 게시판
            </a>
            <a href={g5PathForRuntime("/recent")} className="rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              최근 게시글
            </a>
            <a href={g5PathForRuntime("/faq")} className="rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              FAQ
            </a>
            <a href={g5PathForRuntime("/shop/search")} className="rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              상품 검색
            </a>
          </div>
        </section>
      )}

      {!loading && !error && query && results.length === 0 && (
        <EmptyState title="검색 결과가 없습니다" description={`"${query}"에 대한 결과가 없습니다.`} />
      )}

      {/* 한 게시판만 보고 있을 때는 전체로 돌아갈 길을 남긴다 — 주소를 손으로
          고치게 두면 그 화면은 막다른 길이 된다. */}
      {!error && boTable && query && (
        <div className="mb-4 flex items-center gap-3 text-sm">
          <a href={`/search?q=${encodeURIComponent(query)}`} className="font-medium text-primary hover:underline">
            ← 전체 검색 결과로
          </a>
          {page > 1 && <span className="text-muted-foreground">{page}쪽</span>}
        </div>
      )}

      {!error && results.length > 0 && (
        <div className="space-y-6">
          {results.map((group) => (
            <Card key={group.bo_table} className="search-group">
              <CardHeader className="search-group-head pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <a href={g5ShortHref(`/boards/${group.bo_table}`)} className="hover:text-primary">
                    {group.bo_subject}
                  </a>
                  <Badge variant="secondary">{group.count ?? group.list.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="search-list divide-y">
                  {group.list.map((item) => (
                    <li key={item.wr_id} className="search-item py-3">
                      <div className="flex items-start justify-between gap-4">
                        <a
                          href={boardPostHref(group.bo_table, item, bbsRewriteMode)}
                          className="min-w-0 flex-1 break-words text-sm font-medium hover:text-primary"
                        >
                          <Highlight text={item.wr_subject} query={query} />
                        </a>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.wr_datetime)}</span>
                      </div>
                      {item.wr_content_preview ? (
                        <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
                          <Highlight text={item.wr_content_preview} query={query} />
                        </p>
                      ) : null}
                      {item.ca_name ? (
                        <span className="mt-1.5 inline-block rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {item.ca_name}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {/* 이 게시판에 더 남았는데 화면에 길이 없으면 그 결과는 없는 것과 같다. */}
                {typeof group.count === "number" && group.count > group.list.length && !boTable && (
                  <a
                    href={`/search?q=${encodeURIComponent(query)}&bo_table=${encodeURIComponent(group.bo_table)}`}
                    className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    이 게시판에서 {(group.count - group.list.length).toLocaleString("ko-KR")}건 더 보기
                  </a>
                )}
              </CardContent>
            </Card>
          ))}

          {/* 게시판을 한정해 보는 중이면 쪽을 넘길 수 있게 한다. */}
          {boTable && results[0] && typeof results[0].count === "number" && (
            <div className="flex items-center justify-center gap-3 pt-2 text-sm">
              {page > 1 && (
                <a
                  href={`/search?q=${encodeURIComponent(query)}&bo_table=${encodeURIComponent(boTable)}${page > 2 ? `&page=${page - 1}` : ""}`}
                  className="font-medium text-primary hover:underline"
                >
                  이전
                </a>
              )}
              {page * results[0].list.length < results[0].count && results[0].list.length > 0 && (
                <a
                  href={`/search?q=${encodeURIComponent(query)}&bo_table=${encodeURIComponent(boTable)}&page=${page + 1}`}
                  className="font-medium text-primary hover:underline"
                >
                  다음
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
