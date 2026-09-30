import { getBoards } from "@/services/boards";
import { buildPageMetadata } from "@/lib/seo";
import { BoardListClient } from "../BoardListClient";

export const metadata = buildPageMetadata({
  title: "게시판 목록",
  description: "그누보드5 커뮤니티 게시판 목록",
  path: "/boards",
});

export default async function BoardListPage() {
  const boards = await getBoards();

  return <BoardListClient boards={boards} />;
}
