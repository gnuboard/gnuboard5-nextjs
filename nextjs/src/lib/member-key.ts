/**
 * 회원 공개 키로 만드는 주소 — /members/{키}, /recent?mb={키}. 주소에 회원 아이디를 남기지 않는다
 * (키는 API GET /members/{mb_id}/key 가 준다: services/member getMemberKey).
 */

/** 회원 공개 키 모양(7자-7자). 아이디에는 하이픈이 올 수 없어 예전 주소(/members/아이디)와 섞이지 않는다. */
export function isMemberKey(value: string): boolean {
  return /^[A-Za-z0-9]{7}-[A-Za-z0-9]{7}$/.test(value);
}

/**
 * 자기소개 · 전체게시물 주소. 키가 있으면 키로, 키를 만들 수 없는 설치본("")이면 예전처럼 아이디로.
 */
export function memberProfilePath(mbId: string, key: string): string {
  return `/members/${encodeURIComponent(key || mbId)}`;
}

export function memberRecentPath(mbId: string, key: string): string {
  return key ? `/recent?mb=${encodeURIComponent(key)}` : `/recent?mb_id=${encodeURIComponent(mbId)}`;
}
