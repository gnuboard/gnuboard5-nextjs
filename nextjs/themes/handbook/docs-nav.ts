import { boardPostHref, boardPostPath } from "@/lib/board-url";
import type { Board, WritePost } from "@/lib/types";
import { getBoardPosts, getBoards } from "@/services/boards";
import { hintForTable, type HandbookThemeSettings } from "./theme-settings";

/* ------------------------------------------------------------------ *
 * 문서 설정 — 매뉴얼은 게시판 그룹 하나에 든 게시판들이다(게시판 하나 = 매뉴얼 한 권, 게시판 분류 = 부,
 * 글 = 장). 코드에 매뉴얼 목록을 두지 않는다 — 설치마다 게시판이 다르고, 관리자 화면에서 더하고 빼야 한다.
 * ------------------------------------------------------------------ */
/** 한 번에 읽는 글 수 — API 의 per_page 상한(100). 그보다 긴 매뉴얼은 쪽을 넘겨 끝까지 읽는다. */
export const DOCS_PAGE_SIZE = 100;
/** 한 매뉴얼에서 읽을 쪽 수 상한(쪽당 100장, 2000장까지) — 끝없이 돌지 않게 하는 안전장치. */
const DOCS_MAX_PAGES = 20;
/** 2쪽부터 한꺼번에 부르는 쪽 수 — 긴 매뉴얼 여러 권이 API 에 요청을 몰아 보내지 않게. */
const DOCS_PAGE_CONCURRENCY = 4;

/**
 * 1쪽부터 마지막 쪽(lastPage)까지 모은다. 예전에는 50장만 읽어 51장부터 목차 · 검색 · "N / M장"에서
 * 빠지고, 50장에서 "마지막 장입니다"가 떴다. fetchPage 가 던지면 그대로 던진다(부른 쪽이 실패를 처리).
 */
export async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; lastPage: number }>,
  maxPages: number = DOCS_MAX_PAGES
): Promise<T[]> {
  const first = await fetchPage(1);
  const lastPage = Math.min(Math.max(Math.floor(first.lastPage) || 1, 1), maxPages);
  const results = [first];
  for (let start = 2; start <= lastPage; start += DOCS_PAGE_CONCURRENCY) {
    const batch = Array.from({ length: Math.min(DOCS_PAGE_CONCURRENCY, lastPage - start + 1) }, (_, index) => start + index);
    results.push(...(await Promise.all(batch.map((page) => fetchPage(page)))));
  }
  return results.flatMap((result) => result.items);
}
/** 분류(ca_name)가 없는 글을 묶을 이름. */
const UNGROUPED_LABEL = "문서";

/**
 * 매뉴얼로 쓰는 게시판 그룹 ID(NEXT_PUBLIC_DOCS_GROUP). 그 그룹의 게시판이 곧 책이 되어, 관리자 화면에서
 * 게시판을 더하면 책도 늘어난다. 비어 있으면 매뉴얼을 띄우지 않는다(첫 화면은 "아직 문서가 없다"는 안내).
 */
export const DOCS_GROUP = (process.env.NEXT_PUBLIC_DOCS_GROUP || "").trim();

/**
 * 매뉴얼을 어디서 읽는지 — 게시판 그룹, 게시판별 안내 문구, 관리자 설정의 변경 번호(목차 캐시 열쇠에 넣는다).
 * 관리자 › 테마 화면 설정에서 고른 그룹이 먼저다. 그룹을 고르지 않았으면(저장한 적이 없거나 "정하지 않음") 빌드 때
 * 정한 NEXT_PUBLIC_DOCS_GROUP — PHP 는 빌드 값을 몰라 관리자 화면이 늘 "정하지 않음"으로 시작하므로, 사이드바 · 문구만
 * 고치려고 저장했다가 매뉴얼이 통째로 사라지지 않게 한다.
 */
export type DocsSource = { group: string; hints: Record<string, string>; revision: number };

export function docsSourceFrom(settings: HandbookThemeSettings | null): DocsSource {
  return settings
    ? { group: settings.docs.group || DOCS_GROUP, hints: settings.docs.hints, revision: settings.revision }
    : { group: DOCS_GROUP, hints: {}, revision: 0 };
}

/**
 * 장 하나 = 게시판 글 하나. id 는 글 번호(wr_id)라 글 보기 화면이 자기 장을 찾을 때 쓴다.
 * seoPath 는 제목 주소(/boards/표/제목/) — 글에 SEO 제목이 있을 때만. date 는 글 작성 시각(wr_datetime) —
 * 첫 화면의 "최근 추가한 장"이 쓴다(목록 API 는 수정 시각을 주지 않는다).
 */
export type DocsChapter = { id: number; label: string; href: string; seoPath?: string; date?: string };
export type DocsGroup = { label: string; items: DocsChapter[] };
/** categories 는 게시판 분류 설정(bo_category_list)의 순서 — 목차의 부 순서가 된다. */
export type DocsBookSource = { table: string; label: string; hint: string; categories?: string[] };
export type DocsBook = DocsBookSource & { groups: DocsGroup[]; count: number };

/** 게시판 분류 설정 "개요|1부 운영|API" → ["개요", "1부 운영", "API"]. */
export function parseCategoryList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split("|")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * 그룹의 게시판을 책 목록으로 바꾼다.
 *
 * 순서는 게시판 제목의 숫자 순서("1권 · 시작하기", "2권 · …", "부록 · …")를 따르고,
 * 제목이 "앞 · 뒤" 꼴이면 앞은 작은 안내(hint), 뒤는 책 이름이 된다. 관리자 › 테마 화면 설정에 그 게시판의 안내 문구를
 * 적었으면(hints) 그 문구가 안내이고 게시판 제목 전체가 책 이름이다.
 */
export function booksFromBoards(boards: Board[], hints: Record<string, string> = {}): DocsBookSource[] {
  // 관리자 게시판 목록의 "출력 순서"(bo_order)가 먼저다. 모두 0(기본값)이거나 같으면 제목의 숫자 순서.
  const order = (board: Board) => (Number.isFinite(Number(board.bo_order)) ? Number(board.bo_order) : 0);
  return [...boards]
    .sort((a, b) => order(a) - order(b) || a.bo_subject.localeCompare(b.bo_subject, "ko", { numeric: true }))
    .map((board) => {
      const subject = board.bo_subject.trim() || board.bo_table;
      const split = subject.match(/^(.+?)\s*·\s*(.+)$/);
      const categories = parseCategoryList(board.bo_category_list);
      const hint = hintForTable(hints, board.bo_table);
      if (hint) return { table: board.bo_table, label: subject, hint, categories };
      return split
        ? { table: board.bo_table, label: split[2], hint: split[1], categories }
        : { table: board.bo_table, label: subject, hint: "", categories };
    });
}

/** "전체 목차"가 가리킬 곳 — 첫 책의 목록. 책을 아직 못 읽었으면 첫 화면. */
export function docsIndexPath(books: DocsBookSource[]): string {
  const first = books[0]?.table ?? "";
  return first ? `/boards/${first}` : "/";
}

/**
 * 글 목록을 분류(ca_name)별로 묶는다.
 *
 * 글 순서는 API 기본 정렬(wr_num, wr_reply ASC)을 그대로 두므로 게시판에서 정한
 * 순서가 곧 목차 순서다. 분류(부)의 순서는 게시판 분류 설정(categories)을 따르고,
 * 설정에 없는 분류와 분류 없는 글은 그 뒤에 글에 처음 나타난 차례로 둔다.
 */
export function groupDocsChapters(
  posts: WritePost[],
  boTable: string,
  categories: string[] = []
): DocsGroup[] {
  const ordered: DocsGroup[] = [];
  const byLabel = new Map<string, DocsGroup>();
  // 쪽을 나눠 읽는 사이 글이 더해지거나 지워지면 같은 글이 두 쪽에 걸쳐 올 수 있다 — 한 번만 넣는다.
  const seen = new Set<number>();

  for (const post of [...posts].sort(byBoardOrder)) {
    const id = Number(post.wr_id);
    if (seen.has(id)) continue;
    seen.add(id);
    const label = (post.ca_name || "").trim() || UNGROUPED_LABEL;
    let group = byLabel.get(label);
    if (!group) {
      group = { label, items: [] };
      byLabel.set(label, group);
      ordered.push(group);
    }
    // 관리자가 짧은 주소를 "제목" 방식(cf_bbs_rewrite=2)으로 두면 글 주소가 /표/제목/ 이다.
    // 링크는 번호 주소로 두되, 지금 장을 찾을 때 제목 주소도 맞춰 보도록 함께 둔다.
    const seoPath = post.wr_seo_title ? boardPostPath(boTable, post, 2) : undefined;
    group.items.push({
      id,
      label: post.wr_subject || `#${post.wr_id}`,
      href: boardPostHref(boTable, post),
      ...(seoPath ? { seoPath } : {}),
      ...(post.wr_datetime ? { date: String(post.wr_datetime) } : {}),
    });
  }

  if (categories.length === 0) return ordered;
  const rank = (label: string) => {
    const index = categories.indexOf(label);
    return index < 0 ? categories.length : index;
  };
  // Array.prototype.sort 는 안정 정렬이라 같은 순위(설정에 없는 분류)끼리는 글에 나온 차례가 남는다.
  return [...ordered].sort((a, b) => rank(a.label) - rank(b.label));
}

/**
 * 게시판의 글 순서(wr_num, wr_reply 오름차순 — 목록 API 의 기본 정렬). API 는 공지를 첫 쪽 맨 앞에 따로 넣어 보내므로
 * 받은 차례대로 쌓으면 공지로 지정한 장이 부의 맨 앞으로 튀어나오고 장 번호가 밀린다 — 게시판 순서로 다시 놓는다.
 * 순서 값이 없으면(옛 응답 · 테스트) 받은 차례를 그대로 둔다(안정 정렬).
 */
function byBoardOrder(a: WritePost, b: WritePost): number {
  const num = Number(a.wr_num) - Number(b.wr_num);
  if (Number.isFinite(num) && num !== 0) return num;
  const replyA = String(a.wr_reply ?? "");
  const replyB = String(b.wr_reply ?? "");
  return replyA < replyB ? -1 : replyA > replyB ? 1 : 0;
}

/** 매뉴얼 한 권 — 글을 부별로 묶고, 장 수는 묶은 결과(겹친 글을 뺀 수)로 센다. */
export function docsBookFromPosts(source: DocsBookSource, posts: WritePost[]): DocsBook {
  const groups = groupDocsChapters(posts, source.table, source.categories);
  return { ...source, groups, count: groups.reduce((sum, group) => sum + group.items.length, 0) };
}

/** 매뉴얼 한 권의 글 전부(쪽을 넘겨 끝까지). 한 쪽이라도 못 읽으면 null — 서버 렌더는 멈추지 않는다. */
async function fetchDocsPosts(boTable: string): Promise<WritePost[] | null> {
  try {
    return await collectAllPages(async (page) => {
      const { list, totalPage, error } = await getBoardPosts({ boTable, perPage: DOCS_PAGE_SIZE, page, fields: "toc" });
      if (error) throw new Error(error);
      return { items: list, lastPage: totalPage };
    });
  } catch {
    return null;
  }
}

/** 서버에서 읽은 목차와, 빠짐없이 읽었는지. */
export type DocsLibrary = { books: DocsBook[]; complete: boolean };

/**
 * 서버에서 책마다 목차를 읽는다. 글이 없는 책은 목록에서 빠진다.
 *
 * complete 는 게시판 목록과 모든 매뉴얼을 읽었는지다. 게시판 목록은 실패하면 빈 목록이 오므로(그러면 분류 순서도
 * 잃는다) 비었으면 실패로 본다. complete 가 아니면 브라우저가 화면에 붙은 뒤 다시 읽는다 — 서버 실행은 완전한
 * 목차를 받았을 때만 브라우저에서 다시 읽지 않는다(use-docs-chapters.ts).
 */
export async function loadDocsLibrary(docs: DocsSource = docsSourceFrom(null)): Promise<DocsLibrary> {
  // 정적 빌드는 목차를 싣지 않는다 — 결과물은 설치마다 데이터가 다르고(빌드한 곳의 목차가 들어가면 안 된다) 화면은
  // 브라우저가 다시 읽는다. 읽어 봐야 버려질 요청이 페이지마다 여덟 번씩 빌드 중의 API 로 가던 것을 막는다.
  if (process.env.G5_NEXT_RUNTIME === "static") return { books: [], complete: false };
  // 매뉴얼 그룹을 정하지 않은 설치본은 읽을 책이 없다 — 다 읽은 것으로 둬 브라우저도 다시 읽지 않는다.
  if (!docs.group) return { books: [], complete: true };
  const boards = await getBoards({ group: docs.group });
  const sources = booksFromBoards(boards, docs.hints);
  const loaded = await Promise.all(
    sources.map(async (source) => ({ source, posts: await fetchDocsPosts(source.table) }))
  );

  return {
    books: loaded.map(({ source, posts }) => docsBookFromPosts(source, posts ?? [])).filter((book) => book.count > 0),
    complete: boards.length > 0 && loaded.every(({ posts }) => posts !== null),
  };
}
