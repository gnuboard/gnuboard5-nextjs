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

/**
 * 레퍼런스 홈의 부가 위젯 데이터. 테마 슬롯(G5ThemeCommunityHomeData)이 주지 않는
 * 것들만 여기서 직접 읽는다. 한 곳이 비어도 나머지는 그리도록 전부 개별로 감싼다.
 */
export async function loadSoluneHomeExtras(
  options: { runtime?: boolean } = {}
): Promise<SoluneHomeExtras> {
  // 브라우저에서는 공유되는 쪽을 쓴다 — 본문 묶음(lib/community-home.ts)도 같은 /settings 를
  // 부르므로, 공유하지 않으면 홈에서 두 번 나간다. 빌드 프리렌더는 요청마다 사람이 다를 수
  // 있어 나눠 쓰지 않는 쪽을 그대로 둔다(buildCommunityHomeData 와 같은 관례).
  const loadSettings = options.runtime === true ? getClientPublicSettings : getPublicSettings;
  const [comments, faqs, poll, gallery, popularKeywords, settings] = await Promise.all([
    getRecentItems({ view: "c", limit: COMMENT_LIMIT }).then((result) => result.items).catch(() => []),
    getFaqs({ perPage: FAQ_LIMIT })
      .then((result) => (result.ok ? result.data.items.slice(0, FAQ_LIMIT) : []))
      .catch(() => [] as FaqItem[]),
    getCurrentPoll()
      .then((result) => (result.ok ? result.data : null))
      .catch(() => null),
    loadGallery().catch(() => null),
    getPopularKeywords(POPULAR_LIMIT).catch(() => [] as PopularKeyword[]),
    loadSettings().catch(() => null),
  ]);

  return {
    comments,
    faqs,
    poll,
    gallery,
    popularKeywords,
    visit: settings?.visit ?? null,
  };
}
