import { stripG5BasePath } from "@/lib/config";
import type { DocsBook, DocsChapter } from "./docs-nav";
import type { SiteMenuItem } from "./main-nav";

/** 매뉴얼 선택기의 묶음 하나 — 관리자 메뉴설정의 상위 메뉴 하나. */
export type BookGroup = { label: string; books: DocsBook[] };

/** 지금 장이 매뉴얼 안 어디쯤인지. number 는 매뉴얼 전체에서 1부터 센 장 번호. */
export type ChapterPosition = {
  book: DocsBook;
  part: string;
  chapter: DocsChapter;
  number: number;
  total: number;
  prev?: DocsChapter;
  next?: DocsChapter;
};

/** 장 번호 표기 — 1 → "01". 장이 100개를 넘으면 그대로 세 자리. */
export function chapterNumberLabel(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 문서 주소를 한 꼴로 맞춘다 — 설치 폴더 · 쿼리 · 끝 슬래시를 떼고, 게시판 경로
 * /boards/<표>/… 를 짧은 주소 /<표>/… 로. 정적 빌드는 같은 장을 두 꼴로 부르므로
 * (빌드 때 /boards/dev_manual/23, 사람이 보는 /dev_manual/23) 비교 전에 꼭 거친다.
 * 다른 사이트의 전체 주소는 그대로 두어 어떤 매뉴얼과도 맞지 않게 한다.
 */
export function canonicalDocPath(value: string): string {
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  const path = value.split(/[?#]/, 1)[0] || "/";
  const stripped = stripG5BasePath(path).replace(/\/+$/, "") || "/";
  // 제목 주소(/표/한글-제목)는 브라우저 주소에 %EA… 로 나타난다 — 조각마다 풀어 같은 꼴로 비교한다.
  return stripped
    .replace(/^\/boards\//, "/")
    .split("/")
    .map(safeDecodeSegment)
    .join("/");
}

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * 매뉴얼 선택기의 묶음. 관리자 메뉴설정(g5_menu)의 상위 메뉴를 그대로 묶음으로 쓴다 —
 * 메뉴를 테마에 따로 두지 않는다(AGENTS.override.md 메뉴 동기화 규칙). 상위 메뉴의 하위
 * 메뉴(하위가 없으면 상위 메뉴 자신)가 매뉴얼 게시판을 가리키면 그 매뉴얼이 그 묶음에 든다.
 * 메뉴에 없는 매뉴얼은 "다른 매뉴얼"로 끝에 두고, 메뉴와 하나도 안 맞으면 이름 없는 한 묶음이다.
 */
export function bookGroupsFromMenu(books: DocsBook[], menuItems: SiteMenuItem[]): BookGroup[] {
  const byPath = new Map(books.map((book) => [`/${book.table}`, book]));
  const placed = new Set<string>();
  const groups: BookGroup[] = [];

  for (const top of menuItems) {
    const links = top.children.length > 0 ? top.children : [top];
    const found = links
      .map((link) => byPath.get(canonicalDocPath(link.href)))
      .filter((book): book is DocsBook => book !== undefined && !placed.has(book.table))
      .filter((book, index, list) => list.findIndex((other) => other.table === book.table) === index);
    found.forEach((book) => placed.add(book.table));
    if (found.length > 0) groups.push({ label: top.label, books: found });
  }

  if (groups.length === 0) return books.length > 0 ? [{ label: "", books }] : [];
  const rest = books.filter((book) => !placed.has(book.table));
  return rest.length > 0 ? [...groups, { label: "다른 매뉴얼", books: rest }] : groups;
}

/**
 * 주소가 가리키는 매뉴얼 — 그 게시판의 목록(/manual2)이나 글(/manual2/3)일 때만. 매뉴얼이 아닌
 * 화면(첫 화면 · 커뮤니티 · 검색 …)에서는 없음이다. 첫 매뉴얼로 대신하지 않는다 — 대신하면 자유게시판에서도
 * "읽고 있는 매뉴얼: 처음 따라하기"와 그 목차가 떴다. 경로 조각 단위로 비교해 /manual 이 /manual2 를 잡지 않는다.
 */
export function bookForPath(books: DocsBook[], path: string): DocsBook | undefined {
  const target = canonicalDocPath(path);
  return books.find((book) => target === `/${book.table}` || target.startsWith(`/${book.table}/`));
}

/** 메뉴 링크가 지금 주소를 가리키는지 — 같은 주소이거나, 게시판 링크(/free) 아래의 글(/free/12)일 때. */
export function isMenuPathActive(href: string, path: string): boolean {
  if (!path) return false;
  const link = canonicalDocPath(href);
  const target = canonicalDocPath(path);
  if (!link.startsWith("/")) return false;
  if (link === "/") return target === "/";
  return target === link || target.startsWith(`${link}/`);
}

/**
 * 지금 주소가 속한 관리자 메뉴 묶음(상위 메뉴 하나). 사이드바가 커뮤니티 · 고객센터 같은 화면에서 그 묶음의
 * 메뉴를 보일 때 쓴다 — 묶음 이름을 코드에 두지 않고 관리자 메뉴설정을 그대로 따른다. 하위 메뉴가 먼저 맞는
 * 묶음을 고르고, 없으면 상위 메뉴 링크로 맞춘다. 첫 화면(/)은 어느 묶음에도 넣지 않는다.
 */
export function menuGroupForPath(menuItems: SiteMenuItem[], path: string): SiteMenuItem | undefined {
  if (!path || canonicalDocPath(path) === "/") return undefined;
  return (
    menuItems.find((top) => top.children.some((child) => isMenuPathActive(child.href, path))) ??
    menuItems.find((top) => isMenuPathActive(top.href, path))
  );
}

/** 부 경계를 지운 장 목록(앞뒤 장 이동 · 장 번호의 기준). */
export function flattenChapters(book: DocsBook): Array<{ part: string; chapter: DocsChapter }> {
  return book.groups.flatMap((group) => group.items.map((chapter) => ({ part: group.label, chapter })));
}

function positionAt(book: DocsBook, match: (chapter: DocsChapter) => boolean): ChapterPosition | null {
  const list = flattenChapters(book);
  const index = list.findIndex((entry) => match(entry.chapter));
  if (index < 0) return null;
  return {
    book,
    part: list[index].part,
    chapter: list[index].chapter,
    number: index + 1,
    total: list.length,
    prev: list[index - 1]?.chapter,
    next: list[index + 1]?.chapter,
  };
}

/**
 * 주소가 가리키는 장 — 번호 주소(/표/3)가 먼저, 맞는 것이 없을 때만 SEO 제목 주소(/표/제목)를 본다.
 * 제목 주소가 다른 장의 번호와 같아도("5") 두 장이 함께 골라지지 않는다. 주소가 비었으면(첫 렌더) 없음.
 */
export function chapterForPath(book: DocsBook, path: string): DocsChapter | undefined {
  if (!path) return undefined;
  const target = canonicalDocPath(path);
  const chapters = flattenChapters(book).map((entry) => entry.chapter);
  return (
    chapters.find((chapter) => canonicalDocPath(chapter.href) === target) ??
    chapters.find((chapter) => chapter.seoPath !== undefined && canonicalDocPath(chapter.seoPath) === target)
  );
}

/** 주소로 지금 장을 찾는다(사이드바 · 앞뒤 장). 주소가 비었으면(첫 렌더) 없음. */
export function chapterPositionByPath(book: DocsBook, path: string): ChapterPosition | null {
  const current = chapterForPath(book, path);
  return current ? positionAt(book, (chapter) => chapter === current) : null;
}

/** 검색 결과 한 줄 — 어느 매뉴얼 · 부의 몇 번째 장인지. */
export type ChapterHit = { book: DocsBook; part: string; chapter: DocsChapter; number: number };

/**
 * Ctrl+K 검색. 장 제목 · 부 이름 · 매뉴얼 이름에서 찾는다(본문은 통합 검색이 맡는다).
 * 띄어 쓴 낱말은 모두 들어 있어야 하고, 제목에서 찾은 장을 앞에 둔다. 같은 무리 안에서는
 * 지금 매뉴얼의 장이 먼저다 — 여러 매뉴얼에 같은 제목("마무리 체크리스트")이 있으면 읽던
 * 매뉴얼의 것을 고를 가능성이 크다. 검색어가 없으면 지금 매뉴얼(없으면 첫 매뉴얼)의 목차.
 */
export function searchChapters(
  books: DocsBook[],
  query: string,
  current?: DocsBook,
  limit = 40
): ChapterHit[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const pool = terms.length > 0 ? books : current ? [current] : books.slice(0, 1);
  const hits = pool.flatMap((book) =>
    flattenChapters(book).map((entry, index) => ({ book, part: entry.part, chapter: entry.chapter, number: index + 1 }))
  );
  if (terms.length === 0) return hits.slice(0, limit);

  const matches = (text: string) => terms.every((term) => text.toLocaleLowerCase().includes(term));
  const rank = (hit: ChapterHit) =>
    (matches(hit.chapter.label) ? 0 : 2) + (current && hit.book.table === current.table ? 0 : 1);
  // sort 는 안정 정렬이라 같은 순위끼리는 매뉴얼 · 목차 순서가 남는다.
  return hits
    .filter((hit) => matches(`${hit.chapter.label} ${hit.part} ${hit.book.label}`))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

/** 글 번호로 지금 장을 찾는다(글 보기 머리 — 글이 자기 wr_id 를 안다). */
export function chapterPositionById(book: DocsBook, wrId: number): ChapterPosition | null {
  if (!Number.isFinite(wrId)) return null;
  return positionAt(book, (chapter) => chapter.id === wrId);
}
