"use client";

import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api-response";
import { apiUrl } from "@/lib/config";
import { storageGet, storageSet } from "@/lib/safe-storage";
import { boardListSchema, writePostListSchema } from "@/lib/schemas";
import type { WritePost } from "@/lib/types";
import {
  booksFromBoards,
  collectAllPages,
  DOCS_PAGE_SIZE,
  docsBookFromPosts,
  docsSourceFrom,
  type DocsBook,
  type DocsBookSource,
  type DocsSource,
} from "./docs-nav";
import { clientHandbookThemeSettings } from "./theme-settings";

const NO_STORE: RequestInit = { cache: "no-store", headers: { Accept: "application/json" } };

/**
 * 정적 빌드는 장을 넘길 때마다 화면을 새로 받으므로, 같은 탭에서 이 시간 안에 받은 목차는 다시 받지 않는다.
 * 관리자가 고친 글 목차는 새 탭이나 이 시간이 지난 뒤에 보인다(테마 화면 설정을 저장하면 변경 번호가 열쇠에 들어
 * 있어 바로 다시 받는다). 열쇠에 API 주소를 넣어 한 호스트의 여러 설치(하위 폴더)가 섞이지 않게 한다.
 * DocsBook 모양에 꼭 있어야 할 칸이 늘면 v1 을 올린다.
 */
export const BOOKS_CACHE_TTL_MS = 5 * 60 * 1000;
export const booksCacheKey = (source: DocsSource) =>
  `handbook-docs-books:v1:${apiUrl("/boards")}:${source.group}:${source.revision}`;

function isDocsChapterList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((chapter) => typeof chapter?.id === "number" && typeof chapter?.label === "string" && typeof chapter?.href === "string")
  );
}

function isDocsBookList(value: unknown): value is DocsBook[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (book) =>
        typeof book?.table === "string" &&
        typeof book?.label === "string" &&
        typeof book?.count === "number" &&
        Array.isArray(book?.groups) &&
        book.groups.every((group: unknown) => typeof (group as { label?: unknown })?.label === "string" && isDocsChapterList((group as { items?: unknown })?.items))
    )
  );
}

/**
 * 저장해 둔 목차 문자열을 푼다. 없거나 깨졌거나 모양이 다르면 null — 그대로 쓰면 셸이 그리다 멈춘다.
 * fresh 는 BOOKS_CACHE_TTL_MS 안에 저장한 것인지.
 */
export function parseCachedBooks(raw: string | null, now: number): { books: DocsBook[]; fresh: boolean } | null {
  try {
    const saved = JSON.parse(raw ?? "null") as { savedAt?: unknown; books?: unknown } | null;
    if (!saved || typeof saved.savedAt !== "number" || !isDocsBookList(saved.books)) return null;
    return { books: saved.books, fresh: now - saved.savedAt >= 0 && now - saved.savedAt < BOOKS_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

function readCachedBooks(source: DocsSource): { books: DocsBook[]; fresh: boolean } | null {
  return parseCachedBooks(storageGet(booksCacheKey(source), "session"), Date.now());
}

function writeCachedBooks(source: DocsSource, books: DocsBook[]): void {
  storageSet(booksCacheKey(source), JSON.stringify({ savedAt: Date.now(), books }), "session");
}

/**
 * 책 목록 — 매뉴얼 그룹의 게시판을 새로 읽는다(관리자가 더한 책도 바로 보이게). 그룹을 정하지 않았으면 책이 없다.
 * 게시판 목록을 못 읽으면 null — 부른 쪽이 이미 가진 목록 · 분류 순서를 그대로 쓴다(분류 순서를 잃으면 부 순서와
 * 장 번호가 바뀐다).
 */
async function fetchBookSources(source: DocsSource, signal: AbortSignal): Promise<DocsBookSource[] | null> {
  if (!source.group) return [];
  const response = await fetch(`${apiUrl("/boards")}?group=${encodeURIComponent(source.group)}`, { ...NO_STORE, signal });
  const parsed = await readApiResponse(response, boardListSchema);
  if (!response.ok || !parsed.success || parsed.data === undefined) return null;
  return booksFromBoards(parsed.data, source.hints);
}

/** 매뉴얼 한 권의 글 전부(쪽을 넘겨 끝까지). 한 쪽이라도 못 읽으면 던진다. 목차에 쓸 칸만(?fields=toc). */
async function fetchAllPosts(table: string, signal: AbortSignal): Promise<WritePost[]> {
  return collectAllPages(async (page) => {
    const response = await fetch(`${apiUrl(`/boards/${table}/posts`)}?per_page=${DOCS_PAGE_SIZE}&page=${page}&fields=toc`, {
      ...NO_STORE,
      signal,
    });
    const parsed = await readApiResponse(response, writePostListSchema);
    if (!response.ok || !parsed.success || parsed.data === undefined) {
      throw new Error(`posts ${table} page ${page}: ${response.status}`);
    }
    return { items: parsed.data, lastPage: parsed.meta?.last_page ?? 1 };
  });
}

/** 목차와, 더 받을 것이 없는지(settled) — 정적 빌드의 첫 화면이 목차가 오기 전에 "문서가 없습니다"를 띄우지 않게. */
export type DocsBooksState = { books: DocsBook[]; settled: boolean };

/**
 * 서버가 넘긴 목차를 쓰고, 필요할 때만 브라우저에서 한 번 더 최신으로 맞춘다
 * (useRuntimeMenus 와 같은 방식 — 빌드 시점 데이터가 오래됐을 수 있으므로).
 * - 서버 실행(next start · 개발 서버)은 서버가 빠짐없이 읽은 목차(initialComplete, 30초 캐시)를 넘겼으면 다시 받지
 *   않는다. 서버가 일부를 못 읽었으면(요청 한도 · 서버 오류) 다시 받아 채운다.
 * - 정적 빌드는 이 탭에 저장해 둔 목차가 있으면 먼저 쓰고, BOOKS_CACHE_TTL_MS 안에 받은 것이면 다시 받지 않는다.
 * 일부 요청이 실패하면 그 매뉴얼은 이미 가진 목차를 그대로 둔다 — 실패한 매뉴얼을 목록에서 빼면 읽던 매뉴얼이
 * 사라져 사이드바가 매뉴얼 목록으로 바뀌고 앞뒤 장이 없어졌다. 그렇게 메운 목차는 저장하지 않는다(다음 화면에서 다시 시도).
 */
export function useDocsBooks(
  initialBooks: DocsBook[] = [],
  initialComplete = false,
  serverSource: DocsSource = docsSourceFrom(null),
  /** 최고관리자가 화면 편집 창에서 방금 저장한 설정 — 바뀌면(변경 번호) 목차를 그 설정으로 다시 받는다. */
  liveSource: DocsSource | null = null
): DocsBooksState {
  // 서버가 빠짐없이 읽었으면 책이 없어도(매뉴얼 그룹이 없거나 글이 없음) 다시 받지 않는다 — 받는 동안 "다 받기 전"으로
  // 남아 게시판 화면의 사이드바가 그려졌다 사라지지 않게(theme-settings.ts sidebarState).
  const skipRefresh = process.env.G5_NEXT_RUNTIME !== "static" && initialComplete;
  const [books, setBooks] = useState<DocsBook[]>(initialBooks);
  const [settled, setSettled] = useState(skipRefresh);
  const booksRef = useRef(books);
  const skipRef = useRef(skipRefresh);
  const serverSourceRef = useRef(serverSource);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const liveKey = liveSource ? `${liveSource.group}:${liveSource.revision}` : "";

  useEffect(() => {
    if (skipRef.current && !liveSource) return;

    const controller = new AbortController();
    let alive = true;

    // 정적 빌드는 브리지가 요청 때 실은 관리자 설정을, 서버 실행은 서버가 읽어 넘긴 것을 쓴다. 효과는 브라우저에서만
    // 돌므로 런타임 설정을 바로 읽어도 하이드레이션과 어긋나지 않는다. 화면 편집 창에서 저장했으면 그 설정이 먼저다
    // (변경 번호가 캐시 열쇠에 들어 저장 전 목차를 쓰지 않는다).
    const docs =
      liveSource ??
      (process.env.G5_NEXT_RUNTIME === "static" ? docsSourceFrom(clientHandbookThemeSettings()) : serverSourceRef.current);

    async function refreshBooks() {
      const cached = readCachedBooks(docs);
      if (cached) {
        booksRef.current = cached.books;
        setBooks(cached.books);
        if (cached.fresh) {
          setSettled(true);
          return;
        }
      }
      try {
        const known = new Map(booksRef.current.map((book) => [book.table, book]));
        const fetched = await fetchBookSources(docs, controller.signal);
        // 게시판 목록을 못 읽으면 이미 가진 책(분류 순서 포함)을 쓴다.
        let degraded = fetched === null;
        const sources: DocsBookSource[] = fetched ?? [...known.values()];

        const loaded = await Promise.all(
          sources.map(async (source): Promise<DocsBook | null> => {
            try {
              return docsBookFromPosts(source, await fetchAllPosts(source.table, controller.signal));
            } catch (error) {
              if (error instanceof DOMException && error.name === "AbortError") throw error;
              degraded = true;
              return known.get(source.table) ?? null;
            }
          })
        );

        const next = loaded.filter((book): book is DocsBook => book !== null && book.count > 0);
        if (!alive) return;
        // 빠짐없이 받았으면 빈 목록도 그대로 쓴다 — 화면 편집 창에서 매뉴얼 그룹을 비우거나 빈 그룹으로 바꾼 직후 예전 목차가
        // 남지 않게. 일부를 못 받았을 때(degraded)만 이미 가진 목차를 둔다.
        if (next.length > 0 || !degraded) setBooks(next);
        if (next.length > 0 && !degraded) writeCachedBooks(docs, next);
        setSettled(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.warn("[useDocsBooks] Failed to refresh the documentation index.", error);
        if (alive) setSettled(true);
      }
    }

    refreshBooks();

    return () => {
      alive = false;
      controller.abort();
    };
    // 처음 한 번, 그리고 화면 편집 창에서 저장할 때마다(liveKey) — liveSource 객체가 아니라 그룹 · 변경 번호로 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  return { books, settled };
}
