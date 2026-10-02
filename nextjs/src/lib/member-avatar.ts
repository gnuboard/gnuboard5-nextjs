/** 회원 그림 두 가지 — 회원이미지(프로필 사진, data/member_image)와 회원아이콘(이름 옆 작은 그림, data/member). */
export interface MemberAvatarSource {
  mb_image_path?: string | null;
  mb_icon_path?: string | null;
}

/**
 * 아바타 원에 쓸 그림: 회원이미지(프로필 사진) → 회원아이콘 → 없음("" 이면 이니셜을 그린다).
 * 글보기 머리 · 목록 줄 · 갤러리 카드 · 회원 카드 · 헤더가 모두 이 순서를 따른다(로그인 카드와 같다).
 * 회원아이콘만 있는 회원도 빈 원 대신 제 그림이 보이도록 아이콘을 두 번째로 둔다.
 */
export function memberAvatarUrl(member?: MemberAvatarSource | null): string {
  return member?.mb_image_path || member?.mb_icon_path || "";
}

/** 그림이 없을 때 원 안에 넣는 첫 글자. 이름이 비면 "?". */
export function memberInitial(name?: string | null): string {
  const first = (name || "").trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}
