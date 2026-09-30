import { boardPostHref } from "@/lib/board-url";
import type { G5ThemeCommunityHomeData, G5ThemeHomePost as HomePost } from "@/lib/theme-types";
import type { WritePost } from "@/lib/types";
import { getBoards, getBoardPosts } from "@/services/boards";
import { getClientPublicSettings, getPublicSettings } from "@/services/settings";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const HOME_BOARD_FETCH_LIMIT = positiveInt(
  process.env.G5_HOME_BOARD_FETCH_LIMIT || process.env.NEXT_PUBLIC_HOME_BOARD_FETCH_LIMIT,
  12
);
const HOME_DISPLAY_BOARD_LIMIT = 4;
const HOME_POSTS_PER_BOARD = 10;
const POPULAR_LIMIT = 7;
const LATEST_LIMIT = 10;

export function postScore(post: HomePost) {
  return Number(post.wr_hit) + Number(post.wr_comment) * 12 + Number(post.wr_good) * 20;
}

export function postTime(post: HomePost) {
  const time = new Date(String(post.wr_datetime).replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function isPublicHomePost(post: WritePost) {
  return !post.is_secret && !String(post.wr_option || "").split(",").includes("secret");
}

/**
 * 홈이 쓰는 게시판별 글·최신글·인기글 묶음.
 *
 * 서버(빌드·프리렌더)와 브라우저 양쪽에서 부른다. 휴대용 정적 빌드는 어느 사이트의
 * 글도 굽지 않으므로, 테마 홈은 이 함수를 브라우저에서 한 번 더 불러 실제 내용을
 * 채운다. `runtime` 이면 캐시를 쓰지 않고 브라우저용 설정 조회를 쓴다.
 */
export async function buildCommunityHomeData(
  options: { runtime?: boolean } = {}
): Promise<G5ThemeCommunityHomeData> {
  const runtime = options.runtime === true;
  const revalidate = runtime ? 0 : 30;
  const [boards, settings] = await Promise.all([
    getBoards(revalidate),
    runtime ? getClientPublicSettings() : getPublicSettings(),
  ]);
  const bbsRewriteMode = settings.cf_bbs_rewrite ?? 0;
  const displayBoards = boards.slice(0, HOME_DISPLAY_BOARD_LIMIT);
  const boardsForPostFetch = boards.slice(0, HOME_BOARD_FETCH_LIMIT);
  const allBoardPosts = await Promise.all(
    boardsForPostFetch.map(async (board) => ({
      board,
      posts: (
        await getBoardPosts({ boTable: board.bo_table, perPage: HOME_POSTS_PER_BOARD, revalidate })
      ).list.filter(isPublicHomePost),
    }))
  );
  const boardPosts = allBoardPosts.filter(({ board }) =>
    displayBoards.some((displayBoard) => displayBoard.bo_table === board.bo_table)
  );
  const allPosts: HomePost[] = allBoardPosts.flatMap(({ board, posts }) =>
    posts.map((post) => ({
      ...post,
      bo_table: board.bo_table,
      bo_subject: board.bo_subject,
      boardHref: `/${board.bo_table}`,
      boardSubject: board.bo_subject,
      href: boardPostHref(board.bo_table, post, bbsRewriteMode),
    }))
  );
  const popularPosts = [...allPosts].sort((a, b) => postScore(b) - postScore(a)).slice(0, POPULAR_LIMIT);
  const latestPosts = [...allPosts].sort((a, b) => postTime(b) - postTime(a)).slice(0, LATEST_LIMIT);

  return { boardPosts, latestPosts, popularPosts, bbsRewriteMode };
}
