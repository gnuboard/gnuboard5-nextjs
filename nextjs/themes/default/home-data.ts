import { GALLERY_BOARDS } from "@/lib/config";
import { getBoardPosts, getBoards } from "@/services/boards";
import { getFaqs } from "@/services/faqs";
import { getCurrentPoll } from "@/services/polls";
import { getRecentItems } from "@/services/recent";
import { getPopularKeywords } from "@/services/search";
import { getClientPublicSettings, getPublicSettings } from "@/services/settings";
import type { Board, FaqItem, Poll, RecentItem, WritePost } from "@/lib/types";
import type { PopularKeyword, VisitStats } from "@/lib/schemas";

export type SoluneGallery = {
  board: Board;
  posts: WritePost[];
};

export type SoluneHomeExtras = {
  comments: RecentItem[];
  faqs: FaqItem[];
  poll: Poll | null;
  gallery: SoluneGallery | null;
  popularKeywords: PopularKeyword[];
  visit: VisitStats | null;
};

const COMMENT_LIMIT = 6;
const FAQ_LIMIT = 4;
const GALLERY_LIMIT = 8;
const POPULAR_LIMIT = 5;

/** 갤러리 패널에 쓸 게시판. 설정된 갤러리 보드가 없으면 관례적인 'gallery'. */
function galleryCandidates(): string[] {
  const configured = GALLERY_BOARDS.filter(Boolean);
  return configured.length > 0 ? configured : ["gallery"];
}

async function loadGallery(): Promise<SoluneGallery | null> {
  const boards = await getBoards();
  const candidates = galleryCandidates();
  const board = boards.find((candidate) => candidates.includes(candidate.bo_table));
  if (!board) return null;

  const { list } = await getBoardPosts({ boTable: board.bo_table, perPage: GALLERY_LIMIT });
  const posts = list.filter((post) => Boolean(post.thumbnail || post.images?.[0]));
  if (posts.length === 0) return null;

  return { board, posts };
}

/** 위젯마다 따로 진행 중인 조회. 어느 것도 실패로 끝나지 않는다(빈 값으로 떨어진다). */
export type SoluneHomeExtraParts = { [K in keyof SoluneHomeExtras]: Promise<SoluneHomeExtras[K]> };

/**
 * 레퍼런스 홈의 부가 위젯 데이터를 위젯마다 따로 부른다. 테마 슬롯(G5ThemeCommunityHomeData)이
 * 주지 않는 것들만 여기서 직접 읽는다. 한 곳이 비어도 나머지는 그리도록 전부 개별로 감싼다.
 *
 * 브라우저는 이것을 받아 도착하는 대로 칸을 채운다 — 갤러리(첫 화면의 가장 큰 그림)가
 * 설문·인기검색어처럼 상관없는 응답을 기다리지 않게 하려는 것이다.
 */
export function loadSoluneHomeExtraParts(options: { runtime?: boolean } = {}): SoluneHomeExtraParts {
  // 브라우저에서는 공유되는 쪽을 쓴다 — 본문 묶음(lib/community-home.ts)도 같은 /settings 를
  // 부르므로, 공유하지 않으면 홈에서 두 번 나간다. 빌드 프리렌더는 요청마다 사람이 다를 수
  // 있어 나눠 쓰지 않는 쪽을 그대로 둔다(buildCommunityHomeData 와 같은 관례).
  const loadSettings = options.runtime === true ? getClientPublicSettings : getPublicSettings;

  return {
    // 원본 홈의 최신 댓글(latest)처럼 — 새글 표가 비어도 글 표에서 채운다.
    comments: getRecentItems({ view: "c", limit: COMMENT_LIMIT, fallback: "latest" })
      .then((result) => result.items)
      .catch(() => [] as RecentItem[]),
    faqs: getFaqs({ perPage: FAQ_LIMIT })
      .then((result) => (result.ok ? result.data.items.slice(0, FAQ_LIMIT) : []))
      .catch(() => [] as FaqItem[]),
    poll: getCurrentPoll()
      .then((result) => (result.ok ? result.data : null))
      .catch(() => null),
    gallery: loadGallery().catch(() => null),
    popularKeywords: getPopularKeywords(POPULAR_LIMIT).catch(() => [] as PopularKeyword[]),
    visit: loadSettings()
      .then((settings) => settings?.visit ?? null)
      .catch(() => null),
  };
}

/** 위젯 데이터를 한 번에. 빌드 프리렌더처럼 다 모인 뒤 한 번 그리면 되는 곳이 쓴다. */
export async function loadSoluneHomeExtras(
  options: { runtime?: boolean } = {}
): Promise<SoluneHomeExtras> {
  const parts = loadSoluneHomeExtraParts(options);
  const [comments, faqs, poll, gallery, popularKeywords, visit] = await Promise.all([
    parts.comments,
    parts.faqs,
    parts.poll,
    parts.gallery,
    parts.popularKeywords,
    parts.visit,
  ]);

  return { comments, faqs, poll, gallery, popularKeywords, visit };
}
