"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronsUpDown, ListTree } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { g5ShortHref } from "@/lib/g5-short-url";
import type { DocsBook } from "./docs-nav";
import { canonicalDocPath, chapterForPath, chapterNumberLabel, type BookGroup } from "./book-nav";

/** 매뉴얼 첫 화면(그 게시판의 목록) 주소. */
export function bookIndexHref(book: DocsBook): string {
  return g5ShortHref(`/boards/${book.table}`);
}

/**
 * 사이드바 맨 위의 매뉴얼 선택기 — 지금 읽는 매뉴얼 이름 한 줄과, 누르면 펼쳐지는
 * 묶음별 매뉴얼 목록. 묶음은 관리자 메뉴설정의 상위 메뉴다(book-nav.ts bookGroupsFromMenu).
 * 바깥을 누르거나 Escape 로 닫고, Escape 는 서랍까지 닫지 않게 여기서 멈춘다.
 */
export function BookSelector({
  groups,
  current,
  onNavigate,
}: {
  groups: BookGroup[];
  current?: DocsBook;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    // Tab 으로 목록 밖("이 매뉴얼 목차" · 목차 링크 등)에 나가면 닫는다 — 열린 목록이 그 링크들을 덮은 채 남지 않게.
    const root = rootRef.current;
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && next !== buttonRef.current && !panelRef.current?.contains(next)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    root?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      root?.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  if (groups.length === 0) return null;

  const pick = () => {
    setOpen(false);
    onNavigate();
  };

  return (
    <div className="doc-booksel" ref={rootRef}>
      <p className="doc-nav-label">읽고 있는 매뉴얼</p>
      <button
        ref={buttonRef}
        type="button"
        className="doc-booksel-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <BookOpen size={17} aria-hidden className="doc-booksel-icon" />
        <span className="doc-booksel-text">
          <span className="doc-booksel-label" title={current?.label}>
            {current?.label ?? "매뉴얼 고르기"}
          </span>
          {current?.hint ? (
            <span className="doc-booksel-hint" title={current.hint}>
              {current.hint}
            </span>
          ) : null}
        </span>
        <ChevronsUpDown size={15} aria-hidden className="doc-booksel-caret" />
        <span className="sr-only">다른 매뉴얼 고르기</span>
      </button>

      {open ? (
        <div id={panelId} ref={panelRef} className="doc-booksel-panel">
          {groups.map((group, groupIndex) => (
            <div className="doc-booksel-group" key={`${group.label}:${groupIndex}`}>
              {group.label ? <p className="doc-booksel-grouplabel">{group.label}</p> : null}
              <ul>
                {group.books.map((book) => {
                  const isCurrent = book.table === current?.table;
                  return (
                    <li key={book.table}>
                      <Link
                        href={bookIndexHref(book)}
                        className={`doc-booksel-option${isCurrent ? " is-current" : ""}`}
                        aria-current={isCurrent ? "true" : undefined}
                        onClick={pick}
                      >
                        <span className="doc-booksel-option-text">
                          <span>{book.label}</span>
                          {book.hint ? <small>{book.hint}</small> : null}
                        </span>
                        <span className="doc-booksel-count">{book.count}장</span>
                        {isCurrent ? <Check size={15} aria-hidden className="doc-booksel-check" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {current ? (
        <Link href={bookIndexHref(current)} className="doc-booksel-index" onClick={onNavigate}>
          <ListTree size={15} aria-hidden />
          <span>이 매뉴얼 목차</span>
          <span className="doc-booksel-count">{current.count}장</span>
        </Link>
      ) : null}
    </div>
  );
}

/** 이만큼 이하인 매뉴얼은 모든 부를 펼친다 — 그보다 길면 지금 장이 든 부만(시안 docs/prototypes/handbook-menu). */
const SHORT_BOOK_CHAPTERS = 10;

/**
 * 지금 매뉴얼의 목차 — 부(게시판 분류)마다 장(글)을 번호와 함께 늘어놓는다. 번호는 매뉴얼
 * 전체에서 이어 센다(글 보기 머리의 "02 / 24장"과 같은 번호). 부는 접고 펼 수 있고, 처음
 * 펼침은 SHORT_BOOK_CHAPTERS 규칙을 따른다. path 가 빈 첫 렌더에서는 아무 장도 고르지 않는다
 * (정적 빌드 주소 꼴이 달라 생기는 하이드레이션 어긋남을 피한다).
 */
export function ChapterList({
  book,
  path,
  onNavigate,
}: {
  book: DocsBook;
  path: string;
  onNavigate: () => void;
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const baseId = useId();
  const target = path ? canonicalDocPath(path) : "";
  const offsets = book.groups.map((_, index) =>
    book.groups.slice(0, index).reduce((sum, group) => sum + group.items.length, 0)
  );
  const total = book.groups.reduce((sum, group) => sum + group.items.length, 0);
  const currentChapter = chapterForPath(book, path);
  const currentPart = currentChapter ? book.groups.findIndex((group) => group.items.includes(currentChapter)) : -1;
  // 긴 매뉴얼에서 지금 장이 없으면(목록 · 글쓰기 화면) 첫 부를 펼쳐 둔다 — 모두 접혀 있으면 목차가 비어 보였다.
  // 주소를 아직 모르는 첫 렌더는 모두 접어 둔다(첫 부를 폈다가 지금 부로 옮겨 가며 목차가 출렁이지 않게).
  const defaultPart = currentPart >= 0 ? currentPart : target ? 0 : -1;
  // 사람이 접고 편 것은 지금 장이 바뀌면 다시 규칙대로 돌아가게, 열쇠에 매뉴얼 · 지금 장을 넣는다.
  const keyOf = (label: string) => `${book.table}|${target}|${label}`;
  const isOpen = (label: string, index: number) =>
    toggled[keyOf(label)] ?? (total <= SHORT_BOOK_CHAPTERS || index === defaultPart);

  return (
    <div className="doc-chapters">
      {book.groups.map((group, groupIndex) => {
        const open = isOpen(group.label, groupIndex);
        const listId = `${baseId}-${groupIndex}`;
        return (
          <div className="doc-nav-section doc-part" key={`${group.label}:${groupIndex}`}>
            <button
              type="button"
              className="doc-nav-label doc-part-label doc-part-toggle"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              onClick={() => setToggled((previous) => ({ ...previous, [keyOf(group.label)]: !open }))}
            >
              <ChevronDown size={14} aria-hidden className="doc-part-caret" />
              <span className="doc-part-name">{group.label}</span>
              <span className="doc-part-count">{group.items.length}</span>
            </button>
            {open ? (
              <ul id={listId}>
                {group.items.map((chapter, itemIndex) => {
                  const active = chapter === currentChapter;
                  return (
                    <li key={chapter.id}>
                      <Link
                        href={chapter.href}
                        className={`doc-nav-link doc-chapter-link${active ? " is-active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                      >
                        <span className="doc-chapter-no" aria-hidden>
                          {chapterNumberLabel(offsets[groupIndex] + itemIndex + 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={chapter.label}>
                          {chapter.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
