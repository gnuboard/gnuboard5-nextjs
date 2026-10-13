"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { g5PathForRuntime } from "@/lib/config";
import type { DocsBook } from "./docs-nav";
import { chapterNumberLabel, searchChapters } from "./book-nav";

/** 검색어가 있을 때 보여 줄 결과 수. 넘치면 넘친다고 알린다. */
const SEARCH_LIMIT = 50;

/**
 * Ctrl+K(맥은 ⌘K)만 받는다. Shift · Alt 가 함께면(한글 윈도의 AltGr = Ctrl+Alt 포함) 아니다. 다른 곳이 이미
 * 처리한 키, 편집기 안(글쓰기 편집기는 Ctrl+K 가 "링크 넣기"), 다른 창이 열려 있을 때는 그쪽 것을 뺏지 않는다.
 * 휴대폰 서랍이 열려 있을 때도 열지 않는다 — 서랍이 열린 동안 상단 바(이 검색 창이 든 곳)는 inert 라 창이 떠도 쓸 수 없다.
 */
function isSearchShortcut(event: KeyboardEvent, ownDialog: HTMLDialogElement | null): boolean {
  if (event.defaultPrevented || event.shiftKey || event.altKey) return false;
  // 키 이름(event.key)에 더해 키 자리(event.code)도 본다 — 한글 입력 상태 등에서 key 가 "k" 로 오지 않아도 받게.
  const isK = event.key.toLowerCase() === "k" || event.code === "KeyK";
  if (!(event.ctrlKey || event.metaKey) || !isK) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[contenteditable=""], [contenteditable="true"], .ProseMirror')) return false;
  if (document.querySelector("#doc-drawer-toggle:checked")) return false;
  return !Array.from(document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')).some(
    (element) => element !== ownDialog && !ownDialog?.contains(element)
  );
}

/** 검색 창을 열고 검색칸에 초점을 둔다(이미 열려 있으면 그대로). */
function showSearchDialog(dialog: HTMLDialogElement | null, input: HTMLInputElement | null): void {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  input?.focus();
  input?.select();
}

/**
 * 상단 바의 문서 검색 — 검색칸 모양의 단추(좁은 화면에서는 아이콘)와 Ctrl+K(맥은 ⌘K)로 여는
 * 검색 창. 장 제목 · 부 · 매뉴얼 이름에서 바로 찾고, 본문까지 찾을 때는 통합 검색(/search)으로
 * 넘긴다. 창은 <dialog> 라 Escape · 바깥 누름으로 닫히고 열린 동안 뒤 화면은 조작되지 않는다.
 */
export function DocsSearch({ books, current }: { books: DocsBook[]; current?: DocsBook }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // 바깥(창 뒤 배경)에서 누르기 시작했는지 — 창 안에서 글자를 끌어 고르다 바깥에서 손을 떼도 닫히지 않게.
  const pressedOnBackdrop = useRef(false);
  const [query, setQuery] = useState("");
  // 결과 링크는 창이 열려 있을 때만 만든다 — 닫힌 채로 셸이 다시 그려질 때마다 수십 개를 만들지 않게.
  const [open, setOpen] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  const titleId = useId();
  const listId = useId();

  const openDialog = () => {
    showSearchDialog(dialogRef.current, inputRef.current);
    setOpen(true);
  };
  const closeDialog = () => dialogRef.current?.close();

  useEffect(() => {
    // 맥에서는 ⌘K 로 안내한다. 첫 렌더는 서버와 같게 "Ctrl K" 로 두고 화면에 붙은 뒤 바꾼다.
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setShortcutLabel("⌘ K");

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event, dialogRef.current)) return;
      event.preventDefault();
      showSearchDialog(dialogRef.current, inputRef.current);
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** 위 · 아래 화살표로 검색칸과 결과 사이를 오간다. */
  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const stops = [
      inputRef.current,
      ...Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []),
    ].filter((element): element is HTMLInputElement | HTMLAnchorElement => element !== null);
    const index = stops.findIndex((element) => element === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? Math.min(index + 1, stops.length - 1) : Math.max(index - 1, 0);
    stops[next].focus();
  };

  const hasQuery = query.trim() !== "";
  // 빈 검색어: 매뉴얼 화면이면 그 매뉴얼의 목차, 아니면(첫 화면 · 커뮤니티 …) 특정 매뉴얼을 고르지 않고 안내만.
  // 검색어가 있으면 SEARCH_LIMIT 까지(하나 더 받아 넘치는지 안다), 빈 검색어의 매뉴얼 목차는 자르지 않는다.
  const results =
    open && (hasQuery || current)
      ? searchChapters(books, query, current, hasQuery ? SEARCH_LIMIT + 1 : Number.POSITIVE_INFINITY)
      : [];
  const truncated = hasQuery && results.length > SEARCH_LIMIT;
  const hits = truncated ? results.slice(0, SEARCH_LIMIT) : results;
  const fullSearchHref = g5PathForRuntime(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");

  return (
    <>
      <button type="button" className="doc-search" onClick={openDialog} aria-haspopup="dialog">
        <Search size={15} aria-hidden />
        <span className="doc-search-placeholder">문서 검색…</span>
        <span className="doc-kbd" aria-hidden>
          {shortcutLabel}
        </span>
      </button>
      <button
        type="button"
        className="doc-icon-btn doc-search-icon"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label="문서 검색"
      >
        <Search size={16} aria-hidden />
      </button>

      <dialog
        ref={dialogRef}
        className="doc-search-dialog"
        aria-labelledby={titleId}
        onPointerDown={(event) => {
          pressedOnBackdrop.current = event.target === dialogRef.current;
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current && pressedOnBackdrop.current) closeDialog();
          pressedOnBackdrop.current = false;
        }}
        onClose={() => {
          setQuery("");
          setOpen(false);
        }}
      >
        <div className="doc-search-panel" onKeyDown={moveFocus}>
          <h2 id={titleId} className="sr-only">
            문서 검색
          </h2>
          <form
            className="doc-search-field"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              listRef.current?.querySelector<HTMLAnchorElement>("a")?.click();
            }}
          >
            <Search size={17} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="장 제목 · 매뉴얼 · 분류로 찾기"
              aria-label="문서 검색"
              aria-controls={hits.length > 0 ? listId : undefined}
              autoComplete="off"
            />
            <button type="button" className="doc-kbd doc-search-esc" onClick={closeDialog}>
              Esc
            </button>
          </form>

          <p className="doc-search-summary" aria-live="polite">
            {truncated
              ? `${SEARCH_LIMIT}개가 넘습니다 — 앞의 ${SEARCH_LIMIT}개만 보입니다. 낱말을 더 넣어 좁혀 보세요`
              : hasQuery
              ? `${hits.length}개 장을 찾았습니다`
              : current
                ? `${current.label} 목차`
                : "모든 매뉴얼의 장 제목 · 매뉴얼 이름 · 분류에서 찾습니다"}
          </p>
          {hits.length > 0 ? (
            <ul ref={listRef} id={listId} className="doc-search-results">
              {hits.map((hit) => (
                <li key={`${hit.book.table}:${hit.chapter.id}`}>
                  <Link href={hit.chapter.href} className="doc-search-hit" onClick={closeDialog}>
                    <span className="doc-search-hit-title">{hit.chapter.label}</span>
                    <span className="doc-search-hit-meta">
                      {hit.book.label} · {hit.part} · {chapterNumberLabel(hit.number)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : hasQuery ? (
            <p className="doc-search-empty">제목이 맞는 장이 없습니다. 본문까지 찾아보세요.</p>
          ) : null}

          <div className="doc-search-foot">
            <span>장 제목 · 매뉴얼 · 분류에서 찾습니다.</span>
            <a href={fullSearchHref} className="doc-search-full">
              본문까지 통합 검색
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
