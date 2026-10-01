import type { Board } from "@/lib/types";

export type BoardWriteKind = "write" | "reply";

interface BoardPermissionUser {
  mb_level?: number | string;
  is_super_admin?: boolean;
}

/** 비회원의 레벨 — 그누보드와 같다. */
const GUEST_LEVEL = 1;

/**
 * 이 게시판에 글(또는 답글)을 쓸 수 있는지 — 그누보드 bbs/write.php 와 같은 기준.
 * 회원 레벨이 게시판의 글쓰기 · 답글 레벨 이상이면 된다. 비회원은 레벨 1, 최고관리자는 늘 된다.
 *
 * 화면에 "글쓰기" · "답글" 단추를 보일지와 글쓰기 화면을 열지만 정한다. 최종 판단은 서버가 한다.
 * 게시판 정보를 아직 못 읽었으면 false — 단추는 정보가 온 뒤에 나타난다.
 */
export function canWriteToBoard(
  board: Pick<Board, "bo_write_level" | "bo_reply_level"> | null | undefined,
  user: BoardPermissionUser | null | undefined,
  kind: BoardWriteKind = "write"
): boolean {
  if (!board) return false;
  if (user?.is_super_admin) return true;

  const required = Number(kind === "reply" ? board.bo_reply_level : board.bo_write_level) || GUEST_LEVEL;
  const level = user ? Number(user.mb_level) || GUEST_LEVEL : GUEST_LEVEL;
  return level >= required;
}
